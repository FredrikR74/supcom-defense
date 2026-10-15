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
 * - `upgradesTo`: byggnaden kan uppgraderas till den typen (FA:s UpgradesTo), se
 *   sim/upgrades.js. Uppgraderingen kostar den nya typens `cost` och `buildTime`
 *   och byggs med byggnadens egen `buildPower` (FA:s BuildRate); ingenjörer kan assistera.
 * - `shield`: sköld, se units.js och sim/shields.js.
 * - `visionRadius`, `radarRadius`: sikt och radar, se units.js och sim/intel.js.
 *   Byggnader vars blueprint saknar Intel (t.ex. T1 Mass Extractor) ser inget (0).
 *   Radar kräver att upkeep-energin räcker.
 */

const T1_LAND_UNITS = ['engineer', 'snoop', 'mechMarine', 'striker', 'lobo', 'archer'];
const T2_LAND_UNITS = ['engineerT2', 'pillar', 'mongoose', 'riptide', 'flapjack', 'skyBoxer', 'parashield'];

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
    visionRadius: 10,
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
    visionRadius: 10,
    cost: { mass: 240, energy: 2100 },
    buildTime: 300,
    buildPower: 20,
    produces: T1_LAND_UNITS,
    upgradesTo: 'landFactoryT2',
  },
  /**
   * UEB0201, T2 Land Factory HQ. Fås bara genom att uppgradera en Land Factory.
   * Bygger T1- och T2-enheter med BuildRate 40.
   */
  landFactoryT2: {
    name: 'Land Factory HQ',
    techCategory: 'TECH2',
    size: 4,
    maxHp: 8000,
    visionRadius: 10,
    cost: { mass: 1410, energy: 11200 },
    buildTime: 2300,
    buildPower: 40,
    produces: [...T1_LAND_UNITS, ...T2_LAND_UNITS],
  },
  /** UEB1103. Producerar 2 mass/s och drar 2 energi/s. Uppgraderas med BuildRate 10. */
  massExtractor: {
    name: 'Mass Extractor',
    techCategory: 'TECH1',
    size: 2,
    maxHp: 400,
    visionRadius: 0,
    cost: { mass: 36, energy: 360 },
    buildTime: 60,
    buildPower: 10,
    production: { mass: 2, energy: 0 },
    upkeep: { mass: 0, energy: 2 },
    requiresDeposit: true,
    upgradesTo: 'massExtractorT2',
  },
  /** UEB1202. 6 mass/s, drar 9 energi/s. Uppgraderas till T3 med BuildRate 15. */
  massExtractorT2: {
    name: 'Mass Extractor',
    techCategory: 'TECH2',
    size: 2,
    maxHp: 2000,
    visionRadius: 10,
    cost: { mass: 900, energy: 5400 },
    buildTime: 900,
    buildPower: 15,
    production: { mass: 6, energy: 0 },
    upkeep: { mass: 0, energy: 9 },
    requiresDeposit: true,
    upgradesTo: 'massExtractorT3',
  },
  /** UEB1302. 18 mass/s, drar 54 energi/s. Fås bara genom uppgradering (T3-ingenjörer finns inte än). */
  massExtractorT3: {
    name: 'Mass Extractor',
    techCategory: 'TECH3',
    size: 2,
    maxHp: 7000,
    visionRadius: 10,
    cost: { mass: 4600, energy: 31625 },
    buildTime: 2875,
    production: { mass: 18, energy: 0 },
    upkeep: { mass: 0, energy: 54 },
    requiresDeposit: true,
  },
  /** UEB1101. */
  powerGenerator: {
    name: 'Power Generator',
    techCategory: 'TECH1',
    size: 2,
    maxHp: 600,
    visionRadius: 0,
    cost: { mass: 75, energy: 750 },
    buildTime: 125,
    production: { mass: 0, energy: 20 },
  },
  /** UEB1201. 500 energi/s. Fotavtrycket 3 × 3 (FA:s Footprint). */
  powerGeneratorT2: {
    name: 'Power Generator',
    unitName: 'EG - 200 Fusion Reactor',
    techCategory: 'TECH2',
    size: 3,
    maxHp: 2500,
    visionRadius: 10,
    cost: { mass: 1200, energy: 12000 },
    buildTime: 2198,
    production: { mass: 0, energy: 500 },
  },
  /** UEB1104. Gör 1 mass/s av 100 energi/s (mindre vid energibrist, som en utvinnare). */
  massFabricator: {
    name: 'Mass Fabricator',
    techCategory: 'TECH2',
    size: 2,
    maxHp: 360,
    visionRadius: 0,
    cost: { mass: 200, energy: 4000 },
    buildTime: 500,
    production: { mass: 1, energy: 0 },
    upkeep: { mass: 0, energy: 100 },
  },
  /** UEB1106. Lagrar 500 mass. */
  massStorage: {
    name: 'Mass Storage',
    techCategory: 'TECH1',
    size: 2,
    maxHp: 800,
    visionRadius: 0,
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
    visionRadius: 0,
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
    visionRadius: 0,
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
    visionRadius: 12,
    cost: { mass: 250, energy: 2000 },
    buildTime: 250,
    /** `turnRate` i grader/s. */
    weapon: { damage: 50, rateOfFire: 10 / 3, range: 13, projectileSpeed: 17.5, turnRate: 180, muzzleHeight: 0.8 },
  },
  /**
   * UEB2301, T2 Point Defense. Gauss Cannon: tre projektiler à 70 skada
   * (DamageRadius 2), 10/17 skott/s, räckvidd 50, mynningshastighet 35.
   */
  pointDefenseT2: {
    name: 'Point Defense',
    unitName: 'Triad',
    techCategory: 'TECH2',
    size: 2,
    maxHp: 2250,
    visionRadius: 14,
    cost: { mass: 540, energy: 3780 },
    buildTime: 675,
    weapon: {
      damage: 70, projectiles: 3, rateOfFire: 10 / 17, range: 25, damageRadius: 1,
      projectileSpeed: 17.5, turnRate: 130, muzzleHeight: 1.2,
    },
  },
  /**
   * UEB2303, T2 Artillery Installation. APDS Artillery: 2000 skada
   * (DamageRadius 3), ett skott per 20 s, räckvidd 50–115, mynningshastighet 27,8.
   */
  artilleryT2: {
    name: 'Artillery Installation',
    unitName: 'Klink Hammer',
    techCategory: 'TECH2',
    size: 2,
    maxHp: 3600,
    visionRadius: 14,
    cost: { mass: 1900, energy: 13585 },
    buildTime: 1600,
    weapon: {
      damage: 2000, rateOfFire: 10 / 200, range: 57.5, minRange: 25, damageRadius: 1.5,
      projectileSpeed: 13.9, turnRate: 6, muzzleHeight: 1.6, ballistic: true,
    },
  },
  /**
   * UEB4202, T2 Shield Generator. Sköld: 9000 HP, regen 120/s efter 3 s, laddas
   * om på 23 s när den fallit, ShieldSize 26. Drar 200 energi/s.
   */
  shieldGenerator: {
    name: 'Shield Generator',
    unitName: 'SD - Pulse',
    techCategory: 'TECH2',
    size: 3,
    maxHp: 250,
    visionRadius: 10,
    cost: { mass: 600, energy: 6000 },
    buildTime: 1150,
    upkeep: { mass: 0, energy: 200 },
    shield: { maxHp: 9000, regenRate: 120, regenStartTime: 3, rechargeTime: 23, radius: 6.5 },
  },
  /**
   * UEB3101, T1 Radar System (SA1 - 1000). RadarRadius 116, VisionRadius 20,
   * drar 20 energi/s. Uppgraderas till T2 med BuildRate 13.
   */
  radar: {
    name: 'Radar System',
    unitName: 'SA1 - 1000',
    techCategory: 'TECH1',
    size: 2,
    maxHp: 10,
    visionRadius: 10,
    radarRadius: 58,
    cost: { mass: 80, energy: 720 },
    buildTime: 80,
    buildPower: 13,
    upkeep: { mass: 0, energy: 20 },
    upgradesTo: 'radarT2',
  },
  /** UEB3201, T2 Radar System (SA2 - 2000). RadarRadius 200, VisionRadius 24, drar 150 energi/s. */
  radarT2: {
    name: 'Radar System',
    unitName: 'SA2 - 2000',
    techCategory: 'TECH2',
    size: 2,
    maxHp: 50,
    visionRadius: 12,
    radarRadius: 100,
    cost: { mass: 180, energy: 3600 },
    buildTime: 780,
    upkeep: { mass: 0, energy: 150 },
  },
};
