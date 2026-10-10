import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit } from '../src/sim/entities.js';
import { canPlace } from '../src/sim/placement.js';
import { computeSteepCells, cellIndex, isBlockedCell, updatePathing, ARRIVE_DISTANCE, MAX_UNIT_SLOPE } from '../src/sim/pathing.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { createSpatialHash } from '../src/sim/spatialHash.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const N = firstDefense.size;
const world = () => createWorld({ map: firstDefense });
const ticks = (w, n) => { for (let i = 0; i < n; i++) tickWorld(w); };

/** Väggar på alla rutor i en kvadratisk ring runt kärnan, utom `gap`. */
function wallRing(w, min, max, gap) {
  for (let z = min; z <= max; z++) {
    for (let x = min; x <= max; x++) {
      const edge = x === min || x === max || z === min || z === max;
      if (!edge || (x === gap.x && z === gap.z)) continue;
      addStructure(w, 'wall', { x: x + 0.5, z: z + 0.5, owner: PLAYER_ID });
    }
  }
}

describe('passerbarhet', () => {
  it('en ruta med byggnad blir blockerad', () => {
    const w = world();
    const i = cellIndex(w, 60.5, 69.5);
    expect(isBlockedCell(w, i)).toBe(false);
    addStructure(w, 'wall', { x: 60.5, z: 69.5, owner: PLAYER_ID });
    expect(isBlockedCell(w, i)).toBe(true);
  });

  it('kärnans rutor är blockerade', () => {
    const w = world();
    expect(isBlockedCell(w, cellIndex(w, 64.5, 64.5))).toBe(true);
  });

  it('branta rutor blockerar', () => {
    const size = 4;
    const heights = new Float32Array(25);
    heights[0] = MAX_UNIT_SLOPE + 0.5; // hörnet (0,0) högt
    const steep = computeSteepCells({ size, heights });
    expect(steep[0]).toBe(1);
    expect(steep[1]).toBe(0);
  });
});

describe('flödesfält', () => {
  it('varje nåbar ruta pekar mot en granne närmare kärnan', () => {
    const w = world();
    const { dist, next } = w.flow;
    let checked = 0;
    for (let i = 0; i < N * N; i++) {
      if (!Number.isFinite(dist[i]) || dist[i] === 0) continue;
      expect(next[i]).toBeGreaterThanOrEqual(0);
      expect(dist[next[i]]).toBeLessThan(dist[i]);
      checked++;
    }
    expect(checked).toBeGreaterThan(N * N * 0.5);
  });

  it('alla spawnpunkter når kärnan från start', () => {
    const w = world();
    for (const s of firstDefense.spawns) {
      expect(Number.isFinite(w.flow.dist[cellIndex(w, s.x, s.z)])).toBe(true);
    }
  });

  it('räknas om när en byggnad placeras och går runt den', () => {
    const w = world();
    const i = cellIndex(w, 60.5, 69.5);
    const before = w.pathVersion;
    addStructure(w, 'wall', { x: 60.5, z: 69.5, owner: PLAYER_ID });
    updatePathing(w);
    expect(w.pathVersion).toBe(before + 1);
    expect(w.flow.dist[i]).toBe(Infinity);
    for (let j = 0; j < N * N; j++) expect(w.flow.next[j]).not.toBe(i);
  });

  it('går inte diagonalt mellan två byggnader som rör vid varandras hörn', () => {
    const w = world();
    addStructure(w, 'wall', { x: 50.5, z: 50.5, owner: PLAYER_ID });
    addStructure(w, 'wall', { x: 51.5, z: 51.5, owner: PLAYER_ID });
    updatePathing(w);
    const a = cellIndex(w, 51.5, 50.5);
    const b = cellIndex(w, 50.5, 51.5);
    expect(w.flow.next[a]).not.toBe(b);
    expect(w.flow.next[b]).not.toBe(a);
  });
});

describe('fiender', () => {
  it('en Mantis går från spawnpunkten till kärnan', () => {
    const w = world();
    const m = spawnEnemy(w, 'mantis', 0);
    expect(m.owner).toBe(ENEMY_ID);
    for (let i = 0; i < 400; i++) {
      tickWorld(w);
      expect(isBlockedCell(w, cellIndex(w, m.x, m.z))).toBe(false);
    }
    expect(w.flow.dist[cellIndex(w, m.x, m.z)]).toBeLessThanOrEqual(ARRIVE_DISTANCE);
  });

  it('svänger runt en mur och kommer ändå fram', () => {
    const w = world();
    // Mur tvärs över vägen från västra spawnpunkten, med öppning i norr.
    for (let z = 52; z <= 76; z++) addStructure(w, 'wall', { x: 50.5, z: z + 0.5, owner: PLAYER_ID });
    const m = spawnEnemy(w, 'mantis', 0);
    let crossed = false;
    for (let i = 0; i < 600; i++) {
      tickWorld(w);
      expect(isBlockedCell(w, cellIndex(w, m.x, m.z))).toBe(false);
      if (m.x > 51 && m.z >= 52 && m.z <= 77) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(w.flow.dist[cellIndex(w, m.x, m.z)]).toBeLessThanOrEqual(ARRIVE_DISTANCE);
  });

  it('är deterministiska för samma seed', () => {
    const run = () => {
      const w = world();
      for (let i = 0; i < 5; i++) spawnEnemy(w, 'mantis', i);
      ticks(w, 100);
      return w.entities.filter((e) => e.owner === ENEMY_ID).map((e) => [e.x, e.z]);
    };
    expect(run()).toEqual(run());
  });
});

describe('placeringsregel: aldrig helt instängd', () => {
  it('en placering som stänger sista vägen nekas', () => {
    const w = world();
    wallRing(w, 59, 69, { x: 59, z: 64 });
    expect(canPlace(w, 'wall', 59.5, 64.5)).toEqual({ ok: false, reason: 'blocks enemy path' });
  });

  it('en ring med två öppningar går att stänga till hälften', () => {
    const w2 = world();
    for (let z = 59; z <= 69; z++) {
      for (let x = 59; x <= 69; x++) {
        const edge = x === 59 || x === 69 || z === 59 || z === 69;
        if (!edge || (x === 59 && z === 64) || (x === 69 && z === 64)) continue;
        addStructure(w2, 'wall', { x: x + 0.5, z: z + 0.5, owner: PLAYER_ID });
      }
    }
    expect(canPlace(w2, 'wall', 59.5, 64.5)).toEqual({ ok: true });
  });

  it('en mur ute i det fria påverkar inte', () => {
    expect(canPlace(world(), 'wall', 40.5, 40.5)).toEqual({ ok: true });
  });
});

describe('separation', () => {
  it('två enheter på samma punkt glider isär', () => {
    const w = world();
    const a = addUnit(w, 'mantis', { x: 40, z: 40, owner: ENEMY_ID });
    const b = addUnit(w, 'mantis', { x: 40, z: 40, owner: ENEMY_ID });
    ticks(w, 20);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan((a.radius + b.radius) * 0.7);
  });

  it('knuffar aldrig in en enhet i en byggnad', () => {
    const w = world();
    addStructure(w, 'wall', { x: 40.5, z: 40.5, owner: PLAYER_ID });
    const a = addUnit(w, 'mantis', { x: 40, z: 39.9, owner: ENEMY_ID });
    const b = addUnit(w, 'mantis', { x: 40, z: 39.7, owner: ENEMY_ID });
    for (let i = 0; i < 20; i++) {
      tickWorld(w);
      expect(isBlockedCell(w, cellIndex(w, a.x, a.z))).toBe(false);
      expect(isBlockedCell(w, cellIndex(w, b.x, b.z))).toBe(false);
    }
  });
});

describe('spatial hash', () => {
  it('queryRadius returnerar rätt entiteter', () => {
    const hash = createSpatialHash(2);
    const pts = [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 1.5, z: 0 }, { id: 3, x: 3, z: 3 }, { id: 4, x: -2, z: -0.5 },
      { id: 5, x: 10, z: 10 },
    ];
    for (const p of pts) hash.insert(p);
    const ids = (r) => hash.queryRadius(0, 0, r).map((e) => e.id).sort();
    expect(ids(1)).toEqual([1]);
    expect(ids(2.1)).toEqual([1, 2, 4]);
    expect(ids(5)).toEqual([1, 2, 3, 4]);
  });
});
