import { getDef, weaponOf } from './entities.js';
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
 *
 * Fienden (datorn) har samma sorts intel: dess enheter ser runt sig och Molens
 * radar visar spelarens enheter längre bort (`e.enemyIntel`). En byggnad som
 * fienden har sett en gång kommer den ihåg (`e.enemySeen`), som FA:s ikoner i
 * dimman: byggnader flyttar sig inte, så den kan skjuta på dem och planera
 * runt dem (se enemyAi.js). Kärnan känner fienden alltid till.
 */

export const INTEL = { HIDDEN: 0, RADAR: 1, VISIBLE: 2 };

export function createIntel(size) {
  return {
    size,
    vision: new Uint8Array(size * size),
    radar: new Uint8Array(size * size),
    enemyVision: new Uint8Array(size * size),
    enemyRadar: new Uint8Array(size * size),
    /** Ändras när fienden lär sig om eller förlorar en beväpnad byggnad (se pathing.js). */
    enemyKnownVersion: 0,
    enemyKnownArmed: '',
  };
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

/** Räknar om båda sidornas sikt och radar och sätter `intel`/`enemyIntel` på motståndarens entiteter. */
export function intelSystem(world) {
  const intel = world.intel;
  if (!intel) return;
  const { size, vision, radar, enemyVision, enemyRadar } = intel;
  vision.fill(0);
  radar.fill(0);
  enemyVision.fill(0);
  enemyRadar.fill(0);
  for (const e of world.entities) {
    if ((e.owner !== PLAYER_ID && e.owner !== ENEMY_ID) || !active(e)) continue;
    const def = getDef(e.type);
    const player = e.owner === PLAYER_ID;
    stamp(player ? vision : enemyVision, size, e.x, e.z, def.visionRadius);
    // Radar utan energi fungerar inte (byggnader med upkeep).
    if (def.radarRadius && (e.upkeepEfficiency ?? 1) >= 0.999) {
      stamp(player ? radar : enemyRadar, size, e.x, e.z, def.radarRadius);
    }
  }
  const knownArmed = [];
  for (const e of world.entities) {
    if (e.owner === ENEMY_ID) {
      e.intel = intelAt(world, e.x, e.z);
    } else if (e.owner === PLAYER_ID && (e.kind === 'unit' || e.kind === 'structure')) {
      e.enemyIntel = intelAt(world, e.x, e.z, ENEMY_ID);
      if (e.kind === 'structure' && (e.enemyIntel !== INTEL.HIDDEN || e.id === world.coreId)) e.enemySeen = true;
      // Kända färdiga byggnader med vapen: ändras de räknas fiendens vägar om.
      if (e.enemySeen && e.built && weaponOf(e)) knownArmed.push(e.id);
    }
  }
  const key = knownArmed.join(',');
  if (key !== intel.enemyKnownArmed) {
    intel.enemyKnownArmed = key;
    intel.enemyKnownVersion++;
    world.pathDirty = true;
  }
}

/**
 * Vad `viewer` (spelaren som standard) vet om punkten (x, z): INTEL.VISIBLE,
 * RADAR eller HIDDEN.
 */
export function intelAt(world, x, z, viewer = PLAYER_ID) {
  const intel = world.intel;
  if (!intel) return INTEL.VISIBLE;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= intel.size || cz >= intel.size) return INTEL.HIDDEN;
  const i = cz * intel.size + cx;
  const player = viewer === PLAYER_ID;
  if ((player ? intel.vision : intel.enemyVision)[i]) return INTEL.VISIBLE;
  return (player ? intel.radar : intel.enemyRadar)[i] ? INTEL.RADAR : INTEL.HIDDEN;
}

/** Ser spelaren punkten (inom sikt)? Utan intel (t.ex. i vissa tester) syns allt. */
export const isVisibleAt = (world, x, z) => intelAt(world, x, z) === INTEL.VISIBLE;

/**
 * Har `owner` upptäckt `t` (sikt eller radar)? För fienden räcker det att den
 * någon gång har sett en byggnad.
 */
export function isDetected(owner, t) {
  if (owner === PLAYER_ID && t.owner === ENEMY_ID) return (t.intel ?? INTEL.VISIBLE) !== INTEL.HIDDEN;
  if (owner === ENEMY_ID && t.owner === PLAYER_ID) {
    return Boolean(t.enemySeen) || (t.enemyIntel ?? INTEL.VISIBLE) !== INTEL.HIDDEN;
  }
  return true;
}

/** Ska `t` visas helt för spelaren (modell, hälsa, namn)? */
export const isRevealed = (t) => (t.intel ?? INTEL.VISIBLE) === INTEL.VISIBLE;
