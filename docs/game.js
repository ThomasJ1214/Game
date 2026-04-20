'use strict';

// ─────────────────────────────────────────────────────────────
// SHARED CONSTANTS  (must match server.js)
// ─────────────────────────────────────────────────────────────

const ARENA_W       = 800;
const ARENA_H       = 600;
const SHIP_RADIUS   = 16;
const BULLET_RADIUS = 4;
const BOOST_CD      = 3500;
const COLORS        = ['#00ffff', '#ff00ff'];
const COLORS_RGBA   = [(a) => `rgba(0,255,255,${a})`, (a) => `rgba(255,0,255,${a})`];

// ─────────────────────────────────────────────────────────────
// MODULE STATE
// ─────────────────────────────────────────────────────────────

let canvas, ctx;
let _socket, _myIndex;
let serverState   = null;
let prevState     = null;
let generation    = 0;
let helpVisible   = false;
let helpTimer     = null;
let stars         = [];
let explosions    = [];
let shockwaves    = [];
let boostTrail    = [];
let shakeAmount   = 0;
let lastInputSend = 0;

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

// ─────────────────────────────────────────────────────────────
// PUBLIC API  (called by lobby.js)
// ─────────────────────────────────────────────────────────────

function initGame(sock, initialState, yourIndex) {
  _socket     = sock;
  _myIndex    = yourIndex;
  serverState = initialState;
  prevState   = null;
  explosions  = [];
  shockwaves  = [];
  boostTrail  = [];
  shakeAmount = 0;
  generation++;
  const myGen = generation;

  keys.w = keys.a = keys.s = keys.d = keys.space = keys.shift = false;

  canvas = document.getElementById('canvas');
  ctx    = canvas.getContext('2d');

  // Three-layer star field: distant dim, mid, bright
  stars = Array.from({ length: 160 }, () => ({
    x:     Math.random() * ARENA_W,
    y:     Math.random() * ARENA_H,
    r:     Math.random() * 1.6 + 0.2,
    alpha: Math.random() * 0.5 + 0.1,
    speed: 0.3 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2
  }));

  _socket.off('game_tick');
  _socket.on('game_tick', ({ gameState }) => {
    prevState   = serverState;
    serverState = gameState;
    checkTransitions();
  });

  window.onkeydown = e => {
    if (e.code === 'KeyW'      || e.code === 'ArrowUp')    keys.w     = true;
    if (e.code === 'KeyA'      || e.code === 'ArrowLeft')  keys.a     = true;
    if (e.code === 'KeyS'      || e.code === 'ArrowDown')  keys.s     = true;
    if (e.code === 'KeyD'      || e.code === 'ArrowRight') keys.d     = true;
    if (e.code === 'Space')    { keys.space = true; if (generation === myGen) e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.key  === '?') toggleHelp();
  };
  window.onkeyup = e => {
    if (e.code === 'KeyW'      || e.code === 'ArrowUp')    keys.w     = false;
    if (e.code === 'KeyA'      || e.code === 'ArrowLeft')  keys.a     = false;
    if (e.code === 'KeyS'      || e.code === 'ArrowDown')  keys.s     = false;
    if (e.code === 'KeyD'      || e.code === 'ArrowRight') keys.d     = false;
    if (e.code === 'Space')      keys.space = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = false;
  };
  window.onblur = () => {
    keys.w = keys.a = keys.s = keys.d = keys.space = keys.shift = false;
  };

  showHelp();
  helpTimer = setTimeout(hideHelp, 3200);

  function loop() {
    if (generation !== myGen) return;
    const now = performance.now();
    if (_socket && _socket.connected && now - lastInputSend >= 33) {
      _socket.emit('player_input', { keys: { ...keys } });
      lastInputSend = now;
    }
    if (serverState) render(serverState, now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function stopGame() {
  generation++;
  keys.w = keys.a = keys.s = keys.d = keys.space = keys.shift = false;
  window.onkeydown = null;
  window.onkeyup   = null;
  window.onblur    = null;
  if (helpTimer) { clearTimeout(helpTimer); helpTimer = null; }
}

// ─────────────────────────────────────────────────────────────
// TRANSITION DETECTION
// ─────────────────────────────────────────────────────────────

function checkTransitions() {
  if (!prevState || !serverState) return;
  for (const ship of serverState.ships) {
    const prev = prevState.ships[ship.index];
    if (prev && prev.alive && !ship.alive) {
      spawnExplosion(ship.x, ship.y, COLORS[ship.index]);
      shockwaves.push({ x: ship.x, y: ship.y, r: 0, life: 1.0, color: COLORS[ship.index] });
      shakeAmount = 10;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// PARTICLES
// ─────────────────────────────────────────────────────────────

function spawnExplosion(x, y, color) {
  for (let i = 0; i < 26; i++) {
    const angle = (Math.PI * 2 * i) / 26 + (Math.random() - 0.5) * 0.5;
    const speed = 1.2 + Math.random() * 5.5;
    explosions.push({
      x, y,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      life:  1.0,
      decay: 0.018 + Math.random() * 0.016,
      color,
      r:     2 + Math.random() * 3.5
    });
  }
  // Bright central sparks
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    explosions.push({
      x, y,
      vx:    Math.cos(angle) * (6 + Math.random() * 4),
      vy:    Math.sin(angle) * (6 + Math.random() * 4),
      life:  1.0,
      decay: 0.055 + Math.random() * 0.03,
      color: '#ffffff',
      r:     1.5
    });
  }
}

function updateDrawExplosions() {
  ctx.save();
  for (let i = explosions.length - 1; i >= 0; i--) {
    const p = explosions[i];
    p.x    += p.vx;
    p.y    += p.vy;
    p.vx   *= 0.93;
    p.vy   *= 0.93;
    p.life -= p.decay;
    if (p.life <= 0) { explosions.splice(i, 1); continue; }
    ctx.globalAlpha = p.life * p.life;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function updateDrawShockwaves() {
  ctx.save();
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const w = shockwaves[i];
    w.r    += 5;
    w.life -= 0.045;
    if (w.life <= 0) { shockwaves.splice(i, 1); continue; }
    ctx.globalAlpha = w.life * 0.7;
    ctx.strokeStyle = w.color;
    ctx.shadowColor = w.color;
    ctx.shadowBlur  = 12;
    ctx.lineWidth   = 2.5 * w.life;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

function tickBoostTrail(state) {
  // Spawn trail particles behind boosting ships
  for (const ship of state.ships) {
    if (!ship.alive || !ship.boosting) continue;
    for (let i = 0; i < 3; i++) {
      boostTrail.push({
        x:     ship.x - Math.cos(ship.angle) * (SHIP_RADIUS - 2) + (Math.random() - 0.5) * 5,
        y:     ship.y - Math.sin(ship.angle) * (SHIP_RADIUS - 2) + (Math.random() - 0.5) * 5,
        vx:   -Math.cos(ship.angle) * (1.5 + Math.random() * 2),
        vy:   -Math.sin(ship.angle) * (1.5 + Math.random() * 2),
        life:  1.0,
        decay: 0.055 + Math.random() * 0.04,
        r:     2.5 + Math.random() * 2,
        color: COLORS[ship.index]
      });
    }
  }
  ctx.save();
  for (let i = boostTrail.length - 1; i >= 0; i--) {
    const p = boostTrail[i];
    p.x    += p.vx;
    p.y    += p.vy;
    p.life -= p.decay;
    if (p.life <= 0) { boostTrail.splice(i, 1); continue; }
    ctx.globalAlpha = p.life * 0.6;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// HELP OVERLAY
// ─────────────────────────────────────────────────────────────

function showHelp()   { helpVisible = true;  document.getElementById('help-overlay').classList.add('visible'); }
function hideHelp()   { helpVisible = false; document.getElementById('help-overlay').classList.remove('visible'); }
function toggleHelp() {
  if (helpTimer) { clearTimeout(helpTimer); helpTimer = null; }
  helpVisible ? hideHelp() : showHelp();
}

// ─────────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────────

// Static nebula patches — created once so positions don't change
const NEBULAS = [
  { x: 140, y: 180, r: 220, r2: 0.48, g: 0, b: 140 },
  { x: 660, y: 410, r: 200, r2: 0.55, g: 0, b: 110 },
  { x: 400, y: 290, r: 260, r2: 0.50, g: 60, b: 80 },
  { x: 200, y: 500, r: 160, r2: 0.60, g: 80, b: 0 },
  { x: 620, y: 120, r: 170, r2: 0.58, g: 0, b: 90 },
];

function drawBackground(now) {
  ctx.fillStyle = '#07071a';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // Nebula clouds
  for (const n of NEBULAS) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0,    `rgba(${n.r2 < 0.52 ? 0 : n.g},${n.g},${n.b},0.11)`);
    g.addColorStop(0.5,  `rgba(0,${n.g},${n.b},0.05)`);
    g.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }

  // Stars
  for (const s of stars) {
    const a = s.alpha * (0.6 + 0.4 * Math.sin(now * s.speed * 0.001 + s.phase));
    ctx.globalAlpha = a;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Arena border — double-line glow
  ctx.strokeStyle = 'rgba(0,255,255,0.05)';
  ctx.lineWidth   = 4;
  ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);
  ctx.strokeStyle = 'rgba(0,255,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);
}

function render(state, now) {
  ctx.save();

  // Screen shake
  if (shakeAmount > 0.4) {
    ctx.translate(
      (Math.random() - 0.5) * shakeAmount,
      (Math.random() - 0.5) * shakeAmount
    );
    shakeAmount *= 0.78;
  } else {
    shakeAmount = 0;
  }

  drawBackground(now);
  updateDrawShockwaves();
  updateDrawExplosions();
  tickBoostTrail(state);

  for (const b of state.bullets) drawBullet(b);
  for (const ship of state.ships) {
    if (ship.alive) drawShip(ship, now);
  }

  drawHUD(state, now);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// DRAW: BULLET
// ─────────────────────────────────────────────────────────────

function drawBullet(b) {
  const col = COLORS[b.ownerIndex];
  ctx.save();

  // Long glowing trail
  for (let t = 5; t >= 1; t--) {
    ctx.globalAlpha = ((6 - t) / 6) * 0.18;
    ctx.fillStyle   = col;
    ctx.beginPath();
    ctx.arc(
      b.x - b.vx * t * 1.4,
      b.y - b.vy * t * 1.4,
      BULLET_RADIUS * (1 - t * 0.14),
      0, Math.PI * 2
    );
    ctx.fill();
  }

  // Outer glow ring
  ctx.globalAlpha = 0.3;
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 20;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BULLET_RADIUS + 3, 0, Math.PI * 2);
  ctx.fill();

  // Core
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = '#ffffff';
  ctx.beginPath();
  ctx.arc(b.x, b.y, BULLET_RADIUS * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// DRAW: SHIP
// ─────────────────────────────────────────────────────────────

function drawShip(ship, now) {
  const col  = COLORS[ship.index];
  const rgba = COLORS_RGBA[ship.index];
  const isMe = ship.index === _myIndex;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Invincibility shield ring (replaces blinking)
  if (ship.invincible) {
    const pulse = 0.35 + 0.28 * Math.sin(now * 0.013);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 22;
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, SHIP_RADIUS + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }

  // Persistent engine glow at rear
  const eg = ctx.createRadialGradient(-8, 0, 0, -8, 0, 9);
  eg.addColorStop(0, rgba(0.45));
  eg.addColorStop(1, rgba(0));
  ctx.fillStyle   = eg;
  ctx.shadowBlur  = 0;
  ctx.beginPath();
  ctx.arc(-8, 0, 9, 0, Math.PI * 2);
  ctx.fill();

  // Forward thrust flame (rear)
  if (ship.thrustOn || ship.boosting) {
    const boost   = ship.boosting;
    const flicker = boost ? (20 + Math.random() * 22) : (9 + Math.random() * 11);
    const spread  = boost ? 11 : 7;
    const g       = boost ? (180 + (Math.random() * 75) | 0) : (90 + (Math.random() * 130) | 0);
    const grad    = ctx.createLinearGradient(-SHIP_RADIUS, 0, -SHIP_RADIUS - flicker, 0);
    grad.addColorStop(0, boost ? `rgba(255,255,${g},1)` : `rgba(255,${g},0,0.95)`);
    grad.addColorStop(0.4, boost ? 'rgba(255,180,20,0.6)' : 'rgba(255,100,0,0.5)');
    grad.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-11, -spread);
    ctx.lineTo(-SHIP_RADIUS - flicker, 0);
    ctx.lineTo(-11,  spread);
    ctx.fill();
  }

  // Reverse thrust flame (nose)
  if (ship.reverseThrustOn) {
    const flicker = 7 + Math.random() * 9;
    const grad    = ctx.createLinearGradient(18, 0, 18 + flicker, 0);
    grad.addColorStop(0, 'rgba(80,160,255,0.9)');
    grad.addColorStop(1, 'rgba(0,80,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(14, -5);
    ctx.lineTo(18 + flicker, 0);
    ctx.lineTo(14,  5);
    ctx.fill();
  }

  // Ship body — filled with translucent color
  ctx.beginPath();
  ctx.moveTo( 18,   0);
  ctx.lineTo(-12, -10);
  ctx.lineTo( -6,   0);
  ctx.lineTo(-12,  10);
  ctx.closePath();
  ctx.fillStyle   = rgba(0.12);
  ctx.fill();

  // Ship outline with glow
  ctx.strokeStyle = col;
  ctx.lineWidth   = isMe ? 2.5 : 1.8;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isMe ? 22 : 11;
  ctx.stroke();

  // Cockpit dot near nose
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = col;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(9, 0, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();

  // Name tag
  ctx.save();
  ctx.font        = `${isMe ? 'bold ' : ''}11px monospace`;
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isMe ? 10 : 5;
  ctx.textAlign   = 'center';
  ctx.fillText(ship.name + (isMe ? ' ◄' : ''), ship.x, ship.y - 28);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// DRAW: HUD
// ─────────────────────────────────────────────────────────────

function drawHUD(state, now) {
  const s0 = state.ships[0];
  const s1 = state.ships[1];

  ctx.save();

  // P1 — top left
  ctx.font        = 'bold 12px monospace';
  ctx.fillStyle   = COLORS[0];
  ctx.shadowColor = COLORS[0];
  ctx.shadowBlur  = 5;
  ctx.textAlign   = 'left';
  ctx.fillText(s0.name, 12, 22);
  drawHearts(12, 36, s0.health, COLORS[0], 'left');
  drawBoostBar(12, 50, s0.lastBoost || 0, COLORS[0], 'left');

  // P2 — top right
  ctx.fillStyle   = COLORS[1];
  ctx.shadowColor = COLORS[1];
  ctx.textAlign   = 'right';
  ctx.fillText(s1.name, ARENA_W - 12, 22);
  drawHearts(ARENA_W - 12, 36, s1.health, COLORS[1], 'right');
  drawBoostBar(ARENA_W - 12, 50, s1.lastBoost || 0, COLORS[1], 'right');

  // Round + score — top centre
  ctx.shadowBlur  = 0;
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#8888b8';
  ctx.font        = '10px monospace';
  ctx.fillText(`ROUND ${state.round}`, ARENA_W / 2, 18);
  ctx.font        = 'bold 20px monospace';
  ctx.fillStyle   = '#ffffff';
  ctx.fillText(`${state.scores[0]}  –  ${state.scores[1]}`, ARENA_W / 2, 38);

  // Round-over banner
  if (state.status === 'round_over') {
    const wCol = state.winner !== null ? COLORS[state.winner] : '#ffff00';
    const text = state.winner !== null
      ? `${state.ships[state.winner].name} wins the round!`
      : 'DRAW!';

    ctx.font        = 'bold 26px monospace';
    ctx.fillStyle   = wCol;
    ctx.shadowColor = wCol;
    ctx.shadowBlur  = 22;
    ctx.textAlign   = 'center';
    ctx.fillText(text, ARENA_W / 2, ARENA_H / 2 - 18);

    if (state.roundOverAt) {
      const secs = Math.max(0, Math.ceil((state.roundOverAt + 1800 - Date.now()) / 1000));
      ctx.font        = '14px monospace';
      ctx.shadowBlur  = 8;
      ctx.fillStyle   = '#aaaacc';
      ctx.shadowColor = '#aaaacc';
      ctx.fillText(
        secs > 0 ? `Next round in ${secs}…` : 'Get ready!',
        ARENA_W / 2, ARENA_H / 2 + 16
      );
    }
  }

  ctx.shadowBlur  = 0;
  ctx.font        = '10px monospace';
  ctx.fillStyle   = '#2c2c50';
  ctx.textAlign   = 'right';
  ctx.fillText('[?] controls', ARENA_W - 8, ARENA_H - 8);

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// DRAW: HEARTS
// ─────────────────────────────────────────────────────────────

function drawHearts(x, y, health, color, align) {
  ctx.font        = '14px monospace';
  ctx.shadowColor = color;
  ctx.shadowBlur  = 5;
  ctx.textAlign   = align;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = (align === 'left' ? i : 2 - i) < health ? color : '#1c1c38';
    const offset  = align === 'left' ? i * 18 : -i * 18;
    ctx.fillText('♥', x + offset, y);
  }
}

function drawBoostBar(x, y, lastBoost, color, align) {
  const elapsed = Date.now() - lastBoost;
  const ready   = elapsed >= BOOST_CD;
  const fill    = Math.min(1, elapsed / BOOST_CD);
  const barW    = 54;
  const barH    = 4;
  const bx      = align === 'right' ? x - barW : x;

  ctx.shadowBlur = 0;
  ctx.fillStyle  = '#111128';
  ctx.fillRect(bx, y, barW, barH);
  ctx.fillStyle  = ready ? color : '#33335a';
  if (ready) { ctx.shadowColor = color; ctx.shadowBlur = 6; }
  ctx.fillRect(bx, y, barW * fill, barH);
  ctx.shadowBlur = 0;
  ctx.font       = '8px monospace';
  ctx.fillStyle  = ready ? color : '#33335a';
  ctx.textAlign  = align;
  ctx.fillText(ready ? 'BOOST' : `${((BOOST_CD - elapsed) / 1000).toFixed(1)}s`, x, y + 14);
}
