/**
 * Byggnadsdefinitioner (UEF). `name` är FA:s beskrivning och `unitName` FA:s
 * egennamn, se data/faNames.js. Värden från FAF:s blueprints
 * (github.com/FAForever/fa, units/<id>/<id>_unit.bp). Räckvidder och
 * projektilfart är halverade som för enheterna.
 *
 * - `size`: fotavtrycket i rutor (size × size)
 * - `production`: per sekund. `upkeep`: förbrukning per sekund när byggnaden är klar
 *   (FA:s MaintenanceConsumptionPerSecond*)
 * - `buildTime`: i sekunder vid byggkraft 1, så en byggare med byggkraft 10
 *   bygger på buildTime / 10 sekunder
 * - `benign`: skjuts inte på automatiskt (FA-kategorin BENIGN, t.ex. murar)
 * - `storage`: ökar spelarens lagerkapacitet när byggnaden är klar (FA:s Economy.Storage*)
 */
export default {
  /**
   * Kärnan som ska försvaras: UEF Quantum Gateway (UEB0304). Kostnad och byggtid
   * används bara för att räkna ut vad en reparation kostar.
   */
  core: {
    name: 'Quantum Gateway',
    techCategory: 'TECH3',
    size: 4,
    maxHp: 10000,
    cost: { mass: 3000, energy: 30000 },
    buildTime: 4097,
    /** Går inte att sälja (tower defense: den ska försvaras). */
    unsellable: true,
  },
  /** UEB0101. */
  landFactory: {
    name: 'Land Factory',
    techCategory: 'TECH1',
    size: 4,
    maxHp: 4000,
    cost: { mass: 240, energy: 2100 },
    buildTime: 300,
    buildPower: 20,
    produces: ['engineer', 'snoop', 'mechMarine', 'striker', 'lobo', 'archer'],
  },
  /** UEB1103. Producerar 2 mass/s och drar 2 energi/s. */
  massExtractor: {
    name: 'Mass Extractor',
    techCategory: 'TECH1',
    size: 2,
    maxHp: 400,
    cost: { mass: 36, energy: 360 },
    buildTime: 60,
    production: { mass: 2, energy: 0 },
    upkeep: { mass: 0, energy: 2 },
    requiresDeposit: true,
  },
  /** UEB1101. */
  powerGenerator: {
    name: 'Power Generator',
    techCategory: 'TECH1',
    size: 2,
    maxHp: 600,
    cost: { mass: 75, energy: 750 },
    buildTime: 125,
    production: { mass: 0, energy: 20 },
  },
  /** UEB1106. Lagrar 500 mass. */
  massStorage: {
    name: 'Mass Storage',
    techCategory: 'TECH1',
    size: 2,
    maxHp: 800,
    cost: { mass: 200, energy: 1500 },
    buildTime: 250,
    storage: { mass: 500, energy: 0 },
  },
  /** UEB1105. Lagrar 10 000 energi. */
  energyStorage: {
    name: 'Energy Storage',
    techCategory: 'TECH1',
    size: 2,
    maxHp: 500,
    cost: { mass: 250, energy: 1200 },
    buildTime: 200,
    storage: { mass: 0, energy: 10000 },
  },
  /** UEB5101. */
  wall: {
    name: 'Wall Section',
    techCategory: 'TECH1',
    size: 1,
    maxHp: 500,
    cost: { mass: 3, energy: 20 },
    buildTime: 15,
    benign: true,
  },
  /** UEB2101. 50 skada, 10/3 skott/s, räckvidd 26, mynningshastighet 35. */
  pointDefense: {
    name: 'Point Defense',
    unitName: 'DM1 Plasma Cannon',
    techCategory: 'TECH1',
    size: 1,
    maxHp: 1300,
    cost: { mass: 250, energy: 2000 },
    buildTime: 250,
    /** `turnRate` i grader/s. */
    weapon: { damage: 50, rateOfFire: 10 / 3, range: 13, projectileSpeed: 17.5, turnRate: 180, muzzleHeight: 0.8 },
  },
};
