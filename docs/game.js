'use strict';

// ─────────────────────────────────────────────────────────────
// SHARED CONSTANTS  (must match server.js)
// ─────────────────────────────────────────────────────────────

const ARENA_W       = 960;
const ARENA_H       = 720;
const WORLD_W       = 9600;
const WORLD_H       = 7200;
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
let killFeed      = [];
let _difficulty   = 'medium';

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

// ─────────────────────────────────────────────────────────────
// PUBLIC API  (called by lobby.js)
// ─────────────────────────────────────────────────────────────

function initGame(sock, initialState, yourIndex, asteroids, difficulty) {
  _socket      = sock;
  _myIndex     = yourIndex;
  _difficulty  = difficulty || 'medium';
  serverState  = initialState;
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

  _socket.off('kill_event');
  _socket.on('kill_event', ({ killerName, killerIndex, victimName, victimIndex }) => {
    killFeed.push({ killerName, killerIndex, victimName, victimIndex, at: Date.now() });
    if (killFeed.length > 6) killFeed.shift();
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
    // Upgrade selection: 1/2 for binary choices, 3 for root branch selection
    if (serverState && _socket) {
      const myShip = serverState.ships[_myIndex];
      if (myShip && myShip.pendingUpgrade && myShip.upgradePath) {
        const lastId  = myShip.upgradePath[myShip.upgradePath.length - 1];
        const node    = window.UPGRADE_TREE && window.UPGRADE_TREE[lastId];
        const choices = node ? node.next : [];
        if (e.key === '1' && choices[0]) _socket.emit('choose_upgrade', { nodeId: choices[0] });
        if (e.key === '2' && choices[1]) _socket.emit('choose_upgrade', { nodeId: choices[1] });
        if (e.key === '3' && choices[2]) _socket.emit('choose_upgrade', { nodeId: choices[2] });
      }
    }
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
  killFeed = [];
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

// World-space nebula zones — positions scaled 1.5× for the 9600×7200 world,
// with extra patches added for the expanded map area.
const WORLD_NEBULAS = [
  { x: 1350, y: 1275, r: 1050, c: '0,0,150'     },   // NW
  { x: 8250, y: 1275, r: 1020, c: '0,0,120'     },   // NE
  { x: 1350, y: 5925, r:  975, c: '130,60,0'    },   // SW
  { x: 8250, y: 5925, r:  930, c: '80,0,110'    },   // SE
  { x: 4800, y: 3600, r: 1200, c: '110,40,90'   },   // center
  { x: 2550, y: 3600, r:  750, c: '0,0,130'     },   // W-mid
  { x: 7050, y: 3600, r:  780, c: '0,0,110'     },   // E-mid
  { x: 4800, y: 1500, r:  900, c: '0,20,140'    },   // N-mid
  { x: 4800, y: 5700, r:  870, c: '130,80,0'    },   // S-mid
  { x: 3000, y: 1950, r:  675, c: '60,20,100'   },   // NW-inner
  { x: 6600, y: 1950, r:  645, c: '0,30,110'    },   // NE-inner
  { x: 3000, y: 5250, r:  660, c: '100,50,20'   },   // SW-inner
  { x: 6600, y: 5250, r:  630, c: '40,0,100'    },   // SE-inner
  { x: 1400, y: 3600, r:  580, c: '0,0,120'     },   // W-edge
  { x: 8200, y: 3600, r:  560, c: '80,0,80'     },   // E-edge
  { x: 4800, y:  700, r:  500, c: '0,10,130'    },   // N-edge
  { x: 4800, y: 6500, r:  520, c: '110,70,0'    },   // S-edge
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

function drawGrid() {
  const GRID = 800;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,180,255,0.04)';
  ctx.lineWidth   = 1;
  const x0 = Math.floor(cameraX / GRID) * GRID;
  const y0 = Math.floor(cameraY / GRID) * GRID;
  for (let x = x0; x < cameraX + ARENA_W + GRID; x += GRID) {
    ctx.beginPath();
    ctx.moveTo(x, Math.max(0, cameraY));
    ctx.lineTo(x, Math.min(WORLD_H, cameraY + ARENA_H));
    ctx.stroke();
  }
  for (let y = y0; y < cameraY + ARENA_H + GRID; y += GRID) {
    ctx.beginPath();
    ctx.moveTo(Math.max(0, cameraX), y);
    ctx.lineTo(Math.min(WORLD_W, cameraX + ARENA_W), y);
    ctx.stroke();
  }
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

  drawGrid();
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
// DRAW: SHIP  (branch/tier-aware hull + decorations)
// ─────────────────────────────────────────────────────────────

// Hull polygon vertices for each branch × tier range (local coords, facing right)
function _shipPts(branch, tier) {
  switch (branch) {
    case 'S': // Speed — elongates and narrows progressively
      if (tier >= 9) return [[ 28,  0], [-20, -5], [-14, 0], [-20,  5]];
      if (tier >= 7) return [[ 26,  0], [-18, -6], [-12, 0], [-18,  6]];
      if (tier >= 4) return [[ 23,  0], [-16, -7], [-10, 0], [-16,  7]];
      if (tier >= 1) return [[ 21,  0], [-14, -8], [ -8, 0], [-14,  8]];
      break;
    case 'F': // Firepower — stays short, gets wider (more mass)
      if (tier >= 9) return [[ 20,  0], [-10,-20], [ -4, 0], [-10, 20]];
      if (tier >= 7) return [[ 20,  0], [-10,-17], [ -4, 0], [-10, 17]];
      if (tier >= 4) return [[ 20,  0], [-10,-14], [ -5, 0], [-10, 14]];
      if (tier >= 1) return [[ 20,  0], [-11,-12], [ -5, 0], [-11, 12]];
      break;
    case 'T': // Tank — grows bulkier in all directions
      if (tier >= 9) return [[ 16,  0], [-16,-15], [-10, 0], [-16, 15]];
      if (tier >= 7) return [[ 17,  0], [-15,-14], [ -9, 0], [-15, 14]];
      if (tier >= 4) return [[ 17,  0], [-14,-13], [ -8, 0], [-14, 13]];
      if (tier >= 1) return [[ 18,  0], [-13,-12], [ -7, 0], [-13, 12]];
      break;
  }
  return [[ 18, 0], [-12,-10], [-6, 0], [-12, 10]]; // default (no branch)
}

function _hullPath(pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// Branch-specific decorations drawn inside the ctx.save/translate/rotate block
function _drawBranchExtras(branch, tier, col, now, shipIdx) {
  if (tier < 1) return;
  ctx.save();

  if (branch === 'S') {
    // Swept wings appear at tier 4, grow with tier
    if (tier >= 4) {
      const wLen = 5 + tier * 2;
      const wY   = tier >= 7 ? 10 : 8;
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.2;
      ctx.lineCap     = 'round';
      ctx.shadowColor = col;
      ctx.shadowBlur  = 7;
      ctx.globalAlpha = 0.55 + Math.min(0.3, tier * 0.03);
      // top wing
      ctx.beginPath(); ctx.moveTo(-6, -wY); ctx.lineTo(-6 - wLen, -wY - 5 - tier); ctx.stroke();
      // bottom wing
      ctx.beginPath(); ctx.moveTo(-6,  wY); ctx.lineTo(-6 - wLen,  wY + 5 + tier); ctx.stroke();
    }
    // Velocity streaks at tier 7+
    if (tier >= 7) {
      ctx.strokeStyle = '#aaddff';
      ctx.lineWidth   = 0.9;
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(now * 0.009 + shipIdx);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-14, i * 4);
        ctx.lineTo(-14 - 8 - tier, i * 4);
        ctx.stroke();
      }
    }

  } else if (branch === 'F') {
    // Gun barrels appear at tier 3+
    if (tier >= 3) {
      const bLen   = 3 + Math.floor(tier / 2.5);
      const spread = tier >= 7 ? 9 : tier >= 5 ? 6 : 4;
      ctx.strokeStyle = col;
      ctx.lineWidth   = tier >= 7 ? 2.2 : 1.8;
      ctx.lineCap     = 'square';
      ctx.shadowColor = col;
      ctx.shadowBlur  = 9;
      ctx.globalAlpha = 0.72;
      ctx.beginPath(); ctx.moveTo(10, -spread); ctx.lineTo(10 + bLen, -spread); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10,  spread); ctx.lineTo(10 + bLen,  spread); ctx.stroke();
      // Centre barrel at tier 6+
      if (tier >= 6) {
        ctx.lineWidth   = 2.5;
        ctx.globalAlpha = 0.90;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(14 + bLen + 4, 0); ctx.stroke();
      }
    }

  } else if (branch === 'T') {
    // Armour plating lines at tier 3+
    if (tier >= 3) {
      const pts = _shipPts('T', tier);
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 0.30;
      const sy = pts[1][1]; // topY of hull
      ctx.beginPath();
      ctx.moveTo(pts[0][0] - 5,  sy * 0.4);
      ctx.lineTo(pts[1][0] + 3,  sy * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pts[0][0] - 5, -sy * 0.4);
      ctx.lineTo(pts[1][0] + 3, -sy * 0.7);
      ctx.stroke();
    }
    // Passive shield ring at tier 5+
    if (tier >= 5) {
      const sr    = 22 + tier * 1.5;
      const pulse = 0.07 + 0.04 * Math.sin(now * 0.004 + shipIdx * 1.3);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur  = 16;
      ctx.lineWidth   = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, sr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

function drawShip(ship, now) {
  const col    = COLORS[ship.index % COLORS.length];
  const rgba   = colorRgba(ship.index);
  const isMe   = ship.index === _myIndex;
  const branch = window.getShipBranch ? window.getShipBranch(ship.upgradePath) : null;
  const tier   = ship.tier || 0;
  const pts    = _shipPts(branch, tier);
  // Rear-most X for thrust/engine anchor
  const rearX  = pts.reduce((m, p) => Math.min(m, p[0]), 0);

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Invincibility shield ring
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
  const eg = ctx.createRadialGradient(rearX + 4, 0, 0, rearX + 4, 0, 9);
  eg.addColorStop(0, rgba(0.45));
  eg.addColorStop(1, rgba(0));
  ctx.fillStyle = eg;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(rearX + 4, 0, 9, 0, Math.PI * 2);
  ctx.fill();

  // Forward thrust flame
  if (ship.thrustOn || ship.boosting) {
    const boost   = ship.boosting;
    const flicker = boost ? (20 + Math.random() * 22) : (9 + Math.random() * 11);
    const spread  = boost ? 11 : 7;
    const g       = boost ? (180 + (Math.random() * 75) | 0) : (90 + (Math.random() * 130) | 0);
    const grad    = ctx.createLinearGradient(rearX, 0, rearX - flicker, 0);
    grad.addColorStop(0,   boost ? `rgba(255,255,${g},1)` : `rgba(255,${g},0,0.95)`);
    grad.addColorStop(0.4, boost ? 'rgba(255,180,20,0.6)' : 'rgba(255,100,0,0.5)');
    grad.addColorStop(1,   'rgba(255,40,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(rearX + 4, -spread);
    ctx.lineTo(rearX - flicker, 0);
    ctx.lineTo(rearX + 4,  spread);
    ctx.fill();
  }

  // Reverse thrust flame (nose)
  if (ship.reverseThrustOn) {
    const noseX  = pts[0][0];
    const flicker = 7 + Math.random() * 9;
    const grad    = ctx.createLinearGradient(noseX - 2, 0, noseX + 2 + flicker, 0);
    grad.addColorStop(0, 'rgba(80,160,255,0.9)');
    grad.addColorStop(1, 'rgba(0,80,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(noseX - 4, -5);
    ctx.lineTo(noseX + flicker, 0);
    ctx.lineTo(noseX - 4,  5);
    ctx.fill();
  }

  // Ship body fill
  ctx.beginPath();
  _hullPath(pts);
  ctx.fillStyle = rgba(branch === 'T' ? 0.18 : 0.12);
  ctx.fill();

  // Branch-specific extras (wings, guns, armour, shield)
  _drawBranchExtras(branch, tier, col, now, ship.index);

  // High-tier aura ring (tier 5+) drawn before hull so it's behind
  if (tier >= 5) {
    const auraR   = SHIP_RADIUS + 8 + tier * 1.2;
    const pulse   = 0.06 + 0.05 * Math.sin(now * 0.003 + ship.index * 0.9);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 20 + tier;
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, auraR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }

  // Hull outline
  ctx.beginPath();
  _hullPath(pts);
  ctx.strokeStyle = col;
  ctx.lineWidth   = isMe ? 2.5 : 1.8;
  ctx.shadowColor = col;
  ctx.shadowBlur  = (isMe ? 22 : 11) + tier * 1.5;
  ctx.stroke();

  // Cockpit dot near nose
  const cockpitX = pts[0][0] - 9;
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = col;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cockpitX, 0, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();

  // Tier badge above ship (tier 1+)
  if (tier >= 1) {
    ctx.save();
    const tierCol = tier >= 8 ? '#ffdd00' : tier >= 5 ? col : col;
    ctx.font        = `bold 9px monospace`;
    ctx.fillStyle   = tierCol;
    ctx.shadowColor = tierCol;
    ctx.shadowBlur  = tier >= 5 ? 10 : 4;
    ctx.textAlign   = 'center';
    ctx.fillText(`T${tier}`, ship.x, ship.y - 38);
    ctx.restore();
  }

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
    drawHearts(12, 36, myShip.health, myShip.maxHealth || 5, col, 'left');
    drawBoostBar(12, 52, myShip.lastBoost || 0, (myShip.ss && myShip.ss.boostCd) || 3500, col, 'left');
    // XP progress bar
    const xpPer = (window.XP_PER_TIER || 150);
    const xpNeeded = (myShip.tier + 1) * xpPer;
    const xpFill   = myShip.tier >= 10 ? 1 : Math.min(1, myShip.xp / xpNeeded);
    const barW = 54, barH = 4, bx = 12;
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#111128';
    ctx.fillRect(bx, 72, barW, barH);
    ctx.fillStyle  = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = xpFill >= 1 ? 6 : 0;
    ctx.fillRect(bx, 72, barW * xpFill, barH);
    ctx.shadowBlur = 0;
    ctx.font       = '8px monospace';
    ctx.fillStyle  = myShip.tier >= 10 ? col : '#33335a';
    ctx.textAlign  = 'left';
    const tierLabel = myShip.tier >= 10 ? 'MAX TIER' : `T${myShip.tier} · ${myShip.xp}/${xpNeeded} XP`;
    ctx.fillText(tierLabel, 12, 88);
    // Difficulty label
    const diffLabel = { easy: 'EASY', medium: 'MED', beast: 'BEAST' }[_difficulty] || '';
    const diffCol   = _difficulty === 'beast' ? '#ff4444' : _difficulty === 'easy' ? '#44ff88' : '#4488ff';
    ctx.font        = '8px monospace';
    ctx.fillStyle   = diffCol;
    ctx.shadowColor = diffCol;
    ctx.shadowBlur  = 3;
    ctx.fillText(`BOTS: ${diffLabel}`, 12, 100);
    ctx.shadowBlur  = 0;
  }

  // Upgrade panel (shown when pendingUpgrade, takes full focus)
  drawUpgradePanel(state);

  // Respawn countdown overlay
  if (myShip && !myShip.alive && myShip.respawnAt > 0) {
    const remaining = Math.max(0, (myShip.respawnAt - Date.now()) / 1000);
    ctx.save();
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 32px monospace';
    ctx.fillStyle   = 'rgba(255,80,80,0.92)';
    ctx.shadowColor = '#ff2222';
    ctx.shadowBlur  = 24;
    ctx.fillText('DESTROYED', ARENA_W / 2, ARENA_H / 2 - 18);
    ctx.font        = 'bold 18px monospace';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 10;
    ctx.fillText(`Respawning in ${remaining.toFixed(1)}s`, ARENA_W / 2, ARENA_H / 2 + 16);
    ctx.restore();
  }

  // Kill feed — bottom left
  drawKillFeed();

  // Leaderboard — top right
  drawLeaderboard(state);

  // Minimap — bottom right
  drawMinimap(state);

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// DRAW: UPGRADE PANEL
// ─────────────────────────────────────────────────────────────

const BRANCH_LABELS = { S: 'SPEED',  F: 'FIREPOWER', T: 'TANK' };
const BRANCH_DESCS  = {
  S: 'Movement speed & dash',
  F: 'Bullet damage & fire rate',
  T: 'Health, shields & resistance',
};

function drawUpgradePanel(state) {
  const myShip = state.ships[_myIndex];
  if (!myShip || !myShip.pendingUpgrade || !myShip.upgradePath) return;

  const tree    = window.UPGRADE_TREE;
  if (!tree) return;
  const lastId  = myShip.upgradePath[myShip.upgradePath.length - 1];
  const node    = tree[lastId];
  if (!node || !node.next.length) return;
  const choices = node.next;

  const isRoot  = lastId === 'root'; // branch selection
  const cardW   = 160;
  const cardH   = isRoot ? 80 : 68;
  const gap     = 14;
  const total   = cardW * choices.length + gap * (choices.length - 1);
  const startX  = (ARENA_W - total) / 2;
  const panelY  = ARENA_H / 2 - cardH / 2;

  ctx.save();

  // Dimmed background
  ctx.fillStyle = 'rgba(0,0,20,0.55)';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // Header
  ctx.textAlign   = 'center';
  ctx.font        = 'bold 13px monospace';
  ctx.fillStyle   = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur  = 8;
  const headerY   = panelY - 20;
  ctx.fillText(isRoot ? 'CHOOSE YOUR BRANCH' : `TIER ${myShip.tier + 1} UPGRADE`, ARENA_W / 2, headerY);
  ctx.font      = '10px monospace';
  ctx.fillStyle = '#6666aa';
  ctx.shadowBlur = 0;
  ctx.fillText('Press 1 / 2' + (choices.length > 2 ? ' / 3' : ''), ARENA_W / 2, headerY + 14);

  choices.forEach((id, idx) => {
    const cn   = tree[id];
    if (!cn) return;
    const cx   = startX + idx * (cardW + gap);
    const col  = id[0] === 'S' ? '#00ffdd' : id[0] === 'F' ? '#ff8844' : '#88aaff';

    // Card background
    ctx.fillStyle   = 'rgba(8,8,28,0.88)';
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 10;
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(cx + r, panelY);
    ctx.lineTo(cx + cardW - r, panelY);
    ctx.arcTo(cx + cardW, panelY, cx + cardW, panelY + r, r);
    ctx.lineTo(cx + cardW, panelY + cardH - r);
    ctx.arcTo(cx + cardW, panelY + cardH, cx + cardW - r, panelY + cardH, r);
    ctx.lineTo(cx + r, panelY + cardH);
    ctx.arcTo(cx, panelY + cardH, cx, panelY + cardH - r, r);
    ctx.lineTo(cx, panelY + r);
    ctx.arcTo(cx, panelY, cx + r, panelY, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Key hint badge
    ctx.fillStyle = col;
    ctx.font      = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`[${idx + 1}]`, cx + 8, panelY + 16);

    // Upgrade name
    ctx.font      = 'bold 11px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(cn.name, cx + cardW / 2, panelY + 16);

    // Branch label for root choice
    if (isRoot) {
      ctx.font      = '10px monospace';
      ctx.fillStyle = col;
      ctx.fillText(BRANCH_LABELS[id[0]] || '', cx + cardW / 2, panelY + 31);
      ctx.fillStyle = '#5555aa';
      ctx.fillText(BRANCH_DESCS[id[0]] || '', cx + cardW / 2, panelY + 46);
    }

    // Stats summary
    const stats = cn.stats;
    const lines = [];
    if (stats.thrust)     lines.push(`+Thrust`);
    if (stats.maxSpd)     lines.push(`+Speed`);
    if (stats.boostCd)    lines.push(`+Dash`);
    if (stats.rotate)     lines.push(`+Turn`);
    if (stats.drag)       lines.push(`+Drift`);
    if (stats.shootCd)    lines.push(`+Fire Rate`);
    if (stats.bulletDmg)  lines.push(`+Dmg ×${stats.bulletDmg}`);
    if (stats.maxBullets) lines.push(`+Bullets`);
    if (stats.bulletSpd)  lines.push(`+Bullet Spd`);
    if (stats.health)     lines.push(`+${stats.health} HP`);
    if (stats.regenRate)  lines.push(`+Regen`);
    if (stats.dmgReduce)  lines.push(`+Resistance`);

    ctx.font      = '9px monospace';
    ctx.fillStyle = '#8888cc';
    ctx.textAlign = 'center';
    const topLine = isRoot ? panelY + 60 : panelY + 30;
    lines.slice(0, 3).forEach((l, li) => {
      ctx.fillText(l, cx + cardW / 2, topLine + li * 13);
    });
  });

  ctx.restore();
}

function drawMinimap(state) {
  const MW = 168, MH = 126;
  const MX = ARENA_W - MW - 8, MY = ARENA_H - MH - 8;
  const sx = MW / WORLD_W, sy = MH / WORLD_H;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,18,0.75)';
  ctx.fillRect(MX, MY, MW, MH);
  ctx.strokeStyle = 'rgba(0,200,200,0.25)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(MX, MY, MW, MH);

  // Viewport rect
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth   = 0.8;
  ctx.strokeRect(MX + cameraX * sx, MY + cameraY * sy, ARENA_W * sx, ARENA_H * sy);

  // XP blocks
  if (state.xpBlocks) {
    for (const blk of state.xpBlocks) {
      ctx.fillStyle = `hsla(${blk.hue},100%,65%,0.5)`;
      ctx.fillRect(MX + blk.x * sx - 0.8, MY + blk.y * sy - 0.8, 1.6, 1.6);
    }
  }

  // Ships
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    const col  = COLORS[ship.index % COLORS.length];
    const isMe = ship.index === _myIndex;
    ctx.fillStyle   = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = isMe ? 8 : 0;
    ctx.beginPath();
    ctx.arc(MX + ship.x * sx, MY + ship.y * sy, isMe ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 0.35;
  ctx.font        = '8px monospace';
  ctx.fillStyle   = '#88aacc';
  ctx.textAlign   = 'right';
  ctx.fillText('[?] controls', MX + MW - 4, MY + MH - 3);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawKillFeed() {
  const now = Date.now();
  killFeed = killFeed.filter(k => now - k.at < 5000);
  if (!killFeed.length) return;
  ctx.font = '10px monospace';
  ctx.shadowBlur = 0;
  for (let i = 0; i < killFeed.length; i++) {
    const k     = killFeed[i];
    const alpha = Math.max(0, 1 - (now - k.at) / 5000);
    const y     = ARENA_H - 14 - (killFeed.length - 1 - i) * 15;
    const kCol  = COLORS[k.killerIndex % COLORS.length];
    const vCol  = COLORS[k.victimIndex % COLORS.length];
    const kW    = k.killerName.length * 6.2;
    ctx.globalAlpha = alpha;
    ctx.textAlign   = 'left';
    ctx.fillStyle   = kCol;
    ctx.shadowColor = kCol;
    ctx.shadowBlur  = 4;
    ctx.fillText(k.killerName, 10, y);
    ctx.fillStyle  = '#555577';
    ctx.shadowBlur = 0;
    ctx.fillText(' ✕ ', 10 + kW, y);
    ctx.fillStyle   = vCol;
    ctx.shadowColor = vCol;
    ctx.shadowBlur  = 4;
    ctx.fillText(k.victimName, 10 + kW + 18, y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
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

function drawHearts(x, y, health, maxHealth, color, align) {
  const max     = maxHealth || 5;
  const spacing = Math.min(16, Math.floor(90 / max));
  ctx.font        = '12px monospace';
  ctx.shadowColor = color;
  ctx.shadowBlur  = 5;
  ctx.textAlign   = align;
  for (let i = 0; i < max; i++) {
    const filled  = (align === 'left' ? i : max - 1 - i) < health;
    ctx.fillStyle = filled ? color : '#1c1c38';
    const offset  = align === 'left' ? i * spacing : -i * spacing;
    ctx.fillText('♥', x + offset, y);
  }
}

function drawBoostBar(x, y, lastBoost, boostCd, color, align) {
  const elapsed = Date.now() - lastBoost;
  const ready   = elapsed >= boostCd;
  const fill    = Math.min(1, elapsed / boostCd);
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
  ctx.fillText(ready ? 'BOOST' : `${((boostCd - elapsed) / 1000).toFixed(1)}s`, x, y + 14);
}
