const EDGE_PIXELS = 8;
/** Panoreringsfart i världsenheter per sekund, per enhet kameraavstånd. */
const PAN_SPEED = 1.2;
const ZOOM_PER_WHEEL_UNIT = 1.0015;

const KEY_DIRS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/** Tangentbord, skärmkant och scrollhjul styr kameran. */
export function createCameraInput(canvas, rig, pickGround) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, inside: false };

  window.addEventListener('keydown', (e) => {
    if (KEY_DIRS[e.code]) {
      keys.add(e.code);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.inside = true;
  });
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });

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
    /** Muspekarens position i NDC, eller null om den är utanför canvasen. */
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
      if (mouse.inside && document.hasFocus()) {
        if (mouse.x < EDGE_PIXELS) dx -= 1;
        if (mouse.x > canvas.clientWidth - EDGE_PIXELS) dx += 1;
        if (mouse.y < EDGE_PIXELS) dz -= 1;
        if (mouse.y > canvas.clientHeight - EDGE_PIXELS) dz += 1;
      }
      if (dx === 0 && dz === 0) return;

      const len = Math.hypot(dx, dz);
      const step = PAN_SPEED * rig.distance * frameSeconds;
      rig.pan((dx / len) * step, (dz / len) * step);
    },
  };
}
