import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/sim/world.js';
import { canPlace, snapBuildPosition, MAX_BUILD_SLOPE } from '../src/sim/placement.js';
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
    expect(canPlace(world(), 'wall', 64.5, 64.5).reason).toBe('upptaget');
  });

  it('nekar utanför kartan', () => {
    expect(canPlace(world(), 'wall', -0.5, 10.5).reason).toBe('utanför kartan');
    expect(canPlace(world(), 'powerGenerator', 128, 10).reason).toBe('utanför kartan');
  });

  it('nekar positioner som inte ligger på rutnätet', () => {
    expect(canPlace(world(), 'wall', 60.2, 69.5).reason).toBe('utanför rutnätet');
  });

  it('utvinnare kräver fyndighet', () => {
    expect(canPlace(world(), 'massExtractor', 56, 56)).toEqual({ ok: true });
    expect(canPlace(world(), 'massExtractor', 60, 70).reason).toBe('kräver massfyndighet');
  });

  it('andra byggnader får inte täcka en fyndighet', () => {
    expect(canPlace(world(), 'wall', 56.5, 56.5).reason).toBe('täcker massfyndighet');
    expect(canPlace(world(), 'powerGenerator', 57, 57).reason).toBe('täcker massfyndighet');
    expect(canPlace(world(), 'wall', 57.5, 56.5)).toEqual({ ok: true });
  });

  it('nekar på en byggd byggnad och tillåter igen när den rivs', () => {
    const w = world();
    const wall = addStructure(w, 'wall', { x: 60.5, z: 69.5, owner: 1 });
    expect(canPlace(w, 'wall', 60.5, 69.5).reason).toBe('upptaget');
    expect(canPlace(w, 'powerGenerator', 61, 70).reason).toBe('upptaget');
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
    expect(canPlace(w, 'wall', 3.5, 3.5).reason).toBe('för brant');
  });
});
