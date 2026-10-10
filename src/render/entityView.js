import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';
import { createIcon } from './icons.js';
import { createModel, createGhost } from './models.js';

/** Markeringsring, platt på marken. */
const ringGeometry = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0x4ade80,
  transparent: true,
  opacity: 0.9,
  depthTest: false,
});

const flagPole = new THREE.CylinderGeometry(0.05, 0.05, 2, 6).translate(0, 1, 0);
const flagCloth = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0.8, 1.7, 0),
]);
const flagMaterial = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide });

/** Samlingspunktsflagga (fabrikens waypoint). */
function createRallyFlag() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(flagPole, flagMaterial), new THREE.Mesh(flagCloth, flagMaterial));
  return group;
}

/** Interpolerad position för en entitet (enheter rör sig mellan tick). */
function lerpPos(e, alpha) {
  if (e.prevX === undefined) return { x: e.x, z: e.z };
  return { x: e.prevX + (e.x - e.prevX) * alpha, z: e.prevZ + (e.z - e.prevZ) * alpha };
}

/** Ett LineSegments med plats för `max` segment, som fylls på nytt varje frame. */
function createLineBuffer(max, material) {
  const positions = new Float32Array(max * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  let count = 0;
  return {
    object: lines,
    begin() { count = 0; },
    add(x0, y0, z0, x1, y1, z1) {
      if (count >= max) return;
      positions.set([x0, y0, z0, x1, y1, z1], count * 6);
      count++;
    },
    end() {
      geometry.setDrawRange(0, count * 2);
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

/**
 * Håller en mesh och en strategisk ikon per entitet i världen synkade,
 * plus markeringsringar, orderlinjer, byggstrålar och spöken för köade byggen.
 */
export function createEntityView(terrain) {
  const meshes = new THREE.Group();
  const icons = new THREE.Group();
  icons.visible = false;
  const overlay = new THREE.Group();
  /** id -> { mesh, icon, ring, top } där `top` är meshens höjd över marken. */
  const views = new Map();
  /** Byggorder-objekt -> spökmodell för köade byggen som inte påbörjats. */
  const queuedGhosts = new Map();
  /** Fabriks-id -> flagga vid fabrikens sista waypoint. */
  const rallyFlags = new Map();

  const orderLines = createLineBuffer(512, new THREE.LineBasicMaterial({
    color: 0x4ade80, transparent: true, opacity: 0.7, depthTest: false,
  }));
  const beams = createLineBuffer(256, new THREE.LineBasicMaterial({
    color: 0x67e8f9, transparent: true, opacity: 0.9,
  }));
  overlay.add(orderLines.object, beams.object);

  const groundY = (x, z) => getHeight(terrain, x, z);

  function create(entity) {
    const mesh = createModel(entity.type);
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

  /** Punkten en order pekar på; guard-order pekar på den assisterade enheten. */
  function orderPoint(o) {
    if (o.type !== 'guard') return o;
    const v = views.get(o.targetId);
    return v ? { x: v.mesh.position.x, z: v.mesh.position.z } : null;
  }

  function updateOrderLines(world, selection, alpha) {
    orderLines.begin();
    const lift = 0.3;
    for (const e of world.entities) {
      if (!selection.has(e.id)) continue;
      // Enheter: deras order. Fabriker: deras waypoints.
      const points = e.orders ?? e.rallyPoints;
      if (!points?.length) continue;
      let from = lerpPos(e, alpha);
      for (const o of points) {
        const p = orderPoint(o);
        if (!p) break;
        orderLines.add(
          from.x, groundY(from.x, from.z) + lift, from.z,
          p.x, groundY(p.x, p.z) + lift, p.z,
        );
        from = p;
      }
    }
    orderLines.end();
  }

  /** En flagga vid sista waypointen för varje markerad fabrik. */
  function updateRallyFlags(world, selection) {
    const shown = new Set();
    for (const e of world.entities) {
      if (!selection.has(e.id) || !e.rallyPoints?.length) continue;
      shown.add(e.id);
      if (!rallyFlags.has(e.id)) {
        const flag = createRallyFlag();
        overlay.add(flag);
        rallyFlags.set(e.id, flag);
      }
      const p = e.rallyPoints[e.rallyPoints.length - 1];
      rallyFlags.get(e.id).position.set(p.x, groundY(p.x, p.z), p.z);
    }
    for (const [id, flag] of rallyFlags) {
      if (shown.has(id)) continue;
      overlay.remove(flag);
      rallyFlags.delete(id);
    }
  }

  function updateBeams(world) {
    beams.begin();
    for (const e of world.entities) {
      if (e.kind !== 'unit' || !e.buildJob) continue;
      const v = views.get(e.id);
      const target = views.get(e.buildJob.targetId);
      if (!v || !target) continue;
      const from = v.mesh.position;
      const to = target.mesh.position;
      beams.add(from.x, from.y + v.top * 0.8, from.z, to.x, to.y + target.top * 0.5, to.z);
    }
    beams.end();
  }

  function updateQueuedGhosts(world, owner) {
    const seen = new Set();
    for (const e of world.entities) {
      if (e.kind !== 'unit' || e.owner !== owner) continue;
      for (const o of e.orders) {
        if (o.type !== 'build' || o.targetId) continue;
        seen.add(o);
        if (!queuedGhosts.has(o)) {
          const ghost = createGhost(o.structure, 'queued');
          ghost.position.set(o.x, groundY(o.x, o.z), o.z);
          overlay.add(ghost);
          queuedGhosts.set(o, ghost);
        }
      }
    }
    for (const [o, ghost] of queuedGhosts) {
      if (seen.has(o)) continue;
      overlay.remove(ghost);
      queuedGhosts.delete(o);
    }
  }

  return {
    meshes,
    icons,
    overlay,

    sync(world, alpha, selection, owner) {
      const alive = new Set();
      for (const e of world.entities) {
        alive.add(e.id);
        if (!views.has(e.id)) create(e);
        const v = views.get(e.id);
        const { x, z } = lerpPos(e, alpha);
        const y = groundY(x, z);
        v.mesh.position.set(x, y, z);
        if (e.heading !== undefined) v.mesh.rotation.y = e.heading;
        // Ofärdiga byggnader växer upp ur marken.
        v.mesh.scale.y = e.kind === 'structure' && !e.built ? 0.1 + 0.9 * e.progress : 1;
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
      updateRallyFlags(world, selection);
      updateBeams(world);
      updateQueuedGhosts(world, owner);
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
      return new THREE.Vector3(entity.x, groundY(entity.x, entity.z), entity.z);
    },

    /** Världspunkt ovanför entiteten, där t.ex. en HP-stapel ska sitta. */
    labelAnchor(entity) {
      const v = views.get(entity.id);
      if (v) return v.mesh.position.clone().setY(v.mesh.position.y + v.top + 0.5);
      return new THREE.Vector3(entity.x, groundY(entity.x, entity.z) + 2.5, entity.z);
    },
  };
}
