import { getDef } from './entities.js';
import { PLAYER_ID, ENEMY_ID } from './constants.js';

/**
 * Intel och krigsdimma som i FA, för spelaren: varje egen enhet och färdig
 * byggnad ser runt sig (`visionRadius`), och radar (`radarRadius`, även
 * ACU:ns OmniRadius och Snoopens radar) visar fiender längre bort.
 *
 * - Inom sikt syns en fiende helt (`e.intel === INTEL.VISIBLE`).
 * - Bara inom radar syns den som en radarblipp: ikonen men inte modellen,
 *   hälsan eller vad den är för enhet (`INTEL.RADAR`).
 * - Annars är den dold (`INTEL.HIDDEN`), och egna vapen väljer den inte som mål.
 *
 * En radarbyggnad måste få sin energi (upkeep) för att radarn ska fungera.
 * Rutnätet är kartans rutor; en fiende syns om rutan den står i syns.
 * Fienden (datorn) ser allt, så dess beteende ändras inte.
 */

export const INTEL = { HIDDEN: 0, RADAR: 1, VISIBLE: 2 };

export function createIntel(size) {
  return { size, vision: new Uint8Array(size * size), radar: new Uint8Array(size * size) };
}

/** Markerar alla rutor vars mitt är inom `r` från (x, z). */
function stamp(grid, size, x, z, r) {
  if (!(r > 0)) return;
  const z0 = Math.max(0, Math.floor(z - r));
  const z1 = Math.min(size - 1, Math.floor(z + r));
  for (let cz = z0; cz <= z1; cz++) {
    const dz = cz + 0.5 - z;
    const half = Math.sqrt(Math.max(0, r * r - dz * dz));
    const x0 = Math.max(0, Math.ceil(x - half - 0.5));
    const x1 = Math.min(size - 1, Math.floor(x + half - 0.5));
    if (x1 >= x0) grid.fill(1, cz * size + x0, cz * size + x1 + 1);
  }
}

const active = (e) => e.kind === 'unit' || (e.kind === 'structure' && e.built);

/** Räknar om spelarens sikt och radar och sätter `intel` på varje fiende. */
export function intelSystem(world) {
  const intel = world.intel;
  if (!intel) return;
  const { size, vision, radar } = intel;
  vision.fill(0);
  radar.fill(0);
  for (const e of world.entities) {
    if (e.owner !== PLAYER_ID || !active(e)) continue;
    const def = getDef(e.type);
    stamp(vision, size, e.x, e.z, def.visionRadius);
    // Radar utan energi fungerar inte (byggnader med upkeep).
    if (def.radarRadius && (e.upkeepEfficiency ?? 1) >= 0.999) stamp(radar, size, e.x, e.z, def.radarRadius);
  }
  for (const e of world.entities) {
    if (e.owner !== ENEMY_ID) continue;
    e.intel = intelAt(world, e.x, e.z);
  }
}

/** Vad spelaren vet om punkten (x, z): INTEL.VISIBLE, RADAR eller HIDDEN. */
export function intelAt(world, x, z) {
  const intel = world.intel;
  if (!intel) return INTEL.VISIBLE;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= intel.size || cz >= intel.size) return INTEL.HIDDEN;
  const i = cz * intel.size + cx;
  if (intel.vision[i]) return INTEL.VISIBLE;
  return intel.radar[i] ? INTEL.RADAR : INTEL.HIDDEN;
}

/** Ser spelaren punkten (inom sikt)? Utan intel (t.ex. i vissa tester) syns allt. */
export const isVisibleAt = (world, x, z) => intelAt(world, x, z) === INTEL.VISIBLE;

/** Har `owner` upptäckt `t` (sikt eller radar)? Bara spelaren påverkas av dimman. */
export function isDetected(owner, t) {
  if (owner !== PLAYER_ID || t.owner !== ENEMY_ID) return true;
  return (t.intel ?? INTEL.VISIBLE) !== INTEL.HIDDEN;
}

/** Ska `t` visas helt för spelaren (modell, hälsa, namn)? */
export const isRevealed = (t) => (t.intel ?? INTEL.VISIBLE) === INTEL.VISIBLE;
