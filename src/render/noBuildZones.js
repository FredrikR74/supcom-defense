import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';

const SEGMENTS = 96;
const RINGS = 10;
/** Lyft över marken, så att ytan inte flimrar mot terrängen. */
const LIFT = 0.12;

/**
 * Byggförbudszoner runt fiendens gateways (se sim/placement.js): en svagt röd
 * yta med en tydlig kant, som följer marken. Dold tills spelaren placerar en byggnad.
 */
export function createNoBuildZones(map, terrain, radius) {
  const group = new THREE.Group();
  group.visible = false;
  if (!radius) return group;
  const fill = new THREE.MeshBasicMaterial({
    color: 0xef4444, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
  });
  const edge = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 });
  const groundY = (x, z) => getHeight(terrain, x, z) + LIFT;

  for (const s of map.spawns) {
    // Polärt rutnät (ringar × segment), så att ytan följer backarna.
    const point = (r, i) => {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const x = Math.min(Math.max(s.x + Math.cos(a) * r, 0), map.size);
      const z = Math.min(Math.max(s.z + Math.sin(a) * r, 0), map.size);
      return [x, groundY(x, z), z];
    };
    const positions = [];
    for (let k = 1; k <= RINGS; k++) {
      for (let i = 0; i <= SEGMENTS; i++) positions.push(...point((radius * k) / RINGS, i));
    }
    positions.push(s.x, groundY(s.x, s.z), s.z);
    const center = positions.length / 3 - 1;
    const row = SEGMENTS + 1;
    const index = [];
    for (let i = 0; i < SEGMENTS; i++) index.push(center, i, i + 1);
    for (let k = 1; k < RINGS; k++) {
      for (let i = 0; i < SEGMENTS; i++) {
        const a = (k - 1) * row + i;
        const b = k * row + i;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const rim = [];
    for (let i = 0; i <= SEGMENTS; i++) rim.push(new THREE.Vector3(...point(radius, i)));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    const disc = new THREE.Mesh(geometry, fill);
    disc.renderOrder = 3;
    group.add(disc, new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), edge));
  }
  return group;
}
