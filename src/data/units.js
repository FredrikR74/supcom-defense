const BASIC_STRUCTURES = ['landFactory', 'massExtractor', 'powerGenerator', 'wall', 'pointDefense'];

/**
 * Enhetsdefinitioner (UEF). `name` är FA:s beskrivning, se data/faNames.js.
 * `speed` i världsenheter per sekund, `radius` och `buildRange` i världsenheter.
 * `builds` är byggnader enheten kan bygga.
 *
 * `weapon`: `damage` per skott, `rateOfFire` skott per sekund, `range` och
 * `projectileSpeed` i världsenheter. Kartan är ungefär hälften så stor som FA:s
 * mått, så räckvidder är ungefär halverade jämfört med FA.
 */
export default {
  acu: {
    name: 'Armored Command Unit',
    maxHp: 3000,
    speed: 3,
    radius: 1,
    buildPower: 10,
    buildRange: 5,
    builds: BASIC_STRUCTURES,
    weapon: { damage: 40, rateOfFire: 1, range: 10, projectileSpeed: 30, muzzleHeight: 1.3 },
  },
  /** Cybran T1 Assault Bot. FA: 270 HP, fart 3.6, två lasrar med 24 DPS. */
  mantis: {
    name: 'Assault Bot',
    unitName: 'Mantis',
    faction: 'Cybran',
    maxHp: 270,
    speed: 3.6,
    radius: 0.6,
    /** Ungefärlig kostnad, styr bara vrakets mass. */
    cost: { mass: 40, energy: 200 },
    weapon: { damage: 12, rateOfFire: 2, range: 8, projectileSpeed: 25, muzzleHeight: 0.75 },
  },
  /** Cybran T1 Land Scout. FA: obeväpnad, mycket låg HP, snabb (har även cloak i FA). */
  mole: {
    name: 'Land Scout',
    unitName: 'Mole',
    faction: 'Cybran',
    maxHp: 40,
    speed: 5,
    radius: 0.45,
    /** Ungefärlig kostnad, styr bara vrakets mass. */
    cost: { mass: 12, energy: 80 },
  },
  /**
   * Cybran T1 Mobile Light Artillery. FA: lägst HP av fraktionernas T1-artilleri,
   * ballistiska granater (EMP-effekten är inte med än). Räckvidden är längre än
   * Point Defense, som i FA.
   */
  medusa: {
    name: 'Mobile Light Artillery',
    unitName: 'Medusa',
    faction: 'Cybran',
    maxHp: 150,
    speed: 2.8,
    radius: 0.6,
    cost: { mass: 36, energy: 180 },
    weapon: { damage: 60, rateOfFire: 0.25, range: 16, projectileSpeed: 12, muzzleHeight: 1, ballistic: true },
  },
  engineer: {
    name: 'Engineer',
    maxHp: 200,
    speed: 3.5,
    radius: 0.6,
    buildPower: 5,
    buildRange: 4,
    builds: BASIC_STRUCTURES,
    cost: { mass: 52, energy: 260 },
    buildTime: 260,
  },
};
