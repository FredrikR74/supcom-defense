import * as THREE from 'three';

const GRASS = new THREE.Color(0x4b5a2b);
const GRASS_DRY = new THREE.Color(0x6e6a38);
const DIRT = new THREE.Color(0x6a5a3e);
const ROCK = new THREE.Color(0x8a8174);
const ROCK_DARK = new THREE.Color(0x635a4f);
const SNOW = new THREE.Color(0xd8dbd6);

/** Mjukt brus i 0..1 (summa av sinusvågor), för fläckar av torrt gräs och jord. */
function patchNoise(x, z, scale, seed) {
  const s = seed * 0.37;
  return 0.5 + 0.25 * Math.sin(x * 0.11 * scale + s) * Math.cos(z * 0.13 * scale - s) +
    0.15 * Math.sin((x + z) * 0.31 * scale + s * 2) + 0.1 * Math.cos((x - z) * 0.57 * scale - s);
}

/**
 * Detaljtextur för marken: kornig yta med strån, småsten och mörkare fläckar.
 * Multipliceras med vertexfärgen, så den ger struktur men inte färg.
 */
function createDetailTextures(renderer) {
  const size = 512;
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return [canvas, canvas.getContext('2d')];
  };
  const [colorCanvas, c] = make();
  const [bumpCanvas, b] = make();
  let seed = 12345;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  c.fillStyle = '#d8d8d8';
  c.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);
  // Fläckar av ljusare och mörkare mark.
  for (let i = 0; i < 120; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 40;
    const light = rand() < 0.5;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, light ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Strån och korn.
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 2 + rand() * 5;
    const a = rand() * Math.PI;
    const v = rand();
    c.strokeStyle = v < 0.5 ? `rgba(0,0,0,${0.08 + rand() * 0.12})` : `rgba(255,255,255,${0.06 + rand() * 0.1})`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
    b.strokeStyle = v < 0.5 ? '#606060' : '#a0a0a0';
    b.beginPath();
    b.moveTo(x, y);
    b.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    b.stroke();
  }
  // Småsten.
  for (let i = 0; i < 400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 2.5;
    c.fillStyle = `rgba(${rand() < 0.5 ? '40,36,30' : '230,225,215'},0.25)`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    b.fillStyle = '#d0d0d0';
    b.beginPath();
    b.arc(x, y, r, 0, Math.PI * 2);
    b.fill();
  }

  const texture = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: texture(colorCanvas, true), bump: texture(bumpCanvas, false) };
}

/** Hur många världsenheter detaljtexturen täcker. */
const DETAIL_SIZE = 7;

export function createTerrainMesh(terrain, renderer, { seed = 1 } = {}) {
  const { size, heights } = terrain;
  const n = size + 1;

  // Markens normalhöjd: medianen, så att berg inte förskjuter skalan.
  const sorted = Float32Array.from(heights).sort();
  const ground = sorted[Math.floor(sorted.length / 2)];
  // Snö bara på riktiga berg: högt över marken och nära kartans högsta topp.
  const snowLine = Math.max(ground + 11, sorted[sorted.length - 1] - 5);

  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      positions.set([x, heights[i], z], i * 3);
      uvs.set([x / DETAIL_SIZE, z / DETAIL_SIZE], i * 2);
    }
  }

  const indices = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const a = z * n + x;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Gräs med fläckar av torrt gräs och jord; branter blir klippa, höga toppar snö.
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  const rock = new THREE.Color();
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      const dry = THREE.MathUtils.smoothstep(patchNoise(x, z, 1, seed), 0.55, 0.8);
      const dirt = THREE.MathUtils.smoothstep(patchNoise(x, z, 2.3, seed + 7), 0.7, 0.85) * 0.6;
      c.copy(GRASS).lerp(GRASS_DRY, dry).lerp(DIRT, dirt);
      // Lite ljusare på krön och mörkare i svackor.
      const rel = heights[i] - ground;
      c.multiplyScalar(0.92 + THREE.MathUtils.clamp(rel * 0.02, -0.08, 0.1));
      const steep = THREE.MathUtils.clamp((1 - normals.getY(i)) * 3.2, 0, 1);
      const altitude = THREE.MathUtils.clamp((rel - 6) / 8, 0, 1);
      rock.copy(ROCK).lerp(ROCK_DARK, patchNoise(x, z, 4, seed + 3) * 0.8);
      c.lerp(rock, Math.max(steep, altitude * 0.85));
      const snow = THREE.MathUtils.smoothstep(heights[i], snowLine, snowLine + 3) * (1 - steep * 0.6);
      c.lerp(SNOW, snow);
      colors.set([c.r, c.g, c.b], i * 3);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const detail = createDetailTextures(renderer);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detail.map,
    bumpMap: detail.bump,
    bumpScale: 0.6,
    roughness: 0.95,
  });
  return new THREE.Mesh(geometry, material);
}
