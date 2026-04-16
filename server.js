const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);

// CORS: allow GitHub Pages (or any origin) to connect via Socket.io
// When deployed to Railway/Render the frontend lives on a different origin.
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve the frontend files from docs/ (also used by GitHub Pages)
app.use(express.static(path.join(__dirname, 'docs')));

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const ARENA_W       = 800;
const ARENA_H       = 600;
const SHIP_RADIUS   = 16;
const SHIP_THRUST   = 0.25;
const SHIP_ROTATE   = 0.07;   // rad / tick
const SHIP_MAX_SPD  = 5;
const SHIP_DRAG     = 0.97;
const BULLET_SPEED  = 9;
const BULLET_RADIUS = 4;
const BULLET_LIFE   = 90;     // ticks  (~3 s at 30 fps)
const SHOOT_CD      = 300;    // ms
const MAX_BULLETS   = 3;      // per player
const WINS_NEEDED   = 3;      // rounds to win the match
const RESPAWN_MS    = 1800;   // ms between round-end and next round

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STATE
// ─────────────────────────────────────────────────────────────

const rooms       = {};   // roomCode  → room
const socketRoom  = {};   // socketId  → roomCode

let nextBulletId = 1;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (rooms[code]);
  return code;
}

function safeName(raw) {
  return String(raw || '').trim().slice(0, 20) || 'Anonymous';
}

function emptyInput() {
  return { w: false, a: false, s: false, d: false, space: false };
}

// ─────────────────────────────────────────────────────────────
// GAME STATE FACTORIES
// ─────────────────────────────────────────────────────────────

function makeShip(index, name) {
  return {
    index,
    name,
    x:        index === 0 ? 200 : 600,
    y:        ARENA_H / 2,
    angle:    index === 0 ? 0 : Math.PI,
    vx: 0, vy: 0,
    health:   3,
    alive:    true,
    thrustOn: false,
    lastShot: 0
  };
}

function makeGameState(players) {
  return {
    ships:   players.map(p => makeShip(p.index, p.name)),
    bullets: [],
    scores:  [0, 0],
    round:   1,
    status:  'playing',   // 'playing' | 'round_over' | 'game_over'
    winner:  null,        // null | 0 | 1
    tick:    0
  };
}

function respawnShips(state) {
  const names = state.ships.map(s => s.name);
  state.ships   = names.map((name, i) => makeShip(i, name));
  state.bullets = [];
}

// ─────────────────────────────────────────────────────────────
// PHYSICS
// ─────────────────────────────────────────────────────────────

function stepShip(ship, inp) {
  if (inp.a) ship.angle -= SHIP_ROTATE;
  if (inp.d) ship.angle += SHIP_ROTATE;

  ship.thrustOn = !!inp.w;
  if (inp.w) {
    ship.vx += Math.cos(ship.angle) * SHIP_THRUST;
    ship.vy += Math.sin(ship.angle) * SHIP_THRUST;
  }
  if (inp.s) { ship.vx *= 0.88; ship.vy *= 0.88; }   // brake

  const spd = Math.hypot(ship.vx, ship.vy);
  if (spd > SHIP_MAX_SPD) {
    ship.vx = (ship.vx / spd) * SHIP_MAX_SPD;
    ship.vy = (ship.vy / spd) * SHIP_MAX_SPD;
  }

  ship.vx *= SHIP_DRAG;
  ship.vy *= SHIP_DRAG;
  ship.x  += ship.vx;
  ship.y  += ship.vy;

  // torus wrap
  ship.x = ((ship.x % ARENA_W) + ARENA_W) % ARENA_W;
  ship.y = ((ship.y % ARENA_H) + ARENA_H) % ARENA_H;
}

function tryFire(ship, bullets, tick, now) {
  if (bullets.filter(b => b.ownerIndex === ship.index).length >= MAX_BULLETS) return;
  if (now - ship.lastShot < SHOOT_CD) return;
  ship.lastShot = now;
  bullets.push({
    id:         nextBulletId++,
    ownerIndex: ship.index,
    x:  ship.x + Math.cos(ship.angle) * (SHIP_RADIUS + 6),
    y:  ship.y + Math.sin(ship.angle) * (SHIP_RADIUS + 6),
    vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.4,
    vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.4,
    born: tick
  });
}

function stepBullets(state) {
  for (const b of state.bullets) {
    b.x += b.vx;
    b.y += b.vy;
    b.x = ((b.x % ARENA_W) + ARENA_W) % ARENA_W;
    b.y = ((b.y % ARENA_H) + ARENA_H) % ARENA_H;
  }
  state.bullets = state.bullets.filter(b => state.tick - b.born < BULLET_LIFE);
}

function resolveCollisions(state) {
  const remove = new Set();
  for (const b of state.bullets) {
    const target = state.ships[1 - b.ownerIndex];
    if (!target.alive) continue;
    if (Math.hypot(b.x - target.x, b.y - target.y) < SHIP_RADIUS + BULLET_RADIUS) {
      target.health--;
      if (target.health <= 0) target.alive = false;
      remove.add(b.id);
    }
  }
  state.bullets = state.bullets.filter(b => !remove.has(b.id));
}

// ─────────────────────────────────────────────────────────────
// ROUND / MATCH WIN CHECK
// ─────────────────────────────────────────────────────────────

function checkRound(room) {
  const state = room.gameState;
  if (state.status !== 'playing') return;

  const dead = state.ships.filter(s => !s.alive);
  if (dead.length === 0) return;

  state.status = 'round_over';

  if (dead.length === 1) {
    const winIdx = 1 - dead[0].index;
    state.scores[winIdx]++;
    state.winner = winIdx;
  } else {
    // simultaneous death — draw, no score
    state.winner = null;
  }

  // Check for match win
  if (state.winner !== null && state.scores[state.winner] >= WINS_NEEDED) {
    state.status = 'game_over';
    clearInterval(room.gameLoopInterval);
    room.gameLoopInterval = null;

    for (const p of room.players) {
      io.to(p.id).emit('game_over', {
        winner:      state.winner,
        winnerName:  state.ships[state.winner].name,
        playerNames: state.ships.map(s => s.name),
        scores:      state.scores,
        yourIndex:   p.index
      });
    }
    return;
  }

  // Schedule next round after respawn delay
  setTimeout(() => {
    if (!rooms[room.roomCode]) return;   // room was cleaned up
    state.round++;
    state.status = 'playing';
    state.winner = null;
    respawnShips(state);
  }, RESPAWN_MS);
}

// ─────────────────────────────────────────────────────────────
// BROADCAST
// ─────────────────────────────────────────────────────────────

function broadcast(room) {
  const payload = { gameState: room.gameState };
  for (const p of room.players) {
    io.to(p.id).emit('game_tick', payload);
  }
}

// ─────────────────────────────────────────────────────────────
// GAME LOOP
// ─────────────────────────────────────────────────────────────

function startLoop(room) {
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);

  room.gameLoopInterval = setInterval(() => {
    const state = room.gameState;
    if (!state) return;

    state.tick++;
    const now = Date.now();

    if (state.status === 'playing') {
      for (const ship of state.ships) {
        if (!ship.alive) continue;
        const inp = room.inputs[ship.index];
        stepShip(ship, inp);
        if (inp.space) tryFire(ship, state.bullets, state.tick, now);
      }
      stepBullets(state);
      resolveCollisions(state);
      checkRound(room);
    }

    if (state.status !== 'game_over') broadcast(room);
  }, 33);   // ~30 fps
}

// ─────────────────────────────────────────────────────────────
// DISCONNECT CLEANUP
// ─────────────────────────────────────────────────────────────

function cleanup(socket) {
  const code = socketRoom[socket.id];
  if (!code) return;
  const room = rooms[code];
  if (!room) return;

  if (room.gameLoopInterval) {
    clearInterval(room.gameLoopInterval);
    room.gameLoopInterval = null;
  }

  const leaver    = room.players.find(p => p.id === socket.id);
  const remaining = room.players.find(p => p.id !== socket.id);

  if (remaining) {
    io.to(remaining.id).emit('player_disconnected', {
      name: leaver ? leaver.name : 'Opponent'
    });
    delete socketRoom[remaining.id];
  }

  delete socketRoom[socket.id];
  delete rooms[code];
}

// ─────────────────────────────────────────────────────────────
// SOCKET EVENTS
// ─────────────────────────────────────────────────────────────

io.on('connection', socket => {

  // ── Create lobby ──────────────────────────────────────────
  socket.on('create_lobby', ({ name }) => {
    const code  = genCode();
    const pName = safeName(name);

    rooms[code] = {
      roomCode:          code,
      players:           [{ id: socket.id, name: pName, index: 0 }],
      gameStarted:       false,
      gameState:         null,
      gameLoopInterval:  null,
      rematchVotes:      new Set(),
      inputs:            [emptyInput(), emptyInput()]
    };
    socketRoom[socket.id] = code;
    socket.join(code);

    socket.emit('lobby_created', {
      roomCode:    code,
      playerIndex: 0,
      players:     [{ name: pName, index: 0 }]
    });
  });

  // ── Join lobby ────────────────────────────────────────────
  socket.on('join_lobby', ({ name, roomCode }) => {
    const code = String(roomCode || '').toUpperCase().trim();
    const room = rooms[code];

    if (!room)            return socket.emit('lobby_error', { message: `Room "${code}" not found.` });
    if (room.gameStarted) return socket.emit('lobby_error', { message: 'Game already in progress.' });
    if (room.players.length >= 2) return socket.emit('lobby_error', { message: 'Room is full.' });

    const pName = safeName(name);
    room.players.push({ id: socket.id, name: pName, index: 1 });
    socketRoom[socket.id] = code;
    socket.join(code);

    const list = room.players.map(p => ({ name: p.name, index: p.index }));
    socket.emit('lobby_joined', { roomCode: code, playerIndex: 1, players: list });
    io.to(code).emit('lobby_update', { players: list });
  });

  // ── Start game ────────────────────────────────────────────
  socket.on('start_game', () => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || room.gameStarted || room.players.length < 2) return;

    const p = room.players.find(p => p.id === socket.id);
    if (!p || p.index !== 0) return;   // only host can start

    room.gameStarted = true;
    room.gameState   = makeGameState(room.players);

    for (const pl of room.players) {
      io.to(pl.id).emit('game_start', {
        gameState:  room.gameState,
        yourIndex:  pl.index
      });
    }
    startLoop(room);
  });

  // ── Player input ──────────────────────────────────────────
  socket.on('player_input', ({ keys }) => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || !room.gameStarted) return;

    const p = room.players.find(p => p.id === socket.id);
    if (!p) return;

    room.inputs[p.index] = {
      w:     !!keys.w,
      a:     !!keys.a,
      s:     !!keys.s,
      d:     !!keys.d,
      space: !!keys.space
    };
  });

  // ── Rematch vote ──────────────────────────────────────────
  socket.on('rematch_vote', () => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || !room.gameState || room.gameState.status !== 'game_over') return;

    room.rematchVotes.add(socket.id);

    if (room.rematchVotes.size >= 2) {
      room.rematchVotes = new Set();
      room.gameState    = makeGameState(room.players);
      room.inputs       = [emptyInput(), emptyInput()];

      for (const pl of room.players) {
        io.to(pl.id).emit('rematch_start', {
          gameState: room.gameState,
          yourIndex: pl.index
        });
      }
      startLoop(room);
    } else {
      io.to(code).emit('rematch_ready', { votes: room.rematchVotes.size });
    }
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('leave_room',  () => cleanup(socket));
  socket.on('disconnect',  () => cleanup(socket));
});

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ★  Pixel Duel  →  http://localhost:${PORT}\n`);
});
