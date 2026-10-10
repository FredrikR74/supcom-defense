import { getEntity } from './entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';

/** Hur nära en assisterande enhet håller sig till den den följer, utöver räckvidden. */
const FOLLOW_SLACK = 1;

/**
 * Vart en enhet med en guard-order (assistera en annan enhet) ska gå.
 * Bygger den assisterade något går vi mot bygget, annars mot den assisterade.
 * Returnerar { x, z, reach, target, job } eller null om den assisterade försvunnit.
 */
export function guardDestination(world, unit, order) {
  const target = getEntity(world, order.targetId);
  if (!target) return null;
  const range = units[unit.type].buildRange ?? 0;

  if (target.kind === 'unit' && target.buildJob?.kind === 'structure') {
    const site = getEntity(world, target.buildJob.targetId);
    if (site) {
      return { x: site.x, z: site.z, reach: range + structures[site.type].size / 2, target, site };
    }
  }
  return { x: target.x, z: target.z, reach: range + target.radius + FOLLOW_SLACK, target, site: null };
}
