const BASIC_STRUCTURES = ['landFactory', 'massExtractor', 'powerGenerator', 'wall', 'pointDefense'];

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
 *   `projectileSpeed`, `muzzleHeight`, `ballistic` (båge).
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
