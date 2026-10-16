const BASIC_STRUCTURES = [
  'landFactory', 'massExtractor', 'powerGenerator', 'massStorage', 'energyStorage', 'wall', 'pointDefense', 'radar',
];

/**
 * T2-byggnader som T2-ingenjören kan bygga. Land Factory HQ och T3 Mass
 * Extractor fås bara genom uppgradering (se `upgradesTo` i structures.js).
 */
const T2_STRUCTURES = [
  'massExtractorT2', 'powerGeneratorT2', 'massFabricator', 'pointDefenseT2', 'artilleryT2', 'shieldGenerator', 'radarT2',
];

/**
 * Enhetsdefinitioner. `name` är FA:s beskrivning och `unitName` FA:s egennamn,
 * se data/faNames.js. Värden från FAF:s blueprints (github.com/FAForever/fa,
 * units/<id>/<id>_unit.bp): MaxHealth, RegenRate, BuildCost*, BuildTime,
 * BuildRate, Production*, vapnens Damage och RateOfFire.
 *
 * Avstånd (räckvidd och projektilfart) är halverade jämfört med FA, eftersom
 * kartan är ungefär hälften så stor. `speed` är i världsenheter per sekund.
 *
 * - `buildPower`: FA:s BuildRate. Byggtid = buildTime / buildPower.
 * - `regenRate`: HP per sekund (FA:s Defense.RegenRate).
 * - `techCategory`: styr veterancy (TECH1, TECH2, TECH3, COMMAND, ...).
 * - `selectionPriority`: FA:s General.SelectionPriority (standard 1); se selectInRect.
 * - `weapon`: `damage` per skott, `rateOfFire` skott per sekund, `range`,
 *   `projectileSpeed`, `muzzleHeight`, `ballistic` (båge). Valfritt: `minRange`
 *   (FA:s MinRadius), `damageRadius` (splash), `projectiles` per salva
 *   (ProjectilesPerOnFire), `antiAir` (skjuter bara på flyg).
 *   Enheter med salvor (MuzzleSalvoSize) eller flera vapen har ett vapen med
 *   samma DPS som i FA; se kommentaren vid enheten.
 * - `shield`: sköld som i FA (se sim/shields.js): `maxHp` (ShieldMaxHealth),
 *   `regenRate`, `regenStartTime`, `rechargeTime` och `radius` (ShieldSize / 2, halverad).
 * - `upkeep`: förbrukning per sekund (MaintenanceConsumptionPerSecond*).
 * - `visionRadius`, `radarRadius`: FA:s Intel.VisionRadius och RadarRadius (eller
 *   OmniRadius), halverade som räckvidderna. Se sim/intel.js.
 * - `targetBias`: fiendens målval (inte i FA), en faktor per `kind` av mål
 *   (`unit`, `structure`). Se sim/enemyAi.js.
 */
export default {
  /** UEF ACU (UEL0001). */
  acu: {
    name: 'Armored Command Unit',
    techCategory: 'COMMAND',
    /** FA: General.SelectionPriority = 3 (som ingenjörer, under stridsenheter). */
    selectionPriority: 3,
    maxHp: 12000,
    visionRadius: 12,
    radarRadius: 12,
    regenRate: 10,
    speed: 3,
    radius: 1,
    buildPower: 10,
    buildRange: 5,
    builds: BASIC_STRUCTURES,
    production: { mass: 1, energy: 20 },
    /** Uppgraderingar (nycklar i data/enhancements.js). */
    enhancements: ['zephyrAmplifier', 'nanoRepair', 'resourceAllocation'],
    /** Veterancy i FA: egna trösklar (massa dödad per nivå) och läkning per nivå. */
    veteranMass: [1000, 1250, 1750, 2500, 3500],
    veteranHealingMult: [0.1, 0.2, 0.3, 0.4, 0.5],
    /** FA: AI.GuardScanRadius = 31,5 (halverad som räckvidderna), se combat.js. */
    guardScanRadius: 15.75,
    /** Zephyr Anti Matter Cannon: 100 skada, 1 skott/s, räckvidd 22. */
    weapon: { damage: 100, rateOfFire: 1, range: 11, projectileSpeed: 25, muzzleHeight: 1.3 },
  },

  /** Cybran T1 Assault Bot (URL0107). */
  mantis: {
    name: 'Assault Bot',
    unitName: 'Mantis',
    faction: 'Cybran',
    techCategory: 'TECH1',
    maxHp: 270,
    visionRadius: 10,
    speed: 3.6,
    radius: 0.6,
    cost: { mass: 56, energy: 273 },
    /** 8 skada, 10/3 skott/s, räckvidd 18, mynningshastighet 25. */
    weapon: { damage: 8, rateOfFire: 10 / 3, range: 9, projectileSpeed: 12.5, muzzleHeight: 0.75 },
  },

  /**
   * Cybran T1 Land Scout (URL0101). Obeväpnad: FA:s enda "vapen" är en Target
   * Tracker med 0 skada (cloak finns inte med här).
   */
  mole: {
    name: 'Land Scout',
    unitName: 'Mole',
    faction: 'Cybran',
    techCategory: 'TECH1',
    maxHp: 15,
    visionRadius: 12,
    radarRadius: 22,
    speed: 4.8,
    radius: 0.45,
    cost: { mass: 8, energy: 60 },
  },

  /**
   * Cybran T1 Mobile Light Artillery (URL0103). 230 skada var 6:e sekund,
   * räckvidd 30, ballistisk. EMP-effekten är inte med än.
   */
  medusa: {
    name: 'Mobile Light Artillery',
    unitName: 'Medusa',
    faction: 'Cybran',
    techCategory: 'TECH1',
    maxHp: 140,
    visionRadius: 9,
    speed: 2.8,
    radius: 0.6,
    cost: { mass: 36, energy: 180 },
    /** Fiendens målval (se sim/enemyAi.js): långsamma artillerigranater träffar byggnader, inte enheter i rörelse. */
    targetBias: { structure: 3, unit: 0.4 },
    weapon: { damage: 230, rateOfFire: 10 / 60, range: 15, projectileSpeed: 7, muzzleHeight: 1, ballistic: true },
  },

  /** UEF T1 Medium Tank (UEL0201). 24 skada, 1 skott/s, räckvidd 18, mynningshastighet 25. */
  striker: {
    name: 'Medium Tank',
    unitName: 'MA12 Striker',
    techCategory: 'TECH1',
    maxHp: 300,
    visionRadius: 10,
    speed: 3.4,
    radius: 0.7,
    cost: { mass: 56, energy: 266 },
    buildTime: 300,
    weapon: { damage: 24, rateOfFire: 1, range: 9, projectileSpeed: 12.5, turnRate: 180, muzzleHeight: 0.8 },
  },

  /**
   * UEF T1 Land Scout (UEL0101). Tom Cat Machinegun: 4 skada, 1 skott per
   * 2 s (10/20), räckvidd 26, mynningshastighet 25.
   */
  snoop: {
    name: 'Land Scout',
    unitName: 'Snoop',
    techCategory: 'TECH1',
    maxHp: 29,
    visionRadius: 12,
    radarRadius: 22,
    speed: 4.5,
    radius: 0.45,
    cost: { mass: 12, energy: 80 },
    buildTime: 60,
    weapon: { damage: 4, rateOfFire: 10 / 20, range: 13, projectileSpeed: 12.5, turnRate: 360, muzzleHeight: 0.6 },
  },

  /**
   * UEF T1 Light Assault Bot (UEL0106). Tom Cat Machinegun: 7 skada,
   * 10/3 skott/s, räckvidd 14, mynningshastighet 25.
   */
  mechMarine: {
    name: 'Light Assault Bot',
    unitName: 'Mech Marine',
    techCategory: 'TECH1',
    maxHp: 60,
    visionRadius: 9,
    speed: 4.2,
    radius: 0.45,
    cost: { mass: 30, energy: 120 },
    buildTime: 120,
    weapon: { damage: 7, rateOfFire: 10 / 3, range: 7, projectileSpeed: 12.5, turnRate: 200, muzzleHeight: 0.75 },
  },

  /**
   * UEF T1 Mobile Light Artillery (UEL0103). Fragmentation Artillery: 100 skada
   * med splash (DamageRadius 1), 1 skott per 8,3 s (10/83), räckvidd 5–30,
   * mynningshastighet 14, hög båge. FA:s FiringRandomness (spridning) är inte med.
   */
  lobo: {
    name: 'Mobile Light Artillery',
    unitName: 'Lobo',
    techCategory: 'TECH1',
    maxHp: 205,
    visionRadius: 9,
    speed: 2.8,
    radius: 0.55,
    cost: { mass: 36, energy: 180 },
    buildTime: 200,
    weapon: {
      damage: 100, rateOfFire: 10 / 83, range: 15, minRange: 2.5, damageRadius: 0.5,
      projectileSpeed: 7, turnRate: 70, muzzleHeight: 0.8, ballistic: true,
    },
  },

  /**
   * UEF T1 Mobile Anti-Air Gun (UEL0104). Linked Railgun: 13 skada, två
   * projektiler per salva, 1 salva/s, räckvidd 32, mynningshastighet 45. Skjuter
   * bara på flyg (FireTargetLayerCapsTable Air), så den har inga mål än.
   */
  archer: {
    name: 'Mobile Anti-Air Gun',
    unitName: 'Archer',
    techCategory: 'TECH1',
    maxHp: 310,
    visionRadius: 10,
    speed: 3.3,
    radius: 0.5,
    cost: { mass: 55, energy: 275 },
    buildTime: 220,
    weapon: {
      damage: 13, projectiles: 2, rateOfFire: 1, range: 16, projectileSpeed: 22.5,
      turnRate: 180, muzzleHeight: 0.9, antiAir: true,
    },
  },

  /** UEF T1 Engineer (UEL0105). */
  engineer: {
    name: 'Engineer',
    techCategory: 'TECH1',
    /** FA: General.SelectionPriority = 3. */
    selectionPriority: 3,
    maxHp: 150,
    visionRadius: 9,
    speed: 3.5,
    radius: 0.6,
    buildPower: 5,
    buildRange: 4,
    builds: BASIC_STRUCTURES,
    cost: { mass: 52, energy: 260 },
    buildTime: 260,
  },

  // ---- UEF T2 (från Land Factory HQ) ----

  /** UEF T2 Engineer (UEL0208). BuildRate 13. Farten som T1-ingenjören (båda 1,9 i FA). */
  engineerT2: {
    name: 'Engineer',
    techCategory: 'TECH2',
    selectionPriority: 3,
    maxHp: 400,
    visionRadius: 10,
    speed: 3.5,
    radius: 0.65,
    buildPower: 13,
    buildRange: 4.5,
    builds: [...BASIC_STRUCTURES, ...T2_STRUCTURES],
    cost: { mass: 130, energy: 650 },
    buildTime: 650,
  },

  /**
   * UEF T2 Heavy Tank (UEL0202). Gauss Cannon: 35 skada, två projektiler per
   * skott, 10/12 skott/s, räckvidd 22, mynningshastighet 30.
   */
  pillar: {
    name: 'Heavy Tank',
    unitName: 'Pillar',
    techCategory: 'TECH2',
    maxHp: 1500,
    visionRadius: 10,
    speed: 3.1,
    radius: 0.85,
    cost: { mass: 198, energy: 990 },
    buildTime: 880,
    weapon: { damage: 35, projectiles: 2, rateOfFire: 10 / 12, range: 11, projectileSpeed: 15, turnRate: 90, muzzleHeight: 0.95 },
  },

  /**
   * UEF T2 Gatling Bot (DEL0204). Gatling Plasma Cannon: salvor om 15 skott à
   * 15 skada med 0,2 s mellanrum och 2 s omladdning, alltså 15 skott per 5 s,
   * räckvidd 34, mynningshastighet 28. Granatkastaren är inte med.
   */
  mongoose: {
    name: 'Gatling Bot',
    unitName: 'Mongoose',
    techCategory: 'TECH2',
    maxHp: 650,
    visionRadius: 13,
    speed: 2.9,
    radius: 0.6,
    cost: { mass: 200, energy: 1000 },
    buildTime: 1000,
    weapon: { damage: 15, rateOfFire: 3, range: 17, projectileSpeed: 14, turnRate: 90, muzzleHeight: 0.95 },
  },

  /**
   * UEF T2 Amphibious Tank (UEL0203). Hells Fury Riot Gun: 13,5 skada,
   * 10/3 skott/s, räckvidd 18, mynningshastighet 60. Kartorna har inget vatten än.
   */
  riptide: {
    name: 'Amphibious Tank',
    unitName: 'Riptide',
    techCategory: 'TECH2',
    maxHp: 1800,
    visionRadius: 9,
    speed: 3.7,
    radius: 0.8,
    cost: { mass: 320, energy: 1650 },
    buildTime: 1420,
    weapon: { damage: 13.5, rateOfFire: 10 / 3, range: 9, projectileSpeed: 30, turnRate: 90, muzzleHeight: 0.7 },
  },

  /**
   * UEF T2 Mobile Missile Launcher (UEL0111). Long Range Cruise Missile: 300
   * skada (DamageRadius 1), två missiler per 10 s, räckvidd 12–65. Missilerna
   * flyger i båge som artilleri här.
   */
  flapjack: {
    name: 'Mobile Missile Launcher',
    unitName: 'Flapjack',
    techCategory: 'TECH2',
    maxHp: 825,
    visionRadius: 9,
    speed: 2.9,
    radius: 0.7,
    cost: { mass: 180, energy: 1350 },
    buildTime: 800,
    weapon: {
      damage: 300, projectiles: 2, rateOfFire: 0.1, range: 32.5, minRange: 6, damageRadius: 0.5,
      projectileSpeed: 7, muzzleHeight: 1, ballistic: true,
    },
  },

  /**
   * UEF T2 Mobile AA Flak Artillery (UEL0205). Fragmentation Flak: 36 skada
   * (DamageRadius 4), två projektiler, 2 skott/s, räckvidd 40. Skjuter bara på flyg.
   */
  skyBoxer: {
    name: 'Mobile AA Flak Artillery',
    unitName: 'Sky Boxer',
    techCategory: 'TECH2',
    maxHp: 1000,
    visionRadius: 10,
    speed: 3.1,
    radius: 0.7,
    cost: { mass: 160, energy: 800 },
    buildTime: 800,
    weapon: {
      damage: 36, projectiles: 2, rateOfFire: 2, range: 20, damageRadius: 2, projectileSpeed: 10,
      turnRate: 180, muzzleHeight: 1, antiAir: true,
    },
  },

  /**
   * UEF T2 Mobile Shield Generator (UEL0307). Sköld: 3000 HP, regen 55/s efter
   * 3 s, laddas om på 24 s när den fallit, ShieldSize 17. Drar 80 energi/s.
   */
  parashield: {
    name: 'Mobile Shield Generator',
    unitName: 'Parashield',
    techCategory: 'TECH2',
    maxHp: 150,
    visionRadius: 10,
    speed: 3.5,
    radius: 0.55,
    cost: { mass: 220, energy: 900 },
    buildTime: 660,
    upkeep: { mass: 0, energy: 80 },
    shield: { maxHp: 3000, regenRate: 55, regenStartTime: 3, rechargeTime: 24, radius: 4.25 },
  },

  // ---- Cybran T2 (fiender) ----

  /** Cybran T2 Heavy Tank (URL0202). Particle Cannon: 25 skada, 10/6 skott/s, räckvidd 24, mynningshastighet 100. */
  rhino: {
    name: 'Heavy Tank',
    unitName: 'Rhino',
    faction: 'Cybran',
    techCategory: 'TECH2',
    maxHp: 1900,
    visionRadius: 11,
    speed: 2.9,
    radius: 0.85,
    cost: { mass: 290, energy: 1500 },
    weapon: { damage: 25, rateOfFire: 10 / 6, range: 12, projectileSpeed: 50, turnRate: 90, muzzleHeight: 0.85 },
  },

  /**
   * Cybran T2 Rocket Bot (DRL0204). Iridium Rocket Pack: tre raketer à 60 skada
   * (DamageRadius 2) per 4 s, räckvidd 37, mynningshastighet 25.
   */
  hoplite: {
    name: 'Rocket Bot',
    unitName: 'Hoplite',
    faction: 'Cybran',
    techCategory: 'TECH2',
    maxHp: 550,
    visionRadius: 13,
    speed: 3.4,
    radius: 0.6,
    cost: { mass: 200, energy: 1000 },
    weapon: { damage: 60, projectiles: 3, rateOfFire: 0.25, range: 18.5, damageRadius: 1, projectileSpeed: 12.5, muzzleHeight: 1.1 },
  },

  /**
   * Cybran T2 Amphibious Tank (URL0203). Meson Rocket (200 skada per 4 s) och
   * Heavy Electron Bolter (50 per 2 s), båda räckvidd 22: här ett vapen med
   * samma DPS (75). Torpeden är inte med.
   */
  wagner: {
    name: 'Amphibious Tank',
    unitName: 'Wagner',
    faction: 'Cybran',
    techCategory: 'TECH2',
    maxHp: 1200,
    visionRadius: 10,
    speed: 3.7,
    radius: 0.8,
    cost: { mass: 297, energy: 1980 },
    weapon: { damage: 150, rateOfFire: 0.5, range: 11, projectileSpeed: 10, turnRate: 90, muzzleHeight: 0.9 },
  },

  /**
   * Cybran T2 Mobile Missile Launcher (URL0111). Loa Tactical Missile: 200
   * skada (DamageRadius 1), 10/33 skott/s, räckvidd 4–65. Flyger i båge här.
   */
  viper: {
    name: 'Mobile Missile Launcher',
    unitName: 'Viper',
    faction: 'Cybran',
    techCategory: 'TECH2',
    maxHp: 700,
    visionRadius: 9,
    speed: 3,
    radius: 0.75,
    cost: { mass: 180, energy: 1350 },
    targetBias: { structure: 3, unit: 0.4 },
    weapon: {
      damage: 200, rateOfFire: 10 / 33, range: 32.5, minRange: 2, damageRadius: 0.5,
      projectileSpeed: 7, muzzleHeight: 1.1, ballistic: true,
    },
  },
};
