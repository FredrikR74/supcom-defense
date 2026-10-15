import * as THREE from 'three';
import { createModel, poseLeg } from './models.js';
import { getIconTexture } from './icons.js';

/** Strategisk ikonstorlek i pixlar (samma som de egna ikonerna, se ICON_SCALE i icons.js). */
const ICON_PIXELS = 31;

/**
 * Många enheter av samma typ ritade med en InstancedMesh per modelldel
 * (ett fåtal draw calls oavsett antal) och strategiska ikoner som ett Points-moln.
 */
export function createInstancedBatch(type, { capacity = 2048, material = null, scaleY = 1 } = {}) {
  const group = new THREE.Group();
  const model = createModel(type);
  model.scale.y *= scaleY;
  model.updateMatrixWorld(true);

  // Rörliga delar (namngivna grupper direkt under modellen: torn, bål, ben)
  // ritas som egna delar med en egen pose per instans; allt annat bakas in i
  // modellens läge.
  const movable = model.children
    .filter((o) => o.isGroup && o.name)
    .map((o) => ({ name: o.name, group: o, parts: [], matrix: new THREE.Matrix4() }));
  const movableOf = (o) => movable.find((m) => m.group === o.parent);

  const parts = [];
  const bodyParts = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const part = movableOf(o);
    // Rörliga delar bakas relativt sin led, kroppsdelar relativt modellen.
    const geometry = o.geometry.clone().applyMatrix4(part ? o.matrix : o.matrixWorld);
    const mesh = new THREE.InstancedMesh(geometry, material ?? o.material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    parts.push(mesh);
    (part ? part.parts : bodyParts).push(mesh);
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
    alphaTest: 0.02,
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

    /**
     * Lägger till en instans. Rörliga delar får sin pose från `pose`, en modell
     * av samma typ (t.ex. en egen enhets tornvinkel och gång), eller för
     * insektsben från `walk` = { phase, amp } (se poseLeg); annars vilopose.
     */
    add(id, x, y, z, heading, walk = null, pose = null) {
      if (count >= capacity) return;
      quat.setFromAxisAngle(up, heading);
      matrix.compose(pos.set(x, y, z), quat, scale);
      for (const p of bodyParts) p.setMatrixAt(count, matrix);
      for (const m of movable) {
        const source = pose?.userData.movable?.[m.name];
        if (source) {
          source.updateMatrix();
          m.matrix.multiplyMatrices(matrix, model.matrix).multiply(source.matrix);
        } else {
          if (/^leg\d$/.test(m.name)) poseLeg(m.group, walk?.phase ?? 0, walk?.amp ?? 0);
          m.group.updateMatrix();
          // instans · modellens skala · delens led och pose
          m.matrix.multiplyMatrices(matrix, model.matrix).multiply(m.group.matrix);
        }
        for (const p of m.parts) p.setMatrixAt(count, m.matrix);
      }
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
