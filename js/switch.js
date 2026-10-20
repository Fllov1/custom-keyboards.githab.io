import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* MX-style switch, built in millimetres × 0.01 (1 mm = 0.01 scene units).
   Origin = centre of the switch on the plate's top surface; +y up, −z = towards the back of the board. */
export const MM = 0.01;
const lerp = THREE.MathUtils.lerp;

/** Box whose footprint tapers from (w0×d0) at the bottom to (w1×d1) at the top; r > 0 rounds the edges (mm). */
export function taper(w0, d0, w1, d1, h, y0, x = 0, z = 0, r = 0) {
  const g = r > 0 ? new RoundedBoxGeometry(w0, h, d0, 2, Math.min(r, h / 2.01, w0 / 2.01, d0 / 2.01)) : new THREE.BoxGeometry(w0, h, d0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h + 0.5;
    p.setXYZ(i, (x + p.getX(i) * lerp(1, w1 / w0, t)) * MM, (y0 + t * h) * MM, (z + p.getZ(i) * lerp(1, d1 / d0, t)) * MM);
  }
  if (!r) g.computeVertexNormals();
  return g;
}
export const box = (w, h, d, x, y, z, r = 0) => taper(w, d, w, d, h, y, x, z, r);
function cyl(r, h, y0, x = 0, z = 0, seg = 18) {
  const g = new THREE.CylinderGeometry(r * MM, r * MM, h * MM, seg);
  g.translate(x * MM, (y0 + h / 2) * MM, z * MM);
  return g;
}
const clean = g => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };
const merge = (list, groups = false) => mergeGeometries(list.map(clean), groups);

/* ---------- part geometries (shared by the 61 instanced switches and the big hero switch) ---------- */
export function switchGeometries() {
  // top housing: flange that sits on the plate + tapered body with a stem window
  const top = merge([
    taper(15.6, 15.6, 15.4, 15.4, 0.9, 0, 0, 0, 0.6),
    taper(14.4, 14.4, 10.4, 12.2, 5.0, 0.6, 0, 0, 1.2),
    box(4.6, 0.5, 2.6, 0, 5.3, -4.0, 0.4), // LED window
  ]);
  // bottom housing (nylon) + centre post; metal pins are a second group
  const bottomBody = merge([
    taper(13.6, 13.6, 14.0, 14.0, 5.0, -5.0, 0, 0, 0.7),
    cyl(2.0, 3.3, -8.3), // centre post
    box(0.9, 2.2, 4.2, 7.1, -2.6, 0, 0.3), box(0.9, 2.2, 4.2, -7.1, -2.6, 0, 0.3), // plate clips
  ]);
  const pins = merge([cyl(0.75, 3.4, -8.4, -3.81, -2.54, 10), cyl(0.75, 3.4, -8.4, 2.54, -5.08, 10)]);
  const bottom = mergeGeometries([bottomBody, pins], true);
  // stem: body + "+" cross the keycap clicks onto + two legs that ride the contact leaf
  const stemParts = [
    box(7.2, 1.6, 4.6, 0, 1.0, 0.3, 0.4), box(5.0, 3.2, 5.0, 0, 1.6, 0.3, 0.5),
    box(4.1, 3.9, 1.3, 0, 4.6, 0, 0.25), box(1.3, 3.9, 4.1, 0, 4.6, 0, 0.25),
    box(1.1, 3.6, 1.0, -1.9, -2.4, 2.6, 0.3), box(1.1, 3.6, 1.0, 1.9, -2.4, 2.6, 0.3),
  ];
  const stem = merge(stemParts);
  // tactile bump on the legs (only on the tactile stem)
  const stemTactile = merge([...stemParts, box(1.1, 0.9, 0.7, -1.9, -1.6, 3.4, 0.3), box(1.1, 0.9, 0.7, 1.9, -1.6, 3.4, 0.3)]);
  // spring: steel helix
  const pts = [], turns = 8.5, N = 140, y0 = -4.6, y1 = 3.4;
  for (let i = 0; i <= N; i++) { const t = i / N, a = t * turns * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 2.3 * MM, lerp(y0, y1, t) * MM, Math.sin(a) * 2.3 * MM)); }
  const spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.24 * MM, 6, false);
  // contact leaves (copper alloy) — the actual "switch": the stem leg lets them touch at 2 mm
  const leaves = merge([
    box(0.35, 5.2, 4.0, -3.4, -4.6, -1.2), box(0.35, 4.4, 4.0, -4.3, -4.6, 1.6),
    box(2.8, 0.35, 4.0, -3.0, 0.4, -1.2),
  ]);
  return { top, bottom, stem, stemTactile, spring, leaves };
}

export const SWITCH_TYPES = {
  linear: { name: 'Лінійний', stem: '#e2b23b', force: 45, label: 'Плавний хід без перешкод — для швидкого набору та ігор.' },
  tactile: { name: 'Тактильний', stem: '#8a5534', force: 55, label: 'Відчутна «сходинка» на 2 мм — пальці знають, що спрацювало.' },
  clicky: { name: 'Клікаючий', stem: '#2f62ff', force: 60, label: 'Сходинка й гучний клік — як у друкарській машинці.' },
};

/** Force (g) at travel x (mm) for each switch type — used by the curve chart and the hero switch. */
export function forceAt(type, x) {
  const base = 32 + x * 6.5; // spring preload + rate
  if (type === 'tactile') return base + 22 * Math.exp(-((x - 1.4) ** 2) / 0.25) - (x > 1.6 && x < 2.6 ? 6 : 0);
  if (type === 'clicky') return base + 30 * Math.exp(-((x - 1.6) ** 2) / 0.12) - (x > 1.8 && x < 2.6 ? 12 : 0);
  return base;
}

/* ---------- materials ---------- */
export function switchMaterials() {
  return {
    top: new THREE.MeshPhysicalMaterial({ color: 0x8c94a8, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false }),
    topSolid: new THREE.MeshStandardMaterial({ color: 0x3b4150, roughness: 0.3, metalness: 0.05 }),
    bottom: new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.5 }),
    pins: new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.25, metalness: 1 }),
    stem: new THREE.MeshStandardMaterial({ color: SWITCH_TYPES.linear.stem, roughness: 0.42 }),
    spring: new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.22, metalness: 1 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0xd08a52, roughness: 0.3, metalness: 1, emissive: 0x3d6bff, emissiveIntensity: 0 }),
  };
}

/** The big switch shown on its own (anatomy chapter). Parts are named for hotspots. */
export function createHeroSwitch(geo, mats) {
  const root = new THREE.Group(); root.name = 'heroSwitch';
  const part = (g, m, name) => { const o = new THREE.Group(); const mesh = new THREE.Mesh(g, m); o.add(mesh); o.name = name; root.add(o); return o; };
  const bottom = part(geo.bottom, [mats.bottom, mats.pins], 'hBottom');
  const leaves = part(geo.leaves, mats.leaves, 'hLeaf');
  const spring = part(geo.spring, mats.spring, 'hSpring');
  const stem = part(geo.stem, mats.stem, 'hStem');
  const top = part(geo.top, mats.top, 'hTop');
  // RGB LED on the PCB under the switch: shines up through the LED window of the top housing
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const led = part(box(3.4, 1.0, 2.8, 0, -6.2, -4.7, 0.3), ledMat, 'hLed');
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(3.2 * MM, 16, 12), glowMat); glow.position.set(0, -5.4 * MM, -4.7 * MM); glow.scale.y = 0.5; led.add(glow);
  top.children[0].renderOrder = 2;
  const stemMesh = stem.children[0];
  let type = 'linear';

  /** ex: 0..1 exploded; travel: 0..4 mm pressed */
  function update(ex, travel) {
    const t = travel * MM;
    bottom.position.y = 0;
    leaves.position.set(-ex * 0.07, ex * 0.01, 0);
    spring.position.y = ex * 0.065;
    spring.scale.y = (8 - travel) / 8; // 8 mm helix compresses with the stem, bottom stays put
    spring.position.y += -4.6 * MM * (1 - spring.scale.y);
    stem.position.y = ex * 0.145 - t;
    top.position.y = ex * 0.235;
    leaves.children[0].material.emissiveIntensity = travel >= 2 ? 0.7 : 0;
  }
  function setType(tp) {
    type = tp; mats.stem.color.set(SWITCH_TYPES[tp].stem);
    stemMesh.geometry = tp === 'linear' ? geo.stem : geo.stemTactile;
  }
  update(0, 0);
  function setLed(color, k) {
    ledMat.color.copy(color); glowMat.color.copy(color);
    mats.top.emissive.copy(color).multiplyScalar(0.35 * k);
  }
  return { root, update, setType, setLed, named: { hBottom: bottom, hLeaf: leaves, hSpring: spring, hStem: stem, hTop: top, hLed: led }, get type() { return type; } };
}
