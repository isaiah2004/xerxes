/* Xerxes pitch deck runtime: scaling, navigation, the intro animation, the demo clip, notes and a presenter window.
   No dependencies; works from file://.
   Keys: → / Space / PageDown next · ← / PageUp back · Home / End · 1–9 jump · F full screen · N notes
         P presenter window · T restart the clock · R replay the intro · V play/pause the demo clip
   URL:  #3 opens slide 3 · ?export = static final states for PDF/PNG export · ?presenter = speaker view
   Slides: 1 intro · 2 problem · 3 "Xerxes is different" (5-step tour) · 4 demo clip · 5 bring your own · 6 thank you · 7 appendix */
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
  const problem = deckEl.querySelector(".s-problem");   // two stages: the page, then (next click) the Q&A and everything after
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

  /* ---------------------------------------------------------------- slide 4: the recorded call */
  function updateRail() {
    const t = video ? video.currentTime : 0;
    rails.forEach((r) => r.classList.toggle("on", t >= Number(r.dataset.at || 0)));
  }

  function enterDemo() {
    // a tab opened before demo.mp4 existed (or a failed read) has given up on the file: ask again on entering slide 3
    if (!hasVideo && video && !EXPORT && (video.error || video.networkState === 3)) video.load();
    if (!hasVideo || EXPORT) return;
    video.pause();
    video.currentTime = 0;
    video.muted = false; demo.classList.remove("muted", "blocked");
    updateRail();
    clearTimeout(videoTimer);
    videoTimer = setTimeout(playVideo, 450);
  }
  // Chrome blocks autoplay with sound when the page has had no click/key yet (e.g. opened straight at #4):
  // fall back to muted playback and show a "tap for sound" badge; a tap on the clip unmutes it.
  function playVideo() {
    if (!video || slides[cur] !== demo) return;
    video.play().then(() => { demo.classList.remove("blocked"); demo.classList.toggle("muted", video.muted); }).catch((e) => {
      if (e && e.name === "NotAllowedError" && !video.muted) {
        video.muted = true; demo.classList.add("muted");
        video.play().catch(() => demo.classList.add("blocked"));
      } else demo.classList.add("blocked");
    });
  }

  function leaveDemo() {
    clearTimeout(videoTimer);
    if (video && !video.paused) video.pause();
  }

  function toggleVideo() {
    if (!hasVideo || slides[cur] !== demo) return;
    if (video.muted) { video.muted = false; demo.classList.remove("muted"); if (video.paused) playVideo(); return; }
    if (video.paused) playVideo(); else video.pause();
  }

  /* ---------------------------------------------------------------- tours: zoom into one child at a time, then the overview */
  // Zoom a tour container so one child fills the frame: measured from layout offsets (immune to running transforms),
  // centred, and clamped so the focused content stays clear of the top edge and the countdown at the bottom.
  function localBox(el, container) {
    let x = 0, y = 0, n = el;
    while (n && n !== container) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function contentBox(el, container) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    [...el.querySelectorAll("*")].forEach((n) => {
      if (!(n instanceof HTMLElement) || !n.offsetWidth) return;
      const b = localBox(n, container);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const ZTOP = 24, ZBOTTOM = 1080 - 100, ZMAX = 2;
  function zoomTo(container, el) {
    const b = contentBox(el, container), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const s = Math.min(ZMAX, (ZBOTTOM - ZTOP) / b.h, 1840 / b.w);
    container.style.transformOrigin = `${cx}px ${cy}px`;
    container.style.transform = `translate(${960 - (container.offsetLeft + cx)}px, ${(ZTOP + ZBOTTOM) / 2 - (container.offsetTop + cy)}px) scale(${s.toFixed(3)})`;
  }

  // Countdown: one segment per step; the current one fills over the time left before the tour moves on.
  function makeTicker(slide, n) {
    if (!slide) return null;
    const el = document.createElement("div");
    el.className = "ticker";
    el.innerHTML = Array.from({ length: n }, () => "<i><b></b></i>").join("");
    slide.appendChild(el);
    const segs = [...el.children];
    return {
      step(k, secs) {
        segs.forEach((g, i) => { g.className = i < k ? "done" : ""; g.firstChild.style.animation = "none"; });
        void el.offsetWidth;
        segs[k].className = "now";
        segs[k].firstChild.style.animation = `tick ${secs}s linear both`;
      },
      hold(k) { segs.forEach((g, i) => { g.className = i < k ? "done" : i === k ? "now held" : ""; g.firstChild.style.animation = "none"; }); },
      reset() { segs.forEach((g) => { g.className = ""; g.firstChild.style.animation = "none"; }); },
    };
  }

  /* ---------------------------------------------------------------- slide 3: "Xerxes is different", five steps, then the overview */
  const diff = document.querySelector(".slide.s-diff");
  const five = diff && diff.querySelector(".five");
  const units = five ? [...five.querySelectorAll(".unit")] : [];
  const D0 = 0.5, DSTEPS = [9.5, 6.5, 6.5, 6.5, 6.5]; // seconds: the title alone, then each step (voice holds longer: its input chips land last); overview after the last (36 s)
  const dAt = (k) => D0 + DSTEPS.slice(0, k).reduce((a, b) => a + b, 0);
  let dTimers = [];
  const diffTicker = units.length ? makeTicker(diff, units.length) : null;
  // tour layout: the focused unit's UI fills almost the whole slide height in the left half; its bubbles sit beside the
  // screen's right edge (toward the centre) and the step header + caption chips are tucked under them, level with the screen's foot
  const BIG = 1.9, BX = 262, BY = 72, VIST = 88, VISW = 324, VISH = 500; // .vis sits 88px down the unit (unit-local px)
  const bubblesOf = (u) => [...u.querySelectorAll(".vis .fl, .vis .fl2, .vis .ins")];
  const textOf = (u) => [u.querySelector(".uh"), ...bubblesOf(u), u.querySelector(".uc")].filter(Boolean);
  units.forEach((u) => textOf(u).forEach((el) => { el.dataset.top0 = el.style.top; }));
  let dPaused = false, dStep = -1;
  // transform that puts the unit's .vis at (BX, BY) at BIG scale; k < 1 shrinks it about the screen's centre (for the fade-in)
  function bigT(u, k) {
    const s = 0.94, S = BIG * k, fl = five.offsetLeft, ft = five.offsetTop;
    const X0 = BX + (BIG - S) * VISW / 2, Y0 = BY + BIG * VISH / 2 - S * (VIST + VISH / 2);
    return `translate(${((X0 - fl) / s - u.offsetLeft).toFixed(1)}px, ${((Y0 - ft) / s).toFixed(1)}px) scale(${(S / s).toFixed(3)})`;
  }
  function bigUnit(u, fade) {
    u.classList.add("big");
    const put = (el, y) => el.style.setProperty("top", (el.closest(".vis") ? y : y + VIST) + "px", "important");
    const gap = 16, bub = bubblesOf(u), foot = [u.querySelector(".uh"), u.querySelector(".uc")].filter(Boolean);
    let y = 20;
    bub.forEach((el) => { put(el, y); y += el.offsetHeight + gap; });
    const fh = foot.reduce((a, el) => a + el.offsetHeight, 0) + 12;
    let fy = bub.length ? Math.max(y + 14, VISH - 6 - fh) : (VISH - fh) / 2;
    foot.forEach((el) => { put(el, fy); fy += el.offsetHeight + 12; });
    if (fade) {   // cross-fade: appear in place, growing slightly, instead of panning across from the overview slot
      u.style.transition = "none"; u.style.transform = bigT(u, 0.95); void u.offsetWidth;
      u.style.transition = "opacity .55s ease, filter .55s ease, transform .7s cubic-bezier(.2,.8,.2,1)";
    }
    u.style.transform = bigT(u, 1);
  }
  function smallUnit(u) {
    u.classList.remove("big");
    u.style.transform = ""; u.style.transition = "";
    textOf(u).forEach((el) => { el.style.removeProperty("top"); if (el.dataset.top0) el.style.top = el.dataset.top0; });
  }
  function focusUnit(k) {
    const fade = units.some((u) => u.classList.contains("big"));
    diff.classList.add("touring");
    units.forEach((u, i) => {
      if (i !== k && u.classList.contains("big")) { u.classList.remove("on"); const t = setTimeout(() => { if (!u.classList.contains("on")) smallUnit(u); }, 600); dTimers.push(t); }
    });
    if (units[k].classList.contains("big")) smallUnit(units[k]);
    bigUnit(units[k], fade);
    units.forEach((u, i) => u.classList.toggle("on", i === k));
    dStep = k;
    if (diffTicker) dPaused ? diffTicker.hold(k) : diffTicker.step(k, DSTEPS[k] || DSTEPS[DSTEPS.length - 1]);
  }
  // auto-advance from step k onward, the first change after `lead` seconds
  function scheduleDiff(k, lead) {
    dTimers.forEach(clearTimeout); dTimers = [];
    let t = lead;
    for (let j = k; j < units.length; j++) { const jj = j; dTimers.push(setTimeout(() => focusUnit(jj), t * 1000)); t += DSTEPS[j]; }
    dTimers.push(setTimeout(endDiff, t * 1000));
  }
  function resetDiff() {
    dTimers.forEach(clearTimeout); dTimers = [];
    dPaused = false; dStep = -1;
    if (!diff) return;
    diff.classList.remove("touring", "overview", "paused");
    units.forEach((u) => { u.classList.remove("on"); smallUnit(u); });
    diffTicker && diffTicker.reset();
  }
  function endDiff() {
    resetDiff();
    if (!diff) return;
    void diff.offsetWidth; diff.classList.add("overview");
  }
  function startDiff() {
    if (!units.length || EXPORT) return;
    resetDiff();
    scheduleDiff(0, D0);
  }
  // pause (K or the button by the countdown): stop the timer; clicks / → then step through, the last one opens the overview
  function togglePause() {
    if (slides[cur] !== diff || diff.classList.contains("overview") || EXPORT) return;
    if (!dPaused) {
      dPaused = true; diff.classList.add("paused");
      dTimers.forEach(clearTimeout); dTimers = [];
      units.forEach((u, i) => { if (i !== dStep && u.classList.contains("big")) smallUnit(u); });
      if (dStep < 0) focusUnit(0); else diffTicker && diffTicker.hold(dStep);
    } else {
      dPaused = false; diff.classList.remove("paused");
      const k = Math.max(dStep, 0);
      diffTicker && diffTicker.step(k, DSTEPS[k]);
      scheduleDiff(k + 1, DSTEPS[k]);
    }
  }
  function diffStepping() { return slides[cur] === diff && dPaused && diff.classList.contains("touring"); }
  if (diff && units.length && !EXPORT) {
    const pb = document.createElement("button");
    pb.className = "tour-pause"; pb.type = "button"; pb.title = "Pause the tour: click to step (K)";
    pb.innerHTML = '<svg viewBox="0 0 24 24" class="ic-pause"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg><svg viewBox="0 0 24 24" class="ic-play"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
    ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach((ev) => pb.addEventListener(ev, (e) => e.stopPropagation()));
    pb.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); togglePause(); pb.blur(); });
    diff.appendChild(pb);
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
  const MORPHS = [
    ["s-hook", "s-problem", ".orb", ".topbar .brand .mark"],
    ["s-diff", "s-demo", ".u1 .vphone", ".live .phone"],            // from the overview, step 1's voice phone (same call screen) grows into the demo phone
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
    if (from === demo && to !== demo) leaveDemo();
    if (from === diff && to !== diff) resetDiff();
    if (to === problem) problem.classList.remove("stage2");
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
      else if (!EXPORT) { to.classList.remove("play"); void to.offsetWidth; to.classList.add("play"); }
      if (to === demo) enterDemo();
      if (to === diff) startDiff();
    };
    if (moving) transition(from, to, dir, jump, enter); else enter();
    if (!EXPORT && !PRESENTER && location.hash !== `#${i + 1}`) history.replaceState(null, "", `#${i + 1}`);
    renderChrome();
    sync();
  }

  function next() {
    if (!t0) startClock();
    if (diffStepping()) { if (dStep < units.length - 1) focusUnit(dStep + 1); else endDiff(); return; } // paused tour: one step per click
    if (slides[cur] === diff && dTimers.length) { endDiff(); return; } // first click skips the tour to the overview
    if (slides[cur] === problem && !EXPORT && !problem.classList.contains("stage2")) { settle(); problem.classList.add("stage2"); renderChrome(); sync(); return; }
    go(cur + 1);
  }
  function prev() {
    if (diffStepping() && dStep > 0) { focusUnit(dStep - 1); return; }
    if (slides[cur] === problem && problem.classList.contains("stage2")) {   // back to stage 1: replay the page on its own
      settle(); problem.classList.remove("stage2", "play"); void problem.offsetWidth; problem.classList.add("play"); renderChrome(); sync(); return;
    }
    go(cur - 1);
  }

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
    pres.postMessage({ type: "xerxes:state", cur, t0, hasVideo, stage2: !!problem && problem.classList.contains("stage2") }, "*");
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
      t0 = d.t0; hasVideo = d.hasVideo; stage2 = !!d.stage2;
      cur = clamp(d.cur);
      renderPresenter();
    }
  });

  const P = document.getElementById("presenter");
  let stage2 = false;   // presenter mirror of slide 2's stage
  function send(cmd, arg) {
    if (window.opener && !window.opener.closed) window.opener.postMessage({ type: "xerxes:cmd", cmd, arg }, "*");
  }
  function renderPresenter() {
    if (!PRESENTER || cur < 0) return;
    const m = meta(cur);
    const nx = cur + 1 < N ? meta(cur + 1) : null;
    let tip = "";
    if (slides[cur] === problem) tip += stage2 ? "<p class=\"tip\">Stage 2 of 2: Q&amp;A playing. Next click goes to slide 3.</p>" : "<p class=\"tip\">Stage 1 of 2: just the page. Click to play the Q&amp;A.</p>";
    if (slides[cur] === demo && !hasVideo) tip = "<p class=\"tip\">demo.mp4 has not loaded: the phone shows a still.</p>";
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
    else if (!PRESENTER && (k === "k" || k === "K")) togglePause();
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
    // static, final states only; no hash, no chrome. The demo slide shows a frame of the clip's answer (?export&video: its first frame, for the PPTX).
    const withVideo = demo && video;
    window.deck = {
      count: N,
      demoIndex: slides.indexOf(demo),
      go: (i) => go(i, { instant: true, force: true }),
      notes: () => slides.map((_, i) => { const m = meta(i); return { ...m, text: plain(m.html) }; }),
      videoRect: () => { const r = video.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; },
    };
    let firstFrame = Promise.resolve();
    if (withVideo) {
      firstFrame = new Promise((ok) => {
        const done = () => ok();
        video.addEventListener("loadeddata", () => { video.currentTime = qs.has("video") ? 0.5 : 31; video.addEventListener("seeked", done, { once: true }); }, { once: true });
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