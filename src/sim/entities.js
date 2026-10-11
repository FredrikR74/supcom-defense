import structures from '../data/structures.js';
import units from '../data/units.js';
import { markOccupancy } from './placement.js';

/** Definitionen (från data/) för en entitetstyp. */
export function getDef(type) {
  return structures[type] ?? units[type] ?? null;
}

/**
 * Skapar en byggnad från dess definition i data/structures.js.
 * (x, z) är mittpunkten. `built: false` ger en ofärdig byggnad som byggs upp.
 */
export function addStructure(world, type, { x, z, owner, built = true }) {
  const def = structures[type];
  if (!def) throw new Error(`Unknown structure type: ${type}`);
  const entity = {
    id: world.nextEntityId++,
    kind: 'structure',
    type,
    owner,
    x,
    z,
    radius: def.size / 2,
    built,
    progress: built ? 1 : 0,
    hp: built ? def.maxHp : 1,
    maxHp: def.maxHp,
    production: def.production ? { ...def.production } : null,
    productionQueue: def.produces ? [] : null,
    productionProgress: 0,
    /** Waypoints som nya enheter från fabriken följer. */
    rallyPoints: def.produces ? [] : null,
    repeat: false,
  };
  track(world, entity);
  markOccupancy(world, entity, entity.id);
  return entity;
}

/** Skapar en enhet från dess definition i data/units.js. */
export function addUnit(world, type, { x, z, owner, heading = 0 }) {
  const def = units[type];
  if (!def) throw new Error(`Unknown unit type: ${type}`);
  const entity = {
    id: world.nextEntityId++,
    kind: 'unit',
    type,
    owner,
    x,
    z,
    // Position vid förra tickets början, för interpolering i renderingen.
    prevX: x,
    prevZ: z,
    heading,
    radius: def.radius,
    speed: def.speed,
    hp: def.maxHp,
    maxHp: def.maxHp,
    production: def.production ? { ...def.production } : null,
    orders: [],
  };
  track(world, entity);
  return entity;
}

/**
 * Skapar ett vrak där en enhet eller byggnad dog. Vrak blockerar inte och
 * kan senare återvinnas för sin mass (fas 8).
 */
export function addWreck(world, { type, x, z, heading = 0, radius, mass }) {
  const entity = {
    id: world.nextEntityId++,
    kind: 'wreck',
    type,
    owner: 0,
    x,
    z,
    heading,
    radius,
    mass,
  };
  track(world, entity);
  return entity;
}

function track(world, entity) {
  world.entities.push(entity);
  world.byId?.set(entity.id, entity);
}

export function getEntity(world, id) {
  if (world.byId) return world.byId.get(id) ?? null;
  return world.entities.find((e) => e.id === id) ?? null;
}

export function removeEntity(world, id) {
  const i = world.entities.findIndex((e) => e.id === id);
  if (i < 0) return;
  const [entity] = world.entities.splice(i, 1);
  world.byId?.delete(id);
  if (entity.kind === 'structure') markOccupancy(world, entity, 0);
}

/** En byggare (ACU, ingenjör) utan order, utan pågående bygge och som inte strider. */
export function isIdleBuilder(e) {
  return e.kind === 'unit' && (units[e.type]?.buildPower ?? 0) > 0 && e.orders.length === 0 &&
    !e.buildJob && !e.targetId;
}

/** En färdig fabrik som inte har något i produktionskön. */
export function isIdleFactory(e) {
  return e.kind === 'structure' && e.built && Array.isArray(e.productionQueue) && e.productionQueue.length === 0;
}

/** Kan entiteten repareras just nu (skadad, färdig och med en kostnad att räkna på)? */
export function needsRepair(e) {
  const def = getDef(e.type);
  const ready = e.kind === 'unit' || (e.kind === 'structure' && e.built);
  return ready && e.hp > 0 && e.hp < e.maxHp - 1e-6 && Boolean(def?.cost && def?.buildTime);
}
