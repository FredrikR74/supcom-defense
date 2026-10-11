import { getEntity } from '../sim/entities.js';

/** Två tryck på samma siffra inom så här många ms centrerar kameran på gruppen. */
const DOUBLE_TAP_MS = 400;

/**
 * Kontrollgrupper som i FA: Ctrl+siffra sparar markeringen, siffran väljer
 * gruppen igen (Shift lägger till den i markeringen), och två snabba tryck
 * centrerar kameran på den. Döda enheter faller bort ur grupperna.
 */
export function createControlGroups(world, selection) {
  const groups = new Map();
  let lastDigit = null;
  let lastTime = -Infinity;

  return {
    save(digit) {
      groups.set(digit, [...selection]);
      return groups.get(digit).length;
    },

    /** Väljer gruppen. Returnerar gruppens enheter och om det var ett dubbeltryck, eller null om den är tom. */
    recall(digit, { add = false, now = performance.now() } = {}) {
      const alive = (groups.get(digit) ?? []).filter((id) => getEntity(world, id));
      groups.set(digit, alive);
      if (alive.length === 0) return null;
      if (!add) selection.clear();
      for (const id of alive) selection.add(id);
      const double = lastDigit === digit && now - lastTime < DOUBLE_TAP_MS;
      lastDigit = digit;
      lastTime = now;
      return { entities: alive.map((id) => getEntity(world, id)), double };
    },
  };
}
