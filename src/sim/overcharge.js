import { getDef, getEntity, weaponOf } from './entities.js';
import { TICK_SECONDS } from './constants.js';
import { fireProjectiles, leadPoint, edgeDistance, canTarget } from './systems/combat.js';

/**
 * Overcharge (ACU:ns specialskott) som i FAF. Värdena ligger i enhetens data
 * (`units.acu.overcharge`).
 *
 * - Manuellt: ordern { type: 'overcharge', targetId } går inom räckvidd och
 *   skjuter ett Overcharge när det finns energi, sedan är ordern klar.
 * - Automatiskt (`e.autoOvercharge`): skjuter Overcharge mot målet som kanonen
 *   siktar på (en enhet) så fort det går.
 *
 * Det kräver minst `energyRequired` lagrad energi, och går inte medan ACU:n
 * bygger, reparerar, återvinner eller uppgraderar sig. Skadan och energin som
 * går åt räknas ut vid nedslaget (resolveOvercharge).
 */

/** Overcharge-data för entiteten, eller null om den inte kan skjuta Overcharge. */
export const overchargeOf = (e) => (e?.kind === 'unit' ? getDef(e.type)?.overcharge ?? null : null);

/** Vapnet som Overcharge skjuts med: kanonens räckvidd och bana, eget skott. */
function overchargeWeapon(e, oc) {
  const gun = weaponOf(e);
  return {
    ...gun, damage: 0, projectiles: 1, damageRadius: oc.damageRadius, projectileSpeed: oc.projectileSpeed, ballistic: false,
  };
}

const storedEnergy = (world, e) => world.players[e.owner]?.economy?.energy.stored ?? 0;

/** Kan `e` skjuta Overcharge just nu (laddat, energi nog och inte upptagen)? */
export function canOvercharge(world, e) {
  const oc = overchargeOf(e);
  if (!oc || (e.ocCooldown ?? 0) > 1e-9) return false;
  if (e.buildJob) return false; // bygger, reparerar, återvinner eller uppgraderar
  return storedEnergy(world, e) >= oc.energyRequired;
}

function fire(world, e, oc, target) {
  const weapon = overchargeWeapon(e, oc);
  fireProjectiles(world, e, weapon, target, leadPoint(e, target, weapon.projectileSpeed), {
    overcharge: true,
    structureDamage: oc.structureDamage,
    shieldDamage: oc.structureDamage,
  });
  e.ocCooldown = oc.reload;
}

/** Är `t` inom Overcharge-räckvidd (kanonens) för `e`? */
const inRange = (e, t) => {
  const gun = weaponOf(e);
  return Boolean(gun) && canTarget(gun, t, edgeDistance(e, t));
};

export function overchargeSystem(world) {
  for (const e of world.entities) {
    const oc = overchargeOf(e);
    if (!oc) continue;
    e.ocCooldown = Math.max(0, (e.ocCooldown ?? 0) - TICK_SECONDS);
    const order = e.orders[0];
    if (order?.type === 'overcharge') {
      const t = getEntity(world, order.targetId);
      if (!t || t.hp <= 0) {
        e.orders.shift();
        continue;
      }
      if (inRange(e, t) && canOvercharge(world, e)) {
        fire(world, e, oc, t);
        e.orders.shift();
      }
      continue;
    }
    if (!e.autoOvercharge || !e.targetId) continue;
    const t = getEntity(world, e.targetId);
    if (t?.kind === 'unit' && t.hp > 0 && inRange(e, t) && canOvercharge(world, e)) fire(world, e, oc, t);
  }
}

/**
 * Overcharge-skottets skada vid nedslaget (FAF:s OverchargeProjectile):
 * så mycket som behövs för den tåligaste mobila fienden inom `idealRadius`
 * (minDamage om ingen), högst vad 90 % av energilagret räcker till och högst
 * maxDamage, minst minDamage. Energin (skadan × energyRatio) dras från lagret.
 */
export function resolveOvercharge(world, p, hash, maxRadius) {
  const shooter = getEntity(world, p.sourceId);
  const oc = overchargeOf(shooter) ?? getDef(p.source)?.overcharge;
  const economy = world.players[p.owner]?.economy;
  if (!oc || !economy) return;
  const stored = economy.energy.stored;
  const limitDamage = (stored * oc.energyMult) / oc.energyRatio;
  let ideal = 0;
  for (const t of hash.queryRadius(p.x, p.z, maxRadius + oc.idealRadius)) {
    if (t.kind !== 'unit' || t.owner === p.owner || t.owner === 0 || t.hp <= 0) continue;
    if (Math.hypot(t.x - p.x, t.z - p.z) - t.radius <= oc.idealRadius) ideal = Math.max(ideal, t.hp);
  }
  let damage = Math.min(oc.maxDamage, limitDamage, ideal || oc.minDamage);
  damage = Math.max(oc.minDamage, damage);
  // Som i FAF: under energiströskeln blir det bara så mycket som lagret räcker till.
  if (stored < oc.energyRequired) damage = limitDamage;
  p.damage = damage;
  economy.energy.stored = Math.max(0, stored - damage * oc.energyRatio);
}
