import structures from '../data/structures.js';
import enhancements from '../data/enhancements.js';
import { enhancementsFor, hasEnhancement, SLOT_NAMES } from '../sim/enhancements.js';
import { buildIcon } from './buildIcons.js';

/**
 * Byggmenyn för markerade byggare (ACU, ingenjörer), i FA:s stil: flikar
 * överst (Build och, för ACU:n, en flik per uppgraderingsplats), tech-nivåer
 * T1–EXP, ett rutnät med ikoner och en informationsruta (FA:s rollover) med
 * kostnad, byggtid och vad saken gör när man håller musen över en ruta.
 * All text i spelet är på engelska.
 */

/** Korta beskrivningar i FA:s stil, i rollover-rutan. */
const DESCRIPTIONS = {
  landFactory: 'Constructs land units.',
  massExtractor: 'Extracts mass from a mass deposit.',
  powerGenerator: 'Generates energy.',
  massStorage: 'Stores mass.',
  energyStorage: 'Stores energy.',
  wall: 'Blocks enemy movement. Enemies path around walls.',
  pointDefense: 'Direct-fire defensive turret.',
};

/** Grupper i rutnätet, i FA:s ordning: fabriker, ekonomi, försvar. */
const GROUPS = [
  ['landFactory'],
  ['massExtractor', 'powerGenerator', 'massStorage', 'energyStorage'],
  ['pointDefense', 'wall'],
];

export const TECH_TABS = [
  { key: 'TECH1', label: 'T1' },
  { key: 'TECH2', label: 'T2' },
  { key: 'TECH3', label: 'T3' },
  { key: 'EXPERIMENTAL', label: 'EXP' },
];

const TECH_BADGE = { TECH1: 'I', TECH2: 'II', TECH3: 'III', EXPERIMENTAL: 'IV' };

const SLOT_ORDER = ['LCH', 'RCH', 'Back'];

const fmt = (v) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));
const seconds = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)} s`);

/** Flikarna för urvalet: Build, plus en per plats som har uppgraderingar. */
export function menuTabs(enhanceable) {
  const tabs = [{ key: 'build', label: 'Build' }];
  if (!enhanceable) return tabs;
  const slots = new Set(enhancementsFor(enhanceable.type).map((k) => enhancements[k].slot));
  for (const slot of SLOT_ORDER) if (slots.has(slot)) tabs.push({ key: slot, label: SLOT_NAMES[slot] });
  return tabs;
}

function costRow(cost, time) {
  return `<div class="ro-stats"><span class="ro-mass">${cost.mass}</span>` +
    `<span class="ro-energy">${cost.energy}</span>` +
    (time != null ? `<span class="ro-time">${seconds(time)}</span>` : '') + '</div>';
}

function structureRollover(type, power) {
  const def = structures[type];
  const name = def.unitName ? `${def.unitName} <span class="ro-sub">${def.name}</span>` : def.name;
  const facts = [`HP ${def.maxHp}`];
  if (def.production?.mass) facts.push(`<span class="ro-gives">+${fmt(def.production.mass)} mass/s</span>`);
  if (def.production?.energy) facts.push(`<span class="ro-gives">+${fmt(def.production.energy)} energy/s</span>`);
  if (def.upkeep?.energy) facts.push(`<span class="ro-takes">−${fmt(def.upkeep.energy)} energy/s</span>`);
  if (def.storage?.mass) facts.push(`Stores ${def.storage.mass} mass`);
  if (def.storage?.energy) facts.push(`Stores ${def.storage.energy} energy`);
  if (def.weapon) facts.push(`${fmt(def.weapon.damage * def.weapon.rateOfFire)} DPS · range ${def.weapon.range}`);
  return `<div class="ro-name">${name}</div>` +
    `<div class="ro-desc">${DESCRIPTIONS[type] ?? ''}</div>` +
    costRow(def.cost, power > 0 ? def.buildTime / power : null) +
    `<div class="ro-facts">${facts.join(' · ')}</div>`;
}

function enhancementRollover(key, acu, order, power) {
  const enh = enhancements[key];
  const replaces = acu.enhancements?.[enh.slot];
  let status = '';
  if (hasEnhancement(acu, key)) status = '<span class="ro-gives">Installed</span>';
  else if (order) status = `In progress ${Math.floor(order.progress * 100)}% · Right-click: cancel`;
  else if (replaces) status = `<span class="ro-takes">Replaces ${enhancements[replaces].name}</span> · Shift+click: queue`;
  else status = 'Shift+click: queue';
  return `<div class="ro-name">${enh.name} <span class="ro-sub">${SLOT_NAMES[enh.slot]}</span></div>` +
    `<div class="ro-desc">${enh.description}</div>` +
    costRow(enh.cost, power > 0 ? enh.buildTime / power : null) +
    `<div class="ro-facts">${status}</div>`;
}

function tile(key, { badge = '', active = false, done = false, disabled = false, count = '' } = {}) {
  const b = document.createElement('button');
  b.className = 'bm-tile' + (active ? ' bm-active' : '') + (done ? ' bm-done' : '') + (disabled ? ' bm-disabled' : '');
  b.innerHTML = buildIcon(key) +
    (badge ? `<span class="bm-tech">${badge}</span>` : '') +
    (count ? `<span class="bm-count">${count}</span>` : '') +
    (done ? '<span class="bm-check">✓</span>' : '');
  b.addEventListener('mousedown', (e) => e.stopPropagation());
  return b;
}

/**
 * Bygger menyn. `state`:
 * - `buildable`: byggnadstyper som de markerade kan bygga
 * - `powerFor(type)`: de markerades sammanlagda byggkraft för typen
 * - `enhanceable`, `enhanceOrders`, `enhancePower`: markerad ACU, dess
 *   uppgraderingsorder och byggkraften på uppgraderingen (dess egen)
 * - `tab`, `tech`, `placing`, `hovered`: vald flik, tech-nivå, byggläge och ruta under musen
 * Returnerar { root, bars, refresh } där `bars` är uppgradering -> framstegsstapel
 * och `refresh()` ritar om informationsrutan (t.ex. framsteget i procent).
 */
export function renderBuildMenu(state, handlers) {
  const { buildable, powerFor, enhanceable, enhanceOrders, tab, tech, placing, hovered } = state;
  const root = document.createElement('div');
  root.className = 'bm';
  const bars = new Map();

  const rollover = document.createElement('div');
  rollover.className = 'bm-rollover';
  rollover.hidden = true;
  /** Innehållet i rutan som visas, så att det kan ritas om när framsteget ändras. */
  let current = null;
  const showRollover = (key, html) => {
    handlers.onHover(key);
    current = html;
    rollover.innerHTML = html();
    rollover.hidden = false;
  };
  const hover = (el, key, html) => {
    el.addEventListener('mouseenter', () => showRollover(key, html));
    el.addEventListener('mouseleave', () => {
      handlers.onHover(null);
      current = null;
      rollover.hidden = true;
    });
    if (hovered === key) showRollover(key, html);
  };

  // Flikar: Build och uppgraderingsplatserna.
  const tabs = document.createElement('div');
  tabs.className = 'bm-tabs' + (tab === 'build' ? ' bm-tabs-indent' : '');
  for (const t of menuTabs(enhanceable)) {
    const b = document.createElement('button');
    b.className = 'bm-tab' + (t.key === tab ? ' bm-tab-on' : '');
    b.textContent = t.label;
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', () => handlers.onTab(t.key));
    tabs.appendChild(b);
  }
  root.appendChild(tabs);

  const body = document.createElement('div');
  body.className = 'bm-body';
  const grid = document.createElement('div');
  grid.className = 'bm-grid';

  if (tab === 'build') {
    // Tech-nivåer till vänster, som i FA; nivåer utan något att bygga är gråa.
    const techs = document.createElement('div');
    techs.className = 'bm-techs';
    const techOf = (type) => structures[type].techCategory ?? 'TECH1';
    for (const t of TECH_TABS) {
      const has = buildable.some((type) => techOf(type) === t.key);
      const b = document.createElement('button');
      b.className = 'bm-techtab' + (t.key === tech ? ' bm-tab-on' : '') + (has ? '' : ' bm-disabled');
      b.textContent = t.label;
      b.disabled = !has;
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      b.addEventListener('click', () => handlers.onTech(t.key));
      techs.appendChild(b);
    }
    body.appendChild(techs);

    const shown = buildable.filter((type) => techOf(type) === tech);
    const order = GROUPS.flat();
    const groupOf = (type) => GROUPS.findIndex((g) => g.includes(type));
    shown.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    let lastGroup = null;
    for (const type of shown) {
      const group = groupOf(type);
      if (lastGroup !== null && group !== lastGroup) grid.appendChild(Object.assign(document.createElement('span'), { className: 'bm-gap' }));
      lastGroup = group;
      const b = tile(type, { badge: TECH_BADGE[techOf(type)], active: placing === type });
      b.addEventListener('click', () => handlers.onBuild(type));
      hover(b, type, () => structureRollover(type, powerFor(type)));
      grid.appendChild(b);
    }
  } else {
    const power = state.enhancePower ?? 0;
    for (const key of enhancementsFor(enhanceable.type).filter((k) => enhancements[k].slot === tab)) {
      const installed = hasEnhancement(enhanceable, key);
      const queuedAt = enhanceOrders.findIndex((o) => o.enhancement === key);
      const b = tile(key, { done: installed, count: queuedAt > 0 ? `${queuedAt + 1}` : '' });
      b.addEventListener('click', (e) => { if (!installed) handlers.onEnhance(key, e.shiftKey); });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (queuedAt >= 0) handlers.onCancelEnhance(key);
      });
      hover(b, key, () => enhancementRollover(key, enhanceable, enhanceOrders.find((o) => o.enhancement === key), power));
      const bar = document.createElement('span');
      bar.className = 'bm-progress';
      b.appendChild(bar);
      bars.set(key, bar);
      grid.appendChild(b);
    }
  }
  body.appendChild(grid);
  root.appendChild(body);
  root.appendChild(rollover);
  const refresh = () => {
    if (current) rollover.innerHTML = current();
  };
  return { root, bars, refresh };
}
