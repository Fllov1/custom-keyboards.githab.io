import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MM, box, switchGeometries, switchMaterials } from './switch.js';

/* Everything the OBJ doesn't have: plate, switches, stabilizers, three foams, PCB, gaskets.
   Built in the "deck" frame — tilted like the keycap rows, y = 0 at the keycap bottoms, units mm × 0.01. */

export const Y = {          // deck-local heights, mm
  plateTop: -6.0, plate: 1.5,
  plateFoam: [-7.5, -10.8],
  pe: [-10.8, -11.3],
  pcb: [-11.3, -12.9],
  caseFoam: [-15.0, -17.4],
};

const PITCH = 19.05;
const lerp = THREE.MathUtils.lerp;

/** Rounded rectangle, optionally with rectangular tabs on the long edges (plate gasket tabs). */
function outline(w, d, r, tabs = []) {
  const s = new THREE.Shape(), x0 = -w / 2, y0 = -d / 2, x1 = w / 2, y1 = d / 2;
  s.moveTo(x0 + r, y0);
  for (const t of tabs.filter(t => t.side < 0)) { s.lineTo(t.x - t.w / 2, y0); s.lineTo(t.x - t.w / 2, y0 - t.h); s.lineTo(t.x + t.w / 2, y0 - t.h); s.lineTo(t.x + t.w / 2, y0); }
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  for (const t of tabs.filter(t => t.side > 0).reverse()) { s.lineTo(t.x + t.w / 2, y1); s.lineTo(t.x + t.w / 2, y1 + t.h); s.lineTo(t.x - t.w / 2, y1 + t.h); s.lineTo(t.x - t.w / 2, y1); }
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
const rectHole = (cx, cy, w, h) => { const p = new THREE.Path(); p.moveTo(cx - w / 2, cy - h / 2); p.lineTo(cx - w / 2, cy + h / 2); p.lineTo(cx + w / 2, cy + h / 2); p.lineTo(cx + w / 2, cy - h / 2); p.closePath(); return p; };

/** Flat slab from a shape (mm), lying in the deck plane between y0 and y1 (mm). Shape y = −z. */
function slab(shape, y0, y1, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); g.scale(MM, MM, MM);
  return g;
}

function stabOffset(u) { return u >= 6 ? 50 : 11.938; }

export function createInternals({ keys, renderer }) {
  const root = new THREE.Group(); root.name = 'internals';
  const named = {};
  const layers = {};
  const layer = name => { const g = new THREE.Group(); g.name = name; root.add(g); layers[name] = g; return g; };

  // board extents from the keycaps (mm)
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const k of keys) { minX = Math.min(minX, k.x / MM - k.u * PITCH / 2); maxX = Math.max(maxX, k.x / MM + k.u * PITCH / 2); minZ = Math.min(minZ, k.z / MM - PITCH / 2); maxZ = Math.max(maxZ, k.z / MM + PITCH / 2); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const W = maxX - minX + 1.5, D = maxZ - minZ + 1.5;
  root.position.set(cx * MM, 0, cz * MM);
  const sw = keys.map(k => ({ ...k, mx: k.x / MM - cx, mz: k.z / MM - cz })); // switch centres, mm, board-local
  const stabKeys = sw.filter(k => k.u >= 2);

  /* ---------------- plate ---------------- */
  const plateShape = outline(W, D, 2.5);
  for (const k of sw) {
    plateShape.holes.push(rectHole(k.mx, -k.mz, 14, 14));
    if (k.u >= 2) { const o = stabOffset(k.u); plateShape.holes.push(rectHole(k.mx - o, -k.mz - 0.6, 6.75, 12.3), rectHole(k.mx + o, -k.mz - 0.6, 6.75, 12.3)); }
  }
  // flex cuts: thin slots between some columns make the plate softer
  for (const x of [-95, -38, 19, 76]) plateShape.holes.push(rectHole(x + 9.5, -D / 2 + 3.2, 22, 1.4), rectHole(x - 9.5 + 19, D / 2 - 3.2, 22, 1.4));
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xb9bfca, metalness: 0.92, roughness: 0.32 });
  const plate = new THREE.Mesh(slab(plateShape, Y.plateTop - Y.plate, Y.plateTop), plateMat);
  layer('plate').add(plate); named.plate = plate;

  // gasket tabs on the short sides, sandwiched between two poron pads each
  const gasketMat = new THREE.MeshStandardMaterial({ color: 0x3a4258, roughness: 0.95 });
  const tabGeo = [], gGeo = [];
  for (const sx of [-1, 1]) for (const z of [-24, 24]) {
    const x = sx * (W / 2 + 1.4);
    tabGeo.push(box(3, Y.plate, 12, x, Y.plateTop - Y.plate, z));
    gGeo.push(box(2.6, 1.6, 10, x, Y.plateTop, z), box(2.6, 1.6, 10, x, Y.plateTop - Y.plate - 1.6, z));
  }
  layers.plate.add(new THREE.Mesh(mergeGeometries(tabGeo), plateMat), new THREE.Mesh(mergeGeometries(gGeo), gasketMat));
  named.gasket = new THREE.Object3D(); named.gasket.position.set(-(W / 2 + 1.4) * MM, (Y.plateTop + 1.6) * MM, 24 * MM); layers.plate.add(named.gasket);

  /* ---------------- stabilizers (plate-mount, live with the plate) ---------------- */
  const stab = layer('stabs');
  const stabHousingMat = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.5 });
  const stabStemMat = new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.45 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0xd9dde4, metalness: 1, roughness: 0.18 });
  const hGeo = [], sGeo = [], stabStems = [];
  for (const k of stabKeys) {
    const o = stabOffset(k.u), wireZ = k.mz + 5.2, wy = Y.plateTop - 5.0;
    for (const s of [-1, 1]) {
      const x = k.mx + s * o;
      hGeo.push(box(6.4, 10.5, 11.6, x, Y.plateTop - 5.4, k.mz + 0.6), box(7.6, 0.9, 12.6, x, Y.plateTop, k.mz + 0.6));
      const st = mergeGeometries([box(3.6, 6.6, 3.6, 0, 0, 0), box(4.1, 3.4, 1.3, 0, 6.6, 0), box(1.3, 3.4, 4.1, 0, 6.6, 0)]);
      const m = new THREE.Mesh(st, stabStemMat); m.position.set(x * MM, (Y.plateTop - 2) * MM, k.mz * MM); stab.add(m);
      stabStems.push({ key: k.code, mesh: m, home: m.position.y });
    }
    const pts = [[-o, Y.plateTop - 1.5, k.mz + 0.2], [-o - 0.4, wy, wireZ - 1], [-o + 2, wy, wireZ], [o - 2, wy, wireZ], [o + 0.4, wy, wireZ - 1], [o, Y.plateTop - 1.5, k.mz + 0.2]]
      .map(([x, y, z]) => new THREE.Vector3((k.mx + x) * MM, y * MM, z * MM));
    sGeo.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 48, 0.75 * MM, 6, false));
  }
  stab.add(new THREE.Mesh(mergeGeometries(hGeo), stabHousingMat), new THREE.Mesh(mergeGeometries(sGeo), wireMat));
  const space = stabKeys.find(k => k.code === 'Space');
  named.stab = new THREE.Object3D(); named.stab.position.set((space.mx + 50) * MM, (Y.plateTop - 5) * MM, (space.mz + 5) * MM); stab.add(named.stab);

  /* ---------------- switches: 61 × 4 instanced parts ---------------- */
  const geo = switchGeometries(), mats = switchMaterials();
  const swGroup = layer('switches');
  const inst = (g, m, name) => {
    const im = new THREE.InstancedMesh(g, m, sw.length); im.name = name;
    const o = new THREE.Group(); o.add(im); swGroup.add(o);
    const M = new THREE.Matrix4();
    sw.forEach((k, i) => { im.setMatrixAt(i, M.makeTranslation(k.mx * MM, Y.plateTop * MM, k.mz * MM)); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    return { im, o };
  };
  const swParts = {
    bottom: inst(geo.bottom, [mats.bottom, mats.pins], 'bottom'),
    spring: inst(geo.spring, mats.spring, 'spring'),
    stem: inst(geo.stem, mats.stem, 'stem'),
    top: inst(geo.top, mats.topSolid, 'top'),
  };
  const swIndex = Object.fromEntries(sw.map((k, i) => [k.code, i]));
  named.switch = new THREE.Object3D(); { const k = sw[swIndex.KeyG]; named.switch.position.set(k.mx * MM, (Y.plateTop + 5.6) * MM, k.mz * MM); } swGroup.add(named.switch);

  /* ---------------- foams ---------------- */
  const foamOutline = () => outline(W - 1.5, D - 1.5, 2.5);
  const pf = foamOutline();
  for (const k of sw) {
    pf.holes.push(rectHole(k.mx, -k.mz, 15, 15));
    if (k.u >= 2) { const o = stabOffset(k.u); pf.holes.push(rectHole(k.mx - o, -k.mz - 0.6, 8.5, 14), rectHole(k.mx + o, -k.mz - 0.6, 8.5, 14)); }
  }
  const foamMat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, ...extra });
  const plateFoam = new THREE.Mesh(slab(pf, Y.plateFoam[1], Y.plateFoam[0]), foamMat(0xe7e5df));
  layer('plateFoam').add(plateFoam); named.plateFoam = plateFoam;
  const pe = new THREE.Mesh(slab(foamOutline(), Y.pe[1], Y.pe[0]), foamMat(0xf4f6fa, { transparent: true, opacity: 0.62, roughness: 0.6, depthWrite: false }));
  pe.renderOrder = 1;
  layer('pe').add(pe); named.pe = pe;
  // case foam: a plain thick sheet (socket cut-outs would be invisible anyway)
  const cf = foamOutline();
  const caseFoam = new THREE.Mesh(slab(cf, Y.caseFoam[1], Y.caseFoam[0]), foamMat(0x8d929c));
  layer('caseFoam').add(caseFoam); named.caseFoam = caseFoam;

  /* ---------------- PCB ---------------- */
  const pcbG = layer('pcb');
  const pcbTex = pcbTexture({ W, D, sw, renderer });
  const pcbMat = new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.42, metalness: 0.15 });
  const pcbEdge = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
  const board = new THREE.Mesh(slab(outline(W - 1, D - 1, 1.5), Y.pcb[1], Y.pcb[0]), pcbEdge);
  const top = new THREE.Mesh(new THREE.PlaneGeometry((W - 1) * MM, (D - 1) * MM), pcbMat);
  top.rotation.x = -Math.PI / 2; top.position.y = Y.pcb[0] * MM + 0.0002;
  pcbG.add(board, top); named.pcb = top;
  // components
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.35 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xcfd3da, metalness: 1, roughness: 0.25 });
  const socketMat = new THREE.MeshStandardMaterial({ color: 0x1d1f25, roughness: 0.6 });
  const diodes = new THREE.InstancedMesh(box(3.6, 1.1, 1.7, 0, 0, 0), blackMat, sw.length);
  const sockets = new THREE.InstancedMesh(mergeGeometries([box(10.9, 1.8, 4.6, 0, 0, 0), box(4.6, 1.8, 4.6, -3.2, 0, -2.6)]), socketMat, sw.length);
  const M = new THREE.Matrix4();
  sw.forEach((k, i) => {
    diodes.setMatrixAt(i, M.makeTranslation((k.mx + 4.5) * MM, Y.pcb[0] * MM, (k.mz + 8.2) * MM));
    sockets.setMatrixAt(i, M.makeTranslation((k.mx - 0.6) * MM, (Y.pcb[1] - 1.8) * MM, (k.mz - 3.8) * MM));
  });
  pcbG.add(diodes, sockets);
  const mcuTex = chipTexture();
  const mcu = new THREE.Mesh(box(7, 0.9, 7, 0, 0, 0), blackMat);
  const mcuTop = new THREE.Mesh(new THREE.PlaneGeometry(6.6 * MM, 6.6 * MM), new THREE.MeshStandardMaterial({ map: mcuTex, roughness: 0.4 }));
  mcuTop.rotation.x = -Math.PI / 2; mcuTop.position.y = 0.9 * MM + 0.0001; mcu.add(mcuTop);
  // the MCU sits in the diamond gap between G/H and T/Y
  const kG = sw[swIndex.KeyH], kY = sw[swIndex.KeyY];
  mcu.position.set(((kG.mx + kY.mx) / 2 - 9.5) * MM, Y.pcb[0] * MM, ((kG.mz + kY.mz) / 2) * MM);
  const xtal = new THREE.Mesh(box(3.2, 0.9, 2.5, 0, 0, 0), metalMat); xtal.position.copy(mcu.position).add(new THREE.Vector3(9.5 * MM, 0, 0));
  const usb = new THREE.Mesh(mergeGeometries([box(8.9, 3.2, 7.4, 0, 0, 0)]), metalMat);
  usb.position.set(-W / 2 * MM + 0.42, Y.pcb[0] * MM, (-D / 2 + 3.2) * MM);
  const usbHole = new THREE.Mesh(box(7.2, 2.0, 0.4, 0, 0.6, -3.6), blackMat); usb.add(usbHole);
  pcbG.add(mcu, xtal, usb);
  named.mcu = mcu; named.usb = usb; named.diode = new THREE.Object3D(); named.socket = new THREE.Object3D();
  { const k = sw[swIndex.KeyJ]; named.diode.position.set((k.mx + 4.5) * MM, Y.pcb[0] * MM, (k.mz + 8.2) * MM); }
  { const k = sw[swIndex.KeyL]; named.socket.position.set((k.mx - 0.6) * MM, (Y.pcb[1] - 1.8) * MM, (k.mz - 3.8) * MM); }
  pcbG.add(named.diode, named.socket);

  // matrix scan: glowing ribbons along each column and row trace
  const scanMat = () => new THREE.MeshBasicMaterial({ color: 0x4d7bff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ribbon = (pts, w = 0.9) => {
    const pos = [], idx = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
      pos.push((p[0] + nx) * MM, 0, (p[1] + nz) * MM, (p[0] - nx) * MM, 0, (p[1] - nz) * MM);
      if (i) { const j = i * 2; idx.push(j - 2, j - 1, j, j - 1, j + 1, j); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  };
  const cols = [], rows = [];
  for (let c = 0; c < 14; c++) {
    const ks = sw.filter(k => k.col === c).sort((a, b) => a.mz - b.mz);
    if (!ks.length) continue;
    const pts = []; ks.forEach(k => { pts.push([k.mx + 5.5, k.mz - 7], [k.mx + 5.5, k.mz + 7]); });
    const m = new THREE.Mesh(ribbon(pts), scanMat()); m.position.y = Y.pcb[0] * MM + 0.0006; m.renderOrder = 3; pcbG.add(m); cols[c] = m;
  }
  for (let r = 0; r < 5; r++) {
    const ks = sw.filter(k => k.row === r).sort((a, b) => a.mx - b.mx);
    const z = ks[0].mz + 9.6;
    const m = new THREE.Mesh(ribbon([[-W / 2 + 4, z], ...ks.map(k => [k.mx, z]), [W / 2 - 4, z]], 0.7), scanMat()); m.position.y = Y.pcb[0] * MM + 0.0006; m.renderOrder = 3; pcbG.add(m); rows[r] = m;
  }

  /* ---------------- RGB: one addressable LED per switch, light spilling onto the plate ---------------- */
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const leds = new THREE.InstancedMesh(box(3.4, 1.0, 2.8, 0, 0, 0, 0.3), ledMat, sw.length);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 1 });
  const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);
  const glows = new THREE.InstancedMesh(glowGeo, glowMat, sw.length);
  const LED_Z = -4.7; // under the LED window at the back of the switch
  sw.forEach((k, i) => {
    leds.setMatrixAt(i, M.makeTranslation(k.mx * MM, Y.pcb[0] * MM, (k.mz + LED_Z) * MM));
    glows.setMatrixAt(i, M.makeTranslation(k.mx * MM, (Y.plateTop + 0.25) * MM, k.mz * MM).scale(new THREE.Vector3((k.u * PITCH + 12) * MM, 1, (PITCH + 12) * MM)));
  });
  const ledCol = new Float32Array(sw.length * 3), glowCol = new Float32Array(sw.length * 3);
  leds.instanceColor = new THREE.InstancedBufferAttribute(ledCol, 3);
  glows.instanceColor = new THREE.InstancedBufferAttribute(glowCol, 3);
  glows.renderOrder = 4;
  pcbG.add(leds); layers.plate.add(glows);
  named.led = new THREE.Object3D(); { const k = sw[swIndex.KeyS]; named.led.position.set(k.mx * MM, (Y.pcb[0] + 1) * MM, (k.mz + LED_Z) * MM); } pcbG.add(named.led);
  // the data line: DOUT of each LED → DIN of the next, snaking through the rows
  const chainKeys = sw.slice().sort((a, b) => a.chainIdx - b.chainIdx);
  const chainPts = chainKeys.map(k => [k.mx, k.mz + LED_Z]);
  const chainGeo = ribbon(chainPts, 0.8), along = [], ledAlong = [0];
  { let s = 0; chainPts.forEach((p, i) => { if (i) { s += Math.hypot(p[0] - chainPts[i - 1][0], p[1] - chainPts[i - 1][1]); ledAlong.push(s); } along.push(s, s); }); }
  chainGeo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  const chainMat = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uOp: { value: 0 } },
    vertexShader: 'attribute float along; varying float vA; void main(){ vA = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uHead, uOp; varying float vA; void main(){ float d = uHead - vA; float g = d > 0.0 ? exp(-d / 26.0) : 0.0; float a = (0.16 + g * 1.6) * uOp; gl_FragColor = vec4(vec3(0.55, 0.72, 1.0) * a, a); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const chainLine = new THREE.Mesh(chainGeo, chainMat); chainLine.position.y = Y.pcb[0] * MM + 0.0008; chainLine.renderOrder = 3; pcbG.add(chainLine);
  named.chain = new THREE.Object3D(); { const k = chainKeys[9]; named.chain.position.set((k.mx + 9.5) * MM, Y.pcb[0] * MM, (k.mz + LED_Z) * MM); } pcbG.add(named.chain);

  /** colors: per key (same order as keys), glow: 0..1 brightness, chainPos: LEDs reached by the data packet */
  function setRgb(colors, glow, chainPos, chainOp) {
    for (let i = 0; i < sw.length * 3; i++) {
      ledCol[i] = Math.min(1, colors[i] * 1.6 + 0.02);
      glowCol[i] = colors[i] * glow * 1.7;
    }
    leds.instanceColor.needsUpdate = true; glows.instanceColor.needsUpdate = true;
    glows.visible = glow > 0.01;
    const ci = Math.min(ledAlong.length - 1, Math.floor(chainPos)), f = chainPos - ci;
    chainMat.uniforms.uHead.value = chainPos >= ledAlong.length ? 1e9 : lerp(ledAlong[ci], ledAlong[Math.min(ci + 1, ledAlong.length - 1)], f);
    chainMat.uniforms.uOp.value = chainOp; chainLine.visible = chainOp > 0.01;
  }

  /* ---------------- per-frame ---------------- */
  const IM = new THREE.Matrix4();
  let scanT = 0;
  /** press: { code: 0..1 }, scan: 0..1 glow, swEx: switch parts apart */
  function update(dt, { press, scan, swEx, colWave }) {
    // pressed keys push their stems (and stab stems) down 4 mm
    for (const k of sw) {
      const p = press[k.code] || 0, i = swIndex[k.code];
      if (p !== k._p) {
        k._p = p;
        swParts.stem.im.setMatrixAt(i, IM.makeTranslation(k.mx * MM, (Y.plateTop - p * 4) * MM, k.mz * MM));
        swParts.stem.im.instanceMatrix.needsUpdate = true;
      }
    }
    for (const s of stabStems) s.mesh.position.y = s.home - (press[s.key] || 0) * 4 * MM;
    swParts.top.o.position.y = swEx * 0.16;
    swParts.stem.o.position.y = swEx * 0.10;
    swParts.spring.o.position.y = swEx * 0.045;
    // scan: one column at a time, rows answer when a key in that column is held
    scanT += dt * (2 + 10 * scan);
    const active = Math.floor(scanT) % 14;
    cols.forEach((m, c) => { if (!m) return; const held = sw.some(k => k.col === c && (press[k.code] || 0) > 0.5); m.material.opacity = scan * (c === active ? 1 : 0.12 + 0.25 * Math.max(0, 1 - Math.abs(c - colWave * 13) / 2)) + (held ? 0.9 : 0); });
    rows.forEach((m, r) => { const held = sw.some(k => k.row === r && (press[k.code] || 0) > 0.5); m.material.opacity = scan * 0.22 + (held ? 0.85 : 0); });
    return active;
  }

  function setSwitchType(type, color) {
    mats.stem.color.set(color);
    swParts.stem.im.geometry = type === 'linear' ? geo.stem : geo.stemTactile;
  }

  const allMats = [plateMat, gasketMat, stabHousingMat, stabStemMat, wireMat, ...Object.values(mats), plateFoam.material, caseFoam.material, pcbMat, pcbEdge, blackMat, metalMat, socketMat, mcuTop.material, ledMat, glowMat];
  return { root, layers, named, update, setSwitchType, setRgb, geo, mats, allMats, size: { W: W * MM, D: D * MM }, swParts, cols };
}

/* ---------------- textures ---------------- */
function pcbTexture({ W, D, sw, renderer }) {
  const PX = 2048, PY = Math.round(PX * D / W), k = PX / W;
  const c = document.createElement('canvas'); c.width = PX; c.height = PY;
  const g = c.getContext('2d');
  const X = x => (x + W / 2) * k, Z = z => (z + D / 2) * k;
  // solder mask
  g.fillStyle = '#0d0f13'; g.fillRect(0, 0, PX, PY);
  // copper pour hatch (barely visible under the mask)
  g.strokeStyle = 'rgba(120,140,190,0.035)'; g.lineWidth = 1;
  for (let i = -PY; i < PX; i += 7) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + PY, PY); g.stroke(); }
  // traces
  g.strokeStyle = 'rgba(110,128,170,0.32)'; g.lineWidth = 0.32 * k; g.lineJoin = 'round';
  for (const s of sw) {
    g.beginPath(); g.moveTo(X(s.mx + 2.54), Z(s.mz - 5.08)); g.lineTo(X(s.mx + 5.5), Z(s.mz - 7)); g.lineTo(X(s.mx + 5.5), Z(s.mz + 7)); g.stroke();
    g.beginPath(); g.moveTo(X(s.mx - 3.81), Z(s.mz - 2.54)); g.lineTo(X(s.mx - 3.81), Z(s.mz + 4)); g.lineTo(X(s.mx + 2.7), Z(s.mz + 8.2)); g.stroke();
  }
  for (let r = 0; r < 5; r++) { const ks = sw.filter(s => s.row === r); const z = ks[0].mz + 9.6; g.beginPath(); g.moveTo(X(-W / 2 + 4), Z(z)); g.lineTo(X(W / 2 - 4), Z(z)); g.stroke(); }
  // footprints
  const gold = '#c9a24e';
  for (const s of sw) {
    g.strokeStyle = 'rgba(235,238,245,0.28)'; g.lineWidth = 0.15 * k; g.strokeRect(X(s.mx - 7), Z(s.mz - 7), 14 * k, 14 * k);
    g.fillStyle = '#050608'; g.beginPath(); g.arc(X(s.mx), Z(s.mz), 2.0 * k, 0, 7); g.fill();
    for (const [px, pz] of [[-3.81, -2.54], [2.54, -5.08]]) {
      g.fillStyle = gold; g.beginPath(); g.arc(X(s.mx + px), Z(s.mz + pz), 1.35 * k, 0, 7); g.fill();
      g.fillStyle = '#050608'; g.beginPath(); g.arc(X(s.mx + px), Z(s.mz + pz), 0.75 * k, 0, 7); g.fill();
    }
    for (const px of [-5.08, 5.08]) { g.fillStyle = '#050608'; g.beginPath(); g.arc(X(s.mx + px), Z(s.mz), 0.85 * k, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(235,238,245,0.3)'; g.lineWidth = 0.12 * k; g.strokeRect(X(s.mx - 2.4), Z(s.mz - 6.2), 4.8 * k, 3.0 * k);
    g.fillStyle = gold; for (const [px, pz] of [[-2.1, -5.9], [1.5, -5.9], [-2.1, -3.8], [1.5, -3.8]]) g.fillRect(X(s.mx + px), Z(s.mz + pz), 0.7 * k, 0.6 * k);
    g.fillStyle = gold; g.fillRect(X(s.mx + 2.3), Z(s.mz + 7.6), 1.2 * k, 1.2 * k); g.fillRect(X(s.mx + 5.6), Z(s.mz + 7.6), 1.2 * k, 1.2 * k);
    g.fillStyle = 'rgba(235,238,245,0.42)'; g.font = `${1.5 * k}px "JetBrains Mono", monospace`;
    g.fillText(`SW${s.i + 1}`, X(s.mx - 6.4), Z(s.mz - 4.8));
    g.fillText(`D${s.i + 1}`, X(s.mx + 7.4 - 6.4), Z(s.mz + 6.8));
  }
  // silkscreen branding under the spacebar
  const sp = sw.find(s => s.code === 'Space');
  g.fillStyle = 'rgba(235,238,245,0.7)';
  g.font = `600 ${7 * k}px Manrope, sans-serif`; g.fillText('K61', X(sp.mx - 46), Z(sp.mz + 3));
  g.font = `${1.7 * k}px "JetBrains Mono", monospace`;
  g.fillText('REV 2.0 · HOT-SWAP · QMK/VIA', X(sp.mx - 46), Z(sp.mz + 6.6));
  g.fillText('5 × 14 MATRIX · COL2ROW', X(sp.mx + 4), Z(sp.mz + 3.5));
  g.fillText('1.6 MM FR-4 · ENIG', X(sp.mx + 4), Z(sp.mz + 6.6));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.filter = 'blur(10px)'; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(26, 26, 76, 76, 14); g.fill();
  const t = new THREE.CanvasTexture(c); return t;
}

function chipTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#111317'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#c9cdd6'; g.font = '600 46px Manrope, sans-serif'; g.textAlign = 'center'; g.fillText('RP2040', 128, 120);
  g.font = '24px "JetBrains Mono", monospace'; g.fillStyle = '#7d828e'; g.fillText('B2 · 2614', 128, 162);
  g.beginPath(); g.arc(36, 36, 10, 0, 7); g.fillStyle = '#2a2d34'; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
