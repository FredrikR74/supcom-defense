import { spawnEnemy } from './enemies.js';
import { TICK_SECONDS, ENEMY_ID } from './constants.js';
import units from '../data/units.js';

/**
 * Fiendens strömmande "ekonomi": precis som spelarens ekonomi flyter fiendens
 * resurser in hela tiden. En budget i mass per sekund växer med speltiden och
 * multipliceras med svårighetsgraden. När budgeten räcker för nästa enhet skapas
 * den. Fienderna kommer en spawnpunkt i taget, som byts med jämna mellanrum.
 *
 * `world.director.state`: 'grace' (lugn början), 'active', 'victory' (överlevt).
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
    spawnIndex: 0,
    spawnTimer: 0,
    nextType: null,
    spentMass: 0,
    config,
  };
}

/** Fiendens inkomst i mass per sekund just nu. */
export function threatRate(director) {
  const { baseRate, growthPerMinute, graceSeconds } = director.config;
  if (director.elapsed < graceSeconds) return 0;
  const minutes = (director.elapsed - graceSeconds) / 60;
  return (baseRate + growthPerMinute * minutes) * difficultyMultiplier(director.difficulty);
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
  if (d.state === 'victory') return;
  d.elapsed += TICK_SECONDS;

  if (d.elapsed >= d.config.survivalSeconds) {
    d.state = 'victory';
    world.events.push({ type: 'victory' });
    return;
  }
  if (d.elapsed < d.config.graceSeconds) return;
  if (d.state === 'grace') d.state = 'active';

  // Byt spawnpunkt med jämna mellanrum, så att fienden anfaller från olika håll.
  d.spawnTimer -= TICK_SECONDS;
  if (d.spawnTimer <= 0) {
    d.spawnIndex = Math.floor(world.rng.next() * world.map.spawns.length);
    d.spawnTimer = d.config.spawnSwitchSeconds;
  }

  d.budget += threatRate(d) * TICK_SECONDS;
  d.nextType ??= chooseType(world, d);
  // Flera kan komma samma tick om budgeten räcker (höga svårighetsgrader).
  for (let i = 0; i < 20; i++) {
    const cost = units[d.nextType].cost.mass;
    if (d.budget < cost) break;
    d.budget -= cost;
    d.spentMass += cost;
    spawnEnemy(world, d.nextType, d.spawnIndex);
    d.nextType = chooseType(world, d);
  }
}

/** Sammanfattning för UI:t. */
export function directorInfo(world) {
  const d = world.director;
  return {
    state: d.state,
    elapsed: d.elapsed,
    survival: d.config.survivalSeconds,
    graceLeft: Math.max(0, d.config.graceSeconds - d.elapsed),
    rate: threatRate(d),
    difficulty: d.difficulty,
    label: difficultyLabel(d.difficulty),
    enemies: world.entities.filter((e) => e.owner === ENEMY_ID && e.kind === 'unit').length,
  };
}
