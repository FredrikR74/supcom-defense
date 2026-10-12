import * as THREE from 'three';
import { getHeight } from '../sim/terrain.js';

const OWNER_COLORS = {
  1: new THREE.Color(0x7dd3fc), // UEF: blå plasma
  2: new THREE.Color(0xff5a4f), // Cybran: röd laser
};
const DEFAULT_COLOR = new THREE.Color(0xffffff);
const WHITE = new THREE.Color(0xffffff);

/**
 * Hur varje vapens skott ser ut (efter skyttens typ):
 * - orb: UEF:s plasma, ett glödande klot med en kort svans (`scale` = storlek)
 * - beam: Cybrans lasrar, en tunn ljus stråle
 */
const PROJECTILE_STYLES = {
  striker: { kind: 'orb', scale: 1 },
  pointDefense: { kind: 'orb', scale: 1.25 },
  acu: { kind: 'orb', scale: 1.7 },
  mechMarine: { kind: 'orb', scale: 0.65 },
  snoop: { kind: 'orb', scale: 0.55 },
  archer: { kind: 'orb', scale: 0.7 },
  mantis: { kind: 'beam', scale: 1 },
  hunter: { kind: 'beam', scale: 1 },
  mole: { kind: 'beam', scale: 0.7 },
};
const defaultStyle = (owner) => ({ kind: owner === 2 ? 'beam' : 'orb', scale: 1 });

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  return new THREE.CanvasTexture(canvas);
}

/** Mjuk rund glöd. */
const glowTexture = () => canvasTexture(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

/** Ojämn rökboll: många mjuka fläckar, så att röken inte ser ut som en jämn cirkel. */
const smokeTexture = () => canvasTexture(128, (ctx, s) => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * s * 0.22;
    const x = s / 2 + Math.cos(a) * d;
    const y = s / 2 + Math.sin(a) * d;
    const r = s * (0.12 + rnd() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
});

/** Brännmärke på marken som en alfamask med ojämn kant. */
const scorchTexture = () => canvasTexture(128, (ctx, s) => {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * s * 0.12;
    const x = s / 2 + Math.cos(a) * d;
    const y = s / 2 + Math.sin(a) * d;
    const r = s * (0.22 + rnd() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
});

/** Ring för tryckvågen. */
const ringTexture = () => canvasTexture(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

/**
 * Partikelsystem: alla partiklar av ett slag ritas med ett enda anrop (Points
 * med egen shader), så att stora strider med många explosioner inte blir tunga.
 * Varje partikel har position, fart, tyngdkraft, storlek som växer, färg som
 * skiftar och opacitet som tonar ut.
 */
function createParticles(texture, capacity, blending, { depthTest = true } = {}) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 4);
  const sizes = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('rgba', new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, scale: { value: 500 } },
    vertexShader: `
      attribute vec4 rgba;
      attribute float size;
      uniform float scale;
      varying vec4 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
        vColor = rgba;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec4 vColor;
      void main() {
        float a = texture2D(map, gl_PointCoord).a * vColor.a;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vColor.rgb, a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest,
    blending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = blending === THREE.AdditiveBlending ? 6 : 5;
  // Punktstorleken i pixlar beror på skärmens höjd och kamerans synfält.
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(size);
    material.uniforms.scale.value = (size.y * camera.projectionMatrix.elements[5]) / 2;
  };

  /** Aktiva partiklar; varje är ett vanligt objekt (få fält, återanvänds inte). */
  let list = [];
  const c0 = new THREE.Color();

  return {
    points,
    spawn(p) {
      if (list.length >= capacity) return;
      list.push({ age: -(p.delay ?? 0), vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, alpha: 1, ...p });
    },
    update(dt) {
      let n = 0;
      const next = [];
      for (const p of list) {
        p.age += dt;
        if (p.age >= p.life) continue;
        next.push(p);
        if (p.age < 0) continue; // fördröjd
        const t = p.age / p.life;
        p.vy += p.gravity * dt;
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp;
        p.vy *= damp;
        p.vz *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        positions[n * 3] = p.x;
        positions[n * 3 + 1] = p.y;
        positions[n * 3 + 2] = p.z;
        c0.copy(p.color);
        if (p.endColor) c0.lerp(p.endColor, Math.min(1, t * 1.4));
        // Tonar in snabbt och ut mot slutet.
        const fade = Math.min(1, p.age / 0.04) * (1 - t) ** (p.fadePower ?? 1);
        const a = p.alpha * fade;
        colors[n * 4] = c0.r;
        colors[n * 4 + 1] = c0.g;
        colors[n * 4 + 2] = c0.b;
        colors[n * 4 + 3] = a;
        sizes[n] = p.from + (p.to - p.from) * (1 - (1 - t) ** 2);
        n++;
      }
      list = next;
      geometry.setDrawRange(0, n);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.rgba.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
    },
  };
}

/**
 * Platta effekter på marken (brännmärken och tryckvågor), instansierade med en
 * egen enkel shader: texturens alfa är formen, och instansens färg är färgen
 * gånger styrkan (som tonar mot noll). Brännmärken blandas normalt (mörk färg
 * över marken), tryckvågor additivt (lyser).
 */
function createGroundMarks(texture, capacity, darken) {
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vUv = uv;
        vColor = instanceColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: darken ? `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        // vColor.r = styrka (0–1); färgen är ett mörkt, varmt brunsvart.
        gl_FragColor = vec4(0.06, 0.05, 0.045, texture2D(map, vUv).a * vColor.r);
      }` : `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        gl_FragColor = vec4(vColor * texture2D(map, vUv).a, 1.0);
      }`,
    transparent: true,
    blending: darken ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, capacity);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = darken ? 2 : 4;
  let list = [];
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  return {
    mesh,
    spawn(mark) {
      if (list.length >= capacity) list.shift();
      list.push({ age: 0, ...mark });
    },
    update(dt) {
      list = list.filter((k) => (k.age += dt) < k.life);
      list.forEach((k, i) => {
        const t = k.age / k.life;
        const size = k.from + (k.to - k.from) * (1 - (1 - t) ** 2);
        m.makeScale(size, 1, size).setPosition(k.x, k.y, k.z);
        mesh.setMatrixAt(i, m);
        // Håller full styrka till `hold`, tonar sedan ut.
        const strength = Math.max(0, k.hold ? Math.min(1, (1 - t) / (1 - k.hold)) : 1 - t);
        mesh.setColorAt(i, c.copy(k.color).multiplyScalar(strength));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * Projektiler och effekter från simuleringens händelser:
 * - UEF:s plasma: glödande klot med kort svans; Cybrans lasrar: tunna strålar;
 *   artillerigranater: glödande klot i en båge med rökspår
 * - mynningsblixtar, gnistor vid träff
 * - explosioner i lager: blixt, eldklot som stiger och mörknar, gnistor som
 *   faller, en tryckvåg längs marken, rök som stiger, och ett brännmärke som
 *   bleknar. Byggnader ger större och längre explosioner.
 */
export function createCombatView(terrain, capacity = 2048) {
  const group = new THREE.Group();

  const additive = (opacity) => new THREE.MeshBasicMaterial({
    transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  /** Instansierad mesh med färg per instans. */
  function instanced(geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }
  // Plasma: kärna, halo och svans. Laser: tunn kärna och halo.
  const orbCore = instanced(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), capacity);
  const orbHalo = instanced(new THREE.IcosahedronGeometry(0.22, 1), additive(0.45), capacity);
  const orbTail = instanced(new THREE.BoxGeometry(0.08, 0.08, 0.55).translate(0, 0, -0.3), additive(0.35), capacity);
  const beamCore = instanced(new THREE.BoxGeometry(0.035, 0.035, 1.1), new THREE.MeshBasicMaterial({ toneMapped: false }), capacity);
  const beamHalo = instanced(new THREE.BoxGeometry(0.13, 0.13, 1.2), additive(0.35), capacity);
  // Artillerigranater
  const shells = instanced(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), 256);
  const shellCore = new THREE.Color();
  let trailTimer = 0;

  // Glöden testas inte mot djupet: stora eldklot nära marken skulle annars
  // klippas av med en rak kant där de skär genom marken.
  const fire = createParticles(glowTexture(), 6000, THREE.AdditiveBlending, { depthTest: false });
  const smoke = createParticles(smokeTexture(), 3000, THREE.NormalBlending);
  const scorches = createGroundMarks(scorchTexture(), 200, true);
  const shockwaves = createGroundMarks(ringTexture(), 64, false);
  group.add(scorches.mesh, shockwaves.mesh, smoke.points, fire.points);

  const ground = (x, z) => getHeight(terrain, x, z);
  const C = (hex) => new THREE.Color(hex);
  const FLASH = C(0xfff4d6);
  const FIRE_HOT = C(0xffd27a);
  const FIRE_COOL = C(0xa8240a);
  const SPARK = C(0xffe9a8);
  const SPARK_END = C(0xff5a00);
  const SMOKE = C(0x3b3631);
  const SMOKE_END = C(0x77716a);
  const DUST = C(0x6b5b48);
  const DUST_END = C(0x8a7c69);
  /** Brännmärkets täckning (bara röd kanal används: 0–1). */
  const SCORCH = new THREE.Color(0.85, 0, 0);
  const SHOCK = C(0xffb46a);

  /**
   * Explosion med storleken `s` (ungefär radien i rutor) vid (x, z).
   * `dusty`: artillerinedslag i marken (dammigt i stället för svart rök).
   */
  function explode(x, z, s, { dusty = false, long = false } = {}) {
    const y = ground(x, z);
    fire.spawn({ x, y: y + 0.4 * s, z, color: FLASH, from: 1.8 * s, to: 3.4 * s, life: 0.14, alpha: 1 });
    const fireballs = Math.round(4 + s * 3);
    for (let i = 0; i < fireballs; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = rand(0.6, 2.2) * s;
      fire.spawn({
        x: x + Math.cos(a) * 0.25 * s, y: y + rand(0.2, 0.6) * s, z: z + Math.sin(a) * 0.25 * s,
        vx: Math.cos(a) * out, vy: rand(0.8, 2.4) * s, vz: Math.sin(a) * out, drag: 3,
        color: FIRE_HOT, endColor: FIRE_COOL, from: rand(0.7, 1.1) * s, to: rand(1.6, 2.6) * s,
        life: rand(0.35, 0.65) * (long ? 1.4 : 1), alpha: 0.9, delay: rand(0, 0.08), fadePower: 1.5,
      });
    }
    const sparks = Math.round(6 + s * 6);
    for (let i = 0; i < sparks; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = rand(3, 8) * Math.sqrt(s);
      fire.spawn({
        x, y: y + 0.4, z,
        vx: Math.cos(a) * speed, vy: rand(2.5, 7) * Math.sqrt(s), vz: Math.sin(a) * speed, gravity: -14, drag: 0.6,
        color: SPARK, endColor: SPARK_END, from: 0.22, to: 0.1, life: rand(0.45, 0.9), alpha: 1,
      });
    }
    const puffs = Math.round(3 + s * 3);
    for (let i = 0; i < puffs; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = rand(0.2, 0.9) * s;
      smoke.spawn({
        x: x + Math.cos(a) * 0.3 * s, y: y + rand(0.6, 1.1) * s, z: z + Math.sin(a) * 0.3 * s,
        vx: Math.cos(a) * out, vy: rand(0.6, 1.3) * (dusty ? 0.6 : 1), vz: Math.sin(a) * out, drag: 1.2,
        color: dusty ? DUST : SMOKE, endColor: dusty ? DUST_END : SMOKE_END,
        from: rand(0.7, 1.0) * s, to: rand(1.8, 2.6) * s, life: rand(1.4, 2.4) * (long ? 1.6 : 1),
        alpha: dusty ? 0.4 : 0.5, delay: rand(0.05, 0.2), fadePower: 0.8,
      });
    }
    shockwaves.spawn({ x, y: y + 0.06, z, color: SHOCK, from: 0.4 * s, to: 4.2 * s, life: 0.35 });
    scorches.spawn({ x, y: y + 0.03, z, color: SCORCH, from: 1.4 * s, to: 1.6 * s, life: long ? 14 : 8, hold: 0.6 });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tint = new THREE.Color();

  function place(mesh, i, s, color) {
    m.compose(pos, q, scale.setScalar(s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color);
  }

  return {
    group,

    /** Skapar effekter för händelser från simuleringen. */
    handleEvents(events) {
      for (const ev of events) {
        const color = OWNER_COLORS[ev.owner] ?? DEFAULT_COLOR;
        const y = ground(ev.x, ev.z);
        if (ev.type === 'fire') {
          fire.spawn({ x: ev.x, y: y + ev.y, z: ev.z, color: tint.copy(color).lerp(WHITE, 0.5).clone(), from: 0.7, to: 1.1, life: 0.08 });
        } else if ((ev.type === 'hit' || ev.type === 'miss') && ev.ballistic) {
          explode(ev.x, ev.z, 0.55, { dusty: true });
        } else if (ev.type === 'hit') {
          // Gnistor i lagfärg där skottet träffar.
          fire.spawn({ x: ev.x, y: y + ev.y, z: ev.z, color, from: 0.5, to: 1.2, life: 0.16 });
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            fire.spawn({
              x: ev.x, y: y + ev.y, z: ev.z, vx: Math.cos(a) * rand(2, 4), vy: rand(1, 3), vz: Math.sin(a) * rand(2, 4),
              gravity: -10, color: SPARK, endColor: color, from: 0.16, to: 0.08, life: rand(0.2, 0.35),
            });
          }
        } else if (ev.type === 'death') {
          const structure = ev.kind === 'structure';
          const s = Math.max(0.55, (ev.size ?? 0.6) * (structure ? 1 : 1.1));
          explode(ev.x, ev.z, s, { long: structure });
        }
      }
    },

    update(world, alpha, frameSeconds) {
      const counts = { orb: 0, beam: 0, shell: 0 };
      trailTimer += frameSeconds;
      const emitTrail = trailTimer >= 0.04;
      if (emitTrail) trailTimer = 0;
      for (const p of world.projectiles) {
        const x = p.prevX + (p.x - p.prevX) * alpha;
        const z = p.prevZ + (p.z - p.prevZ) * alpha;
        q.setFromAxisAngle(up, Math.atan2(p.tx - p.prevX, p.tz - p.prevZ));
        let y = ground(x, z) + p.y;
        const color = OWNER_COLORS[p.owner] ?? DEFAULT_COLOR;
        if (p.ballistic) {
          // Artillerigranater flyger i en båge: högst mitt på vägen.
          const total = Math.hypot(p.tx - p.sx, p.tz - p.sz) || 1;
          const t = Math.min(1, Math.hypot(x - p.sx, z - p.sz) / total);
          y += 4 * (total * 0.35) * t * (1 - t);
          if (counts.shell < 256) {
            pos.set(x, y, z);
            place(shells, counts.shell++, 1, shellCore.copy(color).lerp(WHITE, 0.35));
          }
          if (emitTrail) {
            fire.spawn({ x, y, z, color, from: 0.7, to: 0.3, life: 0.25 });
            smoke.spawn({ x, y, z, vy: 0.3, color: SMOKE_END, from: 0.3, to: 0.9, life: 0.7, alpha: 0.5 });
          }
          continue;
        }
        const style = PROJECTILE_STYLES[p.source] ?? defaultStyle(p.owner);
        pos.set(x, y, z);
        if (style.kind === 'orb' && counts.orb < capacity) {
          const i = counts.orb++;
          place(orbCore, i, style.scale, tint.copy(color).lerp(WHITE, 0.65));
          place(orbHalo, i, style.scale, color);
          place(orbTail, i, style.scale, color);
        } else if (style.kind === 'beam' && counts.beam < capacity) {
          const i = counts.beam++;
          place(beamCore, i, style.scale, tint.copy(color).lerp(WHITE, 0.55));
          place(beamHalo, i, style.scale, color);
        }
      }
      for (const [mesh, n] of [[orbCore, counts.orb], [orbHalo, counts.orb], [orbTail, counts.orb],
        [beamCore, counts.beam], [beamHalo, counts.beam], [shells, counts.shell]]) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }

      fire.update(frameSeconds);
      smoke.update(frameSeconds);
      scorches.update(frameSeconds);
      shockwaves.update(frameSeconds);
    },
  };
}
