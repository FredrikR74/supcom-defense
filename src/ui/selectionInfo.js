import { PLAYER_ID } from '../sim/constants.js';
import { getDef, getEntity } from '../sim/entities.js';
import { regenRate } from '../sim/veterancy.js';

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

/** Namn, HP, veterancy, kills och stridsvärden för en entitet. */
function describe(e, { enemy }) {
  const def = getDef(e.type);
  if (e.kind === 'wreck') {
    return `<div class="info-name">Wreckage <span class="info-sub">${def.unitName ?? def.name}</span></div>` +
      row('Mass', Math.round(e.mass));
  }
  const name = def.unitName ? `${def.unitName} <span class="info-sub">${def.name}</span>` : def.name;
  const regen = regenRate(e);
  let html = `<div class="info-name ${enemy ? 'info-enemy' : ''}">${name} <span class="info-vet">${stars(e.vetLevel)}</span></div>`;
  if (enemy) html += `<div class="info-row info-sub">${def.faction ?? 'Enemy'} · enemy</div>`;
  html += row('HP', `${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}${regen ? ` <span class="info-sub">(+${regen}/s)</span>` : ''}`);
  const w = def.weapon;
  if (w) {
    const dps = w.damage * w.rateOfFire;
    html += row('Weapon', `${w.damage} × ${fmt(w.rateOfFire)}/s <span class="info-sub">(${fmt(dps)} DPS)</span>`);
    html += row('Range', `${w.range}${w.ballistic ? ' <span class="info-sub">(artillery)</span>' : ''}`);
    html += row('Kills', e.kills ?? 0);
  } else if (e.kind === 'unit' && !def.buildPower) {
    html += row('Weapon', '<span class="info-sub">unarmed</span>');
  }
  if (e.kind === 'unit') html += row('Speed', def.speed);
  if (def.buildPower) html += row('Build rate', def.buildPower);
  if (enemy && def.cost) html += row('Mass value', def.cost.mass);
  if (e.kind === 'structure' && !e.built) html += row('Building', `${Math.floor(e.progress * 100)}%`);
  return html;
}

/**
 * Info nere till vänster om det som är markerat (eller en fiende man klickat på):
 * namn, HP, veterancy, kills, vapen och fart, och för egna saker vad de ger
 * och drar i mass och energi per sekund. Flera markerade: antal och summan.
 */
export function createSelectionInfo(el) {
  return {
    update(world, selection, ui = {}) {
      const selected = world.entities.filter((e) => selection.has(e.id) && e.owner === PLAYER_ID);
      const inspected = selected.length === 0 && ui.inspectId != null ? getEntity(world, ui.inspectId) : null;
      if (ui.inspectId != null && !inspected) ui.inspectId = null;

      el.hidden = selected.length === 0 && !inspected;
      if (el.hidden) return;

      if (inspected) {
        el.innerHTML = describe(inspected, { enemy: inspected.owner !== PLAYER_ID && inspected.owner !== 0 });
        return;
      }

      const gives = { mass: 0, energy: 0 };
      const takes = { mass: 0, energy: 0 };
      for (const e of selected) {
        const eco = economyOf(e);
        for (const r of ['mass', 'energy']) {
          gives[r] += eco.gives[r];
          takes[r] += eco.takes[r];
        }
      }

      const head = selected.length === 1
        ? describe(selected[0], { enemy: false })
        : `<div class="info-name">${selected.length} selected</div>`;
      const economy = economyLine('Produces', gives, '+', 'info-gives') + economyLine('Consumes', takes, '−', 'info-takes');
      el.innerHTML = head + (economy || '<div class="info-row info-sub">No resource use</div>');
    },
  };
}
