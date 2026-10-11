import { PLAYER_ID } from '../sim/constants.js';
import { isIdleBuilder, isIdleFactory } from '../sim/entities.js';

/**
 * Knappar för sysslolösa byggare och fabriker, som FA:s "idle engineer"- och
 * "idle factory"-knappar: klick markerar nästa sysslolösa ACU, ingenjör eller
 * fabrik (klicka igen för nästa), och dubbelklick markerar alla sysslolösa av
 * den typen. Kameran flyttas inte.
 */
export function createIdlePanel(el, { onSelect, onSelectAll }) {
  const buttons = {};
  const cursor = { acu: 0, engineer: 0, factory: 0 };
  for (const [type, label] of [['acu', 'Idle ACU'], ['engineer', 'Idle Engineers'], ['factory', 'Idle Factories']]) {
    const b = document.createElement('button');
    b.className = 'idle-button';
    b.dataset.type = type;
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => {
      const idle = currentIdle(type);
      if (idle.length === 0) return;
      // Dubbelklick (andra klicket i följd) markerar alla sysslolösa av typen.
      if (e.detail >= 2) {
        onSelectAll(idle);
        return;
      }
      cursor[type] = (cursor[type] + 1) % idle.length;
      onSelect(idle[cursor[type]]);
    });
    el.appendChild(b);
    buttons[type] = { b, label };
  }

  let world = null;
  const currentIdle = (type) => world.entities.filter((e) => e.owner === PLAYER_ID && (type === 'factory'
    ? isIdleFactory(e)
    : e.type === type && isIdleBuilder(e)));

  return {
    update(w) {
      world = w;
      let any = false;
      for (const [type, { b, label }] of Object.entries(buttons)) {
        const n = currentIdle(type).length;
        b.hidden = n === 0;
        b.textContent = type === 'acu' ? label : `${label} (${n})`;
        any ||= n > 0;
      }
      el.hidden = !any;
    },
  };
}
