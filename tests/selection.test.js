import { describe, it, expect } from 'vitest';
import { selectInRect } from '../src/input/selection.js';

// Skärmposition = världsposition, för enkelhetens skull.
const toScreen = (e) => ({ x: e.x, y: e.z });

const entities = [
  { id: 1, kind: 'unit', owner: 1, x: 10, z: 10 },
  { id: 2, kind: 'unit', owner: 1, x: 20, z: 20 },
  { id: 3, kind: 'structure', owner: 1, x: 15, z: 15 },
  { id: 4, kind: 'unit', owner: 2, x: 12, z: 12 },
  { id: 5, kind: 'structure', owner: 1, x: 100, z: 100 },
];

describe('selectInRect', () => {
  it('väljer bara egna enheter i rutan, inte byggnader', () => {
    expect(selectInRect(entities, toScreen, { x0: 0, y0: 0, x1: 30, y1: 30 }, 1)).toEqual([1, 2]);
  });

  it('väljer byggnader om inga enheter finns i rutan', () => {
    expect(selectInRect(entities, toScreen, { x0: 90, y0: 90, x1: 110, y1: 110 }, 1)).toEqual([5]);
  });

  it('fungerar oavsett åt vilket håll man drar', () => {
    expect(selectInRect(entities, toScreen, { x0: 15, y0: 15, x1: 5, y1: 5 }, 1)).toEqual([1]);
  });

  it('ger tom lista när inget är i rutan', () => {
    expect(selectInRect(entities, toScreen, { x0: 50, y0: 50, x1: 60, y1: 60 }, 1)).toEqual([]);
  });
});
