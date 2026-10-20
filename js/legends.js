import * as THREE from 'three';

/* Keycap legends + line-art, drawn into one atlas.
   Channels are masks: R = main legend, G = accent (pink) legend, B = decorative line-art.
   Each key gets a tile with its own aspect (u × 1), so wide keys keep their detail. */

const CYR = { KeyQ: 'Й', KeyW: 'Ц', KeyE: 'У', KeyR: 'К', KeyT: 'Е', KeyY: 'Н', KeyU: 'Г', KeyI: 'Ш', KeyO: 'Щ', KeyP: 'З', BracketLeft: 'Х', BracketRight: 'Ї', Backslash: 'Ґ',
  KeyA: 'Ф', KeyS: 'І', KeyD: 'В', KeyF: 'А', KeyG: 'П', KeyH: 'Р', KeyJ: 'О', KeyK: 'Л', KeyL: 'Д', Semicolon: 'Ж', Quote: 'Є',
  KeyZ: 'Я', KeyX: 'Ч', KeyC: 'С', KeyV: 'М', KeyB: 'И', KeyN: 'Т', KeyM: 'Ь', Comma: 'Б', Period: 'Ю', Slash: '.' };
const DUAL = { Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'], Digit5: ['5', '%'], Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('], Digit0: ['0', ')'],
  Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'], Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'] };
export const PINK = new Set(['Digit5', 'Digit6', 'Digit7', 'Digit8', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyG', 'KeyH', 'KeyJ', 'KeyB', 'KeyN', 'KeyM']);

const H = 160; // tile height in px = 1u of key depth (top face)
const R = 'rgb(255,0,0)', G = 'rgb(0,255,0)', B = 'rgb(0,0,255)';

function draw(g, code, w) {
  const main = PINK.has(code) ? G : R;
  const text = (s, x, y, size, col = main, weight = 600, font = 'Manrope') => { g.fillStyle = col; g.font = `${weight} ${size}px ${font}, sans-serif`; g.fillText(s, x, y); };
  const line = (pts, col = B, lw = 2) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
  const circle = (x, y, r, col = B, lw = 2, fill = false) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = col; g.fill(); } else { g.strokeStyle = col; g.lineWidth = lw; g.stroke(); } };
  const micro = (lines, x, y, size = 9, col = B) => { g.fillStyle = col; g.font = `500 ${size}px "JetBrains Mono", monospace`; lines.forEach((l, i) => g.fillText(l, x, y + i * size * 1.35)); };
  const node = (x, y) => circle(x, y, 3.2, B, 0, true);
  g.textBaseline = 'alphabetic';

  const L = code.startsWith('Key') ? code.slice(3) : null;
  if (L) {
    text(L, 18, 62, 44);
    if (CYR[code]) text(CYR[code], w - 52, 132, 34, main, 500);
    if (code === 'KeyF' || code === 'KeyJ') line([[18, 80], [50, 80]], main, 4); // homing bar
    return;
  }
  if (DUAL[code]) {
    const [a, b] = DUAL[code];
    text(a, 18, 62, 40); text(b, 62, 62, 30, main, 500);
    if (CYR[code]) text(CYR[code], w - 52, 132, 34, main, 500);
    return;
  }
  switch (code) {
    case 'Escape': { // orbit emblem
      const cx = w / 2, cy = 80;
      circle(cx, cy, 40, B, 2.5); circle(cx, cy, 26, B, 2);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; line([[cx + Math.cos(a) * 26, cy + Math.sin(a) * 26], [cx + Math.cos(a) * 52, cy + Math.sin(a) * 52]], B, 2); }
      circle(cx, cy, 8, R, 0, true);
      text('esc', 14, 150, 18, R, 600, 'JetBrains Mono');
      break;
    }
    case 'Backspace':
      line([[34, 58], [w - 80, 58]], R, 5); line([[48, 44], [34, 58], [48, 72]], R, 5);
      text('back', 34, 130, 22, R, 600, 'JetBrains Mono');
      for (let i = 0; i < 4; i++) circle(w - 46, 90, 10 + i * 9, B, 1.6);
      break;
    case 'Tab':
      text('K61', 18, 70, 46, R, 800);
      micro(['MECHANICAL', 'KEYBOARD / 60%'], 20, 104, 13, B);
      line([[w - 70, 40], [w - 24, 40], [w - 24, 130]], B, 2); node(w - 24, 130);
      break;
    case 'CapsLock':
      text('caps', 18, 52, 26, R, 600, 'JetBrains Mono');
      micro(['ЦЕЙ НАБІР — ДЛЯ ТИХ, ХТО', 'ДРУКУЄ ВНОЧІ. ТИСНИ ТИХО.', 'K61 · TERRA · PBT DOUBLESHOT', '61 KEYS · RGB · HOT-SWAP'], 18, 84, 10.5, B);
      break;
    case 'Enter': {
      text('enter', 20, 58, 26, R, 600, 'JetBrains Mono');
      line([[w - 50, 34], [w - 50, 96], [w - 120, 96]], R, 5); line([[w - 106, 82], [w - 120, 96], [w - 106, 110]], R, 5);
      for (let i = 0; i < 3; i++) circle(70, 112, 12 + i * 10, B, 1.6);
      line([[100, 112], [w - 140, 112]], B, 1.6); node(w - 140, 112);
      break;
    }
    case 'ShiftLeft': case 'ShiftRight': {
      const R0 = code === 'ShiftLeft';
      text('shift', R0 ? 20 : w - 104, 56, 26, R, 600, 'JetBrains Mono');
      // circuit-like line art
      const x0 = R0 ? 120 : 30, x1 = R0 ? w - 30 : w - 130;
      line([[x0, 112], [x0 + 40, 112], [x0 + 60, 92], [x1 - 40, 92], [x1, 132]], B, 2);
      line([[x0 + 20, 132], [x1 - 70, 132]], B, 2);
      for (const x of [x0, x0 + 60, x1 - 40, x1]) node(x, x === x0 ? 112 : x === x1 ? 132 : 92);
      for (let i = 0; i < 3; i++) circle(R0 ? 54 : w - 54, 116, 8 + i * 9, B, 1.6);
      micro([R0 ? 'SCHEMATIC 01' : 'SCHEMATIC 02'], R0 ? x0 + 70 : x0, 80, 10, B);
      break;
    }
    case 'ControlLeft': case 'ControlRight':
      text('ctrl', 18, 56, 24, R, 600, 'JetBrains Mono');
      circle(w - 44, 112, 22, B, 2); line([[w - 66, 112], [w - 22, 112]], B, 1.6); line([[w - 44, 90], [w - 44, 134]], B, 1.6);
      break;
    case 'MetaLeft':
      g.strokeStyle = R; g.lineWidth = 5; g.beginPath(); g.roundRect(w / 2 - 34, 46, 68, 68, 18); g.stroke();
      text('K', w / 2 - 15, 96, 40, R, 800);
      break;
    case 'AltLeft': case 'AltRight':
      text('alt', 18, 56, 24, R, 600, 'JetBrains Mono');
      for (let i = 0; i < 5; i++) node(26 + i * 16, 128);
      break;
    case 'Fn':
      circle(w / 2, 80, 36, R, 5); text('Fn', w / 2 - 22, 94, 36, R, 800);
      break;
    case 'ContextMenu':
      for (let i = 0; i < 4; i++) line([[w / 2 - 22 + i * 15, 106 - (i % 2) * 22], [w / 2 - 22 + i * 15, 118]], R, 5);
      line([[w / 2 - 34, 128], [w / 2 + 34, 128]], B, 2);
      break;
    case 'Space': {
      // wide line-art: planets on an orbit + coordinates
      const cy = 86;
      line([[60, cy], [w - 60, cy]], B, 1.6);
      for (const [x, r] of [[110, 30], [260, 14], [w / 2, 44], [w - 300, 18], [w - 120, 30]]) { circle(x, cy, r, B, 2); node(x, cy); }
      g.strokeStyle = B; g.lineWidth = 1.6; g.beginPath(); g.ellipse(w / 2, cy, 200, 46, 0, 0, Math.PI * 2); g.stroke();
      micro(['K61 · SPACE · 6.25U', '50°27′N 30°31′E'], 60, 140, 12, B);
      micro(['STAB · 2×', 'LUBED WIRE'], w - 200, 140, 12, B);
      circle(w / 2, cy, 9, R, 0, true);
      break;
    }
    default:
      text(code, 18, 60, 24, R);
  }
}

/** Builds the atlas; returns texture + per-key tile rect in UV space (x, y, w, h). */
export function buildLegendAtlas(keys, renderer) {
  const W = 2048, tiles = {};
  let x = 0, y = 0;
  const place = k => { const w = Math.round(k.u * H); if (x + w > W) { x = 0; y += H; } const r = { x, y, w }; x += w; return r; };
  const rects = keys.map(k => [k, place(k)]);
  const AH = THREE.MathUtils.ceilPowerOfTwo(y + H);
  const c = document.createElement('canvas'); c.width = W; c.height = AH;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, AH);
  g.globalCompositeOperation = 'lighter';
  for (const [k, r] of rects) {
    g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, H); g.clip(); g.translate(r.x, r.y);
    draw(g, k.code, r.w);
    g.restore();
    tiles[k.code] = new THREE.Vector4(r.x / W, r.y / AH, r.w / W, H / AH);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { texture: t, tiles };
}
