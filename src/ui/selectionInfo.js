import { PLAYER_ID } from '../sim/constants.js';
import { getDef } from '../sim/entities.js';
import { regenRate } from '../sim/veterancy.js';

const fmt = (v) => v.toFixed(1);
const stars = (level) => '★'.repeat(level ?? 0);

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

/**
 * Info om det som är markerat, nere till vänster: namn, HP, veterancy och vad
 * det ger respektive drar i mass och energi per sekund (inkl. upkeep och bygge).
 * Flera markerade: summan.
 */
export function createSelectionInfo(el) {
  return {
    update(world, selection) {
      const selected = world.entities.filter((e) => selection.has(e.id) && e.owner === PLAYER_ID);
      el.hidden = selected.length === 0;
      if (selected.length === 0) return;

      const gives = { mass: 0, energy: 0 };
      const takes = { mass: 0, energy: 0 };
      for (const e of selected) {
        const eco = economyOf(e);
        for (const r of ['mass', 'energy']) {
          gives[r] += eco.gives[r];
          takes[r] += eco.takes[r];
        }
      }

      let head;
      if (selected.length === 1) {
        const e = selected[0];
        const def = getDef(e.type);
        const name = def.unitName ? `${def.unitName} <span class="info-sub">${def.name}</span>` : def.name;
        const regen = regenRate(e);
        head = `
          <div class="info-name">${name} <span class="info-vet">${stars(e.vetLevel)}</span></div>
          <div class="info-row"><span class="info-label">HP</span> ${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}${regen ? ` <span class="info-sub">(+${regen}/s)</span>` : ''}</div>`;
        if (def.weapon) {
          head += `<div class="info-row"><span class="info-label">Kills</span> ${e.kills ?? 0}</div>`;
        }
        if (e.kind === 'structure' && !e.built) {
          head += `<div class="info-row"><span class="info-label">Building</span> ${Math.floor(e.progress * 100)}%</div>`;
        }
      } else {
        head = `<div class="info-name">${selected.length} selected</div>`;
      }

      const economy = economyLine('Produces', gives, '+', 'info-gives') + economyLine('Consumes', takes, '−', 'info-takes');
      el.innerHTML = head + (economy || '<div class="info-row info-sub">No resource use</div>');
    },
  };
}
