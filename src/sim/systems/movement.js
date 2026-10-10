import { TICK_SECONDS } from '../constants.js';
import { guardDestination } from '../guard.js';
import { flowTarget } from '../pathing.js';

/** Målpunkt och stoppavstånd för en order, eller null om ordern inte innebär förflyttning. */
function destination(world, e, order) {
  switch (order.type) {
    case 'move': return { x: order.x, z: order.z, reach: 0 };
    case 'build': return { x: order.x, z: order.z, reach: order.reach };
    case 'guard': return guardDestination(world, e, order);
    case 'attackCore': {
      const p = flowTarget(world, e.x, e.z);
      return p && { x: p.x, z: p.z, reach: 0 };
    }
    default: return null;
  }
}

/**
 * Enheter går rakt mot sin första order. En flyttorder är klar vid målet och
 * nästa order tar vid. Bygg- och guard-order stannar inom räckhåll (`reach`)
 * och lämnas kvar åt byggsystemet. Fiender med `attackCore` följer flödesfältet
 * ruta för ruta tills de står intill kärnan.
 */
export function movementSystem(world) {
  for (const e of world.entities) {
    if (e.kind !== 'unit') continue;
    e.prevX = e.x;
    e.prevZ = e.z;

    let budget = e.speed * TICK_SECONDS;
    for (let steps = 0; budget > 0 && e.orders.length > 0 && steps < 8; steps++) {
      const order = e.orders[0];
      const dest = destination(world, e, order);
      if (!dest) {
        if (order.type === 'guard') e.orders.shift(); // den assisterade är borta
        break;
      }

      const dx = dest.x - e.x;
      const dz = dest.z - e.z;
      const dist = Math.hypot(dx, dz);
      const remaining = dist - dest.reach;
      if (remaining <= 1e-9) break; // framme (bygg/guard: inom räckhåll)
      e.heading = Math.atan2(dx, dz);

      const step = Math.min(remaining, budget);
      e.x += (dx / dist) * step;
      e.z += (dz / dist) * step;
      budget -= step;

      if (step === remaining) {
        if (order.type === 'attackCore') continue; // nästa ruta i flödesfältet
        if (order.type !== 'move') break; // inom räckhåll, byggsystemet tar över
        e.x = order.x;
        e.z = order.z;
        e.orders.shift();
      }
    }
  }
}
