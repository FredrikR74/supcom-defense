import { getEntity } from './entities.js';

/**
 * Spelarens kommandon läggs i en kö och verkställs i början av nästa tick.
 * Då är simuleringen deterministisk givet seed + kommandon (bra för replays).
 */
export function queueCommand(world, command) {
  world.commands.push(command);
}

export function applyCommands(world) {
  for (const cmd of world.commands) {
    if (cmd.type === 'move') applyMove(world, cmd);
  }
  world.commands.length = 0;
}

/** `{ type: 'move', owner, ids, x, z, queue }`: utan `queue` ersätts tidigare order. */
function applyMove(world, { owner, ids, x, z, queue }) {
  const size = world.terrain?.size ?? Infinity;
  const target = {
    type: 'move',
    x: Math.min(Math.max(x, 0), size),
    z: Math.min(Math.max(z, 0), size),
  };
  for (const id of ids) {
    const e = getEntity(world, id);
    if (!e || e.kind !== 'unit' || e.owner !== owner) continue;
    if (!queue) e.orders.length = 0;
    e.orders.push({ ...target });
  }
}
