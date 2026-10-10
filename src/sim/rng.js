/**
 * Seedad pseudoslumpgenerator (mulberry32).
 * All slump i sim/ ska gå via denna, aldrig Math.random().
 */
export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** Flyttal i [0, 1). */
    next,
    /** Heltal i [min, max] (inklusive). */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** Flyttal i [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    getState() {
      return state;
    },
  };
}
