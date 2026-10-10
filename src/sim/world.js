import { createRng } from './rng.js';
import { generateTerrain } from './terrain.js';
import { createEconomy, stepEconomy } from './economy.js';
import { addStructure } from './entities.js';
import gameConfig from '../data/gameConfig.js';

export const TICKS_PER_SECOND = 10;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/** Spelaren har id 1. Fiender får egna id när de tillkommer. */
export const PLAYER_ID = 1;

/**
 * Hela simuleringens tillstånd. Får inte bero på DOM eller Three.js.
 */
export function createWorld({ seed = 1, map = null, config = gameConfig } = {}) {
  const world = {
    tick: 0,
    rng: createRng(seed),
    map,
    terrain: map ? createTerrainForMap(map) : null,
    entities: [],
    nextEntityId: 1,
    players: {
      [PLAYER_ID]: {
        id: PLAYER_ID,
        economy: createEconomy({ stored: config.startingResources, max: config.baseStorage }),
      },
    },
  };

  if (map) {
    world.coreId = addStructure(world, 'core', { ...map.core, owner: PLAYER_ID }).id;
  }
  return world;
}

export function createTerrainForMap(map) {
  return generateTerrain({
    size: map.size,
    seed: map.seed,
    hillHeight: map.terrain.hillHeight,
    plateau: { ...map.terrain.plateau, x: map.core.x, z: map.core.z },
  });
}

function economySystem(world) {
  for (const player of Object.values(world.players)) {
    const producers = [];
    const consumers = [];
    for (const e of world.entities) {
      if (e.owner !== player.id) continue;
      if (e.production) producers.push(e.production);
      if (e.demand) consumers.push(e);
    }
    stepEconomy(player.economy, producers, consumers, TICK_SECONDS);
  }
}

export function tickWorld(world) {
  economySystem(world);
  world.tick++;
}
