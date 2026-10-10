import { getHeight } from './terrain.js';
import structures from '../data/structures.js';

/** Största höjdskillnad inom ett fotavtryck som går att bygga på. */
export const MAX_BUILD_SLOPE = 1.5;
/** Inom detta avstånd fäster utvinnare mot närmaste massfyndighet. */
export const DEPOSIT_SNAP_DISTANCE = 4;

/**
 * Fotavtryck för en byggnad med mittpunkt (x, z): rutorna
 * [cx, cx + size) × [cz, cz + size).
 */
export function footprint(type, x, z) {
  const { size } = structures[type];
  return { cx: x - size / 2, cz: z - size / 2, size };
}

/** Fäster en musposition mot rutnätet (eller mot en fyndighet för utvinnare). */
export function snapBuildPosition(world, type, px, pz) {
  const def = structures[type];
  if (def.requiresDeposit) {
    let best = null;
    let bestDist = DEPOSIT_SNAP_DISTANCE;
    for (const d of world.map.massDeposits) {
      const dist = Math.hypot(d.x - px, d.z - pz);
      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    if (best) return { x: best.x, z: best.z };
  }
  const cx = Math.round(px - def.size / 2);
  const cz = Math.round(pz - def.size / 2);
  return { x: cx + def.size / 2, z: cz + def.size / 2 };
}

const fail = (reason) => ({ ok: false, reason });

/** Kan `type` byggas med mittpunkt (x, z)? Returnerar { ok, reason }. */
export function canPlace(world, type, x, z) {
  const def = structures[type];
  if (!def) return fail('okänd byggnad');
  const { terrain, occupancy, map } = world;
  const { cx, cz, size } = footprint(type, x, z);

  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return fail('utanför rutnätet');
  if (cx < 0 || cz < 0 || cx + size > terrain.size || cz + size > terrain.size) {
    return fail('utanför kartan');
  }

  for (let z0 = cz; z0 < cz + size; z0++) {
    for (let x0 = cx; x0 < cx + size; x0++) {
      if (occupancy[z0 * terrain.size + x0]) return fail('upptaget');
    }
  }

  let min = Infinity;
  let max = -Infinity;
  for (let z0 = cz; z0 <= cz + size; z0++) {
    for (let x0 = cx; x0 <= cx + size; x0++) {
      const h = getHeight(terrain, x0, z0);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
  }
  if (max - min > MAX_BUILD_SLOPE) return fail('för brant');

  if (def.requiresDeposit) {
    if (!map.massDeposits.some((d) => d.x === x && d.z === z)) return fail('kräver massfyndighet');
  } else {
    // En fyndighet upptar de 2×2 rutorna runt sin punkt.
    const covers = map.massDeposits.some((d) =>
      cx < d.x + 1 && cx + size > d.x - 1 && cz < d.z + 1 && cz + size > d.z - 1);
    if (covers) return fail('täcker massfyndighet');
  }

  return { ok: true };
}

/** Sätter (eller nollställer med value = 0) beläggningen för en byggnads rutor. */
export function markOccupancy(world, entity, value) {
  if (!world.occupancy) return;
  const { cx, cz, size } = footprint(entity.type, entity.x, entity.z);
  const n = world.terrain.size;
  for (let z0 = Math.max(0, cz); z0 < Math.min(n, cz + size); z0++) {
    for (let x0 = Math.max(0, cx); x0 < Math.min(n, cx + size); x0++) {
      world.occupancy[z0 * n + x0] = value;
    }
  }
}
