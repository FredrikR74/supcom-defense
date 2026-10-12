import { difficultyLabel } from '../sim/director.js';

/**
 * Startmeny: välj karta och svårighetsgrad. Returnerar ett löfte som löses med
 * { map, difficulty } när spelaren trycker Start. All text är på engelska.
 */
export function showStartMenu(el, maps, { difficulty = 50 } = {}) {
  el.innerHTML = `
    <div class="menu-box">
      <div class="menu-title">SupCom Defense</div>
      <div class="menu-sub">Hold the Quantum Gateway against the endless Cybran assault</div>
      <div class="menu-section">Map</div>
      <div class="menu-maps"></div>
      <div class="menu-section">Difficulty</div>
      <label class="menu-difficulty">
        <span class="menu-difficulty-label"></span>
        <input type="range" min="0" max="100" step="1" />
      </label>
      <button class="menu-start">Start</button>
      <div class="menu-help">
        WASD / screen edge: pan · Wheel: zoom · Left-click: select · Right-click: move, attack, repair, reclaim<br />
        Shift: queue · P: patrol · Ctrl+1–9: set group · 1–9: select group · Delete: sell · Space: pause · +/−: game speed · M: sound
      </div>
      <div class="menu-dev"><a href="${import.meta.env.BASE_URL}sfx/CREDITS.txt" target="_blank" rel="noopener">Sound credits</a>${
        import.meta.env.DEV ? ' · Dev: <a href="/sounds.html">Sound test</a> · <a href="/models.html">Models</a>' : ''}</div>
    </div>`;
  const mapList = el.querySelector('.menu-maps');
  const slider = el.querySelector('input');
  const label = el.querySelector('.menu-difficulty-label');
  let chosen = maps[0];

  for (const map of maps) {
    const b = document.createElement('button');
    b.className = 'menu-map';
    b.innerHTML = `<span class="menu-map-name">${map.name}</span><span class="menu-map-desc">${map.description}</span>`;
    b.addEventListener('click', () => {
      chosen = map;
      for (const other of mapList.children) other.classList.toggle('menu-map-active', other === b);
    });
    if (map === chosen) b.classList.add('menu-map-active');
    mapList.appendChild(b);
  }

  const showLabel = () => {
    label.textContent = `${slider.value} · ${difficultyLabel(Number(slider.value))}`;
  };
  slider.value = difficulty;
  slider.addEventListener('input', showLabel);
  showLabel();

  el.hidden = false;
  return new Promise((resolve) => {
    el.querySelector('.menu-start').addEventListener('click', () => {
      el.hidden = true;
      resolve({ map: chosen, difficulty: Number(slider.value) });
    });
  });
}
