import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';
import { createIcon } from './icons.js';
import { createModel } from './models.js';

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

  // Fiendens spawnpunkter: en Cybran Quantum Gateway, vänd mot kartans mitt.
  for (const s of map.spawns) {
    const m = createModel('cybranGateway');
    place(m, s.x, s.z);
    m.rotation.y = Math.atan2(map.core.x - s.x, map.core.z - s.z);
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
