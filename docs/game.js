'use strict';

// ─────────────────────────────────────────────────────────────
// SHARED CONSTANTS  (must match server.js)
// ─────────────────────────────────────────────────────────────

const ARENA_W       = 800;
const ARENA_H       = 600;
const SHIP_RADIUS   = 16;
const BULLET_RADIUS = 4;
const COLORS        = ['#00ffff', '#ff00ff'];   // cyan, magenta

// ─────────────────────────────────────────────────────────────
// MODULE STATE
// ─────────────────────────────────────────────────────────────

let canvas, ctx;
let _socket, _myIndex;
let serverState  = null;
let prevState    = null;      // previous tick — used to detect ship deaths
let generation   = 0;        // incremented on stopGame() to kill stale rAF loops
let helpVisible  = false;
let helpTimer    = null;
let stars        = [];
let explosions   = [];
let lastInputSend = 0;

const keys = { w: false, a: false, s: false, d: false, space: false };

// ─────────────────────────────────────────────────────────────
// PUBLIC API  (called by lobby.js)
// ─────────────────────────────────────────────────────────────

function initGame(sock, initialState, yourIndex) {
  _socket      = sock;
  _myIndex     = yourIndex;
  serverState  = initialState;
  prevState    = null;
  explosions   = [];
  generation++;
  const myGen  = generation;

  // Clear any stuck keys from a previous game
  keys.w = keys.a = keys.s = keys.d = keys.space = false;

  canvas = document.getElementById('canvas');
  ctx    = canvas.getContext('2d');

  // Star field — each star has a twinkle speed & phase
  stars = Array.from({ length: 130 }, () => ({
    x:     Math.random() * ARENA_W,
    y:     Math.random() * ARENA_H,
    r:     Math.random() * 1.4 + 0.2,
    alpha: Math.random() * 0.45 + 0.15,
    speed: 0.4 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2
  }));

  // Listen for state updates — track previous state for transition detection
  _socket.off('game_tick');
  _socket.on('game_tick', ({ gameState }) => {
    prevState   = serverState;
    serverState = gameState;
    checkTransitions();
  });

  // Keyboard listeners
  window.onkeydown = e => {
    if (e.code === 'KeyW')    keys.w     = true;
    if (e.code === 'KeyA')    keys.a     = true;
    if (e.code === 'KeyS')    keys.s     = true;
    if (e.code === 'KeyD')    keys.d     = true;
    if (e.code === 'Space') { keys.space = true; if (generation === myGen) e.preventDefault(); }
    if (e.key  === '?')       toggleHelp();
  };
  window.onkeyup = e => {
    if (e.code === 'KeyW')  keys.w     = false;
    if (e.code === 'KeyA')  keys.a     = false;
    if (e.code === 'KeyS')  keys.s     = false;
    if (e.code === 'KeyD')  keys.d     = false;
    if (e.code === 'Space') keys.space = false;
  };
  // Release all keys if window loses focus (prevents stuck movement)
  window.onblur = () => {
    keys.w = keys.a = keys.s = keys.d = keys.space = false;
  };

  // Show help briefly at game start
  showHelp();
  helpTimer = setTimeout(hideHelp, 3200);

  // Render loop — throttle input sends to ~30 fps (matches server tick rate)
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
  keys.w = keys.a = keys.s = keys.d = keys.space = false;
  window.onkeydown = null;
  window.onkeyup   = null;
  window.onblur    = null;
  if (helpTimer) { clearTimeout(helpTimer); helpTimer = null; }
}

// ─────────────────────────────────────────────────────────────
// TRANSITION DETECTION  (ship death → explosion)
// ─────────────────────────────────────────────────────────────

function checkTransitions() {
  if (!prevState || !serverState) return;
  for (const ship of serverState.ships) {
    const prev = prevState.ships[ship.index];
    if (prev && prev.alive && !ship.alive) {
      spawnExplosion(ship.x, ship.y, COLORS[ship.index]);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPLOSION PARTICLES
// ─────────────────────────────────────────────────────────────

function spawnExplosion(x, y, color) {
  for (let i = 0; i < 18; i++) {
    const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.4;
    const speed = 1.5 + Math.random() * 4.5;
    explosions.push({
      x, y,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      life:  1.0,
      decay: 0.022 + Math.random() * 0.018,
      color,
      r:     2 + Math.random() * 3
    });
  }
}

function updateDrawExplosions() {
  ctx.save();
  for (let i = explosions.length - 1; i >= 0; i--) {
    const p = explosions[i];
    p.x    += p.vx;
    p.y    += p.vy;
    p.vx   *= 0.94;
    p.vy   *= 0.94;
    p.life -= p.decay;
    if (p.life <= 0) { explosions.splice(i, 1); continue; }
    ctx.globalAlpha = p.life * p.life;   // quadratic fade looks nicer
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

function render(state, now) {
  // Background
  ctx.fillStyle = '#07071a';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // Twinkling stars
  for (const s of stars) {
    const a = s.alpha * (0.65 + 0.35 * Math.sin(now * s.speed * 0.001 + s.phase));
    ctx.globalAlpha = a;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Arena border glow
  ctx.strokeStyle = 'rgba(0,255,255,0.08)';
  ctx.lineWidth   = 2;
  ctx.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2);

  // Explosion particles (behind everything)
  updateDrawExplosions();

  // Bullets with trails
  for (const b of state.bullets) drawBullet(b);

  // Ships
  for (const ship of state.ships) {
    if (ship.alive) drawShip(ship, now);
  }

  // HUD on top
  drawHUD(state, now);
}

// ─────────────────────────────────────────────────────────────
// DRAW: BULLET  (with motion trail)
// ─────────────────────────────────────────────────────────────

function drawBullet(b) {
  const col = COLORS[b.ownerIndex];
  ctx.save();

  // Motion trail — 3 fading circles behind the bullet
  for (let t = 3; t >= 1; t--) {
    ctx.globalAlpha = ((4 - t) / 4) * 0.22;
    ctx.fillStyle   = col;
    ctx.beginPath();
    ctx.arc(
      b.x - b.vx * t * 1.3,
      b.y - b.vy * t * 1.3,
      BULLET_RADIUS * (1 - t * 0.18),
      0, Math.PI * 2
    );
    ctx.fill();
  }

  // Main bullet
  ctx.globalAlpha = 1;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 14;
  ctx.fillStyle   = col;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// DRAW: SHIP  (blinks when invincible)
// ─────────────────────────────────────────────────────────────

function drawShip(ship, now) {
  const col  = COLORS[ship.index];
  const isMe = ship.index === _myIndex;

  // Blink every 100 ms while invincible (skip every other frame)
  if (ship.invincible && Math.floor(now / 100) % 2 === 0) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Thrust flame
  if (ship.thrustOn) {
    const flicker = 8 + Math.random() * 10;
    const grad    = ctx.createLinearGradient(-SHIP_RADIUS, 0, -SHIP_RADIUS - flicker, 0);
    grad.addColorStop(0, `rgba(255,${100 + (Math.random() * 120) | 0},0,0.9)`);
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-12, -6);
    ctx.lineTo(-SHIP_RADIUS - flicker, 0);
    ctx.lineTo(-12,  6);
    ctx.fill();
  }

  // Ship body — isoceles triangle, nose pointing +x
  ctx.strokeStyle = col;
  ctx.lineWidth   = isMe ? 2.5 : 1.8;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isMe ? 18 : 8;
  ctx.beginPath();
  ctx.moveTo( 18,   0);   // nose
  ctx.lineTo(-12, -10);   // left wing
  ctx.lineTo( -6,   0);   // tail notch
  ctx.lineTo(-12,  10);   // right wing
  ctx.closePath();
  ctx.stroke();

  ctx.restore();

  // Name tag in world space
  ctx.save();
  ctx.font        = `${isMe ? 'bold ' : ''}11px monospace`;
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isMe ? 8 : 4;
  ctx.textAlign   = 'center';
  ctx.fillText(ship.name + (isMe ? ' ◄' : ''), ship.x, ship.y - 26);
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

  // P2 — top right
  ctx.fillStyle   = COLORS[1];
  ctx.shadowColor = COLORS[1];
  ctx.textAlign   = 'right';
  ctx.fillText(s1.name, ARENA_W - 12, 22);
  drawHearts(ARENA_W - 12, 36, s1.health, COLORS[1], 'right');

  // Round + score — top centre
  ctx.shadowBlur  = 0;
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#8888b8';
  ctx.font        = '10px monospace';
  ctx.fillText(`ROUND ${state.round}`, ARENA_W / 2, 18);
  ctx.font        = 'bold 20px monospace';
  ctx.fillStyle   = '#ffffff';
  ctx.fillText(`${state.scores[0]}  –  ${state.scores[1]}`, ARENA_W / 2, 38);

  // Round-over banner + next-round countdown
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

    // Countdown using server timestamp
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

  // Controls hint — bottom right corner
  ctx.shadowBlur  = 0;
  ctx.font        = '10px monospace';
  ctx.fillStyle   = '#2c2c50';
  ctx.textAlign   = 'right';
  ctx.fillText('[?] controls', ARENA_W - 8, ARENA_H - 8);

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// DRAW: HEARTS  (health pips)
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
