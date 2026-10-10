/** Debugruta i hörnet: FPS, tick, tick per sekund och valfria extrarader. */
export function createDebugOverlay(el) {
  let frames = 0;
  let ticksAtLastSample = 0;
  let sampleTime = 0;
  let fps = 0;
  let tps = 0;

  return {
    update(world, frameSeconds, extraLines = []) {
      frames++;
      sampleTime += frameSeconds;
      if (sampleTime >= 1) {
        fps = frames / sampleTime;
        tps = (world.tick - ticksAtLastSample) / sampleTime;
        frames = 0;
        ticksAtLastSample = world.tick;
        sampleTime = 0;
      }
      el.textContent = [
        `FPS  ${fps.toFixed(0)}`,
        `tick ${world.tick}`,
        `TPS  ${tps.toFixed(1)}`,
        ...extraLines,
      ].join('\n');
    },
  };
}
