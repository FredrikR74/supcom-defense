import { TICK_SECONDS } from './constants.js';
import { getDef } from './entities.js';

/**
 * Sköldar som i FA (Shield Generator, Parashield): en bubbla runt generatorn
 * som tar skadan från fiendens skott som slår ner innanför den. Skott som
 * avfyras inifrån bubblan går rakt igenom (egna enheter skjuter ut).
 *
 * - Skölden har egna HP (`def.shield.maxHp`). En träff stoppar regenereringen
 *   i `regenStartTime` sekunder, sedan växer den med `regenRate` per sekund.
 * - Når den 0 faller den och laddas om på `rechargeTime` sekunder, sedan är den
 *   uppe igen med fulla HP.
 * - Vid energibrist (generatorns upkeep räcker inte) faller skölden, som i FA.
 *
 * Tillstånd på entiteten: `shieldHp` och `shieldRecharge` (sekunder kvar tills
 * den är uppe igen, 0 när den är uppe), `shieldRegenDelay`.
 */

const active = (e) => e.kind === 'unit' || (e.kind === 'structure' && e.built);

/** Skölddata för en entitet som kan ha sköld just nu, annars null. */
export function shieldOf(e) {
  const shield = getDef(e.type)?.shield;
  return shield && active(e) ? shield : null;
}

export function isShieldUp(e) {
  return Boolean(shieldOf(e)) && e.shieldRecharge === 0 && e.shieldHp > 0;
}

function collapse(e, shield) {
  e.shieldHp = 0;
  e.shieldRecharge = shield.rechargeTime;
}

export function shieldSystem(world) {
  for (const e of world.entities) {
    const shield = shieldOf(e);
    if (!shield) continue;
    if (e.shieldHp === undefined) {
      e.shieldHp = shield.maxHp;
      e.shieldRecharge = 0;
      e.shieldRegenDelay = 0;
    }
    if ((e.upkeepEfficiency ?? 1) < 0.999) {
      if (e.shieldRecharge === 0) collapse(e, shield);
      continue; // laddar inte om utan energi
    }
    if (e.shieldRecharge > 0) {
      e.shieldRecharge = Math.max(0, e.shieldRecharge - TICK_SECONDS);
      if (e.shieldRecharge === 0) e.shieldHp = shield.maxHp;
      continue;
    }
    if (e.shieldRegenDelay > 0) {
      e.shieldRegenDelay = Math.max(0, e.shieldRegenDelay - TICK_SECONDS);
      continue;
    }
    e.shieldHp = Math.min(shield.maxHp, e.shieldHp + shield.regenRate * TICK_SECONDS);
  }
}

/**
 * Sköldarna som kan stoppa skott från `owner`: fiendens sköldar som är uppe.
 * Räknas en gång per tick i projectileSystem.
 */
export function enemyShields(world, owner) {
  return world.entities.filter((e) => e.owner !== owner && e.owner !== 0 && isShieldUp(e));
}

/**
 * Tar skottet `p` (nedslag i p.x, p.z, avfyrat från p.sx, p.sz) i en sköld om
 * nedslaget är innanför den och skytten utanför. Returnerar skölden, annars null.
 */
export function absorbProjectile(world, shields, p) {
  for (const e of shields) {
    if (!isShieldUp(e)) continue;
    const { radius, regenStartTime } = getDef(e.type).shield;
    if (Math.hypot(p.x - e.x, p.z - e.z) > radius) continue;
    if (Math.hypot(p.sx - e.x, p.sz - e.z) <= radius) continue;
    e.shieldHp -= p.shieldDamage ?? p.damage; // Overcharge gör en fast skada på sköldar
    e.shieldRegenDelay = regenStartTime;
    if (e.shieldHp <= 0) {
      collapse(e, getDef(e.type).shield);
      world.events.push({ type: 'shieldDown', owner: e.owner, x: e.x, z: e.z });
    }
    return e;
  }
  return null;
}
