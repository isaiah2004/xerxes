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

  /* ---------------------------------------------------------------- slide 3 without a clip: tour the three screens, then the overview */
  const board = demo && demo.querySelector(".board .cols");
  const cols = board ? [...board.querySelectorAll(".col")] : [];
  const TOUR = [0, 6.2, 12.6, 19.2]; // seconds: screen 1, 2, 3, back to the overview
  let tourTimers = [];
  const touring = () => !!demo && demo.classList.contains("touring");
  function focusCol(k) {
    cols.forEach((c, i) => c.classList.toggle("on", i === k));
    const gap = 44, cw = (board.clientWidth - 2 * gap) / 3;
    const cx = k * (cw + gap) + cw / 2, cy = board.clientHeight / 2;
    board.style.transformOrigin = `${cx}px ${cy}px`;
    board.style.transform = `translate(${960 - (board.offsetLeft + cx)}px, ${588 - (board.offsetTop + cy)}px) scale(1.15)`;
  }
  function resetTour() {
    tourTimers.forEach(clearTimeout); tourTimers = [];
    if (!demo) return;
    demo.classList.remove("touring", "overview");
    cols.forEach((c) => c.classList.remove("on"));
    if (board) board.style.transform = "";
  }
  function endTour() {
    resetTour();
    if (!demo) return;
    void demo.offsetWidth; demo.classList.add("overview");
  }
  function startTour() {
    if (!board || hasVideo || EXPORT) return;
    resetTour();
    demo.classList.add("touring");
    [0, 1, 2].forEach((k) => tourTimers.push(setTimeout(() => focusCol(k), TOUR[k] * 1000 + 300)));
    tourTimers.push(setTimeout(endTour, TOUR[3] * 1000));
  }

  /* ---------------------------------------------------------------- slide 6: tour Radar, Calendar, People, then the overview */
  const always = document.querySelector(".slide.s-always");
  const trio = always && always.querySelector(".trio");
  const units = trio ? [...trio.querySelectorAll(".unit")] : [];
  const ATOUR = [0, 2.7, 5.4, 8.1]; // seconds: Radar, Calendar, People, back to the overview (10s slot)
  let aTimers = [];
  const aTouring = () => !!always && always.classList.contains("touring");
  function focusUnit(k) {
    units.forEach((u, i) => u.classList.toggle("on", i === k));
    const u = units[k], cx = u.offsetLeft + u.offsetWidth / 2, cy = trio.clientHeight / 2;
    trio.style.transformOrigin = `${cx}px ${cy}px`;
    trio.style.transform = `translate(${960 - (trio.offsetLeft + cx)}px, ${560 - (trio.offsetTop + cy)}px) scale(1.15)`;
  }
  function resetAlways() {
    aTimers.forEach(clearTimeout); aTimers = [];
    if (!always) return;
    always.classList.remove("touring", "overview");
    units.forEach((u) => u.classList.remove("on"));
    if (trio) trio.style.transform = "";
  }
  function endAlways() {
    resetAlways();
    if (!always) return;
    void always.offsetWidth; always.classList.add("overview");
  }
  function startAlways() {
    if (!units.length || EXPORT) return;
    resetAlways();
    always.classList.add("touring");
    units.forEach((_, k) => aTimers.push(setTimeout(() => focusUnit(k), ATOUR[k] * 1000 + 300)));
    aTimers.push(setTimeout(endAlways, ATOUR[3] * 1000));
  }

  /* ---------------------------------------------------------------- slide 4: the call flows through the diagram in numbered order */
  function archSeq(slide) {
    const a = slide.querySelector(".arch");
    if (!a || a.dataset.seq) return;
    a.dataset.seq = "1";
    const box = [...a.querySelectorAll(".box")], p = [...a.querySelectorAll(".wires path")], wl = [...a.querySelectorAll(".wlabel")];
    const at = (el, d) => { if (el) { el.classList.add("seq"); el.style.setProperty("--d", `${d}s`); } };
    a.querySelectorAll(".lane").forEach((el) => at(el, 0.1));
    at(box[0], 0.3);                                   // you
    at(p[0], 0.8); at(wl[0], 0.8);                    // ① speak
    at(box[1], 1.1);                                   // agora
    at(p[4], 1.9); at(a.querySelector(".bridge"), 1.9); // ② custom LLM
    at(box[3], 2.5);                                   // backend
    at(p[6], 3.1); at(wl[5], 3.1);                    // ③
    at(box[4], 3.4);                                   // codex
    at(p[7], 4.0); at(wl[6], 4.0);                    // ④
    at(box[5], 4.3);                                   // tools
    box[5] && box[5].querySelectorAll(".tool").forEach((t, k) => at(t, 4.6 + k * 0.07));
    at(p[5], 5.8); at(wl[4], 5.8);                    // ⑤ narration + answer
    at(p[2], 6.4); at(wl[2], 6.4);                    // ⑥ text to murf
    at(box[2], 6.7);                                   // murf
    at(p[3], 7.2); at(wl[3], 7.2);                    // voice back
    at(p[1], 7.6); at(wl[1], 7.6);                    // hear it
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

  /* ---------------------------------------------------------------- camera transitions + shared-element morphs */
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CAM = !EXPORT && !PRESENTER && !REDUCED;
  const world = document.getElementById("world");
  const EASE = "cubic-bezier(.65,0,.35,1)";
  const D = 850, DJ = 420, SETTLE = 0.55;   // ms for a step, ms for a jump, fraction of the move before the new slide's own animations start
  let morphLayer = null;
  if (CAM) { root.classList.add("cam"); morphLayer = document.createElement("div"); morphLayer.id = "morph"; deckEl.appendChild(morphLayer); }
  let fx = null;                             // the in-flight transition
  const worldX = (i) => `translate(${-i * 60}px, ${(i % 2 ? -1 : 1) * 14}px)`;

  // forward-only pairs [from slide class, to slide class, source, target]; the brand mark also rides across every step
  const demoPhone = (sl) => (sl.classList.contains("has-video") ? sl.querySelector(".live .phone") : sl.querySelectorAll(".board .col .phone")[2]);
  const MORPHS = [
    ["s-hook", "s-legwork", ".orb", ".topbar .brand .mark"],
    ["s-legwork", "s-demo", ".decision", demoPhone],
    ["s-arch", "s-byo", (sl) => sl.querySelectorAll(".arch .box")[4], ".byo-card.c1"],
  ];
  const pick = (sl, q) => (typeof q === "function" ? q(sl) : sl.querySelector(q));

  function deckBox(el) {
    const d = deckEl.getBoundingClientRect(), k = d.width / 1920 || 1, r = el.getBoundingClientRect();
    return { x: (r.left - d.left) / k, y: (r.top - d.top) / k, w: r.width / k, h: r.height / k };
  }
  function ghost(el, slide) {
    const wrap = document.createElement("div");
    wrap.className = "ghost-wrap " + [...slide.classList].filter((c) => /^s-/.test(c) || c === "has-video").join(" ");
    const c = el.cloneNode(true);
    c.removeAttribute("id"); c.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    c.classList.remove("seq", "landed");
    const w = el.offsetWidth || 1, h = el.offsetHeight || 1, wv = getComputedStyle(el).getPropertyValue("--w");
    Object.assign(c.style, { position: "absolute", left: "0", top: "0", right: "auto", bottom: "auto", margin: "0", width: `${w}px`, height: `${h}px`,
      translate: "none", scale: "none", rotate: "none", visibility: "visible", opacity: "1" });
    if (wv) c.style.setProperty("--w", wv);
    wrap.appendChild(c); morphLayer.appendChild(wrap);
    return { wrap, c, w, h };
  }
  const place = (g, b) => `translate(${b.x}px, ${b.y}px) scale(${b.w / g.w}, ${b.h / g.h})`;

  function settle() {                         // jump whatever is in flight to its end state, instantly
    if (!fx) return;
    const f = fx; fx = null;
    clearTimeout(f.timer);
    f.anims.forEach((a) => a.cancel());
    f.ghosts.forEach((g) => g.wrap.remove());
    f.hidden.forEach(([el, v]) => (el.style.visibility = v));
    [f.from, f.to].forEach((sl) => { sl.classList.remove("leaving", "moving"); sl.style.zIndex = ""; });
    const e = f.enter; f.enter = null; e && e();
  }

  function transition(from, to, dir, jump, enter) {
    const fi = slides.indexOf(from), ti = slides.indexOf(to);
    const f = { anims: [], ghosts: [], hidden: [], from, to, timer: 0, enter };
    // morph pairs, measured with both slides at rest (the new slide hasn't started its own animations yet)
    const pairs = [];
    if (!jump) {
      const bA = from.querySelector(".topbar .brand"), bB = to.querySelector(".topbar .brand");
      if (bA && bB) pairs.push([bA, bB, false]);
      if (dir > 0) for (const [a, b, qa, qb] of MORPHS) {
        if (!from.classList.contains(a) || !to.classList.contains(b)) continue;
        const ea = pick(from, qa), eb = pick(to, qb);
        if (ea && eb && ea.offsetWidth && eb.offsetWidth) pairs.push([ea, eb, true]);
      }
    }
    const measured = pairs.map(([a, b, land]) => ({ a, b, land, ra: deckBox(a), rb: deckBox(b) }));

    from.classList.add("leaving", "moving"); to.classList.add("moving");
    from.style.zIndex = "1"; to.style.zIndex = "2";
    const dur = jump ? DJ : D, opt = { duration: dur, easing: EASE };
    if (jump) {
      f.anims.push(from.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(1.06)" }], opt));
      f.anims.push(to.animate([{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], opt));
    } else {
      f.anims.push(from.animate([
        { opacity: 1, transform: "none", filter: "blur(0px)" },
        { opacity: 0, transform: `translateX(${-dir * 22}%) scale(.9)`, filter: "blur(8px)" }], opt));
      f.anims.push(to.animate([
        { opacity: 0, transform: `translateX(${dir * 26}%) scale(1.08)`, filter: "blur(8px)" },
        { opacity: 1, offset: 0.6 },
        { opacity: 1, transform: "none", filter: "blur(0px)" }], opt));
    }
    if (world) {
      const was = getComputedStyle(world).transform;
      world.style.transform = worldX(ti);
      f.anims.push(world.animate([{ transform: was === "none" ? worldX(fi) : was }, { transform: worldX(ti) }], opt));
    }
    for (const m of measured) {
      const ga = ghost(m.a, from), gb = ghost(m.b, to);
      f.ghosts.push(ga, gb);
      f.hidden.push([m.a, m.a.style.visibility], [m.b, m.b.style.visibility]);
      m.a.style.visibility = "hidden"; m.b.style.visibility = "hidden";
      if (m.land) m.b.classList.add("landed");
      const path = (g) => [{ transform: place(g, m.ra) }, { transform: place(g, m.rb) }];
      f.anims.push(ga.c.animate(path(ga), opt), gb.c.animate(path(gb), opt));
      f.anims.push(ga.c.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], opt));
      f.anims.push(gb.c.animate([{ opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1, offset: 0.65 }, { opacity: 1 }], opt));
    }
    f.timer = setTimeout(() => { const e = f.enter; f.enter = null; e && e(); }, dur * SETTLE);
    f.anims[0].finished.then(() => { if (fx === f) settle(); }, () => {});
    fx = f;
  }

  /* ---------------------------------------------------------------- navigation */
  function go(i, opts = {}) {
    i = clamp(i);
    settle();
    if (i === cur && !opts.force) return;
    const from = slides[cur];
    const to = slides[i];
    const moving = CAM && !opts.instant && !!from && from !== to;
    if (from === hook && to !== hook) intro && intro.leave();
    if (from === demo && to !== demo) { leaveDemo(); resetTour(); }
    if (from === always && to !== always) resetAlways();
    to.querySelectorAll(".landed").forEach((el) => el.classList.remove("landed"));
    if (moving) to.classList.remove("play");

    if (opts.instant || EXPORT) {
      slides.forEach((s) => (s.style.transition = "none"));
      slides.forEach((s, k) => s.classList.toggle("active", k === i));
      void deckEl.offsetWidth;
      slides.forEach((s) => (s.style.transition = ""));
    } else {
      slides.forEach((s, k) => s.classList.toggle("active", k === i));
    }
    const dir = i > cur ? 1 : -1, jump = Math.abs(i - cur) > 1;
    cur = i;
    if (world && !moving) world.style.transform = worldX(i);

    const enter = () => {
      if (slides[cur] !== to) return;
      if (to === hook) intro && intro.enter();
      else if (!EXPORT) { to.classList.remove("play"); void to.offsetWidth; to.classList.add("play"); if (to.classList.contains("s-legwork")) countUp(to); if (to.classList.contains("s-arch")) archSeq(to); }
      if (to === demo) { enterDemo(); startTour(); }
      if (to === always) startAlways();
    };
    if (moving) transition(from, to, dir, jump, enter); else enter();
    if (!EXPORT && !PRESENTER && location.hash !== `#${i + 1}`) history.replaceState(null, "", `#${i + 1}`);
    renderChrome();
    sync();
  }

  function next() {
    if (!t0) startClock();
    if (slides[cur] === demo && touring()) { endTour(); return; } // first click skips the tour to the overview
    if (slides[cur] === always && aTouring()) { endAlways(); return; }
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