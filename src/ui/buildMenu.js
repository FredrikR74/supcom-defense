import structures from '../data/structures.js';
import units from '../data/units.js';
import enhancements from '../data/enhancements.js';
import { enhancementsFor, hasEnhancement, SLOT_NAMES } from '../sim/enhancements.js';
import { buildIcon } from './buildIcons.js';
import { techName } from './tech.js';

/**
 * Bygg- och fabriksmenyn i FA:s stil: flikar överst (Build och, för ACU:n,
 * en flik per uppgraderingsplats), tech-nivåer T1–EXP till vänster, ett
 * rutnät med ikoner och kortnamn, och en informationsruta (FA:s rollover) med
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
  engineer: 'Builds and repairs structures and reclaims wreckage.',
  snoop: 'Fast, lightly armed scout.',
  mechMarine: 'Fast, lightly armored assault bot.',
  striker: 'Main battle tank.',
  lobo: 'Mobile artillery. Long range, slow rate of fire.',
  archer: 'Mobile anti-air gun. Fires only at air units.',
  landFactoryT2: 'Constructs Tech 1 and Tech 2 land units.',
  massExtractorT2: 'Extracts mass from a mass deposit. Upgradeable.',
  massExtractorT3: 'Extracts mass from a mass deposit.',
  powerGeneratorT2: 'Generates large amounts of energy.',
  massFabricator: 'Converts energy into mass.',
  pointDefenseT2: 'Heavy direct-fire defensive turret with splash damage.',
  artilleryT2: 'Long-range stationary artillery. Cannot fire at close targets.',
  shieldGenerator: 'Projects a shield that absorbs incoming enemy fire.',
  engineerT2: 'Builds Tech 1 and Tech 2 structures, repairs and reclaims.',
  pillar: 'Heavy tank.',
  mongoose: 'Gatling bot. Long-range sustained fire.',
  riptide: 'Fast, heavily armored amphibious tank.',
  flapjack: 'Long-range mobile missile launcher. Cannot fire at close targets.',
  skyBoxer: 'Mobile flak artillery. Fires only at air units.',
  parashield: 'Mobile shield generator that protects nearby units.',
  radar: 'Reveals enemy units within its radius as radar contacts. Upgradeable.',
  radarT2: 'Reveals enemy units within a large radius as radar contacts.',
};

/** Namn under ikonen, så att man ser vad rutan är utan att hålla musen över den. */
const LABELS = {
  acu: 'ACU',
  core: 'Quantum Gateway',
  landFactory: 'Land Factory',
  massExtractor: 'Mass Extractor',
  powerGenerator: 'Power Gen.',
  massStorage: 'Mass Storage',
  energyStorage: 'Energy Storage',
  wall: 'Wall',
  pointDefense: 'Point Defense',
  engineer: 'Engineer',
  snoop: 'Snoop',
  mechMarine: 'Mech Marine',
  striker: 'Striker',
  lobo: 'Lobo',
  archer: 'Archer',
  landFactoryT2: 'Land Factory HQ',
  massExtractorT2: 'T2 Mass Ext.',
  massExtractorT3: 'T3 Mass Ext.',
  powerGeneratorT2: 'T2 Power Gen.',
  massFabricator: 'Mass Fab.',
  pointDefenseT2: 'Triad',
  artilleryT2: 'Klink Hammer',
  shieldGenerator: 'Shield Gen.',
  engineerT2: 'T2 Engineer',
  pillar: 'Pillar',
  mongoose: 'Mongoose',
  riptide: 'Riptide',
  flapjack: 'Flapjack',
  skyBoxer: 'Sky Boxer',
  parashield: 'Parashield',
  rhino: 'Rhino',
  hoplite: 'Hoplite',
  wagner: 'Wagner',
  viper: 'Viper',
  radar: 'Radar',
  radarT2: 'T2 Radar',
  mantis: 'Mantis',
  mole: 'Mole',
  medusa: 'Medusa',
  zephyrAmplifier: 'Zephyr Amp.',
  nanoRepair: 'Nano-Repair',
  resourceAllocation: 'Resource Alloc.',
};

/** Kortnamnet för en typ (byggnad, enhet eller uppgradering). */
export const shortName = (key) => LABELS[key] ?? key;

/** Grupper i rutnätet, i FA:s ordning: fabriker, ekonomi, försvar; enheter: ingenjör, strid, stöd. */
const GROUPS = [
  ['landFactory', 'landFactoryT2'],
  ['massExtractor', 'massExtractorT2', 'massExtractorT3', 'powerGenerator', 'powerGeneratorT2', 'massFabricator',
    'massStorage', 'energyStorage'],
  ['pointDefense', 'pointDefenseT2', 'artilleryT2', 'shieldGenerator', 'wall'],
  ['radar', 'radarT2'],
  ['engineer', 'engineerT2'],
  ['snoop', 'mechMarine', 'striker', 'pillar', 'mongoose', 'riptide'],
  ['lobo', 'archer', 'flapjack', 'skyBoxer', 'parashield'],
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

/** Flikarna för en byggare: Build, plus en per plats som har uppgraderingar. */
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

function nameLine(def, sub = '') {
  const name = def.unitName ? `${def.unitName} <span class="ro-sub">${techName(def)}</span>` : techName(def);
  return `<div class="ro-name">${name}${sub ? ` <span class="ro-sub">${sub}</span>` : ''}</div>`;
}

function weaponFact(w) {
  const role = w.antiAir ? ' (anti-air)' : w.ballistic ? ' (artillery)' : '';
  return `${fmt(w.damage * w.rateOfFire * (w.projectiles ?? 1))} DPS · range ${w.range}${role}`;
}

/** Rollover för en byggnad eller enhet; `power` är byggkraften som bygger den. */
function defRollover(type, def, power) {
  const facts = [`HP ${def.maxHp}`];
  if (def.production?.mass) facts.push(`<span class="ro-gives">+${fmt(def.production.mass)} mass/s</span>`);
  if (def.production?.energy) facts.push(`<span class="ro-gives">+${fmt(def.production.energy)} energy/s</span>`);
  if (def.upkeep?.energy) facts.push(`<span class="ro-takes">−${fmt(def.upkeep.energy)} energy/s</span>`);
  if (def.storage?.mass) facts.push(`Stores ${def.storage.mass} mass`);
  if (def.storage?.energy) facts.push(`Stores ${def.storage.energy} energy`);
  if (def.weapon) facts.push(weaponFact(def.weapon));
  if (def.shield) facts.push(`shield ${def.shield.maxHp} HP · radius ${def.shield.radius}`);
  if (def.radarRadius) facts.push(`radar ${def.radarRadius}`);
  if (def.visionRadius) facts.push(`vision ${def.visionRadius}`);
  if (def.speed) facts.push(`speed ${def.speed}`);
  if (def.buildPower && def.speed) facts.push(`build rate ${def.buildPower}`);
  return nameLine(def) +
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
  return nameLine(enh, SLOT_NAMES[enh.slot]) +
    `<div class="ro-desc">${enh.description}</div>` +
    costRow(enh.cost, power > 0 ? enh.buildTime / power : null) +
    `<div class="ro-facts">${status}</div>`;
}

function tile(item) {
  const b = document.createElement('button');
  b.className = 'bm-tile' + (item.active ? ' bm-active' : '') + (item.done ? ' bm-done' : '');
  b.innerHTML = `<span class="bm-icon">${buildIcon(item.key)}</span>` +
    `<span class="bm-label">${LABELS[item.key] ?? item.key}</span>` +
    (item.tech ? `<span class="bm-tech">${TECH_BADGE[item.tech]}</span>` : '') +
    (item.count ? `<span class="bm-count">${item.count}</span>` : '') +
    (item.done ? '<span class="bm-check">✓</span>' : '');
  b.addEventListener('mousedown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => item.onClick?.(e));
  b.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    item.onContext?.(e);
  });
  return b;
}

/**
 * Ritar en meny. `menu`: { tabs, tab, techs (visa tech-nivåer), tech, items, hovered }.
 * Varje item: { key, tech, rollover(), onClick, onContext, count, active, done, progress }.
 * `handlers`: { onTab, onTech, onHover }.
 * Returnerar { root, bars, refresh }: `bars` är key -> framstegsstapel för items
 * med `progress`, och `refresh()` ritar om informationsrutan (t.ex. procent).
 */
function renderMenu(menu, handlers) {
  const { tabs, tab, techs, tech, items, hovered } = menu;
  const root = document.createElement('div');
  root.className = 'bm';
  const bars = new Map();

  const rollover = document.createElement('div');
  rollover.className = 'bm-rollover';
  rollover.hidden = true;
  /** Innehållet i rutan som visas, så att det kan ritas om när framsteget ändras. */
  let current = null;
  const show = (item) => {
    handlers.onHover(item.key);
    current = item.rollover;
    rollover.innerHTML = current();
    rollover.hidden = false;
  };

  const tabRow = document.createElement('div');
  tabRow.className = 'bm-tabs' + (techs ? ' bm-tabs-indent' : '');
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'bm-tab' + (t.key === tab ? ' bm-tab-on' : '');
    b.textContent = t.label;
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', () => handlers.onTab(t.key));
    tabRow.appendChild(b);
  }
  root.appendChild(tabRow);

  const body = document.createElement('div');
  body.className = 'bm-body';
  const grid = document.createElement('div');
  grid.className = 'bm-grid';

  let shown = items;
  if (techs) {
    // Tech-nivåer till vänster, som i FA; nivåer utan något att bygga är gråa.
    const col = document.createElement('div');
    col.className = 'bm-techs';
    for (const t of TECH_TABS) {
      const has = items.some((i) => i.tech === t.key);
      const b = document.createElement('button');
      b.className = 'bm-techtab' + (t.key === tech ? ' bm-tab-on' : '') + (has ? '' : ' bm-disabled');
      b.textContent = t.label;
      b.disabled = !has;
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      b.addEventListener('click', () => handlers.onTech(t.key));
      col.appendChild(b);
    }
    body.appendChild(col);
    shown = items.filter((i) => i.tech === tech);
  }

  const order = GROUPS.flat();
  const groupOf = (key) => GROUPS.findIndex((g) => g.includes(key));
  shown = [...shown].sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99));
  let lastGroup = null;
  for (const item of shown) {
    const group = groupOf(item.key);
    if (lastGroup !== null && group !== lastGroup) {
      grid.appendChild(Object.assign(document.createElement('span'), { className: 'bm-gap' }));
    }
    lastGroup = group;
    const b = tile(item);
    b.addEventListener('mouseenter', () => show(item));
    b.addEventListener('mouseleave', () => {
      handlers.onHover(null);
      current = null;
      rollover.hidden = true;
    });
    if (item.progress) {
      const bar = document.createElement('span');
      bar.className = 'bm-progress';
      b.appendChild(bar);
      bars.set(item.key, bar);
    }
    if (hovered === item.key) show(item);
    grid.appendChild(b);
  }
  body.appendChild(grid);
  root.appendChild(body);
  root.appendChild(rollover);

  const refresh = () => {
    if (current) rollover.innerHTML = current();
  };
  return { root, bars, refresh };
}

/**
 * Byggmenyn för markerade byggare (ACU, ingenjörer). `state`:
 * - `buildable`: byggnadstyper som de markerade kan bygga
 * - `powerFor(type)`: de markerades sammanlagda byggkraft för typen
 * - `enhanceable`, `enhanceOrders`, `enhancePower`: markerad ACU, dess
 *   uppgraderingsorder och byggkraften på uppgraderingen (dess egen)
 * - `tab`, `tech`, `placing`, `hovered`: vald flik, tech-nivå, byggläge och ruta under musen
 */
export function renderBuildMenu(state, handlers) {
  const { buildable, powerFor, enhanceable, enhanceOrders, enhancePower, tab, tech, placing, hovered } = state;
  let items;
  if (tab === 'build') {
    items = buildable.map((type) => ({
      key: type,
      tech: structures[type].techCategory ?? 'TECH1',
      active: placing === type,
      rollover: () => defRollover(type, structures[type], powerFor(type)),
      onClick: () => handlers.onBuild(type),
    }));
  } else {
    items = enhancementsFor(enhanceable.type).filter((k) => enhancements[k].slot === tab).map((key) => {
      const installed = hasEnhancement(enhanceable, key);
      const queuedAt = enhanceOrders.findIndex((o) => o.enhancement === key);
      return {
        key,
        done: installed,
        count: queuedAt > 0 ? `${queuedAt + 1}` : '',
        progress: true,
        rollover: () => enhancementRollover(key, enhanceable, enhanceOrders.find((o) => o.enhancement === key), enhancePower),
        onClick: (e) => { if (!installed) handlers.onEnhance(key, e.shiftKey); },
        onContext: () => { if (queuedAt >= 0) handlers.onCancelEnhance(key); },
      };
    });
  }
  return renderMenu({ tabs: menuTabs(enhanceable), tab, techs: tab === 'build', tech, items, hovered }, handlers);
}

/**
 * Fabriksmenyn för markerade fabriker. `state`:
 * - `producible`: enhetstyper som fabrikerna kan bygga
 * - `queued(type)`: antal i köerna
 * - `power`: byggkraften för en fabrik (byggtiden i rutan gäller en fabrik)
 * - `tech`, `hovered`
 * `handlers`: { onProduce(type, e), onRemove(type, e), onTab, onTech, onHover }.
 */
export function renderFactoryMenu(state, handlers) {
  const { producible, queued, power, tech, hovered } = state;
  const items = producible.map((type) => ({
    key: type,
    tech: units[type].techCategory ?? 'TECH1',
    count: queued(type) ? `${queued(type)}` : '',
    progress: true,
    rollover: () => defRollover(type, units[type], power) +
      '<div class="ro-facts">Click: queue 1 · Shift/Ctrl: 5 · Right-click: remove</div>',
    onClick: (e) => handlers.onProduce(type, e),
    onContext: (e) => handlers.onRemove(type, e),
  }));
  return renderMenu({ tabs: [{ key: 'build', label: 'Build' }], tab: 'build', techs: true, tech, items, hovered }, handlers);
}
