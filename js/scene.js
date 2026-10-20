import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createInternals } from './internals.js';
import { createHeroSwitch, MM } from './switch.js';
import { buildLegendAtlas } from './legends.js';
import { createRgb } from './rgb.js';

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = t => t * t * (3 - 2 * t);

/* 60% ANSI, row by row (left → right). Fn sits where a right Win key would be. */
const ROWS = [
  ['Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
  ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
  ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'Fn', 'ContextMenu', 'ControlRight'],
];
export const ALIAS = { Backquote: 'Escape', MetaRight: 'Fn', OSLeft: 'MetaLeft', IntlBackslash: 'ShiftLeft' };

// legend = alphas' legend colour, legendMod = on modifiers, pink = the accent block (5–8, T–I, G–J, B–M)
export const COLORWAYS = {
  graphite: { alpha: '#1e1f23', mod: '#1e1f23', accent: '#1e1f23', legend: '#eceef3', legendMod: '#eceef3', pink: '#ff4fa3' },
  cobalt: { alpha: '#26272c', mod: '#2150fc', accent: '#0d1cae', legend: '#eceef3', legendMod: '#eceef3', pink: '#8fb0ff' },
  milk: { alpha: '#e7e4dc', mod: '#8d939e', accent: '#2150fc', legend: '#2a2b30', legendMod: '#1d1e22', pink: '#2150fc' },
  retro: { alpha: '#d8ceb6', mod: '#8b8475', accent: '#c4432c', legend: '#2c2a26', legendMod: '#f3eee2', pink: '#c4432c' },
  lilac: { alpha: '#d6d1e8', mod: '#6b5fa6', accent: '#2a2452', legend: '#2d2840', legendMod: '#f1effa', pink: '#6b5fa6' },
};

function studioEnv(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x0a0b0e, side: THREE.BackSide })));
  const panel = (w, h, color, intensity, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); s.add(m);
  };
  panel(16, 1.2, 0xffffff, 4, [0, 6.8, -2], [Math.PI / 2, 0, 0]);
  panel(16, 1.2, 0xffffff, 2.6, [0, 6.8, 2.5], [Math.PI / 2, 0, 0]);
  panel(1.4, 10, 0xeef2ff, 2.2, [-14.5, 3, 0], [0, Math.PI / 2, 0]);
  panel(12, 3, 0xffffff, 1.5, [0, 3, 14.5], [0, 0, 0]);
  panel(10, 4, 0x2a55ff, 2.6, [14.5, 2, -4], [0, -Math.PI / 2, 0]);
  panel(30, 30, 0x15171c, 1, [0, -6.9, 0], [Math.PI / 2, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.04); pm.dispose();
  return rt.texture;
}

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function decodeParts(manifest, buf) {
  return manifest.parts.map(p => {
    const n = p.count;
    const q = new Uint16Array(buf, p.pos, n * 3), nn = new Int8Array(buf, p.nrm, n * 4);
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { P[i * 3 + k] = p.min[k] + q[i * 3 + k] / 65535 * p.size[k]; N[i * 3 + k] = nn[i * 4 + k] / 127; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setIndex(new THREE.BufferAttribute(p.idx32 ? new Uint32Array(buf, p.idx, p.indexCount) : new Uint16Array(buf, p.idx, p.indexCount), 1));
    g.computeBoundingSphere();
    return { ...p, geometry: g };
  });
}

export async function createStage(canvas, { onProgress = () => { } } = {}) {
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  const DPR_STEPS = [1.5, 1.25, 1, 0.85, 0.75];
  let dprStep = devicePixelRatio > 1.3 ? 1 : 2;
  if (isTouch) dprStep = Math.max(dprStep, 2);
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_STEPS[dprStep]));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.environment = studioEnv(renderer);
  scene.environmentIntensity = 0.85;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);

  const key = new THREE.SpotLight(0xf4f6ff, 34, 14, 0.6, 0.85, 1.6);
  key.position.set(1.4, 5.5, 2.4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.radius = 4; key.shadow.camera.near = 2; key.shadow.camera.far = 10;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x3d6bff, 2.6); rim.position.set(-3, 1.4, -4); scene.add(rim);
  const front = new THREE.DirectionalLight(0xfff6ee, 1.0); front.position.set(-2.5, 1.6, 4); scene.add(front);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x0b0d16, 0.5));

  // floor
  const floor = new THREE.Group(); scene.add(floor);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(36,70,200,0.5)'], [0.35, 'rgba(20,36,110,0.22)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.002; floor.add(glow);
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(0,0,0,0.85)'], [0.6, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  ao.rotation.x = -Math.PI / 2; ao.position.y = 0.001; floor.add(ao);
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.ShadowMaterial({ opacity: 0.5 }));
  shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.receiveShadow = true; floor.add(shadowCatcher);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3d6bff, transparent: true, opacity: 0.2, depthWrite: false });
  [2.0, 2.8, 3.7].forEach((r, i) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.006, 160), ringMat.clone()); m.material.opacity = 0.2 - i * 0.05; m.rotation.x = -Math.PI / 2; m.position.y = 0.002; floor.add(m); });

  // dust
  const dustN = isTouch ? 250 : 500, dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dp[i * 3] = (Math.random() - 0.5) * 14; dp[i * 3 + 1] = Math.random() * 5; dp[i * 3 + 2] = (Math.random() - 0.5) * 14; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.018, color: 0xa8b8f0, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // ---------- load ----------
  const fetchBin = async url => {
    const res = await fetch(url); const len = +res.headers.get('content-length') || 1.5e6;
    const reader = res.body.getReader(); const chunks = []; let got = 0;
    for (; ;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(Math.min(0.95, got / len)); }
    const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out.buffer;
  };
  const [manifest, buf] = await Promise.all([fetch('assets/keyboard.json').then(r => r.json()), fetchBin('assets/keyboard.bin'), document.fonts?.ready]);
  const parts = decodeParts(manifest, buf);

  // ---------- materials ----------
  /* Keycap material: PBT + legends projected onto the top face from the atlas + RGB glow on the skirt. */
  const capMat = () => {
    const m = new THREE.MeshPhysicalMaterial({ roughness: 0.62, metalness: 0, sheen: 0.12, sheenRoughness: 0.8, sheenColor: 0xffffff, clearcoat: 0.04, envMapIntensity: 0.8 });
    const u = m.userData.u = { uAtlas: { value: null }, uTile: { value: new THREE.Vector4() }, uTop: { value: new THREE.Vector4(0, 0, 1, 1) }, uBottom: { value: 0 },
      uLegend: { value: new THREE.Color() }, uPink: { value: new THREE.Color() }, uLed: { value: new THREE.Color(0, 0, 0) } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vCapPos;\nvarying vec3 vCapN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCapPos = position; vCapN = normal;');
      sh.fragmentShader = `uniform sampler2D uAtlas; uniform vec4 uTile, uTop; uniform float uBottom; uniform vec3 uLegend, uPink, uLed;
varying vec3 vCapPos; varying vec3 vCapN;
`+ sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
  float topM = smoothstep(0.78, 0.93, vCapN.y);
  vec2 tuv = vec2((vCapPos.x - uTop.x) / uTop.z, (vCapPos.z - uTop.y) / uTop.w);
  float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0) * topM;
  vec3 lm = texture2D(uAtlas, uTile.xy + clamp(tuv, 0.0, 1.0) * uTile.zw).rgb * inside;
  diffuseColor.rgb = mix(diffuseColor.rgb, uLegend, lm.r);
  diffuseColor.rgb = mix(diffuseColor.rgb, uPink, lm.g);
  diffuseColor.rgb = mix(diffuseColor.rgb, uLegend, lm.b * 0.6);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float rim = smoothstep(uBottom + 0.035, uBottom + 0.002, vCapPos.y) * (1.0 - topM);
  totalEmissiveRadiance += uLed * rim * rim * 1.6;`);
    };
    m.customProgramCacheKey = () => 'keycap';
    return m;
  };
  const capMats = [];
  const caseMat = new THREE.MeshPhysicalMaterial({ color: 0x3a3e47, metalness: 0.8, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35 });

  const kb = new THREE.Group(); kb.name = 'keyboard'; scene.add(kb);
  const caps = parts.filter(p => !p.name.startsWith('Cube#'));
  const casePart = parts.find(p => p.name === 'Cube#Mat_1');

  // deck frame: keycap bottoms lie on a plane tilted towards the user — fit it
  let sz = 0, sy = 0, szz = 0, szy = 0;
  const alphas = caps.filter(p => p.mat === 'Mat_1'); // same 1u cap everywhere (the spacebar sits lower)
  for (const p of alphas) { const z = p.center[2], y = p.center[1] - p.size[1] / 2; sz += z; sy += y; szz += z * z; szy += z * y; }
  const n = alphas.length, slope = (n * szy - sz * sy) / (n * szz - sz * sz), y0 = (sy - slope * sz) / n;
  const tilt = -Math.atan(slope);
  const deck = new THREE.Group(); deck.position.set(0, y0, 0); deck.rotation.x = tilt; kb.add(deck);
  deck.updateMatrixWorld(true);
  const toDeck = new THREE.Matrix4().copy(deck.matrixWorld).invert();

  // case
  // The OBJ case is a solid wedge. Hollow it out: the shader cuts the top deck inside the pocket,
  // and procedural inner walls + floor (clipped to the sloped top y = 0.2095 − 0.048·z, fitted to the OBJ) close the cavity.
  const POCKET = { x: 1.47, z: 0.49, floor: 0.014 };
  const v3 = a => `vec3(${a.map(n => n.toFixed(5)).join(',')})`;
  const clip = (mat, kind, off = [0, 0, 0]) => {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vCase;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nvCase = position + ${v3(off)};`);
      sh.fragmentShader = 'varying vec3 vCase;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', kind === 'shell'
        ? `#include <clipping_planes_fragment>\nif (abs(vCase.x) < ${POCKET.x} && abs(vCase.z) < ${POCKET.z} && vCase.y > 0.1) discard;`
        : `#include <clipping_planes_fragment>\nif (vCase.y > 0.2095 - 0.048 * vCase.z - 0.0008) discard;`);
    };
    mat.customProgramCacheKey = () => 'case-' + kind;
  };
  const shellMat = caseMat.clone(); clip(shellMat, 'shell', casePart.center);
  const innerMat = caseMat.clone(); innerMat.color.set(0x2a2d34); innerMat.roughness = 0.6; innerMat.side = THREE.DoubleSide; clip(innerMat, 'inner');
  const caseMesh = new THREE.Mesh(casePart.geometry, shellMat);
  caseMesh.position.fromArray(casePart.center); caseMesh.castShadow = true; caseMesh.receiveShadow = true;
  const caseG = new THREE.Group(); caseG.add(caseMesh); kb.add(caseG);
  {
    const t = 0.002, h = 0.26, P = POCKET, g = [];
    const wall = (w, d, x, z) => { const b = new THREE.BoxGeometry(w, h - P.floor, d); b.translate(x, P.floor + (h - P.floor) / 2, z); g.push(b); };
    wall(2 * P.x + 2 * t, t, 0, -P.z - t / 2); wall(2 * P.x + 2 * t, t, 0, P.z + t / 2);
    wall(t, 2 * P.z, -P.x - t / 2, 0); wall(t, 2 * P.z, P.x + t / 2, 0);
    const fl = new THREE.BoxGeometry(2 * P.x, 0.004, 2 * P.z); fl.translate(0, P.floor - 0.002, 0); g.push(fl);
    const inner = new THREE.Mesh(mergeGeometries(g), innerMat); inner.receiveShadow = true;
    caseG.add(inner);
  }
  const band = parts.find(p => p.name === 'Cube#Mat.2');
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 1, roughness: 0.22 });
  const bandMesh = new THREE.Mesh(band.geometry, bandMat); bandMesh.position.fromArray(band.center); caseG.add(bandMesh);

  // keycaps → deck-local, sorted into rows
  const v = new THREE.Vector3();
  const capObjs = caps.map(p => {
    v.fromArray(p.center).applyMatrix4(toDeck);
    return { p, x: v.x, y: v.y, z: v.z, u: Math.round(p.size[0] / 0.1905 * 4) / 4 };
  });
  const byZ = capObjs.slice().sort((a, b) => a.z - b.z), rowsOf = [];
  byZ.forEach((c, i) => { if (!i || c.z - byZ[i - 1].z > 0.05) rowsOf.push([]); rowsOf.at(-1).push(c); });
  const keys = [];
  rowsOf.forEach((row, r) => {
    row.sort((a, b) => a.x - b.x).forEach((c, i) => { c.code = ROWS[r]?.[i] ?? `K${r}_${i}`; c.row = r; });
  });
  const minX = Math.min(...capObjs.map(c => c.x - c.u * 0.1905 / 2));
  capObjs.forEach((c, i) => {
    c.i = i; c.col = clamp(Math.round((c.x - minX) / 0.1905 - 0.5), 0, 13);
    c.group = c.p.mat === 'Mat_1' ? 'alpha' : c.p.mat === 'Mat_2' ? 'accent' : 'mod';
    const mat = c.mat = capMat(); capMats.push(mat);
    // top face bounds (geometry space) for projecting the legend
    const P = c.p.geometry.attributes.position, N = c.p.geometry.attributes.normal;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let j = 0; j < P.count; j++) if (N.getY(j) > 0.93) { x0 = Math.min(x0, P.getX(j)); x1 = Math.max(x1, P.getX(j)); z0 = Math.min(z0, P.getZ(j)); z1 = Math.max(z1, P.getZ(j)); }
    mat.userData.u.uTop.value.set(x0, z0, x1 - x0, z1 - z0);
    mat.userData.u.uBottom.value = -c.p.size[1] / 2;
    const mesh = new THREE.Mesh(c.p.geometry, mat); mesh.castShadow = true;
    // keycap geometry is in world orientation; undo the deck tilt so it sits right inside the deck frame
    mesh.rotation.x = -tilt;
    const g = new THREE.Group(); g.position.set(c.x, c.y, c.z); g.add(mesh); g.name = c.code;
    deck.add(g);
    c.obj = g; c.home = g.position.clone();
    keys.push(c);
  });
  const byCode = Object.fromEntries(keys.map(k => [k.code, k]));
  const atlas = buildLegendAtlas(keys, renderer);
  for (const k of keys) { k.mat.userData.u.uAtlas.value = atlas.texture; k.mat.userData.u.uTile.value.copy(atlas.tiles[k.code]); }

  const rgb = createRgb(keys); // also assigns k.chainIdx (LED data chain order)
  const internals = createInternals({ keys, renderer });
  deck.add(internals.root);

  // the hero switch gets its own materials: the keyboard's fade out must not touch it
  const heroMats = Object.fromEntries(Object.entries(internals.mats).map(([k, m]) => [k, m.clone()]));
  const hero = createHeroSwitch(internals.geo, heroMats);
  hero.root.scale.setScalar(8); hero.root.visible = false;
  const HERO_HOME = new THREE.Vector3(0, 0.8, 0.15);
  hero.root.position.copy(HERO_HOME);
  scene.add(hero.root);
  const heroLight = new THREE.SpotLight(0xf2f5ff, 0, 9, 0.5, 0.8, 1.4);
  heroLight.position.set(1.4, 3.0, 2.6); heroLight.target = hero.root; scene.add(heroLight);

  const allMats = [shellMat, innerMat, bandMat, ...internals.allMats];
  allMats.forEach(m => { m.userData.baseOpacity = m.transparent ? m.opacity : 1; m.userData.baseTransparent = m.transparent; });

  // warm up shaders
  hero.root.visible = true;
  camera.position.set(0, 2, 4); camera.lookAt(0, 0.2, 0);
  resize();
  try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  hero.root.visible = false;
  onProgress(1);

  // ---------- state ----------
  const S = {
    az: 0.4, el: 0.5, dist: 4.4, tx: 0, ty: 0.2, tz: 0, shift: 0,
    ex: 0, caps: 0, swEx: 0, kbFade: 0, hero: 0, hsEx: 0, hsAuto: 0, scan: 0, colWave: 0,
    lift: 0, peel: 0, swOut: 0, typing: 0, rgb: 0.7, chain: 0, dark: 0,
  };
  const foam = { plateFoam: 1, pe: 1, caseFoam: 1 }, foamV = { ...foam };
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const view = { look: 1 };
  const press = {}, pressT = {}, held = new Set();
  let intro = 1, heroTravel = 0, heroPhase = 0, scanCol = 0;
  const tmp = new THREE.Vector3(), tgt = new THREE.Vector3(), heroLed = new THREE.Color();

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 42 : 30; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // layer heights when exploded (scene units at ex = 1)
  const EX = { caseFoam: 0.16, pcb: 0.40, pe: 0.62, plateFoam: 0.82, plate: 1.04, stabs: 1.04, switches: 1.34 };
  const CAPS_EX = 1.8;
  const L = internals.layers;

  function setOpacity(m, op) {
    op *= m.userData.fade ?? 1;
    const base = m.userData.baseOpacity, t = m.userData.baseTransparent || op < 0.999;
    if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
    m.opacity = base * op; if (!m.userData.baseTransparent) m.depthWrite = op > 0.5;
  }

  function apply(dt, t) {
    const ex = S.ex;
    const ABOVE_PCB = { pe: 1, plateFoam: 1, plate: 1, stabs: 1, switches: 1 };
    for (const n in EX) L[n].position.y = ex * EX[n] + S.lift * (n === 'caseFoam' ? 2.2 : 2.6) + (ABOVE_PCB[n] ? S.peel * 2.6 : 0) + (n === 'switches' ? S.swOut * 2.4 : 0);
    // foams can be switched off (sound chapter): they shrink into nothing
    for (const f in foam) {
      foamV[f] = damp(foamV[f], foam[f], 8, dt);
      L[f].scale.set(1, Math.max(0.001, foamV[f]), 1); L[f].visible = foamV[f] > 0.02;
      L[f].children.forEach(m => { if (m.material) m.material.userData.fade = foamV[f]; });
    }
    scanCol = internals.update(dt, { press, scan: S.scan, swEx: S.swEx, colWave: S.colWave });

    // keycaps: explode + "caps" lift with a ripple from the left; intro drop-in
    const capsOp = 1 - clamp((S.caps - 0.55) / 0.45, 0, 1);
    for (const k of keys) {
      const d = (k.x + 1.5) / 3; // 0 left → 1 right
      const wave = smooth(clamp(S.caps * 1.6 - d * 0.6, 0, 1));
      const intr = smooth(clamp(intro * 1.7 - (1 - d) * 0.7, 0, 1));
      const p = press[k.code] || 0;
      k.obj.position.set(k.home.x, k.home.y + ex * CAPS_EX + wave * 1.1 + intr * 1.4 + S.lift * 3.2 + S.peel * 3 - p * 4 * MM, k.home.z);
      k.obj.rotation.set(wave * 0.35 * Math.sin(k.i * 1.7), 0, wave * 0.25 * Math.cos(k.i * 2.3));
      k.obj.visible = capsOp > 0.02;
    }
    for (const m of capMats) setOpacity(m, capsOp * (1 - S.kbFade));

    // RGB: effect colours → keycap skirts, plate glow, the LEDs themselves, the hero switch
    rgb.update(dt, t, S.chain);
    const C = rgb.colors;
    keys.forEach((k, i) => k.mat.userData.u.uLed.value.setRGB(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]).multiplyScalar(S.rgb * 0.9));
    internals.setRgb(C, S.rgb, rgb.chainPos, S.chain);
    hero.setLed(heroLed.setHSL((t * 0.08) % 1, 1, 0.5, THREE.SRGBColorSpace), S.hero);
    // darker studio so the light reads
    const lit = 1 - 0.75 * S.dark;
    scene.environmentIntensity = 0.85 * lit; key.intensity = 34 * lit; rim.intensity = 2.6 * lit; front.intensity = 1.0 * lit;

    // whole keyboard fades for the hero switch
    const kbOp = 1 - S.kbFade;
    for (const m of allMats) setOpacity(m, kbOp);
    kb.visible = kbOp > 0.02;
    caseMesh.castShadow = kbOp > 0.5;

    // hero switch
    hero.root.visible = S.hero > 0.01;
    heroLight.intensity = 26 * S.hero;
    if (hero.root.visible) {
      hero.root.scale.setScalar(8 * (0.4 + 0.6 * smooth(S.hero)));
      hero.root.position.copy(HERO_HOME).add(tmp.set(0, (1 - S.hero) * -0.4, 0));
      hero.root.rotation.y = t * 0.25 + pointer.sx * 0.5;
      hero.root.rotation.x = 0.12 + pointer.sy * 0.15;
      // auto press: down–hold–up loop, or the real key being held
      heroPhase += dt * 0.55;
      const c = heroPhase % 1, auto = c < 0.3 ? smooth(c / 0.3) : c < 0.5 ? 1 : c < 0.75 ? 1 - smooth((c - 0.5) / 0.25) : 0;
      const target = Math.max(S.hsAuto * auto, held.size ? 1 : 0) * 4;
      heroTravel = damp(heroTravel, target, 18, dt);
      hero.update(S.hsEx, heroTravel);
    }
  }

  let acc = 0, nF = 0, warm = 60;
  function adapt(raw) {
    if (raw > 0.1 || document.hidden) return;
    if (warm > 0) { warm--; return; }
    acc += raw; nF++;
    if (nF < 90) return;
    const avg = acc / nF; acc = 0; nF = 0;
    if (avg > 1 / 48 && dprStep < DPR_STEPS.length - 1) {
      dprStep++; renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_STEPS[dprStep])); resize();
      if (dprStep >= 3) key.castShadow = false;
      warm = 30;
    }
  }

  const clock = new THREE.Clock();
  let running = true;
  function frame() {
    if (!running) return;
    tick();
    requestAnimationFrame(frame);
  }
  function tick() {
    const raw = clock.getDelta(), dt = Math.min(raw, 1 / 20), t = clock.elapsedTime;
    adapt(raw);
    pointer.sx = damp(pointer.sx, pointer.x, 3.2, dt); pointer.sy = damp(pointer.sy, pointer.y, 3.2, dt);
    intro = damp(intro, 0, 1.5, dt);
    // key press springs
    for (const c in press) {
      const target = held.has(c) || (pressT[c] && t < pressT[c]) ? 1 : 0;
      press[c] = damp(press[c], target, target ? 40 : 16, dt);
      if (!target && press[c] < 0.002) delete press[c];
    }
    // ambient typing: random keys tap themselves when the page asks for it
    if (S.typing > 0.05 && Math.random() < dt * 4 * S.typing) tap(keys[(Math.random() * keys.length) | 0].code, t, 0.09);

    const look = view.look;
    kb.rotation.y = pointer.sx * 0.28 * look + intro * -0.5;
    kb.rotation.x = pointer.sy * 0.06 * look;
    apply(dt, t);

    tgt.set(S.tx, S.ty, S.tz);
    if (S.hero > 0) { tmp.copy(HERO_HOME); tmp.y += 0.05 + S.hsEx * 0.85; tgt.lerp(tmp, smooth(S.hero)); }
    const dist = S.dist + intro * 1.6;
    camera.position.set(
      tgt.x + Math.sin(S.az) * Math.cos(S.el) * dist,
      tgt.y + Math.sin(S.el) * dist + pointer.sy * -0.08,
      tgt.z + Math.cos(S.az) * Math.cos(S.el) * dist,
    );
    camera.lookAt(tgt);
    camera.filmOffset = S.shift * (camera.aspect < 0.8 ? 0 : 1);
    camera.updateProjectionMatrix();

    dust.rotation.y = t * 0.012; dust.position.y = Math.sin(t * 0.1) * 0.15;
    renderer.render(scene, camera);
  }
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); frame(); } });

  function tap(code, t = clock.elapsedTime, len = 0.1) { if (!byCode[code]) return; press[code] = press[code] || 0; pressT[code] = t + len; rgb.onPress(byCode[code]); }

  // ---------- picking: click a keycap to press it ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const capMeshes = keys.map(k => k.obj.children[0]);
  function pick(x, y) {
    if (!kb.visible || S.caps > 0.3) return null;
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(capMeshes, false)[0];
    return hit ? hit.object.parent.name : null;
  }

  const proj = new THREE.Vector3();
  function screenOf(name, offset = [0, 0, 0]) {
    const o = byCode[name]?.obj ?? internals.named[name] ?? hero.named[name] ?? (name === 'case' ? caseG : null);
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    proj.set(...offset).applyMatrix4(o.matrixWorld).project(camera);
    return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, behind: proj.z > 1 };
  }

  function setColorway(name, dur = 0) {
    const cw = COLORWAYS[name]; if (!cw) return;
    const jobs = keys.map(k => {
      const u = k.mat.userData.u;
      return [[k.mat.color, new THREE.Color(cw[k.group])], [u.uLegend.value, new THREE.Color(k.group === 'alpha' ? cw.legend : cw.legendMod)], [u.uPink.value, new THREE.Color(cw.pink)]]
        .map(([c, to]) => [c, c.clone(), to]);
    }).flat();
    const t0 = performance.now();
    const step = () => {
      const p = dur ? Math.min(1, (performance.now() - t0) / dur) : 1, e = smooth(p);
      for (const [c, from, to] of jobs) c.copy(from).lerp(to, e);
      if (p < 1) requestAnimationFrame(step);
    };
    step();
  }
  setColorway('graphite');

  return {
    S, pointer, view, foam, keys, byCode, renderer, camera, rgb,
    start() { clock.getDelta(); frame(); },
    skipIntro() { intro = 0; },
    renderOnce: tick, // dev: render synchronously (hidden previews throttle rAF)
    screenOf, pick, setColorway,
    keyDown(code) { if (!byCode[code]) return false; held.add(code); press[code] = press[code] || 0; rgb.onPress(byCode[code]); return true; },
    keyUp(code) { held.delete(code); },
    tap,
    setSwitchType(type, color) { internals.setSwitchType(type, color); hero.setType(type); },
    get heroTravel() { return heroTravel; },
    get scanCol() { return scanCol; },
  };
}
