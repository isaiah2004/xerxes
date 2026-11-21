# Xerxes pitch deck

This is the two-minute pitch for **Build with Agora, Bengaluru 2026**. The deck is a single HTML page with no build step, and it runs straight from disk. Present it from Chrome. The PDF and PPTX are exported from the same page.

- **[xerxes-pitch.pdf](xerxes-pitch.pdf)** is the submission copy. It predates the current 7-slide structure and needs re-exporting (`node presentation/tools/export.mjs`).
- `index.html`, `deck.css` and `deck.js` are the deck. Each slide carries its spoken script in `<aside class="notes">`; **[SPEECH.md](SPEECH.md)** has the whole script with timings and click cues.
- `tools/` holds the exporters. `assets/` holds the fonts (Inter, OFL), the app screenshots, the grain textures and the demo clip.

| # | Time | Slide |
|---|------|-------|
| 1 | 0:00–0:08 | Introducing Xerxes (animated intro) |
| 2 | 0:08–0:22 | The problem: a chat slapped onto a store |
| 3 | 0:22–0:58 | Xerxes is different: a 5-step zoom tour (voice first) |
| 4 | 0:58–1:38 | Product demo: the recorded call |
| 5 | 1:38–1:52 | Bring your own key, agent and storage |
| 6 | 1:52–2:00 | Thank you, with the repo link and QR |
| 7 | appendix | What's live, what's next (Q&A only) |

## Presenting

Open `index.html` in Chrome and press **F**.

| Key | Action |
|-----|--------|
| → · Space · PageDown · Enter · click | Next |
| ← · PageUp · Backspace · click near the left edge | Back |
| 1–7 · Home · End | Jump to a slide |
| F | Full screen |
| N | Speaker notes over the slide |
| P | Presenter window: script, clock, next slide and buttons. Keep it on the laptop screen while the deck is on the projector. |
| T | Restart the clock |
| R | Replay the intro animation |
| V | Play or pause the demo clip |

Slides move like one continuous camera shot: the old slide drifts out and blurs while the next one slides in from the direction you're travelling (about 0.85 s), over a faint background that pans with you, and the brand mark stays put. Two things fly across going forward: the intro orb lands as the slide 2 logo, and the voice step's phone (step 1 on slide 3, seen in the overview) grows into the demo phone on slide 4. Each slide's own animation starts as the camera settles. Pressing again mid-move finishes it at once, so rapid presses are safe; number keys, Home and End use a quicker zoom cut. `?export` and reduced-motion get no transitions.

Slide 3 tours itself, in this order: 1 voice-native with generative UI (plus conversational flow, links and photos), 2 reaches out first, 3 does the legwork, 4 knows the project, 5 calendar, budget and people. It runs 1.5 s on the title, then 8.5 s zoomed into step 1 (voice: its three input chips land last) and 6.5 s into each of the other four, with a countdown bar at the bottom right, then the overview. One click skips to the overview; the next click moves on. Slide 4 plays the clip once the camera settles and pauses it when you leave.

The clock starts on the first forward press. It turns orange when a slide runs past its slot. Adding `#3` to the URL opens slide 3.

## Media

- **`assets/video/demo.mp4`** is the recorded voice call (38 s, portrait), shown big in a phone on slide 4. The five steps beside it light up at the second marks in `data-at` on each `.rail .r` (0, 10, 20, 23, 29). The export shows the frame at 31 s (the answer); `?export&video` shows the first frame, for the PPTX.
- Slide 3 uses real app screens (Today, Calendar, a chat result). The legwork and living-room cards are drawn in the app's style, from the app's real data shapes, since there are no screenshots of those screens yet.

## Exporting

You need Node 18+ and Chrome or Edge. The PPTX also needs Python with `python-pptx` and Pillow.

```sh
node presentation/tools/export.mjs        # xerxes-pitch.pdf, plus dist/png and dist/jpg slide images at 2x, and dist/notes.json
python presentation/tools/build_pptx.py   # dist/xerxes-pitch.pptx
```

- **The PDF** is the submission format: it is small, text stays selectable, and the GitHub link stays clickable. Slide 4 shows a still from the clip, since a PDF can't play video.
- **The PPTX** has one full-bleed 2x image per slide, so it matches the HTML exactly. The script and timings are in the speaker notes. When `demo.mp4` exists, slide 4 embeds the clip over the phone.
- `--scale=1 --no-pdf` gives quick 1x PNGs for checking layout, and `--only=3` renders a single slide. Set `CHROME=/path/to/chrome` if neither browser is found.

`dist/` is git-ignored, so only the PDF is committed.

## Notes for Q&A

- Anything not built yet carries a small "Soon" or "Next" tag on its slide: reviews and sending a photo (slide 3), other MCP agents and Google Drive backup (slide 5). SPEECH.md lists what to say if asked.
- The people, occasions and the living-room project are sample entries; searches, prices, delivery estimates and the voice call are live.
- The tool count (32) is the number of `tool(...)` registrations in `backend/src/mcp.ts`.
