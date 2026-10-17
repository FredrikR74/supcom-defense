import { createSpatialHash } from '../spatialHash.js';
import { cellIndex, isBlockedCell } from '../pathing.js';

/** Hur stor del av överlappet som rättas per tick (mjuk knuff i stället för hopp). */
const PUSH = 0.25;
/** En stillastående enhet som någon kör förbi glider undan fortare. */
const YIELD = 0.6;
/** Enheter får överlappa lite innan de knuffas. */
const SPACING = 0.9;

/**
 * Enheter som står för nära varandra knuffas isär, men aldrig in i en byggnad
 * eller brant terräng. Står två på exakt samma punkt avgör deras id riktningen.
 *
 * En enhet som rör sig (har flyttat sig detta tick) knuffas aldrig: den går
 * förbi, och en stillastående enhet i vägen glider undan. Två som rör sig
 * passerar varandra. Så står egna ingenjörer inte i vägen för ACU:n.
 */
export function separationSystem(world) {
  const units = world.entities.filter((e) => e.kind === 'unit');
  if (units.length < 2) return;

  const maxRadius = Math.max(...units.map((u) => u.radius));
  const hash = createSpatialHash(2);
  for (const u of units) hash.insert(u);

  const push = new Map();
  for (const a of units) {
    for (const b of hash.queryRadius(a.x, a.z, a.radius + maxRadius)) {
      if (b.id <= a.id) continue;
      const min = (a.radius + b.radius) * SPACING;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-6) {
        const angle = (a.id * 2.399 + b.id) % (Math.PI * 2);
        dx = Math.cos(angle);
        dz = Math.sin(angle);
        d = 1;
      }
      const aMoving = a.x !== a.prevX || a.z !== a.prevZ;
      const bMoving = b.x !== b.prevX || b.z !== b.prevZ;
      if (aMoving && bMoving) continue;
      // Andel av knuffen som a respektive b tar.
      const shareA = aMoving ? 0 : bMoving ? 1 : 0.5;
      const amount = (min - Math.hypot(b.x - a.x, b.z - a.z)) * (aMoving || bMoving ? YIELD : PUSH);
      const px = (dx / d) * amount;
      const pz = (dz / d) * amount;
      const pa = push.get(a) ?? { x: 0, z: 0 };
      const pb = push.get(b) ?? { x: 0, z: 0 };
      push.set(a, { x: pa.x - px * shareA, z: pa.z - pz * shareA });
      push.set(b, { x: pb.x + px * (1 - shareA), z: pb.z + pz * (1 - shareA) });
    }
  }

  const size = world.terrain?.size ?? Infinity;
  for (const [u, p] of push) {
    const x = Math.min(Math.max(u.x + p.x, 0), size);
    const z = Math.min(Math.max(u.z + p.z, 0), size);
    if (world.terrain && isBlockedCell(world, cellIndex(world, x, z))) continue;
    u.x = x;
    u.z = z;
  }
}
