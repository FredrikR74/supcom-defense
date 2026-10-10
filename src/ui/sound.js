/**
 * Syntetiserat ljud (Web Audio, inga ljudfiler): skott, träffar och explosioner,
 * och talsyntes för meddelanden som "Construction complete". Ljud längre från
 * kamerans mittpunkt blir svagare. M slår av och på.
 */
const SHOTS_PER_SECOND = 14;
const HEARING_DISTANCE = 90;

export function createSound() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;
  let shotBudget = SHOTS_PER_SECOND;
  let lastRefill = 0;
  const lastSpoken = new Map();

  /** Måste anropas från en användarhandling (t.ex. Start-knappen) för att få spela ljud. */
  function init() {
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    // En sekund vitt brus att återanvända för explosioner.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function volumeAt(x, z, listener) {
    const d = Math.hypot(x - listener.x, z - listener.z);
    return Math.max(0, 1 - d / HEARING_DISTANCE);
  }

  /** Kort "pew": tonen sjunker snabbt. Plasma (UEF) ljusare än laser (Cybran). */
  function shot(owner, gain) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = owner === 1 ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(owner === 1 ? 900 : 600, t);
    osc.frequency.exponentialRampToValueAtTime(owner === 1 ? 180 : 140, t + 0.12);
    g.gain.setValueAtTime(0.12 * gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** Brus genom ett lågpassfilter som stängs: större explosion = djupare och längre. */
  function explosion(size, gain) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800 / Math.max(1, size), t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 0.5 + size * 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6 * gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6 + size * 0.2);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + 1);
  }

  function speak(text) {
    if (muted || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (now - (lastSpoken.get(text) ?? -Infinity) < 3000) return;
    lastSpoken.set(text, now);
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 0.8;
    window.speechSynthesis.speak(u);
  }

  return {
    init,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (muted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      return muted;
    },

    /** Spelar ljud för simuleringens händelser. `listener` är kamerans mittpunkt {x, z}. */
    handleEvents(events, listener, playerId) {
      if (!ctx || muted) return;
      const now = performance.now();
      shotBudget = Math.min(SHOTS_PER_SECOND, shotBudget + ((now - lastRefill) / 1000) * SHOTS_PER_SECOND);
      lastRefill = now;
      for (const ev of events) {
        if (ev.type === 'built' && ev.owner === playerId) speak('Construction complete');
        else if (ev.type === 'acuDeath') speak('Commander down');
        else if (ev.type === 'acuRespawn') speak('Commander online');
        if (ev.x === undefined) continue;
        const gain = volumeAt(ev.x, ev.z, listener);
        if (gain <= 0) continue;
        if (ev.type === 'fire' && shotBudget >= 1) {
          shotBudget -= 1;
          shot(ev.owner, gain);
        } else if (ev.type === 'death') {
          explosion(ev.size ?? 1, gain);
        }
      }
    },
  };
}
