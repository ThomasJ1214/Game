'use strict';

// ─────────────────────────────────────────────────────────────
// SHARED CONSTANTS  (must match server.js)
// ─────────────────────────────────────────────────────────────

const ARENA_W       = 800;
const ARENA_H       = 600;
const WORLD_W       = 6400;
const WORLD_H       = 4800;
const SHIP_RADIUS   = 16;
const BULLET_RADIUS = 4;
const BOOST_CD      = 3500;
const COLORS = [
  '#00ffff','#ff00ff','#ffff00','#00ff88','#ff8844',
  '#8888ff','#ff4488','#44ffaa','#ff6666','#66aaff',
  '#aaff66','#ffaa44','#cc44ff','#44ffff','#ff44cc',
];

function colorRgba(index) {
  const h = COLORS[index % COLORS.length];
  const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
  return (a) => `rgba(${r},${g},${b},${a})`;
}

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
let cameraX       = 0;
let cameraY       = 0;
let mapAsteroids  = [];

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

// ─────────────────────────────────────────────────────────────
// PUBLIC API  (called by lobby.js)
// ─────────────────────────────────────────────────────────────

function initGame(sock, initialState, yourIndex, asteroids) {
  _socket     = sock;
  _myIndex    = yourIndex;
  serverState = initialState;
  prevState   = null;
  explosions  = [];
  shockwaves  = [];
  boostTrail  = [];
  shakeAmount = 0;
  cameraX     = 0;
  cameraY     = 0;
  generation++;

  // Precompute crater visuals for each asteroid
  mapAsteroids = (asteroids || []).map(ast => {
    let s = ((ast.x * 73856093) ^ (ast.y * 19349663)) >>> 0;
    const lcg = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
    const craters = Array.from({ length: 2 + (s % 2) }, () => ({
      angle: lcg() * Math.PI * 2,
      dist:  lcg() * 0.55,
      r:     0.15 + lcg() * 0.22,
    }));
    return { ...ast, craters };
  });
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

// World-space nebula zones scattered across the large map
const WORLD_NEBULAS = [
  { x:  900, y:  850, r: 700, c: '0,0,150'     },
  { x: 5500, y:  850, r: 680, c: '0,0,120'     },
  { x:  900, y: 3950, r: 650, c: '130,60,0'    },
  { x: 5500, y: 3950, r: 620, c: '80,0,110'    },
  { x: 3200, y: 2400, r: 800, c: '110,40,90'   },
  { x: 1700, y: 2400, r: 500, c: '0,0,130'     },
  { x: 4700, y: 2400, r: 520, c: '0,0,110'     },
  { x: 3200, y: 1000, r: 600, c: '0,20,140'    },
  { x: 3200, y: 3800, r: 580, c: '130,80,0'    },
  { x: 2000, y: 1300, r: 450, c: '60,20,100'   },
  { x: 4400, y: 1300, r: 430, c: '0,30,110'    },
  { x: 2000, y: 3500, r: 440, c: '100,50,20'   },
  { x: 4400, y: 3500, r: 420, c: '40,0,100'    },
];

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

}

function drawWorldDecorations() {
  for (const n of WORLD_NEBULAS) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0,   `rgba(${n.c},0.13)`);
    g.addColorStop(0.5, `rgba(${n.c},0.05)`);
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }
}

function drawAsteroid(ast) {
  ctx.save();
  ctx.translate(ast.x, ast.y);

  // Body
  ctx.beginPath();
  ctx.arc(0, 0, ast.r, 0, Math.PI * 2);
  ctx.fillStyle = '#18130e';
  ctx.shadowColor = 'rgba(110,85,55,0.55)';
  ctx.shadowBlur  = 12;
  ctx.fill();
  ctx.strokeStyle = 'rgba(130,100,65,0.75)';
  ctx.lineWidth   = 2.5;
  ctx.shadowBlur  = 0;
  ctx.stroke();

  // Craters
  for (const c of ast.craters) {
    const cx = Math.cos(c.angle) * c.dist * ast.r;
    const cy = Math.sin(c.angle) * c.dist * ast.r;
    ctx.beginPath();
    ctx.arc(cx, cy, c.r * ast.r, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,70,50,0.35)';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Top-left surface highlight
  const hl = ctx.createRadialGradient(-ast.r * 0.35, -ast.r * 0.35, 0, 0, 0, ast.r);
  hl.addColorStop(0, 'rgba(105,88,65,0.22)');
  hl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(0, 0, ast.r, 0, Math.PI * 2);
  ctx.fillStyle = hl;
  ctx.fill();

  ctx.restore();
}

function drawXpBlock(blk) {
  ctx.save();
  ctx.translate(blk.x, blk.y);

  // Outer glow
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, blk.r + 10);
  g.addColorStop(0, `hsla(${blk.hue},100%,60%,0.22)`);
  g.addColorStop(1, `hsla(${blk.hue},100%,60%,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, blk.r + 10, 0, Math.PI * 2);
  ctx.fill();

  // Crystal diamond body
  ctx.shadowColor = `hsl(${blk.hue},100%,65%)`;
  ctx.shadowBlur  = 14;
  ctx.beginPath();
  ctx.moveTo(0,          -blk.r);
  ctx.lineTo( blk.r * 0.7, 0);
  ctx.lineTo(0,           blk.r);
  ctx.lineTo(-blk.r * 0.7, 0);
  ctx.closePath();
  ctx.fillStyle   = `hsla(${blk.hue},100%,25%,0.55)`;
  ctx.strokeStyle = `hsl(${blk.hue},100%,65%)`;
  ctx.lineWidth   = 2;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawWorldBorder() {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,255,0.08)';
  ctx.lineWidth   = 6;
  ctx.shadowColor = 'rgba(0,255,255,0.4)';
  ctx.shadowBlur  = 18;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
  ctx.strokeStyle = 'rgba(0,255,255,0.18)';
  ctx.lineWidth   = 2;
  ctx.shadowBlur  = 8;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
  ctx.restore();
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

  // Update camera to follow the local player, clamped to world bounds
  const myShip = state.ships[_myIndex];
  if (myShip && myShip.alive) {
    cameraX = Math.max(0, Math.min(WORLD_W - ARENA_W, myShip.x - ARENA_W / 2));
    cameraY = Math.max(0, Math.min(WORLD_H - ARENA_H, myShip.y - ARENA_H / 2));
  }

  // Background (stars, nebulas) stays in screen space
  drawBackground(now);

  // Apply camera offset for all world-space objects
  ctx.save();
  ctx.translate(-cameraX, -cameraY);

  drawWorldBorder();
  drawWorldDecorations();
  for (const ast of mapAsteroids) drawAsteroid(ast);
  if (state.xpBlocks) for (const blk of state.xpBlocks) drawXpBlock(blk);
  updateDrawShockwaves();
  updateDrawExplosions();
  tickBoostTrail(state);

  for (const b of state.bullets) drawBullet(b);
  for (const ship of state.ships) {
    if (ship.alive) drawShip(ship, now);
  }

  ctx.restore();

  // HUD stays in screen space
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
  const col  = COLORS[ship.index % COLORS.length];
  const rgba = colorRgba(ship.index);
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
  ctx.save();

  // Local player stats — top left
  const myShip = state.ships[_myIndex];
  if (myShip) {
    const col = COLORS[_myIndex % COLORS.length];
    ctx.font        = 'bold 12px monospace';
    ctx.fillStyle   = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 5;
    ctx.textAlign   = 'left';
    ctx.fillText(myShip.name + ' ◄', 12, 22);
    drawHearts(12, 36, myShip.health, col, 'left');
    drawBoostBar(12, 50, myShip.lastBoost || 0, col, 'left');
  }

  // Leaderboard — top right
  drawLeaderboard(state);

  // Controls hint — bottom right
  ctx.shadowBlur  = 0;
  ctx.font        = '10px monospace';
  ctx.fillStyle   = '#2c2c50';
  ctx.textAlign   = 'right';
  ctx.fillText('[?] controls', ARENA_W - 8, ARENA_H - 8);

  ctx.restore();
}

function drawLeaderboard(state) {
  const sorted = [...state.ships].sort((a, b) => b.kills - a.kills);
  const x = ARENA_W - 12;
  let y = 22;

  ctx.font      = 'bold 10px monospace';
  ctx.fillStyle = '#3a3a6a';
  ctx.shadowBlur = 0;
  ctx.textAlign = 'right';
  ctx.fillText('KILLS', x, y);
  y += 14;

  for (const ship of sorted) {
    const col  = COLORS[ship.index % COLORS.length];
    const isMe = ship.index === _myIndex;
    ctx.font        = isMe ? 'bold 10px monospace' : '10px monospace';
    ctx.fillStyle   = ship.isBot ? '#3a3a5a' : col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = isMe ? 5 : 0;
    ctx.fillText(`${ship.kills}  ${ship.name}${isMe ? ' ◄' : ''}`, x, y);
    y += 13;
  }
  ctx.shadowBlur = 0;
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
