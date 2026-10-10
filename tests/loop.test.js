import { describe, it, expect } from 'vitest';
import { createFixedStep } from '../src/loop.js';

describe('createFixedStep', () => {
  it('ger 10 tick per sekund oavsett bildfrekvens', () => {
    for (const fps of [30, 60, 144]) {
      const step = createFixedStep(0.1);
      let ticks = 0;
      for (let i = 0; i < fps * 10; i++) ticks += step.advance(1 / fps).ticks;
      expect(ticks).toBeGreaterThanOrEqual(99);
      expect(ticks).toBeLessThanOrEqual(100);
    }
  });

  it('sparar resttid och rapporterar alpha', () => {
    const step = createFixedStep(0.1);
    const r = step.advance(0.25);
    expect(r.ticks).toBe(2);
    expect(r.alpha).toBeCloseTo(0.5);
  });

  it('begränsar långa frames (t.ex. bakgrundsflik)', () => {
    const step = createFixedStep(0.1);
    expect(step.advance(10).ticks).toBe(2);
  });
});
