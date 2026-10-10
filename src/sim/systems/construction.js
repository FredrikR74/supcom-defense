import { TICK_SECONDS } from '../constants.js';
import { addStructure, addUnit, getEntity } from '../entities.js';
import { canPlace } from '../placement.js';
import structures from '../../data/structures.js';
import units from '../../data/units.js';

/** Byggnaden räknas som klar när progress når hit (tål flyttalsavrundning). */
const DONE = 1 - 1e-9;

/** Hur stor del av en byggnad/enhet som byggs per sekund vid full ekonomi. */
export function buildRate(buildPower, buildTime) {
  return buildPower / buildTime;
}

function setJob(e, job, def, power) {
  const rate = buildRate(power, def.buildTime);
  e.buildJob = job;
  e.buildRate = rate;
  e.demand = { mass: def.cost.mass * rate, energy: def.cost.energy * rate };
}

function findUnfinished(world, type, x, z, owner) {
  return world.entities.find((e) =>
    e.kind === 'structure' && !e.built && e.type === type && e.x === x && e.z === z && e.owner === owner) ?? null;
}

function startBuilderJob(world, e) {
  const order = e.orders[0];
  if (order?.type !== 'build') return;

  let target = order.targetId ? getEntity(world, order.targetId) : null;
  if (order.targetId && (!target || target.built)) {
    e.orders.shift(); // klar eller försvunnen
    return;
  }
  if (Math.hypot(order.x - e.x, order.z - e.z) > order.reach + 1e-6) return; // går dit

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
    }
    order.targetId = target.id;
  }
  setJob(e, { kind: 'structure', targetId: target.id }, structures[target.type], units[e.type].buildPower);
}

function startProductionJob(e) {
  if (!e.built || !e.productionQueue?.length) return;
  const type = e.productionQueue[0];
  setJob(e, { kind: 'unit', type }, units[type], structures[e.type].buildPower);
}

/**
 * Del 1, före ekonomin: varje byggare som är redo får ett jobb och en efterfrågan.
 */
export function constructionDemand(world) {
  for (const e of [...world.entities]) {
    e.buildJob = null;
    e.demand = null;
    if (e.kind === 'unit') startBuilderJob(world, e);
    else startProductionJob(e);
  }
}

function spawnProduced(world, factory, type) {
  const def = structures[factory.type];
  // Sprid ut nya enheter på fem platser framför fabriken.
  factory.producedCount = (factory.producedCount ?? 0) + 1;
  const n = factory.producedCount % 5;
  const exitZ = factory.z + def.size / 2 + 1;
  const unit = addUnit(world, type, { x: factory.x, z: exitZ, owner: factory.owner });
  // Gå en bit ut från fabriken så att nästa enhet får plats.
  unit.orders.push({ type: 'move', x: factory.x + (n - 2) * 1.5, z: exitZ + 3 });
}

/**
 * Del 2, efter ekonomin: framsteg = byggtakt × effektivitet.
 */
export function constructionProgress(world) {
  for (const e of [...world.entities]) {
    if (!e.buildJob) continue;
    const delta = e.buildRate * TICK_SECONDS * (e.efficiency ?? 1);

    if (e.buildJob.kind === 'structure') {
      const target = getEntity(world, e.buildJob.targetId);
      if (!target || target.built) continue;
      target.progress = Math.min(1, target.progress + delta);
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * delta);
      if (target.progress >= DONE) {
        target.progress = 1;
        target.built = true;
      }
    } else {
      e.productionProgress += delta;
      if (e.productionProgress >= DONE) {
        e.productionProgress = 0;
        spawnProduced(world, e, e.productionQueue.shift());
      }
    }
  }
}
