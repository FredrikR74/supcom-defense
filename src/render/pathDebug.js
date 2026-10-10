import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';
import { isBlockedCell } from '../sim/pathing.js';

/**
 * Felsökningsvyer för fiendernas vägar:
 * - blockerade rutor som röda rutor (brant eller byggnad)
 * - flödesfältet som pilar från varje ruta mot nästa ruta
 * Byggs om när flödesfältet räknas om (`world.pathVersion`).
 */
export function createPathDebug(terrain) {
  const n = terrain.size;
  const group = new THREE.Group();

  const quad = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
  const blocked = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({
    color: 0xef4444, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false,
  }), n * n);
  blocked.count = 0;
  blocked.frustumCulled = false;
  blocked.visible = false;
  blocked.renderOrder = 3;

  const arrowPositions = new Float32Array(n * n * 6);
  const arrowColors = new Float32Array(n * n * 6);
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute('position', new THREE.BufferAttribute(arrowPositions, 3));
  arrowGeometry.setAttribute('color', new THREE.BufferAttribute(arrowColors, 3));
  const arrows = new THREE.LineSegments(arrowGeometry, new THREE.LineBasicMaterial({ vertexColors: true }));
  arrows.frustumCulled = false;
  arrows.visible = false;

  group.add(blocked, arrows);
  let builtVersion = -1;
  const lift = 0.12;
  const m = new THREE.Matrix4();

  function rebuild(world) {
    let b = 0;
    let a = 0;
    const { dist, next } = world.flow;
    for (let i = 0; i < n * n; i++) {
      const x = (i % n) + 0.5;
      const z = Math.floor(i / n) + 0.5;
      const y = getHeight(terrain, x, z) + lift;
      if (isBlockedCell(world, i)) {
        m.makeTranslation(x, y, z);
        blocked.setMatrixAt(b++, m);
        continue;
      }
      const j = next[i];
      if (j < 0 || !Number.isFinite(dist[i])) continue;
      const tx = (j % n) + 0.5;
      const tz = Math.floor(j / n) + 0.5;
      // Pil från rutans mitt en bit mot nästa ruta: mörk bakände, ljus spets.
      const ex = x + (tx - x) * 0.45;
      const ez = z + (tz - z) * 0.45;
      arrowPositions.set([x, y, z, ex, getHeight(terrain, ex, ez) + lift, ez], a * 6);
      arrowColors.set([0.1, 0.2, 0.4, 0.5, 0.9, 1], a * 6);
      a++;
    }
    blocked.count = b;
    blocked.instanceMatrix.needsUpdate = true;
    arrowGeometry.setDrawRange(0, a * 2);
    arrowGeometry.attributes.position.needsUpdate = true;
    arrowGeometry.attributes.color.needsUpdate = true;
    builtVersion = world.pathVersion;
  }

  return {
    group,
    toggleBlocked() { blocked.visible = !blocked.visible; },
    toggleFlow() { arrows.visible = !arrows.visible; },
    update(world) {
      if ((blocked.visible || arrows.visible) && world.flow && builtVersion !== world.pathVersion) {
        rebuild(world);
      }
    },
  };
}
