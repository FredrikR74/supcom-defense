import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld } from '../src/sim/world.js';

describe('world', () => {
  it('räknar tick', () => {
    const world = createWorld();
    for (let i = 0; i < 5; i++) tickWorld(world);
    expect(world.tick).toBe(5);
  });
});
