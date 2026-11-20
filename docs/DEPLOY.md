# Deploying the Xerxes backend

The backend is one container: the Hono API, the MCP tool server that Codex calls, and the Codex CLI itself.
Everything stateful lives under `/data`:

- `/data/xerxes.json`: profile, people, watches, notifications and conversation-to-Codex-thread map
- `/data/codex`: `CODEX_HOME`, which holds the Codex login and session history
- `/data/codex-work`: the empty working directory Codex runs in

Mount `/data` on a volume. Without it, every redeploy logs Codex out.

## Option A: Docker Compose (local or any VM)

```bash
node scripts/sync-secrets.mjs                 # writes backend/.env from env.download + api-key.txt
docker compose up -d --build backend
docker compose exec backend codex login --device-auth   # open the URL, enter the code (one time; persists in the volume)
curl localhost:8787/api/status                # -> "codexLoggedIn": true
```

Voice needs a public HTTPS URL so Agora's cloud can call `/v1/sessions/:id/chat/completions`:

```bash
docker compose --profile tunnel up -d tunnel
docker compose logs tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
node scripts/set-env.mjs PUBLIC_URL=https://<that-host>.trycloudflare.com
docker compose up -d backend                  # recreate so the new env is picked up
```

## Option B: Railway

`backend/railway.json` tells Railway to build `backend/Dockerfile`, use the `/health` healthcheck and run one replica.
Run only one replica, because run state is held in memory.

1. **Create the service.** In Railway, choose New Project → Deploy from GitHub repo → `isaiah2004/xerxes`.
   Under Service → Settings → Source, set **Root Directory** to `backend`.
   With the CLI instead: `cd backend && railway init && railway up`.
2. **Add a volume.** Under Service → Volumes → Add Volume, set the mount path to `/data`.
   With the CLI: `railway volume add --mount-path /data`.
3. **Set variables.** Under Service → Variables, copy the keys from `backend/.env.example`. At minimum set these:
   - `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `MURF_API_KEY`
   - `XERXES_DATA_DIR=/data`, `CODEX_HOME=/data/codex` (the image already defaults to these)
   - `RAILWAY_RUN_UID=0`, because Railway volumes are root-owned and the image runs as the non-root `node` user
   - optional: `CODEX_MODEL`, `CODEX_REASONING` (default `low`), `MURF_VOICE`, `TAVILY_API_KEY`

   Do not set `PORT`. Railway injects it, and the server reads it.
4. **Generate a domain.** Under Service → Settings → Networking → Generate Domain, create the domain. Then set
   `PUBLIC_URL=https://<service>.up.railway.app` (no trailing slash) and redeploy.
5. **Log Codex in.** This is a one-time step, and the login persists on the volume:
   ```bash
   railway link            # pick the project + service
   railway ssh             # shell inside the running container
   codex login --device-auth
   codex login status      # -> Logged in using ChatGPT
   ```
   Device-code login may first need to be enabled under ChatGPT → Settings → Security.
   To use an API key instead, run `printenv OPENAI_API_KEY | codex login --with-api-key` inside the container.
6. **Verify.**
   ```bash
   curl https://<service>.up.railway.app/api/status   # codexLoggedIn: true, voice.publicUrl set
   ```
   Then point the app's backend URL at the Railway domain.

## Troubleshooting

- **The run shows "Codex is not logged in on the server".** Repeat step 5 (or the `docker compose exec` command above).
- **`/api/voice/start` returns 400 "PUBLIC_URL is not set".** Set it to the public HTTPS origin.
- **`/api/voice/start` returns 502 "Agora /join 4xx".** Agora's `reason`/`detail` is passed through verbatim. Check `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE`, and that the project has Conversational AI enabled in the Agora console.
- **Agents keep running after a call.** The app calls `POST /api/voice/stop`. Agora also ends agents automatically after `idle_timeout` (120s) with nobody in the channel.
