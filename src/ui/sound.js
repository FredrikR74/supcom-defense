/**
 * Ljud (Web Audio): skott, artillerinedslag och explosioner är inspelningar
 * från Freesound och Kenneys Sci-fi Sounds (public/sfx/, se CREDITS.txt), med
 * syntes som reserv om ett ljud inte kunnat laddas. Direktträffar som inte
 * dödar har inget ljud. Talade meddelanden som "Commander down" är inspelade
 * på engelska i public/voice/ (se scripts/generateVoice.ps1) och spelas genom
 * ett lätt radiofilter; saknas ett klipp används webbläsarens talsyntes.
 * M slår av och på.
 *
 * Varje ljud går genom en egen kedja: avståndsfilter (ljud långt bort blir
 * dovare, inte bara tystare) och stereo efter var det är i bild, och sedan till
 * en kanal med egen EQ (skott, explosioner) och en rumsklang. Varje
 * vapentyp har ett tak för samtidiga ljud, skott av samma typ nära varandra
 * slås ihop till salvor, och när många ljud spelas samtidigt sänks varje nytt
 * ljud mjukt (automatisk mixning). En limiter på slutet tar bara topparna.
 * Små slumpvariationer i tonhöjd och styrka gör att många likadana enheter
 * inte låter som en maskin.
 */
const HEARING_DISTANCE = 90;
/** Sidled (världsenheter från kamerans mitt) där ljudet ligger helt i en högtalare. */
const PAN_DISTANCE = 40;
/**
 * Högst så många ljud av varje slag per sekund, så att stora strider inte blir
 * gröt. Blir det fler väljs de som spelas slumpvis, så att inte alltid samma
 * enheter tystnar.
 */
const BUDGETS = { shot: 26, explosion: 10 };
/**
 * Automatisk mixning: `load` räknar hur många ljud som startat nyligen (avklingar
 * med tidskonstanten LOAD_SECONDS), och varje nytt ljud sänks med
 * 1 / sqrt(1 + load / LOAD_KNEE). Då behöver limitern bara ta toppar och
 * pumpar inte hela mixen upp och ner i stora strider.
 */
/** Nivå för dödsexplosionen (uppmätt mot de andra ljuden, se sounds.html). */
const DEATH_LEVEL = 0.75;
const LOAD_SECONDS = 0.35;
const LOAD_KNEE = 2;

/**
 * Tak per ljudtyp, som FA:s ljudmotor: högst så många samtidiga ljud av varje
 * vapentyp (och av explosioner). Kommer ett till tonas det äldsta
 * snabbt ut. `seconds` är hur länge ett ljud räknas som pågående.
 */
const VOICE_LIMITS = {
  mantis: 4, hunter: 4, mole: 3, striker: 4, pointDefense: 3, acu: 2,
  medusa: 3, lobo: 3, mechMarine: 3, snoop: 2, archer: 3,
  pillar: 4, mongoose: 3, riptide: 3, flapjack: 2, skyBoxer: 3, pointDefenseT2: 3, artilleryT2: 2,
  rhino: 4, hoplite: 3, wagner: 3, viper: 2,
  explosion: 5,
};
const DEFAULT_VOICE_LIMIT = 2;
const VOICE_SECONDS = { shot: 0.35, explosion: 1.2 };
/**
 * Salvor: skjuter flera av samma typ inom VOLLEY_SECONDS och VOLLEY_DISTANCE
 * från varandra spelas ett enda ljud, som blir fylligare (upp till VOLLEY_MAX
 * gånger starkare) för varje skott som slås ihop med det.
 */
const VOLLEY_SECONDS = 0.06;
const VOLLEY_DISTANCE = 12;
const VOLLEY_MAX = 2;

/**
 * Ljudklipp i public/sfx/ (Kenney Sci-fi Sounds, CC0). Varje grupp har flera
 * varianter som väljs slumpvis; nivåerna normaliseras när de laddas.
 */
export const SAMPLE_SETS = {
  // Från Freesound (se public/sfx/CREDITS.txt)
  acuBlast: ['blast.ogg'],
  tankFire: ['tankFire.wav'],
  laserShot: ['laserShot.wav'],
  artilleryGun: ['artilleryGun.wav'],
  death: ['deathExplosion.wav'],
  // Kenney Sci-fi Sounds
  laserLarge: [0, 1, 2, 3, 4].map((i) => `laserLarge_00${i}`),
  impact: ['impactMetal_000', 'impactMetal_002', 'impactMetal_004'],
  explosion: ['explosionCrunch_000', 'explosionCrunch_002', 'explosionCrunch_003'],
  // För skott: bara explosionsklippen med fyllig bas (explosionCrunch_002 är
  // mest brus i början och lät "bara brus" som ACU-skott).
  cannon: ['explosionCrunch_000', 'explosionCrunch_003'],
  bigExplosion: ['explosionCrunch_001', 'explosionCrunch_004'],
  rumble: ['lowFrequency_explosion_000', 'lowFrequency_explosion_001'],
};
/** Normaliserad nivå (RMS) som alla klipp skalas till. */
const SAMPLE_RMS = 0.12;

/**
 * Skottljud i lager: klipp (`set`) och syntetiska lager (`synth`). ACU:n,
 * Strikers, Cybrans lasrar och artilleriet har egna klipp från Freesound;
 * övriga vapen bygger på Kenneys klipp. `rate` ändrar tonhöjd, `length`
 * kortar av klippet och `lowpass` tar bort det gälla. Saknas klippen används
 * syntesen.
 */
const SHOT_SAMPLES = {
  // Freesound-klippen (valda för respektive vapen)
  heavy: [{ set: 'acuBlast', rate: 1, level: 1 }],
  tank: [{ set: 'tankFire', rate: 1, level: 1, length: 1.2 }],
  laser: [{ set: 'laserShot', rate: 1, level: 1 }],
  artillery: [{ set: 'artilleryGun', rate: 1, level: 1, length: 1.4 }],
  // Kenney-klippen
  plasma: [
    { set: 'cannon', rate: 1.9, level: 0.4, length: 0.16 },
    { set: 'laserLarge', rate: 0.55, level: 0.12, length: 0.12, lowpass: 1800 },
  ],
  rifle: [{ set: 'cannon', rate: 2.4, level: 0.28, length: 0.07 }],
  flak: [
    { set: 'cannon', rate: 2.1, level: 0.3, length: 0.1 },
    { set: 'impact', rate: 0.8, level: 0.15, length: 0.1 },
  ],
};
/**
 * Hur länge ett skott räknas som pågående för taket per ljudtyp: klippen med
 * lång efterklang (tankskott, artilleri) räknas längre, så att taket håller.
 */
const SHOT_VOICE_SECONDS = { heavy: 0.8, tank: 1, artillery: 1, laser: 0.4 };

/** Repliker -> inspelade klipp i public/voice/. */
const VOICE_CLIPS = {
  'Commander down': 'commander-down.wav',
  'Commander online': 'commander-online.wav',
};

const rand = (min, max) => min + Math.random() * (max - min);

/** En blandad kopia av `list` (Fisher–Yates). */
function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Vilket ljud varje vapen gör (efter enhetstyp):
 * - heavy: ACU:ns kanon (mango777, "Blast")
 * - tank: Strikers kanon (GaryQ, "Tank fire Mixed")
 * - laser: Cybrans lasrar (djfroyd, "laser one-shot #1")
 * - artillery: Medusa och Lobo (InMotionAudio, 69th Field Artillery Gun)
 * - plasma: Point Defense, en kort smäll (Kenney)
 * - rifle: Mech Marines snabba knallar (Kenney)
 * - flak: luftvärnets torra smällar (Kenney)
 */
export const WEAPON_SOUNDS = {
  // Nivåerna är uppmätta (se sounds.html): explosioner starkast, sedan ACU:n
  // och artilleriet, sedan vanliga skott.
  striker: { kind: 'tank', pitch: 1, gain: 0.72 },
  pointDefense: { kind: 'plasma', pitch: 0.75, gain: 3.4 },
  acu: { kind: 'heavy', pitch: 1, gain: 0.73 },
  mantis: { kind: 'laser', pitch: 1, gain: 1.25 },
  mole: { kind: 'laser', pitch: 1.25, gain: 1 },
  hunter: { kind: 'laser', pitch: 1.2, gain: 1.3 },
  medusa: { kind: 'artillery', pitch: 1, gain: 0.7 },
  lobo: { kind: 'artillery', pitch: 1.15, gain: 0.78 },
  mechMarine: { kind: 'rifle', pitch: 1, gain: 4.9 },
  snoop: { kind: 'rifle', pitch: 1.3, gain: 2.8 },
  archer: { kind: 'flak', pitch: 1, gain: 4 },
  pillar: { kind: 'tank', pitch: 0.9, gain: 0.8 },
  mongoose: { kind: 'rifle', pitch: 0.85, gain: 4 },
  riptide: { kind: 'rifle', pitch: 0.7, gain: 4.5 },
  flapjack: { kind: 'artillery', pitch: 1.3, gain: 0.7 },
  skyBoxer: { kind: 'flak', pitch: 0.85, gain: 4 },
  pointDefenseT2: { kind: 'plasma', pitch: 0.6, gain: 3.4 },
  artilleryT2: { kind: 'artillery', pitch: 0.6, gain: 1 },
  rhino: { kind: 'laser', pitch: 0.8, gain: 1.4 },
  hoplite: { kind: 'artillery', pitch: 1.4, gain: 0.6 },
  wagner: { kind: 'laser', pitch: 0.7, gain: 1.4 },
  viper: { kind: 'artillery', pitch: 1.25, gain: 0.7 },
};

export function createSound() {
  let ctx = null;
  let master = null;
  let reverbSend = null;
  let noise = null;
  let muted = false;
  const budget = { ...BUDGETS };
  let lastRefill = 0;
  let load = 0;
  let loadTime = 0;
  /** Ljudtyp -> pågående ljud [{ start, end, gain, base, count, x, z }], äldst först. */
  const voices = new Map();
  /** Kanaler med egen EQ: skott och explosioner (se init). */
  const buses = {};
  /** Noder som ljudtestsidan kan läsa av (t.ex. limiterns dämpning). */
  const nodes = {};
  const lastSpoken = new Map();
  /** Replik -> avkodat klipp, när det har laddats. */
  const voiceBuffers = new Map();
  /** Grupp -> [{ buffer, norm }], när klippen har laddats. */
  const samples = new Map();

  /** Löses när ljudklippen har laddats (eller misslyckats). */
  let ready = Promise.resolve();

  /**
   * Måste anropas från en användarhandling (t.ex. Start-knappen) för att få
   * spela ljud. `context` kan vara en OfflineAudioContext för att mäta nivåer.
   */
  function init(context = null) {
    if (ctx) return;
    ctx = context ?? new AudioContext();
    // Limiter sist i kedjan.
    const limiter = ctx.createDynamicsCompressor();
    // Bara ett skydd mot toppar: hög tröskel, hårt förhållande, snabb återgång.
    limiter.threshold.value = -3;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    limiter.connect(ctx.destination);
    nodes.limiter = limiter;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(limiter);

    // Kanaler med egen EQ, så att skott och explosioner får varsin
    // plats i frekvensbilden i stället för att slåss om samma register:
    // - skott: utan djupbas, dämpad gäll diskant, lite lägre
    // - explosioner: basen och lite mindre diskant
    const chain = (level, filters) => {
      const input = ctx.createGain();
      input.gain.value = level;
      let node = input;
      for (const [type, frequency, gain = 0, q = 0.7] of filters) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = frequency;
        f.gain.value = gain;
        f.Q.value = q;
        node.connect(f);
        node = f;
      }
      node.connect(master);
      return input;
    };
    buses.shot = chain(1, [['highpass', 110], ['peaking', 3500, -4, 1], ['lowpass', 9000]]);
    buses.explosion = chain(1, [['lowshelf', 120, 3], ['highshelf', 4500, -3]]);

    // Rumsklang: impulssvar av avklingande stereobrus.
    const convolver = ctx.createConvolver();
    convolver.buffer = impulseResponse(1.6, 3);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.22;
    reverbSend.connect(convolver).connect(master);

    // Två sekunder vitt brus att återanvända.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const loading = [];
    for (const [set, names] of Object.entries(SAMPLE_SETS)) {
      loading.push(Promise.all(names.map((name) => fetch(`${import.meta.env.BASE_URL}sfx/${name.includes('.') ? name : `${name}.ogg`}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((buf) => ctx.decodeAudioData(buf))
        .then((buffer) => ({ buffer, norm: SAMPLE_RMS / rms(buffer) }))))
        .then((loaded) => samples.set(set, loaded))
        .catch(() => {})); // syntesen tar över
    }
    ready = Promise.all(loading);

    for (const [text, file] of Object.entries(VOICE_CLIPS)) {
      fetch(`${import.meta.env.BASE_URL}voice/${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((buf) => ctx.decodeAudioData(buf))
        .then((buffer) => voiceBuffers.set(text, buffer))
        .catch(() => {}); // talsyntesen tar över
    }
  }

  /** RMS över den hörbara delen av ett klipp. */
  function rms(buffer) {
    const d = buffer.getChannelData(0);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]) < 0.01) continue;
      sum += d[i] * d[i];
      n++;
    }
    return n ? Math.max(0.02, Math.sqrt(sum / n)) : 1;
  }

  /**
   * Spelar ett slumpvalt klipp ur gruppen `set` till `out`. `rate` ändrar
   * tonhöjd och längd, `length` (sekunder) kortar av klippet med en snabb
   * uttoning och `lowpass` (Hz) dämpar diskanten. Returnerar false om klippen
   * inte har laddats.
   */
  function playSample(set, out, t, { rate = 1, level = 1, length = null, lowpass = null }) {
    const list = samples.get(set);
    if (!list?.length) return false;
    const { buffer, norm } = list[Math.floor(Math.random() * list.length)];
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * rand(0.93, 1.07);
    const g = ctx.createGain();
    const peak = Math.min(4, norm) * level;
    g.gain.setValueAtTime(peak, t);
    const end = Math.min(buffer.duration / src.playbackRate.value, length ?? Infinity);
    if (length != null) {
      g.gain.setValueAtTime(peak, t + end * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + end);
    }
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      src.connect(f).connect(g);
    } else {
      src.connect(g);
    }
    g.connect(out);
    src.start(t);
    src.stop(t + end + 0.02);
    return true;
  }

  function impulseResponse(seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
    return buffer;
  }

  /** Spelar ett inspelat klipp genom ett radiofilter (bandpass och lite komprimering). */
  function playVoice(buffer) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 280;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4200;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 4;
    const g = ctx.createGain();
    g.gain.value = 2.2;
    src.connect(highpass).connect(lowpass).connect(compressor).connect(g).connect(master);
    src.start(t);
  }

  /**
   * Utgång för ett ljud vid (x, z): styrka, avståndsfilter och stereo efter
   * kamerans mittpunkt, eller null om det är för långt bort för att höras.
   */
  function output(x, z, listener, volume = 1, wet = 1, { bus = 'shot', key = null, volley = false, seconds = null } = {}) {
    const dx = x - listener.x;
    const d = Math.hypot(dx, z - listener.z);
    const near = 1 - d / HEARING_DISTANCE;
    if (near <= 0) return null;
    const now = ctx.currentTime;

    // Tak per ljudtyp och salvor.
    let list = null;
    if (key) {
      list = (voices.get(key) ?? []).filter((v) => v.end > now);
      voices.set(key, list);
      const last = list[list.length - 1];
      if (volley && last && now - last.start <= VOLLEY_SECONDS && Math.hypot(last.x - x, last.z - z) <= VOLLEY_DISTANCE) {
        last.count++;
        last.gain.gain.setTargetAtTime(last.base * Math.min(VOLLEY_MAX, Math.sqrt(last.count)), now, 0.01);
        return null; // slogs ihop med salvan
      }
      const limit = VOICE_LIMITS[key] ?? DEFAULT_VOICE_LIMIT;
      while (list.length >= limit) {
        const oldest = list.shift();
        oldest.gain.gain.cancelScheduledValues(now);
        oldest.gain.gain.setTargetAtTime(0, now, 0.012);
      }
    }

    // Automatisk mixning: ju fler ljud som startat nyss, desto lägre (se LOAD_KNEE).
    load = load * Math.exp(-(now - loadTime) / LOAD_SECONDS) + near * near;
    loadTime = now;
    const mix = 1 / Math.sqrt(1 + load / LOAD_KNEE);
    const gain = ctx.createGain();
    const base = near * near * volume * mix;
    gain.gain.value = base;
    if (list) {
      list.push({ start: now, end: now + (seconds ?? VOICE_SECONDS[bus] ?? 0.4), gain, base, count: 1, x, z });
    }
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 600 + 17000 * near * near * near;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, dx / PAN_DISTANCE)) * 0.85;
    gain.connect(muffle).connect(pan);
    pan.connect(buses[bus] ?? master);
    // Avlägsna ljud har mer klang i förhållande till direktljudet.
    const send = ctx.createGain();
    send.gain.value = wet * (0.5 + (1 - near));
    pan.connect(send).connect(reverbSend);
    return gain;
  }

  /** En ton som sveper från `from` till `to` Hz och klingar av på `length` sekunder. */
  function tone(out, t, { type, from, to, length, level, attack = 0.002 }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.02);
    return osc;
  }

  /** Filtrerat brus som klingar av; filtrets frekvens kan svepa från `from` till `to`. */
  function burst(out, t, { filter = 'lowpass', from, to = from, q = 0.7, length, level, attack = 0.002 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = rand(0.9, 1.1);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f).connect(g).connect(out);
    const offset = Math.random() * (noise.duration - length - 0.1);
    src.start(t, Math.max(0, offset));
    src.stop(t + length + 0.05);
  }

  /** Skott: ett ljud per vapentyp, med lite slumpvariation. */
  function shot(ev, listener) {
    const w = WEAPON_SOUNDS[ev.source] ?? { kind: ev.owner === 1 ? 'plasma' : 'laser', pitch: 1, gain: 0.8 };
    const out = output(ev.x, ev.z, listener, w.gain * rand(0.85, 1.1), 0.8,
      { bus: 'shot', key: ev.source ?? w.kind, volley: true, seconds: SHOT_VOICE_SECONDS[w.kind] });
    if (!out) return;
    const t = ctx.currentTime;
    const layers = SHOT_SAMPLES[w.kind] ?? [];
    let played = false;
    for (const layer of layers) {
      if (layer.set && playSample(layer.set, out, t, { ...layer, rate: layer.rate * w.pitch })) played = true;
    }
    if (played) {
      for (const layer of layers) if (layer.synth) synthLayer(layer.synth, out, t, w.pitch, layer.level);
      return;
    }
    const p = w.pitch * rand(0.92, 1.08);
    switch (w.kind) {
      case 'plasma':
        tone(out, t, { type: 'triangle', from: 820 * p, to: 140 * p, length: 0.16, level: 0.16 });
        tone(out, t, { type: 'square', from: 1600 * p, to: 400 * p, length: 0.05, level: 0.04 });
        burst(out, t, { filter: 'bandpass', from: 3000 * p, to: 900, q: 1.2, length: 0.06, level: 0.12 });
        break;
      case 'heavy':
        tone(out, t, { type: 'sine', from: 240 * p, to: 50, length: 0.35, level: 0.3 });
        tone(out, t, { type: 'triangle', from: 650 * p, to: 110, length: 0.2, level: 0.12 });
        burst(out, t, { from: 2500, to: 300, length: 0.22, level: 0.22 });
        break;
      case 'laser': {
        const osc = tone(out, t, { type: 'sawtooth', from: 1500 * p, to: 420 * p, length: 0.13, level: 0.07 });
        // Surr: snabb vibrato på lasern.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 55;
        const depth = ctx.createGain();
        depth.gain.value = 60 * p;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + 0.15);
        tone(out, t, { type: 'sine', from: 2400 * p, to: 1800 * p, length: 0.08, level: 0.04 });
        break;
      }
      case 'artillery':
        tone(out, t, { type: 'sine', from: 130 * p, to: 38, length: 0.45, level: 0.4 });
        burst(out, t, { from: 900, to: 120, length: 0.35, level: 0.3 });
        burst(out, t, { filter: 'highpass', from: 2500, length: 0.03, level: 0.1 });
        break;
      case 'rifle':
        burst(out, t, { filter: 'bandpass', from: 2200 * p, to: 1200, q: 1.5, length: 0.05, level: 0.25 });
        tone(out, t, { type: 'square', from: 300 * p, to: 120, length: 0.04, level: 0.05 });
        break;
      case 'flak':
        burst(out, t, { filter: 'bandpass', from: 1400 * p, to: 500, q: 2, length: 0.08, level: 0.25 });
        tone(out, t, { type: 'sine', from: 180 * p, to: 70, length: 0.08, level: 0.12 });
        break;
      default:
        break;
    }
  }

  /**
   * Syntetiska lager ovanpå klippen. thump: en duns i mellanregistret som hörs
   * även i små högtalare.
   */
  function synthLayer(kind, out, t, pitch, level) {
    if (kind === 'thump') {
      tone(out, t, { type: 'sine', from: 210 * pitch, to: 70, length: 0.3, level: 0.5 * level });
      burst(out, t, { from: 1400, to: 200, length: 0.25, level: 0.35 * level });
    }
  }

  /** Artillerigranat som slår ner (Kenneys korta explosioner). */
  function impact(ev, listener) {
    explosion({ ...ev, size: 0.5 }, listener, 1.5, 'explosion');
  }

  /**
   * Explosion i lager: en skarp smäll, en djup basduns, ett brusande efterljud
   * som stängs, och knaster av skräp. Byggnader smäller större och längre.
   */
  function explosion(ev, listener, volume = 1, clip = 'death') {
    const size = Math.max(0.3, ev.size ?? 1) * (ev.kind === 'structure' ? 1.8 : 1);
    const out = output(ev.x, ev.z, listener, volume * rand(0.85, 1.1) * Math.min(1.6, 0.7 + size * 0.4), 1.4,
      { bus: 'explosion', key: 'explosion' });
    if (!out) return;
    const t = ctx.currentTime;
    const big = size >= 1.5;
    // Större explosioner spelas långsammare (djupare); byggnader får ett muller under.
    const rate = Math.max(0.6, 1.25 - size * 0.25);
    // Dödsexplosionen (JohanDeecke) för enheter och byggnader; artillerigranater
    // har Kenneys kortare explosioner.
    const set = clip === 'death' ? 'death' : big ? 'bigExplosion' : 'explosion';
    if (playSample(set, out, t, { rate, level: clip === 'death' ? DEATH_LEVEL : 0.9 })) {
      if (big) playSample('rumble', out, t, { rate: 0.9, level: 0.9 });
      return;
    }
    const len = 0.5 + size * 0.35;
    const p = rand(0.85, 1.15);
    // Smäll
    burst(out, t, { filter: 'highpass', from: 1500, length: 0.06, level: 0.5 });
    // Basduns
    tone(out, t, { type: 'sine', from: 110 * p / Math.sqrt(size), to: 28, length: len * 0.8, level: 0.7 });
    // Efterljud: filtret stängs
    burst(out, t, { from: 2600 * p / Math.sqrt(size), to: 70, length: len, level: 0.55, attack: 0.01 });
    // Skräp som faller
    const debris = Math.round(3 + size * 4);
    for (let i = 0; i < debris; i++) {
      const at = t + rand(0.08, len * 0.9);
      burst(out, at, { filter: 'bandpass', from: rand(1500, 4500), q: 3, length: rand(0.02, 0.05), level: rand(0.04, 0.1) });
    }
  }

  function speak(text) {
    if (muted) return;
    const now = performance.now();
    if (now - (lastSpoken.get(text) ?? -Infinity) < 3000) return;
    lastSpoken.set(text, now);
    const buffer = voiceBuffers.get(text);
    if (buffer && ctx) {
      playVoice(buffer);
      return;
    }
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    // Alltid engelska, även när systemet är på ett annat språk.
    u.lang = 'en-US';
    const voice = englishVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = 0.95;
    u.pitch = 0.9;
    window.speechSynthesis.speak(u);
  }

  /** Tar ett ljud ur budgeten för slaget `kind`, om det finns något kvar. */
  function take(kind) {
    if (budget[kind] < 1) return false;
    budget[kind] -= 1;
    return true;
  }

  return {
    init,
    get ready() { return ready; },
    get nodes() { return nodes; },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (muted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      return muted;
    },

    /** Spelar ett klipp ur public/sfx/ som det är (för ljudtestsidan). */
    playClip(name) {
      if (!ctx) return;
      for (const [set, names] of Object.entries(SAMPLE_SETS)) {
        const i = names.indexOf(name);
        const entry = samples.get(set)?.[i];
        if (!entry) continue;
        const src = ctx.createBufferSource();
        src.buffer = entry.buffer;
        const g = ctx.createGain();
        g.gain.value = Math.min(4, entry.norm) * 0.6;
        src.connect(g).connect(master);
        src.start();
        return;
      }
    },
    /** Spelar en talad replik (för ljudtestsidan). */
    say(text) {
      lastSpoken.delete(text);
      speak(text);
    },

    /** Spelar ljud för simuleringens händelser. `listener` är kamerans mittpunkt {x, z}. */
    handleEvents(events, listener) {
      if (!ctx || muted) return;
      // Ljudklockan, inte väggklockan: stämmer även vid offline-rendering.
      const now = ctx.currentTime;
      const dt = Math.max(0, now - lastRefill);
      lastRefill = now;
      for (const kind of Object.keys(BUDGETS)) budget[kind] = Math.min(BUDGETS[kind], budget[kind] + dt * BUDGETS[kind]);
      // Blanda ordningen så att budgeten inte alltid går till samma enheter.
      const list = events.length > 1 ? shuffled(events) : events;
      for (const ev of list) {
        if (ev.type === 'acuDeath') speak('Commander down');
        else if (ev.type === 'acuRespawn') speak('Commander online');
        if (ev.x === undefined) continue;
        if (ev.type === 'fire') {
          if (take('shot')) shot(ev, listener);
        } else if ((ev.type === 'hit' || ev.type === 'miss') && ev.ballistic) {
          // Bara artillerigranater som slår ner hörs; direktträffar har inget ljud.
          if (take('explosion')) impact(ev, listener);
        } else if (ev.type === 'death') {
          if (take('explosion')) explosion(ev, listener);
        }
      }
    },
  };
}

/** Föredragna röster, bäst först: naturliga manliga röster låter mest som FA:s annonsör. */
const PREFERRED_VOICES = [/natural.*(guy|ryan|davis|andrew|christopher|eric)/i, /natural/i,
  /google uk english male/i, /(david|mark|george|daniel|alex)/i, /google us english/i];

let cachedVoice = null;

/** En engelsk röst för talade meddelanden, eller null om webbläsaren inte har någon. */
function englishVoice() {
  if (cachedVoice) return cachedVoice;
  const english = window.speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  if (english.length === 0) return null; // rösterna laddas asynkront; försök igen nästa gång
  for (const pattern of PREFERRED_VOICES) {
    const match = english.find((v) => pattern.test(v.name));
    if (match) return (cachedVoice = match);
  }
  return (cachedVoice = english.find((v) => /en[-_](us|gb)/i.test(v.lang)) ?? english[0]);
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // Börja ladda rösterna direkt så att den första repliken redan får rätt röst.
  window.speechSynthesis.getVoices();
}
