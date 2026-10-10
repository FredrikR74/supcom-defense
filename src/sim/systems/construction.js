import { TICK_SECONDS } from '../constants.js';
import { addStructure, addUnit, getEntity } from '../entities.js';
import { canPlace, footprint } from '../placement.js';
import { isBlockedCell } from '../pathing.js';
import { guardDestination } from '../guard.js';
import structures from '../../data/structures.js';
import units from '../../data/units.js';

/** Byggnaden räknas som klar när progress når hit (tål flyttalsavrundning). */
const DONE = 1 - 1e-9;

/** Hur stor del av en byggnad/enhet som byggs per sekund vid full ekonomi. */
export function buildRate(buildPower, buildTime) {
  return buildPower / buildTime;
}

/**
 * Sätter ett byggjobb. `job.kind`:
 * - 'structure': bygger byggnaden `job.targetId`
 * - 'unit': fabriken bygger själv enheten `job.type`
 * - 'factoryAssist': hjälper fabriken `job.targetId` med dess enhet
 */
function setJob(e, job, def, power) {
  const rate = buildRate(power, def.buildTime);
  e.buildJob = job;
  e.buildRate = rate;
  e.demand = { mass: def.cost.mass * rate, energy: def.cost.energy * rate };
}

const inReach = (e, x, z, reach) => Math.hypot(x - e.x, z - e.z) <= reach + 1e-6;

function findUnfinished(world, type, x, z, owner) {
  return world.entities.find((e) =>
    e.kind === 'structure' && !e.built && e.type === type && e.x === x && e.z === z && e.owner === owner) ?? null;
}

/** Närmaste ruta (mittpunkt) som inte är blockerad, sökt i växande ringar runt (x, z). */
function nearestFreeSpot(world, x, z) {
  const n = world.terrain.size;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  for (let r = 1; r < 12; r++) {
    let best = null;
    let bestDist = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n || isBlockedCell(world, nz * n + nx)) continue;
        const d = Math.hypot(nx + 0.5 - x, nz + 0.5 - z);
        if (d < bestDist) {
          best = { x: nx + 0.5, z: nz + 0.5 };
          bestDist = d;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Egna enheter som står på en ny byggplats flyttar sig till närmaste lediga
 * ruta och fortsätter sedan med det de höll på med, som i FA.
 */
function clearBuildSite(world, structure) {
  const { cx, cz, size } = footprint(structure.type, structure.x, structure.z);
  for (const u of world.entities) {
    if (u.kind !== 'unit' || u.owner !== structure.owner) continue;
    if (u.x < cx || u.x > cx + size || u.z < cz || u.z > cz + size) continue;
    const spot = nearestFreeSpot(world, u.x, u.z);
    if (spot) u.orders.unshift({ type: 'move', x: spot.x, z: spot.z });
  }
}

function startBuildOrder(world, e, order) {
  let target = order.targetId ? getEntity(world, order.targetId) : null;
  if (order.targetId && (!target || target.built)) {
    e.orders.shift(); // klar eller försvunnen
    return;
  }
  if (!inReach(e, order.x, order.z, order.reach)) return; // går dit

  if (!target) {
    target = findUnfinished(world, order.structure, order.x, order.z, e.owner);
    if (!target) {
      if (!canPlace(world, order.structure, order.x, order.z).ok) {
        e.orders.shift();
        return;
      }
      target = addStructure(world, order.structure, {
        x: order.x,
        z: order.z,
        owner: e.owner,
        built: false,
      });
      clearBuildSite(world, target);
    }
    order.targetId = target.id;
  }
  setJob(e, { kind: 'structure', targetId: target.id }, structures[target.type], units[e.type].buildPower);
}

/** Assistera en annan byggare (hjälp med dess bygge) eller en fabrik (hjälp med dess enhet). */
function startGuardOrder(world, e, order) {
  const dest = guardDestination(world, e, order);
  if (!dest || !inReach(e, dest.x, dest.z, dest.reach)) return;
  const power = units[e.type].buildPower;

  if (dest.site && !dest.site.built) {
    setJob(e, { kind: 'structure', targetId: dest.site.id }, structures[dest.site.type], power);
  } else if (dest.target.buildJob?.kind === 'unit') {
    const type = dest.target.buildJob.type;
    setJob(e, { kind: 'factoryAssist', targetId: dest.target.id }, units[type], power);
  }
}

function startProductionJob(e) {
  if (!e.built || !e.productionQueue?.length) return;
  const type = e.productionQueue[0];
  setJob(e, { kind: 'unit', type, targetId: e.id }, units[type], structures[e.type].buildPower);
}

/**
 * Del 1, före ekonomin: varje byggare som är redo får ett jobb och en efterfrågan.
 * Assisterande enheter tar sitt jobb efter de andra, så att de ser vad den
 * assisterade gör just detta tick.
 */
export function constructionDemand(world) {
  const guards = [];
  for (const e of [...world.entities]) {
    e.buildJob = null;
    e.demand = null;
    if (e.kind === 'structure') startProductionJob(e);
    else if (e.kind !== 'unit') continue;
    else if (e.orders[0]?.type === 'build') startBuildOrder(world, e, e.orders[0]);
    else if (e.orders[0]?.type === 'guard') guards.push(e);
  }
  for (const e of guards) startGuardOrder(world, e, e.orders[0]);
}

function spawnProduced(world, factory, type) {
  const def = structures[factory.type];
  // Sprid ut nya enheter på fem platser framför fabriken.
  factory.producedCount = (factory.producedCount ?? 0) + 1;
  const n = factory.producedCount % 5;
  const exitZ = factory.z + def.size / 2 + 1;
  const unit = addUnit(world, type, { x: factory.x, z: exitZ, owner: factory.owner });
  if (factory.rallyPoints.length > 0) {
    for (const p of factory.rallyPoints) unit.orders.push({ type: 'move', x: p.x, z: p.z });
  } else {
    // Gå en bit ut från fabriken så att nästa enhet får plats.
    unit.orders.push({ type: 'move', x: factory.x + (n - 2) * 1.5, z: exitZ + 3 });
  }
  if (factory.repeat) factory.productionQueue.push(type);
}

/**
 * Del 2, efter ekonomin: framsteg = byggtakt × effektivitet.
 */
export function constructionProgress(world) {
  for (const e of world.entities) {
    if (!e.buildJob) continue;
    const delta = e.buildRate * TICK_SECONDS * (e.efficiency ?? 1);
    const target = getEntity(world, e.buildJob.targetId);
    if (!target) continue;

    if (e.buildJob.kind === 'structure') {
      if (target.built) continue;
      target.progress = Math.min(1, target.progress + delta);
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * delta);
      if (target.progress >= DONE) {
        target.progress = 1;
        target.built = true;
      }
    } else {
      target.productionProgress += delta;
    }
  }

  // Fabriker vars enhet blivit klar (av egen kraft och/eller med assist).
  for (const e of [...world.entities]) {
    if (e.productionQueue?.length && e.productionProgress >= DONE) {
      e.productionProgress = 0;
      spawnProduced(world, e, e.productionQueue.shift());
    }
  }
}
