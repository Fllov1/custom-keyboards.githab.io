import * as THREE from 'three';

/* Per-key RGB effects. Every frame fills `colors` (linear RGB, 0..1, 3 floats per key).
   Order of keys = the LED chain order (snake through the rows), which is also how the data travels. */
export const RGB_MODES = {
  rainbow: 'Веселка',
  reactive: 'Реакція',
  breathing: 'Дихання',
  static: 'Статичний',
  off: 'Вимк.',
};

export function createRgb(keys) {
  const n = keys.length;
  const colors = new Float32Array(n * 3);
  const energy = new Float32Array(n);
  const state = { mode: 'rainbow', color: [255, 60, 180], bright: 1 };
  const ripples = [];
  const c = new THREE.Color(), base = new THREE.Color();
  // chain order: row 0 left→right, row 1 right→left, …
  const chain = keys.slice().sort((a, b) => a.row - b.row || (a.row % 2 ? b.x - a.x : a.x - b.x));
  chain.forEach((k, i) => { k.chainIdx = i; });
  const idx = new Map(keys.map((k, i) => [k, i]));
  let chainPos = 0;

  function onPress(k) { ripples.push({ x: k.x, z: k.z, t: 0, hue: Math.random() }); energy[idx.get(k)] = 1; if (ripples.length > 12) ripples.shift(); }

  /** chain: 0..1 — "data in flight" demo: LEDs latch their colour one by one as the packet passes */
  function update(dt, t, chainMode) {
    for (const r of ripples) r.t += dt;
    while (ripples.length && ripples[0].t > 2) ripples.shift();
    if (chainMode > 0.5) { chainPos += dt * 16; if (chainPos > n + 24) chainPos = 0; }
    else chainPos = n + 24;
    keys.forEach((k, i) => {
      const xn = (k.x + 1.45) / 2.9;
      switch (state.mode) {
        case 'rainbow': c.setHSL((xn * 0.85 - t * 0.12) % 1 + 1, 1, 0.5, THREE.SRGBColorSpace); break;
        case 'breathing': { const b = 0.15 + 0.85 * (0.5 - 0.5 * Math.cos(t * 1.6)); c.setHSL((t * 0.03) % 1, 1, 0.5, THREE.SRGBColorSpace).multiplyScalar(b); break; }
        case 'static': c.setRGB(state.color[0] / 255, state.color[1] / 255, state.color[2] / 255, THREE.SRGBColorSpace); break;
        case 'reactive': {
          let e = energy[i] *= Math.exp(-dt * 3), hue = 0.6;
          for (const r of ripples) {
            const d = Math.hypot(k.x - r.x, (k.z - r.z) * 1.2), front = r.t * 2.2;
            const w = Math.exp(-((d - front) ** 2) / 0.012) * Math.max(0, 1 - r.t / 1.4);
            if (w > e) { e = w; hue = r.hue; }
          }
          c.setHSL(hue, 1, 0.5, THREE.SRGBColorSpace).multiplyScalar(e); base.setRGB(0.012, 0.016, 0.04); c.add(base);
          break;
        }
        default: c.setRGB(0, 0, 0);
      }
      if (chainMode > 0.5) { // not yet reached by the data packet → dark
        const lit = k.chainIdx < chainPos;
        if (!lit) c.setRGB(0.01, 0.01, 0.015);
        else if (k.chainIdx > chainPos - 1.5) c.setRGB(1, 1, 1); // the LED that just took its 24 bits flashes white
      }
      c.multiplyScalar(state.bright);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    });
  }
  return { colors, state, update, onPress, chain, get chainPos() { return chainPos; } };
}
