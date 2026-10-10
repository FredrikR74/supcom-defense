import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';
import { createIcon } from './icons.js';
import { isIdleBuilder } from '../sim/entities.js';
import { createModel, createGhost, WRECK_MATERIAL, BUILD_WIRE_MATERIAL } from './models.js';
import { createInstancedBatch } from './instancedUnits.js';

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

/** Benen svänger i takt med sträckan som gåtts och tonar ut när enheten står still. */
function animateWalk(walk, x, z, frameSeconds) {
  const dist = walk.x === null ? 0 : Math.hypot(x - walk.x, z - walk.z);
  walk.x = x;
  walk.z = z;
  if (frameSeconds <= 0) return;
  const moving = dist / frameSeconds > 0.3;
  walk.amp += ((moving ? 1 : 0) - walk.amp) * Math.min(1, frameSeconds * 8);
  walk.phase += dist * 4.2;
  const swing = Math.sin(walk.phase) * 0.5 * walk.amp;
  walk.legL.rotation.x = swing;
  walk.legR.rotation.x = -swing;
  if (walk.body) walk.body.position.y = walk.bodyY + Math.abs(Math.cos(walk.phase)) * 0.05 * walk.amp;
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
  /** Fiendeenheter ritas instansierat, en batch per typ. */
  const batches = new Map();
  /** Vrak ritas instansierat i mörkt material, en batch per typ (utan ikoner). */
  const wreckBatches = new Map();

  function wreckBatchFor(type) {
    if (!wreckBatches.has(type)) {
      const batch = createInstancedBatch(type, { material: WRECK_MATERIAL, scaleY: 0.5 });
      meshes.add(batch.group);
      wreckBatches.set(type, batch);
    }
    return wreckBatches.get(type);
  }
  /** Fiende-id -> { x, y, z, top } där den ritades senast. */
  const instancedPos = new Map();

  function batchFor(type) {
    if (!batches.has(type)) {
      const batch = createInstancedBatch(type);
      batch.icons.visible = true; // synligheten styrs av föräldragrupperna
      meshes.add(batch.group);
      icons.add(batch.icons);
      batches.set(type, batch);
    }
    return batches.get(type);
  }

  const orderLines = createLineBuffer(512, new THREE.LineBasicMaterial({
    color: 0x4ade80, transparent: true, opacity: 0.7, depthTest: false,
  }));
  const beams = createLineBuffer(256, new THREE.LineBasicMaterial({
    color: 0x67e8f9, transparent: true, opacity: 0.45,
  }));
  overlay.add(orderLines.object, beams.object);

  // Nanopartiklar som strömmar längs byggstrålarna från byggaren till bygget.
  const NANO_PER_BEAM = 6;
  const nanoPositions = new Float32Array(256 * NANO_PER_BEAM * 3);
  const nanoGeometry = new THREE.BufferGeometry();
  nanoGeometry.setAttribute('position', new THREE.BufferAttribute(nanoPositions, 3));
  const nano = new THREE.Points(nanoGeometry, new THREE.PointsMaterial({
    color: 0xa5f3fc, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  nano.frustumCulled = false;
  overlay.add(nano);
  let nanoTime = 0;

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
    // Ofärdiga byggnader: en trådmodell i full storlek som den växande modellen fyller i.
    let wire = null;
    if (entity.kind === 'structure' && !entity.built) {
      wire = createModel(entity.type);
      wire.traverse((o) => { if (o.isMesh) o.material = BUILD_WIRE_MATERIAL; });
      overlay.add(wire);
    }
    // Markering för sysslolösa byggare (syns även utzoomat).
    const idleIcon = createIcon('idle');
    idleIcon.scale.multiplyScalar(0.7);
    idleIcon.visible = false;
    overlay.add(idleIcon);
    const legL = mesh.getObjectByName('legL');
    const legR = mesh.getObjectByName('legR');
    const walk = legL && legR ? { legL, legR, body: mesh.getObjectByName('torso'), bodyY: mesh.getObjectByName('torso')?.position.y ?? 0, phase: 0, amp: 0, x: null, z: null } : null;
    views.set(entity.id, { mesh, icon, ring, top, idleIcon, wire, walk, turret: mesh.getObjectByName('turret') });
  }

  /** Var en entitet ritas just nu (vanlig mesh eller instansierad). */
  function drawnPos(id) {
    const v = views.get(id);
    if (v) return { x: v.mesh.position.x, y: v.mesh.position.y, z: v.mesh.position.z, top: v.top };
    return instancedPos.get(id) ?? null;
  }

  /** Punkten en order pekar på: mål-entiteten för guard/attack/reparation/återvinning. */
  function orderPoint(o) {
    if (o.targetId != null && o.type !== 'build') return drawnPos(o.targetId);
    if (o.type === 'patrol') return o.points[o.index];
    return o;
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
        // Patrull: rita hela slingan mellan patrullpunkterna.
        if (o.type === 'patrol') {
          for (let i = 0; i < o.points.length; i++) {
            const a = o.points[i];
            const b = o.points[(i + 1) % o.points.length];
            orderLines.add(a.x, groundY(a.x, a.z) + lift, a.z, b.x, groundY(b.x, b.z) + lift, b.z);
          }
        }
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

  function updateBeams(world, frameSeconds) {
    beams.begin();
    nanoTime += frameSeconds;
    let p = 0;
    for (const e of world.entities) {
      if (e.kind !== 'unit' || !e.buildJob) continue;
      const v = views.get(e.id);
      const to = drawnPos(e.buildJob.targetId);
      if (!v || !to) continue;
      const from = v.mesh.position;
      const x0 = from.x;
      const y0 = from.y + v.top * 0.8;
      const z0 = from.z;
      const x1 = to.x;
      const y1 = to.y + to.top * 0.5;
      const z1 = to.z;
      beams.add(x0, y0, z0, x1, y1, z1);
      // Återvinning strömmar åt andra hållet: från vraket till byggaren.
      const reverse = e.buildJob.kind === 'reclaim';
      for (let k = 0; k < NANO_PER_BEAM && p < nanoPositions.length / 3; k++, p++) {
        let t = (nanoTime * 1.5 + k / NANO_PER_BEAM + e.id * 0.13) % 1;
        if (reverse) t = 1 - t;
        nanoPositions.set([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t], p * 3);
      }
    }
    beams.end();
    nanoGeometry.setDrawRange(0, p);
    nanoGeometry.attributes.position.needsUpdate = true;
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

    sync(world, alpha, selection, owner, frameSeconds = 0) {
      const alive = new Set();
      for (const b of batches.values()) b.begin();
      for (const b of wreckBatches.values()) b.begin();
      instancedPos.clear();
      for (const e of world.entities) {
        if (e.kind === 'wreck') {
          const b = wreckBatchFor(e.type);
          const y = groundY(e.x, e.z);
          b.add(e.id, e.x, y, e.z, e.heading);
          instancedPos.set(e.id, { x: e.x, y, z: e.z, top: b.top });
          continue;
        }
        if (e.kind === 'unit' && e.owner !== owner) {
          const b = batchFor(e.type);
          const { x, z } = lerpPos(e, alpha);
          const y = groundY(x, z);
          b.add(e.id, x, y, z, e.heading);
          instancedPos.set(e.id, { x, y, z, top: b.top });
          continue;
        }
        alive.add(e.id);
        if (!views.has(e.id)) create(e);
        const v = views.get(e.id);
        const { x, z } = lerpPos(e, alpha);
        const y = groundY(x, z);
        v.mesh.position.set(x, y, z);
        if (e.heading !== undefined) v.mesh.rotation.y = e.heading;
        if (v.walk) animateWalk(v.walk, x, z, frameSeconds);
        // Tornets vinkel är i världen; på en enhet är tornet ett barn till den roterade kroppen.
        if (v.wire) {
          v.wire.visible = !e.built;
          v.wire.position.copy(v.mesh.position);
          if (e.built) {
            overlay.remove(v.wire);
            v.wire = null;
          }
        }
        if (v.turret) v.turret.rotation.y = (e.turretHeading ?? e.heading ?? 0) - (e.kind === 'unit' ? e.heading ?? 0 : 0);
        // Ofärdiga byggnader växer upp ur marken.
        v.mesh.scale.y = e.kind === 'structure' && !e.built ? 0.1 + 0.9 * e.progress : 1;
        v.icon.position.set(x, y + 1, z);
        v.ring.position.set(x, y + 0.05, z);
        v.ring.visible = selection.has(e.id);
        v.idleIcon.visible = e.owner === owner && isIdleBuilder(e);
        if (v.idleIcon.visible) v.idleIcon.position.set(x, y + v.top + 1.2, z);
      }
      for (const [id, v] of views) {
        if (alive.has(id)) continue;
        meshes.remove(v.mesh);
        icons.remove(v.icon);
        overlay.remove(v.ring);
        overlay.remove(v.idleIcon);
        if (v.wire) overlay.remove(v.wire);
        views.delete(id);
      }
      for (const b of batches.values()) b.end();
      for (const b of wreckBatches.values()) b.end();
      updateOrderLines(world, selection, alpha);
      updateRallyFlags(world, selection);
      updateBeams(world, frameSeconds);
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
      for (const b of [...batches.values(), ...wreckBatches.values()]) {
        const id = hit && b.idForHit(hit);
        if (id != null) return id;
      }
      let obj = hit?.object;
      while (obj && obj.userData.entityId === undefined) obj = obj.parent;
      return obj?.userData.entityId ?? null;
    },

    /** Världspunkt för entitetens mitt (där den renderas just nu). */
    center(entity) {
      const ip = instancedPos.get(entity.id);
      if (ip) return new THREE.Vector3(ip.x, ip.y + ip.top / 2, ip.z);
      const v = views.get(entity.id);
      if (v) return v.mesh.position.clone().setY(v.mesh.position.y + v.top / 2);
      return new THREE.Vector3(entity.x, groundY(entity.x, entity.z), entity.z);
    },

    /** Världspunkt ovanför entiteten, där t.ex. en HP-stapel ska sitta. */
    labelAnchor(entity) {
      const ip = instancedPos.get(entity.id);
      if (ip) return new THREE.Vector3(ip.x, ip.y + ip.top + 0.5, ip.z);
      const v = views.get(entity.id);
      if (v) return v.mesh.position.clone().setY(v.mesh.position.y + v.top + 0.5);
      return new THREE.Vector3(entity.x, groundY(entity.x, entity.z) + 2.5, entity.z);
    },
  };
}
