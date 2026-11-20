// Export the deck with headless Chrome over the DevTools protocol. No npm dependencies (Node 18+).
//
//   node presentation/tools/export.mjs              -> xerxes-pitch.pdf next to index.html (committed),
//                                                      plus dist/png/*.png and dist/jpg/*.jpg at 2x and dist/notes.json (ignored)
//   node presentation/tools/export.mjs --scale=1 --no-pdf      quick 1920x1080 PNGs for checking layout
//   node presentation/tools/export.mjs --only=3                just slide 3
//
// Talks to Chrome over --remote-debugging-pipe rather than a WebSocket: 2x screenshots are ~10 MB messages,
// which Node's built-in WebSocket refuses. Set CHROME=/path/to/chrome to override browser discovery.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const deckDir = resolve(here, "..");
const dist = join(deckDir, "dist");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split("=")[1] : dflt; };
const scale = Number(opt("scale", 2));
const only = opt("only", "") ? Number(opt("only")) : 0;
const wantPdf = !flag("no-pdf") && !only;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const debug = (...a) => { if (process.env.DEBUG) console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`, ...a); };

const candidates = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chromePath = candidates.find((p) => existsSync(p));
if (!chromePath) { console.error("No Chrome/Edge found. Set CHROME=/path/to/chrome."); process.exit(1); }

/** CDP over Chrome's debugging pipe: fd 3 = to Chrome, fd 4 = from Chrome, one NUL-terminated JSON message each. */
function connect(proc) {
  const toChrome = proc.stdio[3];
  const fromChrome = proc.stdio[4];
  let seq = 0;
  let parts = [];
  const pending = new Map();
  const waiters = [];
  const failAll = (why) => { for (const [id, p] of pending) { pending.delete(id); p.fail(new Error(`${p.method}: ${why}`)); } };

  fromChrome.on("data", (chunk) => {
    let start = 0;
    for (let end = chunk.indexOf(0); end !== -1; end = chunk.indexOf(0, start)) {
      parts.push(chunk.subarray(start, end));
      const msg = JSON.parse(Buffer.concat(parts).toString("utf8"));
      parts = [];
      start = end + 1;
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.fail(new Error(`${p.method}: ${msg.error.message}`)); else p.ok(msg.result);
      } else if (msg.method) {
        for (const w of [...waiters]) {
          if (w.method === msg.method && (!w.sessionId || w.sessionId === msg.sessionId)) { waiters.splice(waiters.indexOf(w), 1); w.ok(msg.params); }
        }
      }
    }
    if (start < chunk.length) parts.push(chunk.subarray(start));
  });
  fromChrome.on("close", () => failAll("Chrome closed the debugging pipe"));
  proc.on("exit", (code) => failAll(`Chrome exited (${code})`));

  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++seq;
    pending.set(id, { ok, fail, method });
    toChrome.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
  const once = (method, sessionId) => new Promise((ok) => waiters.push({ method, sessionId, ok }));
  return { send, once };
}

const profile = mkdtempSync(join(tmpdir(), "xerxes-deck-"));
const chrome = spawn(chromePath, [
  "--headless=new", "--remote-debugging-pipe", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
  "--allow-file-access-from-files", "--force-color-profile=srgb", "--window-size=1920,1080",
  "about:blank",
], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });

let browser;
try {
  browser = connect(chrome);
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  await send("Page.enable");
  await send("Runtime.enable");
  debug("attached");

  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const frames = () => evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))", true);

  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: scale, mobile: false });
  const loaded = browser.once("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url: `${pathToFileURL(join(deckDir, "index.html")).href}?export` });
  await loaded;
  for (let i = 0; i < 200; i++) { if (await evaluate("window.deckReady === true")) break; await sleep(100); }
  debug("ready");

  // faces no element uses stay "unloaded"; only "error" means a missing file
  const badFonts = await evaluate(`[...document.fonts].filter(f => f.status === "error").map(f => f.family + " " + f.weight)`);
  if (badFonts.length) console.warn("Fonts failed to load:", badFonts.join(", "));
  const broken = await evaluate(`[...document.images].filter(i => !i.naturalWidth).map(i => i.getAttribute("src"))`);
  if (broken.length) console.warn("Broken images:", broken.join(", "));

  const notes = await evaluate("deck.notes()");
  mkdirSync(join(dist, "png"), { recursive: true });
  mkdirSync(join(dist, "jpg"), { recursive: true });
  writeFileSync(join(dist, "notes.json"), JSON.stringify(notes, null, 2));

  const count = await evaluate("deck.count");
  for (let i = 0; i < count; i++) {
    if (only && i !== only - 1) continue;
    await evaluate(`deck.go(${i})`);
    await frames();
    const nn = String(i + 1).padStart(2, "0");
    const png = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(dist, "png", `slide-${nn}.png`), Buffer.from(png.data, "base64"));
    const jpg = await send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
    writeFileSync(join(dist, "jpg", `slide-${nn}.jpg`), Buffer.from(jpg.data, "base64"));
    console.log(`slide ${nn}  ${notes[i].title}`);
  }

  // With a recorded clip, also capture slide 3's clip layout and where the video sits, for the PPTX.
  const clip = join(deckDir, "assets", "video", "demo.mp4");
  if (existsSync(clip) && !only) {
    const ready = browser.once("Page.loadEventFired", sessionId);
    await send("Page.navigate", { url: `${pathToFileURL(join(deckDir, "index.html")).href}?export&video` });
    await ready;
    for (let i = 0; i < 200; i++) { if (await evaluate("window.deckReady === true")) break; await sleep(100); }
    const d = await evaluate("deck.demoIndex");
    await evaluate(`deck.go(${d})`);
    await frames();
    const nn = String(d + 1).padStart(2, "0");
    const live = await send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
    writeFileSync(join(dist, "jpg", `slide-${nn}-live.jpg`), Buffer.from(live.data, "base64"));
    writeFileSync(join(dist, "demo-layout.json"), JSON.stringify({ slide: d + 1, video: await evaluate("deck.videoRect()") }, null, 2));
    console.log(`slide ${nn}  clip layout for the PPTX`);
    // back to the storyboard version for the PDF
    const back = browser.once("Page.loadEventFired", sessionId);
    await send("Page.navigate", { url: `${pathToFileURL(join(deckDir, "index.html")).href}?export` });
    await back;
    for (let i = 0; i < 200; i++) { if (await evaluate("window.deckReady === true")) break; await sleep(100); }
  }

  if (wantPdf) {
    await send("Emulation.clearDeviceMetricsOverride");
    await frames();
    const pdf = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
    writeFileSync(join(deckDir, "xerxes-pitch.pdf"), Buffer.from(pdf.data, "base64"));
    console.log("pdf   xerxes-pitch.pdf");
  }
  debug("done");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  try { await Promise.race([browser?.send("Browser.close"), sleep(3000)]); } catch { /* already gone */ }
  if (chrome.exitCode === null) chrome.kill();
  for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(300); } }
}
