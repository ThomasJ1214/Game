'use strict';

// ─────────────────────────────────────────────────────────────
// SHARED CONSTANTS  (must match server.js)
// ─────────────────────────────────────────────────────────────

const ARENA_W      = 800;
const ARENA_H      = 600;
const SHIP_RADIUS  = 16;
const BULLET_RADIUS = 4;

const COLORS     = ['#00ffff', '#ff00ff'];   // cyan, magenta
const GLOW_ALPHA = ['rgba(0,255,255,', 'rgba(255,0,255,'];

// ─────────────────────────────────────────────────────────────
// MODULE STATE
// ─────────────────────────────────────────────────────────────

let canvas, ctx;
let _socket, _myIndex;
let serverState  = null;
let generation   = 0;       // incremented on stopGame() to kill old rAF loops
let helpVisible  = false;
let helpTimer    = null;
let stars        = [];

const keys = { w: false, a: false, s: false, d: false, space: false };

// ─────────────────────────────────────────────────────────────
// PUBLIC API  (called by lobby.js)
// ─────────────────────────────────────────────────────────────

function initGame(sock, initialState, yourIndex) {
  _socket     = sock;
  _myIndex    = yourIndex;
  serverState = initialState;
  generation++;                 // invalidates any previous rAF loop
  const myGen = generation;

  // Reset keys so nothing is "stuck" from a previous game
  keys.w = keys.a = keys.s = keys.d = keys.space = false;

  canvas = document.getElementById('canvas');
  ctx    = canvas.getContext('2d');

  // Generate a static star field once per game
  stars = Array.from({ length: 130 }, () => ({
    x:     Math.random() * ARENA_W,
    y:     Math.random() * ARENA_H,
    r:     Math.random() * 1.4 + 0.2,
    alpha: Math.random() * 0.55 + 0.15
  }));

  // Listen for state updates from the server
  _socket.off('game_tick');
  _socket.on('game_tick', ({ gameState }) => { serverState = gameState; });

  // Keyboard listeners (replace any old ones)
  window.onkeydown = e => {
    if (e.code === 'KeyW')     keys.w     = true;
    if (e.code === 'KeyA')     keys.a     = true;
    if (e.code === 'KeyS')     keys.s     = true;
    if (e.code === 'KeyD')     keys.d     = true;
    if (e.code === 'Space')  { keys.space = true;  if (generation === myGen) e.preventDefault(); }
    if (e.key  === '?')        toggleHelp();
  };
  window.onkeyup = e => {
    if (e.code === 'KeyW')  keys.w     = false;
    if (e.code === 'KeyA')  keys.a     = false;
    if (e.code === 'KeyS')  keys.s     = false;
    if (e.code === 'KeyD')  keys.d     = false;
    if (e.code === 'Space') keys.space = false;
  };

  // Show help briefly on game start
  showHelp();
  helpTimer = setTimeout(hideHelp, 3200);

  // Start render loop
  function loop() {
    if (generation !== myGen) return;   // stale loop — exit
    if (_socket && _socket.connected) {
      _socket.emit('player_input', { keys: { ...keys } });
    }
    if (serverState) render(serverState);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function stopGame() {
  generation++;                   // kills the running rAF loop
  keys.w = keys.a = keys.s = keys.d = keys.space = false;
  window.onkeydown = null;
  window.onkeyup   = null;
  if (helpTimer) { clearTimeout(helpTimer); helpTimer = null; }
}

// ─────────────────────────────────────────────────────────────
// HELP OVERLAY
// ─────────────────────────────────────────────────────────────

function showHelp() {
  helpVisible = true;
  document.getElementById('help-overlay').classList.add('visible');
}
function hideHelp() {
  helpVisible = false;
  document.getElementById('help-overlay').classList.remove('visible');
}
function toggleHelp() {
  if (helpTimer) { clearTimeout(helpTimer); helpTimer = null; }
  helpVisible ? hideHelp() : showHelp();
}

// ─────────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────────

function render(state) {
  // ── Background ──────────────────────────────────────────
  ctx.fillStyle = '#07071a';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // ── Stars ───────────────────────────────────────────────
  for (const s of stars) {
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Arena border (subtle glow) ───────────────────────────
  ctx.strokeStyle = 'rgba(0,255,255,0.08)';
  ctx.lineWidth   = 2;
  ctx.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2);

  // ── Bullets ──────────────────────────────────────────────
  for (const b of state.bullets) drawBullet(b);

  // ── Ships ────────────────────────────────────────────────
  for (const ship of state.ships) {
    if (ship.alive) drawShip(ship);
  }

  // ── HUD ──────────────────────────────────────────────────
  drawHUD(state);
}

// ── Bullet ───────────────────────────────────────────────────
function drawBullet(b) {
  const col = COLORS[b.ownerIndex];
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur  = 12;
  ctx.fillStyle   = col;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Ship ─────────────────────────────────────────────────────
function drawShip(ship) {
  const col  = COLORS[ship.index];
  const isMe = ship.index === _myIndex;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Thrust flame (flickers randomly)
  if (ship.thrustOn) {
    const flicker = 8 + Math.random() * 10;
    const grad = ctx.createLinearGradient(-SHIP_RADIUS, 0, -SHIP_RADIUS - flicker, 0);
    grad.addColorStop(0, `rgba(255,${100 + Math.random() * 120 | 0},0,0.9)`);
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-12, -6);
    ctx.lineTo(-SHIP_RADIUS - flicker, 0);
    ctx.lineTo(-12,  6);
    ctx.fill();
  }

  // Ship body — isoceles triangle pointing right (nose at +x)
  ctx.strokeStyle = col;
  ctx.lineWidth   = isMe ? 2.5 : 1.8;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isMe ? 16 : 8;
  ctx.beginPath();
  ctx.moveTo( 18,   0);   // nose
  ctx.lineTo(-12, -10);   // left wing
  ctx.lineTo( -6,   0);   // tail notch
  ctx.lineTo(-12,  10);   // right wing
  ctx.closePath();
  ctx.stroke();

  ctx.restore();

  // Player name tag (drawn in world-space above the ship)
  ctx.save();
  ctx.font        = `${isMe ? 'bold ' : ''}11px monospace`;
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isMe ? 8 : 4;
  ctx.textAlign   = 'center';
  ctx.fillText(ship.name + (isMe ? ' ◄' : ''), ship.x, ship.y - 26);
  ctx.restore();
}

// ── HUD ──────────────────────────────────────────────────────
function drawHUD(state) {
  const s0 = state.ships[0];
  const s1 = state.ships[1];

  ctx.save();

  // P1 — top left
  ctx.font      = 'bold 12px monospace';
  ctx.fillStyle = COLORS[0];
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
  ctx.shadowBlur = 0;
  ctx.textAlign  = 'center';
  ctx.fillStyle  = '#8888b8';
  ctx.font       = '10px monospace';
  ctx.fillText(`ROUND ${state.round}`, ARENA_W / 2, 18);
  ctx.font       = 'bold 20px monospace';
  ctx.fillStyle  = '#ffffff';
  ctx.fillText(`${state.scores[0]}  –  ${state.scores[1]}`, ARENA_W / 2, 38);

  // Round-over banner
  if (state.status === 'round_over') {
    if (state.winner !== null) {
      const wCol = COLORS[state.winner];
      ctx.font        = 'bold 26px monospace';
      ctx.fillStyle   = wCol;
      ctx.shadowColor = wCol;
      ctx.shadowBlur  = 22;
      ctx.textAlign   = 'center';
      ctx.fillText(
        `${state.ships[state.winner].name} wins the round!`,
        ARENA_W / 2, ARENA_H / 2
      );
    } else {
      ctx.font        = 'bold 26px monospace';
      ctx.fillStyle   = '#ffff00';
      ctx.shadowColor = '#ffff00';
      ctx.shadowBlur  = 18;
      ctx.textAlign   = 'center';
      ctx.fillText('DRAW!', ARENA_W / 2, ARENA_H / 2);
    }
  }

  // Hint — bottom right
  ctx.shadowBlur  = 0;
  ctx.font        = '10px monospace';
  ctx.fillStyle   = '#2c2c50';
  ctx.textAlign   = 'right';
  ctx.fillText('[?] controls', ARENA_W - 8, ARENA_H - 8);

  ctx.restore();
}

// ── Hearts ───────────────────────────────────────────────────
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
