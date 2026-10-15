import { TICK_SECONDS } from '../constants.js';
import { addStructure, addUnit, getEntity, removeEntity, needsRepair, getDef } from '../entities.js';
import { canPlace, footprint } from '../placement.js';
import { isBlockedCell } from '../pathing.js';
import { guardDestination } from '../guard.js';
import structures from '../../data/structures.js';
import units from '../../data/units.js';
import enhancements from '../../data/enhancements.js';
import { applyEnhancement, hasEnhancement } from '../enhancements.js';
import { completeUpgrade } from '../upgrades.js';

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
 * - 'enhance': bygger uppgraderingen `job.enhancement` på enheten `job.targetId`
 *   (sig själv, eller den den assisterar)
 * - 'upgrade': bygger byggnaden `job.targetId`s uppgradering till `job.type`
 *   (byggnaden själv, eller en ingenjör som assisterar den), se upgrades.js
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

/**
 * Assist (guard) för byggare: hjälp den assisterade med dess bygge, hjälp en
 * fabrik med dess enhet, eller reparera den assisterade när den är skadad.
 */
function startGuardOrder(world, e, order) {
  const power = units[e.type].buildPower;
  if (!(power > 0)) return;
  const dest = guardDestination(world, e, order);
  if (!dest || !inReach(e, dest.x, dest.z, dest.reach)) return;

  if (dest.mode === 'build' && !dest.site.built) {
    setJob(e, { kind: 'structure', targetId: dest.site.id }, structures[dest.site.type], power);
  } else if (dest.mode === 'factory') {
    const type = dest.target.buildJob.type;
    setJob(e, { kind: 'factoryAssist', targetId: dest.target.id }, units[type], power);
  } else if (dest.mode === 'upgrade') {
    const type = dest.target.upgrade.to;
    setJob(e, { kind: 'upgrade', targetId: dest.target.id, type }, structures[type], power);
  } else if (dest.mode === 'enhance') {
    const key = dest.target.buildJob.enhancement;
    setJob(e, { kind: 'enhance', targetId: dest.target.id, enhancement: key }, enhancements[key], power);
  } else if (dest.mode === 'repair') {
    setRepairJob(world, e, dest.target);
  }
}

/** Reparationsjobb på `target` (se startRepairOrder). */
function setRepairJob(world, e, target) {
  setJob(e, { kind: 'repair', targetId: target.id }, getDef(target.type), units[e.type].buildPower);
  const mult = world.config.repairCostMult;
  e.demand = { mass: e.demand.mass * mult, energy: e.demand.energy * mult };
}

/** ACU:n bygger en uppgradering på sig själv; en redan installerad hoppas över. */
function startEnhanceOrder(e, order) {
  if (hasEnhancement(e, order.enhancement)) {
    e.orders.shift();
    return;
  }
  setJob(e, { kind: 'enhance', targetId: e.id, enhancement: order.enhancement },
    enhancements[order.enhancement], units[e.type].buildPower);
}

/** En byggnad som uppgraderas bygger uppgraderingen i stället för enheter. */
function startUpgradeJob(e) {
  if (!e.built || e.paused) return;
  const type = e.upgrade.to;
  setJob(e, { kind: 'upgrade', targetId: e.id, type }, structures[type], structures[e.type].buildPower);
}

function startProductionJob(e) {
  if (!e.built || e.paused || !e.productionQueue?.length) return;
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
    if (e.kind === 'structure') {
      if (e.upgrade) startUpgradeJob(e);
      else startProductionJob(e);
      continue;
    }
    if (e.kind !== 'unit') continue;
    if (e.orders[0]?.type === 'patrol') patrolScan(world, e);
    const order = e.orders[0];
    if (order?.type === 'build') startBuildOrder(world, e, order);
    else if (order?.type === 'guard') guards.push(e);
    else if (order?.type === 'repair') startRepairOrder(world, e, order);
    else if (order?.type === 'reclaim') startReclaimOrder(world, e, order);
    else if (order?.type === 'enhance') startEnhanceOrder(e, order);
  }
  for (const e of guards) startGuardOrder(world, e, e.orders[0]);
}

/** Räckvidd för att reparera/återvinna `target` (byggräckvidd + målets radie). */
export function workReach(e, target) {
  return (units[e.type].buildRange ?? 0) + target.radius;
}

/**
 * Reparation som i FA-motorn: HP återställs i samma takt som byggnaden byggs
 * (byggkraft / byggtid av max-HP per sekund) och kostar som att bygga den delen.
 */
function startRepairOrder(world, e, order) {
  const target = getEntity(world, order.targetId);
  if (!target || !needsRepair(target)) {
    e.orders.shift();
    return;
  }
  if (!inReach(e, target.x, target.z, workReach(e, target))) return;
  setRepairJob(world, e, target);
}

/**
 * Återvinning som i FAF (Prop.GetReclaimCosts): tiden är massan / (byggkraft × 10)
 * sekunder, alltså byggkraft × 10 mass per sekund. Kostar inget.
 */
function startReclaimOrder(world, e, order) {
  const wreck = getEntity(world, order.targetId);
  if (!wreck || wreck.kind !== 'wreck') {
    e.orders.shift();
    return;
  }
  if (!inReach(e, wreck.x, wreck.z, workReach(e, wreck))) return;
  e.buildJob = { kind: 'reclaim', targetId: wreck.id };
  e.buildRate = units[e.type].buildPower * 10;
}

/** Hur långt en patrullerande byggare letar efter något att reparera eller återvinna. */
const PATROL_SCAN_EXTRA = 8;

/**
 * Patrullerande byggare tar närmaste skadade egna byggnad (inte enheter) eller
 * vrak på vägen. En beväpnad byggare (ACU:n) som har en fiende att skjuta på
 * strider först (se patrolEngageSystem i combat.js).
 */
function patrolScan(world, e) {
  if (!(units[e.type].buildPower > 0) || e.targetId) return;
  const radius = units[e.type].buildRange + PATROL_SCAN_EXTRA;
  let best = null;
  let bestDist = radius;
  for (const t of world.entities) {
    if (t === e) continue;
    const repair = t.owner === e.owner && t.kind === 'structure' && needsRepair(t);
    if (!repair && t.kind !== 'wreck') continue;
    const d = Math.hypot(t.x - e.x, t.z - e.z) - t.radius;
    if (d < bestDist) {
      best = { type: repair ? 'repair' : 'reclaim', targetId: t.id, fromPatrol: true };
      bestDist = d;
    }
  }
  if (best) e.orders.unshift(best);
}

/** Kan en enhet stå på (x, z): inom kartan och inte i en byggnad eller brant? */
function standable(world, x, z) {
  const n = world.terrain.size;
  if (x < 0.5 || z < 0.5 || x > n - 0.5 || z > n - 0.5) return false;
  return !isBlockedCell(world, Math.floor(z) * n + Math.floor(x));
}

/** Sidorna en fabrik kan släppa ut enheter åt, i den ordning de prövas (söder först). */
const EXIT_SIDES = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/**
 * Var en ny enhet kommer ut och vilken riktning den går ut åt: söder om
 * fabriken, eller nästa fria sida om söder är utanför kartan eller blockerad
 * (t.ex. en fabrik längst ner på kartan eller intill en annan byggnad).
 */
function factoryExit(world, factory) {
  const half = structures[factory.type].size / 2;
  for (const [dx, dz] of EXIT_SIDES) {
    const x = factory.x + dx * (half + 1);
    const z = factory.z + dz * (half + 1);
    if (standable(world, x, z)) return { x, z, dx, dz };
  }
  const spot = nearestFreeSpot(world, factory.x, factory.z + half + 1);
  return spot ? { ...spot, dx: 0, dz: 1 } : { x: factory.x, z: factory.z + half + 1, dx: 0, dz: 1 };
}

function spawnProduced(world, factory, type) {
  // Sprid ut nya enheter på fem platser framför fabrikens utgång.
  factory.producedCount = (factory.producedCount ?? 0) + 1;
  const n = factory.producedCount % 5;
  const exit = factoryExit(world, factory);
  const unit = addUnit(world, type, { x: exit.x, z: exit.z, owner: factory.owner });
  world.events.push({ type: 'unitReady', owner: factory.owner, unit: type, x: unit.x, z: unit.z });
  if (factory.rallyPoints.length > 0) {
    for (const p of factory.rallyPoints) unit.orders.push({ type: 'move', x: p.x, z: p.z });
  } else {
    // Gå en bit ut från fabriken så att nästa enhet får plats; tvärs över
    // utgången sprids de ut, och en blockerad plats byts mot närmaste fria.
    const side = (n - 2) * 1.5;
    let x = exit.x + exit.dx * 3 + exit.dz * side;
    let z = exit.z + exit.dz * 3 + exit.dx * side;
    if (!standable(world, x, z)) ({ x, z } = nearestFreeSpot(world, x, z) ?? exit);
    unit.orders.push({ type: 'move', x, z });
  }
  if (factory.repeat) factory.productionQueue.push(type);
}

/**
 * Del 2, efter ekonomin: framsteg = byggtakt × effektivitet.
 */
export function constructionProgress(world) {
  for (const e of world.entities) {
    if (!e.buildJob) continue;
    const target = getEntity(world, e.buildJob.targetId);
    if (!target) continue;

    if (e.buildJob.kind === 'reclaim') {
      const amount = Math.min(e.buildRate * TICK_SECONDS, target.mass);
      target.mass -= amount;
      const economy = world.players[e.owner]?.economy;
      if (economy) economy.mass.stored = Math.min(economy.mass.max, economy.mass.stored + amount);
      if (target.mass <= 1e-6) removeEntity(world, target.id);
      continue;
    }

    const delta = e.buildRate * TICK_SECONDS * (e.efficiency ?? 1);
    if (e.buildJob.kind === 'repair') {
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * delta);
      continue;
    }

    if (e.buildJob.kind === 'structure') {
      if (target.built) continue;
      target.progress = Math.min(1, target.progress + delta);
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * delta);
      if (target.progress >= DONE) {
        target.progress = 1;
        target.built = true;
        world.events.push({ type: 'built', owner: target.owner, structure: target.type, x: target.x, z: target.z });
      }
    } else if (e.buildJob.kind === 'upgrade') {
      if (target.upgrade?.to === e.buildJob.type) target.upgrade.progress += delta;
    } else if (e.buildJob.kind === 'enhance') {
      const order = target.orders[0];
      if (order?.type === 'enhance' && order.enhancement === e.buildJob.enhancement) order.progress += delta;
    } else {
      target.productionProgress += delta;
    }
  }

  // Enheter vars uppgradering blivit klar.
  for (const e of world.entities) {
    const order = e.kind === 'unit' ? e.orders[0] : null;
    if (order?.type !== 'enhance' || order.progress < DONE) continue;
    e.orders.shift();
    applyEnhancement(e, order.enhancement);
    world.events.push({ type: 'enhanced', owner: e.owner, enhancement: order.enhancement, x: e.x, z: e.z });
  }

  // Byggnader vars uppgradering blivit klar.
  for (const e of world.entities) {
    if (e.upgrade && e.upgrade.progress >= DONE) completeUpgrade(world, e);
  }

  // Fabriker vars enhet blivit klar (av egen kraft och/eller med assist).
  for (const e of [...world.entities]) {
    if (e.productionQueue?.length && e.productionProgress >= DONE) {
      e.productionProgress = 0;
      spawnProduced(world, e, e.productionQueue.shift());
    }
  }
}
