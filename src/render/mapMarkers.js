import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';
import { createIcon } from './icons.js';

/**
 * Markörer för kartans statiska objekt (spawnpunkter, massfyndigheter):
 * 3D-mesh när man är inzoomad, strategisk ikon när man är utzoomad.
 */
export function createMapMarkers(map, terrain) {
  const meshes = new THREE.Group();
  const icons = new THREE.Group();

  function place(obj, x, z, yOffset = 0) {
    obj.position.set(x, getHeight(terrain, x, z) + yOffset, z);
  }

  const spawnMaterial = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x7f1d1d,
    transparent: true,
    opacity: 0.8,
  });
  const spawnGeometry = new THREE.CylinderGeometry(1.5, 1.5, 6, 16, 1, true);
  for (const s of map.spawns) {
    const m = new THREE.Mesh(spawnGeometry, spawnMaterial);
    place(m, s.x, s.z, 3);
    meshes.add(m);
    const icon = createIcon('spawn');
    place(icon, s.x, s.z, 1);
    icons.add(icon);
  }

  const massMaterial = new THREE.MeshStandardMaterial({ color: 0x84cc16, emissive: 0x365314 });
  const massGeometry = new THREE.CylinderGeometry(0.9, 0.9, 0.15, 20);
  for (const d of map.massDeposits) {
    const m = new THREE.Mesh(massGeometry, massMaterial);
    place(m, d.x, d.z, 0.08);
    meshes.add(m);
    const icon = createIcon('mass');
    place(icon, d.x, d.z, 0.5);
    icons.add(icon);
  }

  icons.visible = false;

  return {
    meshes,
    icons,
    setStrategic(strategic) {
      meshes.visible = !strategic;
      icons.visible = strategic;
    },
  };
}
