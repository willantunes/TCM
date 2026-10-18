// Procedural mannequin driven by poses: pelvis/torso angles + IK targets for hands and feet.
// World frame: Y up, the athlete faces +Z, the athlete's left side is +X. Units are metres.
import * as THREE from 'three';

const D = Math.PI / 180;

export const DIM = {
  thigh: 0.44, shin: 0.44, upper: 0.29, fore: 0.27,
  hipHalf: 0.095, shHalf: 0.19, lowSpine: 0.26, shY: 0.22, neck: 0.26,
};

export const MUSCLES = {
  chest: 'Chest', delts: 'Shoulders', traps: 'Traps', lats: 'Lats / upper back',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs',
  obliques: 'Obliques', lowerback: 'Lower back', glutes: 'Glutes', abductors: 'Hip abductors',
  adductors: 'Adductors', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves',
  cardio: 'Heart & lungs',
};

const mirror = (v) => (v ? [-v[0], v[1], v[2]] : v);

// Expand the authoring shorthand (h, f, ep, kp, fp) into a full canonical pose.
export function normalizePose(src) {
  const p = {
    p: src.p || [0, 0.94, 0],
    hip: src.hip ?? 0, spine: src.spine ?? 0, head: src.head ?? 0,
    yaw: src.yaw ?? 0, roll: src.roll ?? 0,
    hs: src.hs || 'world',
  };
  p.hl = src.hl || src.h || [0.22, 0.88, 0.03];
  p.hr = src.hr || mirror(src.h) || [-0.22, 0.88, 0.03];
  p.fl = src.fl || src.f || [0.11, 0.08, 0.02];
  p.fr = src.fr || mirror(src.f) || [-0.11, 0.08, 0.02];
  p.epl = src.epl || src.ep || [0.4, -0.3, -1];
  p.epr = src.epr || mirror(src.ep) || [-0.4, -0.3, -1];
  p.kpl = src.kpl || src.kp || [0.15, 0.2, 1];
  p.kpr = src.kpr || mirror(src.kp) || [-0.15, 0.2, 1];
  p.fpl = src.fpl ?? src.fp ?? 0;
  p.fpr = src.fpr ?? src.fp ?? 0;
  return p;
}

const lerp = (a, b, t) => a + (b - a) * t;
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

// Catmull-Rom blend across four canonical poses (pass the same pose twice to clamp an end).
export function blendPose(p0, p1, p2, p3, t) {
  const out = { hs: p1.hs };
  for (const k in p1) {
    if (k === 'hs') continue;
    const v = p1[k];
    if (Array.isArray(v)) out[k] = v.map((_, i) => cr(p0[k][i], v[i], p2[k][i], p3[k][i], t));
    else out[k] = cr(p0[k], v, p2[k], p3[k], t);
  }
  return out;
}

export function mixPose(a, b, t) {
  const out = { hs: a.hs };
  for (const k in a) {
    if (k === 'hs') continue;
    out[k] = Array.isArray(a[k]) ? a[k].map((x, i) => lerp(x, b[k][i], t)) : lerp(a[k], b[k], t);
  }
  return out;
}

// ---------- IK ----------
const _d = new THREE.Vector3(), _perp = new THREE.Vector3(), _pole = new THREE.Vector3();
function solveTwoBone(S, T, a, b, pole, outE, outEnd, outPerp) {
  _d.subVectors(T, S);
  let len = _d.length();
  const dir = _d.normalize();
  len = THREE.MathUtils.clamp(len, Math.abs(a - b) + 0.02, a + b - 0.0005);
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _pole.copy(pole).normalize();
  _perp.copy(_pole).addScaledVector(dir, -_pole.dot(dir));
  if (_perp.lengthSq() < 1e-6) _perp.set(0, 0, 1).addScaledVector(dir, -dir.z);
  _perp.normalize();
  outE.copy(S).addScaledVector(dir, a * cosA).addScaledVector(_perp, a * sinA);
  outEnd.copy(S).addScaledVector(dir, len);
  outPerp.copy(_perp);
}

// Orient a bone group: +Y along the bone, +Z toward the bone's "front" (muscle side).
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
function orientBone(obj, from, to, front) {
  _y.subVectors(to, from).normalize();
  _z.copy(front).addScaledVector(_y, -front.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  obj.position.copy(from);
  obj.quaternion.setFromRotationMatrix(_m);
}

// ---------- materials ----------
export function makeBodyMaterials(ghost = false) {
  if (ghost) {
    const g = new THREE.MeshBasicMaterial({ color: 0x7fb7ff, transparent: true, opacity: 0.16, depthWrite: false });
    return { skin: g, joint: g, muscle: () => g, ghost: true };
  }
  const skin = new THREE.MeshStandardMaterial({ color: 0xb9c2cf, roughness: 0.5, metalness: 0.08 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x8c96a5, roughness: 0.45, metalness: 0.15 });
  const muscleMats = {};
  const muscle = (key) => {
    if (!muscleMats[key]) muscleMats[key] = new THREE.MeshStandardMaterial({ color: 0xc6ced9, roughness: 0.42, metalness: 0.06, emissive: 0x000000 });
    return muscleMats[key];
  };
  return { skin, joint, muscle, muscleMats };
}

const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
const capsuleCache = new Map();
function capsule(r, len) {
  const k = r + ':' + len;
  if (!capsuleCache.has(k)) capsuleCache.set(k, new THREE.CapsuleGeometry(r, len, 6, 14));
  return capsuleCache.get(k);
}

export class Rig {
  constructor({ ghost = false } = {}) {
    this.group = new THREE.Group();
    this.mats = makeBodyMaterials(ghost);
    this.ghost = ghost;
    this.muscleMeshes = {};
    this.J = {};
    for (const n of ['pelvis', 'mid', 'neck', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'hipL', 'hipR', 'knL', 'knR', 'anL', 'anR', 'perpAL', 'perpAR', 'perpLL', 'perpLR'])
      this.J[n] = new THREE.Vector3();
    this.q1 = new THREE.Quaternion(); this.q2 = new THREE.Quaternion(); this.q3 = new THREE.Quaternion();
    this._build();
  }

  _mesh(geo, mat, parent, pos, scale, key) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    m.castShadow = !this.ghost;
    parent.add(m);
    if (key) (this.muscleMeshes[key] ||= []).push(m);
    return m;
  }
  _muscle(key, parent, pos, scale) {
    return this._mesh(sphereGeo, this.mats.muscle(key), parent, pos, scale, key);
  }

  _build() {
    const { skin, joint } = this.mats;
    const G = this.group;
    // pelvis + lower torso (frame q1)
    this.pelvisG = new THREE.Group(); G.add(this.pelvisG);
    this._mesh(sphereGeo, skin, this.pelvisG, [0, 0.0, 0], [0.165, 0.11, 0.115]);
    this._mesh(capsule(0.12, 0.12), skin, this.pelvisG, [0, 0.15, 0], [1.15, 1, 0.82]);
    this._muscle('glutes', this.pelvisG, [0.07, -0.02, -0.07], [0.085, 0.1, 0.07]);
    this._muscle('glutes', this.pelvisG, [-0.07, -0.02, -0.07], [0.085, 0.1, 0.07]);
    this._muscle('abductors', this.pelvisG, [0.14, 0.02, -0.01], [0.04, 0.07, 0.06]);
    this._muscle('abductors', this.pelvisG, [-0.14, 0.02, -0.01], [0.04, 0.07, 0.06]);
    this._muscle('abs', this.pelvisG, [0, 0.16, 0.08], [0.085, 0.14, 0.04]);
    this._muscle('obliques', this.pelvisG, [0.11, 0.15, 0.03], [0.04, 0.11, 0.06]);
    this._muscle('obliques', this.pelvisG, [-0.11, 0.15, 0.03], [0.04, 0.11, 0.06]);
    this._muscle('lowerback', this.pelvisG, [0.04, 0.15, -0.075], [0.04, 0.12, 0.04]);
    this._muscle('lowerback', this.pelvisG, [-0.04, 0.15, -0.075], [0.04, 0.12, 0.04]);
    // chest (frame q2)
    this.chestG = new THREE.Group(); G.add(this.chestG);
    this._mesh(sphereGeo, skin, this.chestG, [0, 0.13, 0], [0.165, 0.17, 0.115]);
    this._muscle('chest', this.chestG, [0.07, 0.17, 0.085], [0.075, 0.06, 0.04]);
    this._muscle('chest', this.chestG, [-0.07, 0.17, 0.085], [0.075, 0.06, 0.04]);
    this._muscle('lats', this.chestG, [0.08, 0.1, -0.075], [0.075, 0.13, 0.05]);
    this._muscle('lats', this.chestG, [-0.08, 0.1, -0.075], [0.075, 0.13, 0.05]);
    this._muscle('traps', this.chestG, [0, 0.235, -0.04], [0.12, 0.05, 0.06]);
    this._muscle('delts', this.chestG, [0.19, 0.225, 0], [0.058, 0.06, 0.06]);
    this._muscle('delts', this.chestG, [-0.19, 0.225, 0], [0.058, 0.06, 0.06]);
    // neck + head (frame q3)
    this.headG = new THREE.Group(); G.add(this.headG);
    this._mesh(capsule(0.045, 0.06), skin, this.headG, [0, 0.04, 0]);
    this._mesh(sphereGeo, skin, this.headG, [0, 0.17, 0.01], [0.093, 0.115, 0.105]);
    const visorMat = this.ghost ? skin : new THREE.MeshStandardMaterial({ color: 0x3b4452, roughness: 0.25, metalness: 0.5 });
    this._mesh(sphereGeo, visorMat, this.headG, [0, 0.185, 0.06], [0.07, 0.035, 0.06]);

    // limbs
    const limb = (len, r, muscles) => {
      const g = new THREE.Group(); G.add(g);
      this._mesh(capsule(r, len), skin, g, [0, len / 2, 0]);
      for (const [key, y, z, s] of muscles) this._muscle(key, g, [0, len * y, z], s);
      return g;
    };
    const U = DIM.upper, F = DIM.fore, T = DIM.thigh, S = DIM.shin;
    this.upperL = limb(U, 0.045, [['biceps', 0.55, 0.025, [0.035, 0.09, 0.035]], ['triceps', 0.5, -0.025, [0.036, 0.1, 0.036]]]);
    this.upperR = limb(U, 0.045, [['biceps', 0.55, 0.025, [0.035, 0.09, 0.035]], ['triceps', 0.5, -0.025, [0.036, 0.1, 0.036]]]);
    this.foreL = limb(F, 0.037, [['forearms', 0.3, 0.0, [0.042, 0.09, 0.04]]]);
    this.foreR = limb(F, 0.037, [['forearms', 0.3, 0.0, [0.042, 0.09, 0.04]]]);
    this.thighL = limb(T, 0.068, [['quads', 0.5, 0.03, [0.06, 0.17, 0.05]], ['hamstrings', 0.5, -0.03, [0.055, 0.16, 0.048]], ['adductors', 0.62, 0, [0.04, 0.12, 0.04]]]);
    this.thighR = limb(T, 0.068, [['quads', 0.5, 0.03, [0.06, 0.17, 0.05]], ['hamstrings', 0.5, -0.03, [0.055, 0.16, 0.048]], ['adductors', 0.62, 0, [0.04, 0.12, 0.04]]]);
    // adductors sit on the inner thigh; bone-local +X points medially on the left leg, laterally on the right
    this.thighL.children.at(-1).position.x = 0.045; this.thighR.children.at(-1).position.x = -0.045;
    this.shinL = limb(S, 0.045, [['calves', 0.7, -0.025, [0.045, 0.1, 0.045]]]);
    this.shinR = limb(S, 0.045, [['calves', 0.7, -0.025, [0.045, 0.1, 0.045]]]);
    // joints
    const jball = (r) => this._mesh(sphereGeo, joint, G, null, [r, r, r]);
    this.jElL = jball(0.042); this.jElR = jball(0.042);
    this.jKnL = jball(0.06); this.jKnR = jball(0.06);
    this.handL = this._mesh(sphereGeo, joint, G, null, [0.042, 0.05, 0.03]);
    this.handR = this._mesh(sphereGeo, joint, G, null, [0.042, 0.05, 0.03]);
    // feet
    const foot = () => {
      const g = new THREE.Group(); G.add(g);
      this._mesh(new THREE.BoxGeometry(0.09, 0.065, 0.25), joint, g, [0, -0.04, 0.065]);
      return g;
    };
    this.footL = foot(); this.footR = foot();
  }

  setPose(pose) {
    const J = this.J, q1 = this.q1, q2 = this.q2, q3 = this.q3;
    const e = new THREE.Euler();
    J.pelvis.set(...pose.p);
    q1.setFromEuler(e.set(pose.hip * D, pose.yaw * D, pose.roll * D, 'YXZ'));
    J.mid.set(0, DIM.lowSpine, 0).applyQuaternion(q1).add(J.pelvis);
    q2.copy(q1).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.spine * D));
    J.neck.set(0, DIM.neck, 0).applyQuaternion(q2).add(J.mid);
    q3.copy(q2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.head * D));
    J.shL.set(DIM.shHalf, DIM.shY, 0).applyQuaternion(q2).add(J.mid);
    J.shR.set(-DIM.shHalf, DIM.shY, 0).applyQuaternion(q2).add(J.mid);
    J.hipL.set(DIM.hipHalf, 0, 0).applyQuaternion(q1).add(J.pelvis);
    J.hipR.set(-DIM.hipHalf, 0, 0).applyQuaternion(q1).add(J.pelvis);

    this.pelvisG.position.copy(J.pelvis); this.pelvisG.quaternion.copy(q1);
    this.chestG.position.copy(J.mid); this.chestG.quaternion.copy(q2);
    this.headG.position.copy(J.neck); this.headG.quaternion.copy(q3);

    // hand targets may be expressed in chest or pelvis space
    const toWorld = (v) => {
      const t = new THREE.Vector3(...v);
      if (pose.hs === 'chest') return t.applyQuaternion(q2).add(J.mid);
      if (pose.hs === 'pelvis') return t.applyQuaternion(q1).add(J.pelvis);
      return t;
    };
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw * D);
    const pole = (v) => new THREE.Vector3(...v).applyQuaternion(yawQ);
    const tmpN = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpV = new THREE.Vector3();

    const arm = (sh, el, ha, perp, ep, target, upper, fore, jEl, hand) => {
      solveTwoBone(sh, toWorld(target), DIM.upper, DIM.fore, pole(ep), el, ha, perp);
      // muscle side of the arm faces away from the elbow pole
      tmpN.subVectors(el, sh).normalize().cross(perp).normalize();
      tmpF.copy(perp).negate();
      orientBone(upper, sh, el, tmpF);
      tmpV.subVectors(ha, el).normalize();
      tmpF.crossVectors(tmpN, tmpV).negate();
      orientBone(fore, el, ha, tmpF);
      jEl.position.copy(el);
      hand.position.copy(ha); hand.quaternion.copy(fore.quaternion);
    };
    arm(J.shL, J.elL, J.haL, J.perpAL, pose.epl, pose.hl, this.upperL, this.foreL, this.jElL, this.handL);
    arm(J.shR, J.elR, J.haR, J.perpAR, pose.epr, pose.hr, this.upperR, this.foreR, this.jElR, this.handR);

    const leg = (hip, kn, an, perp, kp, target, thigh, shin, jKn, foot, fp) => {
      solveTwoBone(hip, new THREE.Vector3(...target), DIM.thigh, DIM.shin, pole(kp), kn, an, perp);
      tmpN.subVectors(kn, hip).normalize().cross(perp).normalize();
      orientBone(thigh, hip, kn, perp);
      tmpV.subVectors(an, kn).normalize();
      tmpF.crossVectors(tmpN, tmpV);
      orientBone(shin, kn, an, tmpF);
      jKn.position.copy(kn);
      foot.position.copy(an);
      foot.quaternion.setFromEuler(e.set(-fp * D, pose.yaw * D, 0, 'YXZ'));
    };
    leg(J.hipL, J.knL, J.anL, J.perpLL, pose.kpl, pose.fl, this.thighL, this.shinL, this.jKnL, this.footL, pose.fpl);
    leg(J.hipR, J.knR, J.anR, J.perpLR, pose.kpr, pose.fr, this.thighR, this.shinR, this.jKnR, this.footR, pose.fpr);
  }

  // primary / secondary muscle highlight with an optional pulse (0..1)
  highlight(primary = [], secondary = [], pulse = 1) {
    if (this.ghost) return;
    for (const [key, mat] of Object.entries(this.mats.muscleMats)) {
      if (primary.includes(key)) {
        mat.color.setHex(0xff5a3c);
        mat.emissive.setHex(0xff3418).multiplyScalar(0.25 + 0.35 * pulse);
      } else if (secondary.includes(key)) {
        mat.color.setHex(0xffb547);
        mat.emissive.setHex(0xff9a1a).multiplyScalar(0.12 + 0.12 * pulse);
      } else {
        mat.color.setHex(0xc6ced9);
        mat.emissive.setHex(0x000000);
      }
    }
  }
}
