import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';

const ICON_SCALE = 0.035;

function iconTexture(draw) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ICONS = {
  core: () => iconTexture((ctx, s) => {
    ctx.fillStyle = '#3b82f6';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.fillRect(8, 8, s - 16, s - 16);
    ctx.strokeRect(8, 8, s - 16, s - 16);
  }),
  spawn: () => iconTexture((ctx, s) => {
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s / 2, 6);
    ctx.lineTo(s - 6, s - 8);
    ctx.lineTo(6, s - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }),
  mass: () => iconTexture((ctx, s) => {
    ctx.fillStyle = '#84cc16';
    ctx.strokeStyle = '#1a2e05';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }),
};

function createIcon(texture) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    sizeAttenuation: false,
    depthTest: false,
  }));
  sprite.scale.set(ICON_SCALE, ICON_SCALE, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Markörer för kartans objekt: 3D-mesh när man är inzoomad,
 * strategisk ikon när man är utzoomad.
 */
export function createMapMarkers(map, terrain) {
  const meshes = new THREE.Group();
  const icons = new THREE.Group();
  const textures = Object.fromEntries(Object.entries(ICONS).map(([k, make]) => [k, make()]));

  function place(obj, x, z, yOffset = 0) {
    obj.position.set(x, getHeight(terrain, x, z) + yOffset, z);
  }

  const core = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 4),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.4, roughness: 0.5 }),
  );
  place(core, map.core.x, map.core.z, 1.5);
  meshes.add(core);
  const coreIcon = createIcon(textures.core);
  place(coreIcon, map.core.x, map.core.z, 2);
  icons.add(coreIcon);

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
    const icon = createIcon(textures.spawn);
    place(icon, s.x, s.z, 1);
    icons.add(icon);
  }

  const massMaterial = new THREE.MeshStandardMaterial({ color: 0x84cc16, emissive: 0x365314 });
  const massGeometry = new THREE.CylinderGeometry(0.9, 0.9, 0.15, 20);
  for (const d of map.massDeposits) {
    const m = new THREE.Mesh(massGeometry, massMaterial);
    place(m, d.x, d.z, 0.08);
    meshes.add(m);
    const icon = createIcon(textures.mass);
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
