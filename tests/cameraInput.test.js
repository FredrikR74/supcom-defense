import { describe, it, expect } from 'vitest';
import { edgePanDirection } from '../src/input/cameraInput.js';

describe('edgePanDirection', () => {
  const W = 1000;
  const H = 600;

  it('panorerar inte mitt på skärmen', () => {
    expect(edgePanDirection(500, 300, W, H, 24)).toEqual([0, 0]);
  });

  it('panorerar mot varje kant', () => {
    expect(edgePanDirection(0, 300, W, H, 24)).toEqual([-1, 0]);
    expect(edgePanDirection(W, 300, W, H, 24)).toEqual([1, 0]);
    expect(edgePanDirection(500, 0, W, H, 24)).toEqual([0, -1]);
    expect(edgePanDirection(500, H, W, H, 24)).toEqual([0, 1]);
  });

  it('panorerar diagonalt i hörnen', () => {
    expect(edgePanDirection(5, 5, W, H, 24)).toEqual([-1, -1]);
    expect(edgePanDirection(W - 5, H - 5, W, H, 24)).toEqual([1, 1]);
  });

  it('respekterar kantzonens bredd', () => {
    expect(edgePanDirection(23, 300, W, H, 24)).toEqual([-1, 0]);
    expect(edgePanDirection(25, 300, W, H, 24)).toEqual([0, 0]);
  });
});
