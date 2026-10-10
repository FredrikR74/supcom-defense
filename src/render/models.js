import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  cybran: new THREE.MeshStandardMaterial({ color: 0x4a504c, metalness: 0.6, roughness: 0.45, flatShading: true }),
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
 * Cybran-insektsben: från höfterna i `hips` ([x, z]) upp och ut till ett knä
 * och sedan ner till en klo i marken.
 */
function insectLegs(hips, { hipY, kneeOut, kneeY, footOut, t }) {
  const { cybranDark, cybran } = MATERIALS;
  const parts = [];
  for (const [x, z] of hips) {
    const side = Math.sign(x);
    const hip = [x, hipY, z];
    const knee = [x + side * kneeOut, kneeY, z * 1.15];
    const foot = [x + side * footOut, 0, z * 1.3];
    parts.push(
      strut(hip, knee, t, cybran),
      strut(knee, foot, t * 0.85, cybranDark),
      chamferBox(t * 1.4, t * 1.4, t * 1.4, cybranDark, ...knee, t * 0.3),
    );
  }
  return parts;
}

/** Modeller med origo på marken i mitten och framsidan mot +z. */
const MODELS = {
  /**
   * Quantum Gateway: åttkantig sockel i tre steg och två pyloner som håller en
   * upprätt ring med en glödande portal.
   */
  core() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const octagon = (r, h, material, y) => {
      const m = taper(r, r * 1.04, h, material, 0, y, 0, 8);
      m.rotation.y = Math.PI / 8;
      return m;
    };
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.22, 8, 32), armor);
    ring.position.y = 2.6;
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.06, 6, 32), armorDark);
    innerRing.position.y = 2.6;
    const portalMaterial = glow.clone();
    portalMaterial.side = THREE.DoubleSide;
    const portal = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), portalMaterial);
    portal.position.y = 2.6;

    const parts = [
      octagon(2.0, 0.4, armorDark, 0.2),
      octagon(1.9, 0.08, teamPanel, 0.44),
      octagon(1.75, 0.2, armor, 0.58),
      ring, innerRing, portal,
    ];
    for (const side of [-1, 1]) {
      const x = side * 1.6;
      parts.push(
        prism([[-0.5, 0.6], [0.5, 0.6], [0.35, 2.6], [0.15, 3.4], [-0.15, 3.4], [-0.35, 2.6]], 0.45, armor, x, 0.03),
        chamferBox(0.03, 1.2, 0.3, teamPanel, x + side * 0.24, 1.7, 0, 0.01),
        chamferBox(0.14, 0.1, 0.14, glow, x, 3.47, 0, 0.02),
      );
    }
    for (const [x, z] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) {
      parts.push(
        chamferBox(0.3, 0.3, 0.3, armorDark, x, 0.83, z, 0.04),
        chamferBox(0.12, 0.05, 0.12, glow, x, 1.0, z, 0.01),
      );
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF ACU: bastant tvåbent robot med ryggsäck, axelskydd och Zephyr-kanonen på
   * högerarmen. Benen ('legL', 'legR') har leden i höften och svängs när den går.
   */
  acu() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const HIP_Y = 1.05;

    const leg = (name, x) => {
      const foot = prism([[-0.22, 0], [0.3, 0], [0.36, 0.08], [0.18, 0.16], [-0.18, 0.16]], 0.34, armorDark);
      foot.position.y = -HIP_Y;
      return namedGroup(name, [
        chamferBox(0.3, 0.5, 0.38, armor, 0, -0.22, 0.02), // lår
        chamferBox(0.26, 0.16, 0.3, armorDark, 0, -0.5, 0.08), // knä
        chamferBox(0.26, 0.45, 0.32, armor, 0, -0.73, 0), // smalben
        chamferBox(0.12, 0.3, 0.03, teamPanel, 0, -0.72, 0.17, 0.01),
        foot,
      ], x, HIP_Y, 0);
    };

    const torso = prism([[-0.3, 0.18], [0.24, 0.18], [0.4, 0.34], [0.36, 0.64], [-0.3, 0.68], [-0.4, 0.4]], 0.95, armor, 0, 0.04);
    const chestPlate = chamferBox(0.5, 0.24, 0.04, teamPanel, 0, 0.46, 0.445, 0.01);
    chestPlate.rotation.x = -0.12;
    const exhausts = [-0.2, 0.2].flatMap((x) => [
      cylinder(0.07, 0.25, armor, x, 0.78, -0.48, 8),
      cylinder(0.05, 0.03, glow, x, 0.92, -0.48, 8),
    ]);
    const shoulders = [-0.62, 0.62].flatMap((x) => [
      chamferBox(0.36, 0.26, 0.5, armor, x, 0.58, 0, 0.05),
      chamferBox(0.3, 0.03, 0.4, teamPanel, x, 0.72, 0, 0.01),
    ]);
    const barrel = cylinder(0.07, 0.5, armor, -0.68, 0.05, 0.85, 10);
    barrel.rotation.x = Math.PI / 2;
    const muzzle = cylinder(0.05, 0.03, glow, -0.68, 0.05, 1.1, 10);
    muzzle.rotation.x = Math.PI / 2;
    const antenna = cylinder(0.015, 0.3, armorDark, 0.12, 1.05, -0.06, 4);

    const upper = namedGroup('torso', [
      chamferBox(0.62, 0.25, 0.42, armorDark, 0, -0.1, 0), // bäcken
      chamferBox(0.5, 0.26, 0.34, armorDark, 0, 0.1, 0.02), // midja
      torso,
      chestPlate,
      chamferBox(0.7, 0.5, 0.3, armorDark, 0, 0.45, -0.42, 0.05), // ryggsäck
      ...exhausts,
      chamferBox(0.36, 0.26, 0.36, armor, 0, 0.8, 0.04, 0.05), // huvud
      chamferBox(0.28, 0.07, 0.03, glow, 0, 0.82, 0.23, 0.01), // visir
      antenna,
      ...shoulders,
      // Högerarm: Zephyr Anti Matter Cannon.
      chamferBox(0.26, 0.4, 0.28, armor, -0.66, 0.3, 0),
      chamferBox(0.3, 0.3, 0.7, armorDark, -0.68, 0.05, 0.25, 0.05),
      chamferBox(0.31, 0.06, 0.5, teamPanel, -0.68, 0.2, 0.25, 0.01),
      barrel,
      muzzle,
      // Vänsterarm med hand.
      chamferBox(0.26, 0.4, 0.28, armor, 0.66, 0.3, 0),
      chamferBox(0.26, 0.45, 0.3, armor, 0.66, -0.02, 0.1),
      chamferBox(0.22, 0.18, 0.2, armorDark, 0.66, -0.3, 0.14),
    ], 0, 1.2, 0);

    return [leg('legR', -0.32), leg('legL', 0.32), upper];
  },

  /**
   * Cybran Mantis (Assault Bot): kilformad kropp på fyra insektsben, med en
   * laserkanon på varje sida.
   */
  mantis() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const topPanel = chamferBox(0.3, 0.03, 0.4, enemyPanel, 0, 0.81, 0.16, 0.01);
    topPanel.rotation.x = 0.19;
    const parts = [
      prism([[-0.5, 0.5], [0.15, 0.44], [0.5, 0.56], [0.42, 0.72], [-0.1, 0.82], [-0.48, 0.74]], 0.55, cybran, 0, 0.03),
      topPanel,
      chamferBox(0.22, 0.05, 0.03, enemyGlow, 0, 0.63, 0.55, 0.01), // ögon
      ...insectLegs([[-0.25, 0.3], [0.25, 0.3], [-0.25, -0.3], [0.25, -0.3]],
        { hipY: 0.55, kneeOut: 0.28, kneeY: 0.74, footOut: 0.4, t: 0.1 }),
    ];
    for (const side of [-1, 1]) {
      const x = side * 0.33;
      parts.push(
        chamferBox(0.02, 0.06, 0.6, enemyPanel, side * 0.29, 0.66, -0.05, 0.005),
        chamferBox(0.12, 0.12, 0.25, cybranDark, x, 0.66, 0.15, 0.02),
        strut([x, 0.66, 0.2], [x, 0.66, 0.75], 0.07, cybranDark, true),
        strut([x, 0.66, 0.75], [x, 0.66, 0.79], 0.05, enemyGlow, true),
      );
    }
    return mergeByMaterial(parts);
  },

  /** Cybran Mole (Land Scout): liten, lätt spindel med en sensormast. */
  mole() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    const sensor = cylinder(0.08, 0.03, enemyGlow, 0, 0.97, -0.2, 10);
    sensor.rotation.x = Math.PI / 2 - 0.4;
    return mergeByMaterial([
      prism([[-0.35, 0.38], [0.25, 0.36], [0.38, 0.46], [0.25, 0.56], [-0.32, 0.54]], 0.36, cybran, 0, 0.02),
      chamferBox(0.02, 0.05, 0.4, enemyPanel, -0.19, 0.47, -0.03, 0.005),
      chamferBox(0.02, 0.05, 0.4, enemyPanel, 0.19, 0.47, -0.03, 0.005),
      chamferBox(0.14, 0.04, 0.03, enemyGlow, 0, 0.47, 0.39, 0.01),
      strut([0, 0.55, -0.15], [0, 0.95, -0.2], 0.035, cybranDark, true),
      sensor,
      ...insectLegs([[-0.16, 0.2], [0.16, 0.2], [-0.16, -0.2], [0.16, -0.2]],
        { hipY: 0.4, kneeOut: 0.18, kneeY: 0.55, footOut: 0.27, t: 0.06 }),
    ]);
  },

  /** Cybran Medusa (Mobile Light Artillery): bred kropp på fyra ben med ett grovt granatkastarrör. */
  medusa() {
    const { cybran, cybranDark, enemyPanel, enemyGlow } = MATERIALS;
    return mergeByMaterial([
      prism([[-0.55, 0.5], [0.4, 0.48], [0.55, 0.6], [0.4, 0.74], [-0.5, 0.76]], 0.6, cybran, 0, 0.03),
      chamferBox(0.02, 0.07, 0.7, enemyPanel, -0.31, 0.62, -0.05, 0.005),
      chamferBox(0.02, 0.07, 0.7, enemyPanel, 0.31, 0.62, -0.05, 0.005),
      chamferBox(0.2, 0.05, 0.03, enemyGlow, 0, 0.63, 0.56, 0.01),
      taper(0.22, 0.27, 0.15, cybranDark, 0, 0.83, -0.08, 10),
      chamferBox(0.36, 0.03, 0.2, enemyPanel, 0, 0.92, -0.08, 0.01),
      strut([0, 0.85, -0.12], [0, 1.4, 0.42], 0.16, cybranDark, true),
      strut([0, 1.4, 0.42], [0, 1.44, 0.46], 0.13, enemyGlow, true),
      ...insectLegs([[-0.28, 0.32], [0.28, 0.32], [-0.28, -0.32], [0.28, -0.32]],
        { hipY: 0.55, kneeOut: 0.3, kneeY: 0.76, footOut: 0.44, t: 0.11 }),
    ]);
  },

  /**
   * UEF MA12 Striker: lågt, kantigt skrov med sluttande front mellan två breda
   * bandpaket, och ett kilformat torn ('turret') med långt rör och mynningsbroms.
   */
  striker() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;

    const hull = [];
    for (const side of [-1, 1]) {
      const x = side * 0.47;
      hull.push(
        prism([[-0.72, 0.12], [-0.62, 0.02], [0.62, 0.02], [0.74, 0.14], [0.66, 0.3], [-0.66, 0.3]], 0.26, tread, x),
        prism([[-0.7, 0.28], [0.7, 0.28], [0.76, 0.36], [0.66, 0.41], [-0.68, 0.41]], 0.3, armor, x), // stänkskärm
        chamferBox(0.08, 0.02, 1.0, teamPanel, x + side * 0.06, 0.42, -0.02, 0.005),
      );
      for (const z of [-0.45, -0.15, 0.15, 0.45]) {
        const wheel = cylinder(0.1, 0.04, armorDark, side * 0.6, 0.13, z, 10);
        const hub = cylinder(0.045, 0.03, armor, side * 0.625, 0.13, z, 8);
        wheel.rotation.z = hub.rotation.z = Math.PI / 2;
        hull.push(wheel, hub);
      }
    }
    // Skrov med sluttande front, motordäck baktill och strålkastare.
    hull.push(prism([[-0.66, 0.2], [0.5, 0.2], [0.72, 0.36], [0.58, 0.52], [-0.6, 0.52], [-0.7, 0.42]], 0.72, armor, 0, 0.03));
    const glacis = chamferBox(0.42, 0.02, 0.17, teamPanel, 0, 0.47, 0.684, 0.005);
    glacis.rotation.x = 0.85;
    hull.push(glacis, chamferBox(0.5, 0.04, 0.32, armorDark, 0, 0.53, -0.42, 0.01));
    for (const z of [-0.52, -0.42, -0.32]) hull.push(box(0.46, 0.02, 0.03, armor, 0, 0.56, z));
    for (const x of [-0.25, 0.25]) hull.push(chamferBox(0.08, 0.05, 0.03, glow, x, 0.33, 0.7, 0.01));

    const barrel = cylinder(0.05, 0.6, armor, 0, 0.12, 0.72, 10);
    barrel.rotation.x = Math.PI / 2;
    const hatch = cylinder(0.09, 0.05, armorDark, -0.1, 0.26, -0.12, 10);
    const turret = namedGroup('turret', [
      prism([[-0.36, 0], [0.3, 0], [0.42, 0.12], [0.3, 0.24], [-0.3, 0.24], [-0.4, 0.14]], 0.56, armor, 0, 0.03),
      chamferBox(0.02, 0.1, 0.4, teamPanel, -0.285, 0.12, -0.02, 0.005),
      chamferBox(0.02, 0.1, 0.4, teamPanel, 0.285, 0.12, -0.02, 0.005),
      hatch,
      chamferBox(0.08, 0.08, 0.1, armorDark, 0.17, 0.29, -0.2, 0.01), // sensor
      chamferBox(0.05, 0.03, 0.02, glow, 0.17, 0.3, -0.14, 0.005),
      chamferBox(0.2, 0.16, 0.12, armorDark, 0, 0.12, 0.42), // mantel
      barrel,
      chamferBox(0.11, 0.08, 0.12, armorDark, 0, 0.12, 1.02, 0.01), // mynningsbroms
    ], 0, 0.52, -0.02);

    return [...mergeByMaterial(hull), turret];
  },

  /** UEF T1 Engineer: liten bandvagn med förarhytt och en kranarm med byggnozzel. */
  engineer() {
    const { armor, armorDark, tread, teamPanel, glow } = MATERIALS;
    const parts = [
      prism([[-0.5, 0.16], [0.36, 0.16], [0.48, 0.28], [0.4, 0.42], [-0.44, 0.46]], 0.48, armor, 0, 0.03),
      chamferBox(0.36, 0.16, 0.2, armorDark, 0, 0.52, 0.2, 0.03), // hytt
      chamferBox(0.28, 0.05, 0.02, glow, 0, 0.54, 0.31, 0.005),
      taper(0.1, 0.12, 0.1, armorDark, 0, 0.5, -0.15, 10), // kranfot
      strut([0, 0.55, -0.15], [0, 0.88, 0.32], 0.08, armor),
      chamferBox(0.1, 0.1, 0.1, glow, 0, 0.88, 0.36, 0.02), // nozzel
    ];
    for (const side of [-1, 1]) {
      parts.push(
        prism([[-0.5, 0.08], [-0.42, 0], [0.42, 0], [0.5, 0.1], [0.44, 0.2], [-0.44, 0.2]], 0.18, tread, side * 0.32),
        chamferBox(0.02, 0.08, 0.6, teamPanel, side * 0.245, 0.32, -0.04, 0.005),
      );
    }
    return mergeByMaterial(parts);
  },

  /**
   * UEF Land Factory: hall baktill, låga sidoväggar, en portal med byggarmar
   * framtill och en upplyst byggplatta i mitten. Öppen framåt (+z).
   */
  landFactory() {
    const { armor, armorDark, teamPanel, glow } = MATERIALS;
    const parts = [
      chamferBox(4, 0.3, 4, armorDark, 0, 0.15, 0, 0.06), // grund
      chamferBox(2.3, 0.04, 2.1, armor, 0, 0.32, 0.7, 0.01), // byggplatta
      box(2.4, 0.03, 0.06, glow, 0, 0.34, -0.4),
      box(2.4, 0.03, 0.06, glow, 0, 0.34, 1.8),
      box(0.06, 0.03, 2.2, glow, -1.2, 0.34, 0.7),
      box(0.06, 0.03, 2.2, glow, 1.2, 0.34, 0.7),
      // Hallen med port och lagfärgsrand.
      prism([[-1.95, 0.3], [-0.55, 0.3], [-0.55, 1.3], [-0.85, 1.75], [-1.95, 1.75]], 3.6, armor, 0, 0.04),
      chamferBox(2.0, 0.8, 0.04, armorDark, 0, 0.72, -0.5, 0.01),
      chamferBox(3.2, 0.16, 0.04, teamPanel, 0, 1.18, -0.5, 0.01),
      // Portalen över byggplattan.
      chamferBox(3.74, 0.3, 0.36, armor, 0, 2.2, 1.55, 0.04),
      chamferBox(3.0, 0.12, 0.03, teamPanel, 0, 2.2, 1.74, 0.01),
    ];
    for (const side of [-1, 1]) {
      const x = side * 1.72;
      parts.push(
        prism([[-0.55, 0.3], [1.9, 0.3], [1.9, 0.6], [1.5, 0.9], [-0.55, 1.2]], 0.32, armor, x, 0.03), // sidovägg
        chamferBox(0.3, 1.9, 0.3, armor, x, 1.2, 1.55, 0.04), // pelare
        chamferBox(0.1, 0.08, 0.1, glow, x, 2.4, 1.55, 0.02),
        chamferBox(0.5, 0.12, 0.5, armorDark, side * 0.9, 1.81, -1.4, 0.02), // ventiler
        cylinder(0.15, 0.5, armor, side * 1.4, 2.0, -1.5, 10),
        strut([side * 0.8, 2.05, 1.55], [side * 0.5, 1.4, 0.9], 0.1, armorDark), // byggarm
        chamferBox(0.12, 0.12, 0.12, glow, side * 0.5, 1.36, 0.88, 0.02),
      );
    }
    return mergeByMaterial(parts);
  },

  /** UEF Mass Extractor: åttkantig fot, fyra kolvar och en borrkärna med glödande massa. */
  massExtractor() {
    const { armor, armorDark, teamPanel, massGlow } = MATERIALS;
    const base = taper(0.92, 0.98, 0.3, armorDark, 0, 0.15, 0, 8);
    base.rotation.y = Math.PI / 8;
    const parts = [
      base,
      taper(0.42, 0.42, 1.0, armor, 0, 0.8, 0, 8), // kärna
      taper(0.44, 0.44, 0.14, teamPanel, 0, 0.75, 0, 8),
      taper(0.3, 0.38, 0.1, armorDark, 0, 1.35, 0, 8),
      cylinder(0.24, 0.1, massGlow, 0, 1.42, 0, 12),
    ];
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
      parts.push(
        cylinder(0.12, 0.8, armor, x, 0.6, z, 8), // kolv
        cylinder(0.15, 0.08, armorDark, x, 1.02, z, 8),
        strut([x, 0.95, z], [x * 0.5, 1.15, z * 0.5], 0.07, armorDark),
      );
    }
    return mergeByMaterial(parts);
  },

  /** UEF T1 Power Generator: pansrad kropp med glödande fönster och två kyltorn. */
  powerGenerator() {
    const { armor, armorDark, teamPanel, energyGlow } = MATERIALS;
    const parts = [
      chamferBox(1.8, 0.3, 1.8, armorDark, 0, 0.15, 0, 0.05),
      prism([[-0.7, 0.3], [0.7, 0.3], [0.7, 0.8], [0.45, 1.05], [-0.7, 1.05]], 1.3, armor, 0, 0.04),
      chamferBox(1.1, 0.12, 0.03, teamPanel, 0, 0.62, 0.74, 0.01),
    ];
    for (const side of [-1, 1]) {
      const x = side * 0.35;
      parts.push(
        chamferBox(0.03, 0.25, 0.6, energyGlow, side * 0.67, 0.62, -0.1, 0.01), // fönster
        taper(0.2, 0.28, 1.1, armor, x, 1.6, -0.3, 12), // kyltorn
        taper(0.25, 0.27, 0.08, armorDark, x, 1.3, -0.3, 12),
        cylinder(0.17, 0.06, energyGlow, x, 2.16, -0.3, 12),
      );
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
};

/** Trådmodell för byggnader under uppbyggnad (FA:s "wireframe" som fylls i). */
export const BUILD_WIRE_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x67e8f9, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false,
});

/** Mörkt, matt material för vrak. */
export const WRECK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 1, metalness: 0.2 });

export function createModel(type) {
  const group = new THREE.Group();
  group.add(...MODELS[type]());
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
