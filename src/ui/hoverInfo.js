import { getDef } from '../sim/entities.js';
import { techName } from './tech.js';
import { isRevealed } from '../sim/intel.js';

/**
 * Namn och HP-stapel (eller byggframsteg) ovanför den entitet musen är över.
 * För en fabrik som producerar visas också vad den bygger och hur långt den kommit.
 */
export function createHoverInfo(el) {
  el.innerHTML = `
    <div class="hover-name"></div>
    <div class="hp-bar"><div class="hp-fill"></div></div>
    <div class="hover-hp"></div>
    <div class="hover-prod">
      <div class="hp-bar"><div class="hp-fill"></div></div>
      <div class="hover-prod-text"></div>
    </div>`;
  const name = el.querySelector('.hover-name');
  const fill = el.querySelector('.hp-fill');
  const hp = el.querySelector('.hover-hp');
  const prod = el.querySelector('.hover-prod');
  const prodFill = prod.querySelector('.hp-fill');
  const prodText = prod.querySelector('.hover-prod-text');
  el.hidden = true;

  return {
    /** `entity` eller null; `screen` är {x, y} i pixlar där stapeln ska sitta. */
    update(entity, screen) {
      el.hidden = !entity;
      if (!entity) return;
      const def = getDef(entity.type);
      name.textContent = (def?.unitName ? `${def.unitName} (${techName(def)})` : def ? techName(def) : entity.type) +
        (entity.vetLevel ? ` ${'★'.repeat(entity.vetLevel)}` : '');
      fill.parentElement.hidden = !isRevealed(entity);
      if (!isRevealed(entity)) {
        // Radarblipp: man vet bara att något finns där, som i FA.
        name.textContent = 'Radar contact';
        hp.textContent = 'Right-click: attack';
      } else if (entity.kind === 'wreck') {
        name.textContent = 'Wreckage';
        fill.style.width = '0%';
        hp.textContent = `Mass ${Math.round(entity.mass)}`;
      } else if (entity.kind === 'structure' && !entity.built) {
        fill.style.width = `${entity.progress * 100}%`;
        fill.style.background = '#67e8f9';
        hp.textContent = `Building ${Math.floor(entity.progress * 100)}%`;
      } else {
        const frac = entity.hp / entity.maxHp;
        fill.style.width = `${frac * 100}%`;
        fill.style.background = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#facc15' : '#ef4444';
        hp.textContent = `${Math.ceil(entity.hp)} / ${Math.round(entity.maxHp)}` +
          (entity.kills ? ` · ${entity.kills} ${entity.kills === 1 ? 'kill' : 'kills'}` : '');
      }

      const producing = entity.kind === 'structure' && entity.built && entity.productionQueue?.length > 0;
      prod.hidden = !producing;
      if (producing) {
        const unitDef = getDef(entity.productionQueue[0]);
        const pct = Math.floor(entity.productionProgress * 100);
        const more = entity.productionQueue.length - 1;
        prodFill.style.width = `${pct}%`;
        prodText.textContent = `${unitDef.unitName ?? techName(unitDef)} ${pct}%${more > 0 ? ` (+${more} queued)` : ''}`;
      }
      el.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
    },
  };
}
