import { createRng } from './rng.js';
import { generateTerrain } from './terrain.js';

export const TICKS_PER_SECOND = 10;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/**
 * Hela simuleringens tillstånd. Får inte bero på DOM eller Three.js.
 */
export function createWorld({ seed = 1, map = null } = {}) {
  return {
    tick: 0,
    rng: createRng(seed),
    map,
    terrain: map ? createTerrainForMap(map) : null,
  };
}

export function createTerrainForMap(map) {
  return generateTerrain({
    size: map.size,
    seed: map.seed,
    hillHeight: map.terrain.hillHeight,
    plateau: { ...map.terrain.plateau, x: map.core.x, z: map.core.z },
  });
}

export function tickWorld(world) {
  world.tick++;
}
