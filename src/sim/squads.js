import { addUnit, getEntity, getDef } from './entities.js';
import { cellIndex, isBlockedCell, flowTarget } from './pathing.js';
import { TICK_SECONDS, ENEMY_ID } from './constants.js';

/**
 * Fiendens trupper (squads). En våg spawnar samlad i formation framför en
 * gateway, väntar en kort stund och marscherar sedan mot kärnan. En virtuell
 * ankarpunkt följer flödesfältet i den långsammaste medlemmens takt, och varje
 * medlem går till sin plats i formationen (ankaret + en förskjutning som roteras
 * efter färdriktningen). Kortast räckvidd står längst fram.
 *
 * I trånga passager trycks formationen ihop mot mitten till en kolonn och breddas
 * igen efteråt. När någon i truppen strider stannar ankaret och de andra går mot
 * fienden; när striden är över formerar truppen sig på nytt och fortsätter.
 *
 * Medlemmar har ordern { type: 'squad', squadId }; squadSystem lägger målpunkten
 * för detta tick i ordern (`goal`), och rörelsesystemet går dit.
 */

/** Avstånd mellan platser i formationen (sidled och djup). */
const SPACING = 1.8;
/** Så många rutor framför gatewayen samlas truppen. */
const MUSTER_STEPS = 5;
/** Så långt fram längs flödesfältet ankaret tittar för att bestämma riktningen. */
const LOOKAHEAD_STEPS = 8;
/** Hur snabbt formationen vrider sig (radianer per sekund). */
const TURN_RATE = 1.2;
/** En medlem längre än så här från sin plats räknas som efter. */
const LAG_DISTANCE = 4;
/** Sekunder utan strid innan truppen formerar sig igen. */
const DISENGAGE_SECONDS = 2;
/** Sidledsförskjutningen prövas i de här andelarna när platsen är blockerad. */
const SQUEEZE = [1, 0.6, 0.3, 0];

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function cellCenter(world, i) {
  const n = world.terrain.size;
  return { x: (i % n) + 0.5, z: Math.floor(i / n) + 0.5 };
}

/** Går `steps` rutor längs flödesfältet från (x, z); returnerar rutans mittpunkt. */
function alongFlow(world, x, z, steps) {
  const { next } = world.flow;
  let i = cellIndex(world, x, z);
  for (let s = 0; s < steps && next[i] >= 0; s++) i = next[i];
  return cellCenter(world, i);
}

/** Riktning (heading som i resten av sim/: atan2(dx, dz)) längs flödesfältet, eller null vid målet. */
function flowHeading(world, x, z) {
  const ahead = alongFlow(world, x, z, LOOKAHEAD_STEPS);
  const dx = ahead.x - x;
  const dz = ahead.z - z;
  if (Math.hypot(dx, dz) < 0.5) return null;
  return Math.atan2(dx, dz);
}

/** Kan en enhet stå på (x, z) och nå kärnan därifrån? */
function standable(world, x, z) {
  const n = world.terrain.size;
  if (x < 0 || z < 0 || x >= n || z >= n) return false;
  const i = cellIndex(world, x, z);
  return !isBlockedCell(world, i) && world.flow.dist[i] < Infinity;
}

/**
 * Är den raka linjen från a till b fri från hinder? Går igenom varje ruta som
 * linjen rör (även hörn), så att ingen genväg skär genom en brant eller byggnad.
 * De sista `stopShort` enheterna (t.ex. en byggnad man ska skjuta på) räknas inte.
 */
function clearLine(world, ax, az, bx, bz, stopShort = 0) {
  const d = Math.hypot(bx - ax, bz - az);
  if (stopShort > 0) {
    if (d <= stopShort) return true;
    bx = ax + ((bx - ax) * (d - stopShort)) / d;
    bz = az + ((bz - az) * (d - stopShort)) / d;
  }
  if (!standable(world, ax, az) || !standable(world, bx, bz)) return false;
  let cx = Math.floor(ax);
  let cz = Math.floor(az);
  const ex = Math.floor(bx);
  const ez = Math.floor(bz);
  const dx = bx - ax;
  const dz = bz - az;
  const stepX = Math.sign(dx);
  const stepZ = Math.sign(dz);
  const tDeltaX = stepX ? Math.abs(1 / dx) : Infinity;
  const tDeltaZ = stepZ ? Math.abs(1 / dz) : Infinity;
  let tMaxX = stepX ? (stepX > 0 ? cx + 1 - ax : ax - cx) * tDeltaX : Infinity;
  let tMaxZ = stepZ ? (stepZ > 0 ? cz + 1 - az : az - cz) * tDeltaZ : Infinity;
  for (let guard = 0; (cx !== ex || cz !== ez) && guard < 1000; guard++) {
    if (Math.abs(tMaxX - tMaxZ) < 1e-9) {
      // Genom ett hörn: båda grannrutorna måste vara fria.
      if (!standable(world, cx + stepX + 0.5, cz + 0.5) || !standable(world, cx + 0.5, cz + stepZ + 0.5)) return false;
      cx += stepX;
      cz += stepZ;
      tMaxX += tDeltaX;
      tMaxZ += tDeltaZ;
    } else if (tMaxX < tMaxZ) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cz += stepZ;
      tMaxZ += tDeltaZ;
    }
    if (tMaxX > 1 + 1e-9 && tMaxZ > 1 + 1e-9 && (cx !== ex || cz !== ez)) break;
    if (!standable(world, cx + 0.5, cz + 0.5)) return false;
  }
  return true;
}

/**
 * Formationens platser för `count` medlemmar: { lateral, forward } relativt
 * ankaret, rad 0 längst fram. Bred hellre än djup, centrerad kring ankaret.
 */
export function formationSlots(count) {
  const cols = Math.max(1, Math.min(count, Math.ceil(Math.sqrt(count * 2.5))));
  const ranks = Math.ceil(count / cols);
  const slots = [];
  for (let r = 0; r < ranks; r++) {
    const inRank = Math.min(cols, count - r * cols);
    for (let c = 0; c < inRank; c++) {
      slots.push({
        lateral: (c - (inRank - 1) / 2) * SPACING,
        forward: ((ranks - 1) / 2 - r) * SPACING,
      });
    }
  }
  return slots;
}

function slotPosition(squad, slot, squeeze = 1) {
  const sin = Math.sin(squad.heading);
  const cos = Math.cos(squad.heading);
  const lat = slot.lateral * squeeze;
  return {
    x: squad.x + cos * lat + sin * slot.forward,
    z: squad.z - sin * lat + cos * slot.forward,
  };
}

const weaponRange = (type) => getDef(type)?.weapon?.range ?? 0;

/**
 * Skapar en trupp vid spawnpunkt `spawnIndex` med enheterna `types`, direkt på
 * sina platser i formationen (eller vid gatewayen om platsen är blockerad).
 */
export function spawnSquad(world, types, spawnIndex) {
  const spawn = world.map.spawns[spawnIndex % world.map.spawns.length];
  const muster = alongFlow(world, spawn.x, spawn.z, MUSTER_STEPS);
  const squad = {
    id: world.nextSquadId++,
    x: muster.x,
    z: muster.z,
    heading: flowHeading(world, muster.x, muster.z) ?? 0,
    state: 'muster',
    timer: world.director.config.musterSeconds,
    members: [],
  };
  // Kortast räckvidd längst fram (Mantis före Medusa), stabilt efter typens ordning.
  const sorted = types.map((type, k) => ({ type, k }))
    .sort((a, b) => weaponRange(a.type) - weaponRange(b.type) || a.k - b.k);
  const slots = formationSlots(sorted.length);
  sorted.forEach(({ type }, k) => {
    let pos = slotPosition(squad, slots[k]);
    if (!standable(world, pos.x, pos.z)) {
      const angle = world.rng.range(0, Math.PI * 2);
      const r = world.rng.range(0, 2);
      pos = { x: spawn.x + Math.cos(angle) * r, z: spawn.z + Math.sin(angle) * r };
    }
    const unit = addUnit(world, type, { x: pos.x, z: pos.z, owner: ENEMY_ID, heading: squad.heading });
    unit.orders.push({ type: 'squad', squadId: squad.id, goal: null });
    squad.members.push({ id: unit.id, slot: slots[k] });
  });
  world.squads.push(squad);
  return squad;
}

const squadOrder = (e) => e.orders.find((o) => o.type === 'squad');
const isEngaged = (e) => Boolean(e.targetId) || e.orders[0]?.type === 'attack';

/** Målpunkt för en medlem på väg till sin plats: platsen, ihoptryckt om den är blockerad. */
function slotGoal(world, squad, e, slot) {
  for (const squeeze of SQUEEZE) {
    const p = slotPosition(squad, slot, squeeze);
    if (standable(world, p.x, p.z) && clearLine(world, e.x, e.z, p.x, p.z)) {
      return { mode: 'slot', x: p.x, z: p.z, reach: 0 };
    }
  }
  // Ingen plats går att nå direkt: följ flödesfältet, men gå inte före ankaret.
  const { dist } = world.flow;
  if (dist[cellIndex(world, e.x, e.z)] < dist[cellIndex(world, squad.x, squad.z)] - 1) return { mode: 'hold' };
  return { mode: 'flow' };
}

/** Flyttar ankaret längs flödesfältet med sträckan `budget`. */
function advanceAnchor(world, squad, budget) {
  for (let steps = 0; budget > 1e-9 && steps < 8; steps++) {
    const p = flowTarget(world, squad.x, squad.z);
    if (!p) return;
    const dx = p.x - squad.x;
    const dz = p.z - squad.z;
    const d = Math.hypot(dx, dz);
    if (d <= budget) {
      squad.x = p.x;
      squad.z = p.z;
      budget -= d;
    } else {
      squad.x += (dx / d) * budget;
      squad.z += (dz / d) * budget;
      return;
    }
  }
}

/** Ny ankarpunkt efter strid: den medlem som kommit längst mot kärnan. */
function regroup(world, squad, members) {
  const { dist } = world.flow;
  let best = null;
  let bestDist = Infinity;
  for (const e of members) {
    const d = dist[cellIndex(world, e.x, e.z)];
    if (d < bestDist && standable(world, e.x, e.z)) {
      best = e;
      bestDist = d;
    }
  }
  if (!best) return;
  squad.x = best.x;
  squad.z = best.z;
  squad.heading = flowHeading(world, squad.x, squad.z) ?? squad.heading;
}

export function squadSystem(world) {
  if (!world.flow) return;
  const remaining = [];
  for (const squad of world.squads) {
    squad.members = squad.members.filter((m) => {
      const e = getEntity(world, m.id);
      return e && e.hp > 0 && squadOrder(e);
    });
    if (squad.members.length > 0) {
      stepSquad(world, squad);
      remaining.push(squad);
    }
  }
  world.squads = remaining;
}

function stepSquad(world, squad) {
  const members = squad.members.map((m) => getEntity(world, m.id));
  const engaged = members.filter(isEngaged);

  if (engaged.length > 0) {
    squad.engagedTimer = DISENGAGE_SECONDS;
    if (squad.state !== 'muster') squad.state = 'engaged';
  } else if (squad.state === 'engaged') {
    squad.engagedTimer -= TICK_SECONDS;
    if (squad.engagedTimer <= 0) {
      regroup(world, squad, members);
      squad.state = 'march';
    }
  }

  // Medlemmarnas mål.
  let lagging = 0;
  squad.members.forEach((m, k) => {
    const e = members[k];
    const order = squadOrder(e);
    if (squad.state === 'engaged' && !isEngaged(e)) {
      // Gå mot närmaste striderande kamrats mål, annars framåt längs flödesfältet.
      order.goal = engageGoal(world, e, engaged);
      return;
    }
    order.goal = slotGoal(world, squad, e, m.slot);
    if (order.goal.mode !== 'slot' || Math.hypot(order.goal.x - e.x, order.goal.z - e.z) > LAG_DISTANCE) lagging++;
  });

  if (squad.state === 'muster') {
    squad.timer -= TICK_SECONDS;
    if (squad.timer <= 0) squad.state = engaged.length > 0 ? 'engaged' : 'march';
    return;
  }
  if (squad.state !== 'march') return;

  // Ankaret väntar in eftersläntrare, annars går det i den långsammaste medlemmens takt.
  if (lagging * 2 > members.length) return;
  const speed = Math.min(...members.map((e) => e.speed));
  advanceAnchor(world, squad, speed * TICK_SECONDS);
  const target = flowHeading(world, squad.x, squad.z);
  if (target != null) {
    const turn = wrapAngle(target - squad.heading);
    const max = TURN_RATE * TICK_SECONDS;
    squad.heading = wrapAngle(squad.heading + Math.max(-max, Math.min(max, turn)));
  }
}

function engageGoal(world, e, engaged) {
  let best = null;
  let bestDist = Infinity;
  for (const f of engaged) {
    const d = Math.hypot(f.x - e.x, f.z - e.z);
    if (d < bestDist) {
      best = f;
      bestDist = d;
    }
  }
  // Striden har precis tagit slut: vänta in nedräkningen innan truppen formerar sig.
  if (!best) return { mode: 'hold' };
  const targetId = best.targetId ?? best.orders[0]?.targetId;
  const t = targetId != null ? getEntity(world, targetId) : null;
  const range = getDef(e.type)?.weapon?.range;
  const reach = Math.max(0.5, (range ?? 0) + (t?.radius ?? 0) - 0.5);
  if (t && range && clearLine(world, e.x, e.z, t.x, t.z, reach)) {
    return { mode: 'slot', x: t.x, z: t.z, reach };
  }
  return { mode: 'flow' };
}
