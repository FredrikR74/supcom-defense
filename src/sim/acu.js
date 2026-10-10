import { addUnit, getEntity } from './entities.js';
import { TICKS_PER_SECOND, PLAYER_ID } from './constants.js';

/**
 * ACU:n återuppstår vid kärnan när den dött (tower defense-avsteg från FA, där
 * ACU-död är förlust). Den kommer tillbaka med full HP men utan veterancy.
 */

/** Skapar spelarens ACU strax söder om kärnan. */
export function spawnAcu(world) {
  const { core } = world.map;
  const acu = addUnit(world, 'acu', { x: core.x, z: core.z + 5, owner: PLAYER_ID });
  world.acuId = acu.id;
  world.acuRespawnTick = null;
  return acu;
}

/** Sekunder kvar tills ACU:n återuppstår, eller null om den lever. */
export function acuRespawnIn(world) {
  if (world.acuRespawnTick == null) return null;
  return Math.max(0, (world.acuRespawnTick - world.tick) / TICKS_PER_SECOND);
}

export function acuSystem(world) {
  if (!world.map || world.director?.state === 'defeat') return;
  if (world.acuRespawnTick == null) {
    if (world.acuId != null && !getEntity(world, world.acuId)) {
      const seconds = world.config.acuRespawnSeconds;
      world.acuRespawnTick = world.tick + Math.round(seconds * TICKS_PER_SECOND);
      world.events.push({ type: 'acuDeath', seconds });
    }
    return;
  }
  if (world.tick >= world.acuRespawnTick) {
    const acu = spawnAcu(world);
    world.events.push({ type: 'acuRespawn', x: acu.x, z: acu.z });
  }
}
