import { directorInfo, difficultyLabel } from '../sim/director.js';

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Panel uppe till höger: överlevd tid mot målet, fiendens tryck just nu,
 * antal fiender och ett reglage för svårighetsgrad (0–100). Visar också korta
 * notiser (t.ex. vid seger). All text är på engelska.
 */
export function createThreatPanel(el, toastEl, { onDifficulty }) {
  el.innerHTML = `
    <div class="threat-title"></div>
    <div class="threat-status"></div>
    <div class="threat-enemies"></div>
    <label class="threat-difficulty">
      <span class="threat-difficulty-label"></span>
      <input type="range" min="0" max="100" step="1" />
    </label>`;
  const title = el.querySelector('.threat-title');
  const status = el.querySelector('.threat-status');
  const enemies = el.querySelector('.threat-enemies');
  const label = el.querySelector('.threat-difficulty-label');
  const slider = el.querySelector('input');
  slider.addEventListener('mousedown', (e) => e.stopPropagation());
  // Piltangenter på reglaget ska inte panorera kameran.
  slider.addEventListener('keydown', (e) => e.stopPropagation());
  slider.addEventListener('input', () => {
    label.textContent = `Difficulty ${slider.value} · ${difficultyLabel(Number(slider.value))}`;
    onDifficulty(Number(slider.value));
  });

  let toastTimer = null;
  let sliderInitialized = false;

  return {
    update(world) {
      const info = directorInfo(world);
      if (!sliderInitialized) {
        slider.value = info.difficulty;
        sliderInitialized = true;
      }
      if (document.activeElement !== slider) {
        label.textContent = `Difficulty ${info.difficulty} · ${info.label}`;
      }
      title.textContent = info.state === 'victory'
        ? 'Victory! You survived'
        : `Survive ${clock(info.elapsed)} / ${clock(info.survival)}`;
      status.textContent = info.state === 'grace'
        ? `Enemies arrive in ${clock(info.graceLeft)}`
        : `Enemy income ${info.rate.toFixed(1)} mass/s`;
      enemies.textContent = `${info.enemies} ${info.enemies === 1 ? 'enemy' : 'enemies'} on the field`;
    },

    /** Visar en kort notis mitt på skärmen. */
    toast(text) {
      toastEl.textContent = text;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
    },
  };
}
