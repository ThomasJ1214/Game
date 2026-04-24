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
const MISSILE_CD     = 5000;
const MISSILE_DMG    = 9999;   // one-hit kill regardless of tier/resistance
const MISSILE_LIFE   = 400;    // longer life to let prediction play out
const MISSILE_SPD    = 9;
const MISSILE_TURN   = 0.13;   // tighter turn for predictive guidance

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
    ticks:       2,     // near-instant reactions
    aimTol:      0.048, // surgical accuracy
    farmAimTol:  0.10,
    retreatHp:   0.06,  // fights to the death
    huntRange:   2600,  // hunts from very far away
    leadFactor:  1.4,
    jitter:      0,
    boostHunt:   true,
    preferHuman: true,
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
    isThomas: !isBot && name.toLowerCase().startsWith('thomas_'),
    missileCooldown: 0,
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
function makeGameState(humanPlayers, difficulty) {
  const ships = humanPlayers.map((p,i) => makeShip(p.id, i, p.name, false));
  const botCount = difficulty === 'none' ? 0 : Math.max(0, BOT_FILL - humanPlayers.length);
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
  const needed = (ship.tier + 1) * XP_PER_TIER;
  if (ship.tier < 20 && ship.xp >= needed) ship.pendingUpgrade = true;
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
  // EMP stun: nullify all inputs
  if (ship._empUntil && now < ship._empUntil) inp = emptyInput();
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
  // Count only normal bullets (homing missiles have their own separate cap)
  if (bullets.filter(b=>b.ownerIndex===ship.index && !b.homing).length >= ss.maxBullets) return;
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

const MISSILE_SPD_MIN  = 3.5;   // starting speed
const MISSILE_SPD_MAX  = 15.0;  // peak speed after ramp
const MISSILE_RAMP_TICKS = 180; // ticks to reach full speed

function stepBullets(state) {
  for (const b of state.bullets) {
    if (b.homing && b.targetIndex != null) {
      // Increment age and compute ramp factor (0→1 over MISSILE_RAMP_TICKS)
      b.missileAge = (b.missileAge || 0) + 1;
      const ramp = Math.min(1, b.missileAge / MISSILE_RAMP_TICKS);
      const effectiveSpd = MISSILE_SPD_MIN + (MISSILE_SPD_MAX - MISSILE_SPD_MIN) * ramp;
      // Navigation constant ramps 2→5.5 so turning improves as missile speeds up
      const N = 2 + 3.5 * ramp;

      const tgt = state.ships[b.targetIndex];
      if (tgt && tgt.alive) {
        // ── Proportional Navigation guidance ──────────────────────────────
        const dx = tgt.x - b.x, dy = tgt.y - b.y;
        const dist = Math.hypot(dx, dy) || 1;
        const losAngle = Math.atan2(dy, dx);
        const prevLos  = b._prevLos != null ? b._prevLos : losAngle;
        let losRate    = losAngle - prevLos;
        if (losRate >  Math.PI) losRate -= Math.PI * 2;
        if (losRate < -Math.PI) losRate += Math.PI * 2;
        b._prevLos = losAngle;
        const relVx = tgt.vx - b.vx, relVy = tgt.vy - b.vy;
        const closingSpd = -(relVx * dx/dist + relVy * dy/dist);
        const closingV   = Math.max(Math.abs(closingSpd), effectiveSpd * 0.5);
        const perpX = -Math.sin(losAngle), perpY = Math.cos(losAngle);
        b.vx += perpX * N * closingV * losRate;
        b.vy += perpY * N * closingV * losRate;

        // ── Asteroid avoidance ─────────────────────────────────────────────
        for (const ast of ASTEROIDS) {
          const adx = ast.x - b.x, ady = ast.y - b.y;
          const adist = Math.hypot(adx, ady);
          const clear = ast.r + BULLET_RADIUS + 40;
          if (adist < clear && adist > 0) {
            const px = -ady / adist, py = adx / adist;
            const sign = (b.vx * px + b.vy * py) >= 0 ? 1 : -1;
            b.vx += px * sign * (1 - adist / clear) * effectiveSpd * 1.8;
            b.vy += py * sign * (1 - adist / clear) * effectiveSpd * 1.8;
          }
        }

        // ── Renormalise to ramped speed ────────────────────────────────────
        const spd = Math.hypot(b.vx, b.vy);
        if (spd > 0) { b.vx = b.vx / spd * effectiveSpd; b.vy = b.vy / spd * effectiveSpd; }
      } else {
        // Target is dead/gone — keep flying at current speed (no homing)
        const spd = Math.hypot(b.vx, b.vy) || 1;
        b.vx = b.vx / spd * effectiveSpd;
        b.vy = b.vy / spd * effectiveSpd;
      }
    }
    b.x += b.vx; b.y += b.vy;
    // Only kill non-homing bullets when they leave the world
    if (!b.homing && (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H)) b.born = -9999;
  }
  // Homing missiles never expire by age — only removed when they hit their target
  state.bullets = state.bullets.filter(b => b.homing || state.tick - b.born < (b.maxLife || BULLET_LIFE));
}

function resolveCollisions(state, room, now) {
  const remove = new Set();
  for (const b of state.bullets) {
    if (b.homing) {
      // ── Missile collision: passes through everything, only detonates on locked target ──
      for (const target of state.ships) {
        if (target.index === b.ownerIndex) continue;
        if (!target.alive || target.invincible) continue;
        if (Math.hypot(b.x-target.x, b.y-target.y) < SHIP_RADIUS+BULLET_RADIUS) {
          // Always kill anything it touches (passes through)
          target.health -= MISSILE_DMG;
          if (target.health <= 0) {
            const killer = state.ships[b.ownerIndex];
            handleDeath(target, killer, state, room, now);
          }
          // Only detonate (remove) when hitting the actual locked target
          if (target.index === b.targetIndex) {
            remove.add(b.id);
            break;
          }
          // Otherwise keeps flying through — mark target temporarily invincible so missile doesn't double-hit
        }
      }
      // Missile destroys XP blocks it flies through but keeps moving
      if (!remove.has(b.id)) {
        for (const blk of state.xpBlocks) {
          if (!blk.alive) continue;
          if (Math.hypot(b.x-blk.x, b.y-blk.y) < blk.r+BULLET_RADIUS) {
            blk.health = 0;
            const shooter = state.ships[b.ownerIndex];
            if (shooter && shooter.alive) giveXp(shooter, blk.xp);
            blk.alive     = false;
            blk.respawnAt = now + XP_BLOCK_RESPAWN_MS;
          }
        }
      }
    } else {
      // ── Normal bullet collision ──
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
  // Keep XP — player re-chooses upgrades fresh each life
  ship.tier        = 0;
  ship.upgradePath = ['root'];
  ship.ss          = computeShipStats(['root']);
  ship.pendingUpgrade = false;

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
  if (ship.tier < 20 && ship.xp >= needed && !ship.pendingUpgrade) {
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
  ship.respawnAt = 0;
  const neededXp = (ship.tier + 1) * XP_PER_TIER;
  ship.pendingUpgrade = ship.tier < 20 && ship.xp >= neededXp;
  if (ship.ss.regenRate > 0) ship.health = ship.ss.health;
}

// ─── BOT AI ──────────────────────────────────────────────────────────────────

// Basic ballistic solution for easy/medium AI (no drift compensation)
function beamSolution(bot, target) {
  const bspd = Math.max(bot.ss.bulletSpd, 1);
  let t = Math.hypot(target.x - bot.x, target.y - bot.y) / bspd;
  for (let i = 0; i < 5; i++) {
    const px = target.x + target.vx * t;
    const py = target.y + target.vy * t;
    t = Math.hypot(px - bot.x, py - bot.y) / bspd;
  }
  return [target.x + target.vx * t, target.y + target.vy * t];
}

// Velocity-compensated beam solution for beast AI:
// accounts for (1) bot's own velocity offsetting the bullet (vx*0.4 inherited),
// (2) target's drag deceleration over flight time, (3) target angular drift.
function beamSolutionComp(bot, target) {
  const bspd = Math.max(bot.ss.bulletSpd, 1);
  let t = Math.hypot(target.x - bot.x, target.y - bot.y) / bspd;
  for (let i = 0; i < 12; i++) {
    // Simulate target position with drag over t ticks
    const steps = Math.min(Math.round(t), 80);
    let tx = target.x, ty = target.y, tvx = target.vx, tvy = target.vy;
    for (let s = 0; s < steps; s++) { tvx *= 0.975; tvy *= 0.975; tx += tvx; ty += tvy; }
    // Remove bot's own velocity from required bullet displacement
    // (bullet inherits bot.vx*0.4, bot.vy*0.4 at fire time)
    const adjX = tx - bot.x - bot.vx * 0.4 * t;
    const adjY = ty - bot.y - bot.vy * 0.4 * t;
    t = Math.hypot(adjX, adjY) / bspd;
  }
  // Final target position with drag
  const steps = Math.min(Math.round(t), 80);
  let tx = target.x, ty = target.y, tvx = target.vx, tvy = target.vy;
  for (let s = 0; s < steps; s++) { tvx *= 0.975; tvy *= 0.975; tx += tvx; ty += tvy; }
  return [tx, ty];
}

// Wall/asteroid avoidance for easy/medium AI
function avoidHazards(bot, aimX, aimY, wallMult, astMult) {
  const projX = bot.x + bot.vx * 35, projY = bot.y + bot.vy * 35;
  const wm    = BOT_WALL_MARGIN * wallMult;
  if (projX < wm)            aimX += (wm - projX)            * 5;
  if (projX > WORLD_W - wm)  aimX -= (wm - (WORLD_W - projX)) * 5;
  if (projY < wm)            aimY += (wm - projY)            * 5;
  if (projY > WORLD_H - wm)  aimY -= (wm - (WORLD_H - projY)) * 5;
  for (const ast of ASTEROIDS) {
    const adx = ast.x - bot.x, ady = ast.y - bot.y;
    const adist = Math.hypot(adx, ady);
    const clear = ast.r + SHIP_RADIUS + BOT_AST_MARGIN * astMult;
    if (adist < clear && adist > 0) {
      const perpX = -ady / adist, perpY = adx / adist;
      const sign  = (bot.vx * perpX + bot.vy * perpY) >= 0 ? 1 : -1;
      aimX += perpX * (clear - adist) * 6 * sign;
      aimY += perpY * (clear - adist) * 6 * sign;
    }
  }
  return [aimX, aimY];
}

// Enhanced avoidance for beast AI: looks 50 ticks ahead, checks trajectory intersection
function avoidHazardsBeast(bot, aimX, aimY) {
  const projX = bot.x + bot.vx * 50, projY = bot.y + bot.vy * 50;
  const wm = BOT_WALL_MARGIN * 1.9;
  if (projX < wm)            aimX += (wm - projX)             * 7;
  if (projX > WORLD_W - wm)  aimX -= (wm - (WORLD_W - projX)) * 7;
  if (projY < wm)            aimY += (wm - projY)             * 7;
  if (projY > WORLD_H - wm)  aimY -= (wm - (WORLD_H - projY)) * 7;
  // Clamp aim to world
  aimX = Math.max(BOT_WALL_MARGIN, Math.min(WORLD_W - BOT_WALL_MARGIN, aimX));
  aimY = Math.max(BOT_WALL_MARGIN, Math.min(WORLD_H - BOT_WALL_MARGIN, aimY));
  for (const ast of ASTEROIDS) {
    const adx = ast.x - bot.x, ady = ast.y - bot.y;
    const adist = Math.hypot(adx, ady);
    const clear = ast.r + SHIP_RADIUS + BOT_AST_MARGIN * 1.8;
    if (adist < clear * 1.5 && adist > 0) {
      // Only push if moving toward asteroid
      const velDot = (bot.vx * adx + bot.vy * ady) / (adist || 1);
      const str = (clear - adist) * 9;
      const perpX = -ady / adist, perpY = adx / adist;
      const sign  = (bot.vx * perpX + bot.vy * perpY) >= 0 ? 1 : -1;
      if (adist < clear || velDot > 0) {
        aimX += perpX * str * sign;
        aimY += perpY * str * sign;
      }
    }
  }
  return [aimX, aimY];
}

// ── BEAST: Advanced full-map-aware AI ────────────────────────────────────────
function botThinkBeast(bot, state, now) {
  if (!bot.alive) return emptyInput();

  // ── 1. Instant upgrade with diverse branch strategy ───────────────────
  if (bot.pendingUpgrade) {
    const node = UPGRADE_TREE[bot.upgradePath[bot.upgradePath.length - 1]];
    if (node && node.next.length > 0) {
      const mixed = node.next.some(id => id[0] !== node.next[0][0]);
      let pick;
      if (mixed) {
        // Each bot gets a different primary branch for genuine diversity
        const BRANCH_BY_IDX = ['F','S','T','F','S','E','D','F','S','T','F','S','T','E','D'];
        const pref = BRANCH_BY_IDX[bot.index % 15];
        pick = node.next.find(id => id[0] === pref) || node.next[0];
      } else {
        // Within-branch: some bots take the c sub-branch, others a/b
        // c-branch bots: index % 3 === 2; a-bots: even; b-bots: odd
        const hasCPath = node.next.some(id => id.endsWith('c') || id.endsWith('d'));
        if (hasCPath && bot.index % 3 === 2) {
          pick = node.next.find(id => id.endsWith('c')) || node.next[0];
        } else if (hasCPath && bot.index % 3 === 0) {
          pick = node.next.find(id => id.endsWith('a') || id.endsWith('c')) || node.next[0];
        } else {
          pick = node.next.find(id => id.endsWith('b') || id.endsWith('d')) || node.next[node.next.length - 1];
        }
      }
      applyUpgrade(bot, pick);
    } else { bot.pendingUpgrade = false; }
  }

  const p      = DIFF_PARAMS.beast;
  const inp    = emptyInput();
  const hpFrac = bot.health / bot.ss.health;

  // ── 2. Full tactical re-evaluation every p.ticks ─────────────────────
  if (state.tick - (bot._botDecision || 0) >= p.ticks) {
    bot._botDecision = state.tick;

    // Stuck detection: if barely moved in 60 ticks, aim toward map center
    if (bot._lastX == null) { bot._lastX = bot.x; bot._lastY = bot.y; bot._lastXTick = state.tick; }
    if (state.tick - (bot._lastXTick || 0) >= 60) {
      if (Math.hypot(bot.x - bot._lastX, bot.y - bot._lastY) < 50) {
        const escAng = Math.atan2(WORLD_H/2 - bot.y, WORLD_W/2 - bot.x) + (Math.random()-0.5)*1.4;
        bot._wanderPt = { x: bot.x + Math.cos(escAng)*900, y: bot.y + Math.sin(escAng)*900 };
      }
      bot._lastX = bot.x; bot._lastY = bot.y; bot._lastXTick = state.tick;
    }

    // ── Target scoring (multi-factor) ──────────────────────────────────
    let target = null, bestTScore = -Infinity;
    for (const s of state.ships) {
      if (s.index === bot.index || !s.alive) continue;
      const dist    = Math.hypot(s.x - bot.x, s.y - bot.y);
      const maxHp   = s.maxHealth || (s.ss && s.ss.health) || 5;
      const hpRatio = s.health / maxHp;
      let score = 0;
      score += !s.isBot ? 900 : 0;                     // humans are high-value XP
      score += (1 - hpRatio) * 600;                    // low HP = easy kill
      score -= dist * 0.22;                            // mild distance penalty
      score += (s.tier || 0) * 15;                     // more XP from high tier
      // Bonus if target is drifting toward a wall (cornered)
      const px = s.x + s.vx * 25, py = s.y + s.vy * 25;
      if (px < 700 || px > WORLD_W-700 || py < 700 || py > WORLD_H-700) score += 200;
      if (score > bestTScore) { bestTScore = score; target = s; }
    }
    const targetDist = target ? Math.hypot(target.x - bot.x, target.y - bot.y) : Infinity;

    // ── XP block scoring (value × cluster / (distance + danger)) ──────
    let farmBlk = null, bestFScore = -Infinity;
    for (const blk of state.xpBlocks) {
      if (!blk.alive) continue;
      const dist = Math.hypot(blk.x - bot.x, blk.y - bot.y);
      // Danger: proximity of enemies to the block
      let danger = 0;
      for (const s of state.ships) {
        if (!s.alive || s.index === bot.index) continue;
        const ed = Math.hypot(blk.x - s.x, blk.y - s.y);
        if (ed < 600) danger += (600 - ed) * 0.4;
      }
      // Cluster bonus: nearby alive blocks
      let cluster = 0;
      for (const b2 of state.xpBlocks) {
        if (b2.alive && b2 !== blk && Math.hypot(b2.x-blk.x, b2.y-blk.y) < 250) cluster += 40;
      }
      const score = (blk.xp || 50) * 2.5 + cluster - dist * 0.08 - danger;
      if (score > bestFScore) { bestFScore = score; farmBlk = blk; }
    }

    // ── Trajectory-based bullet threat detection ────────────────────────
    // Simulate each threatening bullet + own ship forward 18 ticks
    let dodgeX = 0, dodgeY = 0, dodgeLevel = 0;
    for (const b of state.bullets) {
      if (b.ownerIndex === bot.index || b.homing) continue;
      const bvx = b.vx, bvy = b.vy;
      const bspd2 = Math.hypot(bvx, bvy) || 1;
      // Quick range cull before expensive simulation
      if (Math.hypot(b.x - bot.x, b.y - bot.y) > 500) continue;
      let bx = b.x, by = b.y;
      let sfx = bot.x, sfy = bot.y, sfvx = bot.vx, sfvy = bot.vy;
      let minD = Infinity;
      for (let t = 1; t <= 18; t++) {
        bx += bvx; by += bvy;
        sfvx *= 0.975; sfvy *= 0.975;
        sfx += sfvx; sfy += sfvy;
        const d = Math.hypot(bx - sfx, by - sfy);
        if (d < minD) minD = d;
      }
      const CLOSE = SHIP_RADIUS + BULLET_RADIUS + 26;
      if (minD < CLOSE * 2.8) {
        const threat = Math.max(0, 1 - minD / (CLOSE * 2.8));
        // Perpendicular to bullet's travel direction
        const perpX = -bvy / bspd2, perpY = bvx / bspd2;
        // Choose the side that takes us away from bullet trajectory
        // (cross product of bullet-to-bot with bullet direction gives side)
        const toBotX = bot.x - b.x, toBotY = bot.y - b.y;
        const cross  = toBotX * (bvy / bspd2) - toBotY * (bvx / bspd2);
        const sign   = cross >= 0 ? 1 : -1;
        dodgeX += perpX * sign * threat;
        dodgeY += perpY * sign * threat;
        dodgeLevel += threat;
      }
    }
    const dodging = dodgeLevel > 0.12;

    // ── Weighted flee pressure from nearby enemies ──────────────────────
    let fleeX = 0, fleeY = 0, fleePressure = 0;
    for (const s of state.ships) {
      if (s.index === bot.index || !s.alive) continue;
      const dx = bot.x - s.x, dy = bot.y - s.y;
      const d  = Math.hypot(dx, dy) || 1;
      if (d < 700) {
        const w = (1 - d/700) * ((s.tier || 0) + 1) * 0.4;
        fleeX += (dx/d) * w; fleeY += (dy/d) * w; fleePressure += w;
      }
    }

    // ── Cover seeking: find asteroid that screens us from enemies ───────
    let coverX = WORLD_W/2, coverY = WORLD_H/2;
    if (hpFrac < 0.35) {
      let bestCover = -Infinity;
      for (const ast of ASTEROIDS) {
        const da = Math.hypot(ast.x - bot.x, ast.y - bot.y);
        if (da > 2200) continue;
        let coverScore = 0;
        for (const s of state.ships) {
          if (!s.alive || s.index === bot.index) continue;
          // How well does asteroid block line of sight from this enemy?
          const ex = s.x, ey = s.y;
          const toAstAng  = Math.atan2(ast.y - ey, ast.x - ex);
          const toBotAng  = Math.atan2(bot.y - ey, bot.x - ex);
          let angSep = Math.abs(normalAngle(toAstAng - toBotAng));
          if (angSep > Math.PI) angSep = Math.PI*2 - angSep;
          if (angSep < 0.5) coverScore += 300; // asteroid is between enemy and us
        }
        coverScore -= da * 0.06;
        if (coverScore > bestCover) {
          bestCover = coverScore;
          // Position behind asteroid (away from nearest enemy)
          const ang = Math.atan2(bot.y - ast.y, bot.x - ast.x);
          coverX = ast.x + Math.cos(ang) * (ast.r + SHIP_RADIUS + 50);
          coverY = ast.y + Math.sin(ang) * (ast.r + SHIP_RADIUS + 50);
        }
      }
    }

    // ── State machine ───────────────────────────────────────────────────
    let bState, aimX = bot.x, aimY = bot.y;
    const wantsXP  = bot.tier < 20 && farmBlk && (targetDist > 900 || target === null);
    const critical = hpFrac < p.retreatHp;
    const wounded  = hpFrac < 0.38 && fleePressure > 0.4;

    if (critical || wounded) {
      bState = 'retreat';
      aimX = coverX; aimY = coverY;

    } else if (dodging && dodgeLevel > 0.18) {
      bState = 'dodge';
      const dl = Math.hypot(dodgeX, dodgeY) || 1;
      aimX = bot.x + (dodgeX / dl) * 520;
      aimY = bot.y + (dodgeY / dl) * 520;

    } else if (target && targetDist <= p.huntRange) {
      bState = 'hunt';
      const [lx, ly] = beamSolutionComp(bot, target);
      aimX = lx; aimY = ly;

    } else if (target && targetDist <= p.huntRange * 1.6) {
      // Flank: approach from perpendicular to enemy's velocity for harder-to-dodge angle
      bState = 'flank';
      const eSpd  = Math.hypot(target.vx, target.vy);
      const flankDir = (bot.index % 2 === 0 ? 1 : -1) *
                       (Math.sin(state.tick * 0.005 + bot.index) > 0 ? 1 : -1);
      const perpAng = (eSpd > 0.5)
        ? Math.atan2(target.vy, target.vx) + Math.PI/2 * flankDir
        : Math.atan2(bot.y - target.y, bot.x - target.x) + Math.PI/2 * flankDir;
      aimX = target.x + Math.cos(perpAng) * 340;
      aimY = target.y + Math.sin(perpAng) * 340;

    } else if (wantsXP) {
      bState = 'farm';
      aimX = farmBlk.x; aimY = farmBlk.y;

    } else if (target) {
      bState = 'intercept';
      const eta = targetDist / Math.max(bot.ss.maxSpd * 0.85, 1);
      aimX = target.x + target.vx * Math.min(eta * 0.65, 90);
      aimY = target.y + target.vy * Math.min(eta * 0.65, 90);

    } else {
      bState = 'wander';
      if (!bot._wanderPt || Math.hypot(bot._wanderPt.x - bot.x, bot._wanderPt.y - bot.y) < 160)
        bot._wanderPt = { x: rnd(500, WORLD_W-500), y: rnd(500, WORLD_H-500) };
      aimX = bot._wanderPt.x; aimY = bot._wanderPt.y;
    }

    [aimX, aimY] = avoidHazardsBeast(bot, aimX, aimY);

    // Cache all tactical decisions
    bot._botState    = bState;
    bot._aimX        = aimX;
    bot._aimY        = aimY;
    bot._target      = target;
    bot._farmBlk     = farmBlk;
    bot._dodgeX      = dodgeX;
    bot._dodgeY      = dodgeY;
    bot._dodging     = dodging;
    bot._dodgeLevel  = dodgeLevel;
  }

  // ── 3. Per-tick steering (always fresh — no caching for rotation) ─────
  const bState = bot._botState || 'wander';
  const aimX   = bot._aimX != null ? bot._aimX : bot.x;
  const aimY   = bot._aimY != null ? bot._aimY : bot.y;
  const target = bot._target || null;

  const dx   = aimX - bot.x, dy = aimY - bot.y;
  const tgtA = Math.atan2(dy, dx);
  let diff   = normalAngle(tgtA - bot.angle);
  if (diff > Math.PI) diff -= Math.PI * 2;

  // Angular PD controller: proportional on diff, derivative on angularVel
  // Prevents oscillation — anticipates overshoot from angular momentum
  const angVel  = bot.angularVel || 0;
  const control = diff * 1.0 - angVel * 5.5;
  if (control >  0.035) inp.d = true;
  if (control < -0.035) inp.a = true;

  // ── Throttle, fire, boost ─────────────────────────────────────────────
  const boostReady = now - bot.lastBoost >= bot.ss.boostCd;

  if (bState === 'retreat') {
    inp.w = true;
    if (boostReady) inp.shift = true;
    // Opportunistic fire — still dangerous even while running
    if (target) {
      const [lx2, ly2] = beamSolutionComp(bot, target);
      let ad = normalAngle(Math.atan2(ly2 - bot.y, lx2 - bot.x) - bot.angle);
      if (ad > Math.PI) ad -= Math.PI * 2;
      if (Math.abs(ad) < p.aimTol * 1.5) inp.space = true;
    }

  } else if (bState === 'dodge') {
    inp.w = true;
    if (boostReady && (bot._dodgeLevel || 0) > 0.3) inp.shift = true;
    // Fire while dodging if briefly aligned
    if (target) {
      const [lx2, ly2] = beamSolutionComp(bot, target);
      let ad = normalAngle(Math.atan2(ly2 - bot.y, lx2 - bot.x) - bot.angle);
      if (ad > Math.PI) ad -= Math.PI * 2;
      if (Math.abs(ad) < p.aimTol * 1.1) inp.space = true;
    }

  } else if (bState === 'hunt') {
    const rawDist = target ? Math.hypot(target.x - bot.x, target.y - bot.y) : Infinity;
    const optimal = 290;
    if (rawDist > optimal + 60) {
      inp.w = true;
      if (rawDist > 850 && boostReady) inp.shift = true;
    } else if (rawDist < optimal - 60) {
      inp.s = true;
    } else {
      // Orbit with sinusoidal direction change — unpredictable to human players
      const strafeDir = Math.sin(state.tick * 0.013 + bot.index * 2.9) > 0 ? 1 : -1;
      const perpA     = tgtA + Math.PI / 2 * strafeDir;
      const latSpd    = bot.vx * Math.cos(perpA) + bot.vy * Math.sin(perpA);
      if (latSpd * strafeDir < 3.2) inp.w = true;
    }
    if (Math.abs(diff) < p.aimTol) inp.space = true;

  } else if (bState === 'flank') {
    inp.w = true;
    if (boostReady) inp.shift = true;
    // Fire opportunistically during approach
    if (target) {
      const [lx2, ly2] = beamSolutionComp(bot, target);
      let ad = normalAngle(Math.atan2(ly2 - bot.y, lx2 - bot.x) - bot.angle);
      if (ad > Math.PI) ad -= Math.PI * 2;
      if (Math.abs(ad) < p.aimTol * 1.3) inp.space = true;
    }

  } else if (bState === 'intercept') {
    inp.w = true;
    if (boostReady) inp.shift = true;

  } else if (bState === 'farm') {
    const blk = bot._farmBlk;
    if (blk && Math.hypot(blk.x - bot.x, blk.y - bot.y) > 60) inp.w = true;
    // Shoot enemies that wander close during farm runs
    if (target && Math.hypot(target.x - bot.x, target.y - bot.y) < 900) {
      const [lx2, ly2] = beamSolutionComp(bot, target);
      let ad = normalAngle(Math.atan2(ly2 - bot.y, lx2 - bot.x) - bot.angle);
      if (ad > Math.PI) ad -= Math.PI * 2;
      if (Math.abs(ad) < p.aimTol * 1.4) inp.space = true;
    }

  } else { // wander
    if (Math.hypot(aimX - bot.x, aimY - bot.y) > 100) inp.w = true;
  }

  bot._beastInp = inp;
  return inp;
}

// ── EASY / MEDIUM: original AI ────────────────────────────────────────────────
function botThink(bot, state, now, difficulty) {
  if (!bot.alive) return emptyInput();

  // Route beast difficulty to the advanced brain
  if (difficulty === 'beast') return botThinkBeast(bot, state, now);

  const p = DIFF_PARAMS[difficulty] || DIFF_PARAMS.medium;

  // ── Immediately apply any pending upgrade ─────────────────────────────
  if (bot.pendingUpgrade) {
    const node = UPGRADE_TREE[bot.upgradePath[bot.upgradePath.length - 1]];
    if (node && node.next.length > 0) {
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

    // ── Stuck detection: every 60 ticks check if bot hasn't moved ──────
    if (bot._lastX == null) { bot._lastX = bot.x; bot._lastY = bot.y; bot._lastXTick = state.tick; }
    if (state.tick - (bot._lastXTick || 0) >= 60) {
      const moved = Math.hypot(bot.x - bot._lastX, bot.y - bot._lastY);
      const curState = bot._botState || 'wander';
      if (moved < 40 && (curState === 'farm' || curState === 'wander' || curState === 'intercept')) {
        bot._wanderPt = { x: rnd(300, WORLD_W - 300), y: rnd(300, WORLD_H - 300) };
      }
      bot._lastX = bot.x; bot._lastY = bot.y; bot._lastXTick = state.tick;
    }

    const hpFrac = bot.health / bot.ss.health;

    let nearEnemyDist = Infinity, nearEnemy = null;
    for (const s of state.ships) {
      if (s.index === bot.index || !s.alive) continue;
      const d = Math.hypot(s.x - bot.x, s.y - bot.y);
      if (d < nearEnemyDist) { nearEnemyDist = d; nearEnemy = s; }
    }
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

  let aimX, aimY;
  if (bot._botState === 'retreat') {
    const ex = tgt.x - bot.x, ey = tgt.y - bot.y;
    const ed = Math.hypot(ex, ey) || 1;
    aimX = bot.x - (ex / ed) * 500;
    aimY = bot.y - (ey / ed) * 500;
  } else if (bot._botState === 'hunt') {
    const dist    = Math.hypot(tgt.x - bot.x, tgt.y - bot.y);
    const travelT = Math.min(dist / Math.max(bot.ss.bulletSpd, 1), 35) * p.leadFactor;
    aimX = tgt.x + tgt.vx * travelT;
    aimY = tgt.y + tgt.vy * travelT;
  } else {
    aimX = tgt.x;
    aimY = tgt.y;
  }

  [aimX, aimY] = avoidHazards(bot, aimX, aimY, 1.0, 1.0);

  if (p.jitter > 0) {
    aimX += (Math.random() - 0.5) * p.jitter;
    aimY += (Math.random() - 0.5) * p.jitter;
  }

  const dx   = aimX - bot.x, dy = aimY - bot.y;
  const tgtA = Math.atan2(dy, dx);
  let diff   = normalAngle(tgtA - bot.angle);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff >  0.07) inp.d = true;
  if (diff < -0.07) inp.a = true;

  if (bot._botState === 'retreat') {
    inp.w = true;
    if (now - bot.lastBoost >= bot.ss.boostCd) inp.shift = true;
  } else if (bot._botState === 'hunt') {
    const rawDist = Math.hypot(tgt.x - bot.x, tgt.y - bot.y);
    if (rawDist > 300)         inp.w = true;
    else if (rawDist < 130)    inp.s = true;
    if (Math.abs(diff) < p.aimTol) inp.space = true;
    if (p.boostHunt && rawDist > 650 && now - bot.lastBoost >= bot.ss.boostCd) inp.shift = true;
  } else if (bot._botState === 'farm') {
    if (Math.hypot(tgt.x - bot.x, tgt.y - bot.y) > 60) inp.w = true;
    if (Math.abs(diff) < p.farmAimTol) inp.space = true;
  } else {
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
    isThomas:s.isThomas, missileCd:s.missileCooldown || 0,
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

  // ── Public room list broadcast ───────────────────────────────────────────────
  function broadcastPublicRooms() {
    const list = Object.values(rooms)
      .filter(r => r.isPublic)
      .map(r => ({
        code:        r.roomCode,
        playerCount: r.players.length,
        botDiff:     r.botDifficulty || 'medium',
        inProgress:  r.gameStarted,
      }));
    io.emit('public_rooms', list);
  }

  socket.on('get_public_rooms', () => {
    const list = Object.values(rooms)
      .filter(r => r.isPublic)
      .map(r => ({
        code:        r.roomCode,
        playerCount: r.players.length,
        botDiff:     r.botDifficulty || 'medium',
        inProgress:  r.gameStarted,
      }));
    socket.emit('public_rooms', list);
  });

  socket.on('create_lobby', ({ name, isPublic }) => {
    const code  = genCode();
    const pName = safeName(name);
    rooms[code] = {
      roomCode: code,
      isPublic: !!isPublic,
      players:  [{ id:socket.id, name:pName, index:0 }],
      gameStarted: false, gameState:null, gameLoopInterval:null,
      shutdownTimer: null,
      inputs: Array.from({length:MAX_PLAYERS}, emptyInput),
    };
    socketRoom[socket.id] = code;
    socket.join(code);
    socket.emit('lobby_created', { roomCode:code, playerIndex:0, players:[{name:pName,index:0}] });
    if (isPublic) broadcastPublicRooms();
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
    if (room.isPublic) broadcastPublicRooms();
  });

  // Join a running public game mid-match
  socket.on('join_running_game', ({ name, roomCode }) => {
    const code = String(roomCode||'').toUpperCase().trim();
    const room = rooms[code];
    if (!room || !room.isPublic || !room.gameStarted || !room.gameState)
      return socket.emit('lobby_error', { message: 'Game not available.' });
    if (room.players.length >= MAX_PLAYERS)
      return socket.emit('lobby_error', { message: 'Room is full.' });
    const pName = safeName(name);
    const idx   = room.gameState.ships.length;
    room.players.push({ id: socket.id, name: pName, index: idx });
    socketRoom[socket.id] = code;
    socket.join(code);
    // Spawn a new ship in the live game
    const ship = makeShip(socket.id, idx, pName, false);
    room.gameState.ships.push(ship);
    while (room.inputs.length <= idx) room.inputs.push(emptyInput());
    socket.emit('game_start', {
      yourIndex:   idx,
      gameState:   cleanState(room.gameState),
      upgradeTree: UPGRADE_TREE,
      difficulty:  room.botDifficulty,
      worldW:      WORLD_W,
      worldH:      WORLD_H,
      asteroids:   ASTEROIDS,
    });
    broadcastPublicRooms();
  });

  socket.on('start_game', ({ difficulty } = {}) => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || room.gameStarted) return;
    const p = room.players.find(p=>p.id===socket.id);
    if (!p || p.index !== 0) return;

    room.botDifficulty = ['easy','medium','beast','none'].includes(difficulty) ? difficulty : 'medium';
    room.gameStarted   = true;
    room.gameState     = makeGameState(room.players, room.botDifficulty);
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

  socket.on('fire_missile', ({ targetIndex }) => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || !room.gameState) return;
    const pl = room.players.find(p=>p.id===socket.id);
    if (!pl) return;
    const ship = room.gameState.ships[pl.index];
    if (!ship || !ship.alive || !ship.isThomas) return;
    const tgt = room.gameState.ships[targetIndex];
    if (!tgt || !tgt.alive || tgt.index === ship.index) return;
    // Cap concurrent missiles: max 3 homing bullets owned by this player at once
    const activeMissiles = room.gameState.bullets.filter(b => b.homing && b.ownerIndex === ship.index).length;
    if (activeMissiles >= 3) return;
    const ang = Math.atan2(tgt.y - ship.y, tgt.x - ship.x);
    room.gameState.bullets.push({
      id: nextBulletId++,
      ownerIndex: ship.index,
      x: ship.x + Math.cos(ship.angle) * 22,
      y: ship.y + Math.sin(ship.angle) * 22,
      vx: Math.cos(ang) * MISSILE_SPD_MIN,
      vy: Math.sin(ang) * MISSILE_SPD_MIN,
      dmg: MISSILE_DMG,
      born: room.gameState.tick,
      homing: true,
      targetIndex,
      missileAge: 0,
    });
  });

  socket.on('fire_salvo', () => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || !room.gameState) return;
    const pl = room.players.find(p=>p.id===socket.id);
    if (!pl) return;
    const ship = room.gameState.ships[pl.index];
    if (!ship || !ship.alive || !ship.isThomas) return;
    // Gather all living enemies
    const enemies = room.gameState.ships.filter(s => s.alive && s.index !== ship.index);
    if (enemies.length === 0) return;
    // Cap total concurrent missiles at 14
    const existing = room.gameState.bullets.filter(b => b.homing && b.ownerIndex === ship.index).length;
    const slots = Math.max(0, 14 - existing);
    const targets = enemies.slice(0, slots);
    for (const tgt of targets) {
      const ang = Math.atan2(tgt.y - ship.y, tgt.x - ship.x);
      room.gameState.bullets.push({
        id: nextBulletId++,
        ownerIndex: ship.index,
        x: ship.x + Math.cos(ship.angle) * 22,
        y: ship.y + Math.sin(ship.angle) * 22,
        vx: Math.cos(ang) * MISSILE_SPD_MIN,
        vy: Math.sin(ang) * MISSILE_SPD_MIN,
        dmg: MISSILE_DMG,
        born: room.gameState.tick,
        homing: true,
        targetIndex: tgt.index,
        missileAge: 0,
      });
    }
  });

  // ── Thomas_ special hacks ───────────────────────────────────────────────────
  const HACK_CDS = { dash: 2500, nova: 12000, god: 28000, warp: 8000, emp: 18000 };

  socket.on('thomas_hack', ({ type }) => {
    const code = socketRoom[socket.id];
    const room = code && rooms[code];
    if (!room || !room.gameState) return;
    const pl = room.players.find(p => p.id === socket.id);
    if (!pl) return;
    const ship = room.gameState.ships[pl.index];
    if (!ship || !ship.alive || !ship.isThomas) return;

    if (!ship._hackCds) ship._hackCds = {};
    const now = Date.now();
    if ((ship._hackCds[type] || 0) > now) return; // still on cooldown

    if (type === 'dash') {
      // Hyper Dash: teleport 700px forward through walls
      ship._hackCds.dash = now + HACK_CDS.dash;
      const dist = 700;
      ship.x = Math.max(50, Math.min(WORLD_W - 50, ship.x + Math.cos(ship.angle) * dist));
      ship.y = Math.max(50, Math.min(WORLD_H - 50, ship.y + Math.sin(ship.angle) * dist));
      ship.invincible = true; ship.invincibleUntil = now + 400;
      io.to(code).emit('hack_effect', { type:'dash', x:ship.x, y:ship.y, ownerIndex:ship.index });

    } else if (type === 'nova') {
      // Nova Blast: annihilate everything within 480px
      ship._hackCds.nova = now + HACK_CDS.nova;
      const NOVA_R = 480;
      for (const tgt of room.gameState.ships) {
        if (tgt.index === ship.index || !tgt.alive || tgt.invincible) continue;
        if (Math.hypot(tgt.x - ship.x, tgt.y - ship.y) < NOVA_R) {
          const resist = (tgt.ss && tgt.ss.dmgReduce) || 0;
          tgt.health -= Math.round(200 * (1 - resist));
          if (tgt.health <= 0) handleDeath(tgt, ship, room.gameState, room, now);
        }
      }
      // Destroy nearby bullets
      room.gameState.bullets = room.gameState.bullets.filter(b =>
        Math.hypot(b.x - ship.x, b.y - ship.y) >= NOVA_R * 0.7
      );
      io.to(code).emit('hack_effect', { type:'nova', x:ship.x, y:ship.y, r:NOVA_R, ownerIndex:ship.index });

    } else if (type === 'god') {
      // God Mode: full heal + 6s invincibility
      ship._hackCds.god = now + HACK_CDS.god;
      ship.health = ship.ss.health;
      ship.invincible = true;
      ship.invincibleUntil = now + 6000;
      io.to(code).emit('hack_effect', { type:'god', x:ship.x, y:ship.y, ownerIndex:ship.index });

    } else if (type === 'warp') {
      // Void Warp: teleport to a random safe spot far from enemies
      ship._hackCds.warp = now + HACK_CDS.warp;
      let bestX = ship.x, bestY = ship.y, bestScore = -Infinity;
      for (let attempt = 0; attempt < 20; attempt++) {
        const cx = rnd(300, WORLD_W - 300), cy = rnd(300, WORLD_H - 300);
        let minEnemyDist = Infinity;
        for (const s of room.gameState.ships) {
          if (s.index === ship.index || !s.alive) continue;
          const d = Math.hypot(cx - s.x, cy - s.y);
          if (d < minEnemyDist) minEnemyDist = d;
        }
        if (minEnemyDist > bestScore) { bestScore = minEnemyDist; bestX = cx; bestY = cy; }
      }
      ship.x = bestX; ship.y = bestY;
      ship.vx = ship.vy = 0;
      ship.invincible = true; ship.invincibleUntil = now + 800;
      io.to(code).emit('hack_effect', { type:'warp', x:ship.x, y:ship.y, ownerIndex:ship.index });

    } else if (type === 'emp') {
      // EMP Pulse: stun all enemies (zero velocity) within 900px for 1.5s
      ship._hackCds.emp = now + HACK_CDS.emp;
      const EMP_R = 900;
      for (const tgt of room.gameState.ships) {
        if (tgt.index === ship.index || !tgt.alive) continue;
        if (Math.hypot(tgt.x - ship.x, tgt.y - ship.y) < EMP_R) {
          tgt.vx *= 0.05; tgt.vy *= 0.05;
          tgt._empUntil = now + 1500;
        }
      }
      io.to(code).emit('hack_effect', { type:'emp', x:ship.x, y:ship.y, r:EMP_R, ownerIndex:ship.index });
    }
  });

  socket.on('leave_room',  () => cleanup(socket));
  socket.on('disconnect',  () => cleanup(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n  ★  Pixel Duel  →  http://localhost:${PORT}\n`));
