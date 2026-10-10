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
  world.entities.push(entity);
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
    orders: [],
  };
  world.entities.push(entity);
  return entity;
}

export function getEntity(world, id) {
  return world.entities.find((e) => e.id === id) ?? null;
}

export function removeEntity(world, id) {
  const i = world.entities.findIndex((e) => e.id === id);
  if (i < 0) return;
  const [entity] = world.entities.splice(i, 1);
  if (entity.kind === 'structure') markOccupancy(world, entity, 0);
}
