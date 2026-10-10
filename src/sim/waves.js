import { spawnEnemy } from './enemies.js';
import { TICKS_PER_SECOND, PLAYER_ID, ENEMY_ID } from './constants.js';

/**
 * Vågor: spelaren startar nästa våg själv under byggfasen. Vågens fiender
 * kommer enligt schemat i data/waves.js, och vågen är klar när alla är döda.
 *
 * `world.wave.state`: 'build' (väntar på spelaren), 'active' (våg pågår),
 * 'complete' (alla vågor klarade).
 */
export function createWaveState() {
  return { state: 'build', completed: 0, current: 0, pending: [] };
}

/** Schemat för en våg: [{ tick, type, spawn }] sorterat på tick. */
export function scheduleWave(def, startTick, spawnCount) {
  const pending = [];
  for (const g of def.groups) {
    for (let i = 0; i < g.count; i++) {
      const seconds = (g.delay ?? 0) + i * g.interval;
      pending.push({
        tick: startTick + Math.round(seconds * TICKS_PER_SECOND),
        type: g.type,
        spawn: g.spawn === 'all' ? i % spawnCount : g.spawn,
      });
    }
  }
  return pending.sort((a, b) => a.tick - b.tick);
}

/** Kommandot `{ type: 'startWave' }`: startar nästa våg om spelet är i byggfasen. */
export function startWave(world) {
  const w = world.wave;
  if (w.state !== 'build' || w.completed >= world.waveDefs.length) return;
  w.current = w.completed + 1;
  w.pending = scheduleWave(world.waveDefs[w.current - 1], world.tick, world.map.spawns.length);
  w.state = 'active';
}

const aliveInWave = (world, n) =>
  world.entities.filter((e) => e.owner === ENEMY_ID && e.kind === 'unit' && e.wave === n).length;

/** Skapar fiender enligt schemat och avslutar vågen när alla är döda. */
export function waveSystem(world) {
  const w = world.wave;
  if (w.state !== 'active') return;

  while (w.pending.length > 0 && w.pending[0].tick <= world.tick) {
    const { type, spawn } = w.pending.shift();
    spawnEnemy(world, type, spawn).wave = w.current;
  }

  if (w.pending.length === 0 && aliveInWave(world, w.current) === 0) {
    const bonus = world.waveDefs[w.current - 1].bonus ?? 0;
    const economy = world.players[PLAYER_ID].economy;
    economy.mass.stored = Math.min(economy.mass.max, economy.mass.stored + bonus);
    w.completed = w.current;
    w.state = w.completed >= world.waveDefs.length ? 'complete' : 'build';
    world.events.push({ type: 'waveComplete', wave: w.current, bonus });
  }
}

/** Sammanfattning för UI:t. */
export function waveInfo(world) {
  const w = world.wave;
  const total = world.waveDefs.length;
  const nextDef = world.waveDefs[w.completed];
  const preview = {};
  for (const g of nextDef?.groups ?? []) preview[g.type] = (preview[g.type] ?? 0) + g.count;
  return {
    state: w.state,
    total,
    completed: w.completed,
    current: w.current,
    remaining: w.state === 'active' ? w.pending.length + aliveInWave(world, w.current) : 0,
    next: w.state === 'build' ? { number: w.completed + 1, preview, bonus: nextDef?.bonus ?? 0 } : null,
  };
}
