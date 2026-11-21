# Xerxes pitch: the spoken script

About two minutes. The same lines are in each slide's speaker notes (press **N**, or **P** for the presenter window). Times are the target for when you start each slide. "Click" means → / Space / a click on the slide.

| # | Slot | Slide |
|---|------|-------|
| 1 | 0:00–0:08 | Introducing Xerxes |
| 2 | 0:08–0:22 | The problem: a chat slapped onto a store |
| 3 | 0:22–0:58 | Xerxes is different (5-step tour, voice first) |
| 4 | 0:58–1:38 | Product demo (the clip, about 38 s) |
| 5 | 1:38–1:52 | Bring your own key, agent and storage |
| 6 | 1:52–2:00 | Thank you |
| 7 | appendix | What's live, what's next (Q&A only) |

---

### 1 · Introducing Xerxes (0:00–0:08)

*Cue: the deck opens on slide 1. Press F for full screen. Your first click on slide 1 isn't needed: the intro plays when the deck loads (R replays it). Wait for the tagline to finish typing (about 3.5 s).*

> Introducing Xerxes, your personal shopping butler.

*Click.*

### 2 · The problem (0:08–0:22)

*Cue: two stages. The slide lands on just the storefront. Start speaking, then* ***click*** *(stays on slide 2): the store bot answers with its own bestsellers, then your context appears on the right and gets cut off. Speak over the build.*

> Most shopping AIs today are a simple chat slapped onto a platform, with RAG over its catalogue.
> They're tied to that one store, and they know nothing about you: not who you're buying for, not when it has to arrive, not what you already own.

*Click.*

### 3 · Xerxes is different (0:22–0:58)

*Cue: the title shows for 1.5 s, then the camera zooms into each step by itself: step 1 holds about 8.5 s, steps 2–5 about 6.5 s each. The countdown bar at the bottom right shows how long is left. Start each line as its step zooms in. If you fall behind, click once: it jumps to the overview of all five. The next click moves on.*

> Xerxes is different.

*Step 1 · Voice-native, generative UI (0:24, ~8.5 s). The two call bubbles land, then "You · cuts in", then the three input chips.*
> First, it's truly voice-native, with generative UI: anything you can do over chat, you can do over voice, and the cards draw themselves as it talks. It's a real conversation: cut in, change your mind, or paste a product link and it reads the page.

*Step 2 · It reaches out first (0:32)*
> It initiates. It has your projects and your calendar, and keeps running on its own, so it brings up the birthday before you ask.

*Step 3 · It does the legwork (0:39)*
> It does the legwork: compares prices, checks delivery against your deadline, looks at reviews, and suggests a shop nearby when it has to be today.

*Step 4 · It knows the project (0:45)*
> It knows the project. Furnishing your living room? You already have the sofa and the rug, so it recommends what's missing.

*Step 5 · Calendar, budget, people (0:52)*
> And it knows your calendar and budget, and reminds you to buy gifts, with ideas from each person's profile.

*The tour ends on the overview at about 0:58. Click.*

### 4 · Product demo (0:58–1:38)

*Cue: step 1's voice phone (top left of the overview) grows into the demo phone. The clip starts by itself once the camera settles; the five steps on the right light up as it goes.*

> Here's a real call.

*Then stay quiet: the clip has its own audio (Xerxes in Murf's voice, and you). It ends on "Hope she loves it." at about 1:37. V pauses or resumes if something goes wrong. Click when it ends.*

### 5 · Bring your own (1:38–1:52)

> And it's yours. Bring your own keys, your own agent, Codex CLI on your login with any model, and your own storage: everything lives in a local file on your machine.

*Click.*

### 6 · Thank you (1:52–2:00)

> That's Xerxes, your personal shopping butler. The code's on GitHub. Thank you.

*Stop here. Slide 7 is for questions only.*

---

## If asked (Q&A)

- **Sending a photo** is live: attach a photo in chat and it goes to the agent with your message (app/components/Attachments.tsx, backend/src/uploads.ts). It runs through your own authorized agent.
- **Links**: paste a product URL in chat or say it; the chat shows a preview and Codex opens that page with its live web tool to read price and details (backend/src/links.ts).
- **Conversation**: Agora ConvoAI keeps the last 20 turns and lets you talk over Xerxes; chat keeps the Codex thread, so follow-ups carry context.
- **Reviews** are live: the agent checks reviews with its web search while it compares options, through your own authorized agent.
- **Other agents** are "Next": the 32 Xerxes tools are a standard MCP server, but today only Codex CLI drives them.
- **Google Drive backup** is "Next": today the data is one local file (`.data/xerxes.json`).
- **The living-room project, people and occasions** are sample entries loaded so the app has something to remember. Every search, price and delivery date in the demo is live.
- **Background work**: every 30 minutes Xerxes nudges upcoming occasions and re-checks game and hardware watches; every 15 minutes it thinks up gift ideas for the next occasions. Price watches for any product are next.
- **Calendar** is Xerxes' own calendar, not a sync with Google Calendar.
- **Shops nearby** come from OpenStreetMap. Xerxes can't see a shop's stock, so it suggests calling ahead.
