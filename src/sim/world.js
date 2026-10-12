import { createRng } from './rng.js';
import { generateTerrain } from './terrain.js';
import { createEconomy, stepEconomy } from './economy.js';
import { addStructure, addUnit, getDef } from './entities.js';
import { applyCommands } from './commands.js';
import { movementSystem } from './systems/movement.js';
import { constructionDemand, constructionProgress } from './systems/construction.js';
import { separationSystem } from './systems/separation.js';
import {
  targetingSystem, patrolEngageSystem, weaponsSystem, projectileSystem, retaliationSystem, deathSystem,
} from './systems/combat.js';
import { regenSystem } from './veterancy.js';
import { spawnAcu, acuSystem } from './acu.js';
import { computeSteepCells, updatePathing } from './pathing.js';
import { TICK_SECONDS, PLAYER_ID, ENEMY_ID } from './constants.js';
import gameConfig from '../data/gameConfig.js';
import { createDirector, directorSystem } from './director.js';
import { squadSystem } from './squads.js';

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
    /** Fiendens trupper (se squads.js). */
    squads: [],
    nextSquadId: 1,
    /** Händelser för renderingen (skott, träffar, explosioner); töms av den som läser dem. */
    events: [],
    commands: [],
    /** Fiendens strömmande tryck och svårighetsgrad. */
    director: createDirector(
      { ...gameConfig.director, ...map?.scenario?.director, ...config.director },
      config.difficulty ?? gameConfig.difficulty,
    ),
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
    if (map.scenario) applyScenario(world, map.scenario);
    updatePathing(world);
  }
  return world;
}

/**
 * En förberedd situation (t.ex. för testning): färdiga byggnader och enheter
 * för spelaren, och fulla lager (efter att storage-byggnaderna räknats in).
 */
function applyScenario(world, scenario) {
  for (const s of scenario.structures ?? []) addStructure(world, s.type, { x: s.x, z: s.z, owner: PLAYER_ID });
  for (const u of scenario.units ?? []) {
    for (let i = 0; i < (u.count ?? 1); i++) {
      addUnit(world, u.type, { x: u.x + (i % 4) * 1.5, z: u.z + Math.floor(i / 4) * 1.5, owner: PLAYER_ID });
    }
  }
  if (scenario.fullStorage) {
    const player = world.players[PLAYER_ID];
    updateStorage(world, player);
    for (const r of ['mass', 'energy']) player.economy[r].stored = player.economy[r].max;
  }
}

export function createTerrainForMap(map) {
  return generateTerrain({
    size: map.size,
    seed: map.seed,
    hillHeight: map.terrain.hillHeight,
    plateau: { ...map.terrain.plateau, x: map.core.x, z: map.core.z },
    ring: map.terrain.ring ? { ...map.terrain.ring, x: map.core.x, z: map.core.z } : null,
    peaks: map.terrain.peaks ?? null,
    mountainHeight: map.terrain.mountainHeight,
  });
}

/**
 * Lagerkapacitet: grundlagret (ACU:ns) plus klara Mass/Energy Storage. Bara
 * skillnaden mot förra ticket läggs på, så grundlagret ändras inte.
 */
function updateStorage(world, player) {
  const bonus = { mass: 0, energy: 0 };
  for (const e of world.entities) {
    if (e.kind !== 'structure' || e.owner !== player.id || !e.built) continue;
    const storage = getDef(e.type).storage;
    if (storage) for (const r of Object.keys(bonus)) bonus[r] += storage[r] ?? 0;
  }
  const economy = player.economy;
  const previous = economy.storageBonus ?? { mass: 0, energy: 0 };
  for (const r of Object.keys(bonus)) {
    const res = economy[r];
    res.max += bonus[r] - previous[r];
    res.stored = Math.min(res.stored, res.max);
  }
  economy.storageBonus = bonus;
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
    updateStorage(world, player);
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
  patrolEngageSystem(world);
  if (world.map) squadSystem(world);
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
