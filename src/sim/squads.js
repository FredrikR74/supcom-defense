import { addUnit, getEntity, getDef } from './entities.js';
import { cellIndex, flowTarget, standable, clearLine } from './pathing.js';
import { TICK_SECONDS, TICKS_PER_SECOND, ENEMY_ID } from './constants.js';
import { planSquad, hasPlanOrder } from './enemyAi.js';

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
 * Nya medlemmar har en spawnsköld (`shieldUntil`, ett tick) och tar ingen skada
 * förrän den har tagit slut, se combat.js.
 *
 * Medlemmar har ordern { type: 'squad', squadId }; squadSystem lägger målpunkten
 * för detta tick i ordern (`goal`), och rörelsesystemet går dit.
 *
 * Truppen planerar också mot försvar och radar som fienden känner till
 * (belägring, anfall och räd, se enemyAi.js).
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
/** Avstånd mellan punkterna i ankarets spår, och högst så många punkter. */
const TRAIL_STEP = 2;
const TRAIL_MAX = 80;
/** Vid reträtt backar truppen tills formationen är så här långt utanför hotets räckvidd. */
const SAFE_MARGIN = 3;

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

/** Kortast räckvidd längst fram (Mantis före Medusa), stabilt efter ordningen i listan. */
const byRange = (types) => types.map((type, k) => ({ type, k }))
  .sort((a, b) => weaponRange(a.type) - weaponRange(b.type) || a.k - b.k);

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
    /** Ankarets väg hittills (en punkt per TRAIL_STEP), för reträtt. */
    trail: [{ x: muster.x, z: muster.z }],
  };
  const sorted = byRange(types);
  const slots = formationSlots(sorted.length);
  const shieldUntil = world.tick + Math.round((world.director.config.spawnShieldSeconds ?? 0) * TICKS_PER_SECOND);
  sorted.forEach(({ type }, k) => {
    let pos = slotPosition(squad, slots[k]);
    if (!standable(world, pos.x, pos.z)) {
      const angle = world.rng.range(0, Math.PI * 2);
      const r = world.rng.range(0, 2);
      pos = { x: spawn.x + Math.cos(angle) * r, z: spawn.z + Math.sin(angle) * r };
    }
    const unit = addUnit(world, type, { x: pos.x, z: pos.z, owner: ENEMY_ID, heading: squad.heading });
    unit.orders.push({ type: 'squad', squadId: squad.id, goal: null });
    unit.shieldUntil = shieldUntil;
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

/** Lägger ankarets position i spåret om det har gått minst TRAIL_STEP sedan förra punkten. */
function recordTrail(squad) {
  squad.trail ??= [];
  const last = squad.trail[squad.trail.length - 1];
  if (last && Math.hypot(squad.x - last.x, squad.z - last.z) < TRAIL_STEP) return;
  squad.trail.push({ x: squad.x, z: squad.z });
  if (squad.trail.length > TRAIL_MAX) squad.trail.shift();
}

/** Flyttar ankaret längs flödesfältet med sträckan `budget`. */
function advanceAnchor(world, squad, budget) {
  for (let steps = 0; budget > 1e-9 && steps < 8; steps++) {
    const p = flowTarget(world, squad.x, squad.z);
    if (!p) break;
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
      break;
    }
  }
  recordTrail(squad);
}

/** Formationens radie: hur långt från ankaret den yttersta platsen ligger. */
const formationRadius = (squad) => Math.max(0, ...squad.members.map((m) => Math.hypot(m.slot.lateral, m.slot.forward)));

/** Står hela formationen utanför räckvidden för de hot truppen backar från? */
function isSafe(squad) {
  const r = formationRadius(squad) + SAFE_MARGIN;
  return !(squad.threats ?? []).some((t) => Math.hypot(squad.x - t.x, squad.z - t.z) <= t.range + r);
}

/**
 * Reträtt: ankaret backar längs sitt spår tills formationen är utom räckhåll
 * för hotet ('retreat'), och står sedan still och väntar ('wait'). Medlemmarna
 * håller formationen och skjuter på det som kommer inom räckvidd medan de backar.
 */
function stepRetreat(world, squad, members) {
  if (!isSafe(squad) && squad.trail?.length) squad.state = 'retreat';
  if (squad.state === 'retreat') {
    let budget = Math.min(...members.map((e) => e.speed)) * TICK_SECONDS;
    while (budget > 1e-9 && !isSafe(squad) && squad.trail.length) {
      const p = squad.trail[squad.trail.length - 1];
      const d = Math.hypot(p.x - squad.x, p.z - squad.z);
      if (d <= budget) {
        squad.x = p.x;
        squad.z = p.z;
        budget -= d;
        squad.trail.pop();
      } else {
        squad.x += ((p.x - squad.x) / d) * budget;
        squad.z += ((p.z - squad.z) / d) * budget;
        budget = 0;
      }
    }
    if (isSafe(squad) || !squad.trail.length) squad.state = 'wait';
  }
  squad.members.forEach((m, k) => {
    const e = members[k];
    const g = slotGoal(world, squad, e, m.slot);
    let goal = { mode: 'hold' };
    if (g.mode === 'slot') goal = g;
    else if (clearLine(world, e.x, e.z, squad.x, squad.z)) goal = { mode: 'slot', x: squad.x, z: squad.z, reach: 1 };
    // `retreat`: medlemmen går till sin plats även om den har ett mål (se movement.js).
    squadOrder(e).goal = { ...goal, retreat: true };
  });
}

/**
 * Trupper som kommer nära en trupp som har dragit sig tillbaka slås ihop med
 * den: medlemmarna får nya platser i en gemensam formation, och truppen
 * bedömer sin styrka igen (se enemyAi.js).
 */
function mergeSquads(world) {
  const dist = world.config?.enemyAi?.mergeDistance ?? 0;
  if (!(dist > 0)) return;
  for (const a of world.squads) {
    if (a.merged || (a.state !== 'wait' && a.state !== 'retreat')) continue;
    for (const b of world.squads) {
      if (b === a || b.merged || b.state === 'muster') continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > dist) continue;
      absorb(world, a, b);
      b.merged = true;
    }
  }
  if (world.squads.some((s) => s.merged)) world.squads = world.squads.filter((s) => !s.merged);
}

function absorb(world, a, b) {
  const entities = [...a.members, ...b.members].map((m) => getEntity(world, m.id));
  for (const e of entities) {
    const k = e.orders.findIndex((o) => o.type === 'squad');
    e.orders = e.orders.slice(k); // truppens egna order (anfall, räd) gäller inte längre
    e.orders[0].squadId = a.id;
  }
  const sorted = byRange(entities.map((e) => e.type));
  const slots = formationSlots(entities.length);
  a.members = sorted.map(({ k }, j) => ({ id: entities[k].id, slot: slots[j] }));
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
  recordTrail(squad);
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
  mergeSquads(world);
}

function stepSquad(world, squad) {
  const members = squad.members.map((m) => getEntity(world, m.id));
  planSquad(world, squad, members);
  if (squad.state === 'retreat' || squad.state === 'wait') {
    stepRetreat(world, squad, members);
    return;
  }
  const engaged = members.filter(isEngaged);
  // De andra går inte mot mål som truppen själv har delat ut (belägring, räd).
  const leads = engaged.filter((f) => !hasPlanOrder(f) && !(squad.plan?.mode === 'siege' &&
    (f.targetId ?? f.orders[0]?.targetId) === squad.plan.targetId));

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
      // Strider bara de som har ett uppdrag från truppen står resten kvar i formationen.
      if (leads.length > 0 || engaged.length === 0) {
        order.goal = engageGoal(world, e, leads);
        return;
      }
    }
    order.goal = slotGoal(world, squad, e, m.slot);
    // Den som väntar framför ankaret ('hold') är inte efter; räknades den som
    // det kunde ankaret och de främsta vänta på varandra för evigt i ett pass.
    const { mode } = order.goal;
    if (mode === 'flow' || (mode === 'slot' && Math.hypot(order.goal.x - e.x, order.goal.z - e.z) > LAG_DISTANCE)) lagging++;
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
