import { spawnSquad } from './squads.js';
import { TICK_SECONDS, ENEMY_ID } from './constants.js';
import { getEntity } from './entities.js';
import units from '../data/units.js';

/**
 * Fiendens strömmande "ekonomi": precis som spelarens ekonomi flyter fiendens
 * resurser in hela tiden. En budget i mass per sekund växer med speltiden och
 * multipliceras med svårighetsgraden. Budgeten sparas ihop till vågor: efter en
 * slumpad paus (utan förvarning) köps så många enheter budgeten räcker till, och
 * de kommer som en eller flera trupper i formation från en slumpad gateway
 * (se squads.js). Spelet tar aldrig slut: trycket växer tills kärnan faller.
 *
 * `world.director.state`: 'grace' (lugn början), 'active', 'defeat' (kärnan förstörd).
 */

/** 0 → ×0,1 (mycket lätt), 50 → ×1 (normal), 100 → ×10 (omöjligt). */
export function difficultyMultiplier(difficulty) {
  return 0.1 * 100 ** (difficulty / 100);
}

export function difficultyLabel(difficulty) {
  if (difficulty < 15) return 'Very easy';
  if (difficulty < 35) return 'Easy';
  if (difficulty < 60) return 'Normal';
  if (difficulty < 80) return 'Hard';
  if (difficulty < 95) return 'Brutal';
  return 'Impossible';
}

export function createDirector(config, difficulty = 50) {
  return {
    state: 'grace',
    difficulty,
    elapsed: 0,
    budget: 0,
    /** Sekunder kvar tills nästa våg får gå. */
    waveTimer: 0,
    waves: 0,
    nextType: null,
    spentMass: 0,
    /** Antal skapade fiender per typ. */
    spawned: {},
    config,
  };
}

/** Fiendens inkomst i mass per sekund just nu. */
export function threatRate(director) {
  const { baseRate, growthPerMinute, growthExponent = 1, graceSeconds } = director.config;
  if (director.elapsed < graceSeconds) return 0;
  const minutes = (director.elapsed - graceSeconds) / 60;
  return baseRate * (1 + growthPerMinute * minutes) ** growthExponent * difficultyMultiplier(director.difficulty);
}

/** Väljer nästa fiendetyp, viktat efter vad som är upplåst vid den här tiden. */
function chooseType(world, director) {
  const minutes = director.elapsed / 60;
  const pool = director.config.unitPool.filter((u) => minutes >= (u.fromMinute ?? 0));
  const total = pool.reduce((sum, u) => sum + u.weight, 0);
  let r = world.rng.next() * total;
  for (const u of pool) {
    r -= u.weight;
    if (r <= 0) return u.type;
  }
  return pool[pool.length - 1].type;
}

export function setDifficulty(world, value) {
  world.director.difficulty = Math.min(100, Math.max(0, Math.round(value)));
}

export function directorSystem(world) {
  const d = world.director;
  if (d.state === 'defeat') return;
  if (world.coreId && !getEntity(world, world.coreId)) {
    d.state = 'defeat';
    world.events.push({ type: 'defeat', elapsed: d.elapsed });
    return;
  }
  d.elapsed += TICK_SECONDS;
  if (d.elapsed < d.config.graceSeconds) return;
  if (d.state === 'grace') {
    // Första vågen får också samlas ihop en stund.
    d.state = 'active';
    d.waveTimer = world.rng.range(d.config.waveSeconds.min, d.config.waveSeconds.max);
  }

  d.budget += threatRate(d) * TICK_SECONDS;
  d.nextType ??= chooseType(world, d);
  d.waveTimer -= TICK_SECONDS;
  if (d.waveTimer > 0 || d.budget < units[d.nextType].cost.mass) return;

  // En våg: hela budgeten, uppdelad i trupper om högst maxSquadSize, var och en
  // från en slumpad gateway (höga svårighetsgrader ger flera trupper samtidigt).
  const { maxSquadSize, maxSquadsPerWave, waveSeconds } = d.config;
  for (let s = 0; s < maxSquadsPerWave && d.budget >= units[d.nextType].cost.mass; s++) {
    const types = [];
    while (types.length < maxSquadSize && d.budget >= units[d.nextType].cost.mass) {
      const cost = units[d.nextType].cost.mass;
      d.budget -= cost;
      d.spentMass += cost;
      types.push(d.nextType);
      d.spawned[d.nextType] = (d.spawned[d.nextType] ?? 0) + 1;
      d.nextType = chooseType(world, d);
    }
    spawnSquad(world, types, Math.floor(world.rng.next() * world.map.spawns.length));
  }
  d.waves++;
  d.waveTimer = world.rng.range(waveSeconds.min, waveSeconds.max);
}

/** Sammanfattning för UI:t. */
export function directorInfo(world) {
  const d = world.director;
  return {
    state: d.state,
    elapsed: d.elapsed,
    graceLeft: Math.max(0, d.config.graceSeconds - d.elapsed),
    rate: threatRate(d),
    difficulty: d.difficulty,
    label: difficultyLabel(d.difficulty),
    enemies: world.entities.filter((e) => e.owner === ENEMY_ID && e.kind === 'unit').length,
  };
}
