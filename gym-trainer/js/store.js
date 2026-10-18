// Persistence. Always keeps a local copy (works offline and when opened as a plain web page).
// When hosted as a Claude artifact, also syncs to the viewer's private database so data
// survives across devices and browsers.
const LS_KEY = 'spotter:v1';

const blank = () => ({
  profile: null,          // answers from the program wizard
  program: null,          // { id, name, goal, days: [{ name, items: [...] }] }
  sessions: [],           // finished workouts
  active: null,           // workout in progress
  settings: { sound: true, vibrate: true, restAuto: true, lowerInc: 5, upperInc: 2.5 },
  updatedAt: 0,
});

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch { /* storage blocked */ }
  return blank();
}
function writeLocal(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}

export class Store {
  constructor() {
    this.state = readLocal();
    this.remote = null;   // { stateDoc, sessionsCol }
    this.syncStatus = 'local';
    this.subs = new Set();
    this._timer = null;
    this._writing = Promise.resolve();
  }
  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  _emit() { for (const fn of this.subs) fn(this.state); }

  async connect() {
    if (!window.claude?.use) return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const uid = await user.id();
      if (!uid) return;
      const stateDoc = db.doc(`data/users/${uid}/state`);
      const sessionsCol = stateDoc.collection('sessions');
      this.remote = { stateDoc, sessionsCol };
      const [snap, sess] = await Promise.all([stateDoc.get(), sessionsCol.get()]);
      const remoteSessions = sess.docs.map((d) => d.data());
      const remote = snap.exists ? snap.data() : null;
      // merge: newest state wins; sessions are unioned by id
      if (remote && (remote.updatedAt || 0) > (this.state.updatedAt || 0)) {
        this.state = { ...this.state, ...structuredClone(remote), sessions: this.state.sessions };
      }
      const byId = new Map(this.state.sessions.map((s) => [s.id, s]));
      const localOnly = this.state.sessions.filter((s) => !remoteSessions.some((r) => r.id === s.id));
      for (const r of remoteSessions) byId.set(r.id, structuredClone(r));
      this.state.sessions = [...byId.values()].sort((a, b) => a.start - b.start);
      writeLocal(this.state);
      this.syncStatus = 'synced';
      this._emit();
      for (const s of localOnly) await this._putSession(s);
      if (!remote || (remote.updatedAt || 0) < (this.state.updatedAt || 0)) this._flush();
    } catch (e) {
      console.warn('sync unavailable', e);
      this.remote = null;
      this.syncStatus = 'local';
      this._emit();
    }
  }

  // Shallow-merge a change into state and persist it.
  set(patch) {
    Object.assign(this.state, patch, { updatedAt: Date.now() });
    writeLocal(this.state);
    this._emit();
    if (this.remote) { clearTimeout(this._timer); this._timer = setTimeout(() => this._flush(), 900); }
  }
  _flush() {
    if (!this.remote) return;
    const { sessions, ...rest } = this.state;
    const body = JSON.parse(JSON.stringify(rest));
    this._writing = this._writing.then(() => this.remote.stateDoc.set(body)).catch((e) => this._fail(e));
  }
  _putSession(s) {
    if (!this.remote) return Promise.resolve();
    const body = JSON.parse(JSON.stringify(s));
    this._writing = this._writing.then(() => this.remote.sessionsCol.doc(s.id).set(body)).catch((e) => this._fail(e));
    return this._writing;
  }
  _fail(e) {
    console.warn('sync write failed', e);
    if (e?.code === 'revoked' || e?.code === 'invalid_argument' || e?.code === 'not_granted') { this.remote = null; this.syncStatus = 'local'; this._emit(); }
  }

  addSession(s) {
    this.state.sessions = [...this.state.sessions, s];
    this.set({});
    this._putSession(s);
  }
  deleteSession(id) {
    this.state.sessions = this.state.sessions.filter((s) => s.id !== id);
    this.set({});
    if (this.remote) this._writing = this._writing.then(() => this.remote.sessionsCol.doc(id).delete()).catch((e) => this._fail(e));
  }
  exportJSON() { return JSON.stringify({ app: 'spotter', version: 1, exportedAt: new Date().toISOString(), ...this.state }, null, 2); }
  importJSON(text) {
    const data = JSON.parse(text);
    if (data.app !== 'spotter') throw new Error('This file is not a Spotter backup.');
    const next = { ...blank(), ...data };
    delete next.app; delete next.version; delete next.exportedAt;
    this.state = next;
    this.set({});
    for (const s of next.sessions) this._putSession(s);
  }
  reset() {
    const ids = this.state.sessions.map((s) => s.id);
    this.state = blank();
    this.set({});
    if (this.remote) for (const id of ids) this._writing = this._writing.then(() => this.remote.sessionsCol.doc(id).delete()).catch(() => {});
  }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
