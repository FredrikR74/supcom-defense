import mountainPass from './mountainPass.js';

/**
 * Testversion av Mountain Pass: samma terräng, men med en färdig bas (alla
 * fyndigheter i dalen utvunna, kraftverk, lager, två fabriker, Point Defense
 * vid passagen och en liten armé), fulla lager, och fienderna kommer direkt
 * med en ordentlig första våg. För att snabbt kunna testa strider.
 */
export default {
  ...mountainPass,
  id: 'mountainPassTest',
  name: 'Mountain Pass (Test)',
  description: 'Test setup: a ready-made base and army, full storage. The enemy attacks right away.',
  scenario: {
    fullStorage: true,
    director: { graceSeconds: 0, firstWaveSeconds: 3, startBudget: 600 },
    structures: [
      { type: 'massExtractor', x: 88, z: 88 },
      { type: 'massExtractor', x: 104, z: 88 },
      { type: 'massExtractor', x: 88, z: 104 },
      { type: 'massExtractor', x: 104, z: 104 },
      { type: 'massExtractor', x: 70, z: 96 },
      { type: 'massExtractor', x: 122, z: 96 },
      { type: 'massExtractor', x: 96, z: 120 },
      { type: 'powerGenerator', x: 84, z: 92 },
      { type: 'powerGenerator', x: 84, z: 100 },
      { type: 'powerGenerator', x: 108, z: 92 },
      { type: 'powerGenerator', x: 108, z: 100 },
      { type: 'powerGenerator', x: 92, z: 84 },
      { type: 'powerGenerator', x: 100, z: 84 },
      { type: 'massStorage', x: 88, z: 80 },
      { type: 'energyStorage', x: 104, z: 80 },
      { type: 'landFactory', x: 96, z: 110 },
      { type: 'landFactory', x: 80, z: 110 },
      // Vid passagen i söder
      { type: 'pointDefense', x: 90.5, z: 128.5 },
      { type: 'pointDefense', x: 93.5, z: 129.5 },
      { type: 'pointDefense', x: 98.5, z: 129.5 },
      { type: 'pointDefense', x: 101.5, z: 128.5 },
    ],
    units: [
      { type: 'engineer', x: 90, z: 114, count: 2 },
      { type: 'striker', x: 91, z: 124, count: 8 },
      { type: 'lobo', x: 92, z: 120, count: 3 },
    ],
  },
};
