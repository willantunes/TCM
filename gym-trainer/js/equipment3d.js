// Procedural 3D models of the equipment. Each builder returns { group, update(u, J, time) }:
// u is rep progress (0 = start position, 1 = end position), J holds the athlete's joint positions,
// so handles, pads, bars and cables follow the body every frame.
import * as THREE from 'three';

const D = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const M = {
  frame: new THREE.MeshStandardMaterial({ color: 0xa9b1bc, metalness: 0.75, roughness: 0.32 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3a404a, metalness: 0.6, roughness: 0.4 }),
  pad: new THREE.MeshStandardMaterial({ color: 0x1d2025, metalness: 0.05, roughness: 0.75 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xf0b43c, metalness: 0.3, roughness: 0.35 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.95, roughness: 0.15 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x24272c, metalness: 0.1, roughness: 0.85 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.45, roughness: 0.5 }),
  cable: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.2, roughness: 0.6 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x0d2a3a, emissive: 0x1f8fff, emissiveIntensity: 0.35, roughness: 0.3 }),
  belt: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.95 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0x3d434d, roughness: 0.9 }),
  mat: new THREE.MeshStandardMaterial({ color: 0x2f5a73, roughness: 0.95 }),
  kb: new THREE.MeshStandardMaterial({ color: 0x2e3238, metalness: 0.5, roughness: 0.45 }),
};
export const ALL_MATS = Object.values(M);

// ---------- primitives ----------
function shadow(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function box(g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z); m.rotation.set(rx * D, ry * D, rz * D); g.add(m); return m;
}
function rbox(g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  // rounded pad: a box with a slightly smaller core and capsule-ish edges
  const r = Math.min(w, h, d) * 0.45;
  const grp = new THREE.Group();
  grp.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h - r * 0.6, d - r * 0.6), mat)));
  grp.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(w - r * 0.6, h, d - r * 0.6), mat)));
  grp.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(w - r * 0.6, h - r * 0.6, d), mat)));
  grp.position.set(x, y, z); grp.rotation.set(rx * D, ry * D, rz * D); g.add(grp); return grp;
}
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
function beam(g, a, b, r, mat) {
  const m = shadow(new THREE.Mesh(cylGeo, mat));
  setBeam(m, a, b, r); g.add(m); return m;
}
const _up = V(0, 1, 0), _dir = V(0, 0, 0);
function setBeam(m, a, b, r = m.userData.r) {
  _dir.subVectors(b, a);
  const len = Math.max(_dir.length(), 1e-4);
  m.userData.r = r;
  m.scale.set(r, len, r);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, _dir.normalize());
}
function cyl(g, r, len, mat, x, y, z, axis = 'y', seg = 24) {
  const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat));
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = 90 * D;
  if (axis === 'z') m.rotation.x = 90 * D;
  g.add(m); return m;
}
function post(g, x, z, h, r = 0.035, mat = M.frame, y0 = 0) { return beam(g, V(x, y0, z), V(x, y0 + h, z), r, mat); }
function base(g, w, d, z = 0) {
  box(g, w, 0.05, 0.08, M.dark, 0, 0.025, z - d / 2);
  box(g, w, 0.05, 0.08, M.dark, 0, 0.025, z + d / 2);
  box(g, 0.08, 0.05, d, M.dark, -w / 2, 0.025, z);
  box(g, 0.08, 0.05, d, M.dark, w / 2, 0.025, z);
}

// selectorized weight stack with guide rods; top plates rise with u
function stack(g, x, z, { h = 1.75, plates = 14, travel = 0.32 } = {}) {
  const sg = new THREE.Group(); sg.position.set(x, 0, z); g.add(sg);
  box(sg, 0.42, 0.06, 0.3, M.dark, 0, 0.03, 0);
  post(sg, -0.18, 0, h, 0.03); post(sg, 0.18, 0, h, 0.03);
  box(sg, 0.42, 0.06, 0.12, M.frame, 0, h, 0);
  beam(sg, V(-0.06, 0.06, 0), V(-0.06, h, 0), 0.008, M.chrome);
  beam(sg, V(0.06, 0.06, 0), V(0.06, h, 0), 0.008, M.chrome);
  const moving = new THREE.Group(); sg.add(moving);
  const lift = 6;
  for (let i = 0; i < plates; i++) {
    const y = 0.09 + i * 0.03;
    const parent = i >= plates - lift ? moving : sg;
    box(parent, 0.3, 0.026, 0.14, i === plates - 1 ? M.frame : M.plate, 0, y, 0);
  }
  cyl(moving, 0.01, 0.2, M.accent, 0, 0.09 + (plates - lift) * 0.03, 0.09, 'z');
  const cable = beam(sg, V(0, 0.1 + plates * 0.03, 0), V(0, h, 0), 0.006, M.cable);
  return (u) => {
    moving.position.y = u * travel;
    setBeam(cable, V(0, 0.1 + plates * 0.03 + u * travel, 0), V(0, h, 0));
  };
}

function seat(g, { y = 0.49, z = 0.12, w = 0.42, d = 0.4, back = true, backZ = -0.17, backY = 0.92, backH = 0.72, tilt = -8 } = {}) {
  rbox(g, w, 0.08, d, M.pad, 0, y - 0.04, z);
  beam(g, V(0, 0.05, z), V(0, y - 0.08, z), 0.04, M.frame);
  if (back) {
    rbox(g, 0.38, backH, 0.08, M.pad, 0, backY, backZ, tilt);
    beam(g, V(0, 0.05, backZ - 0.12), V(0, backY + 0.1, backZ - 0.1), 0.035, M.frame);
  }
}

function barbell(g, { plates = 1, len = 2.2, plateR = 0.225 } = {}) {
  const b = new THREE.Group(); g.add(b);
  cyl(b, 0.014, len * 0.6, M.chrome, 0, 0, 0, 'x');
  for (const s of [-1, 1]) {
    cyl(b, 0.025, len * 0.2, M.chrome, s * len * 0.4, 0, 0, 'x');
    cyl(b, 0.035, 0.03, M.chrome, s * len * 0.29, 0, 0, 'x');
    for (let i = 0; i < plates; i++) {
      const r = plateR - i * 0.04;
      cyl(b, r, 0.05, M.rubber, s * (len * 0.32 + 0.035 + i * 0.055), 0, 0, 'x', 32);
      cyl(b, r * 0.98, 0.052, M.accent, s * (len * 0.32 + 0.035 + i * 0.055), 0, 0, 'x', 32).scale.set(0.3, 1, 0.3);
    }
  }
  return b;
}
function dumbbell(g) {
  const d = new THREE.Group(); g.add(d);
  cyl(d, 0.016, 0.16, M.chrome, 0, 0, 0, 'x');
  for (const s of [-1, 1]) cyl(d, 0.065, 0.07, M.rubber, s * 0.115, 0, 0, 'x', 6);
  return d;
}
function kettlebell(g) {
  const k = new THREE.Group(); g.add(k);
  const ball = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 16), M.kb)); ball.position.y = -0.14; k.add(ball);
  const handle = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.013, 10, 24, Math.PI), M.kb)); handle.position.y = -0.06; k.add(handle);
  return k;
}
const mid = (a, b) => V(0, 0, 0).addVectors(a, b).multiplyScalar(0.5);

// ---------- builders ----------
export const BUILDERS = {
  'chest-press'() {
    const g = new THREE.Group(); base(g, 0.7, 1.0, -0.2);
    seat(g, {});
    post(g, 0, -0.5, 1.75, 0.05);
    beam(g, V(-0.36, 1.7, -0.5), V(0.36, 1.7, -0.5), 0.04, M.frame);
    const pivots = [V(0.34, 1.62, -0.32), V(-0.34, 1.62, -0.32)];
    for (const p of pivots) beam(g, V(p.x, 1.7, -0.5), p, 0.035, M.frame);
    const levers = pivots.map((p) => beam(g, p, p, 0.03, M.frame));
    const grips = pivots.map(() => cyl(g, 0.018, 0.16, M.accent, 0, 0, 0));
    const st = stack(g, -0.62, -0.3);
    return { group: g, update(u, J) {
      [J.haL, J.haR].forEach((h, i) => { setBeam(levers[i], pivots[i], V(h.x + (i ? -0.04 : 0.04), h.y + 0.08, h.z)); grips[i].position.copy(h); });
      st(u);
    } };
  },
  'pec-deck'({ reverse = false } = {}) {
    const g = new THREE.Group(); base(g, 0.7, 1.0, -0.15);
    seat(g, { back: !reverse });
    if (reverse) { rbox(g, 0.3, 0.45, 0.08, M.pad, 0, 1.0, 0.22); beam(g, V(0, 0.05, 0.42), V(0, 0.95, 0.27), 0.035, M.frame); }
    const pz = reverse ? 0.12 : -0.05;
    post(g, 0, -0.45, 2.0, 0.05);
    beam(g, V(0, 1.98, -0.45), V(0, 1.98, pz), 0.04, M.frame);
    beam(g, V(-0.22, 1.98, pz), V(0.22, 1.98, pz), 0.04, M.frame);
    const piv = [V(0.2, 1.98, pz), V(-0.2, 1.98, pz)];
    const shafts = piv.map((p) => beam(g, p, V(p.x, 1.8, p.z), 0.03, M.frame));
    const arms = piv.map((p) => beam(g, p, p, 0.03, M.frame));
    const drops = piv.map((p) => beam(g, p, p, 0.025, M.frame));
    const grips = piv.map(() => cyl(g, 0.02, 0.18, M.accent, 0, 0, 0));
    const st = stack(g, 0.66, -0.35);
    return { group: g, update(u, J) {
      [J.haL, J.haR].forEach((h, i) => {
        const top = V(h.x, 1.8, h.z), base0 = V(piv[i].x, 1.8, piv[i].z);
        setBeam(arms[i], base0, top); setBeam(drops[i], top, V(h.x, h.y + 0.09, h.z));
        grips[i].position.copy(h);
      });
      st(u);
    } };
  },
  'shoulder-press'() {
    const g = new THREE.Group(); base(g, 0.7, 1.0, -0.2);
    seat(g, { backY: 0.98, backH: 0.9, tilt: -10 });
    const piv = [V(0.32, 0.95, -0.45), V(-0.32, 0.95, -0.45)];
    post(g, 0.32, -0.45, 0.95, 0.04); post(g, -0.32, -0.45, 0.95, 0.04);
    const levers = piv.map((p) => beam(g, p, p, 0.03, M.frame));
    const grips = piv.map(() => cyl(g, 0.018, 0.15, M.accent, 0, 0, 0, 'z'));
    const st = stack(g, 0.7, -0.35);
    return { group: g, update(u, J) {
      [J.haL, J.haR].forEach((h, i) => { setBeam(levers[i], piv[i], V(h.x + (i ? -0.06 : 0.06), h.y, h.z - 0.05)); grips[i].position.copy(h); });
      st(u);
    } };
  },
  'lat-pulldown'() {
    const g = new THREE.Group(); base(g, 0.7, 1.0, -0.15);
    seat(g, { back: false, z: 0.1 });
    for (const s of [-1, 1]) cyl(g, 0.055, 0.2, M.pad, s * 0.15, 0.74, 0.34, 'x');
    beam(g, V(0, 0.05, 0.34), V(0, 0.72, 0.34), 0.03, M.frame);
    beam(g, V(-0.25, 0.74, 0.34), V(0.25, 0.74, 0.34), 0.02, M.frame);
    post(g, 0, -0.55, 2.4, 0.055);
    beam(g, V(0, 2.38, -0.55), V(0, 2.38, 0.12), 0.045, M.frame);
    cyl(g, 0.06, 0.03, M.dark, 0, 2.32, 0.1, 'x');
    const bar = new THREE.Group(); g.add(bar);
    cyl(bar, 0.016, 0.9, M.chrome, 0, 0, 0, 'x');
    for (const s of [-1, 1]) { const e = cyl(bar, 0.016, 0.22, M.chrome, s * 0.53, -0.04, 0, 'x'); e.rotation.z = (90 - s * 20) * D; }
    const cable = beam(g, V(0, 0, 0), V(0, 1, 0), 0.006, M.cable);
    const st = stack(g, 0, -0.55, { h: 2.35 });
    return { group: g, update(u, J) {
      const c = mid(J.haL, J.haR); bar.position.copy(c);
      setBeam(cable, V(0, 2.3, 0.1), c); st(u);
    } };
  },
  'seated-row'() {
    const g = new THREE.Group(); base(g, 0.7, 1.3, 0.15);
    seat(g, { back: false, y: 0.47 });
    rbox(g, 0.3, 0.48, 0.08, M.pad, 0, 1.0, 0.24);
    beam(g, V(0, 0.05, 0.5), V(0, 0.95, 0.3), 0.035, M.frame);
    box(g, 0.5, 0.04, 0.2, M.dark, 0, 0.1, 0.45, 20);
    post(g, 0, 0.75, 1.9, 0.05);
    beam(g, V(-0.3, 1.85, 0.75), V(0.3, 1.85, 0.75), 0.04, M.frame);
    const piv = [V(0.28, 1.85, 0.75), V(-0.28, 1.85, 0.75)];
    const levers = piv.map((p) => beam(g, p, p, 0.03, M.frame));
    const grips = piv.map(() => cyl(g, 0.018, 0.16, M.accent, 0, 0, 0));
    const st = stack(g, -0.7, 0.6);
    return { group: g, update(u, J) {
      [J.haL, J.haR].forEach((h, i) => { setBeam(levers[i], piv[i], V(h.x, h.y + 0.08, h.z)); grips[i].position.copy(h); });
      st(u);
    } };
  },
  'leg-press'() {
    const g = new THREE.Group(); base(g, 0.8, 1.7, 0.35);
    rbox(g, 0.44, 0.08, 0.38, M.pad, 0, 0.42, 0.06);
    beam(g, V(0, 0.05, 0.06), V(0, 0.38, 0.06), 0.045, M.frame);
    rbox(g, 0.42, 0.75, 0.08, M.pad, 0, 0.74, -0.31, -35);
    beam(g, V(0, 0.05, -0.55), V(0, 0.75, -0.38), 0.04, M.frame);
    for (const s of [-1, 1]) { beam(g, V(s * 0.33, 0.4, 0.3), V(s * 0.33, 0.4, 1.25), 0.025, M.chrome); cyl(g, 0.02, 0.18, M.accent, s * 0.32, 0.5, 0.05, 'z'); }
    const plat = new THREE.Group(); g.add(plat);
    box(plat, 0.56, 0.5, 0.04, M.dark, 0, 0.72, 0);
    box(plat, 0.56, 0.04, 0.12, M.frame, 0, 0.45, -0.04);
    post(g, 0, 1.35, 1.3, 0.05);
    const st = stack(g, 0.66, 0.9, { h: 1.4 });
    return { group: g, update(u, J) { plat.position.z = Math.max(J.anL.z, J.anR.z) + 0.06; st(u); } };
  },
  'leg-extension'({ curl = false } = {}) {
    const g = new THREE.Group(); base(g, 0.7, 1.0, 0);
    seat(g, { y: 0.51, z: 0.15, tilt: curl ? -14 : -4, backZ: curl ? -0.2 : -0.17 });
    for (const s of [-1, 1]) cyl(g, 0.018, 0.14, M.accent, s * 0.29, 0.52, 0.05, 'z');
    for (const s of [-1, 1]) beam(g, V(s * 0.29, 0.52, 0.0), V(s * 0.29, 0.52, 0.12), 0.02, M.frame);
    const piv = V(0.3, 0.6, 0.44);
    post(g, 0.3, 0.44, 0.6, 0.04);
    cyl(g, 0.04, 0.05, M.accent, piv.x, piv.y, piv.z, 'x');
    if (curl) { cyl(g, 0.055, 0.42, M.pad, 0, 0.74, 0.36, 'x'); beam(g, V(0.3, 0.6, 0.36), V(0.3, 0.74, 0.36), 0.025, M.frame); beam(g, V(0.22, 0.74, 0.36), V(0.3, 0.74, 0.36), 0.02, M.frame); }
    const lever = beam(g, piv, piv, 0.03, M.frame);
    const pad = cyl(g, 0.05, 0.36, M.pad, 0, 0, 0, 'x');
    const st = stack(g, -0.62, -0.3);
    return { group: g, update(u, J) {
      const k = mid(J.knL, J.knR), a = mid(J.anL, J.anR);
      const sd = V(0, 0, 0).subVectors(a, k).normalize();
      const front = V(0, sd.z, -sd.y).multiplyScalar(curl ? -0.075 : 0.075);
      const p = a.clone().add(front).addScaledVector(sd, -0.04);
      pad.position.set(0, p.y, p.z);
      setBeam(lever, piv, V(0.3, p.y, p.z)); st(u);
    } };
  },
  'leg-curl'() { return BUILDERS['leg-extension']({ curl: true }); },
  'hip-ab-ad'({ inner = false } = {}) {
    const g = new THREE.Group(); base(g, 0.8, 1.0, 0);
    seat(g, { tilt: -14, backY: 0.9 });
    const pads = [0, 1].map(() => rbox(g, 0.05, 0.2, 0.22, M.pad, 0, 0, 0));
    const pegs = [0, 1].map(() => box(g, 0.12, 0.03, 0.14, M.dark, 0, 0, 0));
    const arms = [0, 1].map(() => beam(g, V(0, 0, 0), V(0, 1, 0), 0.025, M.frame));
    const st = stack(g, 0, -0.5);
    return { group: g, update(u, J) {
      [[J.knL, J.anL, 1], [J.knR, J.anR, -1]].forEach(([k, a, s], i) => {
        const off = inner ? -0.08 : 0.08;
        pads[i].position.set(k.x + s * off, k.y, k.z - 0.02);
        pads[i].rotation.y = Math.atan2(k.x, 0.5) * 0.6;
        pegs[i].position.set(a.x, a.y - 0.07, a.z + 0.05);
        setBeam(arms[i], V(s * 0.06, 0.35, 0.32), V(k.x + s * off, k.y - 0.06, k.z));
      });
      st(u);
    } };
  },
  'ab-crunch'() {
    const g = new THREE.Group(); base(g, 0.7, 1.0, -0.15);
    seat(g, { tilt: 0, backY: 0.85, backH: 0.55 });
    box(g, 0.4, 0.04, 0.12, M.dark, 0, 0.12, 0.45);
    const piv = [V(0.3, 1.02, -0.18), V(-0.3, 1.02, -0.18)];
    for (const p of piv) post(g, p.x, p.z, 1.0, 0.035);
    const levers = piv.map((p) => beam(g, p, p, 0.028, M.frame));
    const grips = piv.map(() => cyl(g, 0.02, 0.12, M.accent, 0, 0, 0));
    const st = stack(g, 0.66, -0.35);
    return { group: g, update(u, J) {
      [J.haL, J.haR].forEach((h, i) => { setBeam(levers[i], piv[i], V(h.x + (i ? -0.05 : 0.05), h.y + 0.04, h.z)); grips[i].position.copy(h); });
      st(u);
    } };
  },
  'back-ext'() {
    const g = new THREE.Group(); base(g, 0.6, 1.3, -0.15);
    rbox(g, 0.42, 0.1, 0.3, M.pad, 0, 0.74, 0.13, 45);
    beam(g, V(0, 0.05, 0.35), V(0, 0.68, 0.16), 0.045, M.frame);
    beam(g, V(0, 0.05, -0.75), V(0, 0.68, 0.16), 0.045, M.frame);
    box(g, 0.4, 0.04, 0.24, M.dark, 0, 0.22, -0.61, -45);
    cyl(g, 0.045, 0.34, M.pad, 0, 0.33, -0.69, 'x');
    for (const s of [-1, 1]) cyl(g, 0.018, 0.2, M.accent, s * 0.3, 0.82, 0.3, 'z');
    return { group: g, update() {} };
  },
  'cable-tower'({ pulley = [0, 2.0, 0.55], attach = 'bar', dual = false } = {}) {
    const g = new THREE.Group();
    const pz = pulley[2];
    const xs = dual ? [Math.abs(pulley[0]), -Math.abs(pulley[0])] : [pulley[0]];
    for (const x of xs) {
      const cz = pz + Math.sign(pz || 1) * 0.12;
      post(g, x, cz, 2.25, 0.05);
      box(g, 0.4, 0.06, 0.4, M.dark, x, 0.03, cz);
      cyl(g, 0.055, 0.03, M.dark, x, pulley[1], pz, 'x');
      cyl(g, 0.02, 0.05, M.accent, x, pulley[1] - 0.12, cz, 'z');
    }
    if (dual) beam(g, V(xs[0], 2.25, pz + Math.sign(pz || 1) * 0.12), V(xs[1], 2.25, pz + Math.sign(pz || 1) * 0.12), 0.045, M.frame);
    const cables = xs.map(() => beam(g, V(0, 0, 0), V(0, 1, 0), 0.006, M.cable));
    let handle;
    if (attach === 'bar') handle = cyl(g, 0.015, 0.36, M.chrome, 0, 0, 0, 'x');
    else if (attach === 'rope') { handle = new THREE.Group(); g.add(handle); handle.userData.rope = [beam(handle, V(0, 0, 0), V(0, 1, 0), 0.016, M.cable), beam(handle, V(0, 0, 0), V(0, 1, 0), 0.016, M.cable)]; }
    const dh = dual ? xs.map(() => cyl(g, 0.017, 0.13, M.accent, 0, 0, 0)) : null;
    return { group: g, update(u, J) {
      if (dual) {
        [J.haL, J.haR].forEach((h, i) => { setBeam(cables[i], V(xs[i], pulley[1], pz), h); dh[i].position.copy(h); });
        return;
      }
      const c = mid(J.haL, J.haR), P = V(pulley[0], pulley[1], pz);
      setBeam(cables[0], P, c);
      if (attach === 'bar') handle.position.copy(c);
      if (attach === 'rope') { const [a, b] = handle.userData.rope; setBeam(a, c, J.haL); setBeam(b, c, J.haR); }
    } };
  },
  'arm-curl'() {
    const g = new THREE.Group(); base(g, 0.7, 0.9, 0.1);
    seat(g, { back: false, z: 0.05 });
    rbox(g, 0.5, 0.06, 0.34, M.pad, 0, 0.88, 0.22, 35);
    beam(g, V(0, 0.05, 0.4), V(0, 0.8, 0.28), 0.04, M.frame);
    const piv = [V(0.3, 0.88, 0.36), V(-0.3, 0.88, 0.36)];
    for (const p of piv) { beam(g, V(0, 0.8, 0.3), p, 0.03, M.frame); cyl(g, 0.035, 0.05, M.accent, p.x, p.y, p.z, 'x'); }
    const levers = piv.map((p) => beam(g, p, p, 0.025, M.frame));
    const bar = cyl(g, 0.017, 0.62, M.chrome, 0, 0, 0, 'x');
    const st = stack(g, 0.66, -0.25);
    return { group: g, update(u, J) {
      const c = mid(J.haL, J.haR); bar.position.copy(c);
      piv.forEach((p, i) => setBeam(levers[i], p, V(p.x, c.y, c.z))); st(u);
    } };
  },
  'assist-machine'() {
    const g = new THREE.Group(); base(g, 1.0, 1.0, -0.2);
    for (const s of [-1, 1]) {
      post(g, s * 0.45, -0.25, 2.5, 0.05);
      beam(g, V(s * 0.45, 2.42, -0.25), V(s * 0.3, 2.42, 0.06), 0.03, M.frame);
      cyl(g, 0.02, 0.16, M.accent, s * 0.3, 2.42, 0.08, 'x');
      beam(g, V(s * 0.45, 1.35, -0.25), V(s * 0.28, 1.35, 0.05), 0.03, M.frame);
      cyl(g, 0.02, 0.18, M.accent, s * 0.28, 1.35, 0.12, 'z');
      box(g, 0.2, 0.04, 0.3, M.dark, s * 0.3, 0.42, -0.1);
    }
    beam(g, V(-0.45, 2.5, -0.25), V(0.45, 2.5, -0.25), 0.045, M.frame);
    const pad = rbox(g, 0.4, 0.08, 0.36, M.pad, 0, 0, 0);
    const lever = beam(g, V(0, 0.55, -0.55), V(0, 1, 0), 0.035, M.frame);
    const st = stack(g, 0, -0.62, { h: 2.0 });
    return { group: g, update(u, J) {
      const k = mid(J.knL, J.knR);
      pad.position.set(0, k.y - 0.09, k.z - 0.12);
      setBeam(lever, V(0, 0.55, -0.55), V(0, k.y - 0.12, k.z - 0.2)); st(u);
    } };
  },
  'captains-chair'() {
    const g = new THREE.Group(); base(g, 0.8, 0.7, -0.05);
    for (const s of [-1, 1]) {
      post(g, s * 0.34, -0.25, 1.95, 0.045);
      beam(g, V(s * 0.34, 1.38, -0.25), V(s * 0.24, 1.38, -0.05), 0.03, M.frame);
      rbox(g, 0.1, 0.06, 0.32, M.pad, s * 0.24, 1.4, 0.1);
      cyl(g, 0.02, 0.13, M.accent, s * 0.22, 1.47, 0.3);
      beam(g, V(s * 0.34, 0.45, -0.25), V(s * 0.3, 0.45, 0.15), 0.03, M.frame);
      box(g, 0.14, 0.03, 0.2, M.dark, s * 0.3, 0.46, 0.12);
    }
    beam(g, V(-0.34, 1.95, -0.25), V(0.34, 1.95, -0.25), 0.04, M.frame);
    rbox(g, 0.34, 0.7, 0.07, M.pad, 0, 1.45, -0.19);
    return { group: g, update() {} };
  },
  bench({ along = 'z', z = 0, len = 1.2, y = 0.45, incline = 0, backLen = 0.75 } = {}) {
    const g = new THREE.Group();
    if (along === 'x') {
      rbox(g, len, 0.08, 0.3, M.pad, 0, y - 0.04, z);
      for (const s of [-1, 1]) { beam(g, V(s * len * 0.35, 0, z), V(s * len * 0.35, y - 0.08, z), 0.03, M.frame); box(g, 0.08, 0.04, 0.36, M.dark, s * len * 0.35, 0.02, z); }
    } else if (incline) {
      rbox(g, 0.3, 0.08, 0.35, M.pad, 0, y - 0.04, z + 0.12);
      rbox(g, 0.3, backLen, 0.08, M.pad, 0, y + Math.cos(incline * D) * backLen / 2 - 0.02, z - 0.16 - Math.sin(incline * D) * backLen / 2, -incline);
      beam(g, V(0, 0.03, z + 0.4), V(0, 0.03, z - 0.7), 0.035, M.dark);
      beam(g, V(0, 0.03, z + 0.12), V(0, y - 0.08, z + 0.12), 0.035, M.frame);
      beam(g, V(0, 0.03, z - 0.55), V(0, y + 0.1, z - 0.3), 0.03, M.frame);
    } else {
      rbox(g, 0.3, 0.08, len, M.pad, 0, y - 0.04, z);
      for (const s of [-1, 1]) { beam(g, V(0, 0, z + s * len * 0.38), V(0, y - 0.08, z + s * len * 0.38), 0.035, M.frame); box(g, 0.4, 0.04, 0.08, M.dark, 0, 0.02, z + s * len * 0.38); }
    }
    return g;
  },
  'bench-press'() {
    const g = new THREE.Group();
    g.add(BUILDERS.bench({ z: -0.25, len: 1.25, y: 0.45 }));
    for (const s of [-1, 1]) { post(g, s * 0.58, -0.62, 1.3, 0.04); box(g, 0.06, 0.08, 0.08, M.accent, s * 0.58, 1.12, -0.56); box(g, 0.1, 0.04, 0.5, M.dark, s * 0.58, 0.02, -0.62); }
    const bar = barbell(g, { plates: 2 });
    return { group: g, update(u, J) { bar.position.copy(mid(J.haL, J.haR)); } };
  },
  rack({ plates = 2 } = {}) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) for (const zz of [-0.55, 0.55]) post(g, s * 0.62, zz, 2.3, 0.04, M.dark);
    for (const s of [-1, 1]) {
      beam(g, V(s * 0.62, 2.3, -0.55), V(s * 0.62, 2.3, 0.55), 0.035, M.dark);
      beam(g, V(s * 0.62, 0.62, -0.6), V(s * 0.62, 0.62, 0.6), 0.025, M.chrome);
      box(g, 0.06, 0.06, 0.1, M.accent, s * 0.62, 1.32, 0.5);
    }
    beam(g, V(-0.62, 2.3, -0.55), V(0.62, 2.3, -0.55), 0.035, M.dark);
    box(g, 1.4, 0.03, 1.3, M.rubber, 0, 0.015, 0);
    const bar = barbell(g, { plates });
    return { group: g, update(u, J) { bar.position.copy(mid(J.haL, J.haR)); } };
  },
  'free-bar'({ plates = 1 } = {}) {
    const g = new THREE.Group();
    box(g, 1.6, 0.03, 1.4, M.rubber, 0, 0.015, 0);
    const bar = barbell(g, { plates });
    return { group: g, update(u, J) { bar.position.copy(mid(J.haL, J.haR)); } };
  },
  smith() {
    const g = new THREE.Group(); base(g, 1.7, 0.9, 0);
    for (const s of [-1, 1]) { post(g, s * 0.8, -0.35, 2.25, 0.045); post(g, s * 0.8, 0.35, 2.25, 0.045); beam(g, V(s * 0.72, 0.05, 0), V(s * 0.72, 2.2, 0), 0.02, M.chrome); }
    beam(g, V(-0.8, 2.25, -0.35), V(0.8, 2.25, -0.35), 0.04, M.frame);
    beam(g, V(-0.8, 2.25, 0.35), V(0.8, 2.25, 0.35), 0.04, M.frame);
    const bar = barbell(g, { plates: 1, len: 1.9 });
    const carriers = [-1, 1].map((s) => box(g, 0.08, 0.12, 0.08, M.accent, s * 0.72, 0, 0));
    return { group: g, update(u, J) {
      const c = mid(J.haL, J.haR); bar.position.set(0, c.y, c.z);
      carriers.forEach((m) => { m.position.y = c.y; m.position.z = c.z; });
    } };
  },
  dumbbells({ rack = true, bench: withBench = null } = {}) {
    const g = new THREE.Group();
    if (withBench) g.add(BUILDERS.bench(withBench));
    if (rack) {
      const r = new THREE.Group(); r.position.set(1.25, 0, -0.6); r.rotation.y = -60 * D; g.add(r);
      for (const s of [-1, 1]) beam(r, V(s * 0.6, 0, 0), V(s * 0.6, 0.8, 0), 0.03, M.dark);
      box(r, 1.25, 0.03, 0.3, M.dark, 0, 0.55, 0, 15); box(r, 1.25, 0.03, 0.3, M.dark, 0, 0.82, -0.12, 15);
      for (let i = 0; i < 5; i++) { const d = dumbbell(r); d.position.set(-0.48 + i * 0.24, 0.62, 0.02); d.rotation.y = 90 * D; d.scale.setScalar(0.75 + i * 0.07); }
    }
    const dl = dumbbell(g), dr = dumbbell(g);
    return { group: g, update(u, J, t, rig) {
      dl.position.copy(J.haL); dr.position.copy(J.haR);
      // handle runs across the palm: the forearm's local X axis
      if (rig) { dl.quaternion.copy(rig.foreL.quaternion); dr.quaternion.copy(rig.foreR.quaternion); }
    } };
  },
  'goblet-db'() {
    const g = new THREE.Group();
    const d = dumbbell(g); d.rotation.z = 90 * D;
    return { group: g, update(u, J) { d.position.copy(mid(J.haL, J.haR)).add(V(0, -0.05, 0.03)); } };
  },
  kettlebell() {
    const g = new THREE.Group();
    box(g, 1.2, 0.03, 1.4, M.rubber, 0, 0.015, 0);
    const k = kettlebell(g);
    return { group: g, update(u, J) {
      const c = mid(J.haL, J.haR); k.position.copy(c);
      const sh = mid(J.shL, J.shR); const dir = V(0, 0, 0).subVectors(c, sh).normalize();
      k.quaternion.setFromUnitVectors(V(0, -1, 0), dir);
    } };
  },
  'hip-thrust'() {
    const g = new THREE.Group();
    g.add(BUILDERS.bench({ along: 'x', z: -0.36, len: 1.2, y: 0.42 }));
    box(g, 1.6, 0.03, 1.2, M.rubber, 0, 0.015, 0.2);
    const bar = barbell(g, { plates: 2 });
    cyl(bar, 0.05, 0.4, M.pad, 0, 0, 0, 'x');
    return { group: g, update(u, J) { bar.position.copy(mid(J.haL, J.haR)); } };
  },
  mat({ z = 0 } = {}) {
    const g = new THREE.Group();
    box(g, 0.65, 0.012, 1.9, M.mat, 0, 0.006, z);
    return { group: g, update() {} };
  },
  treadmill() {
    const g = new THREE.Group();
    box(g, 0.86, 0.12, 2.0, M.dark, 0, 0.09, 0.05);
    box(g, 0.56, 0.02, 1.8, M.belt, 0, 0.16, 0.05);
    for (const s of [-1, 1]) { box(g, 0.14, 0.03, 1.9, M.frame, s * 0.35, 0.165, 0.05); beam(g, V(s * 0.36, 0.15, 0.95), V(s * 0.36, 1.25, 0.82), 0.035, M.frame); beam(g, V(s * 0.36, 1.05, 0.83), V(s * 0.36, 1.05, 0.35), 0.022, M.chrome); }
    box(g, 0.86, 0.36, 0.1, M.dark, 0, 1.35, 0.82, -25);
    box(g, 0.5, 0.25, 0.02, M.screen, 0, 1.37, 0.77, -25);
    box(g, 0.86, 0.14, 0.24, M.dark, 0, 0.12, 1.0);
    const stripes = [];
    for (let i = 0; i < 10; i++) stripes.push(box(g, 0.54, 0.004, 0.03, M.stripe, 0, 0.172, 0));
    return { group: g, update(u, J, t) {
      stripes.forEach((s, i) => { s.position.z = 0.9 - ((t * 2.6 + i * 0.18) % 1.8); });
    } };
  },
  bike() {
    const g = new THREE.Group();
    box(g, 0.5, 0.05, 0.14, M.dark, 0, 0.03, -0.35); box(g, 0.5, 0.05, 0.14, M.dark, 0, 0.03, 0.75);
    beam(g, V(0, 0.05, -0.35), V(0, 0.5, 0.0), 0.05, M.frame);
    beam(g, V(0, 0.05, 0.75), V(0, 0.5, 0.45), 0.05, M.frame);
    beam(g, V(0, 0.5, 0.0), V(0, 0.82, -0.04), 0.03, M.chrome);
    rbox(g, 0.18, 0.06, 0.26, M.pad, 0, 0.85, -0.02);
    const fly = cyl(g, 0.24, 0.1, M.dark, 0, 0.5, 0.5, 'x', 32);
    beam(g, V(0, 0.55, 0.55), V(0, 1.05, 0.48), 0.035, M.frame);
    beam(g, V(-0.25, 1.05, 0.48), V(0.25, 1.05, 0.48), 0.02, M.chrome);
    box(g, 0.24, 0.16, 0.04, M.dark, 0, 1.16, 0.56, -25); box(g, 0.18, 0.1, 0.01, M.screen, 0, 1.17, 0.54, -25);
    const C = V(0, 0.32, 0.3);
    cyl(g, 0.06, 0.12, M.dark, C.x, C.y, C.z, 'x');
    const cranks = [0, 1].map(() => beam(g, C, C, 0.016, M.chrome));
    const pedals = [0, 1].map(() => box(g, 0.1, 0.02, 0.12, M.accent, 0, 0, 0));
    return { group: g, update(u, J, t) {
      [J.anL, J.anR].forEach((a, i) => { const p = V(i ? -0.13 : 0.13, a.y - 0.08, a.z + 0.04); setBeam(cranks[i], V(p.x, C.y, C.z), p); pedals[i].position.copy(p); });
      fly.rotation.x = t * 6;
    } };
  },
  rower() {
    const g = new THREE.Group();
    box(g, 0.14, 0.05, 2.1, M.frame, 0, 0.3, 0.1);
    beam(g, V(0, 0, -0.95), V(0, 0.3, -0.95), 0.03, M.dark); box(g, 0.5, 0.04, 0.1, M.dark, 0, 0.02, -0.95);
    const seatM = rbox(g, 0.28, 0.05, 0.3, M.pad, 0, 0.34, 0);
    const fly = cyl(g, 0.24, 0.16, M.dark, 0, 0.42, 1.0, 'x', 32);
    box(g, 0.6, 0.05, 0.12, M.dark, 0, 0.025, 1.0);
    for (const s of [-1, 1]) box(g, 0.13, 0.03, 0.26, M.dark, s * 0.11, 0.28, 0.6, -45);
    beam(g, V(0, 0.6, 0.95), V(0, 0.95, 0.85), 0.02, M.frame); box(g, 0.2, 0.14, 0.02, M.screen, 0, 1.0, 0.82, -20);
    const handle = cyl(g, 0.018, 0.5, M.accent, 0, 0, 0, 'x');
    const chain = beam(g, V(0, 0, 0), V(0, 1, 0), 0.005, M.cable);
    return { group: g, update(u, J, t) {
      seatM.position.z = J.pelvis.z - 0.02;
      const c = mid(J.haL, J.haR); handle.position.copy(c);
      setBeam(chain, c, V(0, 0.55, 0.88)); fly.rotation.x = t * 5;
    } };
  },
  elliptical() {
    const g = new THREE.Group();
    box(g, 0.7, 0.08, 1.8, M.dark, 0, 0.05, 0.2);
    box(g, 0.6, 0.6, 0.35, M.dark, 0, 0.4, 0.95);
    beam(g, V(0, 0.6, 0.95), V(0, 1.3, 0.75), 0.04, M.frame);
    box(g, 0.32, 0.2, 0.05, M.dark, 0, 1.35, 0.72, -25); box(g, 0.24, 0.12, 0.01, M.screen, 0, 1.36, 0.69, -25);
    const pedals = [0, 1].map(() => box(g, 0.13, 0.03, 0.34, M.accent, 0, 0, 0));
    const links = [0, 1].map(() => beam(g, V(0, 0, 0), V(0, 1, 0), 0.025, M.frame));
    const poles = [0, 1].map(() => beam(g, V(0, 0, 0), V(0, 1, 0), 0.025, M.chrome));
    return { group: g, update(u, J) {
      [[J.anL, J.haL, 1], [J.anR, J.haR, -1]].forEach(([a, h, s], i) => {
        const p = V(s * 0.12, a.y - 0.085, a.z + 0.06); pedals[i].position.copy(p);
        setBeam(poles[i], V(s * 0.27, 0.35, 0.62 + (0.62 - h.z) * 0.6), V(h.x, h.y + 0.05, h.z));
        setBeam(links[i], V(p.x, p.y, p.z + 0.12), V(s * 0.25, 0.4, 0.9));
      });
    } };
  },
  stair() {
    const g = new THREE.Group();
    box(g, 0.8, 0.08, 1.0, M.dark, 0, 0.04, 0.1);
    for (const s of [-1, 1]) beam(g, V(s * 0.3, 0.08, 0.55), V(s * 0.12, 1.25, 0.72), 0.04, M.dark);
    for (let i = 0; i < 3; i++) box(g, 0.56, 0.04, 0.24, M.stripe, 0, 0.12 + i * 0.16, 0.5 + i * 0.14);
    for (const s of [-1, 1]) { beam(g, V(s * 0.4, 0.08, 0.6), V(s * 0.4, 1.05, 0.45), 0.03, M.frame); beam(g, V(s * 0.4, 1.05, 0.45), V(s * 0.4, 1.05, -0.05), 0.022, M.chrome); }
    box(g, 0.36, 0.22, 0.05, M.dark, 0, 1.35, 0.72, -20); box(g, 0.28, 0.14, 0.01, M.screen, 0, 1.36, 0.69, -20);
    const steps = [0, 1].map(() => box(g, 0.24, 0.04, 0.3, M.accent, 0, 0, 0));
    return { group: g, update(u, J) {
      [J.anL, J.anR].forEach((a, i) => steps[i].position.set(i ? -0.12 : 0.12, a.y - 0.095, a.z + 0.06));
    } };
  },
};

export function buildEquipment(key, opts) {
  const b = BUILDERS[key];
  if (!b) return { group: new THREE.Group(), update() {} };
  const res = b(opts || {});
  if (res instanceof THREE.Object3D) return { group: res, update() {} };
  return res;
}
