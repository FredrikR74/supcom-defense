import { describe, it, expect } from 'vitest';
import maps from '../src/data/maps/index.js';
import { createTerrainForMap, createWorld, tickWorld } from '../src/sim/world.js';
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
    // En testkarta kan redan ha en extraktor på fyndigheten.
    const prebuilt = (d) => map.scenario?.structures?.some((s) => s.type === 'massExtractor' && s.x === d.x && s.z === d.z);
    for (const d of map.massDeposits) {
      if (!prebuilt(d)) expect(canPlace(w, 'massExtractor', d.x, d.z)).toMatchObject({ ok: true });
    }
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

describe('Mountain Pass (Test)', () => {
  const map = maps.find((m) => m.id === 'mountainPassTest');

  it('har en färdig bas, armé och fulla lager', () => {
    const w = createWorld({ map });
    const own = (type) => w.entities.filter((e) => e.type === type && e.owner === 1);
    for (const s of map.scenario.structures) {
      expect(w.entities.some((e) => e.type === s.type && e.x === s.x && e.z === s.z && e.built)).toBe(true);
    }
    expect(own('striker').length).toBe(8);
    const economy = w.players[1].economy;
    expect(economy.mass.stored).toBe(economy.mass.max);
    expect(economy.mass.max).toBeGreaterThan(650);
  });

  it('fienderna kommer direkt', () => {
    const w = createWorld({ map });
    for (let i = 0; i < 40; i++) tickWorld(w);
    expect(w.squads.length).toBeGreaterThan(0);
    expect(w.director.spentMass).toBeGreaterThanOrEqual(500);
  });
});

describe('Highlands', () => {
  const map = maps.find((m) => m.id === 'highlands');

  it('sidodalarna är täta: utan öppningen når ingen väg in i dalen', () => {
    const closed = {
      ...map,
      terrain: { ...map.terrain, rings: map.terrain.rings.map((r) => ({ ...r, gaps: [] })) },
    };
    const w = createWorld({ map: closed });
    for (const r of map.terrain.rings) expect(Number.isFinite(w.flow.dist[cellIndex(w, r.x, r.z)])).toBe(false);
  });

  it('varje sidodal har sin öppning mot norr', () => {
    const w = createWorld({ map });
    for (const r of map.terrain.rings) {
      const gate = cellIndex(w, r.x, r.z - r.radius);
      expect(isBlockedCell(w, gate)).toBe(false);
      expect(Number.isFinite(w.flow.dist[cellIndex(w, r.x, r.z)])).toBe(true);
      // Mot söder är det berg.
      const south = Array.from({ length: 12 }, (_, k) => cellIndex(w, r.x, r.z + r.radius - 6 + k));
      expect(south.some((i) => isBlockedCell(w, i))).toBe(true);
    }
  });

  it('bergsryggen delar det norra fältet', () => {
    const w = createWorld({ map });
    const [ridge] = map.terrain.ridges;
    expect(isBlockedCell(w, cellIndex(w, ridge.x1, (ridge.z1 + ridge.z2) / 2))).toBe(true);
  });

  it('har massa ute på fältet, utanför alla dalar', () => {
    const valleys = [{ ...map.core, radius: map.terrain.ring.radius }, ...map.terrain.rings];
    const outside = map.massDeposits.filter((d) => valleys.every((v) => Math.hypot(d.x - v.x, d.z - v.z) > v.radius));
    expect(outside.length).toBeGreaterThanOrEqual(4);
  });

  it('vraken från start ligger på körbar mark och har mass att återvinna', () => {
    const w = createWorld({ map });
    const wrecks = w.entities.filter((e) => e.kind === 'wreck');
    expect(wrecks).toHaveLength(map.wrecks.length);
    for (const e of wrecks) {
      expect(e.mass).toBeGreaterThan(0);
      expect(isBlockedCell(w, cellIndex(w, e.x, e.z))).toBe(false);
    }
  });
});
