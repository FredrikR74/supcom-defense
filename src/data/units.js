const BASIC_STRUCTURES = ['massExtractor', 'powerGenerator', 'wall', 'pointDefense'];

/**
 * Enhetsdefinitioner. `speed` i världsenheter per sekund, `radius` och
 * `buildRange` i världsenheter. `builds` är byggnader enheten kan bygga.
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
  },
  engineer: {
    name: 'Engineer',
    maxHp: 200,
    speed: 3.5,
    radius: 0.6,
    buildPower: 5,
    buildRange: 4,
    builds: BASIC_STRUCTURES,
    cost: { mass: 50, energy: 250 },
    buildTime: 50,
  },
};
