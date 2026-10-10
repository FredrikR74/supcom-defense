import { describe, it, expect } from 'vitest';
import { createRng } from '../src/sim/rng.js';

describe('createRng', () => {
  it('ger samma sekvens för samma seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('ger olika sekvens för olika seed', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() ligger i [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() täcker hela intervallet inklusive gränserna', () => {
    const rng = createRng(3);
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
