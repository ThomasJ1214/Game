'use strict';
require('./docs/upgrades.js');   // sets global.UPGRADE_TREE, computeShipStats, etc.

const express        = require('express');
const http           = require('http');
const { Server }     = require('socket.io');
const path           = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });
app.use(express.static(path.join(__dirname, 'docs')));

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const WORLD_W        = 6400;
const WORLD_H        = 4800;
const SHIP_RADIUS    = 16;
const BULLET_RADIUS  = 4;
const BULLET_LIFE    = 120;      // ticks
const RESPAWN_MS     = 2000;
const INVINCIBLE_MS  = 2500;
const BOOST_MULT     = 2.4;
const BOOST_MULT_SPD = 2.2;
const MAX_PLAYERS    = 15;
const BOT_FILL       = 6;        // total entities when game starts (humans + bots)
const XP_BLOCK_COUNT = 90;
const XP_KILL_PLAYER = 150;
const XP_KILL_BOT    = 80;
const ANGULAR_ACCEL  = 0.025;
const ANGULAR_DRAG   = 0.72;
const ANGULAR_MAX    = 0.088;

const COLORS = [
  '#00ffff','#ff00ff','#ffff00','#00ff88','#ff8844',
  '#8888ff','#ff4488','#44ffaa','#ff6666','#66aaff',
  '#aaff66','#ffaa44','#cc44ff','#44ffff','#ff44cc',
];

// ─── ASTEROIDS ───────────────────────────────────────────────────────────────
// Deterministic obstacle field — same layout every server start.
const ASTEROIDS = (() => {
  let s = 31415;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  const result = [];
  // [cx, cy, count, spread, rMin, rMax]
  const clusters = [
    [3200, 2400, 6, 300,  60, 130],   // center
    [1100,  950, 5, 260,  45, 100],   // NW
    [5300,  950, 4, 230,  50,  95],   // NE
    [1000, 3850, 5, 270,  45, 105],   // SW
    [5300, 3850, 4, 250,  50, 100],   // SE
    [3200,  900, 3, 210,  40,  85],   // N
    [3200, 3900, 3, 210,  45,  80],   // S
    [1000, 2400, 3, 190,  40,  80],   // W
    [5400, 2400, 3, 190,  40,  80],   // E
    [2200, 1600, 3, 160,  35,  70],   // NW-inner
    [4200, 1600, 3, 160,  35,  70],   // NE-inner
    [2200, 3200, 3, 160,  35,  70],   // SW-inner
    [4200, 3200, 3, 160,  35,  70],   // SE-inner
  ];
  for (const [cx, cy, count, spread, rMin, rMax] of clusters) {
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * spread;
      result.push({
        x: Math.round(cx + Math.cos(angle) * dist),
        y: Math.round(cy + Math.sin(angle) * dist),
        r: Math.round(rMin + rng() * (rMax - rMin)),
      });
    }
  }
  return result;
})();

// ─── IN-MEMORY STATE ──────────────────────────────────────────────────────────
const rooms      = {};
const socketRoom = {};
let   nextBulletId = 1;
let   nextBlockId  = 1;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join(''); }
  while (rooms[code]);
  return code;
}
function safeName(raw) { return String(raw||'').trim().slice(0,20) || 'Anonymous'; }
function emptyInput()  { return { w:false, a:false, s:false, d:false, space:false, shift:false }; }
function rnd(min,max)  { return min + Math.random() * (max - min); }
function normalAngle(a){ return ((a % (Math.PI*2)) + Math.PI*2) % (Math.PI*2); }

// ─── SHIP FACTORY ─────────────────────────────────────────────────────────────
function makeShip(id, index, name, isBot) {
  const ss = computeShipStats(['root']);
  return {
    id, index, name, isBot,
    x: rnd(100, WORLD_W-100), y: rnd(100, WORLD_H-100),
    angle: Math.random() * Math.PI * 2,
    vx:0, vy:0, angularVel:0,
    health: ss.health, alive: true,
    thrustOn:false, reverseThrustOn:false, boosting:false,
    lastShot:0, lastBoost:0, boostUntil:0,
    invincible:true, invincibleUntil: Date.now() + INVINCIBLE_MS,
    kills:0, deaths:0,
    xp:0, tier:0,
    upgradePath: ['root'],
    pendingUpgrade: false,
    ss,
    respawnAt: 0,
    // bot state
    _botTarget: null, _botDecision: 0, _botState: 'hunt',
  };
}

// ─── XP BLOCK FACTORY ─────────────────────────────────────────────────────────
function makeXpBlock() {
  return {
    id:     nextBlockId++,
    x:      rnd(60, WORLD_W-60),
    y:      rnd(60, WORLD_H-60),
    r:      14 + Math.random() * 14,
    health: 2 + Math.floor(Math.random() * 3),
    maxHealth: 0,  // set below
    xp:     30 + Math.floor(Math.random() * 80),
    hue:    Math.floor(Math.random() * 360),
  };
}

// ─── GAME STATE FACTORY ───────────────────────────────────────────────────────
function makeGameState(humanPlayers) {
  const ships = humanPlayers.map((p,i) => makeShip(p.id, i, p.name, false));
  const botCount = Math.max(0, BOT_FILL - humanPlayers.length);
  for (let i = 0; i < botCount; i++) {
    const idx = ships.length;
    ships.push(makeShip('bot_'+idx, idx, botName(), true));
  }
  const xpBlocks = Array.from({length: XP_BLOCK_COUNT}, () => {
    const b = makeXpBlock(); b.maxHealth = b.health; return b;
  });
  return { ships, bullets:[], xpBlocks, tick:0, status:'playing', round:1, scores:[0,0], winner:null, roundOverAt:null };
}

const BOT_NAMES = ['Zephyr','Orion','Nova','Vega','Axle','Kira','Rho','Bolt','Hex','Pix'];
let _botNameIdx = 0;
function botName() { return BOT_NAMES[_botNameIdx++ % BOT_NAMES.length] + '_bot'; }

// ─── COMPUTE STATS ────────────────────────────────────────────────────────────
function applyUpgrade(ship, nodeId) {
  ship.upgradePath.push(nodeId);
  ship.tier = UPGRADE_TREE[nodeId].tier;
  ship.ss   = computeShipStats(ship.upgradePath);
  // Restore full health on tier up
  ship.health = ship.ss.health;
  ship.pendingUpgrade = false;
}

function revertUpgrade(ship) {
  if (ship.upgradePath.length <= 1) return;   // already at root
  ship.upgradePath.pop();
  ship.tier = UPGRADE_TREE[ship.upgradePath[ship.upgradePath.length-1]].tier;
  ship.ss   = computeShipStats(ship.upgradePath);
  // Don't restore health on downgrade
  ship.health = Math.min(ship.health, ship.ss.health);
}

// ─── PHYSICS ─────────────────────────────────────────────────────────────────
function stepShip(ship, inp, now) {
  if (!ship.alive) return;
  const ss = ship.ss;

  // Rotation with angular momentum
  if (inp.a) ship.angularVel -= ANGULAR_ACCEL;
  if (inp.d) ship.angularVel += ANGULAR_ACCEL;
  ship.angularVel = Math.max(-ss.rotate, Math.min(ss.rotate, ship.angularVel));
  ship.angularVel *= ANGULAR_DRAG;
  ship.angle += ship.angularVel;

  // Boost
  if (inp.shift && now - ship.lastBoost >= ss.boostCd) {
    ship.lastBoost  = now;
    ship.boostUntil = now + 220;
    ship.vx += Math.cos(ship.angle) * ss.thrust * BOOST_MULT;
    ship.vy += Math.sin(ship.angle) * ss.thrust * BOOST_MULT;
  }
  ship.boosting = now < ship.boostUntil;

  ship.thrustOn        = !!inp.w;
  ship.reverseThrustOn = !!inp.s;
  if (inp.w) { ship.vx += Math.cos(ship.angle)*ss.thrust; ship.vy += Math.sin(ship.angle)*ss.thrust; }
  if (inp.s) { ship.vx -= Math.cos(ship.angle)*ss.thrust; ship.vy -= Math.sin(ship.angle)*ss.thrust; }

  const spd = Math.hypot(ship.vx, ship.vy);
  const cap = ship.boosting ? ss.maxSpd * BOOST_MULT_SPD : ss.maxSpd;
  if (spd > cap) { ship.vx = ship.vx/spd*cap; ship.vy = ship.vy/spd*cap; }
  ship.vx *= ss.drag; ship.vy *= ss.drag;
  ship.x  += ship.vx; ship.y  += ship.vy;

  // Hard-wall bounce
  if (ship.x < SHIP_RADIUS)         { ship.x = SHIP_RADIUS;         ship.vx =  Math.abs(ship.vx)*0.5; }
  if (ship.x > WORLD_W-SHIP_RADIUS) { ship.x = WORLD_W-SHIP_RADIUS; ship.vx = -Math.abs(ship.vx)*0.5; }
  if (ship.y < SHIP_RADIUS)         { ship.y = SHIP_RADIUS;         ship.vy =  Math.abs(ship.vy)*0.5; }
  if (ship.y > WORLD_H-SHIP_RADIUS) { ship.y = WORLD_H-SHIP_RADIUS; ship.vy = -Math.abs(ship.vy)*0.5; }

  // Asteroid bounce
  for (const ast of ASTEROIDS) {
    const ax = ship.x - ast.x, ay = ship.y - ast.y;
    const d = Math.hypot(ax, ay);
    const minD = SHIP_RADIUS + ast.r;
    if (d > 0 && d < minD) {
      const nx = ax / d, ny = ay / d;
      ship.x = ast.x + nx * minD;
      ship.y = ast.y + ny * minD;
      const dot = ship.vx * nx + ship.vy * ny;
      if (dot < 0) { ship.vx -= 1.5 * dot * nx; ship.vy -= 1.5 * dot * ny; }
    }
  }
}

function tryFire(ship, bullets, tick, now) {
  const ss = ship.ss;
  if (bullets.filter(b=>b.ownerIndex===ship.index).length >= ss.maxBullets) return;
  if (now - ship.lastShot < ss.shootCd) return;
  ship.lastShot = now;
  bullets.push({
    id: nextBulletId++,
    ownerIndex: ship.index,
    x: ship.x + Math.cos(ship.angle)*(SHIP_RADIUS+6),
    y: ship.y + Math.sin(ship.angle)*(SHIP_RADIUS+6),
    vx: Math.cos(ship.angle)*ship.ss.bulletSpd + ship.vx*0.4,
    vy: Math.sin(ship.angle)*ship.ss.bulletSpd + ship.vy*0.4,
    dmg: ship.ss.bulletDmg,
    born: tick,
  });
}

function stepBullets(state) {
  for (const b of state.bullets) {
    b.x += b.vx; b.y += b.vy;
    // Destroy at walls
    if (b.x<0||b.x>WORLD_W||b.y<0||b.y>WORLD_H) b.born = -9999;
  }
  state.bullets = state.bullets.filter(b => state.tick - b.born < BULLET_LIFE);
}

function resolveCollisions(state, room, now) {
  const remove = new Set();
  for (const b of state.bullets) {
    // vs ships
    for (const target of state.ships) {
      if (target.index === b.ownerIndex) continue;
      if (!target.alive || target.invincible) continue;
      if (Math.hypot(b.x-target.x, b.y-target.y) < SHIP_RADIUS+BULLET_RADIUS) {
        target.health -= b.dmg;
        remove.add(b.id);
        if (target.health <= 0) {
          const killer = state.ships[b.ownerIndex];
          handleDeath(target, killer, state, room, now);
        }
      }
    }
    // vs asteroids
    for (const ast of ASTEROIDS) {
      if (!remove.has(b.id) && Math.hypot(b.x - ast.x, b.y - ast.y) < ast.r + BULLET_RADIUS) {
        remove.add(b.id);
      }
    }
    // vs xp blocks
    for (const blk of state.xpBlocks) {
      if (Math.hypot(b.x-blk.x, b.y-blk.y) < blk.r+BULLET_RADIUS) {
        blk.health--;
        remove.add(b.id);
        if (blk.health <= 0) {
          const shooter = state.ships[b.ownerIndex];
          if (shooter && shooter.alive) giveXp(shooter, blk.xp);
          // respawn block
          const nb = makeXpBlock(); nb.maxHealth = nb.health;
          Object.assign(blk, nb, {id: blk.id});
        }
      }
    }
  }
  state.bullets = state.bullets.filter(b => !remove.has(b.id));

  // Ship-ship elastic collision
  const ships = state.ships.filter(s=>s.alive);
  for (let i=0;i<ships.length;i++) for (let j=i+1;j<ships.length;j++) {
    const a=ships[i], b=ships[j];
    const dx=b.x-a.x, dy=b.y-a.y, dist=Math.hypot(dx,dy), minD=SHIP_RADIUS*2;
    if (dist>=minD||dist===0) continue;
    const nx=dx/dist, ny=dy/dist, dot=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
    if (dot<=0) continue;
    a.vx-=dot*nx; a.vy-=dot*ny;
    b.vx+=dot*nx; b.vy+=dot*ny;
    const push=(minD-dist)/2+0.5;
    a.x-=nx*push; a.y-=ny*push;
    b.x+=nx*push; b.y+=ny*push;
  }
}

function handleDeath(ship, killer, state, room, now) {
  ship.alive   = false;
  ship.health  = 0;
  ship.deaths++;
  revertUpgrade(ship);

  if (killer) {
    killer.kills++;
    giveXp(killer, ship.isBot ? XP_KILL_BOT : XP_KILL_PLAYER);
    io.to(room.roomCode).emit('kill_event', {
      killerName: killer.name,
      killerIndex: killer.index,
      victimName: ship.name,
      victimIndex: ship.index,
    });
  }

  // Respawn after delay
  ship.respawnAt = now + RESPAWN_MS;
  if (!ship.isBot) {
    const p = room.players.find(p=>p.id===ship.id);
    if (p) io.to(p.id).emit('you_died', { respawnIn: RESPAWN_MS, tier: ship.tier });
  }
}

function giveXp(ship, amount) {
  ship.xp += amount;
  const needed = (ship.tier + 1) * XP_PER_TIER;
  if (ship.tier < 10 && ship.xp >= needed && !ship.pendingUpgrade) {
    ship.pendingUpgrade = true;
  }
}

function tryRespawn(ship, now) {
  if (ship.alive || ship.respawnAt === 0 || now < ship.respawnAt) return;
  ship.alive         = true;
  ship.health        = ship.ss.health;
  ship.vx = ship.vy  = ship.angularVel = 0;
  ship.x             = rnd(100, WORLD_W-100);
  ship.y             = rnd(100, WORLD_H-100);
  ship.invincible      = true;
  ship.invincibleUntil = now + INVINCIBLE_MS;
  ship.respawnAt     = 0;
  ship.pendingUpgrade = false;
  if (ship.ss.regenRate > 0) ship.health = ship.ss.health;
}

// ─── BOT AI ──────────────────────────────────────────────────────────────────
function botThink(bot, state, now) {
  if (!bot.alive) return emptyInput();

  // Re-evaluate target every 10 ticks (~330ms)
  if (state.tick - bot._botDecision >= 10) {
    bot._botDecision = state.tick;

    // Auto-pick upgrade
    if (bot.pendingUpgrade) {
      const node = UPGRADE_TREE[bot.upgradePath[bot.upgradePath.length-1]];
      if (node && node.next.length > 0) {
        applyUpgrade(bot, node.next[Math.floor(Math.random()*node.next.length)]);
      } else {
        bot.pendingUpgrade = false;
      }
    }

    // Find nearest living enemy
    let bestDist = Infinity, bestTarget = null;
    for (const s of state.ships) {
      if (s.index === bot.index || !s.alive) continue;
      const d = Math.hypot(s.x-bot.x, s.y-bot.y);
      if (d < bestDist) { bestDist = d; bestTarget = s; }
    }
    // If no enemy within 600, look for nearest XP block
    if (!bestTarget || bestDist > 800) {
      let bd2=Infinity, bt2=null;
      for (const blk of state.xpBlocks) {
        const d = Math.hypot(blk.x-bot.x, blk.y-bot.y);
        if (d < bd2) { bd2=d; bt2=blk; }
      }
      bot._botTarget = (!bestTarget || bd2 < 300) ? {type:'block',obj:bt2} : {type:'ship',obj:bestTarget};
    } else {
      bot._botTarget = {type:'ship', obj:bestTarget};
    }
  }

  const inp = emptyInput();
  if (!bot._botTarget) return inp;

  const tgt = bot._botTarget.obj;
  if (!tgt) return inp;

  const dx = tgt.x - bot.x, dy = tgt.y - bot.y;
  const dist = Math.hypot(dx, dy);
  const targetAngle = Math.atan2(dy, dx);
  let diff = normalAngle(targetAngle - bot.angle);
  if (diff > Math.PI) diff -= Math.PI*2;

  if (diff >  0.08) inp.d = true;
  if (diff < -0.08) inp.a = true;

  if (bot._botTarget.type === 'ship') {
    if (dist > 200) inp.w = true;
    else if (dist < 80) inp.s = true;
    if (Math.abs(diff) < 0.25) inp.space = true;
    if (dist > 500 && now - bot.lastBoost >= bot.ss.boostCd) inp.shift = true;
  } else {
    // Collect block
    if (dist > 40) inp.w = true;
    if (Math.abs(diff) < 0.3) inp.space = true;
  }

  return inp;
}

// ─── BROADCAST ───────────────────────────────────────────────────────────────
function broadcast(room) {
  const gs = room.gameState;
  // Slim down ship data for network
  const ships = gs.ships.map(s => ({
    id:s.id, index:s.index, name:s.name, isBot:s.isBot,
    x:s.x, y:s.y, angle:s.angle, vx:s.vx, vy:s.vy,
    health:s.health, maxHealth:s.ss.health, alive:s.alive,
    thrustOn:s.thrustOn, reverseThrustOn:s.reverseThrustOn,
    boosting:s.boosting, invincible:s.invincible,
    kills:s.kills, deaths:s.deaths, xp:s.xp, tier:s.tier,
    upgradePath:s.upgradePath, pendingUpgrade:s.pendingUpgrade,
    lastBoost:s.lastBoost, respawnAt:s.respawnAt,
    ss: { boostCd:s.ss.boostCd, health:s.ss.health },
  }));
  const payload = {
    ships, bullets: gs.bullets, xpBlocks: gs.xpBlocks, tick: gs.tick,
    round: gs.round, scores: gs.scores, status: gs.status,
    winner: gs.winner, roundOverAt: gs.roundOverAt,
  };
  for (const p of room.players) io.to(p.id).emit('game_tick', { gameState: payload });
}

// ─── GAME LOOP ────────────────────────────────────────────────────────────────
function startLoop(room) {
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
  room.gameLoopInterval = setInterval(() => {
    const state = room.gameState;
    if (!state) return;
    state.tick++;
    const now = Date.now();

    for (const ship of state.ships) {
      // Clear invincibility
      if (ship.invincible && now >= ship.invincibleUntil) ship.invincible = false;
      // Try respawn
      tryRespawn(ship, now);
      // Regen
      if (ship.alive && ship.ss.regenRate > 0) {
        const interval = Math.max(1, Math.floor(300 / ship.ss.regenRate));
        if (state.tick % interval === 0 && ship.health < ship.ss.health) ship.health++;
      }
    }

    // Compute inputs (human from buffer, bots from AI)
    const inputs = room.inputs.slice();
    for (const ship of state.ships) {
      if (ship.isBot && ship.alive) inputs[ship.index] = botThink(ship, state, now);
    }

    for (const ship of state.ships) {
      if (!ship.alive) continue;
      stepShip(ship, inputs[ship.index], now);
      if (inputs[ship.index].space) tryFire(ship, state.bullets, state.tick, now);
    }
    stepBullets(state);
    resolveCollisions(state, room, now);
    broadcast(room);
  }, 33);
}

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────
function cleanup(socket) {
  const code = socketRoom[socket.id];
  if (!code) return;
  const room = rooms[code];
  if (!room) return;

  const leaver = room.players.find(p=>p.id===socket.id);
  room.players  = room.players.filter(p=>p.id!==socket.id);
  delete socketRoom[socket.id];

  if (room.gameState) {
    // Replace leaver with a bot
    const ship = room.gameState.ships.find(s=>s.id===socket.id);
    if (ship) {
      ship.id    = 'bot_'+ship.index;
      ship.isBot = true;
      ship.name  = (leaver ? leaver.name : 'Player') + ' (bot)';
    }
    for (const p of room.players) {
      io.to(p.id).emit('player_left', { name: leaver ? leaver.name : 'Player' });
    }
  } else {
    // Game not started yet, clean up if empty
    if (room.players.length === 0) {
      if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
      delete rooms[code];
      return;
    }
    const list = room.players.map(p=>({name:p.name, index:p.index}));
    io.to(code).emit('lobby_update', {players:list});
  }
}

io.on('connection', socket => {

  socket.on('create_lobby', ({ name }) => {
    const code  = genCode();
    const pName = safeName(name);
    rooms[code] = {
      roomCode: code,
      players:  [{ id:socket.id, name:pName, index:0 }],
      gameStarted: false, gameState:null, gameLoopInterval:null,
      inputs: Array.from({length:MAX_PLAYERS}, emptyInput),
    };
    socketRoom[socket.id] = code;
    socket.join(code);
    socket.emit('lobby_created', { roomCode:code, playerIndex:0, players:[{name:pName,index:0}] });
  });

  socket.on('join_lobby', ({ name, roomCode }) => {
    const code = String(roomCode||'').toUpperCase().trim();
    const room = rooms[code];
    if (!room)             return socket.emit('lobby_error', {message:`Room "${code}" not found.`});
    if (room.gameStarted)  return socket.emit('lobby_error', {message:'Game already in progress.'});
    if (room.players.length >= MAX_PLAYERS) return socket.emit('lobby_error', {message:'Room is full.'});
    const pName = safeName(name);
    const idx   = room.players.length;
    room.players.push({id:socket.id, name:pName, index:idx});
    socketRoom[socket.id] = code;
    socket.join(code);
    const list = room.players.map(p=>({name:p.name,index:p.index}));
    socket.emit('lobby_joined', {roomCode:code, playerIndex:idx, players:list});
    io.to(code).emit('lobby_update', {players:list});
  });

  socket.on('start_game', () => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || room.gameStarted) return;
    const p = room.players.find(p=>p.id===socket.id);
    if (!p || p.index !== 0) return;

    room.gameStarted = true;
    room.gameState   = makeGameState(room.players);
    // Make sure inputs array covers all ships
    while (room.inputs.length < room.gameState.ships.length) room.inputs.push(emptyInput());

    for (const pl of room.players) {
      io.to(pl.id).emit('game_start', {
        yourIndex:   pl.index,
        upgradeTree: UPGRADE_TREE,
        worldW:      WORLD_W,
        worldH:      WORLD_H,
        asteroids:   ASTEROIDS,
      });
    }
    startLoop(room);
  });

  socket.on('player_input', ({ keys }) => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || !room.gameStarted) return;
    const p = room.players.find(p=>p.id===socket.id);
    if (!p) return;
    room.inputs[p.index] = {
      w:!!keys.w, a:!!keys.a, s:!!keys.s, d:!!keys.d,
      space:!!keys.space, shift:!!keys.shift,
    };
  });

  socket.on('choose_upgrade', ({ nodeId }) => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || !room.gameState) return;
    const p = room.players.find(p=>p.id===socket.id);
    if (!p) return;
    const ship = room.gameState.ships.find(s=>s.index===p.index);
    if (!ship || !ship.pendingUpgrade) return;
    const currentNode = UPGRADE_TREE[ship.upgradePath[ship.upgradePath.length-1]];
    if (!currentNode || !currentNode.next.includes(nodeId)) return;
    applyUpgrade(ship, nodeId);
  });

  socket.on('leave_room',  () => cleanup(socket));
  socket.on('disconnect',  () => cleanup(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n  ★  Pixel Duel  →  http://localhost:${PORT}\n`));
