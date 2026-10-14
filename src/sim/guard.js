import { getEntity, needsRepair, weaponOf } from './entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';

/** Hur nära en assisterande enhet håller sig till den den följer, utöver räckvidden. */
const FOLLOW_SLACK = 1;
/**
 * Som FA:s GuardScanRadius: fiender så här nära den assisterade (utöver den
 * assisterandes räckvidd) anfalls. Som GuardReturnRadius: längre bort än så
 * jagas de inte, utan den assisterande går tillbaka.
 */
export const GUARD_SCAN_EXTRA = 5;
export const GUARD_RETURN_MULT = 1.6;

const areEnemies = (a, b) => a.owner !== b.owner && a.owner !== 0 && b.owner !== 0;

/**
 * Assist (guard) som i FA: en enhet som assisterar en annan egen enhet eller
 * fabrik följer den och
 * - byggare hjälper till med det den bygger, producerar eller uppgraderar, och reparerar
 *   den när den är skadad
 * - beväpnade anfaller fiender som kommer nära den (se updateGuardEngagement)
 *
 * Returnerar vart enheten ska gå och vad den ska göra där:
 * { x, z, reach, target, mode, site } där mode är 'build', 'factory', 'enhance', 'repair',
 * 'engage' eller 'follow', eller null om den assisterade försvunnit.
 */
export function guardDestination(world, unit, order) {
  const target = getEntity(world, order.targetId);
  if (!target) return null;
  const def = units[unit.type];
  const range = def.buildRange ?? 0;
  const builder = (def.buildPower ?? 0) > 0;

  if (builder && target.kind === 'unit' && target.buildJob?.kind === 'structure') {
    const site = getEntity(world, target.buildJob.targetId);
    if (site) {
      return { x: site.x, z: site.z, reach: range + structures[site.type].size / 2, target, site, mode: 'build' };
    }
  }
  if (builder && target.buildJob?.kind === 'unit') {
    return { x: target.x, z: target.z, reach: range + target.radius, target, site: null, mode: 'factory' };
  }
  if (builder && target.buildJob?.kind === 'enhance' && target.buildJob.targetId === target.id) {
    return { x: target.x, z: target.z, reach: range + target.radius, target, site: null, mode: 'enhance' };
  }
  if (builder && needsRepair(target)) {
    return { x: target.x, z: target.z, reach: range + target.radius, target, site: null, mode: 'repair' };
  }
  const enemy = order.engageId != null ? getEntity(world, order.engageId) : null;
  const weapon = weaponOf(unit);
  if (enemy && weapon) {
    return { x: enemy.x, z: enemy.z, reach: weapon.range * 0.9 + enemy.radius, target, site: null, mode: 'engage' };
  }
  return { x: target.x, z: target.z, reach: range + target.radius + FOLLOW_SLACK, target, site: null, mode: 'follow' };
}

/**
 * Beväpnade assisterande väljer en fiende att gå på: det den assisterade skjuter
 * på, annars den närmaste fienden inom skanningsradien runt den assisterade.
 * En fiende som kommit för långt från den assisterade släpps.
 */
export function updateGuardEngagement(world) {
  for (const e of world.entities) {
    const order = e.kind === 'unit' ? e.orders[0] : null;
    if (order?.type !== 'guard') continue;
    const weapon = weaponOf(e);
    const target = getEntity(world, order.targetId);
    if (!weapon || weapon.antiAir || !target) {
      order.engageId = null;
      continue;
    }
    const scan = weapon.range + GUARD_SCAN_EXTRA;
    const tooFar = (t) => Math.hypot(t.x - target.x, t.z - target.z) - t.radius > scan * GUARD_RETURN_MULT;

    const current = order.engageId != null ? getEntity(world, order.engageId) : null;
    if (current && current.hp > 0 && !tooFar(current)) continue;
    order.engageId = null;

    const theirs = target.targetId != null ? getEntity(world, target.targetId) : null;
    if (theirs && theirs.hp > 0 && areEnemies(e, theirs) && !tooFar(theirs)) {
      order.engageId = theirs.id;
      continue;
    }
    let best = null;
    let bestDist = scan;
    for (const t of world.entities) {
      if ((t.kind !== 'unit' && t.kind !== 'structure') || !areEnemies(e, t) || t.hp <= 0) continue;
      const d = Math.hypot(t.x - target.x, t.z - target.z) - t.radius;
      if (d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    order.engageId = best?.id ?? null;
  }
}
