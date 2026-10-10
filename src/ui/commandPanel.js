import { PLAYER_ID } from '../sim/constants.js';
import { getDef } from '../sim/entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';

const costText = (cost) => `${cost.mass} M · ${cost.energy} E`;

/**
 * Kommandopanel längst ner: byggknappar för markerade byggare, produktionsknappar
 * och repetering för markerade fabriker, och Sell för markerade byggnader.
 * Byggs bara om när innehållet ändras. All text i spelet är på engelska.
 */
export function createCommandPanel(el, { onBuild, onProduce, onRepeat, onSell }) {
  let signature = '';
  /** Enhetstyp -> framstegsstapel i dess produktionsknapp; uppdateras varje frame. */
  let progressBars = new Map();

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
      // Även ofärdiga fabriker: man kan köa medan de byggs.
      const factories = selected.filter((e) => e.kind === 'structure' && structures[e.type].produces);
      const producible = new Set(factories.flatMap((e) => structures[e.type].produces));
      const queued = (type) => factories.reduce(
        (n, e) => n + e.productionQueue.filter((t) => t === type).length, 0);
      const repeat = factories.length > 0 && factories.every((f) => f.repeat);
      const sellable = selected.filter((e) => e.kind === 'structure' && getDef(e.type).cost);

      // Framsteget ändras varje frame, så det uppdateras utan att panelen byggs om.
      const updateProgress = () => {
        for (const [type, bar] of progressBars) {
          const busy = factories.filter((f) => f.built && f.productionQueue[0] === type);
          const pct = busy.length ? Math.max(...busy.map((f) => f.productionProgress)) * 100 : 0;
          bar.style.width = `${pct}%`;
        }
      };

      const sig = JSON.stringify([
        [...buildable], [...producible].map((t) => [t, queued(t)]), factories.length, repeat,
        sellable.length, ui.placing?.type,
      ]);
      if (sig === signature) {
        updateProgress();
        return;
      }
      signature = sig;

      el.replaceChildren();
      progressBars = new Map();
      for (const type of buildable) {
        const def = structures[type];
        el.appendChild(button(def.name, costText(def.cost), () => onBuild(type), {
          active: ui.placing?.type === type,
        }));
      }
      for (const type of producible) {
        const def = units[type];
        const n = queued(type);
        const b = button(def.name, costText(def.cost), () => onProduce(type), { badge: n ? `${n}` : '' });
        const bar = document.createElement('span');
        bar.className = 'cmd-progress';
        b.appendChild(bar);
        progressBars.set(type, bar);
        el.appendChild(b);
      }
      if (factories.length) {
        el.appendChild(button('Repeat', repeat ? 'On' : 'Off', () => onRepeat(!repeat), { active: repeat }));
      }
      if (sellable.length) {
        el.appendChild(button('Sell', 'Delete', () => onSell()));
      }
      el.hidden = el.childElementCount === 0;
      updateProgress();
    },
  };
}
