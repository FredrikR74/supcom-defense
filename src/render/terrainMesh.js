import * as THREE from 'three';

const LOW = new THREE.Color(0x3f4a2e);
const HIGH = new THREE.Color(0x8c8a6a);
const ROCK = new THREE.Color(0x5e5850);

/** Rutnätstextur: vit med mörkare kantlinjer, upprepas en gång per ruta. */
function createGridTexture(renderer) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTerrainMesh(terrain, renderer) {
  const { size, heights } = terrain;
  const n = size + 1;

  let minH = Infinity;
  let maxH = -Infinity;
  for (const h of heights) {
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
  }

  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      positions.set([x, heights[i], z], i * 3);
      uvs.set([x, z], i * 2);
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

  // Färg efter höjd, och brantare sluttningar blir mer klippa.
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n * n; i++) {
    const t = (heights[i] - minH) / (maxH - minH || 1);
    const steep = THREE.MathUtils.clamp((1 - normals.getY(i)) * 4, 0, 1);
    c.copy(LOW).lerp(HIGH, t).lerp(ROCK, steep);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: createGridTexture(renderer),
    roughness: 0.95,
  });
  return new THREE.Mesh(geometry, material);
}
