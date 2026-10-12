import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/sim/world.js';
import { canPlace, snapBuildPosition, lineOfPlacements, MAX_BUILD_SLOPE } from '../src/sim/placement.js';
import { addStructure, removeEntity } from '../src/sim/entities.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const world = () => createWorld({ map: firstDefense });

describe('snapBuildPosition', () => {
  it('1×1 hamnar mitt i en ruta', () => {
    expect(snapBuildPosition(world(), 'wall', 60.7, 69.2)).toEqual({ x: 60.5, z: 69.5 });
  });

  it('2×2 hamnar på en rutnätslinje', () => {
    expect(snapBuildPosition(world(), 'powerGenerator', 60.7, 69.2)).toEqual({ x: 61, z: 69 });
  });

  it('utvinnare fäster mot närmaste fyndighet', () => {
    expect(snapBuildPosition(world(), 'massExtractor', 57.5, 54.2)).toEqual({ x: 56, z: 56 });
  });

  it('utvinnare långt från fyndigheter fäster mot rutnätet', () => {
    expect(snapBuildPosition(world(), 'massExtractor', 64.2, 75.1)).toEqual({ x: 64, z: 75 });
  });
});

describe('canPlace', () => {
  it('ok på ledig plan mark', () => {
    expect(canPlace(world(), 'wall', 60.5, 69.5)).toEqual({ ok: true });
    expect(canPlace(world(), 'powerGenerator', 61, 70)).toEqual({ ok: true });
  });

  it('nekar på kärnan', () => {
    expect(canPlace(world(), 'wall', 64.5, 64.5).reason).toBe('occupied');
  });

  it('nekar utanför kartan', () => {
    expect(canPlace(world(), 'wall', -0.5, 10.5).reason).toBe('outside map');
    expect(canPlace(world(), 'powerGenerator', 128, 10).reason).toBe('outside map');
  });

  it('nekar positioner som inte ligger på rutnätet', () => {
    expect(canPlace(world(), 'wall', 60.2, 69.5).reason).toBe('off grid');
  });

  it('utvinnare kräver fyndighet', () => {
    expect(canPlace(world(), 'massExtractor', 56, 56)).toEqual({ ok: true });
    expect(canPlace(world(), 'massExtractor', 60, 70).reason).toBe('requires mass deposit');
  });

  it('andra byggnader får inte täcka en fyndighet', () => {
    expect(canPlace(world(), 'wall', 56.5, 56.5).reason).toBe('covers mass deposit');
    expect(canPlace(world(), 'powerGenerator', 57, 57).reason).toBe('covers mass deposit');
    expect(canPlace(world(), 'wall', 57.5, 56.5)).toEqual({ ok: true });
  });

  it('nekar på en byggd byggnad och tillåter igen när den rivs', () => {
    const w = world();
    const wall = addStructure(w, 'wall', { x: 60.5, z: 69.5, owner: 1 });
    expect(canPlace(w, 'wall', 60.5, 69.5).reason).toBe('occupied');
    expect(canPlace(w, 'powerGenerator', 61, 70).reason).toBe('occupied');
    removeEntity(w, wall.id);
    expect(canPlace(w, 'wall', 60.5, 69.5)).toEqual({ ok: true });
  });

  it('nekar för brant mark', () => {
    // Liten konstgjord värld: en ramp som stiger 2 per ruta i x-led.
    const size = 8;
    const heights = new Float32Array((size + 1) ** 2);
    for (let z = 0; z <= size; z++) for (let x = 0; x <= size; x++) heights[z * (size + 1) + x] = x * 2;
    const w = {
      terrain: { size, heights },
      occupancy: new Int32Array(size * size),
      map: { massDeposits: [] },
    };
    expect(2).toBeGreaterThan(MAX_BUILD_SLOPE);
    expect(canPlace(w, 'wall', 3.5, 3.5).reason).toBe('too steep');
  });
});

describe('lineOfPlacements', () => {
  const pts = (list) => list.map(({ x, z }) => [x, z]);

  it('en punkt när start och slut är samma', () => {
    expect(pts(lineOfPlacements({ x: 10.5, z: 10.5 }, { x: 10.5, z: 10.5 }, 1))).toEqual([[10.5, 10.5]]);
  });

  it('vågrät rad', () => {
    expect(pts(lineOfPlacements({ x: 10.5, z: 10.5 }, { x: 14.5, z: 10.5 }, 1))).toEqual([
      [10.5, 10.5], [11.5, 10.5], [12.5, 10.5], [13.5, 10.5], [14.5, 10.5],
    ]);
  });

  it('lodrät rad baklänges', () => {
    expect(pts(lineOfPlacements({ x: 3.5, z: 8.5 }, { x: 3.5, z: 5.5 }, 1))).toEqual([
      [3.5, 8.5], [3.5, 7.5], [3.5, 6.5], [3.5, 5.5],
    ]);
  });

  it('diagonal rad', () => {
    expect(pts(lineOfPlacements({ x: 0.5, z: 0.5 }, { x: 3.5, z: 3.5 }, 1))).toEqual([
      [0.5, 0.5], [1.5, 1.5], [2.5, 2.5], [3.5, 3.5],
    ]);
  });

  it('flack linje följer rutnätet', () => {
    const line = lineOfPlacements({ x: 0.5, z: 0.5 }, { x: 4.5, z: 2.5 }, 1);
    expect(line).toHaveLength(5);
    expect(line[0]).toEqual({ x: 0.5, z: 0.5 });
    expect(line[4]).toEqual({ x: 4.5, z: 2.5 });
    for (const p of line) expect(Number.isInteger(p.z - 0.5)).toBe(true);
  });

  it('2×2-byggnader läggs med två rutors mellanrum', () => {
    expect(pts(lineOfPlacements({ x: 10, z: 10 }, { x: 16.4, z: 10 }, 2))).toEqual([
      [10, 10], [12, 10], [14, 10], [16, 10],
    ]);
  });

  it('platserna överlappar inte varandra', () => {
    const w = world();
    const line = lineOfPlacements({ x: 58.5, z: 68.5 }, { x: 68.5, z: 75.5 }, 1);
    const cells = new Set(line.map(({ x, z }) => `${x},${z}`));
    expect(cells.size).toBe(line.length);
    expect(line.every(({ x, z }) => canPlace(w, 'wall', x, z).ok)).toBe(true);
  });
});

describe('byggförbud vid fiendens gateways', () => {
  it('nekar byggen inom radien från en spawnpunkt, men inte utanför', () => {
    const w = world();
    const s = firstDefense.spawns[0];
    const r = w.config.gatewayNoBuildRadius;
    expect(r).toBeGreaterThan(0);
    expect(canPlace(w, 'wall', s.x + 5.5, s.z + 0.5).reason).toBe('too close to enemy gateway');
    expect(canPlace(w, 'wall', s.x + r - 0.5, s.z + 0.5).reason).toBe('too close to enemy gateway');
    expect(canPlace(w, 'wall', s.x + r + 1.5, s.z + 0.5)).toEqual({ ok: true });
  });

  it('räknar från byggnadens kant, så stora byggnader hålls också utanför', () => {
    const w = world();
    const s = firstDefense.spawns[0];
    const r = w.config.gatewayNoBuildRadius;
    // En 2×2-byggnad med mitten på radien når in i zonen med sin kant.
    expect(canPlace(w, 'powerGenerator', s.x + r, s.z).reason).toBe('too close to enemy gateway');
    expect(canPlace(w, 'powerGenerator', s.x + r + 2, s.z)).toEqual({ ok: true });
  });
});

