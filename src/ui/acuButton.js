import { PLAYER_ID } from '../sim/constants.js';
import { getEntity } from '../sim/entities.js';
import { acuRespawnIn } from '../sim/acu.js';
import { installedEnhancements } from '../sim/enhancements.js';
import { buildIcon } from './buildIcons.js';
import enhancements from '../data/enhancements.js';

/** Hur länge knappen blinkar rött efter att ACU:n tagit skada (sekunder). */
const HIT_FLASH = 1;

/**
 * ACU-knappen uppe till vänster, som i FA: alltid synlig, med ACU:ns bild,
 * hälsostapel och HP. Klick markerar ACU:n, dubbelklick markerar och centrerar
 * kameran på den. Knappen blinkar rött när ACU:n tar skada, och medan den är
 * död visas nedräkningen tills den återuppstår. Medan ACU:n bygger en
 * uppgradering visas den med en framstegsstapel.
 */
export function createAcuButton(el, { onSelect, onCenter }) {
  el.innerHTML = `<span class="acu-icon">${buildIcon('acu')}</span>` +
    '<span class="acu-body"><span class="acu-name">ACU <span class="acu-vet"></span></span>' +
    '<span class="acu-bar"><span class="acu-fill"></span></span>' +
    '<span class="acu-hp"></span>' +
    '<span class="acu-upgrade" hidden><span class="acu-upbar"><span class="acu-upfill"></span></span>' +
    '<span class="acu-uptext"></span></span></span>';
  el.title = 'Click: select ACU · Double-click: select and center';
  const fill = el.querySelector('.acu-fill');
  const hpText = el.querySelector('.acu-hp');
  const vet = el.querySelector('.acu-vet');
  const upgrade = el.querySelector('.acu-upgrade');
  const upFill = el.querySelector('.acu-upfill');
  const upText = el.querySelector('.acu-uptext');
  let world = null;
  let lastHp = null;
  let hitUntil = 0;

  el.addEventListener('mousedown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const acu = world && getEntity(world, world.acuId);
    if (!acu) return;
    onSelect(acu);
    if (e.detail >= 2) onCenter(acu);
  });

  return {
    update(w, selection) {
      world = w;
      const acu = getEntity(w, w.acuId);
      const alive = Boolean(acu && acu.owner === PLAYER_ID && acu.hp > 0);
      el.classList.toggle('acu-dead', !alive);
      el.classList.toggle('acu-selected', alive && selection.has(acu.id));
      if (!alive) {
        lastHp = null;
        fill.style.width = '0%';
        const respawn = acuRespawnIn(w);
        hpText.textContent = respawn != null ? `Respawning in ${Math.ceil(respawn)} s` : 'Destroyed';
        vet.textContent = '';
        upgrade.hidden = true;
        el.classList.remove('acu-hit');
        return;
      }
      const now = performance.now() / 1000;
      if (lastHp != null && acu.hp < lastHp - 1e-6) hitUntil = now + HIT_FLASH;
      lastHp = acu.hp;
      el.classList.toggle('acu-hit', now < hitUntil);

      const frac = Math.max(0, Math.min(1, acu.hp / acu.maxHp));
      fill.style.width = `${frac * 100}%`;
      fill.style.background = frac > 0.6 ? '#4ade80' : frac > 0.3 ? '#facc15' : '#ef4444';
      hpText.textContent = `${Math.ceil(acu.hp)} / ${Math.round(acu.maxHp)}`;
      const enhancing = acu.orders[0]?.type === 'enhance' ? acu.orders[0] : null;
      upgrade.hidden = !enhancing;
      if (enhancing) {
        const pct = Math.floor(enhancing.progress * 100);
        upFill.style.width = `${pct}%`;
        const text = `${enhancements[enhancing.enhancement].name} ${pct}%`;
        if (upText.textContent !== text) upText.textContent = text;
      }
      const upgrades = installedEnhancements(acu).length;
      vet.textContent = '★'.repeat(acu.vetLevel ?? 0) + (upgrades ? ` +${upgrades}` : '');
      vet.title = upgrades ? `${upgrades} upgrade${upgrades > 1 ? 's' : ''} installed` : '';
    },
  };
}
