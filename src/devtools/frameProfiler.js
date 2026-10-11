/**
 * Tidmätning per del av en bildruta (simulering, rendering, paneler). Visas i
 * debugrutan (F7) och i `game.profile` i webbläsarkonsolen, som millisekunder
 * per bildruta i snitt den senaste sekunden.
 */
export function createFrameProfiler() {
  let sums = {};
  let frames = 0;
  let elapsed = 0;
  let last = {};

  return {
    /** Kör `fn` och lägger tiden på `name`. */
    measure(name, fn) {
      const t = performance.now();
      const result = fn();
      sums[name] = (sums[name] ?? 0) + performance.now() - t;
      return result;
    },

    endFrame(frameSeconds) {
      frames++;
      elapsed += frameSeconds;
      if (elapsed < 1) return;
      last = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / frames]));
      sums = {};
      frames = 0;
      elapsed = 0;
    },

    /** Snittet per bildruta den senaste sekunden, dyrast först. */
    report() {
      return Object.entries(last).sort((a, b) => b[1] - a[1]);
    },
  };
}
