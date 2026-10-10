import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';
import { createIcon } from './icons.js';

const PLAYER_COLOR = 0x3b82f6;

const MODELS = {
  /** Quantum Gate: sockel med en upprätt glödande ring. */
  core() {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.6, roughness: 0.4 });
    const team = new THREE.MeshStandardMaterial({ color: PLAYER_COLOR, metalness: 0.4, roughness: 0.5 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.2 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 4), metal);
    base.position.y = 0.4;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 3.2), team);
    plate.position.y = 0.95;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.3, 12, 32), metal);
    ring.position.y = 2.6;
    const portal = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), glow);
    portal.position.y = 2.6;
    portal.material.side = THREE.DoubleSide;
    group.add(base, plate, ring, portal);
    return group;
  },
};

/**
 * Håller en mesh och en strategisk ikon per entitet i världen synkade.
 */
export function createEntityView(terrain) {
  const meshes = new THREE.Group();
  const icons = new THREE.Group();
  icons.visible = false;
  /** id -> { mesh, icon, top } där `top` är meshens höjd över marken. */
  const views = new Map();

  function create(entity) {
    const mesh = MODELS[entity.type]();
    mesh.userData.entityId = entity.id;
    const icon = createIcon(entity.type);
    icon.userData.entityId = entity.id;
    meshes.add(mesh);
    icons.add(icon);
    const top = new THREE.Box3().setFromObject(mesh).max.y;
    views.set(entity.id, { mesh, icon, top });
  }

  return {
    meshes,
    icons,

    sync(world) {
      const alive = new Set();
      for (const e of world.entities) {
        alive.add(e.id);
        if (!views.has(e.id)) create(e);
        const v = views.get(e.id);
        const y = getHeight(terrain, e.x, e.z);
        v.mesh.position.set(e.x, y, e.z);
        v.icon.position.set(e.x, y + 1, e.z);
      }
      for (const [id, v] of views) {
        if (alive.has(id)) continue;
        meshes.remove(v.mesh);
        icons.remove(v.icon);
        views.delete(id);
      }
    },

    setStrategic(strategic) {
      meshes.visible = !strategic;
      icons.visible = strategic;
    },

    /** Entitets-id under strålen, eller null. */
    pick(raycaster) {
      const targets = icons.visible ? icons.children : meshes.children;
      const hit = raycaster.intersectObjects(targets, true)[0];
      let obj = hit?.object;
      while (obj && obj.userData.entityId === undefined) obj = obj.parent;
      return obj?.userData.entityId ?? null;
    },

    /** Världspunkt ovanför entiteten, där t.ex. en HP-stapel ska sitta. */
    labelAnchor(entity) {
      const v = views.get(entity.id);
      const y = getHeight(terrain, entity.x, entity.z) + (v?.top ?? 2) + 0.5;
      return new THREE.Vector3(entity.x, y, entity.z);
    },
  };
}
