/* Shared upgrade tree — loaded by browser and required by server.js */
(function (root) {

  root.UPGRADE_TREE = {
    root:  { tier:0,  name:'Recruit',        stats:{},                                                next:['S1','F1','T1'] },

    // ── Branch A: Speed / Agility ─────────────────────────────────────────────────────────────────
    S1:    { tier:1,  name:'Booster I',       stats:{ thrust:0.06, maxSpd:1.0 },                      next:['S2a','S2b'] },
    S2a:   { tier:2,  name:'Afterburn',       stats:{ boostCd:600, thrust:0.05 },                     next:['S3a','S3b'] },
    S2b:   { tier:2,  name:'Slipstream',      stats:{ maxSpd:1.2,  drag:0.006 },                      next:['S3a','S3b'] },
    S3a:   { tier:3,  name:'Hyperdrive',      stats:{ boostCd:700, maxSpd:1.0 },                      next:['S4a','S4b'] },
    S3b:   { tier:3,  name:'Nimble',          stats:{ rotate:0.012, thrust:0.06 },                    next:['S4a','S4b'] },
    S4a:   { tier:4,  name:'Warp I',          stats:{ boostCd:600, maxSpd:1.0, thrust:0.04 },         next:['S5a','S5b'] },
    S4b:   { tier:4,  name:'Phantom',         stats:{ maxSpd:1.5,  drag:0.005 },                      next:['S5a','S5b'] },
    S5a:   { tier:5,  name:'Lightspeed',      stats:{ boostCd:700, thrust:0.06, maxSpd:1.0 },         next:['S6a','S6b'] },
    S5b:   { tier:5,  name:'Ghost',           stats:{ maxSpd:1.8,  rotate:0.010, drag:0.005 },        next:['S6a','S6b'] },
    S6a:   { tier:6,  name:'Overdrive',       stats:{ boostCd:600, maxSpd:1.5, thrust:0.05 },         next:['S7a','S7b'] },
    S6b:   { tier:6,  name:'Voidrunner',      stats:{ maxSpd:2.0,  drag:0.006, rotate:0.008 },        next:['S7a','S7b'] },
    S7a:   { tier:7,  name:'Nova Rush',       stats:{ boostCd:700, maxSpd:1.5, thrust:0.06 },         next:['S8a','S8b'] },
    S7b:   { tier:7,  name:'Spectre',         stats:{ maxSpd:2.0,  thrust:0.05, rotate:0.010 },       next:['S8a','S8b'] },
    S8a:   { tier:8,  name:'Warpstorm',       stats:{ boostCd:600, maxSpd:2.0, thrust:0.05 },         next:['S9a','S9b'] },
    S8b:   { tier:8,  name:'Wraith',          stats:{ maxSpd:2.0,  drag:0.007, rotate:0.012 },        next:['S9a','S9b'] },
    S9a:   { tier:9,  name:'Singularity',     stats:{ boostCd:700, maxSpd:2.5, thrust:0.07 },         next:['S10a','S10b'] },
    S9b:   { tier:9,  name:'Timerift',        stats:{ maxSpd:3.0,  rotate:0.014, drag:0.006 },        next:['S10a','S10b'] },
    S10a:  { tier:10, name:'APEX VELOCITY',   stats:{ boostCd:800, maxSpd:3.0, thrust:0.08 },         next:[] },
    S10b:  { tier:10, name:'TEMPORAL SHIFT',  stats:{ maxSpd:4.0,  rotate:0.016, drag:0.008 },        next:[] },

    // ── Branch B: Firepower ───────────────────────────────────────────────────────────────────────
    F1:    { tier:1,  name:'Gunner I',        stats:{ shootCd:50,  bulletDmg:1 },                     next:['F2a','F2b'] },
    F2a:   { tier:2,  name:'Rapid Fire',      stats:{ shootCd:60,  maxBullets:1 },                    next:['F3a','F3b'] },
    F2b:   { tier:2,  name:'Power Shot',      stats:{ bulletDmg:1, bulletSpd:1 },                     next:['F3a','F3b'] },
    F3a:   { tier:3,  name:'Burst',           stats:{ shootCd:50,  maxBullets:1 },                    next:['F4a','F4b'] },
    F3b:   { tier:3,  name:'Piercer',         stats:{ bulletDmg:1, bulletSpd:2 },                     next:['F4a','F4b'] },
    F4a:   { tier:4,  name:'Chain Gun',       stats:{ shootCd:60,  maxBullets:1 },                    next:['F5a','F5b'] },
    F4b:   { tier:4,  name:'Sniper',          stats:{ bulletDmg:1, bulletSpd:3 },                     next:['F5a','F5b'] },
    F5a:   { tier:5,  name:'Gatling',         stats:{ shootCd:60,  maxBullets:1 },                    next:['F6a','F6b'] },
    F5b:   { tier:5,  name:'Cannon',          stats:{ bulletDmg:2 },                                  next:['F6a','F6b'] },
    F6a:   { tier:6,  name:'Annihilator',     stats:{ shootCd:50,  bulletDmg:1 },                     next:['F7a','F7b'] },
    F6b:   { tier:6,  name:'Barrage',         stats:{ maxBullets:2, shootCd:40 },                     next:['F7a','F7b'] },
    F7a:   { tier:7,  name:'Death Blossom',   stats:{ shootCd:40,  bulletDmg:1, maxBullets:1 },       next:['F8a','F8b'] },
    F7b:   { tier:7,  name:'Railgun',         stats:{ bulletDmg:2, bulletSpd:2 },                     next:['F8a','F8b'] },
    F8a:   { tier:8,  name:'Obliterator',     stats:{ shootCd:50,  bulletDmg:2 },                     next:['F9a','F9b'] },
    F8b:   { tier:8,  name:'Swarm',           stats:{ maxBullets:2, shootCd:30 },                     next:['F9a','F9b'] },
    F9a:   { tier:9,  name:'God of War',      stats:{ shootCd:50,  bulletDmg:2, maxBullets:1 },       next:['F10a','F10b'] },
    F9b:   { tier:9,  name:'Reaper',          stats:{ bulletDmg:3, bulletSpd:2 },                     next:['F10a','F10b'] },
    F10a:  { tier:10, name:'ANNIHILATION',    stats:{ shootCd:60,  bulletDmg:3, maxBullets:1 },       next:[] },
    F10b:  { tier:10, name:'GODSLAYER',       stats:{ bulletDmg:4, bulletSpd:3 },                     next:[] },

    // ── Branch C: Tank / Shield ───────────────────────────────────────────────────────────────────
    T1:    { tier:1,  name:'Plating I',       stats:{ health:1, dmgReduce:0.05 },                     next:['T2a','T2b'] },
    T2a:   { tier:2,  name:'Plating II',      stats:{ health:1, dmgReduce:0.04 },                     next:['T3a','T3b'] },
    T2b:   { tier:2,  name:'Shield Gen',      stats:{ health:1, regenRate:1 },                        next:['T3a','T3b'] },
    T3a:   { tier:3,  name:'Armor+',          stats:{ health:2, dmgReduce:0.05 },                     next:['T4a','T4b'] },
    T3b:   { tier:3,  name:'Nanobots',        stats:{ regenRate:2, health:1 },                        next:['T4a','T4b'] },
    T4a:   { tier:4,  name:'Titan Hull',      stats:{ health:2, dmgReduce:0.06 },                     next:['T5a','T5b'] },
    T4b:   { tier:4,  name:'Juggernaut',      stats:{ health:2, regenRate:1 },                        next:['T5a','T5b'] },
    T5a:   { tier:5,  name:'Fortress',        stats:{ health:3, dmgReduce:0.06 },                     next:['T6a','T6b'] },
    T5b:   { tier:5,  name:'Regenerator',     stats:{ regenRate:2, health:2 },                        next:['T6a','T6b'] },
    T6a:   { tier:6,  name:'Iron Wall',       stats:{ health:2, dmgReduce:0.08 },                     next:['T7a','T7b'] },
    T6b:   { tier:6,  name:'Colossus',        stats:{ health:3, regenRate:2 },                        next:['T7a','T7b'] },
    T7a:   { tier:7,  name:'Bulwark',         stats:{ health:2, dmgReduce:0.10 },                     next:['T8a','T8b'] },
    T7b:   { tier:7,  name:'Leviathan',       stats:{ health:3, regenRate:2 },                        next:['T8a','T8b'] },
    T8a:   { tier:8,  name:'Aegis',           stats:{ health:3, dmgReduce:0.10 },                     next:['T9a','T9b'] },
    T8b:   { tier:8,  name:'Immortal',        stats:{ health:2, regenRate:3 },                        next:['T9a','T9b'] },
    T9a:   { tier:9,  name:'Dreadnought',     stats:{ health:4, dmgReduce:0.10 },                     next:['T10a','T10b'] },
    T9b:   { tier:9,  name:'Nexus',           stats:{ health:3, regenRate:4 },                        next:['T10a','T10b'] },
    T10a:  { tier:10, name:'ASCENDANT',       stats:{ health:5, dmgReduce:0.15 },                     next:[] },
    T10b:  { tier:10, name:'COLOSSUS GOD',    stats:{ health:4, regenRate:5 },                        next:[] },
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
    health:     5,
    regenRate:  0,   // 0 = off; otherwise regen 1 HP every (300/regenRate) ticks
    rotate:     0.088,
    dmgReduce:  0,   // 0–0.60: fraction of incoming bullet damage absorbed
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
      if (d.dmgReduce)  s.dmgReduce  = Math.min(0.60,  s.dmgReduce  + d.dmgReduce);
    }
    return s;
  };

  // Returns 'S', 'F', 'T', or null
  root.getShipBranch = function (upgradePath) {
    for (const id of (upgradePath || [])) {
      if (id === 'root') continue;
      if (id[0] === 'S') return 'S';
      if (id[0] === 'F') return 'F';
      if (id[0] === 'T') return 'T';
    }
    return null;
  };

})(typeof module !== 'undefined' ? global : window);
