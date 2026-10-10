import { directorInfo, difficultyLabel, threatRate } from '../sim/director.js';

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Panel uppe till höger: överlevd tid, fiendens tryck just nu (och hur det växer),
 * antal fiender och ett reglage för svårighetsgrad (0–100). Visar också korta
 * notiser. All text är på engelska.
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
      title.textContent = info.state === 'defeat'
        ? `Core destroyed at ${clock(info.elapsed)}`
        : `Survived ${clock(info.elapsed)}`;
      if (info.state === 'grace') {
        status.textContent = `Enemies arrive in ${clock(info.graceLeft)}`;
      } else {
        // Hur mycket trycket ökar den närmaste minuten.
        const inAMinute = threatRate({ ...world.director, elapsed: world.director.elapsed + 60 });
        status.textContent = `Enemy income ${info.rate.toFixed(1)} mass/s (+${(inAMinute - info.rate).toFixed(1)}/min)`;
      }
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
