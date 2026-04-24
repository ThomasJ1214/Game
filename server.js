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
const WORLD_W        = 9600;
const WORLD_H        = 7200;
const SHIP_RADIUS    = 16;
const BULLET_RADIUS  = 4;
const BULLET_LIFE    = 120;      // ticks
const RESPAWN_MS     = 2000;
const INVINCIBLE_MS  = 2500;
const BOOST_MULT     = 2.4;
const BOOST_MULT_SPD = 2.2;
const MAX_PLAYERS    = 15;
const BOT_FILL       = 15;       // total entities when game starts (humans + bots)
const XP_BLOCK_COUNT = 200;
const XP_KILL_PLAYER      = 150;
const XP_KILL_BOT         = 80;
const XP_BLOCK_RESPAWN_MS = 15000;
const ANGULAR_ACCEL  = 0.025;
const ANGULAR_DRAG   = 0.72;
const ANGULAR_MAX    = 0.088;

// Bot AI tuning
const BOT_WALL_MARGIN = 390;   // px from world edge before steering away
const BOT_AST_MARGIN  = 90;    // extra clearance around asteroids

// Per-difficulty parameter sets — all other bot constants are derived from these
const DIFF_PARAMS = {
  easy: {
    ticks:       22,    // decision interval (slow reactions)
    aimTol:      0.40,  // rad — fires even when poorly aimed
    farmAimTol:  0.50,
    retreatHp:   0.60,  // retreats at 60 % HP (cowardly)
    huntRange:   600,   // only engages nearby ships
    leadFactor:  0.15,  // barely leads shots
    jitter:      260,   // px of random noise added to aim point
    boostHunt:   false,
    preferHuman: false,
  },
  medium: {
    ticks:       12,
    aimTol:      0.18,
    farmAimTol:  0.22,
    retreatHp:   0.30,
    huntRange:   1000,
    leadFactor:  1.0,
    jitter:      0,
    boostHunt:   true,
    preferHuman: false,
  },
  beast: {
    ticks:       5,     // very fast reactions
    aimTol:      0.08,  // pinpoint accuracy
    farmAimTol:  0.12,
    retreatHp:   0.10,  // almost never retreats
    huntRange:   1800,  // hunts from far away
    leadFactor:  1.3,   // over-leads fast targets
    jitter:      0,
    boostHunt:   true,
    preferHuman: true,  // specifically hunts human players first
  },
};

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
  // All positions/spreads scaled 1.5× to match the 9600×7200 world;
  // extra clusters added for the larger map area.
  const clusters = [
    [4800, 3600, 6, 450,  60, 130],   // center
    [1650, 1425, 5, 390,  45, 100],   // NW
    [7950, 1425, 4, 345,  50,  95],   // NE
    [1500, 5775, 5, 405,  45, 105],   // SW
    [7950, 5775, 4, 375,  50, 100],   // SE
    [4800, 1350, 3, 315,  40,  85],   // N
    [4800, 5850, 3, 315,  45,  80],   // S
    [1500, 3600, 3, 285,  40,  80],   // W
    [8100, 3600, 3, 285,  40,  80],   // E
    [3300, 2400, 3, 240,  35,  70],   // NW-inner
    [6300, 2400, 3, 240,  35,  70],   // NE-inner
    [3300, 4800, 3, 240,  35,  70],   // SW-inner
    [6300, 4800, 3, 240,  35,  70],   // SE-inner
    // Extra clusters filling the expanded area
    [4800, 2400, 3, 240,  35,  70],   // N-inner
    [4800, 4800, 3, 240,  35,  70],   // S-inner
    [2400, 3600, 3, 240,  35,  70],   // W-inner
    [7200, 3600, 3, 240,  35,  70],   // E-inner
    [2200, 1000, 3, 200,  35,  70],   // NNW corner
    [7400, 1000, 3, 200,  35,  70],   // NNE corner
    [2200, 6200, 3, 200,  35,  70],   // SSW corner
    [7400, 6200, 3, 200,  35,  70],   // SSE corner
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
    x: rnd(300, WORLD_W-300), y: rnd(300, WORLD_H-300),
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
    _botTarget: null, _botDecision: 0, _botState: 'hunt', _wanderPt: null,
  };
}

// ─── XP BLOCK FACTORY ─────────────────────────────────────────────────────────
function makeXpBlock() {
  return {
    id:        nextBlockId++,
    x:         rnd(60, WORLD_W-60),
    y:         rnd(60, WORLD_H-60),
    r:         14 + Math.random() * 14,
    health:    2 + Math.floor(Math.random() * 3),
    maxHealth: 0,
    xp:        30 + Math.floor(Math.random() * 80),
    hue:       Math.floor(Math.random() * 360),
    alive:     true,
    respawnAt: 0,
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
  return { ships, bullets:[], xpBlocks, tick:0 };
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
      if (remove.has(b.id)) break;
      if (target.index === b.ownerIndex) continue;
      if (!target.alive || target.invincible) continue;
      if (Math.hypot(b.x-target.x, b.y-target.y) < SHIP_RADIUS+BULLET_RADIUS) {
        const resist = (target.ss && target.ss.dmgReduce) || 0;
        target.health -= Math.max(1, Math.round(b.dmg * (1 - resist)));
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
      if (remove.has(b.id)) break;
      if (!blk.alive) continue;
      if (Math.hypot(b.x-blk.x, b.y-blk.y) < blk.r+BULLET_RADIUS) {
        blk.health--;
        remove.add(b.id);
        if (blk.health <= 0) {
          const shooter = state.ships[b.ownerIndex];
          if (shooter && shooter.alive) giveXp(shooter, blk.xp);
          blk.alive     = false;
          blk.respawnAt = now + XP_BLOCK_RESPAWN_MS;
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
  if (ship.tier > 1) revertUpgrade(ship);

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
  ship.x             = rnd(300, WORLD_W-300);
  ship.y             = rnd(300, WORLD_H-300);
  ship.invincible      = true;
  ship.invincibleUntil = now + INVINCIBLE_MS;
  ship.respawnAt     = 0;
  ship.pendingUpgrade = false;
  if (ship.ss.regenRate > 0) ship.health = ship.ss.health;
}

// ─── BOT AI ──────────────────────────────────────────────────────────────────
function botThink(bot, state, now, difficulty) {
  if (!bot.alive) return emptyInput();
  const p = DIFF_PARAMS[difficulty] || DIFF_PARAMS.medium;

  // ── Immediately apply any pending upgrade ─────────────────────────────
  if (bot.pendingUpgrade) {
    const node = UPGRADE_TREE[bot.upgradePath[bot.upgradePath.length - 1]];
    if (node && node.next.length > 0) {
      // At the root, assign a branch based on bot index; otherwise prefer a/b by personality
      const mixedBranches = node.next.some(id => id[0] !== node.next[0][0]);
      let pick;
      if (mixedBranches) {
        const branches = ['S', 'F', 'T'];
        const prefer   = branches[bot.index % 3];
        pick = node.next.find(id => id[0] === prefer) || node.next[0];
      } else {
        const preferA = (bot.index % 2 === 0);
        pick = preferA
          ? (node.next.find(id => id.endsWith('a')) || node.next[0])
          : (node.next.find(id => id.endsWith('b')) || node.next[node.next.length - 1]);
      }
      applyUpgrade(bot, pick);
    } else {
      bot.pendingUpgrade = false;
    }
  }

  // ── Re-evaluate state & target every p.ticks ─────────────────────────
  if (state.tick - bot._botDecision >= p.ticks) {
    bot._botDecision = state.tick;

    const hpFrac = bot.health / bot.ss.health;

    // Nearest living enemy (beast: prefers human players)
    let nearEnemyDist = Infinity, nearEnemy = null;
    for (const s of state.ships) {
      if (s.index === bot.index || !s.alive) continue;
      const d = Math.hypot(s.x - bot.x, s.y - bot.y);
      if (d < nearEnemyDist) { nearEnemyDist = d; nearEnemy = s; }
    }
    if (p.preferHuman && nearEnemy && nearEnemy.isBot) {
      for (const s of state.ships) {
        if (s.index === bot.index || !s.alive || s.isBot) continue;
        nearEnemy = s;
        nearEnemyDist = Math.hypot(s.x - bot.x, s.y - bot.y);
        break;
      }
    }
    // Nearest alive XP block
    let nearBlockDist = Infinity, nearBlock = null;
    for (const blk of state.xpBlocks) {
      if (!blk.alive) continue;
      const d = Math.hypot(blk.x - bot.x, blk.y - bot.y);
      if (d < nearBlockDist) { nearBlockDist = d; nearBlock = blk; }
    }

    if (hpFrac <= p.retreatHp && nearEnemy) {
      bot._botState  = 'retreat';
      bot._botTarget = { type: 'flee', obj: nearEnemy };
    } else if (nearEnemy && nearEnemyDist <= p.huntRange) {
      bot._botState  = 'hunt';
      bot._botTarget = { type: 'ship', obj: nearEnemy };
    } else if (nearBlock) {
      bot._botState  = 'farm';
      bot._botTarget = { type: 'block', obj: nearBlock };
    } else {
      // Wander: pick a new waypoint when the old one is reached
      bot._botState = 'wander';
      if (!bot._wanderPt ||
          Math.hypot(bot._wanderPt.x - bot.x, bot._wanderPt.y - bot.y) < 150) {
        bot._wanderPt = { x: rnd(300, WORLD_W - 300), y: rnd(300, WORLD_H - 300) };
      }
      bot._botTarget = { type: 'wander', obj: bot._wanderPt };
    }
  }

  const inp = emptyInput();
  const tgt = bot._botTarget && bot._botTarget.obj;
  if (!tgt) return inp;

  // ── Compute aim point based on state ─────────────────────────────────
  let aimX, aimY;
  if (bot._botState === 'retreat') {
    // Project a point in the direction directly away from the threat
    const ex = tgt.x - bot.x, ey = tgt.y - bot.y;
    const ed = Math.hypot(ex, ey) || 1;
    aimX = bot.x - (ex / ed) * 500;
    aimY = bot.y - (ey / ed) * 500;
  } else if (bot._botState === 'hunt') {
    // Lead-shot: predict target position when bullet arrives, scaled by difficulty
    const dist    = Math.hypot(tgt.x - bot.x, tgt.y - bot.y);
    const travelT = Math.min(dist / Math.max(bot.ss.bulletSpd, 1), 35) * p.leadFactor;
    aimX = tgt.x + tgt.vx * travelT;
    aimY = tgt.y + tgt.vy * travelT;
  } else {
    aimX = tgt.x;
    aimY = tgt.y;
  }

  // ── Wall avoidance: nudge aim point away from world edges ─────────────
  if (bot.x < BOT_WALL_MARGIN)               aimX += (BOT_WALL_MARGIN - bot.x) * 3.5;
  if (bot.x > WORLD_W - BOT_WALL_MARGIN)     aimX -= (BOT_WALL_MARGIN - (WORLD_W - bot.x)) * 3.5;
  if (bot.y < BOT_WALL_MARGIN)               aimY += (BOT_WALL_MARGIN - bot.y) * 3.5;
  if (bot.y > WORLD_H - BOT_WALL_MARGIN)     aimY -= (BOT_WALL_MARGIN - (WORLD_H - bot.y)) * 3.5;

  // ── Asteroid avoidance: perpendicular steering around nearby rocks ─────
  for (const ast of ASTEROIDS) {
    const adx   = ast.x - bot.x, ady = ast.y - bot.y;
    const adist = Math.hypot(adx, ady);
    const clear = ast.r + SHIP_RADIUS + BOT_AST_MARGIN;
    if (adist < clear && adist > 0) {
      // Perpendicular direction — choose side aligned with current velocity
      const perpX = -ady / adist, perpY = adx / adist;
      const sign  = (bot.vx * perpX + bot.vy * perpY) >= 0 ? 1 : -1;
      const str   = (clear - adist) * 5;
      aimX += perpX * str * sign;
      aimY += perpY * str * sign;
    }
  }

  // ── Easy-mode aim jitter (simulates human error) ─────────────────────
  if (p.jitter > 0) {
    aimX += (Math.random() - 0.5) * p.jitter;
    aimY += (Math.random() - 0.5) * p.jitter;
  }

  // ── Steer toward computed aim point ───────────────────────────────────
  const dx   = aimX - bot.x, dy = aimY - bot.y;
  const tgtA = Math.atan2(dy, dx);
  let diff   = normalAngle(tgtA - bot.angle);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff >  0.07) inp.d = true;
  if (diff < -0.07) inp.a = true;

  // ── Throttle / fire / boost per state ────────────────────────────────
  if (bot._botState === 'retreat') {
    inp.w = true;
    if (now - bot.lastBoost >= bot.ss.boostCd) inp.shift = true;

  } else if (bot._botState === 'hunt') {
    const rawDist = Math.hypot(tgt.x - bot.x, tgt.y - bot.y);
    if (rawDist > 300)                                           inp.w = true;
    else if (rawDist < 130)                                      inp.s = true;
    if (Math.abs(diff) < p.aimTol)                               inp.space = true;
    if (p.boostHunt && rawDist > 650 && now - bot.lastBoost >= bot.ss.boostCd) inp.shift = true;

  } else if (bot._botState === 'farm') {
    if (Math.hypot(tgt.x - bot.x, tgt.y - bot.y) > 60)         inp.w = true;
    if (Math.abs(diff) < p.farmAimTol)                           inp.space = true;

  } else { // wander
    if (Math.hypot(tgt.x - bot.x, tgt.y - bot.y) > 100) inp.w = true;
  }

  return inp;
}

// ─── BROADCAST ───────────────────────────────────────────────────────────────
function cleanState(gs) {
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
  return { ships, bullets: gs.bullets, xpBlocks: gs.xpBlocks.filter(b => b.alive), tick: gs.tick };
}

function broadcast(room) {
  const payload = cleanState(room.gameState);
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

    // Revive XP blocks after respawn delay
    for (const blk of state.xpBlocks) {
      if (!blk.alive && blk.respawnAt > 0 && now >= blk.respawnAt) {
        const nb = makeXpBlock(); nb.maxHealth = nb.health;
        Object.assign(blk, nb, { id: blk.id });
      }
    }

    // Compute inputs (human from buffer, bots from AI)
    const inputs = room.inputs.slice();
    for (const ship of state.ships) {
      if (ship.isBot && ship.alive) inputs[ship.index] = botThink(ship, state, now, room.botDifficulty);
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
    // Shut down the room 15 s after the last human leaves
    if (room.players.length === 0 && !room.shutdownTimer) {
      room.shutdownTimer = setTimeout(() => {
        clearInterval(room.gameLoopInterval);
        delete rooms[code];
      }, 15000);
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
      shutdownTimer: null,
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

  socket.on('start_game', ({ difficulty } = {}) => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || room.gameStarted) return;
    const p = room.players.find(p=>p.id===socket.id);
    if (!p || p.index !== 0) return;

    room.botDifficulty = ['easy','medium','beast'].includes(difficulty) ? difficulty : 'medium';
    room.gameStarted   = true;
    room.gameState     = makeGameState(room.players);
    // Make sure inputs array covers all ships
    while (room.inputs.length < room.gameState.ships.length) room.inputs.push(emptyInput());

    for (const pl of room.players) {
      io.to(pl.id).emit('game_start', {
        yourIndex:   pl.index,
        gameState:   cleanState(room.gameState),
        upgradeTree: UPGRADE_TREE,
        difficulty:  room.botDifficulty,
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
