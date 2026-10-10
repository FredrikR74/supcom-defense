import structures from '../data/structures.js';

/** Skapar en byggnad från dess definition i data/structures.js. */
export function addStructure(world, type, { x, z, owner }) {
  const def = structures[type];
  if (!def) throw new Error(`Okänd byggnadstyp: ${type}`);
  const entity = {
    id: world.nextEntityId++,
    type,
    owner,
    x,
    z,
    hp: def.maxHp,
    maxHp: def.maxHp,
    production: def.production ? { ...def.production } : null,
  };
  world.entities.push(entity);
  return entity;
}

export function getEntity(world, id) {
  return world.entities.find((e) => e.id === id) ?? null;
}

export function removeEntity(world, id) {
  const i = world.entities.findIndex((e) => e.id === id);
  if (i >= 0) world.entities.splice(i, 1);
}
