import { PLAYER_ID, ENEMY_ID } from '../sim/constants.js';
import { INTEL } from '../sim/intel.js';

/**
 * Minikarta nere till höger: terrängen, kärnan, spawnpunkter, fyndigheter,
 * enheter och byggnader som prickar, och kamerans synfält. Det som ligger
 * utanför egen sikt är mörkare, och fiender syns bara inom sikt eller radar.
 * Klick eller drag flyttar kameran dit.
 */
export function createMinimap(el, world, view) {
  const SIZE = 180;
  const n = world.terrain.size;
  const scale = SIZE / n;
  el.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Terrängen ritas en gång: mörkare låglänt, ljusare högt.
  const background = document.createElement('canvas');
  background.width = background.height = n;
  const bg = background.getContext('2d');
  const image = bg.createImageData(n, n);
  const { heights } = world.terrain;
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const t = (heights[z * (n + 1) + x] - min) / (max - min || 1);
      const i = (z * n + x) * 4;
      image.data[i] = 50 + t * 90;
      image.data[i + 1] = 60 + t * 80;
      image.data[i + 2] = 40 + t * 60;
      image.data[i + 3] = 255;
    }
  }
  bg.putImageData(image, 0, 0);

  const toMap = (x, z) => [x * scale, z * scale];

  // Krigsdimman: mörkt där spelaren inte ser (se sim/intel.js).
  const fogCanvas = document.createElement('canvas');
  fogCanvas.width = fogCanvas.height = n;
  const fogCtx = fogCanvas.getContext('2d');
  const fogImage = fogCtx.createImageData(n, n);
  function drawFog() {
    if (!world.intel) return;
    const { vision } = world.intel;
    for (let i = 0; i < vision.length; i++) fogImage.data[i * 4 + 3] = vision[i] ? 0 : 130;
    fogCtx.putImageData(fogImage, 0, 0);
    ctx.drawImage(fogCanvas, 0, 0, SIZE, SIZE);
  }

  let dragging = false;
  const moveCamera = (e) => {
    const r = canvas.getBoundingClientRect();
    view.centerOn(((e.clientX - r.left) / r.width) * n, ((e.clientY - r.top) / r.height) * n);
  };
  canvas.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    dragging = true;
    moveCamera(e);
  });
  window.addEventListener('mousemove', (e) => { if (dragging) moveCamera(e); });
  window.addEventListener('mouseup', () => { dragging = false; });

  let lastDraw = 0;

  return {
    update() {
      const now = performance.now();
      if (now - lastDraw < 100) return; // 10 gånger per sekund räcker
      lastDraw = now;

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(background, 0, 0, SIZE, SIZE);
      drawFog();

      // Spawnpunkter och fyndigheter.
      ctx.fillStyle = '#ef4444';
      for (const s of world.map.spawns) {
        const [x, y] = toMap(s.x, s.z);
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 4, y + 3);
        ctx.lineTo(x - 4, y + 3);
        ctx.fill();
      }
      ctx.fillStyle = '#84cc16';
      for (const d of world.map.massDeposits) {
        const [x, y] = toMap(d.x, d.z);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }

      for (const e of world.entities) {
        const [x, y] = toMap(e.x, e.z);
        if (e.kind === 'wreck') {
          ctx.fillStyle = '#57534e';
          ctx.fillRect(x - 1, y - 1, 2, 2);
          continue;
        }
        // Fiender i dimman syns inte, de på radar som en prick.
        if (e.owner === ENEMY_ID && (e.intel ?? INTEL.VISIBLE) === INTEL.HIDDEN) continue;
        ctx.fillStyle = e.owner === PLAYER_ID ? '#3b82f6' : e.owner === ENEMY_ID ? '#ef4444' : '#9ca3af';
        if (e.kind === 'structure') {
          const s = Math.max(3, e.radius * 2 * scale);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, e.type === 'acu' ? 3 : 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Kamerans synfält.
      const corners = view.viewFootprint();
      if (corners) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        corners.forEach((c, i) => {
          const [x, y] = toMap(c.x, c.z);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
    },
  };
}
