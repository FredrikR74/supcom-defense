import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';
import { createIcon, getIconTexture } from './icons.js';
import { INTEL } from '../sim/intel.js';
import { isIdleBuilder, isIdleFactory, getDef, weaponOf } from '../sim/entities.js';
import { createModel, createGhost, WRECK_MATERIAL, BUILD_WIRE_MATERIAL } from './models.js';
import { createInstancedBatch } from './instancedUnits.js';

/** Markeringsring, platt på marken. */
const ringGeometry = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
/**
 * Markeringsringen ligger på marken med djuptest, så att den del som är bakom
 * enheten döljs av den. polygonOffset håller den ovanför marken den följer.
 */
const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0x4ade80,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4,
});
/** Ringens lyft över marken. */
const RING_LIFT = 0.06;

/**
 * Spawnsköld runt nya fiender: en röd bubbla med additiv blandning, så att
 * instansens färg styr hur stark den är (svart = osynlig) och den kan tona bort.
 */
const SHIELD_CAPACITY = 512;
const SHIELD_COLOR = new THREE.Color(0xff3b4e);
const shieldGeometry = new THREE.SphereGeometry(1, 20, 12);
const shieldMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.4,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
/** Sekunder som skölden tonar bort på innan den tar slut. */
const SHIELD_FADE_SECONDS = 1;

/**
 * Sköldbubblor (Shield Generator, Parashield): en halvgenomskinlig kupol som
 * syns mindre ju mindre HP skölden har kvar och försvinner när den fallit.
 */
const bubbleGeometry = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
const bubbleMaterial = new THREE.MeshBasicMaterial({
  color: 0x60a5fa,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
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

/** Lägger ringens hörnpunkter på marken runt (x, z), så att den inte sjunker in i backar. */
function fitRingToGroundWith(getGround) {
  return (ring, x, y, z) => {
    if (ring.userData.fitX === x && ring.userData.fitZ === z) return;
    ring.userData.fitX = x;
    ring.userData.fitZ = z;
    ring.position.set(x, y, z);
    const base = ring.userData.base;
    const pos = ring.geometry.attributes.position;
    const s = ring.scale.x;
    for (let i = 0; i < pos.count; i++) {
      const lx = base[i * 3];
      const lz = base[i * 3 + 2];
      pos.setY(i, (getGround(x + lx * s, z + lz * s) - y + RING_LIFT) / s);
    }
    pos.needsUpdate = true;
    ring.geometry.computeBoundingSphere();
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
  const shields = new THREE.InstancedMesh(shieldGeometry, shieldMaterial, SHIELD_CAPACITY);
  shields.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shields.frustumCulled = false;
  shields.count = 0;
  shields.renderOrder = 5;
  meshes.add(shields);
  const shieldMatrix = new THREE.Matrix4();
  const shieldColor = new THREE.Color();
  let shieldTime = 0;
  /** id -> { mesh, icon, ring, top } där `top` är meshens höjd över marken. */
  const views = new Map();
  /** Byggorder-objekt -> spökmodell för köade byggen som inte påbörjats. */
  const queuedGhosts = new Map();
  /** Fabriks-id -> flagga vid fabrikens sista waypoint. */
  const rallyFlags = new Map();
  /** Fiendeenheter ritas instansierat, en batch per typ. */
  const batches = new Map();
  /** Strategisk vy och ikonernas opacitet just nu (se setStrategic). */
  let strategicMode = false;
  let iconOpacity = 0;
  /** Entitets-id -> sköldbubbla. */
  const bubbles = new Map();
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
  /**
   * Egna enheter ritas också instansierat, en batch per typ, så att hundratals
   * enheter bara kostar några få draw calls. Varje enhet har kvar en osynlig
   * modell som håller dess pose (torn, ben), som batchen läser av.
   */
  const ownBatches = new Map();
  function ownBatchFor(type) {
    if (!ownBatches.has(type)) {
      const batch = createInstancedBatch(type);
      meshes.add(batch.group);
      ownBatches.set(type, batch);
    }
    return ownBatches.get(type);
  }

  /** Fiende-id -> { x, y, z, top } där den ritades senast. */
  const instancedPos = new Map();
  /** Fiende-id -> gångfas för benen: { x, z, phase, amp, frame }. */
  const enemyWalks = new Map();
  let walkFrame = 0;

  /** Benens fas följer sträckan fienden gått; utslaget tonar ut när den står still. */
  function enemyWalk(id, x, z, frameSeconds) {
    let w = enemyWalks.get(id);
    if (!w) {
      w = { x, z, phase: (id * 1.7) % (Math.PI * 2), amp: 0 };
      enemyWalks.set(id, w);
    }
    const dist = Math.hypot(x - w.x, z - w.z);
    w.x = x;
    w.z = z;
    w.frame = walkFrame;
    if (frameSeconds > 0) {
      const moving = dist / frameSeconds > 0.3;
      w.amp += ((moving ? 1 : 0) - w.amp) * Math.min(1, frameSeconds * 6);
      w.phase += dist * 7;
    }
    return w;
  }

  function batchFor(type) {
    if (!batches.has(type)) {
      const batch = createInstancedBatch(type);
      batch.icons.visible = true; // synligheten styrs av föräldragrupperna
      batch.icons.material.opacity = iconOpacity;
      meshes.add(batch.group);
      icons.add(batch.icons);
      batches.set(type, batch);
    }
    return batches.get(type);
  }

  /**
   * Radarblippar: fiender som bara syns på radar ritas som FA:s generiska
   * ikon på alla zoomnivåer, utan modell, hälsa eller typ.
   */
  const BLIP_CAPACITY = 2048;
  /** Blippens halva storlek som vinkel (radianer), för att träffa den med ett klick. */
  const BLIP_PICK_ANGLE = 0.016;
  const blipPositions = new Float32Array(BLIP_CAPACITY * 3);
  /** Instansindex -> entitets-id, för klick och hover på blipparna. */
  const blipIds = [];
  let blipCount = 0;
  const blipPoint = new THREE.Vector3();
  const blipGeometry = new THREE.BufferGeometry();
  blipGeometry.setAttribute('position', new THREE.BufferAttribute(blipPositions, 3));
  const blips = new THREE.Points(blipGeometry, new THREE.PointsMaterial({
    map: getIconTexture('radarBlip'),
    size: 26,
    sizeAttenuation: false,
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
  }));
  blips.frustumCulled = false;
  blips.renderOrder = 10;
  overlay.add(blips);

  const orderLines = createLineBuffer(512, new THREE.LineBasicMaterial({
    color: 0x4ade80, transparent: true, opacity: 0.7, depthTest: false,
  }));
  const beams = createLineBuffer(256, new THREE.LineBasicMaterial({
    color: 0x67e8f9, transparent: true, opacity: 0.45,
  }));
  overlay.add(orderLines.object, beams.object);

  // Räckviddsringar för markerade enheter och byggnader, som i FA: vapnets
  // räckvidd (och minsta räckvidd) och byggräckvidden för byggare.
  const weaponRings = createLineBuffer(24000, new THREE.LineBasicMaterial({
    color: 0xf87171, transparent: true, opacity: 0.55,
  }));
  const buildRings = createLineBuffer(12000, new THREE.LineBasicMaterial({
    color: 0xfacc15, transparent: true, opacity: 0.45,
  }));
  // Radarns räckvidd för markerade radarbyggnader (och ACU:n, Snoop).
  const radarRings = createLineBuffer(12000, new THREE.LineBasicMaterial({
    color: 0x4ade80, transparent: true, opacity: 0.4,
  }));
  overlay.add(weaponRings.object, buildRings.object, radarRings.object);
  // Räckvidderna för en byggnad man håller på att placera (radar, vapen, sköld).
  const placeWeapon = createLineBuffer(2000, new THREE.LineBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.8 }));
  const placeRadar = createLineBuffer(2000, new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.8 }));
  const placeShield = createLineBuffer(2000, new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.8 }));
  overlay.add(placeWeapon.object, placeRadar.object, placeShield.object);
  const RING_SEGMENTS = 56;

  /** En ring med radien `r` runt (x, z) som följer marken. */
  function addRangeRing(buffer, x, z, r) {
    let px = x + r;
    let pz = z;
    let py = groundY(px, pz) + 0.15;
    for (let i = 1; i <= RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      const nx = x + Math.cos(a) * r;
      const nz = z + Math.sin(a) * r;
      const ny = groundY(nx, nz) + 0.15;
      buffer.add(px, py, pz, nx, ny, nz);
      px = nx;
      py = ny;
      pz = nz;
    }
  }

  function updateRangeRings(world, selection, alpha, owner) {
    weaponRings.begin();
    buildRings.begin();
    radarRings.begin();
    for (const e of world.entities) {
      if (!selection.has(e.id) || e.owner !== owner) continue;
      const def = getDef(e.type);
      if (!def || (e.kind === 'structure' && !e.built)) continue;
      const { x, z } = e.kind === 'unit' ? lerpPos(e, alpha) : e;
      const weapon = weaponOf(e);
      if (weapon) {
        addRangeRing(weaponRings, x, z, weapon.range);
        if (weapon.minRange) addRangeRing(weaponRings, x, z, weapon.minRange);
      }
      if (e.kind === 'unit' && def.buildPower > 0 && def.buildRange) addRangeRing(buildRings, x, z, def.buildRange);
      if (def.radarRadius) addRangeRing(radarRings, x, z, def.radarRadius);
    }
    weaponRings.end();
    buildRings.end();
    radarRings.end();
  }

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
  const fitRingToGround = fitRingToGroundWith(groundY);

  function create(entity) {
    const mesh = createModel(entity.type);
    mesh.userData.entityId = entity.id;
    const icon = createIcon(entity.type);
    icon.material.transparent = true;
    icon.material.opacity = iconOpacity;
    icon.userData.entityId = entity.id;
    // Egen kopia av geometrin, så att ringen kan följa markens höjd runt enheten.
    const ring = new THREE.Mesh(ringGeometry.clone(), ringMaterial);
    ring.scale.setScalar(entity.radius * 1.3);
    ring.userData.base = ringGeometry.attributes.position.array;
    ring.renderOrder = 4;
    ring.visible = false;
    // Enheter ritas av sin typs batch; modellen håller bara posen.
    if (entity.kind === 'unit') {
      mesh.userData.movable = Object.fromEntries(mesh.children.filter((o) => o.isGroup && o.name).map((o) => [o.name, o]));
    } else {
      meshes.add(mesh);
    }
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
    views.set(entity.id, { type: entity.type, mesh, icon, ring, top, idleIcon, wire, walk, turret: mesh.getObjectByName('turret') });
  }

  function removeView(id) {
    const v = views.get(id);
    meshes.remove(v.mesh);
    icons.remove(v.icon);
    overlay.remove(v.ring);
    overlay.remove(v.idleIcon);
    if (v.wire) overlay.remove(v.wire);
    views.delete(id);
  }

  /** Sköldbubblan följer entiteten; den bleknar med sköldens HP. */
  function updateBubble(e, x, y, z) {
    const shield = getDef(e.type)?.shield;
    let bubble = bubbles.get(e.id);
    if (!shield) return;
    if (!bubble) {
      bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial.clone());
      bubble.renderOrder = 6;
      overlay.add(bubble);
      bubbles.set(e.id, bubble);
    }
    const up = (e.kind === 'unit' || e.built) && e.shieldRecharge === 0 && e.shieldHp > 0;
    bubble.visible = up;
    if (!up) return;
    bubble.position.set(x, y, z);
    bubble.scale.set(shield.radius, shield.radius * 0.75, shield.radius);
    bubble.material.opacity = 0.06 + 0.16 * (e.shieldHp / shield.maxHp);
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
      for (const b of ownBatches.values()) b.begin();
      for (const b of wreckBatches.values()) b.begin();
      instancedPos.clear();
      blipCount = 0;
      shieldTime += frameSeconds;
      let shieldCount = 0;
      for (const e of world.entities) {
        if (e.kind === 'wreck') {
          const b = wreckBatchFor(e.type);
          const y = groundY(e.x, e.z);
          b.add(e.id, e.x, y, e.z, e.heading);
          instancedPos.set(e.id, { x: e.x, y, z: e.z, top: b.top });
          continue;
        }
        if (e.kind === 'unit' && e.owner !== owner) {
          // Krigsdimma: dolda fiender ritas inte alls, de på radar som en blipp.
          const intel = e.intel ?? INTEL.VISIBLE;
          if (intel === INTEL.HIDDEN) continue;
          if (intel === INTEL.RADAR) {
            if (blipCount < BLIP_CAPACITY) {
              const { x, z } = lerpPos(e, alpha);
              const y = groundY(x, z);
              blipPositions.set([x, y + 1, z], blipCount * 3);
              blipIds[blipCount] = e.id;
              blipCount++;
              // `top` över blippen (som ritas 1 över marken), så att etiketter hamnar ovanför den.
              instancedPos.set(e.id, { x, y, z, top: 1.8 });
            }
            continue;
          }
          const b = batchFor(e.type);
          const { x, z } = lerpPos(e, alpha);
          const y = groundY(x, z);
          b.add(e.id, x, y, z, e.heading, enemyWalk(e.id, x, z, frameSeconds));
          instancedPos.set(e.id, { x, y, z, top: b.top });
          if (e.shieldUntil > world.tick && shieldCount < SHIELD_CAPACITY) {
            const left = (e.shieldUntil - world.tick) / 10;
            const pulse = 0.85 + 0.15 * Math.sin(shieldTime * 6 + e.id);
            const r = e.radius * 1.9;
            shieldMatrix.makeScale(r, r * 0.8, r).setPosition(x, y + b.top * 0.4, z);
            shields.setMatrixAt(shieldCount, shieldMatrix);
            shields.setColorAt(shieldCount, shieldColor.copy(SHIELD_COLOR)
              .multiplyScalar(Math.min(1, left / SHIELD_FADE_SECONDS) * pulse));
            shieldCount++;
          }
          continue;
        }
        alive.add(e.id);
        // En uppgraderad byggnad har bytt typ och får en ny modell.
        if (views.has(e.id) && views.get(e.id).type !== e.type) removeView(e.id);
        if (!views.has(e.id)) create(e);
        const v = views.get(e.id);
        const { x, z } = lerpPos(e, alpha);
        const y = groundY(x, z);
        v.mesh.position.set(x, y, z);
        if (e.heading !== undefined) v.mesh.rotation.y = e.heading;
        if (v.walk) animateWalk(v.walk, x, z, frameSeconds);
        updateBubble(e, x, y, z);
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
        if (e.kind === 'structure') v.mesh.scale.y = e.built ? 1 : 0.1 + 0.9 * e.progress;
        if (e.kind === 'unit') ownBatchFor(e.type).add(e.id, x, y, z, v.mesh.rotation.y, null, v.mesh);
        v.icon.position.set(x, y + 1, z);
        v.ring.visible = selection.has(e.id);
        if (v.ring.visible) fitRingToGround(v.ring, x, y, z);
        v.idleIcon.visible = e.owner === owner && (isIdleBuilder(e) || isIdleFactory(e));
        if (v.idleIcon.visible) v.idleIcon.position.set(x, y + v.top + 1.2, z);
      }
      for (const id of views.keys()) {
        if (!alive.has(id)) removeView(id);
      }
      for (const [id, bubble] of bubbles) {
        if (alive.has(id) && getDef(views.get(id).type)?.shield) continue;
        overlay.remove(bubble);
        bubble.material.dispose();
        bubbles.delete(id);
      }
      for (const b of batches.values()) b.end();
      for (const b of ownBatches.values()) b.end();
      shields.count = shieldCount;
      blipGeometry.setDrawRange(0, blipCount);
      blipGeometry.attributes.position.needsUpdate = true;
      shields.instanceMatrix.needsUpdate = true;
      if (shields.instanceColor) shields.instanceColor.needsUpdate = true;
      // Glöm gångfasen för fiender som inte finns längre.
      for (const [id, w] of enemyWalks) if (w.frame !== walkFrame) enemyWalks.delete(id);
      walkFrame++;
      for (const b of wreckBatches.values()) b.end();
      updateOrderLines(world, selection, alpha);
      updateRangeRings(world, selection, alpha, owner);
      updateRallyFlags(world, selection);
      updateBeams(world, frameSeconds);
      updateQueuedGhosts(world, owner);
    },

    /**
     * Strategisk vy: bara ikoner. Annars modellerna, och från mellanzoom även
     * ikonerna ovanpå dem med opaciteten `fade` (0–1), som när FA tonar in ikonerna.
     */
    setStrategic(strategic, fade = strategic ? 1 : 0) {
      strategicMode = strategic;
      meshes.visible = !strategic;
      const opacity = strategic ? 1 : fade > 0 ? 0.55 + 0.45 * fade : 0;
      icons.visible = opacity > 0;
      if (opacity === iconOpacity) return;
      iconOpacity = opacity;
      for (const icon of icons.children) {
        if (icon.material) icon.material.opacity = opacity;
      }
      for (const b of batches.values()) b.icons.material.opacity = opacity;
    },

    /**
     * Radarblippen under strålen, eller null. Blipparna har konstant storlek på
     * skärmen, så träffen räknas som en vinkel från kameran.
     */
    pickBlip(raycaster) {
      const { ray } = raycaster;
      let best = null;
      let bestAngle = BLIP_PICK_ANGLE;
      for (let i = 0; i < blipCount; i++) {
        blipPoint.fromArray(blipPositions, i * 3);
        const along = blipPoint.clone().sub(ray.origin).dot(ray.direction);
        if (along <= 0) continue;
        const angle = Math.sqrt(ray.distanceSqToPoint(blipPoint)) / along;
        if (angle < bestAngle) {
          best = blipIds[i];
          bestAngle = angle;
        }
      }
      return best;
    },

    /**
     * Visar räckvidderna för byggnaden `type` på platserna `positions` medan
     * man placerar den: radar, vapen (och minsta räckvidd) och sköld.
     */
    setPlacementRanges(type, positions = []) {
      const def = type ? getDef(type) : null;
      for (const b of [placeWeapon, placeRadar, placeShield]) b.begin();
      for (const { x, z } of def ? positions : []) {
        if (def.radarRadius) addRangeRing(placeRadar, x, z, def.radarRadius);
        if (def.weapon) {
          addRangeRing(placeWeapon, x, z, def.weapon.range);
          if (def.weapon.minRange) addRangeRing(placeWeapon, x, z, def.weapon.minRange);
        }
        if (def.shield) addRangeRing(placeShield, x, z, def.shield.radius);
      }
      for (const b of [placeWeapon, placeRadar, placeShield]) b.end();
    },

    /** Entitets-id under strålen, eller null. Radarblippar ritas överst och går först. */
    pick(raycaster) {
      const blip = this.pickBlip(raycaster);
      if (blip != null) return blip;
      const targets = strategicMode ? icons.children : meshes.children;
      const hit = raycaster.intersectObjects(targets, true)[0];
      for (const b of [...batches.values(), ...ownBatches.values(), ...wreckBatches.values()]) {
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
