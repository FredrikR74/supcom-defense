import { TICK_SECONDS } from '../constants.js';
import { guardDestination } from '../guard.js';
import { flowTarget } from '../pathing.js';
import { steer } from '../unitPath.js';
import { getEntity, getDef } from '../entities.js';

/** Gå mot målet tills det är inom vapnets räckvidd; null om målet är borta. */
function attackDestination(world, e, order) {
  const target = getEntity(world, order.targetId);
  const range = getDef(e.type)?.weapon?.range;
  if (!target || target.hp <= 0 || !range) return null;
  return { x: target.x, z: target.z, reach: Math.max(0.5, range + target.radius - 0.5) };
}

/** Målpunkt och stoppavstånd för en order, eller null om ordern inte innebär förflyttning. */
function destination(world, e, order) {
  switch (order.type) {
    case 'move': return { x: order.x, z: order.z, reach: 0 };
    case 'build': return { x: order.x, z: order.z, reach: order.reach };
    case 'guard': return guardDestination(world, e, order);
    case 'attack': return attackDestination(world, e, order);
    case 'attackCore': {
      const p = flowTarget(world, e.x, e.z);
      return p && { x: p.x, z: p.z, reach: 0 };
    }
    default: return null;
  }
}

/**
 * Enheter går mot sin första order. En flyttorder är klar vid målet och nästa
 * order tar vid. Bygg- och guard-order stannar inom räckhåll (`reach`) och
 * lämnas kvar åt byggsystemet. Fiender med `attackCore` följer flödesfältet
 * ruta för ruta tills de står intill kärnan, och stannar när de har ett mål att
 * skjuta på. Egna enheter går runt hinder med A* (se unitPath.js).
 */
export function movementSystem(world) {
  for (const e of world.entities) {
    if (e.kind !== 'unit') continue;
    e.prevX = e.x;
    e.prevZ = e.z;
    if (e.orders[0]?.type === 'attackCore' && e.targetId) continue; // står och skjuter

    let budget = e.speed * TICK_SECONDS;
    for (let steps = 0; budget > 0 && e.orders.length > 0 && steps < 8; steps++) {
      const order = e.orders[0];
      const dest = destination(world, e, order);
      if (!dest) {
        // Den assisterade eller målet är borta: nästa order (t.ex. tillbaka mot kärnan).
        if (order.type === 'guard' || order.type === 'attack') {
          e.orders.shift();
          continue;
        }
        break;
      }
      const goal = order.type === 'attackCore' ? dest : steer(world, e, order, dest);
      if (goal.stuck) {
        if (order.type === 'move') e.orders.shift(); // så nära som det går
        break;
      }

      const dx = goal.x - e.x;
      const dz = goal.z - e.z;
      const dist = Math.hypot(dx, dz);
      const remaining = dist - goal.reach;
      if (remaining <= 1e-9) break; // framme (bygg/guard: inom räckhåll)
      e.heading = Math.atan2(dx, dz);

      const step = Math.min(remaining, budget);
      e.x += (dx / dist) * step;
      e.z += (dz / dist) * step;
      budget -= step;

      if (step === remaining) {
        if (goal.waypoint || order.type === 'attackCore') {
          e.x = goal.x;
          e.z = goal.z;
          continue; // nästa vägpunkt / nästa ruta i flödesfältet
        }
        if (order.type !== 'move') break; // inom räckhåll, byggsystemet tar över
        e.x = order.x;
        e.z = order.z;
        e.orders.shift();
      }
    }
  }
}
