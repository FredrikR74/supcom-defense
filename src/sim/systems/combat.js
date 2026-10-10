import { TICK_SECONDS } from '../constants.js';
import { createSpatialHash } from '../spatialHash.js';
import { getDef, getEntity, removeEntity, addWreck } from '../entities.js';
import { recordDamage, disperseVeterancy } from '../veterancy.js';

/** Hur nära nedslagspunkten en entitets kant måste vara för att träffas. */
const HIT_TOLERANCE = 0.3;
/** Tornet skjuter när det pekar inom så här många radianer från målet. */
const AIM_TOLERANCE = 0.25;
/** Max antal händelser som sparas om ingen läser dem (t.ex. i tester). */
const MAX_EVENTS = 2000;

const isTargetable = (e) => e.kind === 'unit' || e.kind === 'structure';
const areEnemies = (a, b) => a.owner !== b.owner && a.owner !== 0 && b.owner !== 0;

/** Vapnet för en entitet som kan skjuta just nu (byggnader måste vara klara), annars null. */
export function activeWeapon(e) {
  if (!isTargetable(e) || (e.kind === 'structure' && !e.built)) return null;
  return getDef(e.type)?.weapon ?? null;
}

/** Avstånd från `a`s mitt till `b`s kant. */
export function edgeDistance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z) - b.radius;
}

function emit(world, event) {
  world.events.push(event);
  if (world.events.length > MAX_EVENTS) world.events.splice(0, world.events.length - MAX_EVENTS);
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function buildHash(world) {
  const hash = createSpatialHash(4);
  let maxRadius = 0;
  for (const e of world.entities) {
    if (!isTargetable(e)) continue;
    hash.insert(e);
    maxRadius = Math.max(maxRadius, e.radius);
  }
  return { hash, maxRadius };
}

/**
 * Målprioritet som i FA (TargetPriorities för t.ex. Mantis): först mobila
 * enheter, sedan försvarsbyggnader, sedan allt annat. BENIGN-byggnader som
 * murar skjuts aldrig på automatiskt. Lägre tal = viktigare, null = aldrig.
 */
export function targetPriority(t) {
  const def = getDef(t.type);
  if (def?.benign) return null;
  if (t.kind === 'unit') return 0;
  if (def?.weapon) return 1;
  return 2;
}

/**
 * Varje entitet med vapen behåller sitt mål så länge det lever och är inom
 * räckvidd, annars väljs det viktigaste målet inom räckvidd (närmast vid lika).
 */
export function targetingSystem(world) {
  const { hash, maxRadius } = buildHash(world);
  for (const e of world.entities) {
    const weapon = activeWeapon(e);
    if (!weapon) continue;

    // En attackorder bestämmer målet så fort det är inom räckvidd.
    const order = e.orders?.[0];
    if (order?.type === 'attack') {
      const t = getEntity(world, order.targetId);
      if (t && t.hp > 0 && edgeDistance(e, t) <= weapon.range) {
        e.targetId = t.id;
        continue;
      }
    }

    const current = e.targetId ? getEntity(world, e.targetId) : null;
    if (current && current.hp > 0 && edgeDistance(e, current) <= weapon.range) continue;

    let best = null;
    let bestPrio = Infinity;
    let bestDist = Infinity;
    for (const t of hash.queryRadius(e.x, e.z, weapon.range + maxRadius)) {
      if (!areEnemies(e, t) || t.hp <= 0) continue;
      const prio = targetPriority(t);
      if (prio === null) continue;
      const d = edgeDistance(e, t);
      if (d > weapon.range) continue;
      if (prio < bestPrio || (prio === bestPrio && d < bestDist)) {
        best = t;
        bestPrio = prio;
        bestDist = d;
      }
    }
    e.targetId = best?.id ?? null;
  }
}

/** Vrider torn, räknar ner omladdning och skjuter projektiler mot målen. */
export function weaponsSystem(world) {
  for (const e of world.entities) {
    const weapon = activeWeapon(e);
    if (!weapon) continue;
    // Omladdningen får gå under noll så att restid förs vidare och eldhastigheten
    // blir exakt, men laddar inte upp "sparade" skott när vapnet inte har mål.
    e.weaponCooldown = (e.weaponCooldown ?? 0) - TICK_SECONDS;
    const target = e.targetId ? getEntity(world, e.targetId) : null;
    if (!target) {
      e.weaponCooldown = Math.max(0, e.weaponCooldown);
      if (e.kind === 'unit') e.turretHeading = undefined; // tornet pekar framåt igen
      continue;
    }

    const want = Math.atan2(target.x - e.x, target.z - e.z);
    let aimed = true;
    if (weapon.turnRate) {
      const current = e.turretHeading ?? e.heading ?? 0;
      const diff = wrapAngle(want - current);
      const maxTurn = (weapon.turnRate * Math.PI / 180) * TICK_SECONDS;
      e.turretHeading = current + Math.max(-maxTurn, Math.min(maxTurn, diff));
      aimed = Math.abs(wrapAngle(want - e.turretHeading)) <= AIM_TOLERANCE;
    } else if (e.kind === 'unit' && e.x === e.prevX && e.z === e.prevZ) {
      e.heading = want; // stillastående enheter vänder sig mot målet
    }

    if (!aimed) {
      e.weaponCooldown = Math.max(0, e.weaponCooldown);
      continue;
    }
    if (e.weaponCooldown > 1e-9) continue;
    e.weaponCooldown += 1 / weapon.rateOfFire;
    world.projectiles.push({
      owner: e.owner,
      sourceId: e.id,
      x: e.x,
      z: e.z,
      prevX: e.x,
      prevZ: e.z,
      tx: target.x,
      tz: target.z,
      sx: e.x,
      sz: e.z,
      ballistic: Boolean(weapon.ballistic),
      y: weapon.muzzleHeight ?? 1,
      speed: weapon.projectileSpeed,
      damage: weapon.damage,
    });
    emit(world, { type: 'fire', owner: e.owner, x: e.x, z: e.z, y: weapon.muzzleHeight ?? 1 });
  }
}

/**
 * Projektiler flyger rakt mot punkten de siktades mot. Vid nedslaget tar den
 * närmaste fiende vars kant är vid punkten skadan; har målet flyttat sig missar skottet.
 */
export function projectileSystem(world) {
  if (world.projectiles.length === 0) return;
  const { hash, maxRadius } = buildHash(world);
  const remaining = [];
  for (const p of world.projectiles) {
    p.prevX = p.x;
    p.prevZ = p.z;
    const dx = p.tx - p.x;
    const dz = p.tz - p.z;
    const dist = Math.hypot(dx, dz);
    const step = p.speed * TICK_SECONDS;
    if (dist > step) {
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
      remaining.push(p);
      continue;
    }
    p.x = p.tx;
    p.z = p.tz;

    let hit = null;
    let bestDist = Infinity;
    for (const t of hash.queryRadius(p.x, p.z, maxRadius + HIT_TOLERANCE)) {
      if (t.owner === p.owner || t.owner === 0 || t.hp <= 0) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z) - t.radius;
      if (d <= HIT_TOLERANCE && d < bestDist) {
        hit = t;
        bestDist = d;
      }
    }
    if (hit) {
      const wasAlive = hit.hp > 0;
      hit.hp -= p.damage;
      recordDamage(hit, p.sourceId, p.damage);
      hit.lastAttackerId = p.sourceId;
      // Dödande skott: skytten får en kill.
      const shooter = wasAlive && hit.hp <= 0 ? getEntity(world, p.sourceId) : null;
      if (shooter) shooter.kills = (shooter.kills ?? 0) + 1;
    }
    emit(world, { type: hit ? 'hit' : 'miss', owner: p.owner, x: p.x, z: p.z, y: p.y });
  }
  world.projectiles = remaining;
}

/**
 * En beväpnad enhet som blir beskjuten utom räckhåll åker dit och anfaller,
 * om den står still eller är på väg mot kärnan. En enhet med en flyttorder
 * fortsätter dit spelaren skickat den.
 */
export function retaliationSystem(world) {
  for (const e of world.entities) {
    if (e.kind !== 'unit' || e.lastAttackerId == null) continue;
    const attackerId = e.lastAttackerId;
    e.lastAttackerId = null;
    const weapon = activeWeapon(e);
    if (!weapon || e.targetId) continue; // obeväpnad, eller har redan något att skjuta på
    const attacker = getEntity(world, attackerId);
    if (!attacker || attacker.hp <= 0 || edgeDistance(e, attacker) <= weapon.range) continue;
    const order = { type: 'attack', targetId: attacker.id };
    if (e.orders.length === 0) e.orders.push(order);
    else if (e.orders[0].type === 'attackCore') e.orders.unshift(order);
  }
}

/** Entiteter med 0 HP tas bort och lämnar ett vrak med en del av sin mass. */
export function deathSystem(world) {
  const dead = world.entities.filter((e) => isTargetable(e) && e.hp <= 0);
  for (const e of dead) {
    disperseVeterancy(world, e);
    // En död byggares kö försvinner med den (och därmed köade spöken i renderingen).
    if (e.orders) e.orders.length = 0;
    const def = getDef(e.type);
    const progress = e.kind === 'structure' ? e.progress : 1;
    const techMult = world.config.wreckTechMult[def.techCategory] ?? 0.9;
    const mass = (def.cost?.mass ?? 0) * world.config.wreckMassMult * techMult * progress;
    removeEntity(world, e.id);
    if (mass > 0) {
      addWreck(world, { type: e.type, x: e.x, z: e.z, heading: e.heading ?? 0, radius: e.radius, mass });
    }
    emit(world, { type: 'death', owner: e.owner, x: e.x, z: e.z, size: e.radius });
  }
}
