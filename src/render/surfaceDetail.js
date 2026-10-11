import * as THREE from 'three';

/** Hur många världsenheter en textur täcker innan den upprepas. */
export const TEXTURE_WORLD_SIZE = 1.6;

/** Liten deterministisk slumpgenerator, så att texturerna blir likadana varje gång. */
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Delar kvadraten i paneler: större plåtar som ibland är uppdelade i mindre. */
function splitPanels(rand, size) {
  const panels = [];
  const split = (x, y, w, h, depth) => {
    const stop = depth >= 4 || (depth >= 2 && rand() < 0.35) || w < 70 || h < 70;
    if (stop) {
      panels.push({ x, y, w, h });
      return;
    }
    const vertical = w > h ? rand() < 0.8 : rand() < 0.2;
    const t = 0.3 + rand() * 0.4;
    if (vertical) {
      const s = Math.round(w * t);
      split(x, y, s, h, depth + 1);
      split(x + s, y, w - s, h, depth + 1);
    } else {
      const s = Math.round(h * t);
      split(x, y, w, s, depth + 1);
      split(x, y + s, w, h - s, depth + 1);
    }
  };
  split(0, 0, size, size, 0);
  return panels;
}

/** Panelens kontur, med avfasade hörn för Cybran (`cut`). */
function panelPath(ctx, { x, y, w, h }, inset, cut) {
  const x0 = x + inset;
  const y0 = y + inset;
  const x1 = x + w - inset;
  const y1 = y + h - inset;
  const c = cut ? Math.min(w, h) * 0.22 : 0;
  ctx.beginPath();
  ctx.moveTo(x0 + c, y0);
  ctx.lineTo(x1 - c, y0);
  ctx.lineTo(x1, y0 + c);
  ctx.lineTo(x1, y1 - c);
  ctx.lineTo(x1 - c, y1);
  ctx.lineTo(x0 + c, y1);
  ctx.lineTo(x0, y1 - c);
  ctx.lineTo(x0, y0 + c);
  ctx.closePath();
}

/**
 * Paneltexturer för pansar: en färgkarta (fogar, nitar, ventiler, smuts och
 * lite färgvariation mellan plåtarna) och en bumpkarta där fogarna är nedsänkta
 * och nitarna upphöjda. `cut` ger Cybrans avfasade, kantiga plåtar.
 */
export function createPanelTextures({ seed, cut = false, size = 512 }) {
  const rand = random(seed);
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return [canvas, canvas.getContext('2d')];
  };
  const [colorCanvas, c] = make();
  const [bumpCanvas, b] = make();

  c.fillStyle = '#e4e4e4';
  c.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  for (const p of splitPanels(rand, size)) {
    // Varje plåt har en egen nyans och höjd.
    const shade = Math.round(222 + (rand() - 0.5) * 30);
    c.fillStyle = `rgb(${shade},${shade},${shade})`;
    panelPath(c, p, 2, cut);
    c.fill();
    const height = Math.round(150 + rand() * 50);
    b.fillStyle = `rgb(${height},${height},${height})`;
    panelPath(b, p, 2, cut);
    b.fill();

    // Fog runt plåten: mörk linje och en ljus kant som fångar ljuset.
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(30,32,36,0.6)';
    panelPath(c, p, 1.5, cut);
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    panelPath(c, p, 3.5, cut);
    c.stroke();
    b.lineWidth = 4;
    b.strokeStyle = '#000';
    panelPath(b, p, 1.5, cut);
    b.stroke();

    // Nitar i hörnen.
    if (rand() < 0.55 && p.w > 50 && p.h > 50) {
      const inset = cut ? Math.min(p.w, p.h) * 0.2 + 6 : 8;
      for (const [rx, ry] of [[p.x + inset, p.y + inset], [p.x + p.w - inset, p.y + inset],
        [p.x + inset, p.y + p.h - inset], [p.x + p.w - inset, p.y + p.h - inset]]) {
        c.fillStyle = 'rgba(20,20,20,0.45)';
        c.beginPath();
        c.arc(rx, ry, 2, 0, Math.PI * 2);
        c.fill();
        b.fillStyle = '#fff';
        b.beginPath();
        b.arc(rx, ry, 2.5, 0, Math.PI * 2);
        b.fill();
      }
    }

    // Ventilationsgaller på en del större plåtar.
    if (rand() < 0.18 && p.w > 90 && p.h > 70) {
      const vw = p.w * 0.5;
      const vx = p.x + (p.w - vw) / 2;
      const slats = 5 + Math.floor(rand() * 4);
      for (let i = 0; i < slats; i++) {
        const vy = p.y + p.h * 0.3 + i * 7;
        c.fillStyle = 'rgba(25,27,30,0.55)';
        c.fillRect(vx, vy, vw, 3);
        b.fillStyle = '#202020';
        b.fillRect(vx, vy, vw, 3);
      }
    }
  }

  // Smuts och slitage: mjuka mörka fläckar och fint brus, bara i färgen.
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 20 + rand() * 70;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(40,36,30,${0.06 + rand() * 0.08})`);
    g.addColorStop(1, 'rgba(40,36,30,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 6000; i++) {
    c.fillStyle = `rgba(0,0,0,${rand() * 0.07})`;
    c.fillRect(rand() * size, rand() * size, 1.5, 1.5);
  }

  const texture = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: texture(colorCanvas, true), bump: texture(bumpCanvas, false) };
}

/**
 * Sätter UV efter ytans riktning (som en låda som projiceras på modellen), så
 * att texturen har samma skala på alla delar oavsett form och storlek.
 */
export function boxProjectUVs(geometry) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const scale = 1 / TEXTURE_WORLD_SIZE;
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(b.clone().sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k];
      let u;
      let v;
      if (ax >= ay && ax >= az) [u, v] = [p.z, p.y];
      else if (ay >= az) [u, v] = [p.x, p.z];
      else [u, v] = [p.x, p.y];
      uv[(i + k) * 2] = u * scale;
      uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
