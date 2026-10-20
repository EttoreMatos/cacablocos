// lobby.js — arena viva no fundo do menu: dois blocos caçam bolas sozinhos.
(() => {
  "use strict";
  const canvas = document.getElementById("lobby-bg");
  if (!canvas) return;
  const g = canvas.getContext("2d", { alpha: false });
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.25 : 1;
  const COLORS = ["#38f58a", "#38f58a", "#38f58a", "#ff316f", "#c869ff", "#49f4ff"];
  const rnd = (a, b) => Math.random() * (b - a) + a;
  let W = 0, H = 0, D = 1, last = 0;

  const spawn = () => ({ x: rnd(.05, .95) * W, y: rnd(.1, .9) * H, c: COLORS[(Math.random() * COLORS.length) | 0], t: rnd(0, 6) });
  const players = [
    { c: "#20b8ff", v: 250, x: 0, y: 0, trail: [] },
    { c: "#ffe04d", v: 215, x: 0, y: 0, trail: [] },
  ];
  const orbs = [];
  const rings = [];
  const drifters = Array.from({ length: 18 }, () => ({
    x: Math.random(), y: Math.random(), s: rnd(18, 70), v: rnd(5, 18), r: rnd(0, 6.28), w: rnd(-.25, .25),
    c: ["#20b8ff", "#ffe04d", "#c869ff", "#49f4ff"][(Math.random() * 4) | 0],
  }));

  function fit() {
    D = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * D);
    canvas.height = Math.round(H * D);
    if (!orbs.length) {
      for (let i = 0; i < 7; i += 1) orbs.push(spawn());
      players[0].x = W * .12; players[0].y = H * .72;
      players[1].x = W * .88; players[1].y = H * .26;
    }
  }

  function frame(ms) {
    requestAnimationFrame(frame);
    if (document.body.classList.contains("is-playing")) { last = ms; return; }
    const dt = Math.min((ms - last) / 1000, .05) * calm;
    last = ms;
    g.setTransform(D, 0, 0, D, 0, 0);
    g.fillStyle = "#05070d";
    g.fillRect(0, 0, W, H);

    const glow = g.createRadialGradient(W * .22, H * .2, 0, W * .22, H * .2, Math.max(W, H) * .7);
    glow.addColorStop(0, "rgba(32,120,255,.20)");
    glow.addColorStop(1, "rgba(32,120,255,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    const glow2 = g.createRadialGradient(W * .85, H * .9, 0, W * .85, H * .9, Math.max(W, H) * .6);
    glow2.addColorStop(0, "rgba(160,70,255,.17)");
    glow2.addColorStop(1, "rgba(160,70,255,0)");
    g.fillStyle = glow2;
    g.fillRect(0, 0, W, H);

    const off = (ms / 1000 * 10 * calm) % 64;
    g.strokeStyle = "rgba(95,166,255,.07)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = -off; x < W; x += 64) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = -off; y < H; y += 64) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();

    for (const d of drifters) {
      d.y -= (d.v * dt) / H;
      d.r += d.w * dt;
      if (d.y < -.1) { d.y = 1.1; d.x = Math.random(); }
      g.save();
      g.translate(d.x * W, d.y * H);
      g.rotate(d.r);
      g.globalAlpha = .17;
      g.strokeStyle = d.c;
      g.lineWidth = 2;
      g.strokeRect(-d.s / 2, -d.s / 2, d.s, d.s);
      g.restore();
    }

    for (const p of players) {
      let target = orbs[0], best = Infinity;
      for (const o of orbs) {
        const dist = Math.hypot(o.x - p.x, o.y - p.y);
        if (dist < best) { best = dist; target = o; }
      }
      if (best < 20) {
        rings.push({ x: target.x, y: target.y, c: target.c, r: 8, a: 1 });
        Object.assign(target, spawn());
      } else {
        p.x += ((target.x - p.x) / best) * p.v * dt;
        p.y += ((target.y - p.y) / best) * p.v * dt;
      }
      p.trail.push([p.x, p.y]);
      if (p.trail.length > 16) p.trail.shift();
    }

    for (const o of orbs) {
      o.t += dt * 2;
      g.save();
      g.shadowColor = o.c;
      g.shadowBlur = 18;
      g.fillStyle = o.c;
      g.beginPath();
      g.arc(o.x, o.y, 7 + Math.sin(o.t) * 1.2, 0, 6.2832);
      g.fill();
      g.restore();
    }

    for (const p of players) {
      p.trail.forEach(([x, y], i) => {
        g.globalAlpha = (i / p.trail.length) * .22;
        g.fillStyle = p.c;
        g.fillRect(x - 10, y - 10, 20, 20);
      });
      g.globalAlpha = 1;
      g.save();
      g.shadowColor = p.c;
      g.shadowBlur = 26;
      g.fillStyle = p.c;
      g.fillRect(p.x - 12, p.y - 12, 24, 24);
      g.restore();
    }

    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const r = rings[i];
      r.r += 190 * dt;
      r.a -= 1.9 * dt;
      if (r.a <= 0) { rings.splice(i, 1); continue; }
      g.globalAlpha = r.a;
      g.strokeStyle = r.c;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(r.x, r.y, r.r, 0, 6.2832);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  fit();
  window.addEventListener("resize", fit);
  requestAnimationFrame(frame);
})();

// Manual "Como jogar?"
(() => {
  "use strict";
  const modal = document.getElementById("howto");
  const openBtn = document.getElementById("howto-open");
  const closeBtn = document.getElementById("howto-close");
  const body = document.getElementById("howto-body");
  if (!modal || !openBtn || !closeBtn) return;
  let from = null;
  let timer = 0;

  const onKey = (event) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") {
      event.preventDefault();
      (document.activeElement === closeBtn ? body : closeBtn).focus();
    }
  };
  function open() {
    clearTimeout(timer);
    from = document.activeElement;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    closeBtn.focus();
    document.addEventListener("keydown", onKey, true);
  }
  function close() {
    document.removeEventListener("keydown", onKey, true);
    modal.classList.remove("is-open");
    timer = setTimeout(() => { modal.hidden = true; from?.focus?.(); }, 230);
  }
  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
})();