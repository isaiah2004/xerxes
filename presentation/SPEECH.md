# Xerxes pitch: the spoken script

About two minutes. The same lines are in each slide's speaker notes (press **N**, or **P** for the presenter window). Times are the target for when you start each slide. "Click" means → / Space / a click on the slide.

| # | Slot | Slide |
|---|------|-------|
| 1 | 0:00–0:08 | Introducing Xerxes |
| 2 | 0:08–0:22 | The problem: a chat slapped onto a store |
| 3 | 0:22–0:58 | Xerxes is different (5-step tour) |
| 4 | 0:58–1:38 | Product demo (the clip, about 38 s) |
| 5 | 1:38–1:52 | Bring your own key, agent and storage |
| 6 | 1:52–2:00 | Thank you |
| 7 | appendix | What's live, what's next (Q&A only) |

---

### 1 · Introducing Xerxes (0:00–0:08)

*Cue: the deck opens on slide 1. Press F for full screen. Your first click on slide 1 isn't needed: the intro plays when the deck loads (R replays it). Wait for the tagline to finish typing (about 3.5 s).*

> Introducing Xerxes, the next generation of personal shopping.

*Click.*

### 2 · The problem (0:08–0:22)

*Cue: the storefront slides in, the store bot answers with its own bestsellers, then your context appears on the right and gets cut off. Speak over the whole build.*

> Most shopping AIs today are a simple chat slapped onto a platform, with RAG over its catalogue.
> They're tied to that one store, and they know nothing about you: not who you're buying for, not when it has to arrive, not what you already own.

*Click.*

### 3 · Xerxes is different (0:22–0:58)

*Cue: the title shows for 1.5 s, then the camera zooms into each step by itself, about 7 s each; the countdown bar at the bottom right shows how long is left. Start each line as its step zooms in. If you fall behind, click once: it jumps to the overview of all five. The next click moves on.*

> Xerxes is different.

*Step 1 · It reaches out first*
> It reaches out first. It sees your calendar and your projects, and keeps running in the background, so it brings up the birthday before you do.

*Step 2 · It does the legwork*
> It does the legwork: compares prices, checks delivery against your deadline, and finds a shop nearby when it has to be today.

*Step 3 · It knows the project*
> It keeps project context. Furnishing your living room? It knows you already have the sofa and the rug, so it suggests what's missing.

*Step 4 · Calendar, budget, people*
> It knows your calendar and budget, and the people you buy for, so the gift ideas actually fit them.

*Step 5 · Voice-native, generative UI*
> And it's voice-native, with generative UI: anything you can do in chat, you can do on a call.

*The tour ends on the overview at about 0:57. Click.*

### 4 · Product demo (0:58–1:38)

*Cue: the voice step's phone grows into the demo phone. The clip starts by itself once the camera settles; the five steps on the right light up as it goes.*

> Here's a real call.

*Then stay quiet: the clip has its own audio (Xerxes in Murf's voice, and you). It ends on "Hope she loves it." at about 1:37. V pauses or resumes if something goes wrong. Click when it ends.*

### 5 · Bring your own (1:38–1:52)

> And it's yours. Bring your own keys, your own agent, Codex CLI on your login with any model, and your own storage: everything lives in a local file on your machine.

*Click.*

### 6 · Thank you (1:52–2:00)

> That's Xerxes. The code's on GitHub. Thank you.

*Stop here. Slide 7 is for questions only.*

---

## If asked (Q&A)

- **Reviews** are marked "Soon": Xerxes can search the web for reviews, but there's no review summary on its cards yet.
- **Other agents** are "Next": the 32 Xerxes tools are a standard MCP server, but today only Codex CLI drives them.
- **Google Drive backup** is "Next": today the data is one local file (`.data/xerxes.json`).
- **The living-room project, people and occasions** are sample entries loaded so the app has something to remember. Every search, price and delivery date in the demo is live.
- **Background work**: every 30 minutes Xerxes nudges upcoming occasions and re-checks game and hardware watches; every 15 minutes it thinks up gift ideas for the next occasions. Price watches for any product are next.
- **Calendar** is Xerxes' own calendar, not a sync with Google Calendar.
- **Shops nearby** come from OpenStreetMap. Xerxes can't see a shop's stock, so it suggests calling ahead.
