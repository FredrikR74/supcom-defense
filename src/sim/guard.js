import { getEntity, needsRepair, weaponOf } from './entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';
import { isDetected } from './intel.js';
import { cellIndex, isBlockedCell } from './pathing.js';

/** Hur långt utanför den assisterades kant den innersta ringen av eskorter står. */
const SLOT_GAP = 1.5;
/** Mellanrum mellan två eskorter i ringarna, utöver deras storlek. */
const SLOT_SPACING = 0.8;
/** Hur nära sin plats i ringen en eskort behöver komma. */
const SLOT_REACH = 0.3;
/** Fler ringar än så letas inte (t.ex. inträngd mellan byggnader). */
const MAX_RINGS = 12;
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
 * - byggare hjälper till med det den bygger, producerar eller uppgraderar (enhetens
 *   uppgraderingar och byggnaders uppgradering till nästa tech-nivå), och reparerar
 *   den när den är skadad
 * - beväpnade anfaller fiender som kommer nära den (se updateGuardEngagement)
 *
 * Returnerar vart enheten ska gå och vad den ska göra där:
 * { x, z, reach, target, mode, site } där mode är 'build', 'factory', 'upgrade', 'enhance', 'repair',
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
  if (builder && target.buildJob?.kind === 'upgrade' && target.upgrade) {
    return { x: target.x, z: target.z, reach: range + target.radius, target, site: null, mode: 'upgrade' };
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
  const slot = guardSlot(world, unit, target);
  return { x: target.x + slot.dx, z: target.z + slot.dz, reach: SLOT_REACH, target, site: null, mode: 'follow' };
}

/**
 * Var runt den assisterade `unit` ska stå: som i FA sprider sig eskorterna i
 * ringar runt den i stället för att trängas intill den. Platserna delas ut på
 * nytt bara när gruppen av eskorter ändras (en tillkommer, går eller dör) eller
 * när den assisterade flyttat sig så att en plats hamnat i en byggnad eller
 * brant terräng, och då får var och en den lediga plats som ligger närmast.
 */
function guardSlot(world, unit, target) {
  if (world.guardSlots?.tick !== world.tick) updateGuardSlots(world);
  return world.guardSlots.groups.get(target.id)?.slots.get(unit.id) ?? { dx: 0, dz: 0 };
}

function updateGuardSlots(world) {
  const previous = world.guardSlots?.groups ?? new Map();
  const members = new Map();
  for (const e of world.entities) {
    const order = e.kind === 'unit' ? e.orders[0] : null;
    if (order?.type !== 'guard') continue;
    if (!members.has(order.targetId)) members.set(order.targetId, []);
    members.get(order.targetId).push(e);
  }
  const groups = new Map();
  for (const [targetId, guards] of members) {
    const target = getEntity(world, targetId);
    if (!target) continue;
    const key = guards.map((g) => g.id).join(',');
    const old = previous.get(targetId);
    groups.set(targetId, old?.key === key && slotsStillOpen(world, target, old) ? old : assignSlots(world, target, guards, key));
  }
  world.guardSlots = { tick: world.tick, groups };
}

/** Står alla platser i `group` fortfarande fritt där den assisterade är nu? */
function slotsStillOpen(world, target, group) {
  if (Math.hypot(target.x - group.x, target.z - group.z) < 0.25) return true;
  group.x = target.x;
  group.z = target.z;
  for (const o of group.slots.values()) {
    if (!openSpot(world, target.x + o.dx, target.z + o.dz, group.r)) return false;
  }
  return true;
}

/** Får en eskort med radien `r` plats där (inte i en byggnad, brant terräng eller utanför kartan)? */
function openSpot(world, x, z, r) {
  if (!world.terrain) return true;
  const n = world.terrain.size;
  return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([ox, oz]) => {
    const px = x + ox;
    const pz = z + oz;
    return px >= 0 && pz >= 0 && px < n && pz < n && !isBlockedCell(world, cellIndex(world, px, pz));
  });
}

/**
 * Ringar av platser runt `target`, den innersta först, och närmaste eskort till
 * varje plats. Platser i en byggnad eller i brant terräng hoppas över.
 */
function assignSlots(world, target, guards, key) {
  const spacing = 2 * Math.max(...guards.map((g) => g.radius)) + SLOT_SPACING;
  const fit = spacing / 2;
  const offsets = [];
  for (let ring = 0; offsets.length < guards.length && ring < MAX_RINGS; ring++) {
    const r = target.radius + SLOT_GAP + spacing / 2 + ring * spacing;
    const fits = Math.max(1, Math.floor((2 * Math.PI * r) / spacing));
    // Den yttersta ringen fylls jämnt runt om, inte bara på ena sidan.
    const count = Math.min(fits, guards.length - offsets.length);
    // Varannan ring förskjuten, så att den yttre ringens enheter ser mellan den inres.
    const start = ring % 2 ? Math.PI / count : 0;
    for (let i = 0; i < count; i++) {
      const a = start + (i / count) * Math.PI * 2;
      const dx = Math.sin(a) * r;
      const dz = Math.cos(a) * r;
      if (openSpot(world, target.x + dx, target.z + dz, fit)) offsets.push({ dx, dz });
    }
  }
  while (offsets.length < guards.length) offsets.push({ dx: 0, dz: 0 }); // allt runt om blockerat
  const free = [...guards];
  const slots = new Map();
  for (const o of offsets) {
    let best = 0;
    let bestDist = Infinity;
    free.forEach((g, i) => {
      const d = Math.hypot(target.x + o.dx - g.x, target.z + o.dz - g.z);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    slots.set(free[best].id, o);
    free.splice(best, 1);
  }
  return { key, x: target.x, z: target.z, r: fit, slots };
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
    if (current && current.hp > 0 && isDetected(e.owner, current) && !tooFar(current)) continue;
    order.engageId = null;

    const theirs = target.targetId != null ? getEntity(world, target.targetId) : null;
    if (theirs && theirs.hp > 0 && areEnemies(e, theirs) && !tooFar(theirs)) {
      order.engageId = theirs.id;
      continue;
    }
    let best = null;
    let bestDist = scan;
    for (const t of world.entities) {
      if ((t.kind !== 'unit' && t.kind !== 'structure') || !areEnemies(e, t) || t.hp <= 0 || !isDetected(e.owner, t)) continue;
      const d = Math.hypot(t.x - target.x, t.z - target.z) - t.radius;
      if (d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    order.engageId = best?.id ?? null;
  }
}
