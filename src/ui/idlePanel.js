import { PLAYER_ID } from '../sim/constants.js';
import { isIdleBuilder, isIdleFactory, getDef } from '../sim/entities.js';
import { techShort } from './tech.js';

/**
 * Knappar för sysslolösa byggare och fabriker, som FA:s "idle engineer"- och
 * "idle factory"-knappar: klick markerar nästa sysslolösa ACU, ingenjör eller
 * fabrik (klicka igen för nästa), och dubbelklick markerar alla sysslolösa av
 * den sorten. Ingenjörerna delas upp per tech-nivå som i FA, så att man kan
 * välja t.ex. bara T2-ingenjörerna. Kameran flyttas inte.
 */

/** Knapparna i ordning: nyckel, text och vilka entiteter som räknas. */
const GROUPS = [
  { key: 'acu', label: 'Idle ACU', match: (e) => e.type === 'acu' && isIdleBuilder(e), count: false },
  ...['TECH1', 'TECH2', 'TECH3'].map((tech) => ({
    key: `engineer-${tech}`,
    label: `Idle ${techShort({ techCategory: tech })} Engineers`,
    match: (e) => e.type !== 'acu' && isIdleBuilder(e) && getDef(e.type).techCategory === tech,
    count: true,
  })),
  { key: 'factory', label: 'Idle Factories', match: isIdleFactory, count: true },
];

export function createIdlePanel(el, { onSelect, onSelectAll }) {
  const buttons = {};
  const cursor = {};
  let world = null;
  const currentIdle = (group) => world.entities.filter((e) => e.owner === PLAYER_ID && group.match(e));

  for (const group of GROUPS) {
    const b = document.createElement('button');
    b.className = 'idle-button';
    b.dataset.type = group.key;
    b.hidden = true;
    cursor[group.key] = 0;
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => {
      const idle = currentIdle(group);
      if (idle.length === 0) return;
      // Dubbelklick (andra klicket i följd) markerar alla sysslolösa av sorten.
      if (e.detail >= 2) {
        onSelectAll(idle);
        return;
      }
      cursor[group.key] = (cursor[group.key] + 1) % idle.length;
      onSelect(idle[cursor[group.key]]);
    });
    el.appendChild(b);
    buttons[group.key] = b;
  }

  return {
    update(w) {
      world = w;
      let any = false;
      for (const group of GROUPS) {
        const n = currentIdle(group).length;
        const b = buttons[group.key];
        b.hidden = n === 0;
        const text = group.count ? `${group.label} (${n})` : group.label;
        if (b.textContent !== text) b.textContent = text;
        any ||= n > 0;
      }
      el.hidden = !any;
    },
  };
}
