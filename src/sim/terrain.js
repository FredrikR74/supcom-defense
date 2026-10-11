import { createRng } from './rng.js';

/**
 * Terräng som höjdkarta: (size + 1)² hörnpunkter, en ruta = 1 världsenhet.
 * heights[z * (size + 1) + x] är höjden i hörnet (x, z).
 */

const OCTAVES = [
  { cell: 32, amp: 1 },
  { cell: 16, amp: 0.5 },
  { cell: 8, amp: 0.25 },
];

const smoothstep = (t) => t * t * (3 - 2 * t);

/** En oktav value noise: slumpvärden i ett gitter, mjukt interpolerade. */
function createValueNoise(size, cell, rng) {
  const n = Math.ceil(size / cell) + 2;
  const lattice = new Float32Array(n * n);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();

  return (x, z) => {
    const gx = x / cell;
    const gz = z / cell;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const tx = smoothstep(gx - ix);
    const tz = smoothstep(gz - iz);
    const v00 = lattice[iz * n + ix];
    const v10 = lattice[iz * n + ix + 1];
    const v01 = lattice[(iz + 1) * n + ix];
    const v11 = lattice[(iz + 1) * n + ix + 1];
    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * tz;
  };
}

/** Skrovlig bergsyta i 0..1: kanter där bruset korsar mitten blir åsar. */
function createRidgedNoise(size, rng) {
  const octaves = [
    { amp: 1, sample: createValueNoise(size, 12, rng) },
    { amp: 0.5, sample: createValueNoise(size, 6, rng) },
    { amp: 0.25, sample: createValueNoise(size, 3, rng) },
  ];
  return (x, z) => {
    let v = 0;
    for (const o of octaves) v += (1 - Math.abs(o.sample(x, z) * 2 - 1)) * o.amp;
    return v / 1.75;
  };
}

const clamp01 = (t) => Math.min(1, Math.max(0, t));
/** Bergssluttningen går från mark till full höjd över så här många rutor (S-kurva). */
const SLOPE = 9;
/** Låga förberg vid foten: så här brett och så stor del av bergshöjden. */
const SKIRT = 10;
const SKIRT_HEIGHT = 0.15;

/**
 * Hur mycket berg som står i (x, z): { m } 0..1 för själva berget och { skirt }
 * 0..1 för förbergen runt det. `ring` ({x, z, radius, width, gaps}) är en
 * bergsring runt basen; varje öppning ({angle, width}) är en passage där
 * vinkeln är i grader från +z (söder) mot +x (öster). `peaks` ({x, z, radius})
 * är fristående berg. `inside` är hur långt in i berget punkten ligger.
 */
function mountainMask(x, z, ring, peaks) {
  let inside = -Infinity;
  if (ring) {
    const dx = x - ring.x;
    const dz = z - ring.z;
    const d = Math.hypot(dx, dz);
    let r = ring.width / 2 - Math.abs(d - ring.radius);
    const angle = Math.atan2(dx, dz);
    for (const gap of ring.gaps ?? []) {
      const a = gap.angle * Math.PI / 180;
      const diff = Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a)));
      // Avstånd (längs ringen) in i bergväggen från passagens kant.
      r = Math.min(r, diff * d - gap.width / 2);
    }
    inside = Math.max(inside, r);
  }
  for (const p of peaks ?? []) inside = Math.max(inside, p.radius - Math.hypot(x - p.x, z - p.z));
  return {
    m: smoothstep(clamp01(inside / SLOPE)),
    skirt: smoothstep(clamp01((inside + SKIRT) / SKIRT)),
  };
}

/**
 * Genererar kullig terräng. `plateau` ({x, z, radius, blend, height}) plattar till
 * en cirkel för basen och tonar över till kullarna inom `blend` enheter.
 * `ring` och `peaks` lägger till berg (se mountainMask) med höjden `mountainHeight`;
 * deras branta sidor gör dem oframkomliga.
 */
export function generateTerrain({ size, seed, hillHeight = 8, plateau = null, ring = null, peaks = null, mountainHeight = 16 }) {
  const rng = createRng(seed);
  const octaves = OCTAVES.map((o) => ({ ...o, sample: createValueNoise(size, o.cell, rng) }));
  const totalAmp = OCTAVES.reduce((sum, o) => sum + o.amp, 0);
  const ridged = ring || peaks ? createRidgedNoise(size, rng) : null;

  const n = size + 1;
  const heights = new Float32Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      let h = 0;
      for (const o of octaves) h += o.sample(x, z) * o.amp;
      h = (h / totalAmp) * hillHeight;

      if (plateau) {
        const d = Math.hypot(x - plateau.x, z - plateau.z);
        if (d <= plateau.radius) {
          h = plateau.height;
        } else if (d < plateau.radius + plateau.blend) {
          const t = smoothstep((d - plateau.radius) / plateau.blend);
          h = plateau.height + (h - plateau.height) * t;
        }
      }
      if (ridged) {
        const { m, skirt } = mountainMask(x, z, ring, peaks);
        h += mountainHeight * (m * (0.7 + 0.55 * ridged(x, z)) + skirt * SKIRT_HEIGHT);
      }
      heights[z * n + x] = h;
    }
  }
  return { size, heights };
}

/** Bilinjärt interpolerad höjd. Punkter utanför kartan kläms mot kanten. */
export function getHeight(terrain, x, z) {
  const { size, heights } = terrain;
  const n = size + 1;
  const cx = Math.min(Math.max(x, 0), size);
  const cz = Math.min(Math.max(z, 0), size);
  const ix = Math.min(Math.floor(cx), size - 1);
  const iz = Math.min(Math.floor(cz), size - 1);
  const tx = cx - ix;
  const tz = cz - iz;
  const h00 = heights[iz * n + ix];
  const h10 = heights[iz * n + ix + 1];
  const h01 = heights[(iz + 1) * n + ix];
  const h11 = heights[(iz + 1) * n + ix + 1];
  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return a + (b - a) * tz;
}

export function isInsideMap(terrain, x, z) {
  return x >= 0 && z >= 0 && x <= terrain.size && z <= terrain.size;
}

/**
 * Skjuter en stråle mot terrängen. `dir` ska vara normaliserad.
 * Stegar framåt tills strålen hamnar under marken och förfinar sedan med bisektion.
 * Returnerar träffpunkten {x, y, z} eller null.
 */
export function raycastTerrain(terrain, origin, dir, { maxDistance = 2000, step = 0.5 } = {}) {
  const below = (t) =>
    origin.y + dir.y * t <= getHeight(terrain, origin.x + dir.x * t, origin.z + dir.z * t);
  if (below(0)) return null;

  let prev = 0;
  for (let t = step; t <= maxDistance; t += step) {
    if (below(t)) {
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid;
        else lo = mid;
      }
      const x = origin.x + dir.x * hi;
      const z = origin.z + dir.z * hi;
      return { x, y: getHeight(terrain, x, z), z };
    }
    prev = t;
  }
  return null;
}
