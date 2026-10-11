import { describe, it, expect } from 'vitest';
import maps from '../src/data/maps/index.js';
import { createTerrainForMap, createWorld } from '../src/sim/world.js';
import { getHeight } from '../src/sim/terrain.js';
import { cellIndex, isBlockedCell } from '../src/sim/pathing.js';
import { canPlace } from '../src/sim/placement.js';

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

  it('en Mass Extractor går att bygga på varje fyndighet', () => {
    const w = createWorld({ map });
    for (const d of map.massDeposits) expect(canPlace(w, 'massExtractor', d.x, d.z)).toMatchObject({ ok: true });
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

describe('Mountain Pass', () => {
  const map = maps.find((m) => m.id === 'mountainPass');

  it('bergsringen är tät: utan passagen når ingen fiende basen', () => {
    const closed = { ...map, terrain: { ...map.terrain, ring: { ...map.terrain.ring, gaps: [] } } };
    const w = createWorld({ map: closed });
    for (const s of map.spawns) expect(Number.isFinite(w.flow.dist[cellIndex(w, s.x, s.z)])).toBe(false);
  });

  it('vägen in går genom passagen i söder', () => {
    const w = createWorld({ map });
    const { x, z } = map.core;
    const r = map.terrain.ring.radius;
    // Mitt i passagen är det körbart och har en väg till kärnan; rakt norrut är det berg.
    const pass = cellIndex(w, x, z + r);
    expect(isBlockedCell(w, pass)).toBe(false);
    expect(Number.isFinite(w.flow.dist[pass])).toBe(true);
    const north = Array.from({ length: 16 }, (_, k) => cellIndex(w, x, z - r - 8 + k));
    expect(north.some((i) => isBlockedCell(w, i))).toBe(true);
  });
});
