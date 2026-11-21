/* Slide 1 intro: glitching wordmark, typed tagline, and a rotating sphere of agent nodes around the mic orb.
   Back half of the sphere draws behind the orb, front half in front. ?export and reduced motion get a still frame.
   API: window.xerxesIntro = { enter(), leave(), ready } (called by deck.js). */
(() => {
  "use strict";
  const slide = document.querySelector(".s-hook");
  const box = document.getElementById("intro-agent");
  if (!slide || !box) return;
  const STILL = new URLSearchParams(location.search).has("export") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const back = box.querySelector("canvas.back"), front = box.querySelector("canvas.front");
  const labels = box.querySelector(".labels"), statusTxt = box.querySelector(".status .txt");
  const segs = [...box.querySelectorAll(".status .segs i")];
  const S = 900, C = S / 2, R = 340, CLEAR = 175;

  const STEPS = [
    { name: "Initiate", tools: ["get_context"], note: "Birthday in 11 days" },
    { name: "Discover", tools: ["search_books", "web_search", "read_page"] },
    { name: "Recommend", tools: ["check_offers", "show_recommendation"] },
    { name: "Execute", tools: ["save_to_plan"] },
    { name: "Follow up", tools: ["create_watch"], note: "Back to you with a pick" },
  ];

  /* ---- typed tagline: per-character spans so nothing reflows */
  const type = document.getElementById("intro-type");
  const chars = [];
  (function split(el) {
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) {
        const f = document.createDocumentFragment();
        for (const ch of n.nodeValue) { const s = document.createElement("span"); s.className = "c"; s.textContent = ch; f.append(s); chars.push(s); }
        n.replaceWith(f);
      } else if (n.nodeType === 1 && n.tagName !== "BR") split(n);
    }
  })(type);

  /* ---- Fibonacci sphere + 3 nearest neighbours */
  // two shells: an outer one and an inner one spinning the other way, plus links between them
  const SHELLS = [{ n: 170, r: 1, spin: 1 }, { n: 84, r: 0.64, spin: -1.7 }];
  const nodes = [];
  SHELLS.forEach((sh, si) => {
    for (let i = 0; i < sh.n; i++) {
      const y = 1 - (i / (sh.n - 1)) * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i;
      nodes.push({ x: Math.cos(th) * r * sh.r, y: y * sh.r, z: Math.sin(th) * r * sh.r, hub: i % 11 === 0, shell: si, spin: sh.spin });
    }
  });
  const N = nodes.length;
  const edges = [], seen = new Set();
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
  const link = (i, j) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (!seen.has(k)) { seen.add(k); edges.push([i, j]); } };
  nodes.forEach((a, i) => {
    nodes.map((b, j) => [j, d2(a, b)]).filter(([j]) => j !== i && nodes[j].shell === a.shell)
      .sort((p, q) => p[1] - q[1]).slice(0, a.shell ? 3 : 4).forEach(([j]) => link(i, j));
  });  const pulses = Array.from({ length: 26 }, (_, k) => ({ e: (k * 37) % edges.length, t: (k * 0.29) % 1 }));
  const rings = [{ tilt: 1.15, rot: 0.3, r: 1.22 }, { tilt: 1.35, rot: -0.9, r: 1.12 }, { tilt: 0.5, rot: 1.9, r: 1.3 }];

  let ctxB, ctxF, angle = 0.6, raf = 0, last = 0, t0 = 0, step = -1, beams = [], running = false;
  function size() {
    const scale = (document.getElementById("deck").getBoundingClientRect().width / 1920) || 1;
    const k = Math.min(3, (devicePixelRatio || 1) * scale);
    for (const c of [back, front]) { c.width = S * k; c.height = S * k; c.getContext("2d").setTransform(k, 0, 0, k, 0, 0); }
    ctxB = back.getContext("2d"); ctxF = front.getContext("2d");
  }
  const TILT = 0.42;
  function project(p) {
    const ca = Math.cos(angle * (p.spin || 1)), sa = Math.sin(angle * (p.spin || 1));
    let x = p.x * ca + p.z * sa, z = -p.x * sa + p.z * ca, y = p.y;
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    const y2 = y * ct - z * st; z = y * st + z * ct;
    const f = 1 / (1 - z * 0.28);
    return { x: C + x * R * f, y: C + y2 * R * f, z, f };
  }
  const clearZone = (p) => Math.hypot(p.x - C, p.y - C) < CLEAR && p.z > -0.2;

  function draw(now) {
    for (const g of [ctxB, ctxF]) g.clearRect(0, 0, S, S);
    const P = nodes.map(project);
    // orbit rings (split front/back)
    for (const ring of rings) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 90) {
        const pt = (u) => { let x = Math.cos(u) * ring.r, y = 0, z = Math.sin(u) * ring.r;
          const c = Math.cos(ring.tilt), s = Math.sin(ring.tilt); [y, z] = [y * c - z * s, y * s + z * c];
          const c2 = Math.cos(ring.rot), s2 = Math.sin(ring.rot); [x, y] = [x * c2 - y * s2, x * s2 + y * c2];
          return project({ x, y, z }); };
        if (Math.floor(a / (Math.PI / 90)) % 3 === 2) continue; // dashes
        const p1 = pt(a), p2 = pt(a + Math.PI / 90), g = p1.z > 0 ? ctxF : ctxB;
        g.strokeStyle = p1.z > 0 ? "rgba(16,24,40,.22)" : "rgba(155,186,243,.45)"; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
      }
    }
    // edges
    for (const [i, j] of edges) {
      const a = P[i], b = P[j], fr = a.z + b.z > 0, g = fr ? ctxF : ctxB;
      if (fr && (clearZone(a) || clearZone(b))) continue;
      g.strokeStyle = fr ? "rgba(16,24,40,.16)" : "rgba(155,186,243,.38)"; g.lineWidth = fr ? 1.3 : 1;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    // spokes: every 6th inner node reaches out to its nearest outer node (shells turn, so pick it live)
    for (let i = SHELLS[0].n; i < N; i += 6) {
      const a = P[i]; let best = -1, bd = 1e9;
      for (let j = 0; j < SHELLS[0].n; j += 2) { const b = P[j], d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z - b.z) * R) ** 2; if (d < bd) { bd = d; best = j; } }
      const b = P[best], fr = a.z + b.z > 0, g = fr ? ctxF : ctxB;
      if (fr && (clearZone(a) || clearZone(b))) continue;
      g.strokeStyle = fr ? "rgba(17,156,112,.28)" : "rgba(17,156,112,.14)"; g.lineWidth = 1;
      g.setLineDash([3, 5]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    }
    // pulses travelling along edges
    for (const p of pulses) {
      const [i, j] = edges[p.e], a = P[i], b = P[j];
      const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t, z = a.z + (b.z - a.z) * p.t;
      if (z > 0 && Math.hypot(x - C, y - C) < CLEAR) continue;
      const g = z > 0 ? ctxF : ctxB;
      g.fillStyle = z > 0 ? "#E08B4F" : "rgba(224,139,79,.4)"; g.beginPath(); g.arc(x, y, z > 0 ? 4.5 : 3, 0, 7); g.fill();
    }
    // beams from the orb to the current step's nodes
    for (const bm of beams) {
      const p = P[bm.n], k = Math.min(1, (now - bm.at) / 450);
      ctxF.strokeStyle = `rgba(17,156,112,${0.75 * (1 - Math.max(0, (now - bm.at - 1400) / 900))})`; ctxF.lineWidth = 2.5;
      const sx = C + (p.x - C) * (CLEAR - 20) / Math.hypot(p.x - C, p.y - C), sy = C + (p.y - C) * (CLEAR - 20) / Math.hypot(p.x - C, p.y - C);
      ctxF.beginPath(); ctxF.moveTo(sx, sy); ctxF.lineTo(sx + (p.x - sx) * k, sy + (p.y - sy) * k); ctxF.stroke();
    }
    // nodes
    P.forEach((p, i) => {
      if (p.z > 0 && clearZone(p)) return;
      const g = p.z > 0 ? ctxF : ctxB, hub = nodes[i].hub, lit = beams.some((b) => b.n === i);
      g.fillStyle = p.z > 0 ? (hub || lit ? "#119C70" : "#101828") : "rgba(155,186,243,.75)";
      const r = (hub || lit ? 6.5 : nodes[i].shell ? 2.6 : 3.2) * p.f;
      if ((hub || lit) && p.z > 0) { g.fillStyle = "rgba(17,156,112,.18)"; g.beginPath(); g.arc(p.x, p.y, r * 2.4, 0, 7); g.fill(); g.fillStyle = "#119C70"; }
      g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
    });
    return P;
  }

  /* ---- agent loop: pick front-facing nodes, beam to them, flicker labels in */
  function pickNodes(P, n) {
    return P.map((p, i) => [i, p]).filter(([, p]) => p.z > 0.25 && Math.hypot(p.x - C, p.y - C) > 230 && p.y < S - 150 && p.y > 70 && p.x > 90 && p.x < S - 90)
      .sort((a, b) => a[1].x - b[1].x).filter((_, k, arr) => k % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n).map(([i]) => i);
  }
  function showStep(k, P, now) {
    step = k;
    const s = STEPS[k], items = [...s.tools.map((t) => ({ t, note: false })), ...(s.note ? [{ t: s.note, note: true }] : [])];
    const ids = pickNodes(P, items.length);
    beams = ids.map((n) => ({ n, at: now }));
    labels.innerHTML = "";
    items.forEach((it, m) => {
      const p = P[ids[m]]; if (!p) return;
      const el = document.createElement("span");
      el.className = `lbl${it.note ? " note" : ""}`;
      el.textContent = it.t;
      el.style.left = `${Math.max(120, Math.min(S - 120, p.x))}px`; el.style.top = `${p.y - 30}px`;
      el.style.animationDelay = `${m * 0.18}s`;
      labels.append(el);
    });
    statusTxt.textContent = `${String(k + 1).padStart(2, "0")}/05 · ${s.name} · running`;
    segs.forEach((g, i) => g.classList.toggle("on", i <= k));
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    angle += dt * 0.16;
    for (const p of pulses) { p.t += dt * 0.55; if (p.t >= 1) { p.t = 0; p.e = (p.e * 7 + 13) % edges.length; } }
    const P = draw(now);
    const el = (now - t0) / 1000;
    // tagline typing between 1.0 s and ~2.9 s
    const shown = Math.floor(Math.max(0, el - 1.5) / 0.055);
    chars.forEach((c, i) => { c.classList.toggle("on", i < shown); c.classList.toggle("caret", i === Math.min(shown, chars.length) - 1 && el < 4.2); });
    // agent loop from 1.6 s, 2.8 s per step
    const k = el < 1.6 ? -1 : Math.floor((el - 1.6) / 2.8) % STEPS.length;
    if (k !== step && k >= 0) showStep(k, P, now);
    raf = requestAnimationFrame(frame);
  }

  function still() {
    size(); angle = 0.6; beams = []; step = -1;
    const P = draw(0);
    chars.forEach((c) => { c.classList.add("on"); c.classList.remove("caret"); });
    // one label per step, spread over the front
    const ids = pickNodes(P, 5);
    labels.innerHTML = "";
    STEPS.forEach((s, m) => {
      const p = P[ids[m]]; if (!p) return;
      const el = document.createElement("span");
      el.className = "lbl"; el.textContent = s.tools[0];
      el.style.left = `${Math.max(120, Math.min(S - 120, p.x))}px`; el.style.top = `${p.y - 30}px`;
      labels.append(el);
    });
    statusTxt.textContent = "Agent loop · 5 steps";
    segs.forEach((g) => g.classList.add("on"));
  }

  function enter() {
    if (STILL) { still(); return; }
    leave();
    size();
    slide.classList.remove("play"); void slide.offsetWidth; slide.classList.add("play");
    labels.innerHTML = ""; beams = []; step = -1;
    segs.forEach((g) => g.classList.remove("on"));
    statusTxt.textContent = "Agent loop · starting";
    chars.forEach((c) => c.classList.remove("on", "caret"));
    running = true; last = t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function leave() { running = false; cancelAnimationFrame(raf); }

  addEventListener("resize", () => { if (running) size(); });
  const ready = document.fonts.ready.then(() => { if (STILL) still(); });
  window.xerxesIntro = { enter, leave, ready, replay: enter };
})();
