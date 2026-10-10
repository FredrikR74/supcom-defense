import { TICK_SECONDS } from '../constants.js';

/**
 * Enheter går rakt mot sin första order. En flyttorder är klar vid målet och
 * nästa order tar vid. En byggorder stannar inom räckhåll (`reach`) och
 * lämnas kvar åt byggsystemet.
 */
export function movementSystem(world) {
  for (const e of world.entities) {
    if (e.kind !== 'unit') continue;
    e.prevX = e.x;
    e.prevZ = e.z;

    let budget = e.speed * TICK_SECONDS;
    while (budget > 0 && e.orders.length > 0) {
      const order = e.orders[0];
      if (order.type !== 'move' && order.type !== 'build') break;

      const dx = order.x - e.x;
      const dz = order.z - e.z;
      const dist = Math.hypot(dx, dz);
      const remaining = dist - (order.type === 'build' ? order.reach : 0);
      if (remaining <= 1e-9) break; // framme (byggorder: inom räckhåll)
      e.heading = Math.atan2(dx, dz);

      const step = Math.min(remaining, budget);
      e.x += (dx / dist) * step;
      e.z += (dz / dist) * step;
      budget -= step;

      if (step === remaining) {
        if (order.type !== 'move') break; // inom räckhåll, byggsystemet tar över
        e.x = order.x;
        e.z = order.z;
        e.orders.shift();
      }
    }
  }
}
