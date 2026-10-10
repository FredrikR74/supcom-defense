import { TICK_SECONDS } from '../constants.js';

/** Enheter med en flyttorder går rakt mot målet. Framme: nästa order i kön. */
export function movementSystem(world) {
  for (const e of world.entities) {
    if (e.kind !== 'unit') continue;
    e.prevX = e.x;
    e.prevZ = e.z;

    let budget = e.speed * TICK_SECONDS;
    while (budget > 0 && e.orders[0]?.type === 'move') {
      const order = e.orders[0];
      const dx = order.x - e.x;
      const dz = order.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0) e.heading = Math.atan2(dx, dz);

      if (dist <= budget) {
        e.x = order.x;
        e.z = order.z;
        budget -= dist;
        e.orders.shift();
      } else {
        e.x += (dx / dist) * budget;
        e.z += (dz / dist) * budget;
        budget = 0;
      }
    }
  }
}
