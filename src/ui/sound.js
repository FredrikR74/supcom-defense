/**
 * Ljud (Web Audio): skott, träffar och explosioner är inspelningar ur Kenneys
 * Sci-fi Sounds (CC0, public/sfx/), med syntes som reserv om ett ljud inte
 * kunnat laddas (t.ex. webbläsare utan Ogg Vorbis). Talade
 * meddelanden som "Commander down" är inspelade på engelska i
 * public/voice/ (se scripts/generateVoice.ps1) och spelas genom ett lätt
 * radiofilter; saknas ett klipp används webbläsarens talsyntes. M slår av och på.
 *
 * Varje ljud går genom en egen kedja: avståndsfilter (ljud långt bort blir
 * dovare, inte bara tystare) och stereo efter var det är i bild, och sedan till
 * både en torr buss och en rumsklang. En limiter på slutet hindrar stora
 * strider från att spricka. Små slumpvariationer i tonhöjd och styrka gör att
 * många likadana enheter inte låter som en maskin.
 */
const HEARING_DISTANCE = 90;
/** Sidled (världsenheter från kamerans mitt) där ljudet ligger helt i en högtalare. */
const PAN_DISTANCE = 40;
/** Högst så många ljud av varje slag per sekund, så att stora strider inte blir gröt. */
const BUDGETS = { shot: 16, hit: 10, explosion: 8 };

/**
 * Ljudklipp i public/sfx/ (Kenney Sci-fi Sounds, CC0). Varje grupp har flera
 * varianter som väljs slumpvis; nivåerna normaliseras när de laddas.
 */
export const SAMPLE_SETS = {
  laserSmall: ['laserSmall_004'],
  laserLarge: [0, 1, 2, 3, 4].map((i) => `laserLarge_00${i}`),
  impact: ['impactMetal_000', 'impactMetal_002', 'impactMetal_004'],
  explosion: ['explosionCrunch_000', 'explosionCrunch_002', 'explosionCrunch_003'],
  bigExplosion: ['explosionCrunch_001', 'explosionCrunch_004'],
  rumble: ['lowFrequency_explosion_000', 'lowFrequency_explosion_001'],
};
/** Normaliserad nivå (RMS) som alla klipp skalas till. */
const SAMPLE_RMS = 0.12;

/**
 * Skottljud i lager: klipp (`set`) och syntetiska lager (`synth`). De flesta av
 * Kenneys lasrar är för tecknade, så kanonerna byggs av korta uppväxlade bitar
 * av explosionerna (mer smäll än "pew"). Cybrans vapen använder den djupaste
 * lasern (laserSmall_004) som den är. `rate` ändrar
 * tonhöjd, `length` kortar av klippet och `lowpass` tar bort det gälla.
 * Mullerklippet är nästan bara bas under 60 Hz och hörs dåligt i vanliga
 * högtalare, så artilleriet har en duns i mellanregistret ovanpå.
 * Saknas klippen används syntesen.
 */
const SHOT_SAMPLES = {
  plasma: [
    { set: 'explosion', rate: 1.9, level: 0.4, length: 0.16 },
    { set: 'laserLarge', rate: 0.55, level: 0.12, length: 0.12, lowpass: 1800 },
  ],
  heavy: [
    { set: 'explosion', rate: 1.35, level: 0.6, length: 0.3 },
    { set: 'rumble', rate: 1.5, level: 0.45, length: 0.35 },
  ],
  laser: [{ set: 'laserSmall', rate: 1, level: 0.8 }],
  artillery: [
    { set: 'explosion', rate: 1.1, level: 0.9, length: 0.35 },
    { set: 'rumble', rate: 1.3, level: 0.7, length: 0.5 },
    { synth: 'thump', level: 1 },
  ],
  rifle: [{ set: 'explosion', rate: 2.4, level: 0.28, length: 0.07 }],
  flak: [
    { set: 'explosion', rate: 2.1, level: 0.3, length: 0.1 },
    { set: 'impact', rate: 0.8, level: 0.15, length: 0.1 },
  ],
};

/** Repliker -> inspelade klipp i public/voice/. */
const VOICE_CLIPS = {
  'Commander down': 'commander-down.wav',
  'Commander online': 'commander-online.wav',
};

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * Vilket ljud varje vapen gör (efter enhetstyp):
 * - plasma: UEF:s plasmakanoner, en kort ljus smäll med en sjunkande ton
 * - heavy: ACU:ns kanon, tyngre med bas
 * - laser: Cybrans lasrar (laserSmall_004)
 * - artillery: en djup duns (granaten låter när den slår ner)
 * - rifle: Mech Marines snabba knallar
 * - flak: luftvärnets torra smällar
 */
export const WEAPON_SOUNDS = {
  // Nivåerna är uppmätta (se sounds.html): explosioner starkast, sedan ACU:n
  // och artilleriet, sedan vanliga skott och träffar.
  striker: { kind: 'plasma', pitch: 1, gain: 2.7 },
  pointDefense: { kind: 'plasma', pitch: 0.75, gain: 3.4 },
  acu: { kind: 'heavy', pitch: 1, gain: 1.1 },
  mantis: { kind: 'laser', pitch: 1, gain: 2.5 },
  mole: { kind: 'laser', pitch: 1.25, gain: 1.7 },
  hunter: { kind: 'laser', pitch: 1.2, gain: 2 },
  medusa: { kind: 'artillery', pitch: 1, gain: 0.6 },
  lobo: { kind: 'artillery', pitch: 1.15, gain: 0.65 },
  mechMarine: { kind: 'rifle', pitch: 1, gain: 4.9 },
  snoop: { kind: 'rifle', pitch: 1.3, gain: 2.8 },
  archer: { kind: 'flak', pitch: 1, gain: 4 },
};

export function createSound() {
  let ctx = null;
  let master = null;
  let reverbSend = null;
  let noise = null;
  let muted = false;
  const budget = { ...BUDGETS };
  let lastRefill = 0;
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
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(limiter);

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
      loading.push(Promise.all(names.map((name) => fetch(`${import.meta.env.BASE_URL}sfx/${name}.ogg`)
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
  function output(x, z, listener, volume = 1, wet = 1) {
    const dx = x - listener.x;
    const d = Math.hypot(dx, z - listener.z);
    const near = 1 - d / HEARING_DISTANCE;
    if (near <= 0) return null;
    const gain = ctx.createGain();
    gain.gain.value = near * near * volume;
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 600 + 17000 * near * near * near;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, dx / PAN_DISTANCE)) * 0.85;
    gain.connect(muffle).connect(pan);
    pan.connect(master);
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
    const out = output(ev.x, ev.z, listener, w.gain * rand(0.85, 1.1), 0.8);
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

  /** Träff: ett kort metalliskt klick, eller ett artillerinedslag. */
  function impact(ev, listener) {
    if (ev.ballistic) {
      explosion({ ...ev, size: 0.5 }, listener, 1.5);
      return;
    }
    if (ev.type !== 'hit') return; // direktskott som missar hörs inte
    const out = output(ev.x, ev.z, listener, rand(0.85, 1), 0.6);
    if (!out) return;
    const t = ctx.currentTime;
    if (playSample('impact', out, t, { rate: rand(1, 1.3), level: 1.7, length: 0.25 })) {
      playSample('explosion', out, t, { rate: 3, level: 0.55, length: 0.05 });
      return;
    }
    const p = rand(0.85, 1.15);
    burst(out, t, { filter: 'bandpass', from: 3200 * p, to: 1500, q: 2, length: 0.07, level: 0.12 });
    tone(out, t, { type: 'sine', from: 1900 * p, to: 1250 * p, length: 0.09, level: 0.035 });
  }

  /**
   * Explosion i lager: en skarp smäll, en djup basduns, ett brusande efterljud
   * som stängs, och knaster av skräp. Byggnader smäller större och längre.
   */
  function explosion(ev, listener, volume = 1) {
    const size = Math.max(0.3, ev.size ?? 1) * (ev.kind === 'structure' ? 1.8 : 1);
    const out = output(ev.x, ev.z, listener, volume * rand(0.85, 1.1) * Math.min(1.6, 0.7 + size * 0.4), 1.4);
    if (!out) return;
    const t = ctx.currentTime;
    const big = size >= 1.5;
    // Större explosioner spelas långsammare (djupare); byggnader får ett muller under.
    const rate = Math.max(0.6, 1.25 - size * 0.25);
    if (playSample(big ? 'bigExplosion' : 'explosion', out, t, { rate, level: 0.9 })) {
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
      const now = performance.now();
      const dt = (now - lastRefill) / 1000;
      lastRefill = now;
      for (const kind of Object.keys(BUDGETS)) budget[kind] = Math.min(BUDGETS[kind], budget[kind] + dt * BUDGETS[kind]);
      for (const ev of events) {
        if (ev.type === 'acuDeath') speak('Commander down');
        else if (ev.type === 'acuRespawn') speak('Commander online');
        if (ev.x === undefined) continue;
        if (ev.type === 'fire') {
          if (take('shot')) shot(ev, listener);
        } else if (ev.type === 'hit' || ev.type === 'miss') {
          if (ev.ballistic ? take('explosion') : take('hit')) impact(ev, listener);
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
