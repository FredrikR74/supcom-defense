import * as THREE from 'three';
import { getDef } from '../sim/entities.js';

/** Strategiska ikoner: platta sprites med konstant storlek på skärmen. */
const ICON_SCALE = 0.035;

function iconTexture(draw) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Strategiska ikoner som i FA (textures/ui/common/game/strategicicons): formen
 * visar kategorin, symbolen i mitten rollen och vita streck under ikonen
 * tech-nivån (ett för T1, två för T2, tre för T3). Ikonen fylls med ägarens
 * lagfärg och har en svart kant. Egen ritning i FA:s system; FA:s bilder används inte.
 *
 * Former: 'land' (romb), 'bot' (åttahörning), 'structure' (kvadrat),
 * 'factory' (bred rektangel), 'commander' (stor romb utan streck), 'wall' (liten kvadrat).
 * Roller: 'directfire' (kors), 'artillery' (prick), 'missile' (lodrätt streck),
 * 'antiair' (vinkel uppåt), 'engineer' (bjälke med tapp), 'intel' (vågrätt streck),
 * 'shield' (kupol), 'mass', 'massfab', 'massstorage', 'energy', 'energystorage',
 * 'factory' (romb i ram), 'gate' (ring).
 */
const ICON_SPECS = {
  acu: ['commander', 'directfire'],
  engineer: ['land', 'engineer'],
  engineerT2: ['land', 'engineer'],
  snoop: ['land', 'intel'],
  mechMarine: ['bot', 'directfire'],
  striker: ['land', 'directfire'],
  lobo: ['land', 'artillery'],
  archer: ['land', 'antiair'],
  pillar: ['land', 'directfire'],
  mongoose: ['bot', 'directfire'],
  riptide: ['land', 'directfire'],
  flapjack: ['land', 'missile'],
  skyBoxer: ['land', 'antiair'],
  parashield: ['land', 'shield'],
  mantis: ['bot', 'directfire'],
  mole: ['land', 'intel'],
  medusa: ['land', 'artillery'],
  rhino: ['land', 'directfire'],
  hoplite: ['bot', 'directfire'],
  wagner: ['land', 'directfire'],
  viper: ['land', 'missile'],
  core: ['structure', 'gate'],
  landFactory: ['factory', 'factory'],
  landFactoryT2: ['factory', 'factory'],
  massExtractor: ['structure', 'mass'],
  massExtractorT2: ['structure', 'mass'],
  massExtractorT3: ['structure', 'mass'],
  massFabricator: ['structure', 'massfab'],
  massStorage: ['structure', 'massstorage'],
  powerGenerator: ['structure', 'energy'],
  powerGeneratorT2: ['structure', 'energy'],
  energyStorage: ['structure', 'energystorage'],
  pointDefense: ['structure', 'directfire'],
  pointDefenseT2: ['structure', 'directfire'],
  artilleryT2: ['structure', 'artillery'],
  shieldGenerator: ['structure', 'shield'],
  radar: ['structure', 'intel'],
  radarT2: ['structure', 'intel'],
  wall: ['wall', null],
};

const TECH_LEVEL = { TECH1: 1, TECH2: 2, TECH3: 3 };
const PLAYER_FILL = '#3b82f6';
const ENEMY_FILL = '#dc2626';
const INK = '#0b0f14';

/** Tech-nivån (1–3) för en typ som ska ha streck, annars 0 (ACU, mur). */
export function iconTechLevel(type) {
  const spec = ICON_SPECS[type];
  if (!spec || spec[0] === 'commander' || spec[0] === 'wall') return 0;
  return TECH_LEVEL[getDef(type)?.techCategory] ?? 0;
}

/** Formens kontur; ikonens överdel är y 2–46, strecken ligger under. */
function shapePath(ctx, shape) {
  ctx.beginPath();
  if (shape === 'land' || shape === 'commander') {
    const r = shape === 'commander' ? 26 : 21;
    ctx.moveTo(32, 24 - r); ctx.lineTo(32 + r, 24); ctx.lineTo(32, 24 + r); ctx.lineTo(32 - r, 24);
  } else if (shape === 'bot') {
    const pts = [[22, 5], [42, 5], [52, 15], [52, 33], [42, 43], [22, 43], [12, 33], [12, 15]];
    ctx.moveTo(...pts[0]);
    for (const p of pts.slice(1)) ctx.lineTo(...p);
  } else if (shape === 'factory') {
    ctx.rect(5, 5, 54, 38);
  } else if (shape === 'wall') {
    ctx.rect(20, 12, 24, 24);
  } else {
    ctx.rect(11, 4, 42, 40);
  }
  ctx.closePath();
}

/** Rollsymbolen i mitten (32, 24), mörk som i FA. */
function drawRole(ctx, role) {
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = 'square';
  const line = (pts) => {
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    for (const p of pts.slice(1)) ctx.lineTo(...p);
    ctx.stroke();
  };
  const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  switch (role) {
    case 'directfire':
      line([[32, 14], [32, 34]]);
      line([[22, 24], [42, 24]]);
      break;
    case 'artillery':
      dot(32, 24, 6);
      break;
    case 'missile':
      line([[32, 12], [32, 36]]);
      break;
    case 'antiair':
      line([[22, 30], [32, 18], [42, 30]]);
      break;
    case 'engineer':
      line([[21, 20], [43, 20]]);
      line([[32, 20], [32, 30]]);
      break;
    case 'intel':
      line([[21, 24], [43, 24]]);
      break;
    case 'shield':
      ctx.beginPath();
      ctx.arc(32, 31, 11, Math.PI, 0);
      ctx.stroke();
      line([[18, 31], [21, 31]]);
      line([[43, 31], [46, 31]]);
      break;
    case 'mass': case 'massfab': case 'massstorage':
      // Utvinnartorn: bjälke överst, ben och en fot.
      line([[23, 14], [41, 14]]);
      line([[32, 14], [32, 32]]);
      line([[25, 33], [39, 33]]);
      if (role === 'massfab') { ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(32, 23, 7, 0, Math.PI * 2); ctx.stroke(); }
      if (role === 'massstorage') { ctx.lineWidth = 2.5; ctx.strokeRect(18, 9, 28, 30); }
      break;
    case 'energy': case 'energystorage':
      ctx.beginPath();
      ctx.moveTo(35, 10); ctx.lineTo(24, 26); ctx.lineTo(31, 26); ctx.lineTo(28, 38); ctx.lineTo(40, 21); ctx.lineTo(33, 21);
      ctx.closePath();
      ctx.fill();
      if (role === 'energystorage') { ctx.lineWidth = 2.5; ctx.strokeRect(18, 9, 28, 30); }
      break;
    case 'factory':
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(32, 13); ctx.lineTo(43, 24); ctx.lineTo(32, 35); ctx.lineTo(21, 24);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'gate':
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(32, 24, 10, 0, Math.PI * 2);
      ctx.stroke();
      dot(32, 24, 3);
      break;
    default:
  }
}

/** Vita tech-streck under ikonen, som i FA (svart kant så att de syns mot allt). */
function drawTechBars(ctx, level) {
  const w = 9;
  const gap = 4;
  const x0 = 32 - (level * w + (level - 1) * gap) / 2;
  for (let i = 0; i < level; i++) {
    const x = x0 + i * (w + gap);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 2, 46, w + 4, 17);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, 48, w, 13);
  }
}

/** Ikon för en enhets- eller byggnadstyp: form, roll och tech i ägarens färg. */
function unitIcon(type) {
  const [shape, role] = ICON_SPECS[type];
  const fill = getDef(type)?.faction === 'Cybran' ? ENEMY_FILL : PLAYER_FILL;
  const level = iconTechLevel(type);
  return (ctx) => {
    // Stödet mellan ikonen och strecken, som FA:s "ben".
    if (level) {
      ctx.fillStyle = INK;
      ctx.fillRect(28, 40, 8, 8);
    }
    shapePath(ctx, shape);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Ljus innerkant så att ikonen syns även mot mörk mark.
    shapePath(ctx, shape);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
    drawRole(ctx, role);
    if (level) drawTechBars(ctx, level);
  };
}

const DRAW = {
  /** Sysslolös byggare: gul bricka med "Zz". */
  idle: (ctx, s) => {
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#0b0f14';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0b0f14';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Zz', s / 2, s / 2 + 2);
  },
  spawn: (ctx, s) => {
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s / 2, 6);
    ctx.lineTo(s - 6, s - 8);
    ctx.lineTo(6, s - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
  mass: (ctx, s) => {
    ctx.fillStyle = '#84cc16';
    ctx.strokeStyle = '#1a2e05';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },
};

for (const type of Object.keys(ICON_SPECS)) DRAW[type] = unitIcon(type);

/**
 * Radarblipp som FA:s icon_land_generic: en fiende som bara syns på radar
 * visas som en tom romb, utan roll och tech-nivå.
 */
DRAW.radarBlip = (ctx) => {
  shapePath(ctx, 'land');
  ctx.fillStyle = ENEMY_FILL;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  shapePath(ctx, 'land');
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
};

const textures = {};

export function getIconTexture(kind) {
  return (textures[kind] ??= iconTexture(DRAW[kind]));
}

export function createIcon(kind) {
  getIconTexture(kind);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures[kind],
    sizeAttenuation: false,
    depthTest: false,
  }));
  sprite.scale.set(ICON_SCALE, ICON_SCALE, 1);
  sprite.renderOrder = 10;
  return sprite;
}
