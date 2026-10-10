import * as THREE from 'three';
import { createModel } from './models.js';
import { getIconTexture } from './icons.js';

/** Strategisk ikonstorlek i pixlar. */
const ICON_PIXELS = 18;

/**
 * Många enheter av samma typ ritade med en InstancedMesh per modelldel
 * (ett fåtal draw calls oavsett antal) och strategiska ikoner som ett Points-moln.
 */
export function createInstancedBatch(type, { capacity = 2048, material = null, scaleY = 1 } = {}) {
  const group = new THREE.Group();
  const model = createModel(type);
  model.scale.y = scaleY;
  model.updateMatrixWorld(true);

  const parts = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const mesh = new THREE.InstancedMesh(geometry, material ?? o.material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    parts.push(mesh);
    group.add(mesh);
  });
  const top = new THREE.Box3().setFromObject(model).max.y;

  const iconPositions = new Float32Array(capacity * 3);
  const iconGeometry = new THREE.BufferGeometry();
  iconGeometry.setAttribute('position', new THREE.BufferAttribute(iconPositions, 3));
  const icons = new THREE.Points(iconGeometry, new THREE.PointsMaterial({
    map: getIconTexture(type),
    size: ICON_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    alphaTest: 0.3,
    depthTest: false,
  }));
  icons.frustumCulled = false;
  icons.renderOrder = 10;
  icons.visible = false;

  /** Instansindex -> entitets-id, för plockning. */
  const ids = [];
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  let count = 0;

  return {
    group,
    icons,
    top,
    parts,

    begin() {
      count = 0;
      ids.length = 0;
    },

    add(id, x, y, z, heading) {
      if (count >= capacity) return;
      quat.setFromAxisAngle(up, heading);
      matrix.compose(pos.set(x, y, z), quat, scale);
      for (const p of parts) p.setMatrixAt(count, matrix);
      iconPositions.set([x, y + 1, z], count * 3);
      ids[count] = id;
      count++;
    },

    end() {
      for (const p of parts) {
        p.count = count;
        p.instanceMatrix.needsUpdate = true;
        // Three.js cachar avgränsningssfären vid första plockningen. Enheterna
        // rör sig och nya tillkommer, så den måste räknas om, annars missar klicken.
        p.boundingSphere = null;
        p.boundingBox = null;
      }
      iconGeometry.setDrawRange(0, count);
      iconGeometry.attributes.position.needsUpdate = true;
    },

    setStrategic(strategic) {
      group.visible = !strategic;
      icons.visible = strategic;
    },

    /** Entitets-id för en träff på någon av batchens delar, annars null. */
    idForHit(hit) {
      return parts.includes(hit.object) && hit.instanceId !== undefined ? ids[hit.instanceId] : null;
    },
  };
}
