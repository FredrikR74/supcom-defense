import { createWorld, tickWorld, TICK_SECONDS } from './sim/world.js';
import { createFixedStep } from './loop.js';
import { createRenderer } from './render/renderer.js';
import { createCameraInput } from './input/cameraInput.js';
import { createDebugOverlay } from './ui/debug.js';
import firstDefense from './data/maps/firstDefense.js';

const canvas = document.getElementById('game');
const world = createWorld({ seed: 1, map: firstDefense });
const step = createFixedStep(TICK_SECONDS);
const view = createRenderer(canvas, world);
const cameraInput = createCameraInput(canvas, view.rig, view.pickGround);
const debug = createDebugOverlay(document.getElementById('debug'));

let last = performance.now();

function frame(now) {
  const frameSeconds = (now - last) / 1000;
  last = now;

  const { ticks, alpha } = step.advance(frameSeconds);
  for (let i = 0; i < ticks; i++) tickWorld(world);

  // Begränsa så att en lång frame (t.ex. efter en bakgrundsflik) inte ger ett jättehopp.
  cameraInput.update(Math.min(frameSeconds, 0.1));
  view.render(alpha, frameSeconds);

  const ndc = cameraInput.mouseNdc();
  const cursor = ndc && view.pickAtNdc(ndc.x, ndc.y);
  debug.update(world, frameSeconds, [
    `zoom ${view.rig.distance.toFixed(0)}${view.isStrategic() ? ' (strategisk)' : ''}`,
    cursor
      ? `mus  ${cursor.x.toFixed(1)}, ${cursor.z.toFixed(1)}  h ${cursor.y.toFixed(2)}`
      : 'mus  -',
  ]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
