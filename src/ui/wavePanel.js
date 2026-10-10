import { waveInfo } from '../sim/waves.js';
import { getDef } from '../sim/entities.js';

/**
 * Vågpanel uppe till höger: vilken våg det är, hur många fiender som är kvar,
 * vad som kommer härnäst och knappen för att starta nästa våg.
 * Visar också en kort notis när en våg är besegrad. All text är på engelska.
 */
export function createWavePanel(el, toastEl, { onStartWave }) {
  el.innerHTML = `
    <div class="wave-title"></div>
    <div class="wave-status"></div>
    <div class="wave-preview"></div>
    <button class="wave-button">Next Wave</button>`;
  const title = el.querySelector('.wave-title');
  const status = el.querySelector('.wave-status');
  const preview = el.querySelector('.wave-preview');
  const button = el.querySelector('.wave-button');
  button.addEventListener('click', () => onStartWave());
  button.addEventListener('mousedown', (e) => e.stopPropagation());

  let toastTimer = null;

  return {
    update(world) {
      const info = waveInfo(world);
      if (info.state === 'active') {
        title.textContent = `Wave ${info.current} / ${info.total}`;
        status.textContent = `${info.remaining} ${info.remaining === 1 ? 'enemy' : 'enemies'} remaining`;
        preview.textContent = '';
      } else if (info.state === 'build') {
        title.textContent = info.completed === 0 ? 'Build phase' : `Wave ${info.completed} / ${info.total} cleared`;
        status.textContent = `Next: wave ${info.next.number} · bonus ${info.next.bonus} mass`;
        preview.textContent = Object.entries(info.next.preview)
          .map(([type, n]) => `${n}× ${getDef(type).unitName ?? getDef(type).name}`)
          .join(', ');
      } else {
        title.textContent = `All ${info.total} waves cleared`;
        status.textContent = 'Victory!';
        preview.textContent = '';
      }
      button.disabled = info.state !== 'build';
      button.hidden = info.state === 'complete';
    },

    /** Visar en kort notis, t.ex. när en våg är besegrad. */
    toast(text) {
      toastEl.textContent = text;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
    },
  };
}
