import { PLAYER_ID } from '../sim/constants.js';
import { getDef, getEntity, weaponOf } from '../sim/entities.js';
import { installedEnhancements } from '../sim/enhancements.js';
import enhancements from '../data/enhancements.js';
import { buildIcon } from './buildIcons.js';
import { shortName } from './buildMenu.js';
import { regenRate } from '../sim/veterancy.js';
import { techName, techRoman } from './tech.js';

const fmt = (v) => v.toFixed(1);
const stars = (level) => '★'.repeat(level ?? 0);
const row = (label, value) => `<div class="info-row"><span class="info-label">${label}</span> ${value}</div>`;

/** Ekonomin för en entitet just nu: vad den ger och vad den drar (per sekund). */
function economyOf(e) {
  const def = getDef(e.type);
  const active = e.kind === 'unit' || e.built;
  const gives = { mass: 0, energy: 0 };
  const takes = { mass: 0, energy: 0 };
  if (active && e.production) {
    const k = e.upkeepEfficiency ?? 1;
    gives.mass += e.production.mass * k;
    gives.energy += e.production.energy * k;
  }
  if (active && def.upkeep) {
    takes.mass += def.upkeep.mass ?? 0;
    takes.energy += def.upkeep.energy ?? 0;
  }
  if (e.buildJob?.kind === 'reclaim') gives.mass += e.buildRate;
  if (e.demand) {
    takes.mass += e.demand.mass;
    takes.energy += e.demand.energy;
  }
  return { gives, takes };
}

function economyLine(label, { mass, energy }, sign, cls) {
  if (mass === 0 && energy === 0) return '';
  const parts = [];
  if (mass) parts.push(`<span class="info-mass">${sign}${fmt(mass)} mass</span>`);
  if (energy) parts.push(`<span class="info-energy">${sign}${fmt(energy)} energy</span>`);
  return `<div class="info-row ${cls}"><span class="info-label">${label}</span> ${parts.join(' ')}</div>`;
}

/** Enheter som just nu hjälper `factory` med dess produktion. */
const assistersOf = (world, factory) => world.entities.filter((u) =>
  u.buildJob?.kind === 'factoryAssist' && u.buildJob.targetId === factory.id);

/** Namn, HP, veterancy, kills och stridsvärden för en entitet. */
function describe(e, { enemy, world }) {
  const def = getDef(e.type);
  if (e.kind === 'wreck') {
    return `<div class="info-name">Wreckage <span class="info-sub">${def.unitName ?? def.name}</span></div>` +
      row('Mass', Math.round(e.mass));
  }
  const name = def.unitName ? `${def.unitName} <span class="info-sub">${techName(def)}</span>` : techName(def);
  const regen = regenRate(e);
  let html = `<div class="info-name ${enemy ? 'info-enemy' : ''}">${name} <span class="info-vet">${stars(e.vetLevel)}</span></div>`;
  if (enemy) html += `<div class="info-row info-sub">${def.faction ?? 'Enemy'} · enemy</div>`;
  html += row('HP', `${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}${regen ? ` <span class="info-sub">(+${regen}/s)</span>` : ''}`);
  const w = weaponOf(e);
  if (w) {
    const dps = w.damage * w.rateOfFire;
    html += row('Weapon', `${w.damage} × ${fmt(w.rateOfFire)}/s <span class="info-sub">(${fmt(dps)} DPS)</span>`);
    html += row('Range', `${w.range}${w.ballistic ? ' <span class="info-sub">(artillery)</span>' : ''}`);
    html += row('Kills', e.kills ?? 0);
  } else if (e.kind === 'unit' && !def.buildPower) {
    html += row('Weapon', '<span class="info-sub">unarmed</span>');
  }
  if (e.kind === 'unit') html += row('Speed', def.speed);
  if (def.buildPower) {
    // En fabrik visar också byggkraften från dem som assisterar den.
    const assist = e.kind === 'structure' && world
      ? assistersOf(world, e).reduce((sum, u) => sum + getDef(u.type).buildPower, 0)
      : 0;
    html += row('Build rate', assist ? `${def.buildPower} <span class="info-gives">+${assist} assist</span>` : def.buildPower);
  }
  const installed = installedEnhancements(e);
  if (installed.length) html += row('Upgrades', installed.map((k) => enhancements[k].name).join(', '));
  const enhancing = e.kind === 'unit' && e.orders[0]?.type === 'enhance' ? e.orders[0] : null;
  if (enhancing) html += row('Upgrading', `${enhancements[enhancing.enhancement].name} ${Math.floor(enhancing.progress * 100)}%`);
  if (enemy && def.cost) html += row('Mass value', def.cost.mass);
  if (e.kind === 'structure' && !e.built) html += row('Building', `${Math.floor(e.progress * 100)}%`);
  if (e.upgrade) html += row('Upgrading', `${shortName(e.upgrade.to)} ${Math.floor(e.upgrade.progress * 100)}%`);
  if (def.shield && e.shieldHp !== undefined) {
    html += row('Shield', e.shieldRecharge > 0
      ? `<span class="info-warn">down, recharging ${Math.ceil(e.shieldRecharge)} s</span>`
      : `${Math.ceil(e.shieldHp)} / ${def.shield.maxHp}`);
  }
  return html;
}

/**
 * Flera markerade: en ruta per typ med ikon, antal och samlad hälsa, som FA:s
 * markeringspanel. Enheter före byggnader, flest först.
 */
function selectionGrid(selected) {
  const groups = new Map();
  for (const e of selected) {
    const g = groups.get(e.type) ?? { type: e.type, unit: e.kind === 'unit', n: 0, hp: 0, maxHp: 0 };
    g.n++;
    g.hp += Math.max(0, e.hp);
    g.maxHp += e.maxHp;
    groups.set(e.type, g);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    (b.unit - a.unit) || (b.type === 'acu') - (a.type === 'acu') || b.n - a.n);
  const tiles = sorted.map((g) => {
    const frac = g.maxHp > 0 ? g.hp / g.maxHp : 0;
    const color = frac > 0.6 ? '#4ade80' : frac > 0.3 ? '#facc15' : '#ef4444';
    const def = getDef(g.type);
    const name = def.unitName ?? techName(def);
    return `<span class="sel-tile" data-type="${g.type}" title="${name}: ${g.n} · ${Math.round(frac * 100)}% health · ` +
      `Click: select only these · Shift/right-click: deselect">` +
      `<span class="sel-icon">${buildIcon(g.type)}</span>` +
      (techRoman(def) ? `<span class="sel-tech">${techRoman(def)}</span>` : '') +
      (g.n > 1 ? `<span class="sel-count">${g.n}</span>` : '') +
      `<span class="sel-label">${shortName(g.type)}</span>` +
      `<span class="sel-bar"><span style="width:${Math.round(frac * 100)}%;background:${color}"></span></span></span>`;
  });
  return `<div class="info-name">${selected.length} selected</div><div class="sel-grid">${tiles.join('')}</div>`;
}

/**
 * Info nere till vänster om det som är markerat (eller en fiende man klickat på):
 * namn, HP, veterancy, kills, vapen och fart, och för egna saker vad de ger
 * och drar i mass och energi per sekund. Flera markerade: en ruta per typ
 * (se selectionGrid) och summan. Klick på en ruta markerar bara den typen,
 * Shift-klick eller högerklick tar bort typen ur markeringen.
 */
export function createSelectionInfo(el, { onSelectOnly, onDeselect } = {}) {
  // Panelen ritas om varje frame, så klicken fångas på panelen (mousedown).
  el.addEventListener('mousedown', (e) => {
    const tile = e.target.closest?.('.sel-tile');
    if (!tile) return;
    e.stopPropagation();
    e.preventDefault();
    const type = tile.dataset.type;
    if (e.button === 2 || e.shiftKey) onDeselect?.(type);
    else if (e.button === 0) onSelectOnly?.(type);
  });
  el.addEventListener('contextmenu', (e) => {
    if (e.target.closest?.('.sel-tile')) e.preventDefault();
  });
  // Skriv bara om panelen när innehållet ändrats, så att hover och verktygstips håller.
  let shown = '';
  const render = (html) => {
    if (html === shown) return;
    shown = html;
    el.innerHTML = html;
  };
  return {
    update(world, selection, ui = {}) {
      const selected = world.entities.filter((e) => selection.has(e.id) && e.owner === PLAYER_ID);
      const inspected = selected.length === 0 && ui.inspectId != null ? getEntity(world, ui.inspectId) : null;
      if (ui.inspectId != null && !inspected) ui.inspectId = null;

      el.hidden = selected.length === 0 && !inspected;
      if (el.hidden) return;

      if (inspected) {
        render(describe(inspected, { enemy: inspected.owner !== PLAYER_ID && inspected.owner !== 0, world }));
        return;
      }

      const gives = { mass: 0, energy: 0 };
      const takes = { mass: 0, energy: 0 };
      // En markerad fabrik räknar in det dess assistenter drar (om de inte redan är markerade).
      const assisters = new Set();
      for (const f of selected.filter((e) => e.kind === 'structure')) {
        for (const u of assistersOf(world, f)) if (!selection.has(u.id)) assisters.add(u);
      }
      for (const e of [...selected, ...assisters]) {
        const eco = economyOf(e);
        for (const r of ['mass', 'energy']) {
          // Assistenternas egen inkomst (t.ex. ACU:ns) hör inte till fabriken, bara det de drar.
          if (!assisters.has(e)) gives[r] += eco.gives[r];
          takes[r] += eco.takes[r];
        }
      }
      const economy0 = world.players[PLAYER_ID].economy;
      const stalled = economy0.efficiency < 0.99 && takes.mass + takes.energy > 0;

      const head = selected.length === 1
        ? describe(selected[0], { enemy: false, world })
        : selectionGrid(selected);
      const economy = economyLine('Produces', gives, '+', 'info-gives') + economyLine('Consumes', takes, '−', 'info-takes');
      const stallNote = stalled
        ? `<div class="info-row info-takes">Resource shortage: running at ${Math.round(economy0.efficiency * 100)}% speed</div>`
        : '';
      render(head + (economy || '<div class="info-row info-sub">No resource use</div>') + stallNote);
    },
  };
}
