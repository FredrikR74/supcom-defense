import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createPanelTextures, boxProjectUVs } from './surfaceDetail.js';

export const PLAYER_COLOR = 0x3b82f6;
export const ENEMY_COLOR = 0xb91c1c;

const MATERIALS = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.9, flatShading: true }),
  glow: new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.2 }),
  massGlow: new THREE.MeshStandardMaterial({ color: 0xbef264, emissive: 0x84cc16, emissiveIntensity: 1 }),
  energyGlow: new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xeab308, emissiveIntensity: 1.2 }),
  enemyGlow: new THREE.MeshStandardMaterial({ color: 0xfca5a5, emissive: 0xef4444, emissiveIntensity: 1.4 }),
  /** UEF-pansar: ljusgrått och facetterat (flatShading ger skarpa kanter). */
  armor: new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.55, roughness: 0.45, flatShading: true }),
  armorDark: new THREE.MeshStandardMaterial({ color: 0x3f4650, metalness: 0.5, roughness: 0.65, flatShading: true }),
  tread: new THREE.MeshStandardMaterial({ color: 0x24282e, metalness: 0.3, roughness: 0.9, flatShading: true }),
  teamPanel: new THREE.MeshStandardMaterial({
    color: PLAYER_COLOR, metalness: 0.45, roughness: 0.4, emissive: 0x1d4ed8, emissiveIntensity: 0.3, flatShading: true,
  }),
  /** Cybran: mörkt, nästan svart metall med röda lagfärgsfält. */
  cybran: new THREE.MeshStandardMaterial({ color: 0x353a38, metalness: 0.65, roughness: 0.5, flatShading: true }),
  cybranDark: new THREE.MeshStandardMaterial({ color: 0x1f2321, metalness: 0.5, roughness: 0.6, flatShading: true }),
  enemyPanel: new THREE.MeshStandardMaterial({
    color: ENEMY_COLOR, metalness: 0.4, roughness: 0.45, emissive: 0x7f1d1d, emissiveIntensity: 0.4, flatShading: true,
  }),
};

/**
 * Prisma: en sidoprofil i (z, y) som dras ut längs x med bredden `width`,
 * centrerad kring x = `x`. Små fasningar på kanterna fångar ljuset.
 */
function prism(profile, width, material, x = 0, bevel = 0.02) {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, width - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  geometry.rotateY(-Math.PI / 2); // profilens x -> världens z, utdragningen -> x
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  geometry.translate(x - (min.x + max.x) / 2, 0, 0);
  return new THREE.Mesh(geometry, material);
}

/** Låda med fasade kanter. */
function chamferBox(w, h, d, material, x, y, z, c = 0.03) {
  const hz = d / 2 - c;
  const hy = h / 2 - c;
  const m = prism([[-hz, -hy], [hz, -hy], [hz, hy], [-hz, hy]], w, material, 0, c);
  m.position.set(x, y, z);
  return m;
}

/**
 * Slår ihop alla meshar i `parts` med samma material till en mesh per material,
 * så att en detaljerad modell bara kostar några få draw calls.
 */
function mergeByMaterial(parts) {
  const holder = new THREE.Group();
  holder.add(...parts);
  holder.updateMatrixWorld(true);
  const byMaterial = new Map();
  holder.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    g.clearGroups();
    boxProjectUVs(g);
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    byMaterial.get(o.material).push(g);
  });
  return [...byMaterial].map(([material, geometries]) => new THREE.Mesh(mergeGeometries(geometries), material));
}

/** Grupp med namn vars innehåll slås ihop per material. */
function namedGroup(name, parts, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.add(...mergeByMaterial(parts));
  g.position.set(x, y, z);
  return g;
}

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function cylinder(r, h, material, x, y, z, segments = 16) {
  return taper(r, r, h, material, x, y, z, segments);
}

/** Cylinder som smalnar av (olika radie upptill och nedtill). */
function taper(rTop, rBottom, h, material, x, y, z, segments = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  m.position.set(x, y, z);
  return m;
}

/** Vrider en del (radianer kring x, y och z) och returnerar den. */
function rotated(mesh, x = 0, y = 0, z = 0) {
  mesh.rotation.set(x, y, z);
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Balk från punkt `a` till `b` ([x, y, z]) med tjockleken `t`, fyrkantig eller rund. */
function strut(a, b, t, material, round = false) {
  const from = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(from);
  const length = dir.length();
  dir.normalize();
  const geometry = round
    ? new THREE.CylinderGeometry(t / 2, t / 2, length, 8)
    : new THREE.BoxGeometry(t, length, t);
  const m = new THREE.Mesh(geometry, material);
  m.quaternion.setFromUnitVectors(UP, dir);
  m.position.copy(from).addScaledVector(dir, length / 2);
  return m;
}

/**
 * Skalar en färdig modell (delarna överst i modellen) runt origo, t.ex. för en
 * större variant av en enhet. Rörliga delar behåller sina namn och leder.
 */
function scaleParts(parts, s) {
  for (const o of parts) {
    o.position.multiplyScalar(s);
    o.scale.multiplyScalar(s);
  }
  return parts;
}

/**
 * Cybran-insektsben i tre led: från höften rakt ut, upp till knät, ut och ner
 * till vristen och en spetsig fot i marken. Varje knä har ett rött ljus.
 * Varje ben är en egen grupp ('leg0'...) med leden i höften, så att det kan
 * svängas när enheten går (se poseLeg).
 */
function insectLegs(hips, { hipY, reach, kneeY, t }) {
  const { cybranDark, cybran, enemyGlow } = MATERIALS;
  return hips.map(([x, z], i) => {
    const side = Math.sign(x);
    const spread = Math.sign(z) * 0.35;
    // Punkter relativt höften.
    const out = (d, y) => [side * d * reach, y - hipY, spread * d * reach];
    const coxa = out(0.25, hipY + 0.02);
    const knee = out(0.55, kneeY);
    const ankle = out(0.95, kneeY * 0.45);
    const foot = out(1.05, 0);
    const leg = namedGroup(`leg${i}`, [
      strut([0, 0, 0], coxa, t * 1.3, cybranDark),
      strut(coxa, knee, t * 1.15, cybran),
      strut(knee, ankle, t * 0.85, cybran),
      strut(ankle, foot, t * 0.5, cybranDark),
      chamferBox(t * 1.6, t * 1.6, t * 1.6, cybranDark, ...knee, t * 0.4),
      chamferBox(t * 1.1, t * 1.1, t * 1.1, cybranDark, ...ankle, t * 0.3),
      chamferBox(t * 0.5, t * 0.5, t * 0.5, enemyGlow, knee[0], knee[1] + t * 0.8, knee[2], t * 0.1),
    ], x, hipY, z);
    leg.userData.side = side;
    // Diagonala par går i takt (vänster fram + höger bak), som en insekt.
    leg.userData.phaseOffset = (i === 0 || i === 3) ? 0 : Math.PI;
    return leg;
  });
}

/**
 * Gångpose för ett insektsben: svänger fram och bak kring höften och lyfter
 * foten när benet förs framåt. `amp` 0 = stilla, 1 = full gång.
 */
export function poseLeg(leg, phase, amp) {
  const p = phase + leg.userData.phaseOffset;
  leg.rotation.y = Math.sin(p) * 0.4 * amp;
  leg.rotation.z = leg.userData.side * Math.max(0, Math.cos(p)) * 0.3 * amp;
}

/** Modeller med origo på marken i mitten och framsidan mot +z. */
const MODELS = {
  /**
   * UEF Quantum Gateway: kvadratisk, industriell plattform med fyra höga torn i
   * hörnen, en fackverksram mellan tornen och en emitter som hänger över den
   * glödande teleportplattan, med ramp, rör och lampor runt om.
   */
  core() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const parts = [
      chamferBox(4, 0.3, 4, armorDark, 0, 0.15, 0, 0.08), // grund
      chamferBox(3.6, 0.2, 3.6, armor, 0, 0.4, 0, 0.06), // däck
      chamferBox(3.66, 0.05, 3.66, teamPanel, 0, 0.32, 0, 0.01),
      taper(1.15, 1.25, 0.12, armorDark, 0, 0.56, 0, 32), // plattans kant
      taper(1.0, 1.0, 0.04, glow, 0, 0.63, 0, 32), // teleportplatta
      prism([[1.8, 0.3], [2.25, 0.3], [2.25, 0.33], [1.8, 0.5]], 1.2, armor, 0, 0.02), // ramp
      // Emittern ovanför plattan och strålen ner.
      chamferBox(0.9, 0.35, 0.9, armorDark, 0, 2.55, 0, 0.06),
      chamferBox(0.6, 0.05, 0.6, glow, 0, 2.36, 0, 0.02),
      chamferBox(0.94, 0.06, 0.94, teamPanel, 0, 2.7, 0, 0.01),
      strut([0, 0.65, 0], [0, 2.34, 0], 0.1, glow, true),
    ];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * 1.45;
      const z = sz * 1.45;
      parts.push(
        chamferBox(0.75, 2.6, 0.75, armor, x, 1.8, z, 0.06), // torn
        chamferBox(0.6, 0.3, 0.6, armorDark, x, 3.25, z, 0.05), // tornets tak
        chamferBox(0.05, 1.6, 0.25, teamPanel, x + sx * 0.385, 1.8, z, 0.01),
        chamferBox(0.25, 1.6, 0.05, teamPanel, x, 1.8, z + sz * 0.385, 0.01),
        chamferBox(0.12, 0.12, 0.12, glow, x, 3.45, z, 0.02), // lampa
        chamferBox(0.04, 0.3, 0.14, glow, x - sx * 0.385, 2.6, z, 0.01), // fönster
        strut([x - sx * 0.3, 2.9, z - sz * 0.3], [sx * 0.4, 2.55, sz * 0.4], 0.12, armorDark), // stag till emittern
      );
    }
    // Fackverksram mellan tornens toppar.
    for (const s of [-1, 1]) {
      parts.push(
        chamferBox(2.2, 0.18, 0.18, armor, 0, 3.0, s * 1.45, 0.03),
        chamferBox(0.18, 0.18, 2.2, armor, s * 1.45, 3.0, 0, 0.03),
      );
      for (const t of [-0.6, 0, 0.6]) {
        parts.push(strut([t - 0.3, 3.0, s * 1.45], [t + 0.3, 2.8, s * 1.45], 0.05, armorDark));
        parts.push(strut([s * 1.45, 3.0, t - 0.3], [s * 1.45, 2.8, t + 0.3], 0.05, armorDark));
      }
    }
    // Rör och lampor längs däcket.
    for (const s of [-1, 1]) {
      parts.push(
        rotated(cylinder(0.07, 2.0, armorDark, s * 1.65, 0.6, 0, 8), Math.PI / 2),
        chamferBox(0.1, 0.06, 0.1, glow, s * 0.9, 0.53, 1.6, 0.01),
      );
    }
    return mergeByMaterial(parts);
  },

  /**
   * Cybran Quantum Gateway (fiendens spawnpunkter): åttkantig, mörk sockel med en
   * glödande röd grop, sex vassa spikar som kröker in över den, och en svävande
   * röd kärna i en taggig bur.
   */
  cybranGateway() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const octagon = (r, h, material, y, flare = 1.05) =>
      rotated(taper(r, r * flare, h, material, 0, y, 0, 8), 0, Math.PI / 8);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), enemyGlow);
    orb.position.y = 2.1;
    const parts = [
      octagon(2.0, 0.28, cybranDark, 0.14),
      octagon(1.92, 0.05, enemyPanel, 0.3, 1),
      octagon(1.6, 0.18, cybran, 0.41),
      octagon(1.05, 0.08, cybranDark, 0.54),
      taper(0.9, 0.9, 0.03, enemyGlow, 0, 0.59, 0, 24), // grop
      orb,
      strut([0, 0.6, 0], [0, 1.75, 0], 0.08, enemyGlow, true),
    ];
    for (const [rx, ry] of [[0, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI / 2]]) {
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 4, 12), cybranDark);
      cage.position.y = 2.1;
      cage.rotation.set(rx, ry, 0);
      parts.push(cage);
    }
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const at = (r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
      const curve = [at(1.5, 0.45), at(1.8, 1.4), at(1.6, 2.4), at(1.05, 3.1), at(0.5, 3.35)];
      const foot = prism([[-0.35, 0.3], [0.35, 0.3], [0.2, 0.75], [-0.25, 0.65]], 0.5, cybranDark, 0, 0.03);
      foot.position.set(...at(1.5, 0));
      foot.rotation.y = a + Math.PI / 2;
      parts.push(foot);
      for (let k = 0; k < curve.length - 1; k++) {
        parts.push(strut(curve[k], curve[k + 1], 0.26 - k * 0.055, k % 2 ? cybranDark : cybran));
      }
      parts.push(strut(at(1.95, 1.2), at(1.78, 2.3), 0.05, enemyPanel));
      parts.push(strut(at(1.55, 1.3), at(1.4, 2.3), 0.04, enemyGlow));
      // Små taggar mellan spikarna.
      const b = a + Math.PI / 6;
      const mid = (r, y) => [Math.sin(b) * r, y, Math.cos(b) * r];
      parts.push(strut(mid(1.7, 0.3), mid(2.05, 0.95), 0.08, cybran));
      parts.push(chamferBox(0.08, 0.08, 0.08, enemyGlow, ...mid(1.35, 0.55), 0.01));
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF ACU: tung, upprätt stridsrobot. Brett, rundat hjärtformat bröstskydd
   * med ventilspringor i två kolumner och en mittrygg, en liten hjälm med
   * ansiktsgaller högt mellan axlarna, stora axelskydd i lagfärg med en rund
   * ventil, räfflade överarmar och underarmar som är vågräta vapenkapslar
   * framåt: en dubbelpipig till höger och Zephyr-kanonen med runda mynningar
   * till vänster. Smal, segmenterad midja och kraftiga ben med vinklade
   * pansarplåtar. Benen ('legL', 'legR') har leden i höften.
   */
  acu() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const HIP_Y = 1.0;

    const leg = (name, x) => {
      const side = Math.sign(x);
      return namedGroup(name, [
        chamferBox(0.18, 0.18, 0.2, armorDark, 0, 0, 0, 0.03), // höftled
        chamferBox(0.16, 0.4, 0.18, armorDark, 0, -0.22, 0, 0.03), // lårben
        prism([[-0.1, -0.02], [0.19, -0.02], [0.21, -0.38], [0.1, -0.47], [-0.08, -0.4]], 0.26, armor, 0, 0.03), // lårplåt
        rotated(chamferBox(0.03, 0.36, 0.28, armor, side * 0.15, -0.2, 0.04, 0.01), 0, 0, side * 0.12), // utsvängd sidoplåt
        chamferBox(0.02, 0.2, 0.18, teamPanel, side * 0.175, -0.2, 0.04, 0.005),
        chamferBox(0.12, 0.025, 0.02, armorDark, 0, -0.16, 0.2, 0.004),
        chamferBox(0.12, 0.025, 0.02, armorDark, 0, -0.22, 0.205, 0.004),
        chamferBox(0.2, 0.15, 0.18, armorDark, 0, -0.5, 0.04, 0.03), // knä
        prism([[0.06, -0.42], [0.21, -0.46], [0.2, -0.58], [0.06, -0.6]], 0.21, armor, 0, 0.02), // knäskydd
        prism([[-0.11, -0.55], [0.15, -0.55], [0.17, -0.72], [0.11, -0.88], [-0.1, -0.88]], 0.25, armor, 0, 0.03), // smalben
        chamferBox(0.15, 0.1, 0.15, armorDark, 0, -0.9, 0, 0.02), // vrist
        prism([[-0.15, -1.0], [0.26, -1.0], [0.29, -0.94], [0.14, -0.88], [-0.13, -0.89]], 0.28, armorDark, 0, 0.02), // fot
      ], x, HIP_Y, 0);
    };

    // Hjärtformat bröstskydd: två ovala halvor, springor i chevron och en mittrygg.
    const chestHalves = [-1, 1].map((side) => {
      const half = taper(0.2, 0.2, 0.06, armor, 0, 0, 0, 12);
      half.rotation.x = Math.PI / 2;
      half.scale.set(1, 1, 1.12);
      half.position.set(side * 0.13, 0.66, 0.335);
      return half;
    });
    const slots = [];
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        slots.push(rotated(chamferBox(0.15, 0.026, 0.02, armorDark, side * 0.14, 0.57 + i * 0.065, 0.37, 0.004), 0, 0, -side * 0.12));
      }
    }

    const arms = [-1, 1].flatMap((side) => {
      const x = side * 0.5;
      return [
        // Axelskydd med lagfärgad, avtrappad topp och en rund ventil.
        chamferBox(0.34, 0.26, 0.42, armor, side * 0.48, 0.84, 0, 0.06),
        chamferBox(0.3, 0.09, 0.36, teamPanel, side * 0.49, 1.0, -0.01, 0.03),
        chamferBox(0.03, 0.16, 0.36, teamPanel, side * 0.655, 0.84, 0, 0.008),
        taper(0.075, 0.075, 0.03, armorDark, side * 0.45, 1.05, 0.11, 12),
        taper(0.04, 0.04, 0.035, armor, side * 0.45, 1.053, 0.11, 10),
        // Räfflad överarm och armbåge.
        chamferBox(0.14, 0.3, 0.15, armor, x, 0.6, 0, 0.03),
        ...[0.52, 0.6, 0.68].map((y) => chamferBox(0.17, 0.035, 0.18, armorDark, x, y, 0, 0.008)),
        chamferBox(0.16, 0.16, 0.16, armorDark, x, 0.42, 0.02, 0.03),
      ];
    });

    // Höger underarm: dubbelpipig vapenkapsel framåt.
    const rightGun = [
      chamferBox(0.22, 0.22, 0.62, armor, -0.52, 0.38, 0.28, 0.04),
      chamferBox(0.2, 0.02, 0.5, teamPanel, -0.52, 0.495, 0.26, 0.005),
      chamferBox(0.02, 0.14, 0.5, teamPanel, -0.635, 0.38, 0.26, 0.005),
      ...[0.12, 0.2, 0.28].map((z) => chamferBox(0.02, 0.1, 0.03, armorDark, -0.405, 0.38, z, 0.004)),
      ...[0.33, 0.43].flatMap((y) => [
        strut([-0.52, y, 0.58], [-0.52, y, 0.78], 0.075, armorDark, true),
        strut([-0.52, y, 0.78], [-0.52, y, 0.795], 0.055, glow, true),
      ]),
    ];
    // Vänster underarm: Zephyr-kanonen, en grov kapsel med två runda mynningar.
    const leftGun = [
      chamferBox(0.27, 0.27, 0.6, armor, 0.53, 0.38, 0.27, 0.05),
      chamferBox(0.24, 0.02, 0.48, teamPanel, 0.53, 0.52, 0.25, 0.005),
      chamferBox(0.02, 0.16, 0.48, teamPanel, 0.67, 0.38, 0.25, 0.005),
      strut([0.53, 0.4, 0.56], [0.53, 0.4, 0.66], 0.2, armorDark, true),
      strut([0.53, 0.4, 0.66], [0.53, 0.4, 0.668], 0.09, glow, true),
      strut([0.53, 0.27, 0.56], [0.53, 0.27, 0.62], 0.09, armorDark, true),
      strut([0.53, 0.27, 0.62], [0.53, 0.27, 0.63], 0.06, glow, true),
    ];

    const upper = namedGroup('torso', [
      chamferBox(0.4, 0.16, 0.28, armorDark, 0, 0, 0, 0.03), // bäcken
      chamferBox(0.26, 0.07, 0.22, armorDark, 0, 0.13, 0, 0.02), // midja, två segment
      chamferBox(0.28, 0.07, 0.23, armor, 0, 0.21, 0, 0.02),
      prism([[-0.22, 0.3], [0.16, 0.3], [0.26, 0.45], [0.27, 0.75], [0.18, 0.92], [-0.22, 0.92], [-0.27, 0.6]], 0.7, armor, 0, 0.04),
      ...chestHalves,
      ...slots,
      chamferBox(0.05, 0.34, 0.04, armor, 0, 0.66, 0.365, 0.01), // mittrygg
      chamferBox(0.44, 0.36, 0.18, armorDark, 0, 0.65, -0.28, 0.04), // ryggsäck
      cylinder(0.05, 0.16, armor, -0.12, 0.88, -0.31, 8),
      cylinder(0.05, 0.16, armor, 0.12, 0.88, -0.31, 8),
      // Liten hjälm med ansiktsgaller, högt mellan axlarna.
      chamferBox(0.12, 0.08, 0.12, armorDark, 0, 0.95, 0, 0.02), // hals
      prism([[-0.08, 0.95], [0.11, 0.95], [0.15, 1.05], [0.08, 1.21], [-0.07, 1.19], [-0.1, 1.02]], 0.17, armor, 0, 0.02),
      ...[1.0, 1.035, 1.07].map((y) => chamferBox(0.08, 0.012, 0.015, armorDark, 0, y, 0.16, 0.003)),
      chamferBox(0.1, 0.018, 0.015, glow, 0, 1.105, 0.143, 0.003), // visir
      ...arms,
      ...rightGun,
      ...leftGun,
    ], 0, HIP_Y, 0);

    return [leg('legR', -0.2), leg('legL', 0.2), upper];
  },

  /**
   * Cybran Mantis: hukande, framåtlutad kropp med pansarplåtar som pilar bakåt,
   * en ryggkam, ett sensorhuvud med tre röda ögon och två tunga laserarmar.
   */
  mantis() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const parts = [
      // Kropp: kilformad, låg fram och hög bak.
      prism([[-0.5, 0.48], [0.2, 0.42], [0.48, 0.52], [0.4, 0.68], [-0.05, 0.8], [-0.5, 0.74]], 0.5, cybran, 0, 0.03),
      prism([[-0.45, 0.78], [0.1, 0.8], [-0.25, 0.92], [-0.55, 0.86]], 0.12, cybranDark, 0, 0.02), // ryggkam
      chamferBox(0.04, 0.03, 0.42, enemyGlow, 0, 0.83, -0.12, 0.01),
      rotated(chamferBox(0.3, 0.02, 0.36, enemyPanel, 0, 0.775, 0.18, 0.005), 0.26),
      // Huvud med tre ögon.
      prism([[0.36, 0.5], [0.6, 0.52], [0.62, 0.6], [0.44, 0.66], [0.32, 0.64]], 0.26, cybranDark, 0, 0.02),
      ...[-0.07, 0, 0.07].map((x) => chamferBox(0.035, 0.03, 0.02, enemyGlow, x, 0.59, 0.625, 0.005)),
      // Bakre motorkåpa med ventiler.
      chamferBox(0.36, 0.18, 0.16, cybranDark, 0, 0.62, -0.56, 0.03),
      chamferBox(0.26, 0.03, 0.02, enemyGlow, 0, 0.63, -0.645, 0.005),
    ];
    const legs = insectLegs([[-0.2, 0.25], [0.2, 0.25], [-0.2, -0.28], [0.2, -0.28]], { hipY: 0.55, reach: 0.6, kneeY: 0.82, t: 0.07 });
    for (const side of [-1, 1]) {
      const plate = prism([[-0.45, 0], [0.3, 0], [0.18, 0.16], [-0.5, 0.12]], 0.04, enemyPanel, 0, 0.01);
      plate.position.set(side * 0.27, 0.62, 0);
      plate.rotation.z = side * 0.5;
      const x = side * 0.36;
      parts.push(
        plate,
        // Laserarm: axelled, kåpa, rör och glödande mynning.
        chamferBox(0.14, 0.14, 0.14, cybranDark, side * 0.3, 0.6, 0.18, 0.03),
        prism([[-0.02, 0.5], [0.32, 0.52], [0.4, 0.57], [0.32, 0.63], [-0.02, 0.63]], 0.12, cybran, x, 0.02),
        strut([x, 0.55, 0.25], [x, 0.53, 0.78], 0.06, cybranDark, true),
        strut([x, 0.53, 0.66], [x, 0.53, 0.72], 0.085, cybran, true),
        strut([x, 0.53, 0.78], [x, 0.53, 0.81], 0.05, enemyGlow, true),
      );
    }
    return [...mergeByMaterial(parts), ...legs];
  },

  /**
   * Cybran Mole (Land Scout): liten, rund spindel på tunna ben med en
   * sensorparabol på en mast och två antenner.
   */
  mole() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const dish = taper(0.17, 0.03, 0.07, cybranDark, 0, 0, 0, 10);
    dish.position.set(0, 1.0, -0.12);
    dish.rotation.x = 0.6;
    const dishGlow = taper(0.04, 0.04, 0.04, enemyGlow, 0, 1.03, -0.1, 8);
    dishGlow.rotation.x = 0.6;
    return mergeByMaterial([
      taper(0.2, 0.26, 0.12, cybran, 0, 0.42, 0, 8), // underrede
      taper(0.13, 0.22, 0.12, cybran, 0, 0.54, 0, 8), // kupol
      taper(0.235, 0.235, 0.025, enemyPanel, 0, 0.485, 0, 8),
      prism([[0.15, 0.4], [0.32, 0.43], [0.3, 0.5], [0.15, 0.54]], 0.16, cybranDark, 0, 0.015), // nos
      chamferBox(0.1, 0.03, 0.02, enemyGlow, 0, 0.47, 0.32, 0.005),
      strut([0, 0.58, -0.08], [0, 0.98, -0.12], 0.035, cybranDark, true),
      dish,
      dishGlow,
      strut([-0.08, 0.58, -0.12], [-0.16, 0.9, -0.3], 0.015, cybranDark, true),
      strut([0.08, 0.58, -0.12], [0.16, 0.9, -0.3], 0.015, cybranDark, true),
    ]).concat(insectLegs([[-0.14, 0.12], [0.14, 0.12], [-0.14, -0.12], [0.14, -0.12]], { hipY: 0.42, reach: 0.42, kneeY: 0.6, t: 0.045 }));
  },

  /**
   * Cybran Medusa (Mobile Light Artillery): bred, tung kropp på fyra kraftiga
   * ben och ett granatkastartorn med grovt rör, rekylkåpa och ammunitionstrummor.
   */
  medusa() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const parts = [
      prism([[-0.55, 0.46], [0.36, 0.44], [0.55, 0.56], [0.42, 0.72], [-0.42, 0.76], [-0.6, 0.64]], 0.62, cybran, 0, 0.03),
      chamferBox(0.66, 0.05, 0.5, cybranDark, 0, 0.47, 0, 0.02), // buksköld
      prism([[0.3, 0.5], [0.58, 0.54], [0.56, 0.62], [0.36, 0.68]], 0.3, cybranDark, 0, 0.02), // nos
      ...[-0.06, 0.06].map((x) => chamferBox(0.04, 0.03, 0.02, enemyGlow, x, 0.59, 0.6, 0.005)),
      // Torn: sockel, kåpa, rör med rekylhylsa och glödande mynning.
      taper(0.24, 0.3, 0.1, cybranDark, 0, 0.8, -0.1, 8),
      taper(0.31, 0.31, 0.025, enemyPanel, 0, 0.765, -0.1, 8),
      prism([[-0.32, 0.84], [0.12, 0.84], [0.2, 0.96], [-0.1, 1.08], [-0.34, 1.0]], 0.36, cybran, 0, 0.02),
      strut([0, 0.98, -0.05], [0, 1.5, 0.45], 0.15, cybranDark, true),
      strut([0, 1.02, -0.01], [0, 1.2, 0.16], 0.22, cybran, true),
      strut([0, 1.5, 0.45], [0, 1.54, 0.49], 0.12, enemyGlow, true),
      chamferBox(0.04, 0.03, 0.3, enemyGlow, 0, 1.085, -0.15, 0.01),
    ];
    for (const side of [-1, 1]) {
      const drum = taper(0.1, 0.1, 0.16, cybranDark, side * 0.27, 0.9, -0.32, 8);
      drum.rotation.z = Math.PI / 2;
      const plate = prism([[-0.5, 0], [0.35, 0], [0.25, 0.14], [-0.55, 0.1]], 0.04, enemyPanel, 0, 0.01);
      plate.position.set(side * 0.31, 0.56, 0);
      plate.rotation.z = side * 0.55;
      parts.push(drum, plate);
    }
    const legs = insectLegs([[-0.26, 0.28], [0.26, 0.28], [-0.26, -0.3], [0.26, -0.3]], { hipY: 0.55, reach: 0.68, kneeY: 0.85, t: 0.085 });
    return [...mergeByMaterial(parts), ...legs];
  },

  /**
   * UEF MA12 Striker: lågt, kantigt skrov med sluttande front mellan två breda
   * bandpaket, och ett kilformat torn ('turret') med långt rör och mynningsbroms.
   */
  striker() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;

    // Lång, låg och smal som FA:s MA12 Striker (ca 1,7 gånger så lång som bred).
    const hull = [];
    for (const side of [-1, 1]) {
      const x = side * 0.37;
      hull.push(
        prism([[-0.8, 0.12], [-0.7, 0.02], [0.7, 0.02], [0.82, 0.14], [0.74, 0.29], [-0.74, 0.29]], 0.24, tread, x),
        prism([[-0.78, 0.27], [0.78, 0.27], [0.84, 0.34], [0.74, 0.39], [-0.76, 0.39]], 0.27, armor, x), // stänkskärm
        chamferBox(0.06, 0.02, 1.15, teamPanel, x + side * 0.05, 0.4, -0.02, 0.005),
      );
      for (const z of [-0.56, -0.28, 0, 0.28, 0.56]) {
        const wheel = cylinder(0.1, 0.04, armorDark, side * 0.495, 0.13, z, 10);
        const hub = cylinder(0.045, 0.03, armor, side * 0.515, 0.13, z, 8);
        wheel.rotation.z = hub.rotation.z = Math.PI / 2;
        hull.push(wheel, hub);
      }
    }
    // Skrov med sluttande front, motordäck baktill och strålkastare.
    hull.push(prism([[-0.74, 0.2], [0.56, 0.2], [0.82, 0.34], [0.66, 0.49], [-0.66, 0.49], [-0.77, 0.4]], 0.54, armor, 0, 0.03));
    const glacis = chamferBox(0.34, 0.02, 0.17, teamPanel, 0, 0.44, 0.745, 0.005);
    glacis.rotation.x = 0.85;
    hull.push(glacis, chamferBox(0.4, 0.04, 0.34, armorDark, 0, 0.5, -0.47, 0.01));
    for (const z of [-0.58, -0.47, -0.36]) hull.push(box(0.36, 0.02, 0.03, armor, 0, 0.53, z));
    for (const x of [-0.19, 0.19]) hull.push(chamferBox(0.07, 0.05, 0.03, glow, x, 0.32, 0.79, 0.01));

    const barrel = cylinder(0.045, 0.8, armor, 0, 0.11, 0.78, 10);
    barrel.rotation.x = Math.PI / 2;
    const hatch = cylinder(0.08, 0.05, armorDark, -0.08, 0.24, -0.1, 10);
    const turret = namedGroup('turret', [
      prism([[-0.32, 0], [0.26, 0], [0.36, 0.11], [0.26, 0.21], [-0.26, 0.21], [-0.36, 0.12]], 0.42, armor, 0, 0.03),
      chamferBox(0.02, 0.09, 0.36, teamPanel, -0.215, 0.11, -0.02, 0.005),
      chamferBox(0.02, 0.09, 0.36, teamPanel, 0.215, 0.11, -0.02, 0.005),
      hatch,
      chamferBox(0.07, 0.07, 0.09, armorDark, 0.13, 0.26, -0.18, 0.01), // sensor
      chamferBox(0.04, 0.03, 0.02, glow, 0.13, 0.27, -0.125, 0.005),
      chamferBox(0.17, 0.14, 0.12, armorDark, 0, 0.11, 0.38), // mantel
      barrel,
      chamferBox(0.1, 0.07, 0.11, armorDark, 0, 0.11, 1.2, 0.01), // mynningsbroms
    ], 0, 0.49, -0.04);

    return [...mergeByMaterial(hull), turret];
  },

  /** UEF Snoop (Land Scout): snabb, fyrhjulig spaningsbil med kulspruta och sensorparabol ('turret'). */
  snoop() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;
    const parts = [
      prism([[-0.42, 0.14], [0.3, 0.14], [0.44, 0.24], [0.34, 0.34], [-0.36, 0.36]], 0.42, armor, 0, 0.025),
      chamferBox(0.3, 0.02, 0.4, teamPanel, 0, 0.375, -0.06, 0.005),
      rotated(chamferBox(0.26, 0.02, 0.06, glow, 0, 0.3, 0.4, 0.004), 0.6), // strålkastare
    ];
    for (const side of [-1, 1]) {
      for (const z of [-0.26, 0.26]) {
        parts.push(rotated(cylinder(0.13, 0.1, tread, side * 0.26, 0.13, z, 10), 0, 0, Math.PI / 2));
        parts.push(rotated(cylinder(0.06, 0.11, armorDark, side * 0.265, 0.13, z, 8), 0, 0, Math.PI / 2));
      }
      parts.push(prism([[-0.42, 0.22], [0.42, 0.22], [0.36, 0.28], [-0.36, 0.28]], 0.1, armorDark, side * 0.27, 0.01)); // stänkskärm
    }
    const dish = rotated(taper(0.12, 0.02, 0.04, armorDark, -0.05, 0.3, -0.1, 10), -0.5);
    const turret = namedGroup('turret', [
      chamferBox(0.2, 0.1, 0.22, armorDark, 0, 0.05, 0, 0.02),
      strut([0.05, 0.08, 0.05], [0.05, 0.08, 0.34], 0.035, armorDark, true), // kulspruta
      strut([-0.05, 0.1, -0.08], [-0.05, 0.28, -0.1], 0.02, armorDark, true),
      dish,
      chamferBox(0.03, 0.03, 0.02, glow, -0.05, 0.31, -0.07, 0.005),
    ], 0, 0.36, -0.02);
    return [...mergeByMaterial(parts), turret];
  },

  /**
   * UEF Mech Marine (Light Assault Bot): liten tvåbent robot med en
   * överkropp ('turret') som vrids mot målet och en kulspruta på varje arm.
   * Benen ('legL', 'legR') har leden i höften.
   */
  mechMarine() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const HIP_Y = 0.48;
    const leg = (name, x) => namedGroup(name, [
      chamferBox(0.1, 0.1, 0.12, armorDark, 0, 0, 0, 0.02),
      prism([[-0.06, -0.02], [0.08, -0.02], [0.09, -0.22], [-0.05, -0.24]], 0.12, armor, 0, 0.015),
      prism([[-0.05, -0.24], [0.08, -0.24], [0.05, -0.42], [-0.06, -0.42]], 0.11, armor, 0, 0.015),
      prism([[-0.08, -0.48], [0.14, -0.48], [0.15, -0.45], [0.06, -0.41], [-0.07, -0.41]], 0.13, armorDark, 0, 0.01),
    ], x, HIP_Y, 0);
    const upper = namedGroup('turret', [
      chamferBox(0.2, 0.08, 0.14, armorDark, 0, 0.02, 0, 0.02), // bäcken
      prism([[-0.12, 0.08], [0.1, 0.08], [0.15, 0.18], [0.12, 0.34], [-0.12, 0.34]], 0.3, armor, 0, 0.02), // bål
      chamferBox(0.16, 0.02, 0.14, teamPanel, 0, 0.35, 0.0, 0.005),
      prism([[-0.05, 0.34], [0.08, 0.34], [0.11, 0.39], [0.06, 0.45], [-0.05, 0.44]], 0.1, armor, 0, 0.01), // huvud
      chamferBox(0.06, 0.012, 0.01, glow, 0, 0.395, 0.11, 0.002),
      ...[-1, 1].flatMap((side) => [
        chamferBox(0.1, 0.1, 0.14, armor, side * 0.2, 0.3, 0, 0.02), // axel
        chamferBox(0.08, 0.16, 0.1, armorDark, side * 0.21, 0.18, 0.02, 0.015), // arm
        chamferBox(0.09, 0.08, 0.2, armor, side * 0.21, 0.1, 0.1, 0.015), // vapenarm
        chamferBox(0.02, 0.05, 0.16, teamPanel, side * 0.258, 0.1, 0.1, 0.004),
        strut([side * 0.21, 0.09, 0.2], [side * 0.21, 0.09, 0.32], 0.03, armorDark, true),
      ]),
    ], 0, HIP_Y, 0);
    return [leg('legR', -0.09), leg('legL', 0.09), upper];
  },

  /**
   * UEF Lobo (Mobile Light Artillery): sexhjulig lavett med lågt flak, en
   * förarhytt framtill, ett artilleritorn ('turret') baktill med ett grovt rör
   * snett uppåt och hydraulcylindrar, stödben baktill och ammunitionslådor.
   */
  lobo() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;
    const parts = [
      chamferBox(0.56, 0.1, 1.15, armorDark, 0, 0.24, 0, 0.02), // chassi
      prism([[0.22, 0.29], [0.5, 0.29], [0.58, 0.36], [0.48, 0.5], [0.22, 0.5]], 0.46, armor, 0, 0.025), // hytt
      rotated(chamferBox(0.36, 0.02, 0.08, glow, 0, 0.43, 0.535, 0.004), 0.95), // vindruta
      chamferBox(0.48, 0.05, 0.62, armor, 0, 0.31, -0.2, 0.01), // flak
      chamferBox(0.5, 0.02, 0.08, teamPanel, 0, 0.345, 0.15, 0.005),
    ];
    for (const side of [-1, 1]) {
      for (const z of [-0.42, -0.08, 0.36]) {
        parts.push(rotated(cylinder(0.15, 0.12, tread, side * 0.3, 0.15, z, 12), 0, 0, Math.PI / 2));
        parts.push(rotated(cylinder(0.07, 0.13, armorDark, side * 0.305, 0.15, z, 8), 0, 0, Math.PI / 2));
      }
      parts.push(
        prism([[-0.58, 0.26], [0.56, 0.26], [0.5, 0.32], [-0.52, 0.32]], 0.1, armor, side * 0.31, 0.01), // stänkskärm
        chamferBox(0.02, 0.04, 0.8, teamPanel, side * 0.365, 0.3, -0.02, 0.004),
        // Stödben som fälls ner baktill.
        strut([side * 0.22, 0.28, -0.52], [side * 0.36, 0.05, -0.66], 0.05, armorDark),
        chamferBox(0.12, 0.03, 0.12, armorDark, side * 0.37, 0.025, -0.68, 0.01),
        chamferBox(0.12, 0.1, 0.16, armorDark, side * 0.16, 0.39, 0.0, 0.015), // ammunitionslåda
      );
    }
    const turret = namedGroup('turret', [
      taper(0.2, 0.24, 0.08, armorDark, 0, 0.04, 0, 10), // vridkrans
      chamferBox(0.3, 0.14, 0.32, armor, 0, 0.14, 0, 0.025), // vagga
      chamferBox(0.04, 0.2, 0.22, armor, -0.13, 0.26, 0.04, 0.01), // sidosköldar
      chamferBox(0.04, 0.2, 0.22, armor, 0.13, 0.26, 0.04, 0.01),
      strut([0, 0.26, 0.0], [0, 0.78, 0.62], 0.11, armorDark, true), // rör
      strut([0, 0.3, 0.05], [0, 0.46, 0.24], 0.17, armor, true), // rekylhylsa
      strut([0, 0.74, 0.57], [0, 0.82, 0.67], 0.15, armorDark, true), // mynning
      strut([-0.08, 0.16, -0.08], [-0.08, 0.42, 0.22], 0.035, armor, true), // hydraulik
      strut([0.08, 0.16, -0.08], [0.08, 0.42, 0.22], 0.035, armor, true),
    ], 0, 0.33, -0.25);
    return [...mergeByMaterial(parts), turret];
  },

  /** UEF Archer (Mobile Anti-Air Gun): bandvagn med ett torn ('turret') med två rälskanoner mot himlen. */
  archer() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;
    const parts = [
      prism([[-0.48, 0.15], [0.36, 0.15], [0.5, 0.26], [0.42, 0.36], [-0.44, 0.38]], 0.46, armor, 0, 0.025),
    ];
    for (const side of [-1, 1]) {
      parts.push(
        prism([[-0.52, 0.09], [-0.45, 0.01], [0.45, 0.01], [0.54, 0.09], [0.48, 0.22], [-0.48, 0.22]], 0.18, tread, side * 0.32),
        prism([[-0.5, 0.2], [0.5, 0.2], [0.54, 0.26], [0.46, 0.29], [-0.48, 0.29]], 0.2, armor, side * 0.33, 0.015),
        chamferBox(0.05, 0.015, 0.7, teamPanel, side * 0.37, 0.3, 0, 0.004),
      );
    }
    const turret = namedGroup('turret', [
      taper(0.2, 0.24, 0.12, armorDark, 0, 0.06, 0, 10),
      chamferBox(0.34, 0.2, 0.3, armor, 0, 0.2, 0, 0.03),
      chamferBox(0.36, 0.02, 0.2, teamPanel, 0, 0.31, -0.02, 0.005),
      ...[-0.12, 0.12].flatMap((x) => [
        strut([x, 0.24, 0.05], [x, 0.66, 0.42], 0.07, armorDark), // rälskanon
        strut([x, 0.25, 0.06], [x, 0.4, 0.19], 0.1, armor),
        strut([x, 0.66, 0.42], [x, 0.69, 0.45], 0.05, glow, true),
      ]),
      chamferBox(0.08, 0.06, 0.05, armorDark, 0, 0.32, -0.16, 0.01), // radar
    ], 0, 0.38, -0.04);
    return [...mergeByMaterial(parts), turret];
  },

  /**
   * UEF T1 Engineer: låg, långsträckt bandvagn med en liten pansrad hytt, en
   * tvådelad kranarm med byggnozzel och ett motorblock baktill.
   */
  engineer() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;
    const parts = [
      prism([[-0.5, 0.12], [0.38, 0.12], [0.54, 0.22], [0.44, 0.32], [-0.46, 0.34]], 0.42, armor, 0, 0.025), // skrov
      prism([[0, 0.32], [0.3, 0.32], [0.36, 0.38], [0.22, 0.48], [0, 0.48]], 0.22, armorDark, -0.08, 0.02), // hytt
      rotated(chamferBox(0.16, 0.02, 0.07, glow, -0.08, 0.44, 0.3, 0.004), 0.62), // fönster
      chamferBox(0.3, 0.08, 0.2, armorDark, -0.06, 0.37, -0.32, 0.02), // motor
      ...[-0.38, -0.32, -0.26].map((z) => box(0.26, 0.012, 0.025, armor, -0.06, 0.415, z)),
      strut([-0.2, 0.34, -0.42], [-0.22, 0.75, -0.46], 0.012, armorDark, true), // antenn
      // Kranarm: vridbar fot, två led och en nozzel.
      taper(0.08, 0.1, 0.08, armorDark, 0.12, 0.38, -0.22, 10),
      strut([0.12, 0.42, -0.22], [0.12, 0.72, -0.02], 0.06, armor),
      chamferBox(0.08, 0.08, 0.08, armorDark, 0.12, 0.72, -0.02, 0.015),
      strut([0.12, 0.72, -0.02], [0.12, 0.6, 0.32], 0.05, armor),
      strut([0.12, 0.6, 0.32], [0.12, 0.55, 0.38], 0.07, armorDark, true), // nozzel
      strut([0.12, 0.55, 0.38], [0.12, 0.54, 0.39], 0.05, glow, true),
    ];
    for (const side of [-1, 1]) {
      const x = side * 0.3;
      parts.push(
        prism([[-0.52, 0.07], [-0.44, 0], [0.44, 0], [0.52, 0.08], [0.46, 0.17], [-0.46, 0.17]], 0.16, tread, x),
        prism([[-0.5, 0.15], [0.5, 0.15], [0.54, 0.2], [0.46, 0.23], [-0.48, 0.23]], 0.18, armor, x, 0.015), // stänkskärm
        chamferBox(0.04, 0.012, 0.8, teamPanel, x, 0.24, 0, 0.003),
      );
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF Land Factory: byggnadsblock på båda sidor och en hall baktill runt en
   * öppen byggplats, en ramp ut framåt, en traverskran med byggarm över platsen
   * och detaljer på taken (ventiler, skorstenar, antenn och lampor).
   */
  landFactory() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const parts = [
      chamferBox(4, 0.25, 4, armorDark, 0, 0.125, 0, 0.05), // grund
      // Byggplats med golvribbor och glödande körfält.
      chamferBox(2.2, 0.08, 2.8, armorDark, 0, 0.29, 0.3, 0.02),
      prism([[1.6, 0.25], [2.05, 0.25], [2.05, 0.27], [1.6, 0.33]], 2.2, armor, 0, 0.01), // ramp
      box(0.05, 0.03, 2.8, glow, -0.95, 0.34, 0.3),
      box(0.05, 0.03, 2.8, glow, 0.95, 0.34, 0.3),
    ];
    for (let z = -0.8; z <= 1.4; z += 0.37) parts.push(chamferBox(1.7, 0.03, 0.08, armor, 0, 0.345, z, 0.01));

    // Vänster block: lågt fram, högt bak.
    parts.push(
      prism([[-1.95, 0.25], [1.95, 0.25], [1.95, 0.65], [1.4, 1.05], [0.15, 1.05], [-0.35, 1.9], [-1.95, 1.9]], 0.9, armor, -1.55, 0.04),
      chamferBox(0.03, 0.18, 3.0, teamPanel, -2.01, 0.85, 0, 0.01),
      chamferBox(0.5, 0.14, 0.5, armorDark, -1.55, 1.97, -1.2, 0.02),
      cylinder(0.12, 0.55, armor, -1.75, 2.15, -0.6, 10),
      cylinder(0.12, 0.55, armor, -1.35, 2.15, -0.6, 10),
      cylinder(0.09, 0.03, armorDark, -1.75, 2.43, -0.6, 10),
      cylinder(0.09, 0.03, armorDark, -1.35, 2.43, -0.6, 10),
      chamferBox(0.08, 0.08, 0.08, glow, -1.55, 1.1, 1.85, 0.02),
    );
    // Höger block: lägre, med antenn och radarskål.
    const dish = taper(0.28, 0.05, 0.08, armorDark, 1.55, 2.0, -1.2, 12);
    dish.rotation.x = -0.5;
    parts.push(
      prism([[-1.95, 0.25], [1.95, 0.25], [1.95, 0.55], [1.55, 0.88], [-0.55, 0.88], [-0.9, 1.5], [-1.95, 1.5]], 0.9, armor, 1.55, 0.04),
      chamferBox(0.03, 0.15, 3.0, teamPanel, 2.01, 0.7, 0, 0.01),
      strut([1.55, 1.5, -1.2], [1.55, 1.85, -1.2], 0.08, armorDark, true),
      dish,
      strut([1.8, 1.5, -1.6], [1.8, 2.4, -1.6], 0.03, armorDark, true),
      chamferBox(0.06, 0.06, 0.06, glow, 1.8, 2.42, -1.6, 0.01),
      chamferBox(0.08, 0.08, 0.08, glow, 1.55, 0.92, 1.85, 0.02),
    );
    // Hallen baktill med port, lagfärgsrand och rör på baksidan.
    parts.push(
      prism([[-1.95, 0.25], [-0.95, 0.25], [-0.95, 1.55], [-1.25, 1.95], [-1.95, 1.95]], 2.2, armor, 0, 0.04),
      chamferBox(1.6, 1.0, 0.04, armorDark, 0, 0.8, -0.93, 0.01),
      chamferBox(1.9, 0.12, 0.03, teamPanel, 0, 1.45, -0.93, 0.01),
      chamferBox(0.6, 0.12, 0.4, armorDark, -0.5, 2.0, -1.6, 0.02),
      chamferBox(0.6, 0.12, 0.4, armorDark, 0.5, 2.0, -1.6, 0.02),
    );
    for (const y of [0.55, 0.85, 1.15]) {
      const pipe = cylinder(0.06, 2.0, armorDark, 0, y, -2.0, 8);
      pipe.rotation.z = Math.PI / 2;
      parts.push(pipe);
    }
    // Traverskran över byggplatsen.
    parts.push(
      chamferBox(0.22, 1.05, 0.22, armor, -1.55, 1.58, 0.65, 0.03),
      chamferBox(0.22, 1.27, 0.22, armor, 1.55, 1.47, 0.65, 0.03),
      chamferBox(3.3, 0.22, 0.3, armor, 0, 2.2, 0.65, 0.04),
      chamferBox(2.6, 0.08, 0.03, teamPanel, 0, 2.2, 0.82, 0.01),
      chamferBox(0.5, 0.26, 0.42, armorDark, 0, 2.0, 0.65, 0.04), // vagn
      strut([0, 1.88, 0.65], [0, 1.25, 0.65], 0.1, armorDark),
      chamferBox(0.16, 0.12, 0.16, glow, 0, 1.2, 0.65, 0.03),
    );
    // Byggarmar från sidoblocken.
    for (const side of [-1, 1]) {
      parts.push(
        strut([side * 1.1, side < 0 ? 1.05 : 0.88, -0.2], [side * 0.75, 1.35, 0.15], 0.09, armorDark),
        strut([side * 0.75, 1.35, 0.15], [side * 0.55, 1.05, 0.45], 0.07, armorDark),
        chamferBox(0.1, 0.1, 0.1, glow, side * 0.53, 1.02, 0.48, 0.02),
      );
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF Mass Extractor: åttkantig fot, fyra pumpkolvar med slangar, en borrkärna
   * med lagfärgsband och ett glödande massautlopp under ett galler.
   */
  massExtractor() {
    const { armor, armorDark, teamPanel, massGlow } = MATERIALS;
    const octagon = (r, h, material, y, flare = 1.06) => {
      const m = taper(r, r * flare, h, material, 0, y, 0, 8);
      m.rotation.y = Math.PI / 8;
      return m;
    };
    const parts = [
      octagon(0.92, 0.25, armorDark, 0.125),
      octagon(0.8, 0.12, armor, 0.31),
      octagon(0.42, 0.95, armor, 0.84, 1.08), // kärna
      octagon(0.45, 0.12, teamPanel, 0.72, 1),
      octagon(0.45, 0.06, armorDark, 1.0, 1),
      octagon(0.34, 0.1, armorDark, 1.36, 1.15),
      taper(0.24, 0.24, 0.08, massGlow, 0, 1.42, 0, 12),
    ];
    for (const a of [-0.12, 0, 0.12]) parts.push(box(0.5, 0.02, 0.03, armorDark, 0, 1.47, a)); // galler
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const x = Math.sin(a) * 0.62;
      const z = Math.cos(a) * 0.62;
      parts.push(
        cylinder(0.13, 0.5, armorDark, x, 0.6, z, 8), // cylinder
        cylinder(0.08, 0.45, armor, x, 1.05, z, 8), // kolvstång
        cylinder(0.15, 0.08, armorDark, x, 1.3, z, 8),
        strut([x, 1.25, z], [x * 0.55, 1.3, z * 0.55], 0.08, armor),
        strut([x * 1.15, 0.38, z * 1.15], [x * 1.05, 0.75, z * 1.05], 0.05, armorDark, true), // slang
      );
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF T1 Power Generator: pansrad kropp med glödande fönster och galler, två
   * kyltorn med kylflänsar och rör som leder ner i kroppen.
   */
  powerGenerator() {
    const { armor, armorDark, teamPanel, energyGlow } = MATERIALS;
    const parts = [
      chamferBox(1.8, 0.25, 1.8, armorDark, 0, 0.125, 0, 0.05),
      prism([[-0.7, 0.25], [0.7, 0.25], [0.75, 0.75], [0.48, 1.02], [-0.7, 1.02]], 1.3, armor, 0, 0.04),
      chamferBox(1.1, 0.1, 0.03, teamPanel, 0, 0.42, 0.76, 0.01),
      chamferBox(0.7, 0.26, 0.03, armorDark, 0, 0.62, 0.77, 0.01), // galler
    ];
    for (let i = 0; i < 4; i++) parts.push(box(0.64, 0.025, 0.02, energyGlow, 0, 0.53 + i * 0.06, 0.785));
    for (const side of [-1, 1]) {
      const x = side * 0.35;
      parts.push(
        chamferBox(0.03, 0.25, 0.6, energyGlow, side * 0.67, 0.62, -0.15, 0.01), // fönster
        taper(0.19, 0.29, 1.15, armor, x, 1.6, -0.3, 12), // kyltorn
        taper(0.27, 0.29, 0.1, armorDark, x, 1.12, -0.3, 12),
        taper(0.23, 0.24, 0.06, teamPanel, x, 1.5, -0.3, 12),
        taper(0.2, 0.2, 0.05, armorDark, x, 2.17, -0.3, 12),
        cylinder(0.15, 0.04, energyGlow, x, 2.2, -0.3, 12),
        strut([x, 1.3, 0.0], [x, 1.02, 0.25], 0.07, armorDark, true), // rör
      );
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        parts.push(box(0.025, 0.5, 0.1, armorDark, x + Math.sin(a) * 0.27, 1.45, -0.3 + Math.cos(a) * 0.27));
        parts[parts.length - 1].rotation.y = a;
      }
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF Mass Storage: låg pansrad fot med fyra stöd och en åttkantig kupol med
   * glödande massfönster runt om och ett lagfärgat band.
   */
  massStorage() {
    const { armor, armorDark, teamPanel, massGlow } = MATERIALS;
    const octagon = (rTop, rBottom, h, material, y) => {
      const m = taper(rTop, rBottom, h, material, 0, y, 0, 8);
      m.rotation.y = Math.PI / 8;
      return m;
    };
    const parts = [
      chamferBox(1.8, 0.2, 1.8, armorDark, 0, 0.1, 0, 0.05),
      octagon(0.78, 0.86, 0.35, armor, 0.37),
      octagon(0.8, 0.8, 0.08, teamPanel, 0.58),
      octagon(0.55, 0.74, 0.4, armor, 0.82),
      octagon(0.3, 0.55, 0.18, armorDark, 1.1),
      cylinder(0.22, 0.06, massGlow, 0, 1.21, 0, 12),
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const glass = box(0.2, 0.18, 0.03, massGlow, Math.sin(a) * 0.66, 0.84, Math.cos(a) * 0.66);
      glass.rotation.y = a;
      parts.push(glass);
    }
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      parts.push(chamferBox(0.22, 0.3, 0.22, armorDark, x, 0.3, z, 0.03));
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF Energy Storage: fyrkantig fot med en hög cylindrisk ackumulator med
   * glödande band, kylflänsar och en lagfärgad topp.
   */
  energyStorage() {
    const { armor, armorDark, teamPanel, energyGlow } = MATERIALS;
    const parts = [
      chamferBox(1.8, 0.2, 1.8, armorDark, 0, 0.1, 0, 0.05),
      chamferBox(1.4, 0.25, 1.4, armor, 0, 0.32, 0, 0.05),
      cylinder(0.55, 1.3, armor, 0, 1.1, 0, 16),
      cylinder(0.6, 0.08, teamPanel, 0, 1.78, 0, 16),
      taper(0.25, 0.5, 0.2, armorDark, 0, 1.92, 0, 16),
      cylinder(0.15, 0.08, energyGlow, 0, 2.05, 0, 12),
    ];
    for (const y of [0.75, 1.1, 1.45]) parts.push(cylinder(0.57, 0.06, energyGlow, 0, y, 0, 16));
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const fin = box(0.06, 1.0, 0.3, armorDark, Math.sin(a) * 0.62, 1.05, Math.cos(a) * 0.62);
      fin.rotation.y = a;
      parts.push(fin);
    }
    return mergeByMaterial(parts);
  },

  /** Mur: betongblock med mörk kant upptill. */
  wall() {
    return mergeByMaterial([
      chamferBox(0.98, 1.0, 0.98, MATERIALS.concrete, 0, 0.5, 0, 0.05),
      chamferBox(0.86, 0.2, 0.86, MATERIALS.armorDark, 0, 1.08, 0, 0.04),
    ]);
  },

  /** DM1 Plasma Cannon: åttkantig sockel och ett kilformat torn ('turret') som vrids mot målet. */
  pointDefense() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const base = taper(0.42, 0.48, 0.4, armorDark, 0, 0.2, 0, 8);
    base.rotation.y = Math.PI / 8;
    const turret = namedGroup('turret', [
      prism([[-0.3, 0], [0.18, 0], [0.3, 0.14], [0.2, 0.3], [-0.26, 0.3]], 0.42, armor, 0, 0.03),
      chamferBox(0.02, 0.08, 0.3, teamPanel, -0.215, 0.16, -0.04, 0.005),
      chamferBox(0.02, 0.08, 0.3, teamPanel, 0.215, 0.16, -0.04, 0.005),
      strut([0, 0.2, 0.2], [0, 0.2, 0.62], 0.09, armorDark, true),
      strut([0, 0.2, 0.62], [0, 0.2, 0.66], 0.07, glow, true),
    ], 0, 0.5, 0);
    return [...mergeByMaterial([base, taper(0.36, 0.4, 0.1, armor, 0, 0.45, 0, 8)]), turret];
  },
  // ---- UEF T2 och T3: byggnader ----

  /**
   * UEF Land Factory HQ: T1-fabriken med ett kommandotorn på vänster block,
   * en andra traverskran, tjockare pansar på blocken och dubbla lagfärgsränder.
   */
  landFactoryT2() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const extra = [
      // Kommandotorn med fönsterband och antennmast.
      chamferBox(0.8, 1.1, 0.8, armor, -1.55, 2.45, 0.2, 0.05),
      chamferBox(0.84, 0.08, 0.84, teamPanel, -1.55, 2.2, 0.2, 0.01),
      chamferBox(0.82, 0.12, 0.6, glow, -1.55, 2.75, 0.32, 0.01),
      chamferBox(0.6, 0.12, 0.6, armorDark, -1.55, 3.06, 0.2, 0.03),
      strut([-1.55, 3.1, 0.2], [-1.55, 3.9, 0.2], 0.04, armorDark, true),
      chamferBox(0.07, 0.07, 0.07, glow, -1.55, 3.92, 0.2, 0.01),
      // Andra traverskranen framför den första.
      chamferBox(0.2, 0.9, 0.2, armor, -1.55, 1.5, 1.4, 0.03),
      chamferBox(0.2, 1.12, 0.2, armor, 1.55, 1.39, 1.4, 0.03),
      chamferBox(3.3, 0.18, 0.26, armor, 0, 2.0, 1.4, 0.04),
      chamferBox(2.6, 0.07, 0.03, teamPanel, 0, 2.0, 1.55, 0.01),
      chamferBox(0.4, 0.22, 0.36, armorDark, 0.5, 1.82, 1.4, 0.03),
      strut([0.5, 1.7, 1.4], [0.5, 1.2, 1.4], 0.08, armorDark),
      chamferBox(0.13, 0.1, 0.13, glow, 0.5, 1.15, 1.4, 0.03),
    ];
    // Pansarplåtar och en extra lagfärgsrand på blockens utsidor.
    for (const side of [-1, 1]) {
      extra.push(
        chamferBox(0.06, 0.4, 2.4, armorDark, side * 2.03, 0.5, 0.4, 0.02),
        chamferBox(0.03, 0.1, 3.0, teamPanel, side * 2.07, 0.5, 0.4, 0.01),
      );
    }
    return [...MODELS.landFactory(), ...mergeByMaterial(extra)];
  },

  /** UEF T2 Mass Extractor: T1-utvinnaren med en högre pumpkrona, ett andra lagfärgsband och fyra stöttor. */
  massExtractorT2() {
    const { armor, armorDark, teamPanel, massGlow } = MATERIALS;
    const octagon = (r, h, material, y) => rotated(taper(r, r * 1.04, h, material, 0, y, 0, 8), 0, Math.PI / 8);
    const extra = [
      octagon(0.36, 0.5, armor, 1.72),
      octagon(0.39, 0.08, teamPanel, 1.62),
      octagon(0.28, 0.1, armorDark, 2.02),
      taper(0.18, 0.18, 0.06, massGlow, 0, 2.08, 0, 12),
    ];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      extra.push(strut([Math.sin(a) * 0.75, 0.38, Math.cos(a) * 0.75], [Math.sin(a) * 0.36, 1.85, Math.cos(a) * 0.36], 0.07, armorDark));
    }
    return [...MODELS.massExtractor(), ...mergeByMaterial(extra)];
  },

  /** UEF T3 Mass Extractor: T2-utvinnaren med ett glödande massband runt foten och tre lagfärgsband. */
  massExtractorT3() {
    const { armor, armorDark, teamPanel, massGlow } = MATERIALS;
    const octagon = (r, h, material, y) => rotated(taper(r, r, h, material, 0, y, 0, 8), 0, Math.PI / 8);
    const extra = [
      octagon(0.95, 0.06, massGlow, 0.27),
      octagon(0.46, 0.06, teamPanel, 0.9),
      octagon(0.3, 0.3, armor, 2.25),
      octagon(0.32, 0.05, teamPanel, 2.2),
      taper(0.14, 0.14, 0.05, massGlow, 0, 2.42, 0, 12),
    ];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      extra.push(chamferBox(0.16, 0.5, 0.16, armorDark, Math.sin(a) * 0.86, 0.5, Math.cos(a) * 0.86, 0.03));
    }
    return [...MODELS.massExtractorT2(), ...mergeByMaterial(extra)];
  },

  /**
   * UEF EG-200 Fusion Reactor (T2 Power Generator): bred fot med en kupolformad
   * reaktor med glödande ringar, fyra kyltorn i hörnen och rör in till reaktorn.
   */
  powerGeneratorT2() {
    const { armor, armorDark, teamPanel, energyGlow } = MATERIALS;
    const parts = [
      chamferBox(2.9, 0.25, 2.9, armorDark, 0, 0.125, 0, 0.06),
      rotated(taper(1.05, 1.2, 0.55, armor, 0, 0.52, 0, 8), 0, Math.PI / 8),
      taper(0.85, 1.0, 0.55, armor, 0, 1.07, 0, 24),
      taper(0.4, 0.85, 0.45, armorDark, 0, 1.57, 0, 24), // kupol
      cylinder(0.3, 0.06, energyGlow, 0, 1.82, 0, 16),
      cylinder(1.02, 0.07, teamPanel, 0, 0.82, 0, 24),
    ];
    for (const y of [0.98, 1.16]) parts.push(cylinder(0.94, 0.05, energyGlow, 0, y, 0, 24));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * 1.05;
      const z = sz * 1.05;
      parts.push(
        taper(0.22, 0.3, 1.2, armor, x, 0.85, z, 12),
        taper(0.24, 0.24, 0.06, teamPanel, x, 0.9, z, 12),
        cylinder(0.17, 0.04, energyGlow, x, 1.46, z, 12),
        strut([x * 0.85, 0.5, z * 0.85], [x * 0.45, 0.65, z * 0.45], 0.09, armorDark, true),
      );
    }
    return mergeByMaterial(parts);
  },

  /** UEF Mass Fabricator: pansrad kub med en glödande masskärna i en bur och kylplåtar. */
  massFabricator() {
    const { armor, armorDark, teamPanel, massGlow } = MATERIALS;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), massGlow);
    core.position.y = 1.15;
    const parts = [
      chamferBox(1.8, 0.2, 1.8, armorDark, 0, 0.1, 0, 0.05),
      chamferBox(1.3, 0.55, 1.3, armor, 0, 0.47, 0, 0.05),
      chamferBox(1.34, 0.08, 1.34, teamPanel, 0, 0.62, 0, 0.01),
      chamferBox(0.9, 0.1, 0.9, armorDark, 0, 0.8, 0, 0.03),
      core,
    ];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      parts.push(
        strut([sx * 0.4, 0.82, sz * 0.4], [sx * 0.2, 1.55, sz * 0.2], 0.07, armorDark),
        chamferBox(0.06, 0.4, 0.4, armorDark, sx * 0.7, 0.45, sz * 0.3, 0.01),
      );
    }
    parts.push(chamferBox(0.5, 0.08, 0.5, armorDark, 0, 1.58, 0, 0.02));
    return mergeByMaterial(parts);
  },

  /** UEF Triad (T2 Point Defense): kraftig åttkantig sockel och ett torn ('turret') med tre gausskanoner. */
  pointDefenseT2() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const base = [
      chamferBox(1.8, 0.2, 1.8, armorDark, 0, 0.1, 0, 0.05),
      rotated(taper(0.7, 0.8, 0.6, armorDark, 0, 0.5, 0, 8), 0, Math.PI / 8),
      rotated(taper(0.66, 0.7, 0.08, teamPanel, 0, 0.7, 0, 8), 0, Math.PI / 8),
      taper(0.55, 0.62, 0.12, armor, 0, 0.84, 0, 16),
    ];
    const turret = namedGroup('turret', [
      prism([[-0.5, 0], [0.32, 0], [0.48, 0.2], [0.34, 0.42], [-0.42, 0.42], [-0.55, 0.22]], 0.7, armor, 0, 0.04),
      chamferBox(0.03, 0.12, 0.5, teamPanel, -0.355, 0.22, -0.06, 0.01),
      chamferBox(0.03, 0.12, 0.5, teamPanel, 0.355, 0.22, -0.06, 0.01),
      chamferBox(0.2, 0.1, 0.2, armorDark, 0.18, 0.47, -0.25, 0.02), // sensor
      ...[[-0.15, 0.17], [0.15, 0.17], [0, 0.3]].flatMap(([x, y]) => [
        strut([x, y, 0.3], [x, y, 1.0], 0.1, armorDark, true),
        strut([x, y, 0.62], [x, y, 0.72], 0.14, armor, true),
        strut([x, y, 1.0], [x, y, 1.04], 0.08, glow, true),
      ]),
    ], 0, 0.9, 0);
    return [...mergeByMaterial(base), turret];
  },

  /**
   * UEF Klink Hammer (T2 Artillery Installation): bred plattform med stödben och
   * ett tungt torn ('turret') med ett långt rör snett uppåt och rekylcylindrar.
   */
  artilleryT2() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const base = [
      chamferBox(1.9, 0.25, 1.9, armorDark, 0, 0.125, 0, 0.05),
      rotated(taper(0.75, 0.85, 0.4, armor, 0, 0.45, 0, 8), 0, Math.PI / 8),
      rotated(taper(0.78, 0.78, 0.06, teamPanel, 0, 0.62, 0, 8), 0, Math.PI / 8),
    ];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      base.push(strut([sx * 0.55, 0.5, sz * 0.55], [sx * 0.85, 0.05, sz * 0.85], 0.09, armorDark));
    }
    const turret = namedGroup('turret', [
      chamferBox(0.8, 0.45, 0.9, armor, 0, 0.25, -0.1, 0.04),
      chamferBox(0.84, 0.08, 0.6, teamPanel, 0, 0.42, -0.2, 0.01),
      chamferBox(0.06, 0.4, 0.5, armorDark, -0.44, 0.35, 0.05, 0.01),
      chamferBox(0.06, 0.4, 0.5, armorDark, 0.44, 0.35, 0.05, 0.01),
      strut([0, 0.4, 0.1], [0, 1.3, 1.5], 0.16, armorDark, true), // rör
      strut([0, 0.45, 0.15], [0, 0.7, 0.55], 0.26, armor, true), // rekylhylsa
      strut([0, 1.26, 1.44], [0, 1.36, 1.6], 0.22, armorDark, true), // mynningsbroms
      strut([-0.2, 0.25, -0.2], [-0.14, 0.62, 0.42], 0.06, armor, true),
      strut([0.2, 0.25, -0.2], [0.14, 0.62, 0.42], 0.06, armor, true),
      chamferBox(0.08, 0.06, 0.04, glow, 0.25, 0.5, 0.36, 0.01),
    ], 0, 0.65, 0);
    return [...mergeByMaterial(base), turret];
  },

  /**
   * UEF SD-Pulse (T2 Shield Generator): fot med fyra kraftblock, en hög pylon
   * med glödande ringar och en emitter i toppen som projicerar skölden.
   */
  shieldGenerator() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const emitter = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), glow);
    emitter.position.y = 2.65;
    const parts = [
      chamferBox(2.8, 0.25, 2.8, armorDark, 0, 0.125, 0, 0.06),
      rotated(taper(0.7, 0.95, 0.5, armor, 0, 0.5, 0, 8), 0, Math.PI / 8),
      taper(0.32, 0.45, 1.6, armor, 0, 1.55, 0, 12), // pylon
      taper(0.48, 0.48, 0.08, teamPanel, 0, 0.82, 0, 12),
      taper(0.5, 0.2, 0.25, armorDark, 0, 2.45, 0, 12),
      emitter,
    ];
    for (const y of [1.15, 1.55, 1.95]) {
      const ring = rotated(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 6, 24), glow), Math.PI / 2);
      ring.position.y = y;
      parts.push(ring);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      parts.push(
        chamferBox(0.6, 0.55, 0.6, armor, sx * 0.95, 0.52, sz * 0.95, 0.04),
        chamferBox(0.62, 0.06, 0.62, teamPanel, sx * 0.95, 0.65, sz * 0.95, 0.01),
        chamferBox(0.2, 0.06, 0.2, glow, sx * 0.95, 0.82, sz * 0.95, 0.01),
        strut([sx * 0.75, 0.75, sz * 0.75], [sx * 0.3, 1.2, sz * 0.3], 0.06, armorDark, true),
      );
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF SA1-1000 (T1 Radar System): liten fot med en fackverksmast och en
   * radarskärm överst, och en glödande sensor.
   */
  radar() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const dish = rotated(taper(0.55, 0.12, 0.12, armor, 0, 1.75, 0.05, 16), -0.35);
    const parts = [
      chamferBox(1.6, 0.2, 1.6, armorDark, 0, 0.1, 0, 0.05),
      chamferBox(0.9, 0.35, 0.9, armor, 0, 0.37, 0, 0.04),
      chamferBox(0.94, 0.06, 0.94, teamPanel, 0, 0.5, 0, 0.01),
      dish,
      strut([0, 1.75, 0.05], [0, 1.9, 0.5], 0.04, armorDark, true),
      chamferBox(0.08, 0.08, 0.08, glow, 0, 1.92, 0.52, 0.01),
      cylinder(0.08, 0.1, armorDark, 0, 1.62, 0, 10),
    ];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      parts.push(strut([sx * 0.35, 0.55, sz * 0.35], [sx * 0.06, 1.6, sz * 0.06], 0.05, armorDark));
    }
    for (const y of [0.9, 1.25]) parts.push(chamferBox(0.5 - (y - 0.9) * 0.6, 0.03, 0.5 - (y - 0.9) * 0.6, armorDark, 0, y, 0, 0.005));
    return mergeByMaterial(parts);
  },

  /**
   * UEF SA2-2000 (T2 Radar System): högre mast på en kraftigare fot, en stor
   * radarskärm och en mindre under den, och lampor i toppen.
   */
  radarT2() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const parts = [
      chamferBox(1.8, 0.22, 1.8, armorDark, 0, 0.11, 0, 0.05),
      rotated(taper(0.55, 0.7, 0.45, armor, 0, 0.45, 0, 8), 0, Math.PI / 8),
      rotated(taper(0.58, 0.58, 0.07, teamPanel, 0, 0.6, 0, 8), 0, Math.PI / 8),
      taper(0.1, 0.18, 2.0, armorDark, 0, 1.65, 0, 8), // mast
      rotated(taper(0.8, 0.16, 0.14, armor, 0, 2.6, 0.08, 18), -0.3),
      rotated(taper(0.45, 0.1, 0.1, armor, 0, 1.75, -0.05, 14), 0.4),
      strut([0, 2.6, 0.08], [0, 2.8, 0.7], 0.05, armorDark, true),
      chamferBox(0.1, 0.1, 0.1, glow, 0, 2.82, 0.72, 0.01),
      chamferBox(0.08, 0.08, 0.08, glow, 0, 2.75, 0, 0.01),
    ];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      parts.push(strut([Math.sin(a) * 0.6, 0.62, Math.cos(a) * 0.6], [Math.sin(a) * 0.12, 2.0, Math.cos(a) * 0.12], 0.05, armorDark));
    }
    return mergeByMaterial(parts);
  },

  // ---- UEF T2: enheter ----

  /** UEF T2 Engineer: T1-ingenjören i större skala med en andra kranarm och tjockare pansar. */
  engineerT2() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const extra = mergeByMaterial([
      taper(0.07, 0.09, 0.07, armorDark, -0.12, 0.38, -0.12, 10),
      strut([-0.12, 0.42, -0.12], [-0.12, 0.66, 0.06], 0.05, armor),
      strut([-0.12, 0.66, 0.06], [-0.12, 0.56, 0.3], 0.045, armor),
      strut([-0.12, 0.56, 0.3], [-0.12, 0.52, 0.35], 0.06, armorDark, true),
      strut([-0.12, 0.52, 0.35], [-0.12, 0.51, 0.36], 0.045, glow, true),
      chamferBox(0.5, 0.03, 0.14, teamPanel, 0, 0.345, 0.2, 0.005),
      chamferBox(0.46, 0.06, 0.08, armorDark, 0, 0.3, 0.46, 0.01), // plogsköld
    ]);
    return scaleParts([...MODELS.engineer(), ...extra], 1.18);
  },

  /**
   * UEF Pillar (Heavy Tank): bredare och högre än Striker, med tjocka sidokjolar
   * och ett kantigt torn ('turret') med två parallella gausskanoner.
   */
  pillar() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;
    const hull = [];
    for (const side of [-1, 1]) {
      const x = side * 0.45;
      hull.push(
        prism([[-0.88, 0.13], [-0.78, 0.02], [0.78, 0.02], [0.9, 0.15], [0.8, 0.32], [-0.8, 0.32]], 0.28, tread, x),
        prism([[-0.86, 0.22], [0.86, 0.22], [0.92, 0.36], [0.82, 0.44], [-0.84, 0.44]], 0.12, armor, side * 0.6, 0.015), // sidokjol
        chamferBox(0.03, 0.06, 1.3, teamPanel, side * 0.665, 0.33, 0, 0.005),
      );
    }
    hull.push(
      prism([[-0.82, 0.22], [0.6, 0.22], [0.9, 0.38], [0.72, 0.55], [-0.74, 0.55], [-0.86, 0.44]], 0.68, armor, 0, 0.03),
      rotated(chamferBox(0.44, 0.02, 0.2, teamPanel, 0, 0.5, 0.81, 0.005), 0.9),
      chamferBox(0.5, 0.05, 0.36, armorDark, 0, 0.57, -0.52, 0.01),
    );
    for (const x of [-0.24, 0.24]) hull.push(chamferBox(0.08, 0.05, 0.03, glow, x, 0.36, 0.88, 0.01));
    const barrels = [-0.09, 0.09].flatMap((x) => [
      rotated(cylinder(0.045, 0.85, armor, x, 0.13, 0.78, 10), Math.PI / 2),
      chamferBox(0.08, 0.07, 0.1, armorDark, x, 0.13, 1.2, 0.01),
    ]);
    const turret = namedGroup('turret', [
      prism([[-0.38, 0], [0.3, 0], [0.42, 0.13], [0.3, 0.25], [-0.3, 0.25], [-0.42, 0.14]], 0.52, armor, 0, 0.03),
      chamferBox(0.02, 0.1, 0.42, teamPanel, -0.265, 0.13, -0.02, 0.005),
      chamferBox(0.02, 0.1, 0.42, teamPanel, 0.265, 0.13, -0.02, 0.005),
      chamferBox(0.32, 0.16, 0.14, armorDark, 0, 0.13, 0.42), // mantel
      chamferBox(0.09, 0.09, 0.1, armorDark, -0.14, 0.3, -0.2, 0.01),
      chamferBox(0.05, 0.03, 0.02, glow, -0.14, 0.31, -0.145, 0.005),
      ...barrels,
    ], 0, 0.55, -0.06);
    return [...mergeByMaterial(hull), turret];
  },

  /**
   * UEF Mongoose (Gatling Bot): kraftig tvåbent robot med en överkropp ('turret')
   * som bär en gatlingkanon på höger arm och en granatkastare på vänster.
   */
  mongoose() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const HIP_Y = 0.6;
    const leg = (name, x) => namedGroup(name, [
      chamferBox(0.14, 0.14, 0.16, armorDark, 0, 0, 0, 0.02),
      prism([[-0.08, -0.02], [0.1, -0.02], [0.12, -0.28], [-0.06, -0.3]], 0.16, armor, 0, 0.02),
      prism([[-0.06, -0.3], [0.1, -0.3], [0.06, -0.52], [-0.08, -0.52]], 0.15, armor, 0, 0.02),
      prism([[-0.11, -0.6], [0.18, -0.6], [0.19, -0.56], [0.08, -0.51], [-0.09, -0.51]], 0.18, armorDark, 0, 0.01),
    ], x, HIP_Y, 0);
    const gatling = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const dx = Math.cos(a) * 0.035;
      const dy = Math.sin(a) * 0.035;
      gatling.push(strut([0.28 + dx, 0.12 + dy, 0.2], [0.28 + dx, 0.12 + dy, 0.55], 0.022, armorDark, true));
    }
    const upper = namedGroup('turret', [
      chamferBox(0.28, 0.1, 0.18, armorDark, 0, 0.03, 0, 0.02),
      prism([[-0.16, 0.1], [0.13, 0.1], [0.19, 0.24], [0.15, 0.44], [-0.16, 0.44]], 0.4, armor, 0, 0.025),
      chamferBox(0.22, 0.02, 0.2, teamPanel, 0, 0.45, 0, 0.005),
      prism([[-0.06, 0.44], [0.1, 0.44], [0.13, 0.5], [0.08, 0.56], [-0.06, 0.55]], 0.14, armor, 0, 0.01),
      chamferBox(0.08, 0.015, 0.01, glow, 0, 0.5, 0.135, 0.002),
      // Höger: gatlingkanon med trumma.
      chamferBox(0.14, 0.14, 0.18, armor, 0.27, 0.36, 0, 0.02),
      chamferBox(0.15, 0.15, 0.24, armorDark, 0.28, 0.12, 0.08, 0.02),
      rotated(cylinder(0.06, 0.05, armor, 0.28, 0.12, 0.2, 10), Math.PI / 2),
      ...gatling,
      // Vänster: granatkastare.
      chamferBox(0.14, 0.14, 0.18, armor, -0.27, 0.36, 0, 0.02),
      chamferBox(0.13, 0.13, 0.26, armor, -0.28, 0.14, 0.06, 0.02),
      chamferBox(0.02, 0.07, 0.22, teamPanel, -0.35, 0.14, 0.06, 0.004),
      strut([-0.28, 0.14, 0.18], [-0.28, 0.16, 0.36], 0.07, armorDark, true),
    ], 0, HIP_Y, 0);
    return [leg('legR', -0.12), leg('legL', 0.12), upper];
  },

  /**
   * UEF Riptide (Amphibious Tank): svävande skrov med pontoner på sidorna,
   * glödande lyftmunstycken under och ett lågt torn ('turret') med kravallkanon.
   */
  riptide() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const hull = [
      prism([[-0.75, 0.22], [0.55, 0.22], [0.82, 0.32], [0.68, 0.46], [-0.7, 0.46], [-0.8, 0.36]], 0.62, armor, 0, 0.03),
      chamferBox(0.42, 0.04, 0.36, armorDark, 0, 0.48, -0.48, 0.01),
      rotated(chamferBox(0.36, 0.02, 0.16, teamPanel, 0, 0.42, 0.72, 0.005), 0.8),
    ];
    for (const side of [-1, 1]) {
      hull.push(
        prism([[-0.82, 0.14], [0.78, 0.14], [0.9, 0.24], [0.8, 0.36], [-0.78, 0.36], [-0.86, 0.26]], 0.22, armor, side * 0.43, 0.02),
        chamferBox(0.03, 0.04, 1.3, teamPanel, side * 0.545, 0.3, 0, 0.005),
      );
      for (const z of [-0.5, 0.5]) hull.push(taper(0.1, 0.14, 0.06, glow, side * 0.43, 0.11, z, 10));
    }
    const turret = namedGroup('turret', [
      prism([[-0.3, 0], [0.22, 0], [0.32, 0.1], [0.22, 0.19], [-0.24, 0.19], [-0.32, 0.1]], 0.44, armor, 0, 0.03),
      chamferBox(0.46, 0.03, 0.2, teamPanel, 0, 0.19, -0.08, 0.005),
      chamferBox(0.16, 0.12, 0.1, armorDark, 0, 0.1, 0.32),
      rotated(cylinder(0.06, 0.5, armorDark, 0, 0.1, 0.58, 10), Math.PI / 2),
      rotated(cylinder(0.075, 0.08, armor, 0, 0.1, 0.8, 10), Math.PI / 2),
    ], 0, 0.46, -0.05);
    return [...mergeByMaterial(hull), turret];
  },

  /**
   * UEF Flapjack (Mobile Missile Launcher): sexhjulig lastbil med hytt och en
   * uppfälld missillåda med sex rör baktill.
   */
  flapjack() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;
    const parts = [
      chamferBox(0.56, 0.1, 1.25, armorDark, 0, 0.24, 0, 0.02),
      prism([[0.3, 0.29], [0.58, 0.29], [0.66, 0.38], [0.56, 0.54], [0.3, 0.54]], 0.48, armor, 0, 0.025),
      rotated(chamferBox(0.38, 0.02, 0.09, glow, 0, 0.46, 0.615, 0.004), 0.95),
      chamferBox(0.5, 0.06, 0.7, armor, 0, 0.32, -0.18, 0.01),
      chamferBox(0.52, 0.02, 0.08, teamPanel, 0, 0.36, 0.2, 0.005),
      // Missillådan, uppfälld snett mot himlen.
      rotated(chamferBox(0.46, 0.3, 0.7, armor, 0, 0.62, -0.2, 0.03), -0.5),
      rotated(chamferBox(0.48, 0.04, 0.5, teamPanel, 0, 0.79, -0.27, 0.01), -0.5),
      strut([0, 0.34, -0.45], [0, 0.55, -0.32], 0.08, armorDark, true),
    ];
    for (const [x, y] of [[-0.14, 0.62], [0, 0.62], [0.14, 0.62], [-0.14, 0.52], [0, 0.52], [0.14, 0.52]]) {
      parts.push(rotated(cylinder(0.05, 0.03, armorDark, x, y + 0.08, 0.13, 8), Math.PI / 2 - 0.5));
    }
    for (const side of [-1, 1]) {
      for (const z of [-0.45, -0.1, 0.4]) {
        parts.push(rotated(cylinder(0.15, 0.12, tread, side * 0.3, 0.15, z, 12), 0, 0, Math.PI / 2));
        parts.push(rotated(cylinder(0.07, 0.13, armorDark, side * 0.305, 0.15, z, 8), 0, 0, Math.PI / 2));
      }
      parts.push(prism([[-0.62, 0.26], [0.6, 0.26], [0.54, 0.32], [-0.56, 0.32]], 0.1, armor, side * 0.31, 0.01));
    }
    return mergeByMaterial(parts);
  },

  /** UEF Sky Boxer (Mobile AA Flak Artillery): bandvagn med ett flaktorn ('turret') med två grova rör uppåt. */
  skyBoxer() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;
    const parts = [
      prism([[-0.55, 0.15], [0.42, 0.15], [0.56, 0.27], [0.46, 0.4], [-0.5, 0.42]], 0.52, armor, 0, 0.025),
      chamferBox(0.4, 0.04, 0.3, armorDark, 0, 0.43, -0.36, 0.01),
    ];
    for (const side of [-1, 1]) {
      parts.push(
        prism([[-0.6, 0.09], [-0.52, 0.01], [0.52, 0.01], [0.62, 0.09], [0.55, 0.24], [-0.55, 0.24]], 0.2, tread, side * 0.36),
        prism([[-0.58, 0.22], [0.58, 0.22], [0.62, 0.28], [0.54, 0.31], [-0.56, 0.31]], 0.22, armor, side * 0.37, 0.015),
        chamferBox(0.05, 0.015, 0.8, teamPanel, side * 0.42, 0.32, 0, 0.004),
      );
    }
    const turret = namedGroup('turret', [
      taper(0.24, 0.28, 0.12, armorDark, 0, 0.06, 0, 10),
      chamferBox(0.44, 0.28, 0.4, armor, 0, 0.26, 0, 0.04),
      chamferBox(0.46, 0.03, 0.26, teamPanel, 0, 0.41, -0.04, 0.005),
      ...[-0.14, 0.14].flatMap((x) => [
        strut([x, 0.3, 0.08], [x, 0.8, 0.45], 0.1, armorDark, true),
        strut([x, 0.32, 0.1], [x, 0.48, 0.22], 0.14, armor, true),
        strut([x, 0.78, 0.43], [x, 0.84, 0.48], 0.13, armorDark, true),
      ]),
      chamferBox(0.06, 0.04, 0.03, glow, 0, 0.36, 0.2, 0.01),
    ], 0, 0.42, -0.05);
    return [...mergeByMaterial(parts), turret];
  },

  /** UEF Parashield (Mobile Shield Generator): liten svävare med en sköldemitter på en mast. */
  parashield() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const emitter = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), glow);
    emitter.position.set(0, 0.95, -0.05);
    const ring = rotated(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 20), armorDark), Math.PI / 2);
    ring.position.set(0, 0.95, -0.05);
    const parts = [
      prism([[-0.45, 0.18], [0.35, 0.18], [0.5, 0.26], [0.4, 0.36], [-0.4, 0.38]], 0.46, armor, 0, 0.025),
      chamferBox(0.42, 0.02, 0.3, teamPanel, 0, 0.385, -0.05, 0.005),
      taper(0.14, 0.2, 0.12, armorDark, 0, 0.44, -0.05, 10),
      strut([0, 0.5, -0.05], [0, 0.85, -0.05], 0.05, armorDark, true),
      emitter,
      ring,
    ];
    for (const side of [-1, 1]) {
      parts.push(prism([[-0.48, 0.1], [0.42, 0.1], [0.5, 0.18], [0.42, 0.28], [-0.44, 0.28]], 0.14, armorDark, side * 0.3, 0.015));
      for (const z of [-0.3, 0.3]) parts.push(taper(0.06, 0.09, 0.04, glow, side * 0.3, 0.08, z, 8));
    }
    return mergeByMaterial(parts);
  },

  // ---- Cybran T2 (fiender) ----

  /**
   * Cybran Rhino (Heavy Tank): lågt, kilformat skrov på band med vassa
   * pansarplåtar och ett torn ('turret') med en partikelkanon.
   */
  rhino() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const hull = [
      prism([[-0.85, 0.2], [0.55, 0.2], [0.95, 0.3], [0.7, 0.5], [-0.7, 0.52], [-0.9, 0.38]], 0.7, cybran, 0, 0.03),
      chamferBox(0.04, 0.03, 0.9, enemyGlow, 0, 0.53, -0.1, 0.01),
      ...[-0.1, 0.1].map((x) => chamferBox(0.05, 0.03, 0.02, enemyGlow, x, 0.36, 0.93, 0.005)),
    ];
    for (const side of [-1, 1]) {
      const plate = prism([[-0.8, 0], [0.75, 0], [0.6, 0.16], [-0.85, 0.12]], 0.04, enemyPanel, 0, 0.01);
      plate.position.set(side * 0.4, 0.42, 0);
      plate.rotation.z = side * 0.45;
      hull.push(
        prism([[-0.9, 0.1], [-0.8, 0.0], [0.8, 0.0], [0.92, 0.12], [0.82, 0.28], [-0.82, 0.28]], 0.26, cybranDark, side * 0.47),
        plate,
      );
    }
    const turret = namedGroup('turret', [
      prism([[-0.4, 0], [0.22, 0], [0.38, 0.1], [0.2, 0.24], [-0.36, 0.22]], 0.5, cybranDark, 0, 0.03),
      chamferBox(0.04, 0.03, 0.4, enemyGlow, 0, 0.25, -0.1, 0.01),
      strut([0, 0.11, 0.3], [0, 0.11, 1.05], 0.08, cybran, true),
      strut([0, 0.11, 0.55], [0, 0.11, 0.75], 0.13, cybranDark, true),
      strut([0, 0.11, 1.05], [0, 0.11, 1.09], 0.07, enemyGlow, true),
    ], 0, 0.5, -0.08);
    return [...mergeByMaterial(hull), turret];
  },

  /** Cybran Hoplite (Rocket Bot): smal insektsrobot med ett raketpaket på ryggen och tre röda ögon. */
  hoplite() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const parts = [
      prism([[-0.4, 0.55], [0.22, 0.5], [0.42, 0.6], [0.32, 0.74], [-0.1, 0.82], [-0.42, 0.76]], 0.42, cybran, 0, 0.03),
      prism([[0.3, 0.56], [0.52, 0.58], [0.54, 0.66], [0.38, 0.72]], 0.22, cybranDark, 0, 0.02),
      ...[-0.06, 0, 0.06].map((x) => chamferBox(0.03, 0.03, 0.02, enemyGlow, x, 0.64, 0.53, 0.005)),
      // Raketpaketet: en låda med nio rör riktade framåt-uppåt.
      rotated(chamferBox(0.46, 0.34, 0.4, cybranDark, 0, 1.02, -0.22, 0.03), -0.35),
      rotated(chamferBox(0.48, 0.04, 0.3, enemyPanel, 0, 1.2, -0.28, 0.01), -0.35),
    ];
    for (const x of [-0.13, 0, 0.13]) {
      for (const y of [0.94, 1.06]) parts.push(chamferBox(0.07, 0.07, 0.04, enemyGlow, x, y + 0.08, -0.02, 0.01));
    }
    const legs = insectLegs([[-0.18, 0.2], [0.18, 0.2], [-0.18, -0.24], [0.18, -0.24]], { hipY: 0.58, reach: 0.62, kneeY: 0.86, t: 0.07 });
    return [...mergeByMaterial(parts), ...legs];
  },

  /**
   * Cybran Wagner (Amphibious Tank): bred, rundad kropp på fyra kraftiga ben med
   * en raketkastare och en elektronkanon i fronten.
   */
  wagner() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const parts = [
      prism([[-0.65, 0.5], [0.45, 0.48], [0.7, 0.6], [0.55, 0.8], [-0.5, 0.86], [-0.7, 0.7]], 0.75, cybran, 0, 0.04),
      chamferBox(0.8, 0.06, 0.6, cybranDark, 0, 0.5, 0, 0.02),
      chamferBox(0.05, 0.03, 0.8, enemyGlow, 0, 0.87, -0.05, 0.01),
      // Raketkastare till vänster, elektronkanon till höger.
      chamferBox(0.22, 0.2, 0.36, cybranDark, -0.28, 0.82, 0.35, 0.03),
      chamferBox(0.16, 0.03, 0.03, enemyGlow, -0.28, 0.82, 0.54, 0.005),
      strut([0.24, 0.72, 0.4], [0.24, 0.72, 0.9], 0.09, cybranDark, true),
      strut([0.24, 0.72, 0.9], [0.24, 0.72, 0.94], 0.07, enemyGlow, true),
    ];
    for (const side of [-1, 1]) {
      const plate = prism([[-0.55, 0], [0.4, 0], [0.3, 0.16], [-0.6, 0.12]], 0.04, enemyPanel, 0, 0.01);
      plate.position.set(side * 0.38, 0.62, 0);
      plate.rotation.z = side * 0.5;
      parts.push(plate);
    }
    const legs = insectLegs([[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.32], [0.3, -0.32]], { hipY: 0.58, reach: 0.72, kneeY: 0.88, t: 0.09 });
    return [...mergeByMaterial(parts), ...legs];
  },

  /** Cybran Viper (Mobile Missile Launcher): lång insektskropp med en upprest missilramp på ryggen. */
  viper() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const parts = [
      prism([[-0.7, 0.48], [0.4, 0.46], [0.62, 0.56], [0.48, 0.7], [-0.6, 0.74]], 0.55, cybran, 0, 0.03),
      chamferBox(0.6, 0.04, 0.5, enemyPanel, 0, 0.75, -0.1, 0.01),
      ...[-0.06, 0.06].map((x) => chamferBox(0.04, 0.03, 0.02, enemyGlow, x, 0.58, 0.6, 0.005)),
      // Missilramp: två missiler i en ram, snett uppåt.
      strut([0, 0.75, -0.4], [0, 1.0, -0.1], 0.08, cybranDark, true),
      ...[-0.12, 0.12].flatMap((x) => [
        strut([x, 0.82, -0.55], [x, 1.25, 0.2], 0.1, cybranDark, true),
        strut([x, 1.25, 0.2], [x, 1.31, 0.3], 0.07, enemyGlow, true),
      ]),
    ];
    const legs = insectLegs([[-0.24, 0.26], [0.24, 0.26], [-0.24, -0.34], [0.24, -0.34]], { hipY: 0.55, reach: 0.66, kneeY: 0.84, t: 0.075 });
    return [...mergeByMaterial(parts), ...legs];
  },
};

/**
 * Ytdetaljer för alla modeller: paneltexturer (UEF raka plåtar, Cybran avfasade)
 * med bumpkarta, och en miljökarta så att metallen får reflexer. Anropas en gång
 * med spelets renderer, eftersom texturerna ritas på en canvas.
 */
export function applySurfaceDetail(renderer) {
  const environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const uef = createPanelTextures({ seed: 7 });
  const cybran = createPanelTextures({ seed: 13, cut: true });
  const detail = {
    armor: uef, armorDark: uef, teamPanel: uef, concrete: uef, tread: uef,
    cybran, cybranDark: cybran, enemyPanel: cybran,
  };
  for (const [name, material] of Object.entries(MATERIALS)) {
    material.envMap = environment;
    material.envMapIntensity = 0.55;
    const textures = detail[name];
    if (textures) {
      material.map = textures.map;
      material.bumpMap = textures.bump;
      material.bumpScale = 1.5;
    }
    material.needsUpdate = true;
  }
  WRECK_MATERIAL.envMap = environment;
  WRECK_MATERIAL.envMapIntensity = 0.3;
  WRECK_MATERIAL.needsUpdate = true;
}

/** Trådmodell för byggnader under uppbyggnad (FA:s "wireframe" som fylls i). */
export const BUILD_WIRE_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x67e8f9, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false,
});

/** Mörkt, matt material för vrak. */
export const WRECK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 1, metalness: 0.2 });

/**
 * Modellskala per typ: T2-enheter är tydligt större än T1-enheterna med samma
 * roll, som i FA (t.ex. Hoplite mot Mantis, Mongoose mot Mech Marine).
 */
const MODEL_SCALE = {
  pillar: 1.1,
  mongoose: 1.35,
  riptide: 1.1,
  flapjack: 1.15,
  skyBoxer: 1.15,
  parashield: 1.15,
  rhino: 1.1,
  hoplite: 1.35,
  wagner: 1.3,
  viper: 1.2,
};

export function createModel(type) {
  const group = new THREE.Group();
  group.add(...MODELS[type]());
  group.scale.setScalar(MODEL_SCALE[type] ?? 1);
  return group;
}

const ghostMaterials = {
  ok: new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.45, depthWrite: false }),
  bad: new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.45, depthWrite: false }),
  queued: new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.3, depthWrite: false }),
};

/** Halvgenomskinlig kopia av en modell. `state`: 'ok' | 'bad' | 'queued'. */
export function createGhost(type, state = 'ok') {
  const ghost = createModel(type);
  setGhostState(ghost, state);
  return ghost;
}

export function setGhostState(ghost, state) {
  if (ghost.userData.ghostState === state) return;
  ghost.userData.ghostState = state;
  ghost.traverse((o) => {
    if (o.isMesh) o.material = ghostMaterials[state];
  });
}
