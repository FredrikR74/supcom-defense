import { getDef, getEntity, weaponOf } from './entities.js';
import { ENEMY_ID, PLAYER_ID } from './constants.js';
import { isDetected } from './intel.js';
import { enemyShields } from './shields.js';
import { weaponDps, enemyAiConfig, knownDefenses } from './threat.js';

/**
 * Fiendens målval (inte FA:s TargetPriorities, som spelarens enheter använder).
 *
 * Varje mål inom räckvidd får en poäng:
 *
 *   (målets skada per sekund mot skytten + strategiskt värde) × typens bias
 *   ─────────────────────────────────────────────────────────────────────────
 *        HP kvar efter skotten på väg (minst en salva) × (1 + avstånd × k)
 *
 * - Det som skjuter på mig och dör snabbt går först (mest skada bort per skott).
 * - Strategiskt värde: radar, sköldgeneratorer, byggare, kärnan (gameConfig.enemyAi).
 * - Ingen överdödning: räcker skotten som redan är på väg (och kamraternas nästa
 *   salva) för att döda målet blir det nästan värdelöst, så elden fördelas.
 * - Mål under en sköld har sköldens HP till godo.
 * - `targetBias` i enhetens data (t.ex. artilleri föredrar byggnader).
 *
 * Fienden ser bara det som dess sikt och radar visar, plus byggnader den har
 * sett (se intel.js).
 */

/** Strategiskt värde för ett mål (i skada per sekund). */
export function strategicValue(world, t, values) {
  const def = getDef(t.type);
  if (t.id === world.coreId) return values.core;
  if (t.kind === 'unit') return (def.buildPower ?? 0) > 0 ? values.builder : 0;
  if (def.radarRadius) return values.radar;
  if (def.shield) return values.shield;
  if (def.produces) return values.factory;
  if (def.production || def.storage) return values.economy;
  return values.other;
}

/** Skada per sekund som `t` kan göra på `e` (0 om den inte kan skjuta på e:s lager). */
function threatTo(t, e) {
  const tw = weaponOf(t);
  if (!tw || (t.kind === 'structure' && !t.built)) return 0;
  if (Boolean(tw.antiAir) !== Boolean(getDef(e.type)?.air)) return 0;
  return weaponDps(tw);
}

/** En salvas skada. */
const volley = (w) => w.damage * (w.projectiles ?? 1);

/**
 * Det som behövs för fiendens målval under ett tick: skadan som redan är på
 * väg mot varje mål (projektiler i luften plus nästa salva från varje fiende
 * som siktar på det) och spelarens sköldar.
 */
export function createTargetContext(world) {
  const pending = new Map();
  const add = (id, dmg) => pending.set(id, (pending.get(id) ?? 0) + dmg);
  for (const p of world.projectiles) {
    if (p.owner === ENEMY_ID && p.targetId != null) add(p.targetId, p.damage);
  }
  for (const e of world.entities) {
    if (e.owner !== ENEMY_ID || !e.targetId) continue;
    const w = weaponOf(e);
    if (w) add(e.targetId, volley(w));
  }
  return { world, cfg: enemyAiConfig(world), pending, add, shields: null };
}

/** Sköldens HP som skyddar `t` mot skott från `e` (0 om ingen). */
function shieldCover(ctx, e, t) {
  ctx.shields ??= enemyShields(ctx.world, ENEMY_ID);
  let hp = 0;
  for (const s of ctx.shields) {
    const r = getDef(s.type).shield.radius;
    if (Math.hypot(t.x - s.x, t.z - s.z) <= r && Math.hypot(e.x - s.x, e.z - s.z) > r) hp += s.shieldHp;
  }
  return hp;
}

/** Poängen för att `e` (med vapnet `weapon`) skjuter på `t` på avståndet `d`. */
export function enemyTargetScore(ctx, e, weapon, t, d) {
  const { cfg } = ctx;
  const def = getDef(e.type);
  const bias = def?.targetBias?.[t.kind] ?? 1;
  const value = (threatTo(t, e) + strategicValue(ctx.world, t, cfg.values)) * bias;
  if (value <= 0) return 0;
  // Skadan som andra redan har på väg (inte min egen salva).
  const own = e.targetId === t.id ? volley(weapon) : 0;
  const incoming = (ctx.pending.get(t.id) ?? 0) - own;
  const hp = t.hp + shieldCover(ctx, e, t);
  const left = hp - incoming;
  const falloff = 1 + d * cfg.distanceFalloff;
  // Dör målet redan av skotten på väg: räkna som ett fullt friskt mål, med straff.
  if (left <= 0) return (value * cfg.overkillFactor) / Math.max(t.maxHp, volley(weapon)) / falloff;
  return value / Math.max(left, volley(weapon)) / falloff;
}

/**
 * Väljer mål åt fienden `e` bland `candidates` ({ t, d }, redan filtrerade på
 * räckvidd och sikt). Behåller nuvarande mål om inget är tydligt bättre.
 */
export function chooseEnemyTarget(ctx, e, weapon, candidates, current) {
  let best = null;
  let bestScore = 0;
  let currentScore = 0;
  for (const { t, d } of candidates) {
    const score = enemyTargetScore(ctx, e, weapon, t, d);
    if (t === current) currentScore = score;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  if (current && currentScore > 0 && bestScore <= currentScore * ctx.cfg.switchMargin) best = current;
  if ((best?.id ?? null) !== (e.targetId ?? null)) {
    // Nästa salva räknas mot det nya målet direkt, så att kamraterna fördelar elden.
    const v = volley(weapon);
    if (e.targetId) ctx.add(e.targetId, -v);
    if (best) ctx.add(best.id, v);
  }
  return best;
}

/** Är det dags för fienden `e` att se över sitt mål det här ticket? */
export const isRetargetTick = (world, e) => (world.tick + e.id) % enemyAiConfig(world).retargetTicks === 0;

/** Är `t` ett giltigt mål att planera mot för fienden (lever och är känt)? */
export const isKnownTarget = (t) => Boolean(t) && t.hp > 0 && t.owner === PLAYER_ID && isDetected(ENEMY_ID, t);

/*
 * Truppens planering (anropas från squads.js). Truppen ser framåt längs sin
 * väg efter försvar som fienden känner till, och åt sidan efter radar:
 *
 * - **Belägring:** en försvarsbyggnad som når vägen och som några i truppen
 *   skjuter längre än. De som når längre (t.ex. Medusa mot en T1 PD) skjuter
 *   den från sin maxräckvidd; resten står kvar i formationen utanför dess
 *   räckvidd tills den har fallit.
 * - **Anfall:** samma sak, men ingen i truppen når längre, eller truppen står
 *   redan inom räckhåll. Då går alla mot byggnaden samtidigt (fokuserad eld)
 *   i stället för att droppa in en och en.
 * - **Räd:** en radar som inte skyddas av känt försvar och som ligger nära
 *   vägen. Ett par enheter går dit och tar ut den.
 *
 * Orderna är vanliga attackorder med `squadPlan` satt ('siege', 'assault' eller
 * 'raid'), så att truppen vet vilka den själv har gett.
 */

const isPlanOrder = (o) => o?.type === 'attack' && Boolean(o.squadPlan);
/** Har enheten en order från truppens planering (först i kön)? */
export const hasPlanOrder = (e) => isPlanOrder(e.orders[0]);

const groundWeapon = (e) => {
  const w = weaponOf(e);
  return w && !w.antiAir ? w : null;
};

/** Når försvarsbyggnaden `d` punkten (x, z) med en enhet där? */
function covers(d, x, z, margin = 1) {
  const w = weaponOf(d);
  const dist = Math.hypot(x - d.x, z - d.z);
  return dist <= w.range + margin && dist >= (w.minRange ?? 0);
}

/**
 * Första kända försvarsbyggnaden som når truppens väg inom `steps` rutor från
 * ankaret. Artilleri räknas inte (det når för långt för att gå mot; det tas
 * när det kommer inom räckvidd).
 */
function findBlocker(world, squad, defenses, steps) {
  const direct = defenses.filter((d) => !weaponOf(d).ballistic);
  if (direct.length === 0) return null;
  const n = world.terrain.size;
  const { next } = world.flow;
  let i = Math.min(n - 1, Math.max(0, Math.floor(squad.z))) * n + Math.min(n - 1, Math.max(0, Math.floor(squad.x)));
  for (let s = 0; s <= steps && i >= 0; s++) {
    const x = (i % n) + 0.5;
    const z = Math.floor(i / n) + 0.5;
    let best = null;
    let bestDist = Infinity;
    for (const d of direct) {
      if (!covers(d, x, z)) continue;
      const dist = Math.hypot(x - d.x, z - d.z);
      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    if (best) return best;
    i = next[i];
  }
  return null;
}

/** Kan en enhet stå någonstans precis bredvid `t` och nå kärnan därifrån? */
function reachable(world, t) {
  const n = world.terrain.size;
  const { dist } = world.flow;
  const r = t.radius + 1;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = Math.floor(t.x + Math.cos(a) * r);
    const z = Math.floor(t.z + Math.sin(a) * r);
    if (x < 0 || z < 0 || x >= n || z >= n) continue;
    const i = z * n + x;
    if (!world.steep[i] && world.occupancy[i] === 0 && dist[i] < Infinity) return true;
  }
  return false;
}

/** Närmaste kända, oskyddade och nåbara radar inom `radius` från (x, z). */
function findRadar(world, x, z, radius, defenses) {
  let best = null;
  let bestDist = radius;
  for (const t of world.entities) {
    if (t.kind !== 'structure' || !t.built || !getDef(t.type).radarRadius || !isKnownTarget(t)) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d > bestDist || defenses.some((def) => covers(def, t.x, t.z))) continue;
    if (!reachable(world, t)) continue;
    best = t;
    bestDist = d;
  }
  return best;
}

/** Kan `e` skjuta på `b` utan att själv vara inom dess räckvidd? */
function outranges(e, b) {
  const w = groundWeapon(e);
  return Boolean(w) && w.range + b.radius > weaponOf(b).range + e.radius + 1;
}

function assign(e, targetId, plan) {
  const first = e.orders[0];
  if (isPlanOrder(first) && first.targetId === targetId && first.squadPlan === plan) return;
  e.orders = e.orders.filter((o) => !o.squadPlan);
  e.orders.unshift({ type: 'attack', targetId, squadPlan: plan });
}

const clearPlan = (e) => {
  if (e.orders.some((o) => o.squadPlan)) e.orders = e.orders.filter((o) => !o.squadPlan);
};

/** Är byggnaden fortfarande ett hinder: på vägen framåt, eller når den någon i truppen? */
function stillBlocking(world, squad, members, b, steps) {
  if (members.some((e) => covers(b, e.x, e.z, 2))) return true;
  return findBlocker(world, squad, [b], steps) === b;
}

/**
 * Uppdaterar truppens plan (`squad.plan`, `squad.raid`) och medlemmarnas order.
 * Körs med jämna mellanrum, inte under samlingen vid gatewayen.
 */
export function planSquad(world, squad, members) {
  const cfg = enemyAiConfig(world);
  if (squad.state === 'muster' || world.pathDirty || (world.tick + squad.id) % cfg.retargetTicks !== 0) return;
  const defenses = knownDefenses(world);

  // Belägring eller anfall mot ett hinder på vägen.
  let plan = squad.plan;
  const planTarget = plan && getEntity(world, plan.targetId);
  if (!plan || !isKnownTarget(planTarget) || !stillBlocking(world, squad, members, planTarget, cfg.lookaheadCells)) {
    plan = null;
    const b = findBlocker(world, squad, defenses, cfg.lookaheadCells);
    if (b) {
      // Belägring kräver att formationen står utanför byggnadens räckvidd.
      const depth = Math.max(0, ...squad.members.map((m) => Math.hypot(m.slot.lateral, m.slot.forward)));
      const safe = Math.hypot(squad.x - b.x, squad.z - b.z) > weaponOf(b).range + depth + 2;
      const canSiege = members.some((e) => outranges(e, b));
      plan = { targetId: b.id, mode: safe && canSiege ? 'siege' : 'assault' };
    }
  }
  const blocker = plan ? getEntity(world, plan.targetId) : null;
  if (plan?.mode === 'siege' && !members.some((e) => outranges(e, blocker))) {
    plan.mode = 'assault'; // de som nådde längre har fallit
  }
  squad.plan = plan;

  // Räd mot en radar med de enheter som inte behövs mot hindret.
  let raid = squad.raid;
  if (raid && !isKnownTarget(getEntity(world, raid.targetId))) raid = null;
  if (!raid && cfg.radarDetour > 0 && plan?.mode !== 'assault') {
    const radar = findRadar(world, squad.x, squad.z, cfg.radarDetour, defenses);
    if (radar) raid = { targetId: radar.id };
  }
  squad.raid = raid;

  const roles = new Map();
  if (blocker) {
    for (const e of members) {
      if (groundWeapon(e) && (plan.mode === 'assault' || outranges(e, blocker))) roles.set(e.id, plan.mode);
    }
  }
  if (raid) {
    const radar = getEntity(world, raid.targetId);
    const free = members
      .filter((e) => groundWeapon(e) && !roles.has(e.id))
      .sort((a, b) => Math.hypot(a.x - radar.x, a.z - radar.z) - Math.hypot(b.x - radar.x, b.z - radar.z) || a.id - b.id);
    for (const e of free.slice(0, cfg.raidSize)) roles.set(e.id, 'raid');
    if (free.length === 0) squad.raid = null;
  }
  for (const e of members) {
    const role = roles.get(e.id);
    if (role) assign(e, role === 'raid' ? squad.raid.targetId : plan.targetId, role);
    else clearPlan(e);
  }
}
