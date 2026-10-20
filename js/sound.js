/* Synthesised key sounds — no samples. The timbre follows the switch type and which foams are in.
   down(): bottom-out "thock/clack"; up(): softer top-out. */
export function createSound() {
  let ctx = null, master = null, noise = null;
  const state = { on: false, type: 'linear', foam: { plateFoam: 1, pe: 1, caseFoam: 1 } };

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 0.5, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = b;
  }

  function burst(t, { f, q = 1, type = 'bandpass', gain = 1, dur = 0.05, attack = 0.001 }) {
    const src = ctx.createBufferSource(); src.buffer = noise; src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(master); src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
  }
  function tone(t, { f, f1 = f, gain = 0.5, dur = 0.08, type = 'sine' }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function down(big = false) {
    if (!state.on || !ctx) return;
    const t = ctx.currentTime + 0.002, { plateFoam, pe, caseFoam } = state.foam;
    const damping = (plateFoam + caseFoam) / 2;            // 0 = hollow, 1 = fully dampened
    const j = 0.92 + Math.random() * 0.16;
    // clicky jacket / tactile bump fire a little before bottom-out
    if (state.type === 'clicky') burst(t, { f: 4200 * j, q: 2.5, gain: 0.9, dur: 0.018 });
    if (state.type === 'tactile') burst(t, { f: 1600 * j, q: 1.2, gain: 0.25, dur: 0.02 });
    const tb = t + (state.type === 'linear' ? 0 : 0.012);
    // bottom-out: body noise — PE foam pushes it up and makes it "poppy"
    const body = (big ? 900 : 1300) * (1 - 0.35 * damping) * (1 + 0.45 * pe) * j;
    burst(tb, { f: body, q: 0.9 + pe * 1.6, gain: 1.1, dur: 0.045 + 0.02 * (1 - damping) });
    // low thock from the case
    tone(tb, { f: (big ? 150 : 210) * j, f1: 90, gain: 0.55 + 0.25 * damping, dur: 0.07 });
    // hollow case ping + plate ring when the foams are out
    if (caseFoam < 0.5) { tone(tb, { f: 520 * j, gain: 0.18, dur: 0.22, type: 'triangle' }); burst(tb, { f: 380, q: 6, gain: 0.5, dur: 0.16 }); }
    if (plateFoam < 0.5) tone(tb, { f: 3100 * j, gain: 0.05, dur: 0.18 });
    if (big) burst(tb + 0.006, { f: 5200, q: 4, gain: 0.12 * (1 - damping * 0.7), dur: 0.05 }); // stabilizer wire rattle
  }
  function up() {
    if (!state.on || !ctx) return;
    const t = ctx.currentTime + 0.002, j = 0.9 + Math.random() * 0.2;
    burst(t, { f: 2200 * j * (1 + 0.3 * state.foam.pe), q: 1.4, gain: state.type === 'clicky' ? 0.5 : 0.28, dur: 0.025 });
  }

  return {
    state,
    enable(on) { state.on = on; if (on) { init(); ctx.resume(); } },
    down, up,
  };
}
