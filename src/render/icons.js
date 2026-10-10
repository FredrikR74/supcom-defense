import * as THREE from 'three';

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

const DRAW = {
  core: (ctx, s) => {
    ctx.fillStyle = '#3b82f6';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.fillRect(8, 8, s - 16, s - 16);
    ctx.strokeRect(8, 8, s - 16, s - 16);
  },
  acu: (ctx, s) => {
    ctx.fillStyle = '#3b82f6';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s / 2, 4);
    ctx.lineTo(s - 4, s / 2);
    ctx.lineTo(s / 2, s - 4);
    ctx.lineTo(4, s / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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

const textures = {};

export function createIcon(kind) {
  textures[kind] ??= iconTexture(DRAW[kind]);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures[kind],
    sizeAttenuation: false,
    depthTest: false,
  }));
  sprite.scale.set(ICON_SCALE, ICON_SCALE, 1);
  sprite.renderOrder = 10;
  return sprite;
}
