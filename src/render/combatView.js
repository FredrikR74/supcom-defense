import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';

const OWNER_COLORS = {
  1: new THREE.Color(0x7dd3fc), // UEF: blå plasma
  2: new THREE.Color(0xff5a4f), // Cybran: röd laser
};
const DEFAULT_COLOR = new THREE.Color(0xffffff);

/** Mjuk rund glödtextur för blixtar och explosioner. */
function glowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Projektiler (instansierade avlånga glödande skott i lagfärg) och kortlivade
 * effekter från simuleringens händelser: mynningsblixt, träff och explosion.
 */
export function createCombatView(terrain, capacity = 2048) {
  const group = new THREE.Group();

  const boltGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.7);
  const bolts = new THREE.InstancedMesh(boltGeometry, new THREE.MeshBasicMaterial({ toneMapped: false }), capacity);
  bolts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  bolts.count = 0;
  bolts.frustumCulled = false;
  group.add(bolts);

  const texture = glowTexture();
  /** Aktiva effekter: { sprite, age, life, from, to } (storlek växer från `from` till `to`). */
  const effects = [];
  const pool = [];

  function spawnEffect(x, y, z, color, from, to, life) {
    const sprite = pool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    sprite.material.color.copy(color);
    sprite.material.opacity = 1;
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(from);
    group.add(sprite);
    effects.push({ sprite, age: 0, life, from, to });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const ground = (x, z) => getHeight(terrain, x, z);

  return {
    group,

    /** Skapar effekter för händelser från simuleringen. */
    handleEvents(events) {
      for (const ev of events) {
        const color = OWNER_COLORS[ev.owner] ?? DEFAULT_COLOR;
        const y = ground(ev.x, ev.z);
        if (ev.type === 'fire') spawnEffect(ev.x, y + ev.y, ev.z, color, 0.6, 0.9, 0.08);
        else if (ev.type === 'hit') spawnEffect(ev.x, y + ev.y, ev.z, color, 0.4, 1.2, 0.2);
        else if (ev.type === 'death') {
          const s = Math.max(1, ev.size * 2);
          spawnEffect(ev.x, y + 0.6, ev.z, new THREE.Color(0xffb347), s, s * 3, 0.7);
          spawnEffect(ev.x, y + 0.4, ev.z, new THREE.Color(0xff5a1f), s * 0.5, s * 2, 0.45);
        }
      }
    },

    update(world, alpha, frameSeconds) {
      let n = 0;
      for (const p of world.projectiles) {
        if (n >= capacity) break;
        const x = p.prevX + (p.x - p.prevX) * alpha;
        const z = p.prevZ + (p.z - p.prevZ) * alpha;
        q.setFromAxisAngle(up, Math.atan2(p.tx - p.prevX, p.tz - p.prevZ));
        let y = ground(x, z) + p.y;
        if (p.ballistic) {
          // Artillerigranater flyger i en båge: högst mitt på vägen.
          const total = Math.hypot(p.tx - p.sx, p.tz - p.sz) || 1;
          const t = Math.min(1, Math.hypot(x - p.sx, z - p.sz) / total);
          y += 4 * (total * 0.35) * t * (1 - t);
        }
        m.compose(pos.set(x, y, z), q, one);
        bolts.setMatrixAt(n, m);
        bolts.setColorAt(n, OWNER_COLORS[p.owner] ?? DEFAULT_COLOR);
        n++;
      }
      bolts.count = n;
      bolts.instanceMatrix.needsUpdate = true;
      bolts.instanceColor.needsUpdate = true;

      for (let i = effects.length - 1; i >= 0; i--) {
        const fx = effects[i];
        fx.age += frameSeconds;
        const t = fx.age / fx.life;
        if (t >= 1) {
          group.remove(fx.sprite);
          pool.push(fx.sprite);
          effects.splice(i, 1);
          continue;
        }
        fx.sprite.scale.setScalar(fx.from + (fx.to - fx.from) * t);
        fx.sprite.material.opacity = 1 - t;
      }
    },
  };
}
