/* Shared upgrade tree — loaded by browser and required by server.js */
(function (root) {

  root.UPGRADE_TREE = {
    root:  { tier:0,  name:'Recruit',        stats:{},                                                next:['S1','F1','T1','D1','E1'] },

    // ── Branch A: Speed / Agility ─────────────────────────────────────────────────────────────────
    S1:    { tier:1,  name:'Booster I',       stats:{ thrust:0.06, maxSpd:1.0 },                      next:['S2a','S2b'] },
    S2a:   { tier:2,  name:'Afterburn',       stats:{ boostCd:600, thrust:0.05 },                     next:['S3a','S3b','S3c'] },
    S2b:   { tier:2,  name:'Slipstream',      stats:{ maxSpd:1.2,  drag:0.006 },                      next:['S3a','S3b','S3c'] },
    S3a:   { tier:3,  name:'Hyperdrive',      stats:{ boostCd:700, maxSpd:1.0 },                      next:['S4a','S4b'] },
    S3b:   { tier:3,  name:'Nimble',          stats:{ rotate:0.012, thrust:0.06 },                    next:['S4a','S4b'] },
    S3c:   { tier:3,  name:'Combat Driver',   stats:{ maxSpd:0.8, bulletSpd:1, shootCd:30 },          next:['S4a','S4b'] },
    S4a:   { tier:4,  name:'Warp I',          stats:{ boostCd:600, maxSpd:1.0, thrust:0.04 },         next:['S5a','S5b','S5c'] },
    S4b:   { tier:4,  name:'Phantom',         stats:{ maxSpd:1.5,  drag:0.005 },                      next:['S5a','S5b','S5c'] },
    S5a:   { tier:5,  name:'Lightspeed',      stats:{ boostCd:700, thrust:0.06, maxSpd:1.0 },         next:['S6a','S6b'] },
    S5b:   { tier:5,  name:'Ghost',           stats:{ maxSpd:1.8,  rotate:0.010, drag:0.005 },        next:['S6a','S6b'] },
    S6a:   { tier:6,  name:'Overdrive',       stats:{ boostCd:600, maxSpd:1.5, thrust:0.05 },         next:['S7a','S7b'] },
    S6b:   { tier:6,  name:'Voidrunner',      stats:{ maxSpd:2.0,  drag:0.006, rotate:0.008 },        next:['S7a','S7b'] },
    S7a:   { tier:7,  name:'Nova Rush',       stats:{ boostCd:700, maxSpd:1.5, thrust:0.06 },         next:['S8a','S8b','S8e'] },
    S7b:   { tier:7,  name:'Spectre',         stats:{ maxSpd:2.0,  thrust:0.05, rotate:0.010 },       next:['S8a','S8b','S8e'] },
    S8a:   { tier:8,  name:'Warpstorm',       stats:{ boostCd:600, maxSpd:2.0, thrust:0.05 },         next:['S9a','S9b'] },
    S8b:   { tier:8,  name:'Wraith',          stats:{ maxSpd:2.0,  drag:0.007, rotate:0.012 },        next:['S9a','S9b'] },
    S8e:   { tier:8,  name:'Apex Hunter',     stats:{ maxSpd:1.5, thrust:0.06, rotate:0.010, shootCd:30 }, next:['S9a','S9b'] },
    S9a:   { tier:9,  name:'Singularity',     stats:{ boostCd:700, maxSpd:2.5, thrust:0.07 },         next:['S10a','S10b'] },
    S9b:   { tier:9,  name:'Timerift',        stats:{ maxSpd:3.0,  rotate:0.014, drag:0.006 },        next:['S10a','S10b'] },
    S10a:  { tier:10, name:'APEX VELOCITY',   stats:{ boostCd:800, maxSpd:3.0, thrust:0.08 },         next:['S11a','S11b'] },
    S10b:  { tier:10, name:'TEMPORAL SHIFT',  stats:{ maxSpd:4.0,  rotate:0.016, drag:0.008 },        next:['S11a','S11b'] },

    // ── S sub-branch C: Interceptor (combat speed + rotation) ────────────────
    S5c:   { tier:5,  name:'Interceptor',     stats:{ thrust:0.08, rotate:0.012 },                    next:['S6c','S6d'] },
    S6c:   { tier:6,  name:'Razorwing',       stats:{ maxSpd:1.5,  rotate:0.010, boostCd:300 },       next:['S7c','S7d'] },
    S6d:   { tier:6,  name:'Cyclone',         stats:{ maxSpd:1.8,  thrust:0.07 },                     next:['S7c','S7d'] },
    S7c:   { tier:7,  name:'Vortex',          stats:{ boostCd:400, maxSpd:1.5,  rotate:0.012 },       next:['S8c','S8d'] },
    S7d:   { tier:7,  name:'Thunderpeak',     stats:{ thrust:0.09, maxSpd:2.0 },                      next:['S8c','S8d'] },
    S8c:   { tier:8,  name:'Deathwing',       stats:{ maxSpd:2.0,  rotate:0.014, thrust:0.06 },       next:['S9c','S9d'] },
    S8d:   { tier:8,  name:'Hurricane',       stats:{ boostCd:500, maxSpd:2.5 },                      next:['S9c','S9d'] },
    S9c:   { tier:9,  name:'Omega Rush',      stats:{ boostCd:600, maxSpd:2.5,  rotate:0.014 },       next:['S10c','S10d'] },
    S9d:   { tier:9,  name:'Godspeed',        stats:{ thrust:0.10, maxSpd:3.0 },                      next:['S10c','S10d'] },
    S10c:  { tier:10, name:'APEX PREDATOR',   stats:{ boostCd:600, maxSpd:3.0,  thrust:0.10, rotate:0.016 }, next:['S11a','S11b'] },
    S10d:  { tier:10, name:'TRANSCENDENCE',   stats:{ maxSpd:4.5,  rotate:0.018, drag:0.008 },        next:['S11a','S11b'] },

    // ── Branch B: Firepower ───────────────────────────────────────────────────────────────────────
    F1:    { tier:1,  name:'Gunner I',        stats:{ shootCd:50,  bulletDmg:1 },                     next:['F2a','F2b'] },
    F2a:   { tier:2,  name:'Rapid Fire',      stats:{ shootCd:60,  maxBullets:1 },                    next:['F3a','F3b','F3c'] },
    F2b:   { tier:2,  name:'Power Shot',      stats:{ bulletDmg:1, bulletSpd:1 },                     next:['F3a','F3b','F3c'] },
    F3a:   { tier:3,  name:'Burst',           stats:{ shootCd:50,  maxBullets:1 },                    next:['F4a','F4b'] },
    F3b:   { tier:3,  name:'Piercer',         stats:{ bulletDmg:1, bulletSpd:2 },                     next:['F4a','F4b'] },
    F3c:   { tier:3,  name:'Fortified Guns',  stats:{ bulletDmg:1, dmgReduce:0.04, shootCd:20 },      next:['F4a','F4b'] },
    F4a:   { tier:4,  name:'Chain Gun',       stats:{ shootCd:60,  maxBullets:1 },                    next:['F5a','F5b','F5c'] },
    F4b:   { tier:4,  name:'Sniper',          stats:{ bulletDmg:1, bulletSpd:3 },                     next:['F5a','F5b','F5c'] },
    F5a:   { tier:5,  name:'Gatling',         stats:{ shootCd:60,  maxBullets:1 },                    next:['F6a','F6b'] },
    F5b:   { tier:5,  name:'Cannon',          stats:{ bulletDmg:2 },                                  next:['F6a','F6b'] },
    F6a:   { tier:6,  name:'Annihilator',     stats:{ shootCd:50,  bulletDmg:1 },                     next:['F7a','F7b'] },
    F6b:   { tier:6,  name:'Barrage',         stats:{ maxBullets:2, shootCd:40 },                     next:['F7a','F7b'] },
    F7a:   { tier:7,  name:'Death Blossom',   stats:{ shootCd:40,  bulletDmg:1, maxBullets:1 },       next:['F8a','F8b','F8e'] },
    F7b:   { tier:7,  name:'Railgun',         stats:{ bulletDmg:2, bulletSpd:2 },                     next:['F8a','F8b','F8e'] },
    F8a:   { tier:8,  name:'Obliterator',     stats:{ shootCd:50,  bulletDmg:2 },                     next:['F9a','F9b'] },
    F8b:   { tier:8,  name:'Swarm',           stats:{ maxBullets:2, shootCd:30 },                     next:['F9a','F9b'] },
    F8e:   { tier:8,  name:'Siege Cannon',    stats:{ bulletDmg:3, maxBullets:2 },                    next:['F9a','F9b'] },
    F9a:   { tier:9,  name:'God of War',      stats:{ shootCd:50,  bulletDmg:2, maxBullets:1 },       next:['F10a','F10b'] },
    F9b:   { tier:9,  name:'Reaper',          stats:{ bulletDmg:3, bulletSpd:2 },                     next:['F10a','F10b'] },
    F10a:  { tier:10, name:'ANNIHILATION',    stats:{ shootCd:60,  bulletDmg:3, maxBullets:1 },       next:['F11a','F11b'] },
    F10b:  { tier:10, name:'GODSLAYER',       stats:{ bulletDmg:4, bulletSpd:3 },                     next:['F11a','F11b'] },

    // ── F sub-branch C: Cluster (spread + mass bullets) ──────────────────────
    F5c:   { tier:5,  name:'Cluster Shot',    stats:{ maxBullets:2, bulletDmg:1 },                    next:['F6c','F6d'] },
    F6c:   { tier:6,  name:'Blitz',           stats:{ maxBullets:1, shootCd:50 },                     next:['F7c','F7d'] },
    F6d:   { tier:6,  name:'Firestorm',       stats:{ maxBullets:1, bulletDmg:1, shootCd:30 },        next:['F7c','F7d'] },
    F7c:   { tier:7,  name:'Devastator',      stats:{ maxBullets:2, shootCd:40 },                     next:['F8c','F8d'] },
    F7d:   { tier:7,  name:'Inferno',         stats:{ bulletDmg:2,  maxBullets:1 },                   next:['F8c','F8d'] },
    F8c:   { tier:8,  name:'Apocalypse',      stats:{ maxBullets:2, shootCd:50, bulletDmg:1 },        next:['F9c','F9d'] },
    F8d:   { tier:8,  name:'Armageddon',      stats:{ bulletDmg:3,  bulletSpd:1 },                    next:['F9c','F9d'] },
    F9c:   { tier:9,  name:'Harbinger',       stats:{ maxBullets:3, shootCd:40 },                     next:['F10c','F10d'] },
    F9d:   { tier:9,  name:'Extinction',      stats:{ bulletDmg:3,  bulletSpd:2, maxBullets:1 },      next:['F10c','F10d'] },
    F10c:  { tier:10, name:'TOTAL WAR',       stats:{ maxBullets:3, bulletDmg:2, shootCd:60 },        next:['F11a','F11b'] },
    F10d:  { tier:10, name:'OMEGA CANNON',    stats:{ bulletDmg:5,  bulletSpd:3 },                    next:['F11a','F11b'] },

    // ── Branch C: Tank / Shield ───────────────────────────────────────────────────────────────────
    T1:    { tier:1,  name:'Plating I',       stats:{ health:1, dmgReduce:0.05 },                     next:['T2a','T2b'] },
    T2a:   { tier:2,  name:'Plating II',      stats:{ health:1, dmgReduce:0.04 },                     next:['T3a','T3b','T3c'] },
    T2b:   { tier:2,  name:'Shield Gen',      stats:{ health:1, regenRate:1 },                        next:['T3a','T3b','T3c'] },
    T3a:   { tier:3,  name:'Armor+',          stats:{ health:2, dmgReduce:0.05 },                     next:['T4a','T4b'] },
    T3b:   { tier:3,  name:'Nanobots',        stats:{ regenRate:2, health:1 },                        next:['T4a','T4b'] },
    T3c:   { tier:3,  name:'Armored Gunner',  stats:{ health:1, dmgReduce:0.03, shootCd:30 },         next:['T4a','T4b'] },
    T4a:   { tier:4,  name:'Titan Hull',      stats:{ health:2, dmgReduce:0.06 },                     next:['T5a','T5b','T5c'] },
    T4b:   { tier:4,  name:'Juggernaut',      stats:{ health:2, regenRate:1 },                        next:['T5a','T5b','T5c'] },
    T5a:   { tier:5,  name:'Fortress',        stats:{ health:3, dmgReduce:0.06 },                     next:['T6a','T6b'] },
    T5b:   { tier:5,  name:'Regenerator',     stats:{ regenRate:2, health:2 },                        next:['T6a','T6b'] },
    T6a:   { tier:6,  name:'Iron Wall',       stats:{ health:2, dmgReduce:0.08 },                     next:['T7a','T7b'] },
    T6b:   { tier:6,  name:'Colossus',        stats:{ health:3, regenRate:2 },                        next:['T7a','T7b'] },
    T7a:   { tier:7,  name:'Bulwark',         stats:{ health:2, dmgReduce:0.10 },                     next:['T8a','T8b','T8e'] },
    T7b:   { tier:7,  name:'Leviathan',       stats:{ health:3, regenRate:2 },                        next:['T8a','T8b','T8e'] },
    T8a:   { tier:8,  name:'Aegis',           stats:{ health:3, dmgReduce:0.10 },                     next:['T9a','T9b'] },
    T8b:   { tier:8,  name:'Immortal',        stats:{ health:2, regenRate:3 },                        next:['T9a','T9b'] },
    T8e:   { tier:8,  name:'Supreme Bastion', stats:{ health:3, dmgReduce:0.10, regenRate:2 },        next:['T9a','T9b'] },
    T9a:   { tier:9,  name:'Dreadnought',     stats:{ health:4, dmgReduce:0.10 },                     next:['T10a','T10b'] },
    T9b:   { tier:9,  name:'Nexus',           stats:{ health:3, regenRate:4 },                        next:['T10a','T10b'] },
    T10a:  { tier:10, name:'ASCENDANT',       stats:{ health:5, dmgReduce:0.15 },                     next:['T11a','T11b'] },
    T10b:  { tier:10, name:'COLOSSUS GOD',    stats:{ health:4, regenRate:5 },                        next:['T11a','T11b'] },

    // ── T sub-branch C: Bastion (extreme armor + regen fusion) ───────────────
    T5c:   { tier:5,  name:'Bastion',         stats:{ health:2, dmgReduce:0.08 },                     next:['T6c','T6d'] },
    T6c:   { tier:6,  name:'Rampart',         stats:{ health:2, dmgReduce:0.08 },                     next:['T7c','T7d'] },
    T6d:   { tier:6,  name:'Sentinel',        stats:{ health:2, regenRate:2, dmgReduce:0.04 },        next:['T7c','T7d'] },
    T7c:   { tier:7,  name:'Citadel',         stats:{ health:3, dmgReduce:0.10 },                     next:['T8c','T8d'] },
    T7d:   { tier:7,  name:'Phalanx',         stats:{ health:2, regenRate:2, dmgReduce:0.06 },        next:['T8c','T8d'] },
    T8c:   { tier:8,  name:'Fortress God',    stats:{ health:3, dmgReduce:0.12 },                     next:['T9c','T9d'] },
    T8d:   { tier:8,  name:'Undying',         stats:{ health:2, regenRate:4 },                        next:['T9c','T9d'] },
    T9c:   { tier:9,  name:'Godwall',         stats:{ health:4, dmgReduce:0.12 },                     next:['T10c','T10d'] },
    T9d:   { tier:9,  name:'Eternal',         stats:{ health:3, regenRate:5, dmgReduce:0.05 },        next:['T10c','T10d'] },
    T10c:  { tier:10, name:'INDESTRUCTIBLE',  stats:{ health:6, dmgReduce:0.20 },                     next:['T11a','T11b'] },
    T10d:  { tier:10, name:'UNDYING GOD',     stats:{ health:4, regenRate:6, dmgReduce:0.10 },        next:['T11a','T11b'] },

    // ── Branch D: Drone / Multi-shot ─────────────────────────────────────────────
    D1:    { tier:1,  name:'Drone Bay I',      stats:{ maxBullets:1, shootCd:30 },                      next:['D2a','D2b'] },
    D2a:   { tier:2,  name:'Scatter I',        stats:{ maxBullets:1, shootCd:40 },                      next:['D3a','D3b','D3c'] },
    D2b:   { tier:2,  name:'Pulse I',          stats:{ shootCd:50, bulletSpd:1 },                       next:['D3a','D3b','D3c'] },
    D3a:   { tier:3,  name:'Scatter II',       stats:{ maxBullets:1, shootCd:40 },                      next:['D4a','D4b'] },
    D3b:   { tier:3,  name:'Pulse II',         stats:{ shootCd:50, bulletDmg:1 },                       next:['D4a','D4b'] },
    D3c:   { tier:3,  name:'Swift Swarm',      stats:{ maxBullets:1, maxSpd:0.6, shootCd:30 },          next:['D4a','D4b'] },
    D4a:   { tier:4,  name:'Swarmer',          stats:{ maxBullets:2, shootCd:30 },                      next:['D5a','D5b','D5c'] },
    D4b:   { tier:4,  name:'Repeater',         stats:{ shootCd:60, bulletSpd:2 },                       next:['D5a','D5b','D5c'] },
    D5a:   { tier:5,  name:'Hive',             stats:{ maxBullets:2, shootCd:40 },                      next:['D6a','D6b'] },
    D5b:   { tier:5,  name:'Chain Pulse',      stats:{ shootCd:50, bulletDmg:1, bulletSpd:1 },          next:['D6a','D6b'] },
    D5c:   { tier:5,  name:'Rapid Pulse',      stats:{ maxBullets:1, bulletSpd:2, shootCd:40 },         next:['D6a','D6b'] },
    D6a:   { tier:6,  name:'Drone Horde',      stats:{ maxBullets:2, shootCd:40 },                      next:['D7a','D7b'] },
    D6b:   { tier:6,  name:'Storm',            stats:{ shootCd:50, bulletDmg:1 },                       next:['D7a','D7b'] },
    D7a:   { tier:7,  name:'Nanodrones',       stats:{ maxBullets:3, shootCd:30 },                      next:['D8a','D8b','D8e'] },
    D7b:   { tier:7,  name:'Tempest',          stats:{ shootCd:50, bulletDmg:2 },                       next:['D8a','D8b','D8e'] },
    D8a:   { tier:8,  name:'Swarm King',       stats:{ maxBullets:3, shootCd:40 },                      next:['D9a','D9b'] },
    D8b:   { tier:8,  name:'Maelstrom',        stats:{ shootCd:40, bulletDmg:2, bulletSpd:1 },          next:['D9a','D9b'] },
    D8e:   { tier:8,  name:'Drone Nexus',      stats:{ maxBullets:3, shootCd:30, bulletDmg:1 },         next:['D9a','D9b'] },
    D9a:   { tier:9,  name:'Legion',           stats:{ maxBullets:3, shootCd:40 },                      next:['D10a','D10b'] },
    D9b:   { tier:9,  name:'Chaos Engine',     stats:{ shootCd:50, bulletDmg:3 },                       next:['D10a','D10b'] },
    D10a:  { tier:10, name:'INFINITE SWARM',   stats:{ maxBullets:4, shootCd:50 },                      next:['D11a','D11b'] },
    D10b:  { tier:10, name:'ARMAGEDDON',       stats:{ shootCd:60, bulletDmg:4, maxBullets:2 },         next:['D11a','D11b'] },

    // ── Branch E: Energy / Velocity ───────────────────────────────────────────────
    E1:    { tier:1,  name:'Energy Cell',      stats:{ bulletSpd:2, bulletDmg:1 },                      next:['E2a','E2b'] },
    E2a:   { tier:2,  name:'Overclock I',      stats:{ bulletSpd:2, shootCd:30 },                       next:['E3a','E3b','E3c'] },
    E2b:   { tier:2,  name:'Plasma I',         stats:{ bulletDmg:1, bulletSpd:1 },                      next:['E3a','E3b','E3c'] },
    E3a:   { tier:3,  name:'Overclock II',     stats:{ bulletSpd:3, shootCd:40 },                       next:['E4a','E4b'] },
    E3b:   { tier:3,  name:'Plasma II',        stats:{ bulletDmg:1, bulletSpd:2 },                      next:['E4a','E4b'] },
    E3c:   { tier:3,  name:'Energized Hull',   stats:{ bulletSpd:1, health:1, shootCd:20 },             next:['E4a','E4b'] },
    E4a:   { tier:4,  name:'Photon Drive',     stats:{ bulletSpd:3, shootCd:30 },                       next:['E5a','E5b','E5c'] },
    E4b:   { tier:4,  name:'Ion Cannon',       stats:{ bulletDmg:2, bulletSpd:2 },                      next:['E5a','E5b','E5c'] },
    E5a:   { tier:5,  name:'Light Barrier',    stats:{ bulletSpd:4, shootCd:30 },                       next:['E6a','E6b'] },
    E5b:   { tier:5,  name:'Fusion Bolt',      stats:{ bulletDmg:2, bulletSpd:2 },                      next:['E6a','E6b'] },
    E5c:   { tier:5,  name:'Void Pulse',       stats:{ bulletSpd:2, bulletDmg:1, health:1 },            next:['E6a','E6b'] },
    E6a:   { tier:6,  name:'Warp Shot',        stats:{ bulletSpd:4, shootCd:40 },                       next:['E7a','E7b'] },
    E6b:   { tier:6,  name:'Nova Burst',       stats:{ bulletDmg:2, bulletSpd:2 },                      next:['E7a','E7b'] },
    E7a:   { tier:7,  name:'Hyperbeam',        stats:{ bulletSpd:5, shootCd:30 },                       next:['E8a','E8b','E8e'] },
    E7b:   { tier:7,  name:'Antimatter',       stats:{ bulletDmg:3, bulletSpd:2 },                      next:['E8a','E8b','E8e'] },
    E8a:   { tier:8,  name:'Quantum Lance',    stats:{ bulletSpd:5, shootCd:40 },                       next:['E9a','E9b'] },
    E8b:   { tier:8,  name:'Dark Energy',      stats:{ bulletDmg:3, bulletSpd:3 },                      next:['E9a','E9b'] },
    E8e:   { tier:8,  name:'Hyperflux',        stats:{ bulletSpd:5, bulletDmg:2, shootCd:30 },          next:['E9a','E9b'] },
    E9a:   { tier:9,  name:'Vortex Cannon',    stats:{ bulletSpd:6, shootCd:30 },                       next:['E10a','E10b'] },
    E9b:   { tier:9,  name:'Singularity Bolt', stats:{ bulletDmg:4, bulletSpd:2 },                      next:['E10a','E10b'] },
    E10a:  { tier:10, name:'LIGHT SPEED',      stats:{ bulletSpd:8, shootCd:50 },                       next:['E11a','E11b'] },
    E10b:  { tier:10, name:'VOID DESTROYER',   stats:{ bulletDmg:5, bulletSpd:4 },                      next:['E11a','E11b'] },

    // ── S branch tiers 11-20 (all S10 paths converge here) ───────────────────
    S11a:  { tier:11, name:'Warp Nexus',       stats:{ boostCd:600, maxSpd:2.0, thrust:0.05 },          next:['S12a','S12b'] },
    S11b:  { tier:11, name:'Phase Drive',      stats:{ maxSpd:2.5,  rotate:0.010, drag:0.005 },          next:['S12a','S12b'] },
    S12a:  { tier:12, name:'Void Dash',        stats:{ boostCd:500, maxSpd:2.0, thrust:0.06 },           next:['S13a','S13b'] },
    S12b:  { tier:12, name:'Slipgate',         stats:{ maxSpd:2.5,  drag:0.006, rotate:0.008 },          next:['S13a','S13b'] },
    S13a:  { tier:13, name:'Hyperwarp',        stats:{ boostCd:600, maxSpd:2.0, thrust:0.06 },           next:['S14a','S14b','S14e'] },
    S13b:  { tier:13, name:'Nebula Drift',     stats:{ maxSpd:2.5,  rotate:0.012, drag:0.005 },          next:['S14a','S14b','S14e'] },
    S14a:  { tier:14, name:'Gravity Boost',    stats:{ boostCd:500, maxSpd:2.0, thrust:0.07 },           next:['S15a','S15b'] },
    S14b:  { tier:14, name:'Dark Matter Surf', stats:{ maxSpd:3.0,  drag:0.006, rotate:0.010 },          next:['S15a','S15b'] },
    S14e:  { tier:14, name:'Void Assassin',    stats:{ maxSpd:2.5, rotate:0.012, thrust:0.08 },          next:['S15a','S15b'] },
    S15a:  { tier:15, name:'Quantum Dash',     stats:{ boostCd:600, maxSpd:2.0, thrust:0.07 },           next:['S16a','S16b'] },
    S15b:  { tier:15, name:'Phase Shift',      stats:{ maxSpd:3.0,  rotate:0.012, drag:0.006 },          next:['S16a','S16b'] },
    S16a:  { tier:16, name:'Tachyon Drive',    stats:{ boostCd:500, maxSpd:2.5, thrust:0.08 },           next:['S17a','S17b'] },
    S16b:  { tier:16, name:'Void Surge',       stats:{ maxSpd:3.5,  drag:0.007, rotate:0.012 },          next:['S17a','S17b'] },
    S17a:  { tier:17, name:'Plasma Boost',     stats:{ boostCd:600, maxSpd:2.5, thrust:0.08 },           next:['S18a','S18b'] },
    S17b:  { tier:17, name:'Quantum Phase',    stats:{ maxSpd:3.5,  rotate:0.014, drag:0.006 },          next:['S18a','S18b'] },
    S18a:  { tier:18, name:'Dark Drive',       stats:{ boostCd:500, maxSpd:3.0, thrust:0.09 },           next:['S19a','S19b'] },
    S18b:  { tier:18, name:'Void Walker',      stats:{ maxSpd:4.0,  drag:0.008, rotate:0.014 },          next:['S19a','S19b'] },
    S19a:  { tier:19, name:'Omega Warp',       stats:{ boostCd:600, maxSpd:3.0, thrust:0.10 },           next:['S20a','S20b'] },
    S19b:  { tier:19, name:'Transcendent',     stats:{ maxSpd:4.5,  rotate:0.016, drag:0.008 },          next:['S20a','S20b'] },
    S20a:  { tier:20, name:'LIGHT BEYOND',     stats:{ boostCd:600, maxSpd:3.5, thrust:0.10 },           next:[] },
    S20b:  { tier:20, name:'VOID TRANSCEND',   stats:{ maxSpd:5.0,  rotate:0.018, drag:0.009 },          next:[] },

    // ── F branch tiers 11-20 (all F10 paths converge here) ───────────────────
    F11a:  { tier:11, name:'Destroyer Mk II',  stats:{ shootCd:40,  bulletDmg:2 },                       next:['F12a','F12b'] },
    F11b:  { tier:11, name:'Mass Driver',      stats:{ maxBullets:1, bulletDmg:2 },                      next:['F12a','F12b'] },
    F12a:  { tier:12, name:'Annihilator II',   stats:{ shootCd:50,  bulletDmg:2, maxBullets:1 },         next:['F13a','F13b'] },
    F12b:  { tier:12, name:'Railgun II',       stats:{ bulletDmg:2, bulletSpd:2 },                       next:['F13a','F13b'] },
    F13a:  { tier:13, name:'Hellfire',         stats:{ shootCd:40,  bulletDmg:2 },                       next:['F14a','F14b','F14e'] },
    F13b:  { tier:13, name:'Nova Cannon',      stats:{ maxBullets:1, bulletDmg:3 },                      next:['F14a','F14b','F14e'] },
    F14a:  { tier:14, name:'Death Ray',        stats:{ shootCd:50,  bulletDmg:2, maxBullets:1 },         next:['F15a','F15b'] },
    F14b:  { tier:14, name:'Omega Fire',       stats:{ bulletDmg:3, bulletSpd:2 },                       next:['F15a','F15b'] },
    F14e:  { tier:14, name:'Orbital Cannon',   stats:{ bulletDmg:4, maxBullets:2, shootCd:40 },          next:['F15a','F15b'] },
    F15a:  { tier:15, name:'Plasma Lance',     stats:{ shootCd:40,  bulletDmg:2 },                       next:['F16a','F16b'] },
    F15b:  { tier:15, name:'Quantum Cannon',   stats:{ maxBullets:2, bulletDmg:2 },                      next:['F16a','F16b'] },
    F16a:  { tier:16, name:'Void Blaster',     stats:{ shootCd:50,  bulletDmg:3 },                       next:['F17a','F17b'] },
    F16b:  { tier:16, name:'Dark Matter Gun',  stats:{ bulletDmg:3, maxBullets:1 },                      next:['F17a','F17b'] },
    F17a:  { tier:17, name:'Star Burster',     stats:{ shootCd:40,  bulletDmg:3 },                       next:['F18a','F18b'] },
    F17b:  { tier:17, name:'Apocalypse II',    stats:{ maxBullets:2, bulletDmg:2 },                      next:['F18a','F18b'] },
    F18a:  { tier:18, name:'Galactic Fury',    stats:{ shootCd:50,  bulletDmg:3, maxBullets:1 },         next:['F19a','F19b'] },
    F18b:  { tier:18, name:'Universe Cannon',  stats:{ bulletDmg:4, bulletSpd:2 },                       next:['F19a','F19b'] },
    F19a:  { tier:19, name:'Oblivion Lance',   stats:{ shootCd:40,  bulletDmg:3 },                       next:['F20a','F20b'] },
    F19b:  { tier:19, name:'Extinction Beam',  stats:{ maxBullets:2, bulletDmg:3 },                      next:['F20a','F20b'] },
    F20a:  { tier:20, name:'OBLIVION RAY',     stats:{ shootCd:50,  bulletDmg:4, maxBullets:1 },         next:[] },
    F20b:  { tier:20, name:'DEATH STAR',       stats:{ bulletDmg:5, bulletSpd:3 },                       next:[] },

    // ── T branch tiers 11-20 (all T10 paths converge here) ───────────────────
    T11a:  { tier:11, name:'Ironclad',         stats:{ health:3, dmgReduce:0.06 },                       next:['T12a','T12b'] },
    T11b:  { tier:11, name:'Bio-Matrix',       stats:{ health:3, regenRate:3 },                          next:['T12a','T12b'] },
    T12a:  { tier:12, name:'Colossus II',      stats:{ health:3, dmgReduce:0.06 },                       next:['T13a','T13b'] },
    T12b:  { tier:12, name:'Nanite Cloud',     stats:{ health:2, regenRate:4 },                          next:['T13a','T13b'] },
    T13a:  { tier:13, name:'Fortress II',      stats:{ health:4, dmgReduce:0.06 },                       next:['T14a','T14b','T14e'] },
    T13b:  { tier:13, name:'Living Armor',     stats:{ health:3, regenRate:3, dmgReduce:0.04 },          next:['T14a','T14b','T14e'] },
    T14a:  { tier:14, name:'Iron God',         stats:{ health:3, dmgReduce:0.07 },                       next:['T15a','T15b'] },
    T14b:  { tier:14, name:'Eternal Flesh',    stats:{ health:3, regenRate:4 },                          next:['T15a','T15b'] },
    T14e:  { tier:14, name:'Titan Regen',      stats:{ health:4, regenRate:4, dmgReduce:0.05 },          next:['T15a','T15b'] },
    T15a:  { tier:15, name:'Titan God',        stats:{ health:4, dmgReduce:0.07 },                       next:['T16a','T16b'] },
    T15b:  { tier:15, name:'Phoenix Matrix',   stats:{ health:3, regenRate:5 },                          next:['T16a','T16b'] },
    T16a:  { tier:16, name:'Diamond Shell',    stats:{ health:4, dmgReduce:0.07 },                       next:['T17a','T17b'] },
    T16b:  { tier:16, name:'Omega Regen',      stats:{ health:3, regenRate:5, dmgReduce:0.03 },          next:['T17a','T17b'] },
    T17a:  { tier:17, name:'God Armor',        stats:{ health:5, dmgReduce:0.07 },                       next:['T18a','T18b'] },
    T17b:  { tier:17, name:'Endless Life',     stats:{ health:4, regenRate:5 },                          next:['T18a','T18b'] },
    T18a:  { tier:18, name:'Cosmic Hull',      stats:{ health:5, dmgReduce:0.07 },                       next:['T19a','T19b'] },
    T18b:  { tier:18, name:'Void Regenerator', stats:{ health:4, regenRate:6 },                          next:['T19a','T19b'] },
    T19a:  { tier:19, name:'Universe Shell',   stats:{ health:5, dmgReduce:0.07 },                       next:['T20a','T20b'] },
    T19b:  { tier:19, name:'Infinite Regen',   stats:{ health:4, regenRate:6, dmgReduce:0.04 },          next:['T20a','T20b'] },
    T20a:  { tier:20, name:'IMMORTAL GOD',     stats:{ health:6, dmgReduce:0.08 },                       next:[] },
    T20b:  { tier:20, name:'ETERNAL SOUL',     stats:{ health:5, regenRate:8 },                          next:[] },

    // ── D branch tiers 11-20 ─────────────────────────────────────────────────
    D11a:  { tier:11, name:'Drone Net',        stats:{ maxBullets:1, shootCd:40 },                       next:['D12a','D12b'] },
    D11b:  { tier:11, name:'Nano Storm',       stats:{ shootCd:50, bulletDmg:2 },                        next:['D12a','D12b'] },
    D12a:  { tier:12, name:'Swarm Matrix',     stats:{ maxBullets:1, shootCd:40 },                       next:['D13a','D13b'] },
    D12b:  { tier:12, name:'Pulse Barrage',    stats:{ shootCd:50, bulletDmg:2, bulletSpd:1 },           next:['D13a','D13b'] },
    D13a:  { tier:13, name:'Hive God',         stats:{ maxBullets:1, shootCd:40 },                       next:['D14a','D14b','D14e'] },
    D13b:  { tier:13, name:'Chaos Storm',      stats:{ shootCd:40, bulletDmg:2 },                        next:['D14a','D14b','D14e'] },
    D14a:  { tier:14, name:'Drone Legion',     stats:{ maxBullets:1, shootCd:50 },                       next:['D15a','D15b'] },
    D14b:  { tier:14, name:'Tempest II',       stats:{ shootCd:50, bulletDmg:3 },                        next:['D15a','D15b'] },
    D14e:  { tier:14, name:'Omega Swarm',      stats:{ maxBullets:2, shootCd:40, bulletSpd:2 },          next:['D15a','D15b'] },
    D15a:  { tier:15, name:'Nanite Legion',    stats:{ maxBullets:1, shootCd:40 },                       next:['D16a','D16b'] },
    D15b:  { tier:15, name:'Thunder Storm',    stats:{ shootCd:40, bulletDmg:2, bulletSpd:1 },           next:['D16a','D16b'] },
    D16a:  { tier:16, name:'Swarm God',        stats:{ maxBullets:1, shootCd:50 },                       next:['D17a','D17b'] },
    D16b:  { tier:16, name:'Omega Chaos',      stats:{ shootCd:50, bulletDmg:3 },                        next:['D17a','D17b'] },
    D17a:  { tier:17, name:'Galaxy Drones',    stats:{ maxBullets:1, shootCd:40 },                       next:['D18a','D18b'] },
    D17b:  { tier:17, name:'Void Storm',       stats:{ shootCd:40, bulletDmg:3, bulletSpd:1 },           next:['D18a','D18b'] },
    D18a:  { tier:18, name:'Cosmic Swarm',     stats:{ maxBullets:1, shootCd:50 },                       next:['D19a','D19b'] },
    D18b:  { tier:18, name:'Armageddon II',    stats:{ shootCd:50, bulletDmg:3 },                        next:['D19a','D19b'] },
    D19a:  { tier:19, name:'Universe Drones',  stats:{ maxBullets:2, shootCd:40 },                       next:['D20a','D20b'] },
    D19b:  { tier:19, name:'Death Cloud',      stats:{ shootCd:40, bulletDmg:4 },                        next:['D20a','D20b'] },
    D20a:  { tier:20, name:'BULLET HELL',      stats:{ maxBullets:2, shootCd:50 },                       next:[] },
    D20b:  { tier:20, name:'DEATH STORM',      stats:{ shootCd:60,  bulletDmg:4, maxBullets:1 },         next:[] },

    // ── E branch tiers 11-20 ─────────────────────────────────────────────────
    E11a:  { tier:11, name:'Speed of Light',   stats:{ bulletSpd:4, shootCd:30 },                        next:['E12a','E12b'] },
    E11b:  { tier:11, name:'Nova Shell II',    stats:{ bulletDmg:3, bulletSpd:2 },                       next:['E12a','E12b'] },
    E12a:  { tier:12, name:'Quantum Beam',     stats:{ bulletSpd:4, shootCd:40 },                        next:['E13a','E13b'] },
    E12b:  { tier:12, name:'Dark Matter Shot', stats:{ bulletDmg:3, bulletSpd:3 },                       next:['E13a','E13b'] },
    E13a:  { tier:13, name:'Tachyon Lance',    stats:{ bulletSpd:5, shootCd:30 },                        next:['E14a','E14b','E14e'] },
    E13b:  { tier:13, name:'Void Bolt',        stats:{ bulletDmg:4, bulletSpd:2 },                       next:['E14a','E14b','E14e'] },
    E14a:  { tier:14, name:'Photon Cannon',    stats:{ bulletSpd:5, shootCd:40 },                        next:['E15a','E15b'] },
    E14b:  { tier:14, name:'Nova Annihilator', stats:{ bulletDmg:4, bulletSpd:3 },                       next:['E15a','E15b'] },
    E14e:  { tier:14, name:'Dark Vortex',      stats:{ bulletSpd:6, bulletDmg:3, shootCd:30 },           next:['E15a','E15b'] },
    E15a:  { tier:15, name:'Plasma Beam',      stats:{ bulletSpd:5, shootCd:30 },                        next:['E16a','E16b'] },
    E15b:  { tier:15, name:'Dark Energy II',   stats:{ bulletDmg:4, bulletSpd:3 },                       next:['E16a','E16b'] },
    E16a:  { tier:16, name:'Void Laser',       stats:{ bulletSpd:6, shootCd:40 },                        next:['E17a','E17b'] },
    E16b:  { tier:16, name:'Singularity II',   stats:{ bulletDmg:5, bulletSpd:2 },                       next:['E17a','E17b'] },
    E17a:  { tier:17, name:'Cosmic Ray',       stats:{ bulletSpd:6, shootCd:30 },                        next:['E18a','E18b'] },
    E17b:  { tier:17, name:'Galaxy Cannon',    stats:{ bulletDmg:5, bulletSpd:3 },                       next:['E18a','E18b'] },
    E18a:  { tier:18, name:'Tachyon Burst',    stats:{ bulletSpd:7, shootCd:40 },                        next:['E19a','E19b'] },
    E18b:  { tier:18, name:'Universe Bolt',    stats:{ bulletDmg:5, bulletSpd:3 },                       next:['E19a','E19b'] },
    E19a:  { tier:19, name:'Omega Light',      stats:{ bulletSpd:7, shootCd:30 },                        next:['E20a','E20b'] },
    E19b:  { tier:19, name:'Extinction Bolt',  stats:{ bulletDmg:6, bulletSpd:3 },                       next:['E20a','E20b'] },
    E20a:  { tier:20, name:'TACHYON GOD',      stats:{ bulletSpd:8, shootCd:40 },                        next:[] },
    E20b:  { tier:20, name:'VOID DESTROYER II',stats:{ bulletDmg:7, bulletSpd:4 },                       next:[] },
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
      if (d.shootCd)    s.shootCd    = Math.max(40,    s.shootCd    - d.shootCd);
      if (d.maxBullets) s.maxBullets = Math.min(15,    s.maxBullets + d.maxBullets);
      if (d.bulletSpd)  s.bulletSpd += d.bulletSpd;
      if (d.bulletDmg)  s.bulletDmg += d.bulletDmg;
      if (d.thrust)     s.thrust    += d.thrust;
      if (d.maxSpd)     s.maxSpd    += d.maxSpd;
      if (d.drag)       s.drag       = Math.min(0.998, s.drag + d.drag);
      if (d.boostCd)    s.boostCd   = Math.max(200,   s.boostCd    - d.boostCd);
      if (d.health)     s.health    += d.health;
      if (d.regenRate)  s.regenRate += d.regenRate;
      if (d.rotate)     s.rotate    += d.rotate;
      if (d.dmgReduce)  s.dmgReduce  = Math.min(0.80,  s.dmgReduce  + d.dmgReduce);
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
