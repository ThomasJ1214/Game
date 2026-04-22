/* Shared upgrade tree — loaded by browser and required by server.js */
(function (root) {

  root.UPGRADE_TREE = {
    root: { tier:0,  name:'Recruit',      stats:{},                                      next:['C1','S1','T1'] },
    // ── Combat branch ────────────────────────────────────────────────────────
    C1:   { tier:1,  name:'Combat I',     stats:{shootCd:40},                            next:['C2a','C2b'] },
    C2a:  { tier:2,  name:'Rapid Fire',   stats:{shootCd:50,maxBullets:1},               next:['C3a','C3b'] },
    C2b:  { tier:2,  name:'Power Shot',   stats:{bulletDmg:1,bulletSpd:1},               next:['C3a','C3b'] },
    C3a:  { tier:3,  name:'Gatling',      stats:{shootCd:60,maxBullets:1},               next:['C4a','C4b'] },
    C3b:  { tier:3,  name:'Piercer',      stats:{bulletSpd:2,bulletDmg:1},               next:['C4a','C4b'] },
    C4a:  { tier:4,  name:'Assault+',     stats:{shootCd:50,bulletDmg:1},                next:['C5a','C5b'] },
    C4b:  { tier:4,  name:'Barrage',      stats:{maxBullets:2,shootCd:30},               next:['C5a','C5b'] },
    C5a:  { tier:5,  name:'ANNIHILATOR',  stats:{shootCd:80,bulletDmg:2},                next:['X6a','X6b'] },
    C5b:  { tier:5,  name:'JUGGERNAUT',   stats:{maxBullets:2,bulletDmg:1,shootCd:40},   next:['X6a','X6c'] },
    // ── Speed branch ─────────────────────────────────────────────────────────
    S1:   { tier:1,  name:'Speed I',      stats:{thrust:0.05,maxSpd:0.8},                next:['S2a','S2b'] },
    S2a:  { tier:2,  name:'Afterburner',  stats:{boostCd:500,thrust:0.03},               next:['S3a','S3b'] },
    S2b:  { tier:2,  name:'Drift',        stats:{maxSpd:1,drag:0.005},                   next:['S3a','S3b'] },
    S3a:  { tier:3,  name:'Hyperdrive',   stats:{boostCd:600,maxSpd:0.8},                next:['S4a','S4b'] },
    S3b:  { tier:3,  name:'Nimble',       stats:{thrust:0.06,rotate:0.01},               next:['S4a','S4b'] },
    S4a:  { tier:4,  name:'Warp Drive',   stats:{boostCd:700,thrust:0.05},               next:['S5a','S5b'] },
    S4b:  { tier:4,  name:'Supersonic',   stats:{maxSpd:1.5,drag:0.004},                 next:['S5a','S5b'] },
    S5a:  { tier:5,  name:'SINGULARITY',  stats:{boostCd:800,maxSpd:1.5,thrust:0.05},    next:['X6b','X6c'] },
    S5b:  { tier:5,  name:'PHANTOM',      stats:{maxSpd:2,drag:0.006,rotate:0.012},      next:['X6a','X6c'] },
    // ── Tank branch ──────────────────────────────────────────────────────────
    T1:   { tier:1,  name:'Tank I',       stats:{health:1},                              next:['T2a','T2b'] },
    T2a:  { tier:2,  name:'Plating',      stats:{health:1},                              next:['T3a','T3b'] },
    T2b:  { tier:2,  name:'Shield Gen',   stats:{health:1,regenRate:1},                  next:['T3a','T3b'] },
    T3a:  { tier:3,  name:'Armor+',       stats:{health:2},                              next:['T4a','T4b'] },
    T3b:  { tier:3,  name:'Nanobots',     stats:{regenRate:1,health:1},                  next:['T4a','T4b'] },
    T4a:  { tier:4,  name:'Titan Hull',   stats:{health:2,regenRate:1},                  next:['T5a','T5b'] },
    T4b:  { tier:4,  name:'Juggernaut',   stats:{health:1,thrust:0.05},                  next:['T5a','T5b'] },
    T5a:  { tier:5,  name:'COLOSSUS',     stats:{health:3,regenRate:2},                  next:['X6b','X6d'] },
    T5b:  { tier:5,  name:'BASTION',      stats:{health:2,regenRate:2,shootCd:30},       next:['X6c','X6d'] },
    // ── Convergence tiers 6-10 ───────────────────────────────────────────────
    X6a:  { tier:6,  name:'Destroyer',    stats:{bulletDmg:1,shootCd:40,maxSpd:0.5},     next:['X7a','X7b'] },
    X6b:  { tier:6,  name:'Ghost Ship',   stats:{maxSpd:1,boostCd:300,health:1},         next:['X7a','X7c'] },
    X6c:  { tier:6,  name:'Warlock',      stats:{shootCd:30,maxBullets:1,health:1},      next:['X7b','X7c'] },
    X6d:  { tier:6,  name:'Iron Titan',   stats:{health:2,regenRate:2,thrust:0.03},      next:['X7a','X7d'] },
    X7a:  { tier:7,  name:'Predator',     stats:{bulletDmg:2,shootCd:50,thrust:0.04},    next:['X8a','X8b'] },
    X7b:  { tier:7,  name:'Specter',      stats:{maxSpd:1.5,boostCd:400,bulletSpd:1},    next:['X8a','X8c'] },
    X7c:  { tier:7,  name:'Ravager',      stats:{maxBullets:1,shootCd:40,health:1},      next:['X8b','X8c'] },
    X7d:  { tier:7,  name:'Leviathan',    stats:{health:2,regenRate:2,maxSpd:0.5},       next:['X8b','X8d'] },
    X8a:  { tier:8,  name:'Annihilator',  stats:{bulletDmg:2,maxBullets:1,shootCd:40},   next:['X9a','X9b'] },
    X8b:  { tier:8,  name:'Tempest',      stats:{maxSpd:1.5,thrust:0.05,boostCd:300},    next:['X9a','X9c'] },
    X8c:  { tier:8,  name:'Overlord',     stats:{shootCd:50,bulletDmg:1,health:2},       next:['X9b','X9c'] },
    X8d:  { tier:8,  name:'Colossus',     stats:{health:3,regenRate:2,thrust:0.04},      next:['X9b','X9d'] },
    X9a:  { tier:9,  name:'Nemesis',      stats:{bulletDmg:3,maxBullets:1,shootCd:60},   next:['X10a','X10b'] },
    X9b:  { tier:9,  name:'Vortex',       stats:{maxSpd:2,boostCd:500,thrust:0.06},      next:['X10a','X10c'] },
    X9c:  { tier:9,  name:'Reaper',       stats:{shootCd:70,bulletDmg:2,maxBullets:1},   next:['X10b','X10c'] },
    X9d:  { tier:9,  name:'Nexus',        stats:{health:3,regenRate:3,maxSpd:1},         next:['X10c','X10d'] },
    X10a: { tier:10, name:'OBLITERATOR',  stats:{bulletDmg:4,shootCd:80,maxBullets:1},   next:[] },
    X10b: { tier:10, name:'SINGULARITY',  stats:{maxSpd:3,boostCd:600,thrust:0.08},      next:[] },
    X10c: { tier:10, name:'GODSLAYER',    stats:{bulletDmg:3,maxBullets:2,shootCd:60},   next:[] },
    X10d: { tier:10, name:'ASCENDANT',    stats:{health:5,regenRate:4,bulletDmg:2},       next:[] },
  };

  root.BASE_STATS = {
    shootCd:    300,
    maxBullets: 3,
    bulletSpd:  9,
    bulletDmg:  1,
    thrust:     0.30,
    maxSpd:     6,
    drag:       0.975,
    boostCd:    3500,
    health:     3,
    regenRate:  0,   // 0 = off; otherwise regen 1 HP every (300/regenRate) ticks
    rotate:     0.088,
  };

  root.XP_PER_TIER = 150;   // flat XP cost per tier

  root.computeShipStats = function (upgradePath) {
    const s = Object.assign({}, root.BASE_STATS);
    for (const id of upgradePath) {
      if (id === 'root') continue;
      const node = root.UPGRADE_TREE[id];
      if (!node) continue;
      const d = node.stats;
      if (d.shootCd)    s.shootCd    = Math.max(80,    s.shootCd    - d.shootCd);
      if (d.maxBullets) s.maxBullets = Math.min(10,    s.maxBullets + d.maxBullets);
      if (d.bulletSpd)  s.bulletSpd += d.bulletSpd;
      if (d.bulletDmg)  s.bulletDmg += d.bulletDmg;
      if (d.thrust)     s.thrust    += d.thrust;
      if (d.maxSpd)     s.maxSpd    += d.maxSpd;
      if (d.drag)       s.drag       = Math.min(0.998, s.drag + d.drag);
      if (d.boostCd)    s.boostCd   = Math.max(500,   s.boostCd    - d.boostCd);
      if (d.health)     s.health    += d.health;
      if (d.regenRate)  s.regenRate += d.regenRate;
      if (d.rotate)     s.rotate    += d.rotate;
    }
    return s;
  };

})(typeof module !== 'undefined' ? global : window);
