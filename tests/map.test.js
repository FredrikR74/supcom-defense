import { describe, it, expect } from 'vitest';
import firstDefense from '../src/data/maps/firstDefense.js';
import { createTerrainForMap } from '../src/sim/world.js';
import { getHeight } from '../src/sim/terrain.js';

describe('kartan Första försvaret', () => {
  const map = firstDefense;
  const terrain = createTerrainForMap(map);
  const points = [map.core, ...map.spawns, ...map.massDeposits];

  it('har alla objekt inom kartan', () => {
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(map.size);
      expect(p.z).toBeGreaterThanOrEqual(0);
      expect(p.z).toBeLessThanOrEqual(map.size);
    }
  });

  it('har minst en spawnpunkt och en fyndighet', () => {
    expect(map.spawns.length).toBeGreaterThan(0);
    expect(map.massDeposits.length).toBeGreaterThan(0);
  });

  it('har kärnan mitt på platån', () => {
    expect(getHeight(terrain, map.core.x, map.core.z)).toBe(map.terrain.plateau.height);
  });
});
