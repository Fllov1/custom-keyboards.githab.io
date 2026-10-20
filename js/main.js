import { createStage, ALIAS } from './scene.js';
import { SWITCH_TYPES, forceAt } from './switch.js';
import { createSound } from './sound.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const D = Math.PI / 180;

/* ------------------------------------------------------------
   3D keyframes per section (data-scene). az/el in degrees.
   `end` = values at the end of a tall (sticky) section.
------------------------------------------------------------ */
const BASE = { az: 20, el: 30, dist: 5, tx: 0, ty: 0.14, tz: 0, shift: 0, look: 1, labels: 0,
  ex: 0, caps: 0, swEx: 0, kbFade: 0, hero: 0, hsEx: 0, hsAuto: 0, scan: 0, colWave: 0, lift: 0, peel: 0, swOut: 0, typing: 0, rgb: 0.75, chain: 0, dark: 0 };
const SCENES = {
  hero: { az: 22, el: 34, dist: 6.1, ty: 0.1, shift: -4.4, typing: 0.5 },
  history: { az: -28, el: 42, dist: 5.4, ty: 0.12, shift: 5.6, look: 0.5 },
  layout: { az: 0, el: 80, dist: 4.9, ty: 0.12, tz: 0.02, shift: -4.2, look: 0.35, labels: 1,
    end: { az: 8, el: 66, dist: 4.6 } },
  keycaps: { az: -24, el: 26, dist: 5.4, ty: 0.42, shift: 5.2, look: 0.5, caps: 0.5 },
  switches: { az: 28, el: 36, dist: 3.1, tx: 0.35, ty: 0.12, tz: 0.05, shift: -5.4, look: 0.3, caps: 1, typing: 1.4 },
  anatomy: { az: 18, el: 14, dist: 4.4, shift: 5, look: 0, caps: 1, kbFade: 1, hero: 1, hsEx: 0, hsAuto: 1, labels: 1,
    end: { az: 40, el: 16, dist: 7.6, hsEx: 1, hsAuto: 0.6 } },
  stabs: { az: 12, el: 30, dist: 2.2, tx: -0.12, ty: 0.42, tz: 0.36, shift: -5, look: 0.2, caps: 1, ex: 0.32, swOut: 1, labels: 1 },
  plate: { az: -24, el: 30, dist: 5.6, ty: 0.55, shift: 5.2, look: 0.4, caps: 1, ex: 0.75, labels: 1 },
  foam: { az: 34, el: 20, dist: 6.2, ty: 0.62, shift: -5.2, look: 0.35, caps: 1, ex: 1, labels: 1,
    end: { az: 52, el: 15, dist: 5.8 } },
  pcb: { az: -14, el: 58, dist: 3.4, ty: 0.12, tz: 0.06, shift: 5.2, look: 0.2, caps: 1, peel: 1, scan: 1, labels: 1,
    end: { az: -32, el: 44, dist: 3.0, colWave: 1 } },
  rgb: { az: 16, el: 50, dist: 3.7, tx: 0.2, ty: 0.12, tz: 0.06, shift: -5.6, look: 0.2, caps: 1, peel: 0.5, chain: 1, rgb: 1, dark: 0.7, labels: 1,
    end: { az: -14, el: 58, dist: 4.0, tx: 0.05 } },
  case: { az: 36, el: 34, dist: 4.8, ty: 0.12, shift: 5, look: 0.5, lift: 1, labels: 1, rgb: 0 },
  specs: { az: 40, el: 24, dist: 5.2, ty: 0.12, shift: -5.6, look: 0.6 },
  lights: { az: -8, el: 46, dist: 5.4, ty: 0.08, shift: 5, look: 0.5, rgb: 1, dark: 0.85 },
  colors: { az: 0, el: 52, dist: 4.4, ty: -0.22, look: 1, rgb: 0.8, dark: 0.35 },
  footer: { az: 12, el: 20, dist: 8.5, ty: -0.6, look: 1 },
};
const KEYS = Object.keys(BASE);

const HOTSPOTS = [
  { scene: 'layout', part: 'Escape', title: 'Esc', text: 'А з Fn — тильда «~»', at: [0, 0.07, 0] },
  { scene: 'layout', part: 'Fn', title: 'Fn', text: 'Другий шар: стрілки, F1–F12, гучність', at: [0, 0.07, 0] },
  { scene: 'layout', part: 'Space', title: 'Пробіл', text: '6,25u — найдовша клавіша, тримається на стабілізаторі', at: [0.2, 0.07, 0] , left: true },
  { scene: 'layout', part: 'Enter', title: 'Enter', text: '2,25u і окремий колір', at: [0, 0.07, 0] },
  { scene: 'layout', part: 'ShiftRight', title: 'Right Shift', text: '2,75u', at: [0, 0.07, 0] },
  { scene: 'layout', part: 'KeyF', title: 'F і J', text: 'Мітки для пальців — набір наосліп', at: [0, 0.07, 0], left: true },
  { scene: 'anatomy', part: 'hTop', title: 'Верхній корпус', text: 'Прозорий полікарбонат — пропускає світло RGB', at: [0.07, 0.05, 0] },
  { scene: 'anatomy', part: 'hStem', title: 'Шток', text: 'POM, хрестик «+» — сюди вдягається кейкап', at: [0, 0.09, 0] },
  { scene: 'anatomy', part: 'hSpring', title: 'Пружина', text: 'Сталь; визначає, наскільки туго тиснеться клавіша', at: [0.025, 0.0, 0], left: true },
  { scene: 'anatomy', part: 'hLeaf', title: 'Контакти', text: 'Дві мідні пластини: торкаються — і клавіша спрацювала', at: [-0.04, -0.03, 0], left: true },
  { scene: 'anatomy', part: 'hLed', title: 'RGB-світлодіод', text: 'Стоїть на платі й світить крізь віконце корпусу', at: [0, -0.06, -0.047], left: true },
  { scene: 'anatomy', part: 'hBottom', title: 'Нижній корпус', text: 'Нейлон — глибший звук; ніжки йдуть у гніздо плати', at: [0.07, -0.03, 0] },
  { scene: 'stabs', part: 'stab', title: 'Стабілізатор', text: 'Два штоки й сталевий дріт: пробіл опускається рівно', at: [0, 0, 0] },
  { scene: 'plate', part: 'plate', title: 'Пластина', text: 'Алюміній 1,5 мм: 61 виріз під світчі', at: [0.95, -0.06, -0.2] },
  { scene: 'plate', part: 'gasket', title: 'Gasket', text: 'М\'які прокладки — пластина «пливе»', at: [0, 0, 0], left: true },
  { scene: 'plate', part: 'switch', title: 'Світчі', text: 'Клацаються в пластину', at: [0, 0, 0], left: true },
  { scene: 'foam', part: 'plateFoam', title: 'Plate foam', text: 'Poron між пластиною і платою', at: [1.05, -0.09, 0.3] },
  { scene: 'foam', part: 'pe', title: 'PE-плівка', text: 'Тонкий поліетилен під світчами', at: [-0.6, -0.11, 0.42], left: true },
  { scene: 'foam', part: 'caseFoam', title: 'Case foam', text: 'Гасить гул корпусу', at: [0.7, -0.16, 0.38] },
  { scene: 'foam', part: 'pcb', title: 'Плата', text: 'Діоди, гнізда, контролер', at: [-0.95, 0, 0.3], left: true },
  { scene: 'pcb', part: 'mcu', title: 'Контролер RP2040', text: 'Опитує матрицю 1000 разів на секунду', at: [0, 0.01, 0] },
  { scene: 'pcb', part: 'usb', title: 'USB-C', text: 'Живлення й дані', at: [0, 0.03, 0], left: true },
  { scene: 'pcb', part: 'diode', title: 'Діод', text: 'По одному на кожну клавішу — проти «фантомних» натискань', at: [0, 0.01, 0] },
  { scene: 'pcb', part: 'socket', title: 'Hot-swap гніздо', text: 'Під платою: світч вставляється без пайки', at: [0, 0, 0], left: true },
  { scene: 'rgb', part: 'led', title: 'SK6812 MINI-E', text: 'Три кристали R, G, B і драйвер у корпусі 3,2 × 2,8 мм', at: [0, 0, 0] },
  { scene: 'rgb', part: 'chain', title: 'Лінія даних', text: 'DOUT одного світлодіода → DIN наступного', at: [0, 0, 0], left: true },
  { scene: 'rgb', part: 'mcu', title: 'Контролер', text: 'Шле кадр: 61 × 24 біти', at: [0, 0.01, 0] },
  { scene: 'case', part: 'case', title: 'Корпус', text: 'Алюміній 6063, ЧПК + анодування', at: [1.0, 0.1, 0.4] },
];

/* ============================================================ */
const lenis = reduced ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
if (lenis) {
  lenis.stop();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
gsap.registerPlugin(ScrollTrigger, SplitText);
if (reduced) document.documentElement.classList.add('reduced');
const scrollTo = target => lenis ? lenis.scrollTo(target, { duration: 1.8 }) : $(target)?.scrollIntoView({ behavior: 'smooth' });
$$('[data-scroll]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollTo(a.dataset.scroll); }));

/* ---------- loader ---------- */
const pctEl = $('#pct'), barEl = $('#bar');
let shown = 0, target = 0;
const tickLoader = () => { shown += (target - shown) * 0.12; pctEl.textContent = Math.round(shown * 100); barEl.style.transform = `scaleX(${shown})`; if (shown < 0.995) requestAnimationFrame(tickLoader); };
tickLoader();

let stage;
try {
  stage = await createStage($('#stage'), { onProgress: p => { target = p; } });
} catch (err) {
  console.error(err);
  $('#loader .mono').textContent = 'Не вдалося завантажити 3D — оновіть сторінку';
  throw err;
}
target = 1;
window.__stage = stage;
// dev: __view('foam', 1) freezes the scroll driver and jumps the 3D to a chapter (p = progress through a tall one)
window.__view = (name, p = 0) => {
  window.__freeze = true; stage.skipIntro();
  const k = { ...BASE, ...SCENES[name] };
  for (const key of KEYS) { const v = lerp(k[key], k.end?.[key] ?? k[key], p); if (key === 'look') stage.view.look = v; else if (key !== 'labels') stage.S[key] = key === 'az' || key === 'el' ? v * D : v; }
  for (let i = 0; i < 30; i++) stage.renderOnce();
  updateHotspots(k.labels, name);
};
await new Promise(r => setTimeout(r, 450));

/* ---------- sections & scroll → state ---------- */
const sections = $$('[data-scene]');
let anchors = [];
function measure() {
  const vh = innerHeight;
  anchors = sections.map(s => {
    const top = s.offsetTop, h = s.offsetHeight, hold = Math.max(0, (h - vh) / 2);
    const mid = top + h / 2 - vh / 2;
    return { a: mid - hold, b: mid + hold, k: { ...BASE, ...SCENES[s.dataset.scene] } };
  });
}
measure();
addEventListener('resize', () => { measure(); ScrollTrigger.refresh(); });
new ResizeObserver(measure).observe(document.body);

function sceneAt(y) {
  const at = (i, p) => {
    const k = anchors[i].k; if (!k.end || p <= 0) return k;
    const o = {}; for (const key of KEYS) o[key] = lerp(k[key], k.end[key] ?? k[key], p); return o;
  };
  if (y <= anchors[0].a) return { st: at(0, 0), idx: 0 };
  for (let i = 0; i < anchors.length; i++) {
    const A = anchors[i];
    if (y <= A.b) return { st: at(i, A.b > A.a ? ease(clamp((y - A.a) / (A.b - A.a))) : 0), idx: i };
    const N = anchors[i + 1]; if (!N) break;
    if (y < N.a) {
      const t = ease(clamp((y - A.b) / (N.a - A.b)));
      const s0 = at(i, 1), s1 = at(i + 1, 0), o = {};
      for (const key of KEYS) o[key] = lerp(s0[key], s1[key], t);
      return { st: o, idx: t < 0.5 ? i : i + 1 };
    }
  }
  return { st: at(anchors.length - 1, 1), idx: anchors.length - 1 };
}

/* ---------- chrome: rail, nav, hud ---------- */
const railDots = $('#railDots');
sections.forEach((s, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<span>${s.dataset.title}</span>`;
  li.addEventListener('click', () => scrollTo(s.id ? '#' + s.id : (i === 0 ? '#top' : s)));
  railDots.appendChild(li);
});
const dots = $$('li', railDots), navLinks = $$('.nav__links a');
const hudChapter = $('#hudChapter'), hudPct = $('#hudPct'), railFill = $('#railFill');
const nav = $('.nav');
const NAV_GROUP = { layout: 'history', anatomy: 'switches', stabs: 'switches', plate: 'foam', case: 'rgb', specs: 'rgb', lights: 'rgb' };
let lastIdx = -1, lastY = 0;
function updateChrome(idx, y) {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = clamp(y / max);
  railFill.style.transform = `scaleY(${p})`;
  hudPct.textContent = String(Math.round(p * 100)).padStart(3, '0');
  nav.classList.toggle('is-hidden', y > lastY + 2 && y > innerHeight * 0.6);
  if (y < lastY - 2) nav.classList.remove('is-hidden');
  lastY = y;
  if (idx === lastIdx) return; lastIdx = idx;
  dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
  hudChapter.textContent = `${String(idx).padStart(2, '0')} — ${sections[idx].dataset.title}`;
  const id = sections[idx].id, grp = NAV_GROUP[id] || id;
  navLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + grp));
}

/* ---------- hotspots ---------- */
const hsRoot = $('#hotspots');
const hs = HOTSPOTS.map(h => {
  const el = document.createElement('div');
  el.className = 'hs' + (h.left ? ' hs--left' : '');
  el.innerHTML = `<i class="hs__dot"></i><i class="hs__line"></i><div class="hs__card"><b>${h.title}</b><small>${h.text}</small></div>`;
  el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
  el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
  hsRoot.appendChild(el); return { ...h, el };
});
function updateHotspots(on, scene) {
  for (const h of hs) {
    const p = on > 0.6 && h.scene === scene ? stage.screenOf(h.part, h.at) : null;
    const vis = p && !p.behind && p.x > 40 && p.x < innerWidth - 40 && p.y > 80 && p.y < innerHeight - 40;
    h.el.classList.toggle('is-on', !!vis);
    if (vis) h.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
  }
}

/* ---------- sound ---------- */
const sound = createSound();
const soundBtn = $('#soundBtn'), soundInline = $$('[data-sound]');
function setSound(on) {
  sound.enable(on);
  soundBtn.setAttribute('aria-pressed', on);
  soundInline.forEach(b => { b.classList.toggle('is-on', on); b.querySelector('span').textContent = on ? 'Звук увімкнено' : 'Увімкнути звук'; });
}
soundBtn.addEventListener('click', () => setSound(!sound.state.on));
soundInline.forEach(b => b.addEventListener('click', () => setSound(!sound.state.on)));

/* ---------- keys: your keyboard drives the 3D one ---------- */
const LABEL = { Escape: 'Esc', Backspace: '⌫', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', MetaLeft: 'Win', AltLeft: 'Alt', AltRight: 'Alt', Fn: 'Fn', ContextMenu: 'Menu', Space: 'Space' };
const BIG = new Set(['Space', 'Enter', 'ShiftLeft', 'ShiftRight', 'Backspace']);
const toast = $('#keytoast'), typedEl = $('#typed');
let typed = '';
function showKey(code, ch) {
  const k = document.createElement('kbd');
  k.textContent = LABEL[code] || (ch && ch.length === 1 ? ch.toUpperCase() : code.replace(/^(Key|Digit)/, ''));
  toast.appendChild(k); while (toast.children.length > 6) toast.firstChild.remove();
  setTimeout(() => k.remove(), 1100);
}
function typeChar(code, ch) {
  if (code === 'Backspace') typed = typed.slice(0, -1);
  else if (code === 'Space') typed += ' ';
  else if (ch && ch.length === 1) typed += ch;
  typed = typed.slice(-48); typedEl.textContent = typed;
}
function keyDown(code, ch) {
  if (!stage.keyDown(code)) return;
  sound.down(BIG.has(code));
  showKey(code, ch); typeChar(code, ch);
}
addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') return;
  const code = ALIAS[e.code] || e.code;
  if (!stage.byCode[code]) return;
  if (code === 'Space' && (e.target === document.body || e.target === document.documentElement)) e.preventDefault(); // Space = key, not page-down
  keyDown(code, e.key);
});
addEventListener('keyup', e => { const code = ALIAS[e.code] || e.code; if (stage.byCode[code]) { stage.keyUp(code); sound.up(); } });
addEventListener('blur', () => stage.keys.forEach(k => stage.keyUp(k.code)));
// click a keycap
let pointerKey = null;
$('#stage').style.pointerEvents = 'none';
addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('a, button, .panel, .nav')) return;
  const code = stage.pick(e.clientX, e.clientY);
  if (code) { pointerKey = code; keyDown(code, LABEL[code] ? '' : stage.byCode[code] && code.replace(/^(Key|Digit)/, '').toLowerCase()); }
});
addEventListener('pointerup', () => { if (pointerKey) { stage.keyUp(pointerKey); sound.up(); pointerKey = null; } });

/* ---------- switch types + force curve ---------- */
const curvePath = $('#curvePath'), curveDot = $('#curveDot');
const cx = mm => 30 + mm * 70, cy = g => 125 - g * 1.1;
let swType = 'linear';
function drawCurve() {
  let d = ''; for (let i = 0; i <= 80; i++) { const x = i / 20; d += (i ? 'L' : 'M') + cx(x).toFixed(1) + ' ' + cy(forceAt(swType, x)).toFixed(1); }
  curvePath.setAttribute('d', d);
}
drawCurve();
$$('.sw-type').forEach(b => b.addEventListener('click', () => {
  swType = b.dataset.type; const t = SWITCH_TYPES[swType];
  $$('.sw-type').forEach(s => { s.classList.toggle('is-active', s === b); s.setAttribute('aria-checked', s === b); });
  $('#swName').textContent = t.name; $('#swForce').textContent = t.force; $('#swDesc').textContent = t.label;
  stage.setSwitchType(swType, t.stem); sound.state.type = swType;
  drawCurve();
  // demo press so you can feel it
  ['KeyJ', 'KeyK', 'KeyL'].forEach((c, i) => setTimeout(() => { stage.tap(c, undefined, 0.12); sound.down(); setTimeout(() => sound.up(), 120); }, 120 + i * 160));
}));

/* ---------- foams ---------- */
$$('.foam').forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.foam, on = !b.classList.contains('is-on');
  b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on);
  stage.foam[f] = on ? 1 : 0; sound.state.foam[f] = on ? 1 : 0;
  if (!sound.state.on) setSound(true);
  stage.tap('Space', undefined, 0.12); sound.down(true); setTimeout(() => sound.up(), 140);
}));

/* ---------- RGB effects + mixer ---------- */
const rgbState = stage.rgb.state;
$$('.rgb-mode').forEach(b => b.addEventListener('click', () => {
  rgbState.mode = b.dataset.mode;
  $$('.rgb-mode').forEach(s => { s.classList.toggle('is-active', s === b); s.setAttribute('aria-checked', s === b); });
  if (rgbState.mode === 'reactive') ['KeyG', 'KeyH'].forEach((c, i) => setTimeout(() => stage.tap(c, undefined, 0.1), i * 220));
}));
const mixRows = $$('.mixer__row input[data-ch]'), mixChip = $('#mixChip'), mixHex = $('#mixHex');
function syncMixer() {
  const hex = '#' + rgbState.color.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  mixChip.style.setProperty('--mix', hex); mixHex.textContent = hex;
  mixRows.forEach(r => { r.nextElementSibling.textContent = rgbState.color[+r.dataset.ch]; });
}
mixRows.forEach(r => r.addEventListener('input', () => {
  rgbState.color[+r.dataset.ch] = +r.value; syncMixer();
  if (rgbState.mode !== 'static') $('.rgb-mode[data-mode="static"]').click();
}));
$('#rgbBright').addEventListener('input', e => { rgbState.bright = e.target.value / 100; e.target.nextElementSibling.textContent = e.target.value + '%'; });
syncMixer();
const rgbSteps = $$('#rgbSteps li');
let lastStep = -1;
function updateRgbSteps(active) {
  const n = stage.keys.length, p = stage.rgb.chainPos;
  const step = !active ? -1 : p < 2 ? 0 : p < n ? 1 : p < n + 12 ? 2 : 3;
  if (step !== lastStep) { lastStep = step; rgbSteps.forEach((li, i) => li.classList.toggle('is-active', i === step)); }
}

/* ---------- colourways ---------- */
$$('.swatch').forEach(b => b.addEventListener('click', () => {
  $$('.swatch').forEach(s => { s.classList.toggle('is-active', s === b); s.setAttribute('aria-checked', s === b); });
  stage.setColorway(b.dataset.cw, 900);
  // a little ripple across the board
  stage.keys.slice().sort((a, c) => a.x - c.x).forEach((k, i) => setTimeout(() => stage.tap(k.code, undefined, 0.08), i * 9));
}));
$('#contactBtn').addEventListener('click', e => { if ($('#contactBtn').getAttribute('href') === '#') e.preventDefault(); });

/* ---------- main loop: scroll → 3D ---------- */
const S = stage.S;
const filmShiftToPx = () => {
  const fov = (innerWidth / innerHeight < 0.8 ? 42 : 30) * D;
  return -innerWidth / (35 * 2 * Math.tan(fov / 2) * (innerWidth / innerHeight));
};
let pxPerShift = filmShiftToPx(); addEventListener('resize', () => { pxPerShift = filmShiftToPx(); });
const rootStyle = document.documentElement.style;
const travelEl = $('#travel'), travelFill = $('#travelFill'), travelBox = $('.travel'), scanColEl = $('#scanCol');
let lastShiftPx = null, lastT = performance.now(), labelsOn = 0, curveT = 0;

gsap.ticker.add(() => {
  if (window.__freeze) return;
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const y = lenis ? lenis.animatedScroll : scrollY;
  const { st, idx } = sceneAt(y);
  const k = window.__snap ? 1 : 1 - Math.exp(-6 * dt);
  for (const key of KEYS) {
    if (key === 'look' || key === 'labels') continue;
    const v = key === 'az' || key === 'el' ? st[key] * D : st[key];
    S[key] += (v - S[key]) * k;
  }
  stage.view.look += (st.look - stage.view.look) * k;
  labelsOn += (st.labels - labelsOn) * k;

  const shiftPx = Math.round(S.shift * pxPerShift * (innerWidth / innerHeight < 0.8 ? 0 : 1));
  if (shiftPx !== lastShiftPx) { rootStyle.setProperty('--shift', shiftPx + 'px'); lastShiftPx = shiftPx; }

  const scene = sections[idx].dataset.scene;
  updateChrome(idx, y);
  updateHotspots(labelsOn, scene);

  // switch chapter: dot rides the force curve; anatomy: travel readout
  curveT = (curveT + dt * 0.5) % 1;
  const tr = scene === 'anatomy' ? stage.heroTravel : 4 * (curveT < 0.5 ? ease(curveT * 2) : 1 - ease((curveT - 0.5) * 2));
  if (scene === 'switches') { curveDot.setAttribute('cx', cx(tr)); curveDot.setAttribute('cy', cy(forceAt(swType, tr))); }
  if (scene === 'anatomy') {
    travelEl.textContent = tr.toFixed(1); travelFill.style.transform = `scaleX(${tr / 4})`;
    travelBox.classList.toggle('is-act', tr >= 2);
  }
  updateRgbSteps(scene === 'rgb');
  if (scene === 'pcb') scanColEl.textContent = `C${String(stage.scanCol ?? 0).padStart(2, '0')}`;
});

/* ---------- pointer ---------- */
addEventListener('pointermove', e => {
  stage.pointer.x = (e.clientX / innerWidth) * 2 - 1;
  stage.pointer.y = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });
if (!fine) gsap.to(stage.pointer, { x: 0.35, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1 });

/* ---------- custom cursor + magnetic buttons ---------- */
const cursor = $('#cursor'), cursorLabel = $('#cursorLabel');
if (fine) {
  const xTo = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' }), yTo = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' });
  let hoverKey = null, lastPick = 0;
  addEventListener('pointermove', e => {
    xTo(e.clientX); yTo(e.clientY); cursor.classList.add('is-live');
    // label the cursor when it's over a keycap (throttled raycast)
    const now = performance.now(); if (now - lastPick < 60) return; lastPick = now;
    const over = e.target.closest('a, button, .panel') ? null : stage.pick(e.clientX, e.clientY);
    if (over !== hoverKey) {
      hoverKey = over;
      cursor.classList.toggle('has-label', !!over); cursor.classList.toggle('is-key', !!over);
      if (over) cursorLabel.textContent = 'Натисни';
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.classList.remove('is-live'));
  $$('a, button, .rail__dots li').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
  });
  $$('.magnetic').forEach(el => {
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, .4)' }), y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, .4)' });
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); x((e.clientX - r.left - r.width / 2) * 0.3); y((e.clientY - r.top - r.height / 2) * 0.4); });
    el.addEventListener('pointerleave', () => { x(0); y(0); });
  });
}

/* ---------- text animations ---------- */
function animateText() {
  $$('.split').forEach(el => {
    const split = SplitText.create(el, { type: 'words', wordsClass: 'w', mask: 'words' });
    gsap.from(split.words, { yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.045, scrollTrigger: { trigger: el, start: 'top 85%' } });
  });
  ScrollTrigger.batch($$('.reveal').filter(el => !el.closest('.hero')), {
    start: 'top 88%',
    onEnter: b => gsap.to(b, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08, overwrite: true }),
  });
  $$('[data-count]').forEach(el => {
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), o = { v: 0 };
    const fmt = v => v.toLocaleString('uk-UA', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: to >= 10000 });
    el.textContent = fmt(0);
    gsap.to(o, { v: to, duration: 2, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%' }, onUpdate: () => el.textContent = fmt(o.v) });
  });
}

/* ---------- go ---------- */
stage.start();
$('#loader').classList.add('is-done');
document.body.classList.remove('is-loading');
lenis?.start();
if (reduced) { stage.skipIntro(); $$('.reveal').forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; }); }
else {
  animateText();
  const tl = gsap.timeline({ delay: 0.35 });
  tl.from('.hero__title .line > span', { yPercent: 105, duration: 1.4, ease: 'power4.out', stagger: 0.12 })
    .to('.hero .reveal', { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.1 }, '-=0.9')
    .from('.nav', { y: -30, opacity: 0, duration: 1, ease: 'power3.out', clearProps: 'transform,opacity' }, '-=1')
    .from('.rail, .hud', { opacity: 0, duration: 1 }, '-=0.6');
}
