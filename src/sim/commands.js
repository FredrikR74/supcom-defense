import { getEntity, removeEntity } from './entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';

/**
 * Spelarens kommandon läggs i en kö och verkställs i början av nästa tick.
 * Då är simuleringen deterministisk givet seed + kommandon (bra för replays).
 */
export function queueCommand(world, command) {
  world.commands.push(command);
}

const HANDLERS = {
  move: applyMove,
  build: applyBuild,
  assist: applyAssist,
  sell: applySell,
  produce: applyProduce,
};

export function applyCommands(world) {
  for (const cmd of world.commands) HANDLERS[cmd.type]?.(world, cmd);
  world.commands.length = 0;
}

/** Egna enheter bland `ids`, valfritt filtrerade. */
function ownUnits(world, ids, owner, filter = () => true) {
  return ids
    .map((id) => getEntity(world, id))
    .filter((e) => e && e.kind === 'unit' && e.owner === owner && filter(e));
}

function giveOrder(unit, order, queue) {
  if (!queue) unit.orders.length = 0;
  unit.orders.push(order);
}

const canBuild = (type) => (e) => units[e.type].builds?.includes(type) ?? false;

/** `{ type: 'move', owner, ids, x, z, queue }`: utan `queue` ersätts tidigare order. */
function applyMove(world, { owner, ids, x, z, queue }) {
  const size = world.terrain?.size ?? Infinity;
  const tx = Math.min(Math.max(x, 0), size);
  const tz = Math.min(Math.max(z, 0), size);
  for (const e of ownUnits(world, ids, owner)) {
    giveOrder(e, { type: 'move', x: tx, z: tz }, queue);
  }
}

/** `{ type: 'build', owner, ids, structure, x, z, queue }`: (x, z) är byggnadens mitt. */
function applyBuild(world, { owner, ids, structure, x, z, queue }) {
  const def = structures[structure];
  if (!def) return;
  for (const e of ownUnits(world, ids, owner, canBuild(structure))) {
    const reach = units[e.type].buildRange + def.size / 2;
    giveOrder(e, { type: 'build', structure, x, z, reach, targetId: null }, queue);
  }
}

/** `{ type: 'assist', owner, ids, targetId, queue }`: hjälp till att bygga en ofärdig byggnad. */
function applyAssist(world, { owner, ids, targetId, queue }) {
  const target = getEntity(world, targetId);
  if (!target || target.kind !== 'structure' || target.owner !== owner || target.built) return;
  const def = structures[target.type];
  for (const e of ownUnits(world, ids, owner, canBuild(target.type))) {
    const reach = units[e.type].buildRange + def.size / 2;
    giveOrder(e, {
      type: 'build',
      structure: target.type,
      x: target.x,
      z: target.z,
      reach,
      targetId,
    }, queue);
  }
}

/** `{ type: 'sell', owner, ids }`: riv byggnader och få tillbaka en del av massan. */
function applySell(world, { owner, ids }) {
  const economy = world.players[owner]?.economy;
  for (const id of ids) {
    const e = getEntity(world, id);
    if (!e || e.kind !== 'structure' || e.owner !== owner) continue;
    const def = structures[e.type];
    if (!def.cost) continue; // t.ex. kärnan går inte att sälja
    if (economy) {
      const refund = def.cost.mass * e.progress * world.config.sellRefund;
      economy.mass.stored = Math.min(economy.mass.max, economy.mass.stored + refund);
    }
    removeEntity(world, id);
  }
}

/** `{ type: 'produce', owner, id, unit, count }`: köa enheter i en fabrik (eller kärnan). */
function applyProduce(world, { owner, id, unit, count = 1 }) {
  const e = getEntity(world, id);
  if (!e || e.kind !== 'structure' || e.owner !== owner || !e.built) return;
  if (!structures[e.type].produces?.includes(unit)) return;
  for (let i = 0; i < count; i++) e.productionQueue.push(unit);
}
