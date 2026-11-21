# Xerxes pitch deck

This is the two-minute pitch for **Build with Agora, Bengaluru 2026**. The deck is a single HTML page with no build step, and it runs straight from disk. Present it from Chrome. The PDF and PPTX are exported from the same page.

- **[xerxes-pitch.pdf](xerxes-pitch.pdf)** is the submission copy: 9 pages, with selectable text and a clickable repo link.
- `index.html`, `deck.css` and `deck.js` are the deck. Each slide carries its spoken script in `<aside class="notes">`.
- `tools/` holds the exporters. `assets/` holds the fonts (Inter, OFL), the app screenshots, the grain textures and the media slots.

| # | Time | Slide |
|---|------|-------|
| 1 | 0:00–0:10 | Meet Xerxes (animated intro) |
| 2 | 0:10–0:24 | Not a list of links. A decision. |
| 3 | 0:24–1:04 | Watch it do the legwork (the demo) |
| 4 | 1:04–1:28 | How it works |
| 5 | 1:28–1:44 | The line never goes quiet |
| 6 | 1:44–1:54 | It keeps watching |
| 7 | 1:54–2:00 | Close, with the QR code to this repo |
| 8–9 | appendix | Under the hood · What's live, what's seeded (for Q&A only) |

## Presenting

Open `index.html` in Chrome and press **F**.

| Key | Action |
|-----|--------|
| → · Space · PageDown · Enter · click | Next |
| ← · PageUp · Backspace · click near the left edge | Back |
| 1–9 · Home · End | Jump to a slide |
| F | Full screen |
| N | Speaker notes over the slide |
| P | Presenter window: script, clock, next slide and buttons. Keep it on the laptop screen while the deck is on the projector. |
| T | Restart the clock |
| R | Replay the intro animation |
| V | Play or pause the demo clip |

The clock starts on the first forward press. It turns orange when a slide runs past its slot. Adding `#3` to the URL opens slide 3.

## Media slots

The deck has no audio of its own; the only sound is the demo clip.

- **`assets/video/demo.mp4`** is the recorded voice call, 30–45 s, portrait. When it's there, slide 3 swaps the three-screen storyboard for the clip in a phone. The clip starts as the slide opens and pauses when you leave it. The five steps beside it light up at the second marks in `data-at` on each `.rail .r` in `index.html` (now 0, 4, 18, 30 and 35), so set those to your cut.

## Exporting

You need Node 18+ and Chrome or Edge. The PPTX also needs Python with `python-pptx` and Pillow.

```sh
node presentation/tools/export.mjs        # xerxes-pitch.pdf, plus dist/png and dist/jpg slide images at 2x, and dist/notes.json
python presentation/tools/build_pptx.py   # dist/xerxes-pitch.pptx
```

- **The PDF** is the submission format: it is small, text stays selectable, and the GitHub link stays clickable. It always shows the storyboard on slide 3, since a PDF can't play video.
- **The PPTX** has one full-bleed 2x image per slide, so it matches the HTML exactly. The script and timings are in the speaker notes. When `demo.mp4` exists, slide 3 embeds the clip over the phone.
- `--scale=1 --no-pdf` gives quick 1x PNGs for checking layout, and `--only=3` renders a single slide. Set `CHROME=/path/to/chrome` if neither browser is found.

`dist/` is git-ignored, so only the PDF is committed.

## What's illustrative

- People, occasions, budgets and the starting Radar watch list are seeded demo data. Searches, prices, delivery estimates and the voice call are live.
- The slide 2 decision card comes from a live search on 21 Nov 2026. Its delivery date is Amazon's own estimate.
- The slide 3 storyboard uses real app screens from a typed chat, not the voice call. The recorded clip replaces it.
- In slide 5's transcript, the times are illustrative and labelled so. Every line is a real string from `backend/src/voice.ts`. The stat tiles and the bar chart are measured.
