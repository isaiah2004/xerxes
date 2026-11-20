# Xerxes

**A proactive, voice-first shopping agent.** Xerxes remembers the people and occasions in your life and does the legwork for you.
It searches real catalogues and retailers, checks prices and delivery dates against your budget and deadlines, and returns a decision, not a list of links.
You can talk to it over a live voice call or type.

Built for *Build with Agora, Bengaluru* using the Agora Conversational AI Engine and Murf Falcon TTS.

## What it does

| # | Use case | What Xerxes does |
|---|----------|------------------|
| 1 | **Occasion gifting** | "Cousin's birthday is coming up." Xerxes knows her age and interests, finds 2–3 gifts, checks each one arrives before the date, and picks one. |
| 2 | **Homelab deal hunting** | Watches used and refurbished hardware (mini PCs, NICs, drives) against the setup you described, and pings you when something worth buying appears. |
| 3 | **Big-item exploration** | "A rack for 1000 books." Asks for room dimensions, compares buying with DIY, and covers installment plans and delivery logistics. |
| 4 | **Specific-book hunt** | Finds an exact edition (for example, a verified hardcover) new or second-hand, comparing retailers on price and delivery. |
| 5 | **Festival / family budget gifting** | Splits one budget across a household for Diwali and similar occasions, with per-person picks and a running total. |
| 6 | **Game sale alerts** | Tracks wish-listed games across stores and notifies you, out loud if you like, when they drop below your price. |

## Architecture

```
 Expo app (app/)                         Hono backend (backend/, :8787)
 ┌──────────────┐  REST + polling        ┌──────────────────────────────────────────┐
 │ Today feed   │ ─────────────────────▶ │ /api/conversations, /api/runs/:id         │
 │ Chat + cards │ ◀── steps / cards ──── │        │ one run = one Codex turn          │
 │ Voice call   │                        │        ▼                                  │
 └──────┬───────┘                        │  Codex CLI (`codex exec --json`)          │
        │ Agora RTC (audio)              │        │ MCP (streamable HTTP, loopback)   │
        ▼                                │        ▼                                  │
 ┌──────────────────────────┐   custom   │  /mcp/:runId → Xerxes tools               │
 │ Agora Conversational AI  │ ─── LLM ─▶ │   search_books · web_search · read_page   │
 │  ASR → LLM → Murf Falcon │   (SSE)    │   check_offers · show_products/…          │
 │  TTS, turn-taking        │ ◀───────── │   create_watch · find_game_deals · …      │
 └──────────────────────────┘            │  /v1/sessions/:id/chat/completions        │
                                         │  watchers (price/occasion) → notifications│
                                         └──────────────────────────────────────────┘
```

- **Brain:** Codex CLI runs each turn and acts only through Xerxes' MCP tools. Each conversation maps to one Codex thread, which is resumed on every turn.
- **Agentic UI:** tool calls stream to the app as live steps. `show_products`, `show_recommendation` and `show_question` render cards.
- **Voice:** `POST /api/voice/start` starts an Agora ConvoAI agent in an RTC channel, with Agora ASR and Murf Falcon TTS (`vendor: murf`, model `FALCON`). Its LLM is our OpenAI-compatible endpoint, which runs the same Codex agent. Codex turns take 10–60s, so the endpoint streams short spoken fillers (at 2.5s, 15s and 35s) while the tools work.
- **Watchers:** these re-check game deals, used hardware and upcoming occasions, and write notifications to the feed. `GET /api/tts` reads them aloud through Murf.

## Run locally

Prerequisites: Node 24+, Codex CLI (`npm i -g @openai/codex`, then `codex login`), and cloudflared for voice.

```bash
node scripts/sync-secrets.mjs          # env.download + api-key.txt -> backend/.env (values never printed)
cd backend && npm install && npm run dev   # http://localhost:8787
```

Voice needs a public URL so Agora can reach the custom-LLM endpoint:

```bash
cloudflared tunnel --url http://localhost:8787          # copy the https://*.trycloudflare.com URL
node scripts/set-env.mjs PUBLIC_URL=https://<host>.trycloudflare.com   # then save any src file or restart dev
curl localhost:8787/api/status                           # codexLoggedIn, voice config
```

App: see `app/`. Point it at `http://<your-LAN-IP>:8787` or at the tunnel URL.

## Docker

```bash
node scripts/sync-secrets.mjs
docker compose up -d --build backend
docker compose exec backend codex login --device-auth    # one time; persists in the xerxes-data volume
docker compose --profile tunnel up -d tunnel             # optional public URL for voice
```

To deploy on Railway, see [docs/DEPLOY.md](docs/DEPLOY.md).

## API (used by the app)

`GET /api/feed` · `POST /api/conversations` · `POST /api/conversations/:id/messages {text} → {runId}` ·
`GET /api/runs/:id?after=N → {status, events[]}` · `GET /api/tts?text=` · `POST /api/voice/start` · `POST /api/voice/stop` ·
`GET /api/voice/sessions/:id` · `GET /api/voice/sessions/:id/agent` · `GET /api/status` · `GET /health` ·
`POST /v1/sessions/:id/chat/completions` (Agora custom LLM, OpenAI SSE)

## Secrets

Real keys live only in `backend/.env`, which git ignores. `.githooks/pre-commit` blocks any commit that contains one of those values (`git config core.hooksPath .githooks`).
See `backend/.env.example` for every variable.
