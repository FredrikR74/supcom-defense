/**
 * Fast tidssteg: simuleringen stegas i jämna tick oavsett bildfrekvens.
 * `advance` returnerar hur många tick som ska köras och `alpha` (0..1),
 * hur långt vi kommit mot nästa tick, för interpolering i renderingen.
 */
export function createFixedStep(tickSeconds, { maxFrameSeconds = 0.25 } = {}) {
  let accumulator = 0;

  return {
    advance(frameSeconds) {
      accumulator += Math.min(frameSeconds, maxFrameSeconds);
      let ticks = 0;
      while (accumulator >= tickSeconds) {
        accumulator -= tickSeconds;
        ticks++;
      }
      return { ticks, alpha: accumulator / tickSeconds };
    },
  };
}
