import { TICK_SECONDS } from '../constants.js';
import { guardDestination } from '../guard.js';
import { flowTarget } from '../pathing.js';
import { steer, PATH_BUDGET_PER_TICK } from '../unitPath.js';
import { getEntity, needsRepair, weaponOf } from '../entities.js';
import units from '../../data/units.js';
import { orderLineOfFire } from './combat.js';

/** Kroppen vrider sig högst så här fort (radianer per sekund), så att enheter inte rycker. */
export const BODY_TURN_RATE = Math.PI;
/** En trupmedlem närmare sin plats än så här pekar åt truppens håll, inte åt sitt lilla korrigeringssteg. */
const FACING_NEAR = 1;

/** Vrider `heading` mot `want`, högst `max` radianer. */
function turnToward(heading, want, max) {
  const diff = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
  return heading + Math.max(-max, Math.min(max, diff));
}

/** Gå till inom byggräckvidd för att reparera/återvinna; null när det inte behövs längre. */
function workDestination(world, e, order) {
  const target = getEntity(world, order.targetId);
  if (!target) return null;
  if (order.type === 'repair' && !needsRepair(target)) return null;
  if (order.type === 'reclaim' && target.kind !== 'wreck') return null;
  return { x: target.x, z: target.z, reach: (units[e.type].buildRange ?? 0) + target.radius };
}

/**
 * Gå mot målet tills det är inom vapnets räckvidd; null om målet är borta.
 * En fiende som står inom räckvidd men där skottet skulle slå i en kulle går
 * närmare tills det når fram (se hasLineOfFire).
 */
function attackDestination(world, e, order) {
  const target = getEntity(world, order.targetId);
  const weapon = weaponOf(e);
  const range = weapon?.range;
  if (!target || target.hp <= 0 || !range) return null;
  const reach = Math.max(0.5, range + target.radius - 0.5);
  if (Math.hypot(target.x - e.x, target.z - e.z) <= reach + 1e-6 && !orderLineOfFire(world, e, order, target, weapon)) {
    return { x: target.x, z: target.z, reach: target.radius + 1 };
  }
  return { x: target.x, z: target.z, reach };
}

/** Målpunkt och stoppavstånd för en order, eller null om ordern inte innebär förflyttning. */
function destination(world, e, order) {
  switch (order.type) {
    case 'move':
    case 'attackMove': return { x: order.x, z: order.z, reach: 0 };
    case 'build': return { x: order.x, z: order.z, reach: order.reach };
    case 'guard': return guardDestination(world, e, order);
    case 'attack':
    case 'overcharge': return attackDestination(world, e, order);
    case 'repair':
    case 'reclaim': return workDestination(world, e, order);
    case 'patrol': {
      const p = order.points[order.index];
      return { x: p.x, z: p.z, reach: 0 };
    }
    case 'attackCore': {
      const p = flowTarget(world, e.x, e.z);
      return p && { x: p.x, z: p.z, reach: 0 };
    }
    case 'squad': {
      // Målet sätts av squadSystem: en plats i formationen, flödesfältet eller stå still.
      const g = order.goal;
      if (!g || g.mode === 'hold') return null;
      if (g.mode === 'flow') {
        const p = flowTarget(world, e.x, e.z);
        return p && { x: p.x, z: p.z, reach: 0, flow: true };
      }
      return { x: g.x, z: g.z, reach: g.reach, facing: g.facing };
    }
    default: return null;
  }
}

/**
 * Enheter går mot sin första order. En flyttorder är klar vid målet och nästa
 * order tar vid. Bygg- och guard-order stannar inom räckhåll (`reach`) och
 * lämnas kvar åt byggsystemet. Fiender med `attackCore` följer flödesfältet
 * ruta för ruta tills de står intill kärnan, och stannar när de har ett mål att
 * skjuta på. Fiender i en trupp går dit squadSystem säger (se squads.js).
 * Egna enheter går runt hinder med A* (se unitPath.js).
 */
export function movementSystem(world) {
  world.pathBudget = PATH_BUDGET_PER_TICK;
  for (const e of world.entities) {
    if (e.kind !== 'unit') continue;
    e.prevX = e.x;
    e.prevZ = e.z;
    // Fiender på väg mot kärnan och beväpnade patrullerare stannar och skjuter.
    const first = e.orders[0]?.type;
    const maxTurn = BODY_TURN_RATE * TICK_SECONDS;
    // Fiender som backar (se enemyAi.js) går undan även när de skjuter, med fronten mot målet.
    if (e.kite) {
      const dx = e.kite.x - e.x;
      const dz = e.kite.z - e.z;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, e.speed * TICK_SECONDS);
      if (dist > 1e-9) {
        e.x += (dx / dist) * step;
        e.z += (dz / dist) * step;
      }
      e.heading = turnToward(e.heading ?? 0, e.kite.facing, maxTurn);
      continue;
    }
    const retreating = first === 'squad' && e.orders[0].goal?.retreat;
    if ((first === 'attackCore' || first === 'squad' || first === 'patrol' || first === 'attackMove') && e.targetId && !retreating) continue;

    let budget = e.speed * TICK_SECONDS;
    let want = null;
    for (let steps = 0; budget > 0 && e.orders.length > 0 && steps < 8; steps++) {
      const order = e.orders[0];
      const dest = destination(world, e, order);
      if (!dest) {
        // Den assisterade eller målet är borta: nästa order (t.ex. tillbaka mot kärnan).
        if (['guard', 'attack', 'overcharge', 'repair', 'reclaim'].includes(order.type)) {
          e.orders.shift();
          continue;
        }
        break;
      }
      const goal = order.type === 'attackCore' || order.type === 'squad' ? dest : steer(world, e, order, dest);
      if (goal.wait) break;
      if (goal.stuck) {
        if (order.type === 'move' || order.type === 'attackMove') e.orders.shift(); // så nära som det går
        // En patrullpunkt som inte går att nå (t.ex. mitt i en byggnad som byggts
        // där): så nära som det går räcker, vänd mot nästa punkt.
        if (order.type === 'patrol') {
          order.index = (order.index + 1) % order.points.length;
          order.path = null;
        }
        break;
      }

      const dx = goal.x - e.x;
      const dz = goal.z - e.z;
      const dist = Math.hypot(dx, dz);
      const remaining = dist - goal.reach;
      if (remaining <= 1e-9) break; // framme (bygg/guard: inom räckhåll)
      // I formationen pekar man åt truppens håll; annars dit man går.
      want = goal.facing !== undefined && dist < FACING_NEAR ? goal.facing : Math.atan2(dx, dz);

      const step = Math.min(remaining, budget);
      e.x += (dx / dist) * step;
      e.z += (dz / dist) * step;
      budget -= step;

      if (step === remaining) {
        if (goal.waypoint || goal.flow || order.type === 'attackCore') {
          e.x = goal.x;
          e.z = goal.z;
          continue; // nästa vägpunkt / nästa ruta i flödesfältet
        }
        if (order.type === 'squad') break; // på sin plats i formationen
        if (order.type === 'patrol') {
          e.x = goal.x;
          e.z = goal.z;
          order.index = (order.index + 1) % order.points.length; // vänd och gå tillbaka
          order.path = null;
          continue;
        }
        if (order.type !== 'move' && order.type !== 'attackMove') break; // inom räckhåll, byggsystemet tar över
        e.x = order.x;
        e.z = order.z;
        e.orders.shift();
      }
    }
    if (want !== null) e.heading = turnToward(e.heading ?? want, want, maxTurn);
  }
}
