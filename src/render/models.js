import * as THREE from 'three';

export const PLAYER_COLOR = 0x3b82f6;

const MATERIALS = {
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.6, roughness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.5, roughness: 0.6 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.9 }),
  team: new THREE.MeshStandardMaterial({ color: PLAYER_COLOR, metalness: 0.4, roughness: 0.5 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.2 }),
  massGlow: new THREE.MeshStandardMaterial({ color: 0xbef264, emissive: 0x84cc16, emissiveIntensity: 1 }),
  energyGlow: new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xeab308, emissiveIntensity: 1.2 }),
};

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function cylinder(r, h, material, x, y, z, segments = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
  m.position.set(x, y, z);
  return m;
}

/** Modeller med origo på marken i mitten och framsidan mot +z. */
const MODELS = {
  /** Quantum Gate: sockel med en upprätt glödande ring. */
  core() {
    const { metal, team, glow } = MATERIALS;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.3, 12, 32), metal);
    ring.position.y = 2.6;
    const portal = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), glow.clone());
    portal.material.side = THREE.DoubleSide;
    portal.position.y = 2.6;
    return [box(4, 0.8, 4, metal, 0, 0.4, 0), box(3.2, 0.3, 3.2, team, 0, 0.95, 0), ring, portal];
  },

  /** ACU: enkel tvåbent robot med en kanonarm. */
  acu() {
    const { metal, team, glow } = MATERIALS;
    const gun = cylinder(0.1, 0.9, metal, 0.75, 0.95, 0.45, 8);
    gun.rotation.x = Math.PI / 2;
    return [
      box(0.35, 0.9, 0.45, metal, -0.3, 0.45, 0), // ben
      box(0.35, 0.9, 0.45, metal, 0.3, 0.45, 0),
      box(1.2, 0.8, 0.8, team, 0, 1.3, 0), // bål
      box(0.5, 0.35, 0.5, metal, 0, 1.88, 0), // huvud
      box(0.4, 0.1, 0.05, glow, 0, 1.9, 0.26), // visir
      box(0.3, 0.9, 0.3, team, -0.78, 1.25, 0), // armar
      box(0.3, 0.9, 0.3, team, 0.78, 1.25, 0),
      gun,
    ];
  },

  /** Ingenjör: liten svävare med byggarm. */
  engineer() {
    const { metal, team, glow } = MATERIALS;
    const arm = box(0.12, 0.12, 0.6, metal, 0, 0.75, 0.35);
    arm.rotation.x = -0.4;
    return [
      box(0.9, 0.15, 1.1, metal, 0, 0.2, 0),
      box(0.75, 0.35, 0.95, team, 0, 0.45, 0),
      arm,
      box(0.16, 0.16, 0.16, glow, 0, 0.88, 0.62),
    ];
  },

  /** Land Factory: platta med en hall baktill och två byggportaler, öppen framåt (+z). */
  landFactory() {
    const { metal, team, dark, glow } = MATERIALS;
    return [
      box(4, 0.4, 4, dark, 0, 0.2, 0),
      box(3.6, 1.6, 1.4, team, 0, 1.2, -1.1), // hall
      box(0.35, 1.8, 2.2, metal, -1.6, 1.1, 0.6), // sidoarmar
      box(0.35, 1.8, 2.2, metal, 1.6, 1.1, 0.6),
      box(3.55, 0.3, 0.35, metal, 0, 2.05, 1.5), // portal
      box(2.6, 0.08, 2.2, glow, 0, 0.44, 0.6), // byggyta
    ];
  },

  massExtractor() {
    const { metal, team, massGlow } = MATERIALS;
    return [
      box(1.8, 0.4, 1.8, metal, 0, 0.2, 0),
      cylinder(0.55, 1.1, team, 0, 0.95, 0),
      cylinder(0.35, 0.2, massGlow, 0, 1.6, 0),
    ];
  },

  powerGenerator() {
    const { metal, team, energyGlow } = MATERIALS;
    return [
      box(1.8, 0.4, 1.8, metal, 0, 0.2, 0),
      box(1.1, 0.8, 1.1, team, 0, 0.8, 0),
      cylinder(0.25, 1.4, metal, -0.55, 1.1, -0.55),
      cylinder(0.25, 1.4, metal, 0.55, 1.1, 0.55),
      cylinder(0.18, 0.12, energyGlow, -0.55, 1.85, -0.55),
      cylinder(0.18, 0.12, energyGlow, 0.55, 1.85, 0.55),
    ];
  },

  wall() {
    return [box(0.98, 1.3, 0.98, MATERIALS.concrete, 0, 0.65, 0)];
  },

  pointDefense() {
    const { metal, team, dark } = MATERIALS;
    const barrel = cylinder(0.08, 0.7, dark, 0, 0.8, 0.45, 8);
    barrel.rotation.x = Math.PI / 2;
    return [
      cylinder(0.45, 0.5, metal, 0, 0.25, 0),
      box(0.55, 0.35, 0.6, team, 0, 0.75, 0),
      barrel,
    ];
  },
};

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
