import { describe, it, expect } from 'vitest';
import { generateTerrain, getHeight, raycastTerrain, isInsideMap } from '../src/sim/terrain.js';

/** Liten handgjord terräng: 2×2 rutor, höjd = x + 10 * z i hörnen. */
function tinyTerrain() {
  const size = 2;
  const heights = new Float32Array(9);
  for (let z = 0; z <= 2; z++) for (let x = 0; x <= 2; x++) heights[z * 3 + x] = x + 10 * z;
  return { size, heights };
}

function flatTerrain(size, h) {
  return { size, heights: new Float32Array((size + 1) ** 2).fill(h) };
}

describe('getHeight', () => {
  it('returnerar exakt höjd i hörnpunkter', () => {
    const t = tinyTerrain();
    expect(getHeight(t, 0, 0)).toBe(0);
    expect(getHeight(t, 2, 0)).toBe(2);
    expect(getHeight(t, 1, 2)).toBe(21);
    expect(getHeight(t, 2, 2)).toBe(22);
  });

  it('interpolerar bilinjärt mellan hörnen', () => {
    const t = tinyTerrain();
    expect(getHeight(t, 0.5, 0)).toBeCloseTo(0.5);
    expect(getHeight(t, 0, 0.5)).toBeCloseTo(5);
    expect(getHeight(t, 1.5, 1.5)).toBeCloseTo(16.5);
  });

  it('klämmer punkter utanför kartan mot kanten', () => {
    const t = tinyTerrain();
    expect(getHeight(t, -5, -5)).toBe(0);
    expect(getHeight(t, 99, 99)).toBe(22);
  });
});

describe('generateTerrain', () => {
  const params = {
    size: 64,
    seed: 7,
    hillHeight: 10,
    plateau: { x: 32, z: 32, radius: 8, blend: 4, height: 5 },
  };

  it('har (size + 1)² höjder', () => {
    expect(generateTerrain(params).heights.length).toBe(65 * 65);
  });

  it('är deterministisk för samma seed', () => {
    expect(generateTerrain(params).heights).toEqual(generateTerrain(params).heights);
  });

  it('ger olika terräng för olika seed', () => {
    const a = generateTerrain(params).heights;
    const b = generateTerrain({ ...params, seed: 8 }).heights;
    expect(a).not.toEqual(b);
  });

  it('håller höjder inom [0, hillHeight]', () => {
    for (const h of generateTerrain(params).heights) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(10);
    }
  });

  it('är platt på platån', () => {
    const t = generateTerrain(params);
    expect(getHeight(t, 32, 32)).toBe(5);
    expect(getHeight(t, 38, 33)).toBe(5);
    expect(getHeight(t, 26.5, 30.5)).toBe(5);
  });
});

describe('raycastTerrain', () => {
  it('träffar platt mark rakt under', () => {
    const t = flatTerrain(16, 3);
    const p = raycastTerrain(t, { x: 5, y: 20, z: 7 }, { x: 0, y: -1, z: 0 });
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(3);
    expect(p.z).toBeCloseTo(7);
  });

  it('träffar snett', () => {
    const t = flatTerrain(16, 0);
    const d = Math.SQRT1_2;
    const p = raycastTerrain(t, { x: 2, y: 10, z: 8 }, { x: d, y: -d, z: 0 });
    expect(p.x).toBeCloseTo(12, 3);
    expect(p.z).toBeCloseTo(8);
  });

  it('returnerar null om strålen pekar uppåt', () => {
    const t = flatTerrain(16, 0);
    expect(raycastTerrain(t, { x: 5, y: 10, z: 5 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });
});

describe('isInsideMap', () => {
  it('känner igen kanterna', () => {
    const t = flatTerrain(16, 0);
    expect(isInsideMap(t, 0, 16)).toBe(true);
    expect(isInsideMap(t, -0.1, 5)).toBe(false);
    expect(isInsideMap(t, 5, 16.1)).toBe(false);
  });
});
