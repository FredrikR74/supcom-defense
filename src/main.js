import { createWorld, tickWorld, TICK_SECONDS } from './sim/world.js';
import { createFixedStep } from './loop.js';
import { createRenderer } from './render/scene.js';
import { createDebugOverlay } from './ui/debug.js';

const world = createWorld({ seed: 1 });
const step = createFixedStep(TICK_SECONDS);
const renderer = createRenderer(document.getElementById('game'));
const debug = createDebugOverlay(document.getElementById('debug'));

let last = performance.now();

function frame(now) {
  const frameSeconds = (now - last) / 1000;
  last = now;

  const { ticks, alpha } = step.advance(frameSeconds);
  for (let i = 0; i < ticks; i++) tickWorld(world);

  renderer.render(world, alpha, frameSeconds);
  debug.update(world, frameSeconds);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
