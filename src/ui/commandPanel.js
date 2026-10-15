import { PLAYER_ID } from '../sim/constants.js';
import { getDef, getEntity } from '../sim/entities.js';
import structures from '../data/structures.js';
import units from '../data/units.js';
import enhancements from '../data/enhancements.js';
import { enhancementsFor } from '../sim/enhancements.js';
import { upgradeTarget, queueableUnits } from '../sim/upgrades.js';
import { techName } from './tech.js';
import { renderBuildMenu, renderFactoryMenu, menuTabs, shortName, TECH_TABS } from './buildMenu.js';

/**
 * Kommandopanel längst ner: byggmenyn för markerade byggare och en markerad
 * ACU:s uppgraderingar (se buildMenu.js), produktionsknappar
 * och repetering för markerade fabriker, Upgrade för byggnader som kan
 * uppgraderas till nästa tech-nivå, och Sell för markerade byggnader.
 * En markerad byggares byggkö visas som fabrikens kö. Bygg- och fabriksmenyn
 * kan fällas ihop med fliken överst, så att den inte är i vägen.
 * Byggs bara om när innehållet ändras. All text i spelet är på engelska.
 */

const COLLAPSE_KEY = 'supcom-defense.menuCollapsed';
const loadCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
};
const saveCollapsed = (value) => {
  try { localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'); } catch { /* inte viktigt */ }
};

/** Högsta tech-nivån bland typerna (som FA väljer fliken för en T2-fabrik eller T2-ingenjör). */
function topTech(types) {
  let best = 'TECH1';
  for (const t of types) {
    const tc = getDef(t)?.techCategory ?? 'TECH1';
    if (TECH_TABS.findIndex((x) => x.key === tc) > TECH_TABS.findIndex((x) => x.key === best)) best = tc;
  }
  return best;
}
export function createCommandPanel(el, {
  onBuild, onProduce, onCancelProduce, onRepeat, onPause, onSell, onPatrol, onEnhance, onCancelEnhance,
  onUpgrade, onCancelUpgrade, onCancelOrders,
}) {
  let signature = '';
  /** Markeringen och den högsta tech-nivån förra gången, för att välja tech-flik. */
  let lastSelection = '';
  let lastTop = '';
  /** Bygg- och fabriksmenyn ihopfälld (sparas mellan spel). */
  let collapsed = loadCollapsed();
  /** Framstegsstapel för en uppgradering som pågår, och för byggarens pågående bygge. */
  let upgradeBar = null;
  let builderBar = null;
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
      chip.textContent = (def.unitName ?? techName(def)) + (count > 1 ? ` ×${count}` : '');
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

  /**
   * Byggarens kö (FA visar ingenjörens byggkö som fabrikens): byggorder i
   * ordning, flera av samma byggnad i rad som en ruta med antal. Högerklick tar
   * bort den sista i gruppen (Shift/Ctrl: 5), så att den som byggs tas sist.
   */
  function builderStrip(unit) {
    const strip = document.createElement('div');
    strip.className = 'cmd-queue';
    strip.title = 'Build queue · Right-click: remove · Shift/Ctrl: 5 at a time';
    const groups = [];
    unit.orders.forEach((o, i) => {
      if (o.type !== 'build') return;
      const last = groups[groups.length - 1];
      if (last?.structure === o.structure && last.indices[last.indices.length - 1] === i - 1) last.indices.push(i);
      else groups.push({ structure: o.structure, indices: [i] });
    });
    groups.forEach(({ structure, indices }, g) => {
      if (g > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'queue-arrow';
        arrow.textContent = '›';
        strip.appendChild(arrow);
      }
      const chip = document.createElement('span');
      const current = indices[0] === 0;
      chip.className = 'queue-chip' + (current ? ' queue-current' : '');
      chip.textContent = shortName(structure) + (indices.length > 1 ? ` ×${indices.length}` : '');
      if (current) {
        builderBar = document.createElement('span');
        builderBar.className = 'queue-progress';
        chip.appendChild(builderBar);
      }
      chip.addEventListener('mousedown', (e) => e.stopPropagation());
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onCancelOrders(unit.id, indices.slice(-Math.min(batch(e), indices.length)));
      });
      strip.appendChild(chip);
    });
    return strip;
  }

  function button(label, sub, onClick, { active = false, badge = '', title = '' } = {}) {
    const b = document.createElement('button');
    if (title) b.title = title;
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
      // Medan en fabrik uppgraderas går nästa tech-nivås enheter också att köa.
      const producible = new Set(factories.flatMap(queueableUnits));
      const queued = (type) => factories.reduce(
        (n, e) => n + e.productionQueue.filter((t) => t === type).length, 0);
      const repeat = factories.length > 0 && factories.every((f) => f.repeat);
      const paused = factories.length > 0 && factories.every((f) => f.paused);
      // Uppgraderingar visas för den första markerade enheten som kan få några (ACU:n).
      const enhanceable = selected.find((e) => e.kind === 'unit' && enhancementsFor(e.type).length) ?? null;
      const enhanceOrders = enhanceable?.orders.filter((o) => o.type === 'enhance') ?? [];
      const sellable = selected.filter((e) => e.kind === 'structure' && getDef(e.type).cost && !getDef(e.type).unsellable);
      // Byggnader som kan uppgraderas (alla till samma typ som den första) och som uppgraderas just nu.
      const upgradeTo = selected.map(upgradeTarget).find(Boolean) ?? null;
      const upgradable = selected.filter((e) => upgradeTarget(e) === upgradeTo && upgradeTo);
      const upgrading = selected.filter((e) => e.kind === 'structure' && e.upgrade);

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
        if (upgradeBar && upgrading[0]) upgradeBar.style.width = `${upgrading[0].upgrade.progress * 100}%`;
        if (builderBar && queueBuilder) {
          const site = queueBuilder.buildJob?.kind === 'structure' ? getEntity(world, queueBuilder.buildJob.targetId) : null;
          builderBar.style.width = `${(site?.progress ?? 0) * 100}%`;
        }
        refreshMenu?.();
      };

      const hasUnits = selected.some((e) => e.kind === 'unit');
      if (!menuTabs(enhanceable).some((t) => t.key === tab)) tab = 'build';
      // Kön visas för en markerad fabrik (den första om flera är markerade).
      const queueFactory = factories[0] ?? null;
      const builders = selected.filter((e) => e.kind === 'unit' && units[e.type].builds?.length);
      // Byggkön visas för den första markerade byggaren som har byggorder.
      const queueBuilder = queueFactory ? null : builders.find((e) => e.orders.some((o) => o.type === 'build')) ?? null;
      const builderOrders = queueBuilder?.orders.filter((o) => o.type === 'build').map((o) => [o.structure, o.x, o.z]) ?? [];

      // Ny markering, eller en fabrik som blivit T2: välj den högsta tech-nivån, som i FA.
      const selectionKey = selected.map((e) => e.id).join(',');
      const top = topTech(factories.length ? producible : buildable);
      if (selectionKey !== lastSelection || top !== lastTop) tech = top;
      lastSelection = selectionKey;
      lastTop = top;
      const sig = JSON.stringify([
        hasUnits, ui.mode, queueFactory?.id, queueFactory?.productionQueue,
        [...buildable], [...producible].map((t) => [t, queued(t)]), factories.length, repeat, paused,
        sellable.length, ui.placing?.type, enhanceable?.id, enhanceable?.enhancements,
        enhanceOrders.map((o) => o.enhancement), tab, tech,
        upgradable.map((e) => e.id), upgrading.map((e) => [e.id, e.upgrade.to]),
        queueBuilder?.id, builderOrders, collapsed,
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
      upgradeBar = null;
      builderBar = null;
      const buttons = document.createElement('div');
      buttons.className = 'cmd-row';
      // Fliken som fäller ihop eller fäller ut bygg- och fabriksmenyn.
      if (builders.length || factories.length) {
        const toggle = document.createElement('button');
        toggle.className = 'cmd-collapse';
        toggle.textContent = collapsed ? '▴ Show menu' : '▾ Hide menu';
        toggle.title = collapsed ? 'Show the build menu' : 'Hide the build menu (stays hidden until shown again)';
        toggle.addEventListener('mousedown', (e) => e.stopPropagation());
        toggle.addEventListener('click', () => {
          collapsed = !collapsed;
          saveCollapsed(collapsed);
          signature = '';
        });
        el.appendChild(toggle);
      }
      if (builders.length && !collapsed) {
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
      if (factories.length && !collapsed) {
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
      if (upgradable.length) {
        const def = structures[upgradeTo];
        const time = def.buildTime / structures[upgradable[0].type].buildPower;
        buttons.appendChild(button('Upgrade', shortName(upgradeTo), () => onUpgrade(upgradable.map((e) => e.id)), {
          title: `Upgrade to ${def.name} (Tech ${def.techCategory.slice(-1)}): ${def.cost.mass} mass, ` +
            `${def.cost.energy} energy, ${Math.round(time)} s` + (upgradable.length > 1 ? ` each (${upgradable.length})` : ''),
        }));
      }
      if (upgrading.length) {
        const b = button('Cancel upgrade', `Upgrading to ${shortName(upgrading[0].upgrade.to)}`,
          () => onCancelUpgrade(upgrading.map((e) => e.id)));
        upgradeBar = document.createElement('span');
        upgradeBar.className = 'cmd-progress';
        b.appendChild(upgradeBar);
        buttons.appendChild(b);
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
      if (queueBuilder) el.appendChild(builderStrip(queueBuilder));
      if (factoryMenu) el.appendChild(factoryMenu.root);
      if (buttons.childElementCount) el.appendChild(buttons);
      el.hidden = el.childElementCount === 0;
      updateProgress();
    },
  };
}
