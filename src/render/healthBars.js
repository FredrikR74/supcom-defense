import * as THREE from 'three';
import { isRevealed } from '../sim/intel.js';

/**
 * HP-staplar ovanför skadade enheter och byggnader, som i FA, och under dem
 * en turkos framstegsstapel för byggnader som byggs eller uppgraderas (som
 * FA:s byggstapel). Ritas instansierat (bakgrund + fyllnad) och vänds alltid
 * mot kameran.
 */
const PROGRESS_COLOR = 0x67e8f9;

/**
 * Hur långt en byggnad kommit med sitt bygge eller sin uppgradering, eller
 * ACU:n med sin uppgradering (enhancement), annars null.
 */
function buildProgress(e) {
  if (e.kind === 'unit') return e.orders[0]?.type === 'enhance' ? e.orders[0].progress : null;
  if (e.kind !== 'structure') return null;
  if (e.upgrade) return e.upgrade.progress;
  return e.built ? null : e.progress;
}
export function createHealthBars(capacity = 2048) {
  const group = new THREE.Group();
  const quad = new THREE.PlaneGeometry(1, 1);
  const material = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });

  const bg = new THREE.InstancedMesh(quad, material(0x111111), capacity);
  const fill = new THREE.InstancedMesh(quad, material(0xffffff), capacity);
  fill.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  for (const mesh of [bg, fill]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  bg.renderOrder = 8;
  fill.renderOrder = 9;

  const m = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const color = new THREE.Color();
  const HEIGHT = 0.18;

  return {
    group,

    /** `anchor(entity)` ger världspunkten ovanför entiteten där stapeln ska sitta. */
    update(world, camera, anchor) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      let n = 0;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      /** En stapel med andelen `frac` fylld, `drop` stapelhöjder under ankarpunkten. */
      const bar = (p, width, frac, fillColor, drop = 0) => {
        if (n >= capacity) return;
        const at = pos.copy(p).addScaledVector(up, -drop * (HEIGHT + 0.12));
        m.compose(at, camera.quaternion, scale.set(width + 0.08, HEIGHT + 0.08, 1));
        bg.setMatrixAt(n, m);
        // Fyllnaden är vänsterjusterad: flytta mitten åt vänster med den del som saknas.
        offset.copy(right).multiplyScalar(-(width * (1 - frac)) / 2);
        m.compose(at.add(offset), camera.quaternion, scale.set(width * frac, HEIGHT, 1));
        fill.setMatrixAt(n, m);
        fill.setColorAt(n, color.set(fillColor));
        n++;
      };
      for (const e of world.entities) {
        if (n >= capacity) break;
        if ((e.kind !== 'unit' && e.kind !== 'structure') || !isRevealed(e)) continue;
        const progress = buildProgress(e);
        const damaged = e.hp < e.maxHp && (e.kind === 'unit' || e.built);
        if (!damaged && progress === null) continue;
        const width = Math.max(0.8, e.radius * 1.6);
        const p = anchor(e);
        if (damaged) {
          const frac = Math.max(0, e.hp / e.maxHp);
          bar(p, width, frac, frac > 0.5 ? 0x4ade80 : frac > 0.25 ? 0xfacc15 : 0xef4444);
        }
        if (progress !== null) bar(p, width, Math.min(1, progress), PROGRESS_COLOR, damaged ? 1 : 0);
      }
      for (const mesh of [bg, fill]) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      }
      fill.instanceColor.needsUpdate = true;
    },
  };
}
