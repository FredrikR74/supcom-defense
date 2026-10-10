import { createRng } from './rng.js';

export const TICKS_PER_SECOND = 10;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/**
 * Hela simuleringens tillstånd. Får inte bero på DOM eller Three.js.
 */
export function createWorld({ seed = 1 } = {}) {
  return {
    tick: 0,
    rng: createRng(seed),
  };
}

export function tickWorld(world) {
  world.tick++;
}
