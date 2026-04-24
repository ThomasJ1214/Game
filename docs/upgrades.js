/* Shared upgrade tree — loaded by browser and required by server.js */
(function (root) {

  root.UPGRADE_TREE = {
    root:  { tier:0,  name:'Recruit',        stats:{},                                                next:['S1','F1','T1','D1','E1'] },

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

    // ── Branch D: Drone / Multi-shot ─────────────────────────────────────────────
    D1:    { tier:1,  name:'Drone Bay I',      stats:{ maxBullets:1, shootCd:30 },                      next:['D2a','D2b'] },
    D2a:   { tier:2,  name:'Scatter I',        stats:{ maxBullets:1, shootCd:40 },                      next:['D3a','D3b'] },
    D2b:   { tier:2,  name:'Pulse I',          stats:{ shootCd:50, bulletSpd:1 },                       next:['D3a','D3b'] },
    D3a:   { tier:3,  name:'Scatter II',       stats:{ maxBullets:1, shootCd:40 },                      next:['D4a','D4b'] },
    D3b:   { tier:3,  name:'Pulse II',         stats:{ shootCd:50, bulletDmg:1 },                       next:['D4a','D4b'] },
    D4a:   { tier:4,  name:'Swarmer',          stats:{ maxBullets:2, shootCd:30 },                      next:['D5a','D5b'] },
    D4b:   { tier:4,  name:'Repeater',         stats:{ shootCd:60, bulletSpd:2 },                       next:['D5a','D5b'] },
    D5a:   { tier:5,  name:'Hive',             stats:{ maxBullets:2, shootCd:40 },                      next:['D6a','D6b'] },
    D5b:   { tier:5,  name:'Chain Pulse',      stats:{ shootCd:50, bulletDmg:1, bulletSpd:1 },          next:['D6a','D6b'] },
    D6a:   { tier:6,  name:'Drone Horde',      stats:{ maxBullets:2, shootCd:40 },                      next:['D7a','D7b'] },
    D6b:   { tier:6,  name:'Storm',            stats:{ shootCd:50, bulletDmg:1 },                       next:['D7a','D7b'] },
    D7a:   { tier:7,  name:'Nanodrones',       stats:{ maxBullets:3, shootCd:30 },                      next:['D8a','D8b'] },
    D7b:   { tier:7,  name:'Tempest',          stats:{ shootCd:50, bulletDmg:2 },                       next:['D8a','D8b'] },
    D8a:   { tier:8,  name:'Swarm King',       stats:{ maxBullets:3, shootCd:40 },                      next:['D9a','D9b'] },
    D8b:   { tier:8,  name:'Maelstrom',        stats:{ shootCd:40, bulletDmg:2, bulletSpd:1 },          next:['D9a','D9b'] },
    D9a:   { tier:9,  name:'Legion',           stats:{ maxBullets:3, shootCd:40 },                      next:['D10a','D10b'] },
    D9b:   { tier:9,  name:'Chaos Engine',     stats:{ shootCd:50, bulletDmg:3 },                       next:['D10a','D10b'] },
    D10a:  { tier:10, name:'INFINITE SWARM',   stats:{ maxBullets:4, shootCd:50 },                      next:[] },
    D10b:  { tier:10, name:'ARMAGEDDON',       stats:{ shootCd:60, bulletDmg:4, maxBullets:2 },         next:[] },

    // ── Branch E: Energy / Velocity ───────────────────────────────────────────────
    E1:    { tier:1,  name:'Energy Cell',      stats:{ bulletSpd:2, bulletDmg:1 },                      next:['E2a','E2b'] },
    E2a:   { tier:2,  name:'Overclock I',      stats:{ bulletSpd:2, shootCd:30 },                       next:['E3a','E3b'] },
    E2b:   { tier:2,  name:'Plasma I',         stats:{ bulletDmg:1, bulletSpd:1 },                      next:['E3a','E3b'] },
    E3a:   { tier:3,  name:'Overclock II',     stats:{ bulletSpd:3, shootCd:40 },                       next:['E4a','E4b'] },
    E3b:   { tier:3,  name:'Plasma II',        stats:{ bulletDmg:1, bulletSpd:2 },                      next:['E4a','E4b'] },
    E4a:   { tier:4,  name:'Photon Drive',     stats:{ bulletSpd:3, shootCd:30 },                       next:['E5a','E5b'] },
    E4b:   { tier:4,  name:'Ion Cannon',       stats:{ bulletDmg:2, bulletSpd:2 },                      next:['E5a','E5b'] },
    E5a:   { tier:5,  name:'Light Barrier',    stats:{ bulletSpd:4, shootCd:30 },                       next:['E6a','E6b'] },
    E5b:   { tier:5,  name:'Fusion Bolt',      stats:{ bulletDmg:2, bulletSpd:2 },                      next:['E6a','E6b'] },
    E6a:   { tier:6,  name:'Warp Shot',        stats:{ bulletSpd:4, shootCd:40 },                       next:['E7a','E7b'] },
    E6b:   { tier:6,  name:'Nova Burst',       stats:{ bulletDmg:2, bulletSpd:2 },                      next:['E7a','E7b'] },
    E7a:   { tier:7,  name:'Hyperbeam',        stats:{ bulletSpd:5, shootCd:30 },                       next:['E8a','E8b'] },
    E7b:   { tier:7,  name:'Antimatter',       stats:{ bulletDmg:3, bulletSpd:2 },                      next:['E8a','E8b'] },
    E8a:   { tier:8,  name:'Quantum Lance',    stats:{ bulletSpd:5, shootCd:40 },                       next:['E9a','E9b'] },
    E8b:   { tier:8,  name:'Dark Energy',      stats:{ bulletDmg:3, bulletSpd:3 },                      next:['E9a','E9b'] },
    E9a:   { tier:9,  name:'Vortex Cannon',    stats:{ bulletSpd:6, shootCd:30 },                       next:['E10a','E10b'] },
    E9b:   { tier:9,  name:'Singularity Bolt', stats:{ bulletDmg:4, bulletSpd:2 },                      next:['E10a','E10b'] },
    E10a:  { tier:10, name:'LIGHT SPEED',      stats:{ bulletSpd:8, shootCd:50 },                       next:[] },
    E10b:  { tier:10, name:'VOID DESTROYER',   stats:{ bulletDmg:5, bulletSpd:4 },                      next:[] },
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

  // Returns 'S', 'F', 'T', 'D', 'E', or null
  root.getShipBranch = function (upgradePath) {
    for (const id of (upgradePath || [])) {
      if (id === 'root') continue;
      if (id[0] === 'S') return 'S';
      if (id[0] === 'F') return 'F';
      if (id[0] === 'T') return 'T';
      if (id[0] === 'D') return 'D';
      if (id[0] === 'E') return 'E';
    }
    return null;
  };

})(typeof module !== 'undefined' ? global : window);
