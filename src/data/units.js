const BASIC_STRUCTURES = [
  'landFactory', 'massExtractor', 'powerGenerator', 'massStorage', 'energyStorage', 'wall', 'pointDefense',
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
 */
export default {
  /** UEF ACU (UEL0001). */
  acu: {
    name: 'Armored Command Unit',
    techCategory: 'COMMAND',
    /** FA: General.SelectionPriority = 3 (som ingenjörer, under stridsenheter). */
    selectionPriority: 3,
    maxHp: 12000,
    regenRate: 10,
    speed: 3,
    radius: 1,
    buildPower: 10,
    buildRange: 5,
    builds: BASIC_STRUCTURES,
    production: { mass: 1, energy: 20 },
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
    speed: 2.8,
    radius: 0.6,
    cost: { mass: 36, energy: 180 },
    weapon: { damage: 230, rateOfFire: 10 / 60, range: 15, projectileSpeed: 7, muzzleHeight: 1, ballistic: true },
  },

  /** UEF T1 Medium Tank (UEL0201). 24 skada, 1 skott/s, räckvidd 18, mynningshastighet 25. */
  striker: {
    name: 'Medium Tank',
    unitName: 'MA12 Striker',
    techCategory: 'TECH1',
    maxHp: 300,
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
    speed: 3.5,
    radius: 0.6,
    buildPower: 5,
    buildRange: 4,
    builds: BASIC_STRUCTURES,
    cost: { mass: 52, energy: 260 },
    buildTime: 260,
  },
};
