import { addUnit } from './entities.js';
import { ENEMY_ID } from './constants.js';

/** Hur långt från spawnpunkten (i världsenheter) nya fiender sprids ut. */
const SPAWN_SPREAD = 2;

/**
 * Skapar en fiende vid spawnpunkt nummer `spawnIndex` med ordern att gå till kärnan.
 * Utspridningen kommer från världens seedade slump, så den är deterministisk.
 */
export function spawnEnemy(world, type, spawnIndex = 0) {
  const spawn = world.map.spawns[spawnIndex % world.map.spawns.length];
  const angle = world.rng.range(0, Math.PI * 2);
  const r = world.rng.range(0, SPAWN_SPREAD);
  const unit = addUnit(world, type, {
    x: spawn.x + Math.cos(angle) * r,
    z: spawn.z + Math.sin(angle) * r,
    owner: ENEMY_ID,
  });
  unit.orders.push({ type: 'attackCore' });
  return unit;
}
