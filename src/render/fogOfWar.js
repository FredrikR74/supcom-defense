import * as THREE from 'three';

/**
 * Krigsdimman som i FA ("Explored"): terrängen syns hela tiden, men det som
 * ligger utanför egen sikt är mörkare. Ett mörkt lager över terrängen, vars
 * genomskinlighet per ruta kommer från spelarens sikt (se sim/intel.js).
 * Linjär filtrering ger mjuka kanter.
 */
const FOG_OPACITY = 0.5;

export function createFogOfWar(terrainMesh, size) {
  const data = new Uint8Array(size * size * 4).fill(255);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  // Samma form som terrängen, men med uv över hela kartan (0–1).
  const source = terrainMesh.geometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', source.getAttribute('position'));
  geometry.setIndex(source.getIndex());
  const positions = source.getAttribute('position');
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uvs[i * 2] = positions.getX(i) / size;
    uvs[i * 2 + 1] = positions.getZ(i) / size;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: FOG_OPACITY,
    alphaMap: texture,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  let lastTick = -1;

  return {
    mesh,
    /** Ritar om dimman när simuleringen gått ett tick. */
    update(world) {
      if (!world.intel || world.tick === lastTick) return;
      lastTick = world.tick;
      const { vision } = world.intel;
      for (let i = 0; i < vision.length; i++) {
        const v = vision[i] ? 0 : 255;
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
      }
      texture.needsUpdate = true;
    },
  };
}
