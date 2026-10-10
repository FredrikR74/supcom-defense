/**
 * Byggnadsdefinitioner. `size` är fotavtrycket i rutor (size × size).
 * `production` är per sekund. `buildTime` är i sekunder vid byggkraft 1,
 * så en byggare med byggkraft 10 bygger på buildTime / 10 sekunder.
 */
export default {
  core: {
    name: 'Quantum Gate',
    size: 4,
    maxHp: 5000,
    production: { mass: 1, energy: 10 },
    buildPower: 10,
    produces: ['engineer'],
  },
  massExtractor: {
    name: 'Mass Extractor',
    size: 2,
    maxHp: 600,
    cost: { mass: 50, energy: 300 },
    buildTime: 60,
    production: { mass: 2, energy: 0 },
    requiresDeposit: true,
  },
  powerGenerator: {
    name: 'Power Generator',
    size: 2,
    maxHp: 600,
    cost: { mass: 75, energy: 750 },
    buildTime: 125,
    production: { mass: 0, energy: 20 },
  },
  wall: {
    name: 'Wall',
    size: 1,
    maxHp: 2000,
    cost: { mass: 3, energy: 15 },
    buildTime: 10,
  },
  pointDefense: {
    name: 'Point Defense',
    size: 1,
    maxHp: 1500,
    cost: { mass: 80, energy: 400 },
    buildTime: 150,
  },
};
