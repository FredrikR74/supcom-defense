import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getHeight } from '../sim/terrain.js';
import { computeSteepCells } from '../sim/pathing.js';
import { createRng } from '../sim/rng.js';

/**
 * Natur på kartan, bara för utseendet (enheter går rakt igenom): gräs, buskar,
 * gran- och lövträd och stenblock. Allt placeras med kartans seed så att samma
 * karta alltid ser likadan ut, och ritas instansierat (några få draw calls).
 * Basplatån, spawnpunkterna och fyndigheterna hålls fria.
 */

/** Slår ihop delar till en geometri med vertexfärg per del. */
function coloredGeometry(parts) {
  return mergeGeometries(parts.map(([geometry, color]) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    }
    return g;
  }));
}

const at = (g, x, y, z) => g.translate(x, y, z);

function pineGeometry() {
  return coloredGeometry([
    [at(new THREE.CylinderGeometry(0.07, 0.11, 0.6, 5), 0, 0.3, 0), 0x4a3524],
    [at(new THREE.ConeGeometry(0.62, 1.0, 7), 0, 0.95, 0), 0x2c4a26],
    [at(new THREE.ConeGeometry(0.48, 0.85, 7), 0, 1.45, 0), 0x31522a],
    [at(new THREE.ConeGeometry(0.32, 0.7, 7), 0, 1.9, 0), 0x375a2e],
  ]);
}

function broadleafGeometry() {
  return coloredGeometry([
    [at(new THREE.CylinderGeometry(0.07, 0.12, 0.9, 5), 0, 0.45, 0), 0x4e3a28],
    [at(new THREE.IcosahedronGeometry(0.62, 0).scale(1, 0.85, 1), 0, 1.25, 0), 0x45632d],
    [at(new THREE.IcosahedronGeometry(0.42, 0), 0.32, 1.45, 0.12), 0x4f6e31],
    [at(new THREE.IcosahedronGeometry(0.38, 0), -0.28, 1.15, -0.18), 0x3e5a29],
  ]);
}

function bushGeometry() {
  return coloredGeometry([
    [at(new THREE.IcosahedronGeometry(0.32, 0).scale(1, 0.7, 1), 0, 0.15, 0), 0x3f5a28],
    [at(new THREE.IcosahedronGeometry(0.24, 0).scale(1, 0.7, 1), 0.22, 0.12, 0.08), 0x4a6630],
    [at(new THREE.IcosahedronGeometry(0.2, 0).scale(1, 0.7, 1), -0.18, 0.1, -0.12), 0x364f24],
  ]);
}

function rockGeometry(rng) {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  const pos = g.attributes.position;
  // Knöla till stenen så att den inte ser ut som en perfekt kropp.
  for (let i = 0; i < pos.count; i++) {
    const k = 0.75 + rng.next() * 0.5;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return coloredGeometry([[g, 0x77706a]]);
}

function grassGeometry() {
  // Fem strån som en tofs, mörka vid roten och ljusa i toppen.
  const positions = [];
  const colors = [];
  const root = new THREE.Color(0x2f4220);
  const tip = new THREE.Color(0x8a9a4a);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const lean = 0.12;
    const h = 0.32 + (k % 2) * 0.1;
    const bx = Math.cos(a) * 0.05;
    const bz = Math.sin(a) * 0.05;
    const px = Math.cos(a + Math.PI / 2) * 0.035;
    const pz = Math.sin(a + Math.PI / 2) * 0.035;
    positions.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    colors.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function createTerrainProps(map, terrain) {
  const group = new THREE.Group();
  const rng = createRng(map.seed * 31 + 7);
  const size = terrain.size;
  const steep = computeSteepCells(terrain);
  const isSteep = (x, z) => steep[Math.min(size - 1, Math.floor(z)) * size + Math.min(size - 1, Math.floor(x))] === 1;
  const nearSteep = (x, z, r) => {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (isSteep(x + dx, z + dz)) return true;
    return false;
  };

  // Fria områden: basplatån, spawnpunkter, fyndigheter och vrak från start.
  const keepClear = [
    { x: map.core.x, z: map.core.z, r: map.terrain.plateau.radius + 3 },
    ...map.spawns.map((s) => ({ ...s, r: 5 })),
    ...map.massDeposits.map((d) => ({ ...d, r: 2.5 })),
    ...(map.wrecks ?? []).map((w) => ({ ...w, r: 2 })),
  ];
  const clear = (x, z, extra = 0) => keepClear.every((k) => Math.hypot(x - k.x, z - k.z) > k.r + extra);
  // Skogsdungar där detta brus är högt.
  const forest = (x, z) => 0.5 + 0.3 * Math.sin(x * 0.09 + map.seed) * Math.cos(z * 0.08 - map.seed) +
    0.2 * Math.sin((x - z) * 0.21 + map.seed * 0.5);

  const kinds = {
    pine: { geometry: pineGeometry(), items: [] },
    broadleaf: { geometry: broadleafGeometry(), items: [] },
    bush: { geometry: bushGeometry(), items: [] },
    rock: { geometry: rockGeometry(rng), items: [] },
    grass: { geometry: grassGeometry(), items: [], doubleSide: true },
  };

  const place = (kind, x, z, scale, sink = 0.05) => {
    kinds[kind].items.push({ x, y: getHeight(terrain, x, z) - sink * scale, z, scale, rot: rng.next() * Math.PI * 2 });
  };

  const area = size * size;
  for (let i = 0; i < area * 0.22; i++) {
    const x = 1 + rng.next() * (size - 2);
    const z = 1 + rng.next() * (size - 2);
    const steepHere = isSteep(x, z);
    const r = rng.next();
    if (steepHere) {
      // Berg: stenblock och enstaka granar på sluttningarna.
      if (r < 0.08) place('rock', x, z, 0.8 + rng.next() * 1.8, 0.25);
      else if (r < 0.12) place('pine', x, z, 0.7 + rng.next() * 0.7, 0.1);
      continue;
    }
    if (!clear(x, z)) {
      if (r < 0.12 && clear(x, z, -map.terrain.plateau.radius * 0.6)) place('grass', x, z, 0.8 + rng.next() * 0.5, 0);
      continue;
    }
    const f = forest(x, z);
    const foothill = nearSteep(x, z, 3);
    if ((f > 0.75 && r < 0.12) || (foothill && r < 0.14)) {
      place(rng.next() < 0.6 ? 'pine' : 'broadleaf', x, z, 0.8 + rng.next() * 0.8);
    } else if (r < 0.05 + (f > 0.65 ? 0.05 : 0) + (foothill ? 0.04 : 0)) {
      place('bush', x, z, 0.8 + rng.next() * 0.9);
    } else if (r < 0.065 + (foothill ? 0.04 : 0)) {
      place('rock', x, z, 0.3 + rng.next() * 0.7, 0.2);
    } else if (r < 0.32) {
      place('grass', x, z, 0.8 + rng.next() * 0.6, 0);
    }
  }

  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tint = new THREE.Color();
  for (const [name, kind] of Object.entries(kinds)) {
    if (kind.items.length === 0) continue;
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: name !== 'grass',
      roughness: 0.9,
      side: kind.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.InstancedMesh(kind.geometry, material, kind.items.length);
    kind.items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rot);
      matrix.compose(pos.set(it.x, it.y, it.z), q, scale.setScalar(it.scale));
      mesh.setMatrixAt(i, matrix);
      // Lite olika nyans på varje exemplar.
      const v = 0.85 + rng.next() * 0.3;
      mesh.setColorAt(i, tint.setRGB(v, v * (0.95 + rng.next() * 0.1), v));
    });
    mesh.name = name;
    group.add(mesh);
  }
  return group;
}
