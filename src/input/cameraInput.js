/** Hur nära kanten (i pixlar) musen ska vara för att panorera. */
export const EDGE_PIXELS = 24;
/** Panoreringsfart i världsenheter per sekund, per enhet kameraavstånd. */
const PAN_SPEED = 1.2;
const ZOOM_PER_WHEEL_UNIT = 1.0015;

const KEY_DIRS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/** Panoreringsriktning ([dx, dz], varje -1/0/1) för en musposition nära skärmkanten. */
export function edgePanDirection(x, y, width, height, edge = EDGE_PIXELS) {
  let dx = 0;
  let dz = 0;
  if (x < edge) dx -= 1;
  if (x > width - edge) dx += 1;
  if (y < edge) dz -= 1;
  if (y > height - edge) dz += 1;
  return [dx, dz];
}

/** Tangentbord, skärmkant och scrollhjul styr kameran. */
export function createCameraInput(canvas, rig, pickGround) {
  const keys = new Set();
  // `inside`: musen är över fönstret. `edgeHold`: musen lämnade fönstret över en
  // kant, så vi fortsätter panorera dit tills den kommer tillbaka.
  const mouse = { x: 0, y: 0, inside: false, edgeHold: false };

  const clampToCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
    mouse.y = Math.min(Math.max(e.clientY - r.top, 0), r.height);
  };

  window.addEventListener('keydown', (e) => {
    if (KEY_DIRS[e.code]) {
      keys.add(e.code);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.edgeHold = false;
  });

  window.addEventListener('mousemove', (e) => {
    clampToCanvas(e);
    mouse.inside = true;
    mouse.edgeHold = false;
  });
  window.addEventListener('mouseout', (e) => {
    if (e.relatedTarget) return; // flyttade bara mellan element
    clampToCanvas(e);
    mouse.inside = false;
    const [dx, dz] = edgePanDirection(mouse.x, mouse.y, canvas.clientWidth, canvas.clientHeight);
    mouse.edgeHold = dx !== 0 || dz !== 0;
  });

  const toNdc = (x, y) => ({
    x: (x / canvas.clientWidth) * 2 - 1,
    y: -(y / canvas.clientHeight) * 2 + 1,
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const ndc = toNdc(e.clientX - r.left, e.clientY - r.top);
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    rig.zoomAt(ndc.x, ndc.y, Math.pow(ZOOM_PER_WHEEL_UNIT, delta), pickGround);
  }, { passive: false });

  return {
    /** Muspekarens position i pixlar och NDC, eller null om den är utanför fönstret. */
    mouseScreen() {
      return mouse.inside ? { x: mouse.x, y: mouse.y } : null;
    },
    mouseNdc() {
      return mouse.inside ? toNdc(mouse.x, mouse.y) : null;
    },

    update(frameSeconds) {
      let dx = 0;
      let dz = 0;
      for (const code of keys) {
        dx += KEY_DIRS[code][0];
        dz += KEY_DIRS[code][1];
      }
      if ((mouse.inside || mouse.edgeHold) && document.hasFocus()) {
        const [ex, ez] = edgePanDirection(mouse.x, mouse.y, canvas.clientWidth, canvas.clientHeight);
        dx += ex;
        dz += ez;
      }
      if (dx === 0 && dz === 0) return;

      const len = Math.hypot(dx, dz);
      const step = PAN_SPEED * rig.distance * frameSeconds;
      rig.pan((dx / len) * step, (dz / len) * step);
    },
  };
}
