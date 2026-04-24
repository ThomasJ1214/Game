'use strict';

// ─────────────────────────────────────────────────────────────
// SHARED CONSTANTS  (must match server.js)
// ─────────────────────────────────────────────────────────────

let   ARENA_W       = window.innerWidth  || 960;
let   ARENA_H       = window.innerHeight || 720;
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
let mapAsteroids    = [];
let killFeed        = [];
let _difficulty     = 'medium';
let _upgradeOpen    = false;
let _selectedTarget = -1;
let _isThomas       = false;
let shipTrails      = {};   // index → [{x,y,spd}] circular history
let hackFlashes     = [];  // { x,y,r,maxR,life,col }

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

// ─────────────────────────────────────────────────────────────
// PUBLIC API  (called by lobby.js)
// ─────────────────────────────────────────────────────────────

function initGame(sock, initialState, yourIndex, asteroids, difficulty) {
  _socket         = sock;
  _myIndex        = yourIndex;
  _difficulty     = difficulty || 'medium';
  serverState     = initialState;
  prevState       = null;
  explosions      = [];
  shockwaves      = [];
  boostTrail      = [];
  shipTrails      = {};
  hackFlashes     = [];
  shakeAmount     = 0;
  cameraX         = 0;
  cameraY         = 0;
  _upgradeOpen    = false;
  _selectedTarget = -1;
  generation++;

  const mySelf = initialState && initialState.ships && initialState.ships[yourIndex];
  _isThomas = mySelf ? mySelf.name.toLowerCase().startsWith('thomas_') : false;

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

  // Full-screen canvas — match window dimensions
  ARENA_W = canvas.width  = window.innerWidth;
  ARENA_H = canvas.height = window.innerHeight;
  window.onresize = () => {
    ARENA_W = canvas.width  = window.innerWidth;
    ARENA_H = canvas.height = window.innerHeight;
  };

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

  _socket.off('hack_effect');
  _socket.on('hack_effect', ({ type, x, y, r, ownerIndex }) => {
    const HACK_COLS = { dash:'#00ffff', nova:'#ff4400', god:'#ffff00', warp:'#aa44ff', emp:'#88aaff' };
    const col = HACK_COLS[type] || '#ffffff';
    const maxR = r || (type === 'nova' ? 480 : type === 'emp' ? 900 : 80);
    hackFlashes.push({ x, y, r: 0, maxR, life: 1.0, col });
    if (type === 'nova') {
      shakeAmount = Math.max(shakeAmount, 14);
      for (let i = 0; i < 24; i++) {
        const ang = Math.random() * Math.PI * 2, d = Math.random() * maxR * 0.6;
        explosions.push({ x: x + Math.cos(ang)*d, y: y + Math.sin(ang)*d, r: 10 + Math.random()*18, life: 1.0, vx: Math.cos(ang)*3, vy: Math.sin(ang)*3, col: '#ff6600' });
      }
    } else if (type === 'emp') {
      shakeAmount = Math.max(shakeAmount, 7);
    }
  });

  window.onkeydown = e => {
    if (e.code === 'KeyW'      || e.code === 'ArrowUp')    keys.w     = true;
    if (e.code === 'KeyA'      || e.code === 'ArrowLeft')  keys.a     = true;
    if (e.code === 'KeyS'      || e.code === 'ArrowDown')  keys.s     = true;
    if (e.code === 'KeyD'      || e.code === 'ArrowRight') keys.d     = true;
    if (e.code === 'Space')    { keys.space = true; if (generation === myGen) e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.key  === '?') { toggleHelp(); e.preventDefault(); }

    if (serverState && _socket) {
      const myShip = serverState.ships[_myIndex];

      // Toggle upgrade menu
      if (e.code === 'KeyU' && myShip && myShip.pendingUpgrade) {
        _upgradeOpen = !_upgradeOpen;
        e.preventDefault();
      }

      // Upgrade selection (only when menu is open)
      if (_upgradeOpen && myShip && myShip.pendingUpgrade && myShip.upgradePath) {
        const lastId  = myShip.upgradePath[myShip.upgradePath.length - 1];
        const node    = window.UPGRADE_TREE && window.UPGRADE_TREE[lastId];
        const choices = node ? node.next : [];
        if (e.key === '1' && choices[0]) { _socket.emit('choose_upgrade', { nodeId: choices[0] }); _upgradeOpen = false; }
        if (e.key === '2' && choices[1]) { _socket.emit('choose_upgrade', { nodeId: choices[1] }); _upgradeOpen = false; }
        if (e.key === '3' && choices[2]) { _socket.emit('choose_upgrade', { nodeId: choices[2] }); _upgradeOpen = false; }
        if (e.key === '4' && choices[3]) { _socket.emit('choose_upgrade', { nodeId: choices[3] }); _upgradeOpen = false; }
        if (e.key === '5' && choices[4]) { _socket.emit('choose_upgrade', { nodeId: choices[4] }); _upgradeOpen = false; }
      }

      // Thomas_ special controls
      if (_isThomas && myShip && myShip.alive) {
        const living = serverState.ships.filter(s => s.alive && s.index !== _myIndex);
        if (e.code === 'KeyJ') {
          // Select nearest enemy
          if (living.length > 0) {
            let best = -1, bestD = Infinity;
            for (const s of living) {
              const d = Math.hypot(s.x - myShip.x, s.y - myShip.y);
              if (d < bestD) { bestD = d; best = s.index; }
            }
            _selectedTarget = best;
          }
          e.preventDefault();
        }
        if (e.code === 'KeyK') {
          // Cycle through living ships
          if (living.length > 0) {
            const cur = living.findIndex(s => s.index === _selectedTarget);
            _selectedTarget = living[(cur + 1) % living.length].index;
          }
          e.preventDefault();
        }
        if (e.code === 'KeyI') {
          // Auto-target nearest if no lock; server also auto-picks if needed
          let tid = _selectedTarget;
          if (tid < 0) {
            const living = serverState.ships.filter(s => s.alive && s.index !== _myIndex);
            if (living.length > 0) {
              let bestD = Infinity;
              for (const s of living) {
                const d = Math.hypot(s.x - myShip.x, s.y - myShip.y);
                if (d < bestD) { bestD = d; tid = s.index; }
              }
            }
          }
          _socket.emit('fire_missile', { targetIndex: tid });
          e.preventDefault();
        }
        if (e.code === 'KeyO') {
          _socket.emit('fire_salvo');
          e.preventDefault();
        }
        // Power hacks
        if (e.code === 'KeyV') { _socket.emit('thomas_hack', { type: 'dash' });  e.preventDefault(); }
        if (e.code === 'KeyN') { _socket.emit('thomas_hack', { type: 'nova' });  e.preventDefault(); }
        if (e.code === 'KeyG') { _socket.emit('thomas_hack', { type: 'god' });   e.preventDefault(); }
        if (e.code === 'KeyB') { _socket.emit('thomas_hack', { type: 'warp' });  e.preventDefault(); }
        if (e.code === 'KeyE' && !_upgradeOpen) { _socket.emit('thomas_hack', { type: 'emp' }); e.preventDefault(); }
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

  // Show Thomas_-only help rows only for Thomas_
  document.querySelectorAll('.thomas-only').forEach(row => {
    row.style.display = _isThomas ? '' : 'none';
  });

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

const TRAIL_LEN = 28;

function updateShipTrails(state) {
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    if (!shipTrails[ship.index]) shipTrails[ship.index] = [];
    const trail = shipTrails[ship.index];
    trail.push({ x: ship.x, y: ship.y, spd: Math.hypot(ship.vx || 0, ship.vy || 0) });
    if (trail.length > TRAIL_LEN) trail.shift();
  }
}

function drawShipTrails(state) {
  if (!state) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const ship of state.ships) {
    const trail = shipTrails[ship.index];
    if (!trail || trail.length < 2) continue;
    const col = COLORS[ship.index % COLORS.length];
    const r = parseInt(col.slice(1,3),16), g = parseInt(col.slice(3,5),16), b2 = parseInt(col.slice(5,7),16);
    const n = trail.length;
    for (let i = 1; i < n; i++) {
      const a = trail[i - 1], b = trail[i];
      const frac = i / n;            // 0 = oldest, 1 = newest
      const alpha = frac * frac * 0.72;
      const avgSpd = (a.spd + b.spd) * 0.5;
      const lw = 0.8 + Math.min(avgSpd * 0.22, 3.5);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `rgb(${r},${g},${b2})`;
      ctx.lineWidth   = lw;
      ctx.shadowColor = col;
      ctx.shadowBlur  = frac * 8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

function tickBoostTrail(state) {
  // Spawn trail particles behind boosting ships
  for (const ship of state.ships) {
    if (!ship.alive || !ship.boosting) continue;
    for (let i = 0; i < 6; i++) {
      boostTrail.push({
        x:     ship.x - Math.cos(ship.angle) * (SHIP_RADIUS - 2) + (Math.random() - 0.5) * 7,
        y:     ship.y - Math.sin(ship.angle) * (SHIP_RADIUS - 2) + (Math.random() - 0.5) * 7,
        vx:   -Math.cos(ship.angle) * (2.0 + Math.random() * 3.5),
        vy:   -Math.sin(ship.angle) * (2.0 + Math.random() * 3.5),
        life:  1.0,
        decay: 0.038 + Math.random() * 0.032,
        r:     3.5 + Math.random() * 4,
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
    ctx.globalAlpha = p.life * 0.82;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

function drawHackFlashes() {
  if (!hackFlashes.length) return;
  ctx.save();
  for (let i = hackFlashes.length - 1; i >= 0; i--) {
    const f = hackFlashes[i];
    f.r    += f.maxR * 0.07;
    f.life -= 0.05;
    if (f.life <= 0) { hackFlashes.splice(i, 1); continue; }
    const alpha = f.life * f.life * 0.55;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = f.col;
    ctx.shadowColor = f.col;
    ctx.shadowBlur  = 28;
    ctx.lineWidth   = 3 * f.life;
    ctx.beginPath();
    ctx.arc(f.x, f.y, Math.min(f.r, f.maxR), 0, Math.PI * 2);
    ctx.stroke();
    // Inner fill pulse
    ctx.globalAlpha = alpha * 0.18;
    ctx.fillStyle   = f.col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

function drawAimLine(ship) {
  if (!ship || !ship.alive) return;
  const ss = ship.ss || {};
  const spd = (ss.bulletSpd || 12) * 1.5;
  const len = Math.min(spd * 28, 520);
  const nx  = Math.cos(ship.angle);
  const ny  = Math.sin(ship.angle);
  const x0  = ship.x + nx * (SHIP_RADIUS + 4);
  const y0  = ship.y + ny * (SHIP_RADIUS + 4);
  const x1  = x0 + nx * len;
  const y1  = y0 + ny * len;
  ctx.save();
  ctx.setLineDash([6, 9]);
  ctx.lineDashOffset = -(Date.now() * 0.06 % 15);
  ctx.strokeStyle = COLORS[ship.index % COLORS.length];
  ctx.globalAlpha = 0.28;
  ctx.lineWidth   = 1.2;
  ctx.shadowBlur  = 0;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
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
  updateShipTrails(state);
  drawShipTrails(state);
  tickBoostTrail(state);

  for (const b of state.bullets) b.homing ? drawMissile(b, state) : drawBullet(b);
  for (const ship of state.ships) {
    if (ship.alive) drawShip(ship, now);
  }

  // Thomas_ target lock reticle
  if (_isThomas && _selectedTarget >= 0) {
    const tgt = state.ships[_selectedTarget];
    if (tgt && tgt.alive) drawTargetReticle(tgt.x, tgt.y, now);
  }

  // Aim line for local player
  if (myShip && myShip.alive) drawAimLine(myShip);

  // Hack effect rings (world space)
  drawHackFlashes();

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

function drawMissile(b, state) {
  ctx.save();
  const ang  = Math.atan2(b.vy, b.vx);
  const spd  = Math.hypot(b.vx, b.vy) || 1;

  // ── Multi-colour trail ───────────────────────────────────────────
  const trailColors = ['#ffffff','#ffffaa','#ffee44','#ffaa00','#ff6600','#ff2200','#881100'];
  for (let t = 12; t >= 1; t--) {
    const frac  = t / 12;
    const ci    = Math.floor(frac * (trailColors.length - 1));
    ctx.globalAlpha = (1 - frac) * 0.6;
    ctx.fillStyle   = trailColors[Math.min(ci, trailColors.length - 1)];
    const tx = b.x - (b.vx / spd) * t * 2.8;
    const ty = b.y - (b.vy / spd) * t * 2.8;
    ctx.beginPath();
    ctx.arc(tx, ty, (BULLET_RADIUS + 2) * (1 - frac * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Sparks ───────────────────────────────────────────────────────
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 5; i++) {
    const sf  = (i / 5 + (b.born * 0.07 + i * 1.3) % 1) % 1;
    const sx  = b.x - (b.vx / spd) * sf * 22 + (Math.sin(b.born * 0.1 + i * 2.4) * 4);
    const sy  = b.y - (b.vy / spd) * sf * 22 + (Math.cos(b.born * 0.1 + i * 1.7) * 4);
    ctx.fillStyle = i % 2 === 0 ? '#ffdd44' : '#ff6600';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Outer glow ───────────────────────────────────────────────────
  ctx.globalAlpha = 1;
  ctx.shadowColor = '#ff4400';
  ctx.shadowBlur  = 30;
  ctx.fillStyle   = '#ff5500';
  ctx.beginPath();
  ctx.arc(b.x, b.y, BULLET_RADIUS + 3, 0, Math.PI * 2);
  ctx.fill();

  // ── Rocket body (elongated capsule along velocity) ───────────────
  ctx.shadowBlur = 14;
  ctx.fillStyle  = '#ffcc44';
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.ellipse(0, 0, BULLET_RADIUS + 3, BULLET_RADIUS * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose cone
  ctx.fillStyle  = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(BULLET_RADIUS + 3, 0);
  ctx.lineTo(BULLET_RADIUS - 1, -2.5);
  ctx.lineTo(BULLET_RADIUS - 1,  2.5);
  ctx.closePath();
  ctx.fill();

  // Fins
  ctx.fillStyle  = '#ff3300';
  ctx.shadowBlur = 0;
  const finL = -(BULLET_RADIUS + 1);
  ctx.beginPath();
  ctx.moveTo(finL, 0); ctx.lineTo(finL - 5, -6); ctx.lineTo(finL, -3); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(finL, 0); ctx.lineTo(finL - 5,  6); ctx.lineTo(finL,  3); ctx.closePath(); ctx.fill();

  ctx.restore();

  // ── Engine plume ─────────────────────────────────────────────────
  ctx.shadowBlur = 0;
  const plumeDist = BULLET_RADIUS + 3;
  const px = b.x - Math.cos(ang) * plumeDist;
  const py = b.y - Math.sin(ang) * plumeDist;
  const pg = ctx.createRadialGradient(px, py, 0, px, py, 8);
  pg.addColorStop(0,   'rgba(255,255,200,0.9)');
  pg.addColorStop(0.3, 'rgba(255,150,0,0.6)');
  pg.addColorStop(1,   'rgba(255,0,0,0)');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

function drawTargetReticle(x, y, now) {
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
  const r     = 26 + pulse * 6;
  ctx.save();
  ctx.strokeStyle = '#ff4400';
  ctx.shadowColor = '#ff4400';
  ctx.shadowBlur  = 14;
  ctx.lineWidth   = 1.5;
  ctx.globalAlpha = 0.55 + pulse * 0.35;

  // Corner brackets
  const b = 10;
  for (let s = -1; s <= 1; s += 2) {
    for (let t = -1; t <= 1; t += 2) {
      ctx.beginPath();
      ctx.moveTo(x + s * r, y + t * r - t * b);
      ctx.lineTo(x + s * r, y + t * r);
      ctx.lineTo(x + s * r - s * b, y + t * r);
      ctx.stroke();
    }
  }

  // Cross hairs
  ctx.globalAlpha = 0.2;
  ctx.beginPath(); ctx.moveTo(x - r - 8, y); ctx.lineTo(x - r + 4, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + r + 8, y); ctx.lineTo(x + r - 4, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - r - 8); ctx.lineTo(x, y - r + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + r + 8); ctx.lineTo(x, y + r - 4); ctx.stroke();

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// DRAW: SHIP  (branch/tier-aware hull + decorations)
// ─────────────────────────────────────────────────────────────

// Hull polygon vertices for each branch × tier range (local coords, facing right)
function _shipPts(branch, tier, sub) {
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
    case 'D': // Drone — flat wide shape with notched rear
      if (tier >= 9) return [[ 14, 0], [-8,-22], [-4,-8], [-12,0], [-4, 8], [-8, 22]];
      if (tier >= 6) return [[ 14, 0], [-8,-19], [-4,-7], [-10,0], [-4, 7], [-8, 19]];
      if (tier >= 3) return [[ 14, 0], [-7,-16], [-3,-6], [ -9,0], [-3, 6], [-7, 16]];
      return         [[ 13, 0], [-6,-13], [-2,-5], [ -8,0], [-2, 5], [-6, 13]];
    case 'E': // Energy — diamond with swept forward prongs
      if (tier >= 9) return [[ 26, 0], [ 8,-6], [-10,-10], [-8,0], [-10, 10], [ 8, 6]];
      if (tier >= 6) return [[ 24, 0], [ 7,-5], [ -9, -9], [-7,0], [ -9,  9], [ 7, 5]];
      if (tier >= 3) return [[ 22, 0], [ 6,-4], [ -8, -8], [-6,0], [ -8,  8], [ 6, 4]];
      return         [[ 20, 0], [ 5,-4], [ -7, -7], [-5,0], [ -7,  7], [ 5, 4]];
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
  } else if (branch === 'D') {
    // Orbiting drone dots
    if (tier >= 3) {
      const numDrones = Math.min(4, 1 + Math.floor(tier / 3));
      for (let i = 0; i < numDrones; i++) {
        const a = now * 0.003 + (i / numDrones) * Math.PI * 2;
        const dr = 18 + tier * 1.2;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * dr, Math.sin(a) * dr, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  } else if (branch === 'E') {
    // Energy arcs
    if (tier >= 3) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;
      ctx.globalAlpha = 0.3 + 0.15 * Math.sin(now * 0.01 + shipIdx);
      ctx.beginPath();
      ctx.arc(0, 0, 14 + tier * 1.5, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 14 + tier * 1.5, Math.PI - 0.6, Math.PI + 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
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
  const sub    = (ship.upgradePath || []).some(id => id.endsWith('b')) ? 'b' : 'a';
  const pts    = _shipPts(branch, tier, sub);
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
    ctx.font        = 'bold 14px monospace';
    ctx.fillStyle   = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 6;
    ctx.textAlign   = 'left';
    ctx.fillText(myShip.name + ' ◄', 14, 26);

    drawHearts(14, 44, myShip.health, myShip.maxHealth || 5, col, 'left');
    drawBoostBar(14, 62, myShip.lastBoost || 0, (myShip.ss && myShip.ss.boostCd) || 3500, col, 'left');

    // XP progress bar
    const xpPer    = (window.XP_PER_TIER || 150);
    const xpNeeded = (myShip.tier + 1) * xpPer;
    const xpFill   = myShip.tier >= 20 ? 1 : Math.min(1, myShip.xp / xpNeeded);
    const barW = 70, barH = 5, bx = 14;
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#111128';
    ctx.fillRect(bx, 82, barW, barH);
    ctx.fillStyle   = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = xpFill >= 1 ? 7 : 0;
    ctx.fillRect(bx, 82, barW * xpFill, barH);
    ctx.shadowBlur  = 0;
    ctx.font        = '10px monospace';
    ctx.fillStyle   = myShip.tier >= 20 ? col : '#44446a';
    ctx.textAlign   = 'left';
    const tierLabel = myShip.tier >= 20 ? 'MAX TIER' : `T${myShip.tier}  ${myShip.xp} / ${xpNeeded} XP`;
    ctx.fillText(tierLabel, 14, 100);

    // Difficulty label
    const diffLabel = { easy: 'EASY', medium: 'MED', beast: 'BEAST', none: 'NONE' }[_difficulty] || '';
    const diffCol   = _difficulty === 'beast' ? '#ff4444' : _difficulty === 'easy' ? '#44ff88' : _difficulty === 'none' ? '#888888' : '#4488ff';
    ctx.font        = '10px monospace';
    ctx.fillStyle   = diffCol;
    ctx.shadowColor = diffCol;
    ctx.shadowBlur  = 3;
    ctx.fillText(`BOTS: ${diffLabel}`, 14, 114);
    ctx.shadowBlur  = 0;

    // Thomas_ missile bar — always ready (no cooldown)
    if (_isThomas) {
      ctx.fillStyle  = '#ff4400';
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur  = 8;
      ctx.font        = '11px monospace';
      ctx.fillStyle   = '#ff6622';
      ctx.fillText('MISSILE [I] · SALVO [O]  (auto-target)', 14, 140);
      ctx.shadowBlur  = 0;
      ctx.font        = '9px monospace';
      ctx.fillStyle   = '#554422';
      ctx.fillText('[J] lock nearest  [K] cycle target', 14, 152);
    }
  }

  // Upgrade available banner (top centre, pulsing)
  if (myShip && myShip.pendingUpgrade && !_upgradeOpen) {
    const pulse = 0.65 + 0.35 * Math.sin(Date.now() * 0.005);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 15px monospace';
    ctx.fillStyle   = '#ffff44';
    ctx.shadowColor = '#ffff44';
    ctx.shadowBlur  = 18;
    ctx.fillText('⬆  UPGRADE READY  —  press [U]', ARENA_W / 2, 28);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Upgrade panel (only when [U] was pressed)
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

const BRANCH_LABELS = { S: 'SPEED', F: 'FIREPOWER', T: 'TANK', D: 'DRONE', E: 'ENERGY' };
const BRANCH_DESCS  = {
  S: 'Movement speed & dash',
  F: 'Bullet damage & fire rate',
  T: 'Health, shields & resistance',
  D: 'Max bullets & fire rate burst',
  E: 'Bullet speed & piercing power',
};

function _branchCol(ch) {
  return ch === 'S' ? '#00ffdd' : ch === 'F' ? '#ff8844' : ch === 'T' ? '#88aaff' : ch === 'D' ? '#aaff44' : '#cc44ff';
}
function _rarityCol(tier) {
  return tier >= 20 ? '#ffd700' : tier >= 16 ? '#ff5522' : tier >= 12 ? '#dd88ff' : tier >= 8 ? '#4499ff' : tier >= 4 ? '#44ff99' : '#aaaacc';
}
function _rarityLabel(tier) {
  return tier >= 20 ? 'LEGENDARY' : tier >= 16 ? 'MYTHIC' : tier >= 12 ? 'EPIC' : tier >= 8 ? 'RARE' : tier >= 4 ? 'UNCOMMON' : 'COMMON';
}
function _roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

function drawUpgradePanel(state) {
  if (!_upgradeOpen) return;
  const myShip = state.ships[_myIndex];
  if (!myShip || !myShip.pendingUpgrade || !myShip.upgradePath) { _upgradeOpen = false; return; }

  const tree   = window.UPGRADE_TREE;
  if (!tree) return;
  const lastId = myShip.upgradePath[myShip.upgradePath.length - 1];
  const node   = tree[lastId];
  if (!node || !node.next.length) return;
  const choices = node.next;
  const isRoot  = lastId === 'root';
  const nowMs   = performance.now();

  // Card dimensions — shrink slightly when many choices
  const n      = choices.length;
  const cardW  = n >= 5 ? 174 : n >= 4 ? 192 : 222;
  const cardH  = isRoot ? 196 : 210;
  const gap    = n >= 5 ? 8 : 12;
  const total  = cardW * n + gap * (n - 1);
  const startX = (ARENA_W - total) / 2;
  const panelY = Math.round(ARENA_H / 2 - cardH / 2) - 10;

  ctx.save();

  // ── Full-screen dim + subtle animated scanlines ───────────────────────
  ctx.fillStyle = 'rgba(0,0,14,0.82)';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.strokeStyle = 'rgba(80,80,200,0.028)';
  ctx.lineWidth   = 1;
  for (let sl = 0; sl < ARENA_H; sl += 3) {
    ctx.beginPath(); ctx.moveTo(0, sl); ctx.lineTo(ARENA_W, sl); ctx.stroke();
  }

  // ── Header ────────────────────────────────────────────────────────────
  const tierNum   = myShip.tier + 1;
  const hdrCol    = _rarityCol(tierNum);
  const headerY   = panelY - 44;

  // Glowing title bar
  ctx.fillStyle   = `rgba(${tierNum >= 20 ? '40,30,0' : tierNum >= 16 ? '40,10,0' : tierNum >= 12 ? '28,0,40' : tierNum >= 8 ? '0,16,40' : '0,28,18'},0.7)`;
  _roundRect(ARENA_W / 2 - 220, headerY - 18, 440, 28, 6);
  ctx.fill();
  ctx.strokeStyle = hdrCol; ctx.lineWidth = 1; ctx.shadowColor = hdrCol; ctx.shadowBlur = 16;
  _roundRect(ARENA_W / 2 - 220, headerY - 18, 440, 28, 6);
  ctx.stroke();
  ctx.shadowBlur  = 0;

  ctx.textAlign   = 'center';
  ctx.font        = 'bold 16px monospace';
  ctx.fillStyle   = hdrCol;
  ctx.shadowColor = hdrCol; ctx.shadowBlur = 18;
  ctx.fillText(isRoot ? '◈  CHOOSE YOUR PATH  ◈' : `◈  TIER ${tierNum} UPGRADE  ◈`, ARENA_W / 2, headerY);
  ctx.shadowBlur  = 0;

  // Sub-hint
  const keyHint = choices.map((_, i) => i + 1).join(' / ');
  ctx.font      = '10px monospace';
  ctx.fillStyle = '#334466';
  ctx.fillText(`Press [ ${keyHint} ] to select  ·  [U] to close`, ARENA_W / 2, headerY + 18);

  if (_isThomas) {
    ctx.font      = '9px monospace';
    ctx.fillStyle = '#ff6622';
    ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 4;
    ctx.fillText('✦ MISSILE: [J] lock  [K] cycle  [I] fire  [O] salvo', ARENA_W / 2, headerY + 32);
    ctx.shadowBlur = 0;
  }

  // ── Cards ─────────────────────────────────────────────────────────────
  const curStats = window.computeShipStats ? window.computeShipStats(myShip.upgradePath) : null;

  choices.forEach((id, idx) => {
    const cn  = tree[id];
    if (!cn) return;
    const cx  = startX + idx * (cardW + gap);
    const bch = id[0];
    const col = _branchCol(bch);
    const rar = _rarityCol(cn.tier);
    const pulse = 0.55 + 0.45 * Math.sin(nowMs * 0.0028 + idx * 1.4);
    const newStats = (curStats && window.computeShipStats) ? window.computeShipStats([...myShip.upgradePath, id]) : null;

    // ── Background gradient ─────────────────────────────────────────────
    const bgMap = { S:'0,20,18', F:'24,8,0', T:'4,8,28', D:'8,24,0', E:'18,0,28' };
    const bgRgb = bgMap[bch] || '6,6,20';
    const bg    = ctx.createLinearGradient(cx, panelY, cx + cardW, panelY + cardH);
    bg.addColorStop(0,   `rgba(5,5,18,0.97)`);
    bg.addColorStop(0.35,`rgba(${bgRgb},0.94)`);
    bg.addColorStop(0.7, `rgba(${bgRgb},0.88)`);
    bg.addColorStop(1,   `rgba(3,3,14,0.98)`);
    ctx.fillStyle = bg;
    _roundRect(cx, panelY, cardW, cardH, 10);
    ctx.fill();

    // Subtle inner highlight at top
    const shine = ctx.createLinearGradient(cx, panelY, cx, panelY + 40);
    shine.addColorStop(0, `rgba(255,255,255,0.07)`);
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    _roundRect(cx + 1, panelY + 1, cardW - 2, 38, 9);
    ctx.fill();

    // Animated glowing border
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.8;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 14 * pulse;
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    _roundRect(cx, panelY, cardW, cardH, 10);
    ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // Corner brackets (decorative)
    ctx.strokeStyle = rar; ctx.lineWidth = 1.5;
    ctx.shadowColor = rar; ctx.shadowBlur = 8;
    const bl = 14;
    [[cx+5,panelY+5,1,1],[cx+cardW-5,panelY+5,-1,1],[cx+5,panelY+cardH-5,1,-1],[cx+cardW-5,panelY+cardH-5,-1,-1]].forEach(([bx,by,sx,sy]) => {
      ctx.beginPath();
      ctx.moveTo(bx, by + sy*bl); ctx.lineTo(bx, by); ctx.lineTo(bx + sx*bl, by);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // ── Key badge ────────────────────────────────────────────────────────
    ctx.fillStyle   = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.font        = 'bold 10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`[${idx+1}]`, cx + 9, panelY + 17);
    ctx.shadowBlur  = 0;

    // Rarity pill (top-right)
    ctx.font      = 'bold 8px monospace';
    ctx.fillStyle = rar; ctx.shadowColor = rar; ctx.shadowBlur = 6;
    ctx.textAlign = 'right';
    ctx.fillText(_rarityLabel(cn.tier), cx + cardW - 8, panelY + 17);
    ctx.shadowBlur = 0;

    // ── Upgrade name ─────────────────────────────────────────────────────
    const nameFontSz = n >= 5 ? 11 : 13;
    ctx.font        = `bold ${nameFontSz}px monospace`;
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.textAlign   = 'center';
    ctx.fillText(cn.name, cx + cardW / 2, panelY + 34);
    ctx.shadowBlur  = 0;

    // Branch label + desc (root only)
    if (isRoot) {
      ctx.font      = '11px monospace';
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.fillText(BRANCH_LABELS[bch] || bch, cx + cardW / 2, panelY + 52);
      ctx.shadowBlur = 0;
      ctx.font      = '9px monospace'; ctx.fillStyle = '#445566';
      ctx.fillText(BRANCH_DESCS[bch] || '', cx + cardW / 2, panelY + 65);
    }

    // ── Divider line ─────────────────────────────────────────────────────
    const divY = isRoot ? panelY + 74 : panelY + 44;
    const dg   = ctx.createLinearGradient(cx + 8, 0, cx + cardW - 8, 0);
    dg.addColorStop(0, 'rgba(255,255,255,0)');
    dg.addColorStop(0.4, col); dg.addColorStop(0.6, col);
    dg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = dg; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(cx + 8, divY); ctx.lineTo(cx + cardW - 8, divY); ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Stat rows (before → after comparison) ────────────────────────────
    const stats = cn.stats;
    const statDefs = [
      { key:'thrust',     label:'ACCEL',     max:0.12, fmtA: v=>`${v.toFixed(2)}`,  inv:false },
      { key:'maxSpd',     label:'SPEED',     max:4.0,  fmtA: v=>`${v.toFixed(1)}`,  inv:false },
      { key:'boostCd',    label:'DASH CD',   max:3500, fmtA: v=>`${v}ms`,            inv:true  },
      { key:'rotate',     label:'TURN',      max:0.20, fmtA: v=>`${v.toFixed(3)}`,  inv:false },
      { key:'shootCd',    label:'FIRE CD',   max:300,  fmtA: v=>`${v}ms`,            inv:true  },
      { key:'bulletDmg',  label:'DAMAGE',    max:20,   fmtA: v=>`${v}`,              inv:false },
      { key:'maxBullets', label:'BULLETS',   max:15,   fmtA: v=>`${v}`,              inv:false },
      { key:'bulletSpd',  label:'PROJ SPD',  max:60,   fmtA: v=>`${v}`,              inv:false },
      { key:'health',     label:'HEALTH',    max:60,   fmtA: v=>`${v}HP`,            inv:false },
      { key:'regenRate',  label:'REGEN',     max:20,   fmtA: v=>`${v}/s`,            inv:false },
      { key:'dmgReduce',  label:'ARMOR',     max:0.80, fmtA: v=>`${Math.round(v*100)}%`, inv:false },
      { key:'drag',       label:'DRIFT',     max:0.998,fmtA: v=>`${v.toFixed(3)}`,  inv:false },
    ];

    const rows    = statDefs.filter(d => stats[d.key]);
    const maxShow = isRoot ? 2 : 4;
    const barX    = cx + 8;
    const barW    = cardW - 16;
    const barH    = 4;
    let   ry      = divY + 12;

    rows.slice(0, maxShow).forEach(d => {
      const val   = stats[d.key];
      const cur   = curStats ? curStats[d.key] : null;
      const next  = newStats ? newStats[d.key] : null;
      const fill  = Math.min(1, (next != null ? next : Math.abs(val)) / d.max);

      // Bar track
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(barX, ry, barW, barH);

      // Bar fill
      const bfg = ctx.createLinearGradient(barX, 0, barX + barW * fill, 0);
      bfg.addColorStop(0, col); bfg.addColorStop(1, rar);
      ctx.fillStyle = bfg;
      ctx.shadowColor = col; ctx.shadowBlur = 4;
      ctx.fillRect(barX, ry, barW * fill, barH);
      ctx.shadowBlur = 0;

      // Nub
      ctx.fillStyle = rar; ctx.shadowColor = rar; ctx.shadowBlur = 6;
      ctx.fillRect(barX + barW * fill - 1, ry - 1, 2, barH + 2);
      ctx.shadowBlur = 0;

      // Stat label left, before→after right
      ctx.font = '8px monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = '#445577';
      ctx.fillText(d.label, barX, ry - 2);

      if (cur != null && next != null) {
        const improved = d.inv ? next < cur : next > cur;
        ctx.fillStyle   = improved ? '#66ff88' : col;
        ctx.textAlign   = 'right';
        ctx.font        = '8px monospace';
        ctx.fillText(`${d.fmtA(cur)} → ${d.fmtA(next)}`, cx + cardW - 8, ry - 2);
      } else {
        const dStr = d.inv ? `-${Math.abs(val)}` : `+${val}`;
        ctx.fillStyle = col; ctx.textAlign = 'right';
        ctx.fillText(dStr, cx + cardW - 8, ry - 2);
      }

      ry += 19;
    });

    // ── Tier badge (bottom-center) ────────────────────────────────────────
    const tierBadge = cn.tier >= 20 ? '★ MAX' : `T${cn.tier}`;
    ctx.font      = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = rar; ctx.shadowColor = rar; ctx.shadowBlur = 8;
    ctx.fillText(tierBadge, cx + cardW / 2, panelY + cardH - 8);
    ctx.shadowBlur = 0;

    // ── Sub-branch indicator ──────────────────────────────────────────────
    // Show a small tag if this is a c/d sub-branch
    const isCPath = id.endsWith('c') || id.endsWith('d');
    if (isCPath) {
      ctx.font      = '8px monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = '#ffaa22'; ctx.shadowColor = '#ffaa22'; ctx.shadowBlur = 5;
      ctx.fillText('⬡ NEW PATH', cx + 8, panelY + cardH - 8);
      ctx.shadowBlur = 0;
    }
  });

  ctx.restore();
}

function drawMinimap(state) {
  const MW = 240, MH = 180;
  const MX = ARENA_W - MW - 10, MY = ARENA_H - MH - 10;
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
    const col    = COLORS[ship.index % COLORS.length];
    const isMe   = ship.index === _myIndex;
    const isLock = _isThomas && ship.index === _selectedTarget;
    ctx.fillStyle   = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = isMe ? 10 : isLock ? 12 : 0;
    ctx.beginPath();
    ctx.arc(MX + ship.x * sx, MY + ship.y * sy, isMe ? 4.5 : isLock ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (isLock) {
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth   = 1.2;
      ctx.beginPath();
      ctx.arc(MX + ship.x * sx, MY + ship.y * sy, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Label
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 0.4;
  ctx.font        = '9px monospace';
  ctx.fillStyle   = '#88aacc';
  ctx.textAlign   = 'right';
  ctx.fillText('[?] controls', MX + MW - 5, MY + MH - 4);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawKillFeed() {
  const now = Date.now();
  killFeed = killFeed.filter(k => now - k.at < 5000);
  if (!killFeed.length) return;
  ctx.font = '12px monospace';
  ctx.shadowBlur = 0;
  for (let i = 0; i < killFeed.length; i++) {
    const k     = killFeed[i];
    const alpha = Math.max(0, 1 - (now - k.at) / 5000);
    const y     = ARENA_H - 200 - (killFeed.length - 1 - i) * 18;
    const kCol  = COLORS[k.killerIndex % COLORS.length];
    const vCol  = COLORS[k.victimIndex % COLORS.length];
    const kW    = k.killerName.length * 7.2;
    ctx.globalAlpha = alpha;
    ctx.textAlign   = 'left';
    ctx.fillStyle   = kCol;
    ctx.shadowColor = kCol;
    ctx.shadowBlur  = 4;
    ctx.fillText(k.killerName, 12, y);
    ctx.fillStyle  = '#555577';
    ctx.shadowBlur = 0;
    ctx.fillText(' ✕ ', 12 + kW, y);
    ctx.fillStyle   = vCol;
    ctx.shadowColor = vCol;
    ctx.shadowBlur  = 4;
    ctx.fillText(k.victimName, 12 + kW + 22, y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

function drawLeaderboard(state) {
  const sorted = [...state.ships].sort((a, b) => b.kills - a.kills);
  const x = ARENA_W - 14;
  let y = 26;

  ctx.font      = 'bold 12px monospace';
  ctx.fillStyle = '#3a3a6a';
  ctx.shadowBlur = 0;
  ctx.textAlign = 'right';
  ctx.fillText('KILLS', x, y);
  y += 16;

  for (const ship of sorted) {
    const col  = COLORS[ship.index % COLORS.length];
    const isMe = ship.index === _myIndex;
    ctx.font        = isMe ? 'bold 12px monospace' : '11px monospace';
    ctx.fillStyle   = ship.isBot ? '#3a3a5a' : col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = isMe ? 5 : 0;
    ctx.fillText(`${ship.kills}  ${ship.name}${isMe ? ' ◄' : ''}`, x, y);
    y += 15;
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
