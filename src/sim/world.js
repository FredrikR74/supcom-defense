import { createRng } from './rng.js';
import { generateTerrain } from './terrain.js';
import { createEconomy, stepEconomy } from './economy.js';
import { addStructure, addUnit } from './entities.js';
import { applyCommands } from './commands.js';
import { movementSystem } from './systems/movement.js';
import { TICK_SECONDS, PLAYER_ID } from './constants.js';
import gameConfig from '../data/gameConfig.js';

export { TICKS_PER_SECOND, TICK_SECONDS, PLAYER_ID } from './constants.js';

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
    commands: [],
    players: {
      [PLAYER_ID]: {
        id: PLAYER_ID,
        economy: createEconomy({ stored: config.startingResources, max: config.baseStorage }),
      },
    },
  };

  if (map) {
    world.coreId = addStructure(world, 'core', { ...map.core, owner: PLAYER_ID }).id;
    // ACU:n startar strax söder om kärnan, vänd mot söder (mot kameran).
    world.acuId = addUnit(world, 'acu', { x: map.core.x, z: map.core.z + 5, owner: PLAYER_ID }).id;
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
  applyCommands(world);
  economySystem(world);
  movementSystem(world);
  world.tick++;
}
