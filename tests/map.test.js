import { describe, it, expect } from 'vitest';
import maps from '../src/data/maps/index.js';
import { createTerrainForMap, createWorld } from '../src/sim/world.js';
import { getHeight } from '../src/sim/terrain.js';
import { cellIndex, isBlockedCell } from '../src/sim/pathing.js';

describe.each(maps.map((m) => [m.name, m]))('kartan %s', (_name, map) => {
  const terrain = createTerrainForMap(map);
  const points = [map.core, ...map.spawns, ...map.massDeposits];

  it('har id, namn och beskrivning', () => {
    expect(map.id).toBeTruthy();
    expect(map.name).toBeTruthy();
    expect(map.description).toBeTruthy();
  });

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

  it('alla spawnpunkter når kärnan och står på körbar mark', () => {
    const w = createWorld({ map });
    for (const s of map.spawns) {
      const i = cellIndex(w, s.x, s.z);
      expect(isBlockedCell(w, i)).toBe(false);
      expect(Number.isFinite(w.flow.dist[i])).toBe(true);
    }
  });
});

it('kart-id:n är unika', () => {
  expect(new Set(maps.map((m) => m.id)).size).toBe(maps.length);
});
