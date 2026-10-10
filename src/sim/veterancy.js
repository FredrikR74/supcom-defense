import { TICK_SECONDS } from './constants.js';
import { getDef, getEntity } from './entities.js';

/**
 * HP-regenerering och veterancy enligt FAF (lua/defaultcomponents.lua,
 * VeterancyComponent, och lua/system/blueprints-units.lua):
 *
 * - Erfarenhet är massan på dödade fiender (byggnadsgrad × massakostnad),
 *   fördelad på alla som skadade dem i proportion till skadan.
 * - Trösklar per nivå: blueprintens VeteranMass (kumulativt) om den finns,
 *   annars nivå × multiplikator × egen massakostnad (T1: 2, T2: 1,5, T3: 1,25).
 * - Max en nivå per dödad fiende (erfarenheten kapas vid nästa tröskel).
 * - Varje nivå: max-HP × (1 + 0,1 × nivå) utan att fylla på, en engångsläkning
 *   på VeteranHealingMult × bas-max-HP (standard 0,1) och extra regen per tech-nivå.
 * - Bara enheter och byggnader med vapen får veterancy.
 */

export const MAX_VET_LEVEL = 5;

const TECH_TO_VET_MULT = { TECH1: 2, TECH2: 1.5, TECH3: 1.25, SUBCOMMANDER: 2, EXPERIMENTAL: 2, COMMAND: 2 };
const TECH_TO_REGEN_ROW = { TECH1: 0, TECH2: 1, TECH3: 2, COMMAND: 2, SUBCOMMANDER: 3, EXPERIMENTAL: 4 };
/** Extra regen (HP/s) per tech-nivå och veterannivå 1–5. */
const VET_REGEN = [
  [1, 2, 3, 4, 5], // T1
  [3, 6, 9, 12, 15], // T2
  [6, 12, 18, 24, 30], // T3 / ACU
  [9, 18, 27, 36, 45], // SACU
  [25, 50, 75, 100, 125], // Experimental
];

export const vetEnabled = (def) => Boolean(def?.weapon);

/** Erfarenhet som krävs för nivå 1..5 (kumulativt). */
export function vetThresholds(def) {
  if (def.veteranMass) {
    let sum = 0;
    return def.veteranMass.map((m) => (sum += m));
  }
  const mult = TECH_TO_VET_MULT[def.techCategory ?? 'TECH1'] ?? 2;
  const cost = def.cost?.mass ?? 1;
  return [1, 2, 3, 4, 5].map((level) => level * mult * cost);
}

/** Bokför skada från `sourceId` på `target`, för att fördela erfarenhet vid döden. */
export function recordDamage(target, sourceId, amount) {
  if (sourceId == null) return;
  target.vetDamage ??= {};
  target.vetDamage[sourceId] = (target.vetDamage[sourceId] ?? 0) + amount;
  target.vetDamageTaken = (target.vetDamageTaken ?? 0) + amount;
}

/** Fördelar en död entitets värde som erfarenhet till dem som skadade den. */
export function disperseVeterancy(world, dead) {
  if (!dead.vetDamageTaken) return;
  const def = getDef(dead.type);
  const progress = dead.kind === 'structure' ? dead.progress : 1;
  const worth = progress * (def.cost?.mass ?? 0);
  if (worth <= 0) return;
  for (const [id, damage] of Object.entries(dead.vetDamage)) {
    const unit = getEntity(world, Number(id));
    if (unit && unit.hp > 0) addVetExperience(unit, (worth * damage) / dead.vetDamageTaken);
  }
}

export function addVetExperience(e, experience) {
  const def = getDef(e.type);
  if (!vetEnabled(def)) return;
  e.vetExperience ??= 0;
  e.vetLevel ??= 0;
  if (e.vetLevel >= MAX_VET_LEVEL) {
    e.vetExperience += experience;
    return;
  }
  const thresholds = vetThresholds(def);
  const lower = thresholds[e.vetLevel - 1] ?? 0;
  const upper = thresholds[e.vetLevel];
  e.vetExperience += Math.min(experience, upper - lower);
  if (e.vetExperience >= upper) addVetLevel(e);
}

export function addVetLevel(e) {
  const def = getDef(e.type);
  const level = e.vetLevel + 1;
  e.vetLevel = level;
  e.maxHp = def.maxHp * (1 + 0.1 * level);
  const healMult = def.veteranHealingMult?.[level - 1] ?? 0.1;
  e.hp = Math.min(e.maxHp, e.hp + def.maxHp * healMult);
  e.vetRegen = VET_REGEN[TECH_TO_REGEN_ROW[def.techCategory ?? 'TECH1'] ?? 0][level - 1];
}

/** HP per sekund för en entitet: blueprintens regen plus veterancy-regen. */
export function regenRate(e) {
  return (getDef(e.type)?.regenRate ?? 0) + (e.vetRegen ?? 0);
}

/** Levande enheter och färdiga byggnader regenererar HP. */
export function regenSystem(world) {
  for (const e of world.entities) {
    if (e.kind !== 'unit' && !(e.kind === 'structure' && e.built)) continue;
    if (e.hp <= 0 || e.hp >= e.maxHp) continue;
    const rate = regenRate(e);
    if (rate > 0) e.hp = Math.min(e.maxHp, e.hp + rate * TICK_SECONDS);
  }
}
