import { getDef } from './entities.js';
import enhancements from '../data/enhancements.js';

/**
 * ACU-uppgraderingar som i FA: en enhet har högst en uppgradering per plats
 * (`e.enhancements`: plats -> nyckel i data/enhancements.js). Effekterna räknas
 * om från grundvärdena varje gång något installeras, så en uppgradering som
 * ersätts tar bort sina effekter. Uppgraderingarna försvinner när ACU:n dör
 * (den återuppstår som en ny enhet, se acu.js).
 */

export const SLOT_NAMES = { RCH: 'Right arm', LCH: 'Left arm', Back: 'Back' };

/** Uppgraderingarna som enhetstypen kan få (nycklar i data/enhancements.js). */
export const enhancementsFor = (type) => getDef(type)?.enhancements ?? [];

export const hasEnhancement = (e, key) => e.enhancements?.[enhancements[key]?.slot] === key;

/** Installerade uppgraderingar i ordning. */
export const installedEnhancements = (e) => Object.values(e.enhancements ?? {});

/** Max-HP utan veterancy: blueprintens plus uppgraderingarnas. */
export function baseMaxHp(e) {
  return getDef(e.type).maxHp + (e.enhancementHp ?? 0);
}

/** Installerar `key` på `e` (ersätter det som satt på samma plats). */
export function applyEnhancement(e, key) {
  const enh = enhancements[key];
  e.enhancements = { ...e.enhancements, [enh.slot]: key };
  recompute(e);
}

function recompute(e) {
  const def = getDef(e.type);
  const list = installedEnhancements(e).map((k) => enhancements[k]);

  // Vapnet: en egen kopia bara när en uppgradering ändrar det.
  const mods = list.filter((x) => x.weapon);
  if (mods.length && def.weapon) {
    const weapon = { ...def.weapon };
    for (const { weapon: m } of mods) {
      weapon.damage += m.damageAdd ?? 0;
      if (m.range != null) weapon.range = m.range;
    }
    e.weapon = weapon;
  } else {
    delete e.weapon;
  }

  e.enhancementRegen = list.reduce((sum, x) => sum + (x.regenAdd ?? 0), 0);

  // Som FA:s MaxHealth-buff: ökar max-HP höjs HP lika mycket, minskar det kapas HP.
  const oldMax = e.maxHp;
  e.enhancementHp = list.reduce((sum, x) => sum + (x.maxHpAdd ?? 0), 0);
  e.maxHp = baseMaxHp(e) * (1 + 0.1 * (e.vetLevel ?? 0));
  e.hp = Math.min(e.maxHp, e.hp + Math.max(0, e.maxHp - oldMax));

  if (def.production) {
    e.production = { ...def.production };
    for (const x of list) {
      for (const r of Object.keys(x.productionAdd ?? {})) e.production[r] = (e.production[r] ?? 0) + x.productionAdd[r];
    }
  }
}
