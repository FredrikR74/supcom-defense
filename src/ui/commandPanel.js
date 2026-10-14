import { PLAYER_ID } from '../sim/constants.js';
import { getDef } from '../sim/entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';
import enhancements from '../data/enhancements.js';
import { enhancementsFor } from '../sim/enhancements.js';
import { renderBuildMenu, renderFactoryMenu, menuTabs } from './buildMenu.js';

/**
 * Kommandopanel längst ner: byggmenyn för markerade byggare och en markerad
 * ACU:s uppgraderingar (se buildMenu.js), produktionsknappar
 * och repetering för markerade fabriker, och Sell för markerade byggnader.
 * Byggs bara om när innehållet ändras. All text i spelet är på engelska.
 */
export function createCommandPanel(el, { onBuild, onProduce, onCancelProduce, onRepeat, onPause, onSell, onPatrol, onEnhance, onCancelEnhance }) {
  let signature = '';
  /** Enhetstyp -> framstegsstapel i dess produktionsknapp; uppdateras varje frame. */
  let progressBars = new Map();
  /** Framstegsstapel i köns första ruta. */
  let queueBar = null;
  /** Uppgradering -> framstegsstapel i dess ruta; uppdateras varje frame. */
  let enhanceBars = new Map();
  /** Byggmenyns flik ('build' eller en uppgraderingsplats), tech-nivå och ruta under musen. */
  let tab = 'build';
  let tech = 'TECH1';
  let hovered = null;
  /** Ritar om byggmenyns informationsruta; sätts när menyn byggs. */
  let refreshMenu = null;

  /** Som i FA: Ctrl eller Shift gör att ett klick gäller 5 i stället för 1. */
  const batch = (e) => (e.ctrlKey || e.shiftKey ? 5 : 1);

  /**
   * Fabrikens kö i ordning, där flera av samma typ i rad visas som en ruta med
   * antal (som i FA). Ordningen bevaras: bara intilliggande av samma typ slås
   * ihop, och pilar visar i vilken ordning de kommer ut. Vänsterklick lägger till fler av samma typ, högerklick tar
   * bort från slutet av gruppen; med Ctrl/Shift 5 åt gången.
   */
  function queueStrip(factory) {
    const strip = document.createElement('div');
    strip.className = 'cmd-queue';
    strip.title = 'Left-click: add · Right-click: remove · Shift/Ctrl: 5 at a time';
    const groups = [];
    factory.productionQueue.forEach((type, i) => {
      const last = groups[groups.length - 1];
      if (last?.type === type) last.count++;
      else groups.push({ type, start: i, count: 1 });
    });
    groups.forEach(({ type, start, count }, g) => {
      // Pilar visar i vilken ordning enheterna kommer ut.
      if (g > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'queue-arrow';
        arrow.textContent = '›';
        strip.appendChild(arrow);
      }
      const def = units[type];
      const chip = document.createElement('span');
      chip.className = 'queue-chip' + (start === 0 ? ' queue-current' : '');
      chip.textContent = (def.unitName ?? def.name) + (count > 1 ? ` ×${count}` : '');
      if (start === 0) {
        queueBar = document.createElement('span');
        queueBar.className = 'queue-progress';
        chip.appendChild(queueBar);
      }
      chip.addEventListener('mousedown', (e) => e.stopPropagation());
      chip.addEventListener('click', (e) => onProduce(type, batch(e)));
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // Ta bort de sista i gruppen, så att den som byggs tas sist.
        const n = Math.min(batch(e), count);
        onCancelProduce(factory.id, start + count - n, n);
      });
      strip.appendChild(chip);
    });
    if (factory.paused) {
      const paused = document.createElement('span');
      paused.className = 'queue-paused';
      paused.textContent = 'Paused';
      strip.appendChild(paused);
    }
    if (factory.repeat) {
      const loop = document.createElement('span');
      loop.className = 'queue-repeat';
      loop.textContent = '↻ repeat';
      strip.appendChild(loop);
    }
    return strip;
  }

  /**
   * Högerklick i fabriksmenyn: ta bort de `n` sista av `type` ur varje fabriks
   * kö (den sista gruppen av typen, så att den som byggs tas sist).
   */
  function removeQueued(factories, type, n) {
    for (const f of factories) {
      const end = f.productionQueue.lastIndexOf(type);
      if (end < 0) continue;
      let start = end;
      while (start > 0 && end - start + 1 < n && f.productionQueue[start - 1] === type) start--;
      onCancelProduce(f.id, start, end - start + 1);
    }
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
      const paused = factories.length > 0 && factories.every((f) => f.paused);
      // Uppgraderingar visas för den första markerade enheten som kan få några (ACU:n).
      const enhanceable = selected.find((e) => e.kind === 'unit' && enhancementsFor(e.type).length) ?? null;
      const enhanceOrders = enhanceable?.orders.filter((o) => o.type === 'enhance') ?? [];
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
        for (const [key, bar] of enhanceBars) {
          const order = enhanceOrders.find((o) => o.enhancement === key);
          bar.style.width = `${(order?.progress ?? 0) * 100}%`;
        }
        refreshMenu?.();
      };

      const hasUnits = selected.some((e) => e.kind === 'unit');
      if (!menuTabs(enhanceable).some((t) => t.key === tab)) tab = 'build';
      // Kön visas för en markerad fabrik (den första om flera är markerade).
      const queueFactory = factories[0] ?? null;
      const sig = JSON.stringify([
        hasUnits, ui.mode, queueFactory?.id, queueFactory?.productionQueue,
        [...buildable], [...producible].map((t) => [t, queued(t)]), factories.length, repeat, paused,
        sellable.length, ui.placing?.type, enhanceable?.id, enhanceable?.enhancements,
        enhanceOrders.map((o) => o.enhancement), tab, tech,
      ]);
      if (sig === signature) {
        updateProgress();
        return;
      }
      signature = sig;

      el.replaceChildren();
      progressBars = new Map();
      enhanceBars = new Map();
      refreshMenu = null;
      queueBar = null;
      const buttons = document.createElement('div');
      buttons.className = 'cmd-row';
      const builders = selected.filter((e) => e.kind === 'unit' && units[e.type].builds?.length);
      if (builders.length) {
        const menu = renderBuildMenu({
          buildable: [...buildable],
          powerFor: (type) => builders.filter((e) => units[e.type].builds.includes(type))
            .reduce((sum, e) => sum + units[e.type].buildPower, 0),
          enhanceable,
          enhanceOrders,
          enhancePower: enhanceable ? units[enhanceable.type].buildPower : 0,
          tab,
          tech,
          placing: ui.placing?.type,
          hovered,
        }, {
          onTab: (key) => { tab = key; signature = ''; },
          onTech: (key) => { tech = key; signature = ''; },
          onHover: (key) => { hovered = key; },
          onBuild,
          onEnhance,
          onCancelEnhance,
        });
        el.appendChild(menu.root);
        enhanceBars = menu.bars;
        refreshMenu = menu.refresh;
      }
      if (enhanceOrders.length) {
        buttons.appendChild(button('Cancel upgrade', enhancements[enhanceOrders[0].enhancement].name,
          () => onCancelEnhance(enhanceOrders[0].enhancement)));
      }
      let factoryMenu = null;
      if (factories.length) {
        factoryMenu = renderFactoryMenu({
          producible: [...producible],
          queued,
          power: structures[factories[0].type].buildPower,
          tech,
          hovered,
        }, {
          // Som i FA: Ctrl- eller Shift-klick köar 5 åt gången, högerklick tar bort.
          onProduce: (type, e) => onProduce(type, batch(e)),
          onRemove: (type, e) => removeQueued(factories, type, batch(e)),
          onTab: () => {},
          onTech: (key) => { tech = key; signature = ''; },
          onHover: (key) => { hovered = key; },
        });
        progressBars = factoryMenu.bars;
        refreshMenu = factoryMenu.refresh;
      }
      if (factories.length) {
        buttons.appendChild(button('Repeat', repeat ? 'On' : 'Off', () => onRepeat(!repeat), { active: repeat }));
        buttons.appendChild(button('Pause', paused ? 'Paused' : 'Running', () => onPause(!paused), { active: paused }));
      }
      if (hasUnits) {
        buttons.appendChild(button('Patrol', 'P', () => onPatrol(), { active: ui.mode === 'patrol' }));
      }
      if (sellable.length) {
        buttons.appendChild(button('Sell', 'Delete', () => onSell()));
      }
      // Kön ligger ovanför knapparna: panelen sitter i skärmens nederkant, så när
      // kön växer flyttar sig inte knapparna under muspekaren.
      if (queueFactory?.productionQueue.length) el.appendChild(queueStrip(queueFactory));
      if (factoryMenu) el.appendChild(factoryMenu.root);
      if (buttons.childElementCount) el.appendChild(buttons);
      el.hidden = el.childElementCount === 0;
      updateProgress();
    },
  };
}
