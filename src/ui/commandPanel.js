import { PLAYER_ID } from '../sim/constants.js';
import { getDef } from '../sim/entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';

const costText = (cost) => `${cost.mass} M · ${cost.energy} E`;

/**
 * Kommandopanel längst ner: byggknappar för markerade byggare, produktionsknappar
 * för markerade fabriker och Sälj för markerade byggnader.
 * Byggs bara om när innehållet ändras.
 */
export function createCommandPanel(el, { onBuild, onProduce, onSell }) {
  let signature = '';

  function button(label, sub, onClick, { active = false, badge = '' } = {}) {
    const b = document.createElement('button');
    b.className = 'cmd' + (active ? ' cmd-active' : '');
    b.innerHTML = `<span class="cmd-label">${label}</span><span class="cmd-sub">${sub}</span>` +
      (badge ? `<span class="cmd-badge">${badge}</span>` : '');
    b.addEventListener('click', onClick);
    // Klick på panelen ska inte nå spelplanen.
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    return b;
  }

  return {
    update(world, selection, ui) {
      const selected = world.entities.filter((e) => selection.has(e.id) && e.owner === PLAYER_ID);

      const buildable = new Set();
      for (const e of selected) {
        if (e.kind === 'unit') for (const t of units[e.type].builds ?? []) buildable.add(t);
      }
      const producers = selected.filter((e) => e.kind === 'structure' && e.built && structures[e.type].produces);
      const producible = new Set(producers.flatMap((e) => structures[e.type].produces));
      const queued = (type) => producers.reduce(
        (n, e) => n + e.productionQueue.filter((t) => t === type).length, 0);
      const sellable = selected.filter((e) => e.kind === 'structure' && getDef(e.type).cost);

      const sig = JSON.stringify([
        [...buildable], [...producible].map((t) => [t, queued(t)]), sellable.length, ui.placing?.type,
      ]);
      if (sig === signature) return;
      signature = sig;

      el.replaceChildren();
      for (const type of buildable) {
        const def = structures[type];
        el.appendChild(button(def.name, costText(def.cost), () => onBuild(type), {
          active: ui.placing?.type === type,
        }));
      }
      for (const type of producible) {
        const def = units[type];
        const n = queued(type);
        el.appendChild(button(def.name, costText(def.cost), () => onProduce(type), { badge: n ? `${n}` : '' }));
      }
      if (sellable.length) {
        el.appendChild(button('Sälj', 'Delete', () => onSell()));
      }
      el.hidden = el.childElementCount === 0;
    },
  };
}
