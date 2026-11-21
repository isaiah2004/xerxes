/* Xerxes pitch deck runtime: scaling, navigation, the intro animation, the demo clip, notes and a presenter window.
   No dependencies; works from file://.
   Keys: → / Space / PageDown next · ← / PageUp back · Home / End · 1–9 jump · F full screen · N notes
         P presenter window · T restart the clock · R replay the intro · V play/pause the demo clip
   URL:  #3 opens slide 3 · ?export = static final states for PDF/PNG export · ?presenter = speaker view */
(() => {
  "use strict";
  const qs = new URLSearchParams(location.search);
  const EXPORT = qs.has("export");
  const PRESENTER = qs.has("presenter");

  const root = document.documentElement;
  const body = document.body;
  const deckEl = document.getElementById("deck");
  const slides = [...deckEl.children].filter((el) => el.classList.contains("slide"));
  const N = slides.length;
  const hook = deckEl.querySelector(".s-hook");
  const demo = deckEl.querySelector(".s-demo");
  const video = document.getElementById("demo-video");
  const intro = window.xerxesIntro;
  const rails = demo ? [...demo.querySelectorAll(".rail .r")] : [];

  let cur = -1;
  let t0 = 0;                 // presentation clock start (ms since epoch), 0 = not started
  let hasVideo = false;       // demo.mp4 loaded
  let videoTimer = 0;
  let pres = null;            // presenter window (main side)

  if (EXPORT) root.classList.add("export");
  if (PRESENTER) body.classList.add("presenter");

  /* ---------------------------------------------------------------- helpers */
  const clamp = (i) => Math.max(0, Math.min(N - 1, i));
  const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const notesHtml = (i) => { const n = slides[i].querySelector(".notes"); return n ? n.innerHTML.trim() : ""; };
  const meta = (i) => {
    const s = slides[i].dataset;
    return { index: i, title: s.title || "", time: s.time || "", at: Number(s.at || 0), dur: Number(s.dur || 0), html: notesHtml(i) };
  };
  const plain = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html;
    const ps = [...d.querySelectorAll("p")];
    return (ps.length ? ps.map((p) => p.textContent) : [d.textContent]).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  };

  /* ---------------------------------------------------------------- scale to the window */
  function fit() {
    if (EXPORT || PRESENTER) { deckEl.style.transform = ""; return; }
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    deckEl.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  }

  /* ---------------------------------------------------------------- slide 3: the recorded call */
  function updateRail() {
    const t = video ? video.currentTime : 0;
    rails.forEach((r) => r.classList.toggle("on", t >= Number(r.dataset.at || 0)));
  }

  function enterDemo() {
    if (!hasVideo || EXPORT) return;
    video.pause();
    video.currentTime = 0;
    updateRail();
    clearTimeout(videoTimer);
    videoTimer = setTimeout(() => video.play().catch(() => {}), 450);
  }

  function leaveDemo() {
    clearTimeout(videoTimer);
    if (video && !video.paused) video.pause();
  }

  function toggleVideo() {
    if (!hasVideo || slides[cur] !== demo) return;
    if (video.paused) video.play().catch(() => {}); else video.pause();
  }

  /* ---------------------------------------------------------------- slide 2: the price counts up as the card fills in */
  function countUp(slide) {
    const el = slide.querySelector(".decision .amount");
    if (!el) return;
    const final = el.dataset.final || (el.dataset.final = el.textContent);
    const target = Number(final.replace(/[^\d]/g, "")), start = performance.now() + 6900, dur = 1100;
    el.textContent = "₹0";
    const step = (now) => {
      if (!slide.classList.contains("active")) { el.textContent = final; return; }
      const k = Math.max(0, Math.min(1, (now - start) / dur)), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k >= 1 ? final : `₹${Math.round(target * e).toLocaleString("en-IN")}`;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------- navigation */
  function go(i, opts = {}) {
    i = clamp(i);
    if (i === cur && !opts.force) return;
    const from = slides[cur];
    const to = slides[i];
    if (from === hook && to !== hook) intro && intro.leave();
    if (from === demo && to !== demo) leaveDemo();

    if (opts.instant || EXPORT) {
      slides.forEach((s) => (s.style.transition = "none"));
      slides.forEach((s, k) => s.classList.toggle("active", k === i));
      void deckEl.offsetWidth;
      slides.forEach((s) => (s.style.transition = ""));
    } else {
      slides.forEach((s, k) => s.classList.toggle("active", k === i));
    }
    cur = i;

    if (to === hook) intro && intro.enter();
    else if (!EXPORT) { to.classList.remove("play"); void to.offsetWidth; to.classList.add("play"); if (to.classList.contains("s-legwork")) countUp(to); }
    if (to === demo) enterDemo();
    if (!EXPORT && !PRESENTER && location.hash !== `#${i + 1}`) history.replaceState(null, "", `#${i + 1}`);
    renderChrome();
    sync();
  }

  function next() {
    if (!t0) startClock();
    go(cur + 1);
  }
  function prev() { go(cur - 1); }

  function startClock() { if (!t0) { t0 = Date.now(); sync(); } }
  function resetClock() { t0 = Date.now(); sync(); renderChrome(); }

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.requestFullscreen().catch(() => {});
  }

  /* ---------------------------------------------------------------- notes overlay + HUD */
  const hudPos = document.getElementById("hud-pos");
  const nTitle = document.getElementById("notes-title");
  const nTime = document.getElementById("notes-time");
  const nClock = document.getElementById("notes-clock");
  const nBody = document.getElementById("notes-body");

  function renderChrome() {
    if (cur < 0) return;
    const m = meta(cur);
    if (hudPos) hudPos.textContent = `${cur + 1} / ${N}`;
    if (nTitle) nTitle.textContent = `${cur + 1}/${N} · ${m.title}`;
    if (nTime) nTime.textContent = m.time;
    if (nBody) nBody.innerHTML = m.html;
    tick();
  }

  function tick() {
    if (cur < 0) return;
    const el = t0 ? (Date.now() - t0) / 1000 : 0;
    const m = meta(cur);
    const late = t0 && m.dur > 0 && el > m.at + m.dur + 2;
    if (nClock) { nClock.textContent = fmt(el); nClock.classList.toggle("late", !!late); }
    if (PRESENTER) renderPresenterClock(el, late);
  }

  let idleTimer = 0;
  function wake() {
    body.classList.add("show-hud");
    body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { body.classList.remove("show-hud"); body.classList.add("idle"); }, 2200);
  }

  /* ---------------------------------------------------------------- presenter window (postMessage, works on file://) */
  function openPresenter() {
    const base = location.href.split("#")[0].split("?")[0];
    pres = window.open(`${base}?presenter`, "xerxes-presenter", "width=1180,height=760");
    setTimeout(sync, 600);
  }

  function sync() {
    if (PRESENTER || !pres || pres.closed) return;
    pres.postMessage({ type: "xerxes:state", cur, t0, hasVideo }, "*");
  }

  function command(cmd, arg) {
    switch (cmd) {
      case "next": next(); break;
      case "prev": prev(); break;
      case "go": go(Number(arg)); break;
      case "first": go(0); break;
      case "last": go(N - 1); break;
      case "greet": if (slides[cur] === hook) intro && intro.enter(); break;
      case "video": toggleVideo(); break;
      case "clock": resetClock(); break;
    }
  }

  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (!PRESENTER && d.type === "xerxes:hello") { pres = e.source; sync(); }
    if (!PRESENTER && d.type === "xerxes:cmd") command(d.cmd, d.arg);
    if (PRESENTER && d.type === "xerxes:state") {
      t0 = d.t0; hasVideo = d.hasVideo;
      cur = clamp(d.cur);
      renderPresenter();
    }
  });

  const P = document.getElementById("presenter");
  function send(cmd, arg) {
    if (window.opener && !window.opener.closed) window.opener.postMessage({ type: "xerxes:cmd", cmd, arg }, "*");
  }
  function renderPresenter() {
    if (!PRESENTER || cur < 0) return;
    const m = meta(cur);
    const nx = cur + 1 < N ? meta(cur + 1) : null;
    let tip = "";
    if (slides[cur] === demo && !hasVideo) tip = "<p class=\"tip\">No demo.mp4 yet: the storyboard is on screen.</p>";
    P.innerHTML = `
      <div>
        <div class="now">Slide ${cur + 1} of ${N} · ${m.time}</div>
        <h1>${m.title}</h1>
        <div class="script">${m.html}${tip}</div>
      </div>
      <div class="side">
        <div class="clock" id="p-clock">0:00</div>
        <div class="target" id="p-target"></div>
        <div class="next">${nx ? `Next: <b>${nx.title}</b> <span>(${nx.time})</span>` : "Last slide."}</div>
        <button data-cmd="next">Next →</button>
        <button class="ghost" data-cmd="prev">← Back</button>
        <button class="ghost" data-cmd="greet">Replay intro (R)</button>
        <button class="ghost" data-cmd="video">Play / pause clip (V)</button>
        <button class="ghost" data-cmd="clock">Restart clock (T)</button>
      </div>`;
    P.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { send(b.dataset.cmd); b.blur(); }));
    tick();
  }
  function renderPresenterClock(el, late) {
    const c = document.getElementById("p-clock");
    const t = document.getElementById("p-target");
    if (!c) return;
    c.textContent = fmt(el);
    c.classList.toggle("late", !!late);
    const m = meta(cur);
    if (t) t.textContent = m.dur > 0 ? `This slide: ${m.time} (move on by ${fmt(m.at + m.dur)})` : "Appendix: not presented";
  }

  /* ---------------------------------------------------------------- input */
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const act = PRESENTER ? send : command;
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) { e.preventDefault(); act("next"); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) { e.preventDefault(); act("prev"); }
    else if (k === "Home") act("first");
    else if (k === "End") act("last");
    else if (/^[1-9]$/.test(k)) act("go", Number(k) - 1);
    else if (k === "r" || k === "R") act("greet");
    else if (k === "v" || k === "V") act("video");
    else if (k === "t" || k === "T") act("clock");
    else if (!PRESENTER && (k === "f" || k === "F")) toggleFull();
    else if (!PRESENTER && (k === "n" || k === "N")) body.classList.toggle("show-notes");
    else if (!PRESENTER && (k === "p" || k === "P")) openPresenter();
  }

  /* ---------------------------------------------------------------- media detection */
  function watchMedia(el, onOk) {
    if (!el) return;
    if (el.readyState >= 1) { onOk(); return; }
    el.addEventListener("loadedmetadata", onOk, { once: true });
  }

  /* ---------------------------------------------------------------- boot */
  if (EXPORT) {
    // static, final states only; no hash, no chrome. ?export&video shows slide 3's clip layout (for the PPTX).
    const withVideo = qs.has("video") && demo && video;
    window.deck = {
      count: N,
      demoIndex: slides.indexOf(demo),
      go: (i) => go(i, { instant: true, force: true }),
      notes: () => slides.map((_, i) => { const m = meta(i); return { ...m, text: plain(m.html) }; }),
      videoRect: () => { const r = video.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; },
    };
    let firstFrame = Promise.resolve();
    if (withVideo) {
      demo.classList.add("has-video");
      firstFrame = new Promise((ok) => {
        const done = () => ok();
        video.addEventListener("loadeddata", () => { video.currentTime = 0.5; video.addEventListener("seeked", done, { once: true }); }, { once: true });
        video.addEventListener("error", done, { once: true });
        setTimeout(done, 5000);
      });
    }
    go(0, { instant: true, force: true });
    const imgs = [...document.images].map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
    Promise.all([document.fonts.ready, firstFrame, intro ? intro.ready : null, ...imgs]).then(() => requestAnimationFrame(() => { window.deckReady = true; }));
    return;
  }

  addEventListener("keydown", onKey);

  if (PRESENTER) {
    document.title = "Xerxes · presenter";
    cur = 0;
    renderPresenter();
    if (window.opener) window.opener.postMessage({ type: "xerxes:hello" }, "*");
    setInterval(tick, 250);
    return;
  }

  watchMedia(video, () => {
    hasVideo = true;
    demo.classList.add("has-video");
    if (slides[cur] === demo) enterDemo();
    sync();
  });
  if (video) {
    video.addEventListener("timeupdate", updateRail);
    video.addEventListener("seeked", updateRail);
    video.addEventListener("click", (e) => { e.stopPropagation(); toggleVideo(); });
  }

  deckEl.addEventListener("click", (e) => {
    if (e.target.closest("a, button, video")) return;
    if (e.clientX < innerWidth * 0.22) prev(); else next();
  });
  addEventListener("resize", fit);
  addEventListener("mousemove", wake);
  addEventListener("hashchange", () => { const h = parseInt(location.hash.slice(1), 10); if (h) go(h - 1); });

  fit();
  const start = parseInt(location.hash.slice(1), 10);
  go(Number.isFinite(start) && start > 0 ? start - 1 : 0, { instant: true, force: true });
  setInterval(tick, 250);
  wake();

  window.deck = { count: N, go: (i) => go(i), next, prev, notes: () => slides.map((_, i) => meta(i)) };
})();