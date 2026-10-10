import { createRng } from './rng.js';
import { generateTerrain } from './terrain.js';
import { createEconomy, stepEconomy } from './economy.js';
import { addStructure, addUnit } from './entities.js';
import { applyCommands } from './commands.js';
import { movementSystem } from './systems/movement.js';
import { constructionDemand, constructionProgress } from './systems/construction.js';
import { separationSystem } from './systems/separation.js';
import { computeSteepCells, updatePathing } from './pathing.js';
import { TICK_SECONDS, PLAYER_ID, ENEMY_ID } from './constants.js';
import gameConfig from '../data/gameConfig.js';

export { TICKS_PER_SECOND, TICK_SECONDS, PLAYER_ID, ENEMY_ID } from './constants.js';

/**
 * Hela simuleringens tillstånd. Får inte bero på DOM eller Three.js.
 */
export function createWorld({ seed = 1, map = null, config = {} } = {}) {
  const terrain = map ? createTerrainForMap(map) : null;
  const cfg = { ...gameConfig, ...config };
  const world = {
    tick: 0,
    rng: createRng(seed),
    config: cfg,
    map,
    terrain,
    /** Entitets-id per ruta (0 = ledig), för byggnadernas fotavtryck. */
    occupancy: terrain ? new Int32Array(terrain.size * terrain.size) : null,
    /** Rutor som är för branta för enheter. */
    steep: terrain ? computeSteepCells(terrain) : null,
    /** Flödesfält mot kärnan ({ dist, next }), räknas om när `pathDirty` är satt. */
    flow: null,
    pathDirty: true,
    pathVersion: 0,
    entities: [],
    nextEntityId: 1,
    commands: [],
    players: {
      [PLAYER_ID]: {
        id: PLAYER_ID,
        economy: createEconomy({ stored: cfg.startingResources, max: cfg.baseStorage }),
      },
      [ENEMY_ID]: { id: ENEMY_ID, economy: null },
    },
  };

  if (map) {
    world.coreId = addStructure(world, 'core', { ...map.core, owner: PLAYER_ID }).id;
    // ACU:n startar strax söder om kärnan, vänd mot söder (mot kameran).
    world.acuId = addUnit(world, 'acu', { x: map.core.x, z: map.core.z + 5, owner: PLAYER_ID }).id;
    updatePathing(world);
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
    if (!player.economy) continue;
    const producers = [];
    const consumers = [];
    for (const e of world.entities) {
      if (e.owner !== player.id) continue;
      if (e.production && e.built) producers.push(e.production);
      if (e.demand) consumers.push(e);
    }
    stepEconomy(player.economy, producers, consumers, TICK_SECONDS);
  }
}

export function tickWorld(world) {
  applyCommands(world);
  if (world.map) updatePathing(world);
  movementSystem(world);
  separationSystem(world);
  constructionDemand(world);
  economySystem(world);
  constructionProgress(world);
  world.tick++;
}
