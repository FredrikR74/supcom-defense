import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';
import { createIcon } from './icons.js';

const PLAYER_COLOR = 0x3b82f6;

const metal = () => new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.6, roughness: 0.4 });
const team = () => new THREE.MeshStandardMaterial({ color: PLAYER_COLOR, metalness: 0.4, roughness: 0.5 });
const glow = () => new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.2 });

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

/** Modeller med framsidan mot +z. */
const MODELS = {
  /** Quantum Gate: sockel med en upprätt glödande ring. */
  core() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.3, 12, 32), metal());
    ring.position.y = 2.6;
    const portal = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), glow());
    portal.position.y = 2.6;
    portal.material.side = THREE.DoubleSide;
    group.add(
      box(4, 0.8, 4, metal(), 0, 0.4, 0),
      box(3.2, 0.3, 3.2, team(), 0, 0.95, 0),
      ring,
      portal,
    );
    return group;
  },

  /** ACU: enkel tvåbent robot med en kanonarm. */
  acu() {
    const group = new THREE.Group();
    const m = metal();
    const t = team();
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), m);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0.75, 0.95, 0.45);
    group.add(
      box(0.35, 0.9, 0.45, m, -0.3, 0.45, 0), // ben
      box(0.35, 0.9, 0.45, m, 0.3, 0.45, 0),
      box(1.2, 0.8, 0.8, t, 0, 1.3, 0), // bål
      box(0.5, 0.35, 0.5, m, 0, 1.88, 0), // huvud
      box(0.4, 0.1, 0.05, glow(), 0, 1.9, 0.26), // visir
      box(0.3, 0.9, 0.3, t, -0.78, 1.25, 0), // armar
      box(0.3, 0.9, 0.3, t, 0.78, 1.25, 0),
      gun,
    );
    return group;
  },
};

/** Markeringsring, platt på marken. */
const ringGeometry = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0x4ade80,
  transparent: true,
  opacity: 0.9,
  depthTest: false,
});

/** Interpolerad position för en entitet (enheter rör sig mellan tick). */
function lerpPos(e, alpha) {
  if (e.prevX === undefined) return { x: e.x, z: e.z };
  return { x: e.prevX + (e.x - e.prevX) * alpha, z: e.prevZ + (e.z - e.prevZ) * alpha };
}

/**
 * Håller en mesh och en strategisk ikon per entitet i världen synkade,
 * plus markeringsringar och orderlinjer för markerade enheter.
 */
export function createEntityView(terrain) {
  const meshes = new THREE.Group();
  const icons = new THREE.Group();
  icons.visible = false;
  const overlay = new THREE.Group();
  /** id -> { mesh, icon, ring, top } där `top` är meshens höjd över marken. */
  const views = new Map();

  // Orderlinjer: ett enda LineSegments som byggs om varje frame.
  const MAX_SEGMENTS = 512;
  const linePositions = new Float32Array(MAX_SEGMENTS * 2 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
  }));
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  const pointPositions = new Float32Array(MAX_SEGMENTS * 3);
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
  const points = new THREE.Points(pointGeometry, new THREE.PointsMaterial({
    color: 0x4ade80,
    size: 7,
    sizeAttenuation: false,
    depthTest: false,
  }));
  points.frustumCulled = false;
  points.renderOrder = 5;
  overlay.add(lines, points);

  function create(entity) {
    const mesh = MODELS[entity.type]();
    mesh.userData.entityId = entity.id;
    const icon = createIcon(entity.type);
    icon.userData.entityId = entity.id;
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.scale.setScalar(entity.radius * 1.3);
    ring.renderOrder = 4;
    ring.visible = false;
    meshes.add(mesh);
    icons.add(icon);
    overlay.add(ring);
    const top = new THREE.Box3().setFromObject(mesh).max.y;
    views.set(entity.id, { mesh, icon, ring, top });
  }

  function updateOrderLines(world, selection, alpha) {
    let seg = 0;
    let pt = 0;
    const lift = 0.3;
    for (const e of world.entities) {
      if (!selection.has(e.id) || !e.orders?.length) continue;
      let from = lerpPos(e, alpha);
      for (const o of e.orders) {
        if (seg >= MAX_SEGMENTS) break;
        linePositions.set([
          from.x, getHeight(terrain, from.x, from.z) + lift, from.z,
          o.x, getHeight(terrain, o.x, o.z) + lift, o.z,
        ], seg * 6);
        pointPositions.set([o.x, getHeight(terrain, o.x, o.z) + lift, o.z], pt * 3);
        seg++;
        pt++;
        from = o;
      }
    }
    lineGeometry.setDrawRange(0, seg * 2);
    lineGeometry.attributes.position.needsUpdate = true;
    pointGeometry.setDrawRange(0, pt);
    pointGeometry.attributes.position.needsUpdate = true;
  }

  return {
    meshes,
    icons,
    overlay,

    sync(world, alpha, selection) {
      const alive = new Set();
      for (const e of world.entities) {
        alive.add(e.id);
        if (!views.has(e.id)) create(e);
        const v = views.get(e.id);
        const { x, z } = lerpPos(e, alpha);
        const y = getHeight(terrain, x, z);
        v.mesh.position.set(x, y, z);
        if (e.heading !== undefined) v.mesh.rotation.y = e.heading;
        v.icon.position.set(x, y + 1, z);
        v.ring.position.set(x, y + 0.05, z);
        v.ring.visible = selection.has(e.id);
      }
      for (const [id, v] of views) {
        if (alive.has(id)) continue;
        meshes.remove(v.mesh);
        icons.remove(v.icon);
        overlay.remove(v.ring);
        views.delete(id);
      }
      updateOrderLines(world, selection, alpha);
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

    /** Världspunkt för entitetens mitt (där den renderas just nu). */
    center(entity) {
      const v = views.get(entity.id);
      if (v) return v.mesh.position.clone().setY(v.mesh.position.y + v.top / 2);
      return new THREE.Vector3(entity.x, getHeight(terrain, entity.x, entity.z), entity.z);
    },

    /** Världspunkt ovanför entiteten, där t.ex. en HP-stapel ska sitta. */
    labelAnchor(entity) {
      const v = views.get(entity.id);
      if (v) return v.mesh.position.clone().setY(v.mesh.position.y + v.top + 0.5);
      return new THREE.Vector3(entity.x, getHeight(terrain, entity.x, entity.z) + 2.5, entity.z);
    },
  };
}
