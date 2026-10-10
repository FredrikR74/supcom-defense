import { createRng } from './rng.js';
import { generateTerrain } from './terrain.js';
import { createEconomy, stepEconomy } from './economy.js';
import { addStructure, addUnit, getDef } from './entities.js';
import { applyCommands } from './commands.js';
import { movementSystem } from './systems/movement.js';
import { constructionDemand, constructionProgress } from './systems/construction.js';
import { separationSystem } from './systems/separation.js';
import { targetingSystem, weaponsSystem, projectileSystem, retaliationSystem, deathSystem } from './systems/combat.js';
import { regenSystem } from './veterancy.js';
import { spawnAcu, acuSystem } from './acu.js';
import { computeSteepCells, updatePathing } from './pathing.js';
import { TICK_SECONDS, PLAYER_ID, ENEMY_ID } from './constants.js';
import gameConfig from '../data/gameConfig.js';
import { createDirector, directorSystem } from './director.js';

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
    /** Entitets-id -> entitet, för snabb uppslagning. */
    byId: new Map(),
    nextEntityId: 1,
    /** Projektiler i luften. */
    projectiles: [],
    /** Händelser för renderingen (skott, träffar, explosioner); töms av den som läser dem. */
    events: [],
    commands: [],
    /** Fiendens strömmande tryck och svårighetsgrad. */
    director: createDirector({ ...gameConfig.director, ...config.director }, config.difficulty ?? gameConfig.difficulty),
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
    spawnAcu(world);
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

/**
 * Produktion från klara byggnader och från enheter (ACU:n), byggares efterfrågan
 * och byggnaders löpande förbrukning (upkeep). En byggnad med upkeep producerar
 * bara i proportion till hur mycket av sin upkeep den fick förra ticket, så en
 * Mass Extractor ger mindre mass vid energibrist, som i FA.
 */
function economySystem(world) {
  for (const player of Object.values(world.players)) {
    if (!player.economy) continue;
    const producers = [];
    const consumers = [];
    const upkeeps = [];
    for (const e of world.entities) {
      if (e.owner !== player.id || (e.kind !== 'unit' && e.kind !== 'structure')) continue;
      const active = e.kind === 'unit' || e.built;
      const def = getDef(e.type);
      if (active && e.production) {
        const k = e.upkeepEfficiency ?? 1;
        producers.push({ mass: e.production.mass * k, energy: e.production.energy * k });
      }
      if (active && def.upkeep) {
        const c = { demand: def.upkeep, entity: e };
        consumers.push(c);
        upkeeps.push(c);
      }
      if (e.demand) consumers.push(e);
    }
    stepEconomy(player.economy, producers, consumers, TICK_SECONDS);
    for (const c of upkeeps) c.entity.upkeepEfficiency = c.efficiency;
  }
}

export function tickWorld(world) {
  applyCommands(world);
  if (world.map) {
    directorSystem(world);
    updatePathing(world);
  }
  targetingSystem(world);
  movementSystem(world);
  separationSystem(world);
  constructionDemand(world);
  economySystem(world);
  constructionProgress(world);
  weaponsSystem(world);
  projectileSystem(world);
  retaliationSystem(world);
  deathSystem(world);
  regenSystem(world);
  acuSystem(world);
  world.tick++;
}
