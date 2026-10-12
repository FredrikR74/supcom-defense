import { getEntity, removeEntity, getDef } from './entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';
import { setDifficulty } from './director.js';

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
  cancelProduce: applyCancelProduce,
  setRally: applySetRally,
  setRepeat: applySetRepeat,
  setPaused: applySetPaused,
  setDifficulty: (world, { value }) => setDifficulty(world, value),
  attack: applyAttack,
  repair: (world, cmd) => applyWork(world, cmd, 'repair'),
  reclaim: (world, cmd) => applyWork(world, cmd, 'reclaim'),
  patrol: applyPatrol,
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

/** `{ type: 'attack', owner, ids, targetId, queue }`: beväpnade enheter anfaller ett mål. */
function applyAttack(world, { owner, ids, targetId, queue }) {
  const target = getEntity(world, targetId);
  if (!target || target.owner === owner || target.owner === 0) return;
  // Luftvärn anfaller bara flyg.
  const canAttack = (u) => Boolean(units[u.type].weapon) && Boolean(units[u.type].weapon.antiAir) === Boolean(getDef(target.type)?.air);
  for (const e of ownUnits(world, ids, owner, canAttack)) {
    giveOrder(e, { type: 'attack', targetId }, queue);
  }
}

/** `{ type: 'repair'|'reclaim', owner, ids, targetId, queue }`: byggare reparerar eller återvinner. */
function applyWork(world, { owner, ids, targetId, queue }, type) {
  const target = getEntity(world, targetId);
  if (!target) return;
  if (type === 'repair' && target.owner !== owner) return;
  if (type === 'reclaim' && target.kind !== 'wreck') return;
  for (const e of ownUnits(world, ids, owner, isBuilder)) {
    if (e.id !== targetId) giveOrder(e, { type, targetId }, queue);
  }
}

/** Var enheten står när ordern är klar: målpunkten, eller målets position. */
function orderEnd(world, e, order) {
  if (order.x !== undefined) return { x: order.x, z: order.z };
  const target = order.targetId != null ? getEntity(world, order.targetId) : null;
  return target ? { x: target.x, z: target.z } : { x: e.x, z: e.z };
}

/**
 * `{ type: 'patrol', owner, ids, x, z, queue }`: patrullera mellan där enheten
 * står och (x, z). Vid Shift läggs punkten till en köad patrull, och annars
 * börjar patrullen där den förra ordern i kön slutar (som i FA).
 */
function applyPatrol(world, { owner, ids, x, z, queue }) {
  for (const e of ownUnits(world, ids, owner)) {
    const last = queue ? e.orders[e.orders.length - 1] : null;
    if (last?.type === 'patrol') {
      last.points.push({ x, z });
      continue;
    }
    const start = last ? orderEnd(world, e, last) : { x: e.x, z: e.z };
    giveOrder(e, { type: 'patrol', points: [start, { x, z }], index: 1 }, queue);
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

const isBuilder = (e) => (units[e.type].buildPower ?? 0) > 0;

/**
 * `{ type: 'assist', owner, ids, targetId, queue }` (assist/guard som i FA):
 * - på en ofärdig byggnad: byggarna hjälper till att bygga den
 * - på en egen enhet eller färdig fabrik: alla följer den. Byggare hjälper med
 *   det den bygger eller producerar och reparerar den; beväpnade anfaller
 *   fiender som kommer nära den (se guard.js)
 */
function applyAssist(world, { owner, ids, targetId, queue }) {
  const target = getEntity(world, targetId);
  if (!target || target.owner !== owner) return;

  const guardable = target.kind === 'unit' || (target.built && Boolean(structures[target.type].produces));
  if (guardable) {
    for (const e of ownUnits(world, ids, owner)) {
      if (e.id !== targetId) giveOrder(e, { type: 'guard', targetId }, queue);
    }
    return;
  }

  if (target.kind !== 'structure' || target.built) return;
  const def = structures[target.type];
  for (const e of ownUnits(world, ids, owner, isBuilder)) {
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
    if (!def.cost || def.unsellable) continue; // t.ex. kärnan går inte att sälja
    if (economy) {
      const refund = def.cost.mass * e.progress * world.config.sellRefund;
      economy.mass.stored = Math.min(economy.mass.max, economy.mass.stored + refund);
    }
    removeEntity(world, id);
  }
}

/**
 * `{ type: 'produce', owner, id, unit, count }`: köa enheter i en fabrik.
 * Går även medan fabriken byggs; produktionen startar när den är klar.
 */
function applyProduce(world, { owner, id, unit, count = 1 }) {
  const e = getEntity(world, id);
  if (!e || e.kind !== 'structure' || e.owner !== owner) return;
  if (!structures[e.type].produces?.includes(unit)) return;
  for (let i = 0; i < count; i++) e.productionQueue.push(unit);
}

/**
 * `{ type: 'cancelProduce', owner, id, index, count }`: ta bort `count` (standard 1)
 * enheter av samma typ ur fabrikens kö, med början vid `index`. Tas den som byggs
 * just nu bort får man tillbaka det den kostat hittills.
 */
function applyCancelProduce(world, { owner, id, index, count = 1 }) {
  const e = getEntity(world, id);
  if (!e || e.kind !== 'structure' || e.owner !== owner || !e.productionQueue?.[index]) return;
  const unit = e.productionQueue[index];
  let n = 0;
  while (n < count && e.productionQueue[index] === unit) {
    e.productionQueue.splice(index, 1);
    n++;
  }
  if (index !== 0) return;
  const economy = world.players[owner]?.economy;
  const cost = units[unit].cost;
  if (economy) {
    for (const r of ['mass', 'energy']) {
      economy[r].stored = Math.min(economy[r].max, economy[r].stored + cost[r] * e.productionProgress);
    }
  }
  e.productionProgress = 0;
}

/** Egna fabriker bland `ids`, även ofärdiga. */
function ownFactories(world, ids, owner) {
  return ids
    .map((id) => getEntity(world, id))
    .filter((e) => e && e.kind === 'structure' && e.owner === owner && e.rallyPoints);
}

/** `{ type: 'setRally', owner, ids, x, z, queue }`: utan `queue` ersätts tidigare waypoints. */
function applySetRally(world, { owner, ids, x, z, queue }) {
  for (const f of ownFactories(world, ids, owner)) {
    if (!queue) f.rallyPoints.length = 0;
    f.rallyPoints.push({ x, z });
  }
}

/** `{ type: 'setPaused', owner, ids, value }`: en pausad fabrik står still med sin kö kvar (som i FA). */
function applySetPaused(world, { owner, ids, value }) {
  for (const f of ownFactories(world, ids, owner)) f.paused = Boolean(value);
}

/** `{ type: 'setRepeat', owner, ids, value }`: repeterad kö lägger färdiga enheter sist igen. */
function applySetRepeat(world, { owner, ids, value }) {
  for (const f of ownFactories(world, ids, owner)) f.repeat = value;
}
