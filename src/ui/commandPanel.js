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
export function createCommandPanel(el, { onBuild, onProduce, onCancelProduce, onRepeat, onSell, onPatrol }) {
  let signature = '';
  /** Enhetstyp -> framstegsstapel i dess produktionsknapp; uppdateras varje frame. */
  let progressBars = new Map();
  /** Framstegsstapel i köns första ruta. */
  let queueBar = null;

  /** Som i FA: Ctrl eller Shift gör att ett klick gäller 5 i stället för 1. */
  const batch = (e) => (e.ctrlKey || e.shiftKey ? 5 : 1);

  /**
   * Fabrikens hela kö som rutor i ordning. Som i FA: vänsterklick lägger till fler
   * av samma typ, högerklick tar bort; med Ctrl/Shift 5 åt gången.
   */
  function queueStrip(factory) {
    const strip = document.createElement('div');
    strip.className = 'cmd-queue';
    strip.title = 'Left-click: add · Right-click: remove · Shift/Ctrl: 5 at a time';
    factory.productionQueue.forEach((type, i) => {
      const def = units[type];
      const chip = document.createElement('span');
      chip.className = 'queue-chip' + (i === 0 ? ' queue-current' : '');
      chip.textContent = def.unitName ?? def.name;
      if (i === 0) {
        queueBar = document.createElement('span');
        queueBar.className = 'queue-progress';
        chip.appendChild(queueBar);
      }
      chip.addEventListener('mousedown', (e) => e.stopPropagation());
      chip.addEventListener('click', (e) => onProduce(type, batch(e)));
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onCancelProduce(factory.id, i, batch(e));
      });
      strip.appendChild(chip);
    });
    if (factory.repeat) {
      const loop = document.createElement('span');
      loop.className = 'queue-repeat';
      loop.textContent = '↻ repeat';
      strip.appendChild(loop);
    }
    return strip;
  }

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
      const sellable = selected.filter((e) => e.kind === 'structure' && getDef(e.type).cost && !getDef(e.type).unsellable);

      // Framsteget ändras varje frame, så det uppdateras utan att panelen byggs om.
      const updateProgress = () => {
        if (queueBar && queueFactory) {
          queueBar.style.width = `${(queueFactory.built ? queueFactory.productionProgress : 0) * 100}%`;
        }
        for (const [type, bar] of progressBars) {
          const busy = factories.filter((f) => f.built && f.productionQueue[0] === type);
          const pct = busy.length ? Math.max(...busy.map((f) => f.productionProgress)) * 100 : 0;
          bar.style.width = `${pct}%`;
        }
      };

      const hasUnits = selected.some((e) => e.kind === 'unit');
      // Kön visas för en markerad fabrik (den första om flera är markerade).
      const queueFactory = factories[0] ?? null;
      const sig = JSON.stringify([
        hasUnits, ui.mode, queueFactory?.id, queueFactory?.productionQueue,
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
      queueBar = null;
      const buttons = document.createElement('div');
      buttons.className = 'cmd-row';
      for (const type of buildable) {
        const def = structures[type];
        buttons.appendChild(button(def.name, costText(def.cost), () => onBuild(type), {
          active: ui.placing?.type === type,
        }));
      }
      for (const type of producible) {
        const def = units[type];
        const n = queued(type);
        // Som i FA: Ctrl- eller Shift-klick köar 5 åt gången.
        const b = button(def.name, costText(def.cost), (e) => onProduce(type, batch(e)), {
          badge: n ? `${n}` : '',
        });
        b.title = 'Click: queue 1 · Shift/Ctrl+click: queue 5';
        const bar = document.createElement('span');
        bar.className = 'cmd-progress';
        b.appendChild(bar);
        progressBars.set(type, bar);
        buttons.appendChild(b);
      }
      if (factories.length) {
        buttons.appendChild(button('Repeat', repeat ? 'On' : 'Off', () => onRepeat(!repeat), { active: repeat }));
      }
      if (hasUnits) {
        buttons.appendChild(button('Patrol', 'P', () => onPatrol(), { active: ui.mode === 'patrol' }));
      }
      if (sellable.length) {
        buttons.appendChild(button('Sell', 'Delete', () => onSell()));
      }
      if (buttons.childElementCount) el.appendChild(buttons);
      if (queueFactory?.productionQueue.length) el.appendChild(queueStrip(queueFactory));
      el.hidden = el.childElementCount === 0;
      updateProgress();
    },
  };
}
