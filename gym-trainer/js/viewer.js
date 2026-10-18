// 3D stage: renders the mannequin + equipment and plays an exercise as a timeline (the "4th dimension").
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Rig, normalizePose, blendPose } from './rig.js';
import { buildEquipment, ALL_MATS } from './equipment3d.js';
import { modelFor } from './exercises.js';

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

// Sample a pose along a key path. s in [0,1] for rep paths; cyclic paths wrap.
export function samplePath(keys, s, cyclic) {
  const n = keys.length;
  if (n === 1) return keys[0];
  if (cyclic) {
    const x = (((s % 1) + 1) % 1) * n, i = Math.floor(x), f = x - i;
    const k = (j) => keys[((j % n) + n) % n];
    return blendPose(k(i - 1), k(i), k(i + 1), k(i + 2), f);
  }
  const x = Math.min(0.99999, Math.max(0, s)) * (n - 1), i = Math.floor(x), f = x - i;
  const k = (j) => keys[Math.max(0, Math.min(n - 1, j))];
  return blendPose(k(i - 1), k(i), k(i + 1), k(i + 2), f);
}

// Timeline of a single rep: hold at start → lift → hold → lower.
export function repTimeline(ex) {
  const t = ex.tempo || { up: 1.2, down: 2 };
  const hold0 = 0.35, hold1 = t.hold ?? 0.3;
  return { hold0, up: t.up, hold1, down: t.down, total: hold0 + t.up + hold1 + t.down };
}
export function phaseAt(ex, time) {
  if (ex.cycle) {
    const s = time / ex.period;
    return { s, u: 0.5 + 0.5 * Math.sin(s * Math.PI * 2), phase: 'cycle', rep: Math.floor(s), frac: s % 1 };
  }
  const tl = repTimeline(ex);
  const rep = Math.floor(time / tl.total);
  let t = time - rep * tl.total;
  if (t < tl.hold0) return { s: 0, u: 0, phase: 'ready', rep, frac: t / tl.total };
  t -= tl.hold0;
  if (t < tl.up) { const s = ease(t / tl.up); return { s, u: s, phase: 'lift', rep, frac: (tl.hold0 + t) / tl.total }; }
  t -= tl.up;
  if (t < tl.hold1) return { s: 1, u: 1, phase: 'hold', rep, frac: (tl.hold0 + tl.up + t) / tl.total };
  t -= tl.hold1;
  const s = 1 - ease(t / tl.down);
  return { s, u: s, phase: 'lower', rep, frac: (tl.total - tl.down + t) / tl.total };
}

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1b2028'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Stage {
  constructor({ antialias = true, shadows = true, preserve = false } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias, alpha: false, preserveDrawingBuffer: preserve });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x12161c);
    this.scene.fog = new THREE.Fog(0x12161c, 6, 14);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2420, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.5, 4.5, 3); key.castShadow = shadows;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 12 });
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.1); rim.position.set(-3, 2.5, -3); this.scene.add(rim);
    const fill = new THREE.PointLight(0xffc27a, 0.6, 8); fill.position.set(-1.5, 1.2, 2.5); this.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.92, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.58, 96), new THREE.MeshBasicMaterial({ color: 0xf0b43c, transparent: true, opacity: 0.35 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; this.scene.add(ring);

    this.world = new THREE.Group(); this.scene.add(this.world);
    this.rig = new Rig(); this.world.add(this.rig.group);
    this.ghostA = new Rig({ ghost: true }); this.ghostB = new Rig({ ghost: true });
    this.world.add(this.ghostA.group, this.ghostB.group);
    this.ghostA.group.visible = this.ghostB.group.visible = false;
    this.equip = null; this.ex = null; this.keys = [];
  }
  setTheme(bg) {
    this.scene.background.set(bg); this.scene.fog.color.set(bg);
  }
  setExercise(ex) {
    this.ex = ex;
    this.keys = ex.keys.map(normalizePose);
    if (this.equip) { this.world.remove(this.equip.group); this.equip.group.traverse((o) => o.geometry?.dispose?.()); }
    const { key, opts } = modelFor(ex);
    this.equip = buildEquipment(key, opts);
    this.world.add(this.equip.group);
    this.ghostA.setPose(this.keys[0]); this.ghostB.setPose(this.keys[this.keys.length - 1]);
    this.rig.highlight(ex.primary, ex.secondary, 0.5);
  }
  poseAt(time) {
    const ph = phaseAt(this.ex, time);
    const pose = samplePath(this.keys, ph.s, !!this.ex.cycle);
    this.rig.setPose(pose);
    this.equip.update(ph.u, this.rig.J, time, this.rig);
    return ph;
  }
  frame(cam, target) {
    this.camera.position.set(...cam);
    this.camera.lookAt(new THREE.Vector3(...target));
  }
  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  render() { this.renderer.render(this.scene, this.camera); }
}

export class Viewer {
  constructor() {
    this.stage = new Stage();
    this.canvas = this.stage.renderer.domElement;
    this.canvas.className = 'stage-canvas';
    this.controls = new OrbitControls(this.stage.camera, this.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 1.2, maxDistance: 7, maxPolarAngle: Math.PI * 0.49, autoRotateSpeed: 1.2 });
    this.controls.enablePan = true;
    this.time = 0; this.speed = 1; this.playing = true;
    this.listeners = new Set();
    this.clock = new THREE.Clock();
    this.mounted = null;
    this.xray = false;
    this._loop = this._loop.bind(this);
    this.ro = new ResizeObserver(() => this._fit());
    requestAnimationFrame(this._loop);
  }
  onFrame(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  mount(el) {
    if (this.mounted === el) return;
    if (this.mounted) this.ro.unobserve(this.mounted);
    el.prepend(this.canvas); this.mounted = el; this.ro.observe(el); this._fit();
  }
  unmount() { if (this.mounted) this.ro.unobserve(this.mounted); this.canvas.remove(); this.mounted = null; }
  _fit() {
    if (!this.mounted) return;
    const r = this.mounted.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) this.stage.resize(r.width, r.height);
  }
  show(ex) {
    this.stage.setExercise(ex);
    this.time = 0;
    this.setView('3/4');
    this.setXray(this.xray);
  }
  setView(name) {
    const v = this.stage.ex.view;
    const t = v.target;
    const presets = {
      '3/4': v.cam,
      front: [t[0] + 0.01, t[1] + 0.35, t[2] + 3.2],
      side: [t[0] + 3.2, t[1] + 0.3, t[2] + 0.01],
      top: [t[0] + 0.01, t[1] + 3.4, t[2] + 0.4],
      back: [t[0] - 0.6, t[1] + 0.5, t[2] - 3.0],
    };
    // pull the camera back on tall, narrow screens so the whole machine stays in frame
    const asp = this.stage.camera.aspect, k = asp < 1.25 ? Math.pow(1.25 / asp, 0.8) : 1;
    const cam = (presets[name] || v.cam).map((c, i) => t[i] + (c - t[i]) * k);
    this.stage.frame(cam, t);
    this.controls.target.set(...t);
    this.controls.update();
  }
  setGhosts(on) { this.stage.ghostA.group.visible = this.stage.ghostB.group.visible = on && !this.stage.ex.cycle; }
  setXray(on) {
    this.xray = on;
    for (const m of ALL_MATS) { m.transparent = on; m.opacity = on ? 0.22 : 1; m.depthWrite = !on; m.needsUpdate = true; }
  }
  setAutoRotate(on) { this.controls.autoRotate = on; }
  setTheme(bg) { this.stage.setTheme(bg); }
  scrubTo(frac) {
    // frac of one rep / cycle
    const ex = this.stage.ex;
    const total = ex.cycle ? ex.period : repTimeline(ex).total;
    this.time = Math.floor(this.time / total) * total + frac * total;
  }
  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.mounted || !this.stage.ex || document.hidden) return;
    if (this.playing) this.time += dt * this.speed;
    const ph = this.stage.poseAt(this.time);
    const ex = this.stage.ex;
    const effort = ph.phase === 'lift' ? 1 : ph.phase === 'hold' ? 0.8 : ph.phase === 'cycle' ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0.3;
    this.stage.rig.highlight(ex.primary, ex.secondary, effort);
    this.controls.update();
    this.stage.render();
    for (const fn of this.listeners) fn(ph, ex);
  }
}

// Small offline renderer for library thumbnails (rendered once per exercise, cached as images).
export class Thumbnailer {
  constructor() { this.stage = null; this.cache = new Map(); this.queue = []; this.busy = false; }
  get(ex, cb) {
    if (this.cache.has(ex.id)) return cb(this.cache.get(ex.id));
    this.queue.push([ex, cb]);
    if (!this.busy) this._pump();
  }
  _pump() {
    const job = this.queue.shift();
    if (!job) { this.busy = false; return; }
    this.busy = true;
    const run = () => {
      try {
        if (!this.stage) { this.stage = new Stage({ shadows: true, preserve: true }); this.stage.resize(320, 240); this.stage.renderer.setPixelRatio(1.5); this.stage.resize(320, 240); }
        const [ex, cb] = job;
        this.stage.setExercise(ex);
        const ph = ex.cycle ? 0.15 * ex.period : repTimeline(ex).hold0 + repTimeline(ex).up * 0.55;
        this.stage.poseAt(ph);
        this.stage.rig.highlight(ex.primary, ex.secondary, 0.8);
        const v = ex.view;
        this.stage.frame(v.cam.map((c, i) => v.target[i] + (c - v.target[i]) * 0.92), v.target);
        this.stage.render();
        const url = this.stage.renderer.domElement.toDataURL('image/jpeg', 0.82);
        this.cache.set(ex.id, url); cb(url);
      } catch (e) { console.warn('thumbnail failed', e); }
      (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(() => this._pump());
    };
    run();
  }
}
