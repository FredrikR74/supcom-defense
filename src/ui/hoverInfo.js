import { getDef } from '../sim/entities.js';

/** Namn och HP-stapel ovanför den entitet musen är över. */
export function createHoverInfo(el) {
  el.innerHTML = `
    <div class="hover-name"></div>
    <div class="hp-bar"><div class="hp-fill"></div></div>
    <div class="hover-hp"></div>`;
  const name = el.querySelector('.hover-name');
  const fill = el.querySelector('.hp-fill');
  const hp = el.querySelector('.hover-hp');
  el.hidden = true;

  return {
    /** `entity` eller null; `screen` är {x, y} i pixlar där stapeln ska sitta. */
    update(entity, screen) {
      el.hidden = !entity;
      if (!entity) return;
      const frac = entity.hp / entity.maxHp;
      name.textContent = getDef(entity.type)?.name ?? entity.type;
      fill.style.width = `${frac * 100}%`;
      fill.style.background = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#facc15' : '#ef4444';
      hp.textContent = `${Math.ceil(entity.hp)} / ${entity.maxHp}`;
      el.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
    },
  };
}
