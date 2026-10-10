import { createSpatialHash } from '../spatialHash.js';
import { cellIndex, isBlockedCell } from '../pathing.js';

/** Hur stor del av överlappet som rättas per tick (mjuk knuff i stället för hopp). */
const PUSH = 0.25;
/** Enheter får överlappa lite innan de knuffas. */
const SPACING = 0.9;

/**
 * Enheter som står för nära varandra knuffas isär, men aldrig in i en byggnad
 * eller brant terräng. Står två på exakt samma punkt avgör deras id riktningen.
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
      const amount = ((min - Math.hypot(b.x - a.x, b.z - a.z)) * PUSH) / 2;
      const px = (dx / d) * amount;
      const pz = (dz / d) * amount;
      const pa = push.get(a) ?? { x: 0, z: 0 };
      const pb = push.get(b) ?? { x: 0, z: 0 };
      push.set(a, { x: pa.x - px, z: pa.z - pz });
      push.set(b, { x: pb.x + px, z: pb.z + pz });
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
