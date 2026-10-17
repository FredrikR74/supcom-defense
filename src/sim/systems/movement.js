import { TICK_SECONDS } from '../constants.js';
import { guardDestination } from '../guard.js';
import { flowTarget, cellIndex, isBlockedCell } from '../pathing.js';
import { steer, PATH_BUDGET_PER_TICK } from '../unitPath.js';
import { getEntity, needsRepair, weaponOf } from '../entities.js';
import units from '../../data/units.js';
import { orderLineOfFire } from './combat.js';
import { createSpatialHash } from '../spatialHash.js';

/** Kroppen vrider sig högst så här fort (radianer per sekund), så att enheter inte rycker. */
export const BODY_TURN_RATE = Math.PI;
/** En trupmedlem närmare sin plats än så här pekar åt truppens håll, inte åt sitt lilla korrigeringssteg. */
const FACING_NEAR = 1;

/** Två enheter i rörelse kommer inte närmare varandra än så här (andel av summan av radierna). */
const COLLIDE = 0.95;
/** Under så här stor andel av steget i sidled räknas ett möte som rakt mot varandra. */
const HEAD_ON = 0.3;
/** Så många gånger provar en enhet att väja innan den står kvar detta tick. */
const AVOID_TRIES = 3;
/** Har en enhet inte kommit förbi på så här många tick kör den igenom ändå, så att inget låser sig. */
const MAX_BLOCKED_TICKS = 10;

/** Den enhet i vägen som ett steg till (nx, nz) tar en för nära, eller null. */
function blocker(hash, maxRadius, e, nx, nz, step) {
  for (const o of hash.queryRadius(nx, nz, e.radius + maxRadius + step)) {
    if (o === e || !o.moving) continue;
    const min = (e.radius + o.radius) * COLLIDE;
    const before = Math.hypot(e.x - o.x, e.z - o.z);
    const after = Math.hypot(nx - o.x, nz - o.z);
    // Bara steg som tar en närmare än tillåtet; den som redan överlappar får glida isär.
    if (after < min && after < before && before > 1e-6) return { o, min, before };
  }
  return null;
}

/**
 * Som i FA kör enheter inte igenom varandra: ett steg från (e.x, e.z) mot
 * (nx, nz) som skulle ta enheten in i en annan som också är på väg någonstans
 * glider i stället runt den, åt det håll steget redan lutar. Möts två rakt mot
 * varandra väjer båda åt höger. Stillastående enheter går man förbi; de glider
 * undan (se separation.js), så att egna ingenjörer inte står i vägen för ACU:n.
 * Returnerar null om steget är fritt, den nya punkten om enheten väjer, eller
 * { blocked: true } om det inte går att komma förbi just nu.
 */
function avoid(world, hash, maxRadius, e, nx, nz) {
  const step = Math.hypot(nx - e.x, nz - e.z);
  if (step < 1e-9) return null;
  const fx = (nx - e.x) / step;
  const fz = (nz - e.z) / step;
  let hit = blocker(hash, maxRadius, e, nx, nz, step);
  if (!hit) return null;
  for (let tries = 0; hit && tries < AVOID_TRIES; tries++) {
    const { o, min, before } = hit;
    // Glid längs cirkeln runt den andra, åt det håll steget lutar (annars åt höger).
    const ux = (e.x - o.x) / before;
    const uz = (e.z - o.z) / before;
    let tx = -uz;
    let tz = ux;
    const lean = tx * fx + tz * fz;
    if (Math.abs(lean) < HEAD_ON ? tx * fz - tz * fx < 0 : lean < 0) {
      tx = -tx;
      tz = -tz;
    }
    const r = Math.max(min, before);
    const px = e.x + tx * step;
    const pz = e.z + tz * step;
    const d = Math.hypot(px - o.x, pz - o.z);
    nx = o.x + ((px - o.x) / d) * r;
    nz = o.z + ((pz - o.z) / d) * r;
    hit = blocker(hash, maxRadius, e, nx, nz, step);
  }
  const size = world.terrain?.size ?? Infinity;
  const open = nx >= 0 && nz >= 0 && nx < size && nz < size &&
    !(world.terrain && isBlockedCell(world, cellIndex(world, nx, nz)));
  return hit || !open ? { blocked: true } : { x: nx, z: nz };
}

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
  const movers = world.entities.filter((u) => u.kind === 'unit');
  const maxRadius = Math.max(0, ...movers.map((u) => u.radius));
  // Positionerna i rutnätet är från början av ticket; frågan tar med en marginal för det.
  const hash = createSpatialHash(2);
  for (const u of movers) hash.insert(u);
  for (const e of world.entities) {
    if (e.kind !== 'unit') continue;
    e.prevX = e.x;
    e.prevZ = e.z;
    // Rör sig enheten av egen kraft detta tick (inte bara knuffad)? Se avoid.
    e.moving = false;
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
      e.moving = true;
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
      const slid = (e.blockedTicks ?? 0) < MAX_BLOCKED_TICKS &&
        avoid(world, hash, maxRadius + 1, e, e.x + (dx / dist) * step, e.z + (dz / dist) * step);
      if (slid) {
        // Väjer runt någon, eller väntar på att komma förbi: resten av ticket står enheten där.
        e.moving = true;
        if (slid.blocked) {
          e.blockedTicks = (e.blockedTicks ?? 0) + 1;
          break;
        }
        e.blockedTicks = 0;
        want = Math.atan2(slid.x - e.x, slid.z - e.z);
        e.x = slid.x;
        e.z = slid.z;
        break;
      }
      e.blockedTicks = 0;
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
    e.moving ||= e.x !== e.prevX || e.z !== e.prevZ;
  }
}
