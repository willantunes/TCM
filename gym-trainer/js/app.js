import { EXERCISES, EQUIPMENT, ZONES, PATTERNS, EX_BY_ID, EQ_BY_ID, exercisesFor } from './exercises.js';
import { MUSCLES } from './rig.js';
import { Viewer, Thumbnailer, repTimeline } from './viewer.js';
import { Store, uid } from './store.js';
import { GOALS, LEVELS, LIMITATIONS, generateProgram, prescribe, suggest, lastPerformance, bestE1rm, e1rm, sessionVolume, nextDayIndex, COMPOUND } from './programs.js';
import { Coach } from './coach.js';

// ---------- utilities ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtClock = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const fmtDate = (t, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(t).toLocaleDateString(undefined, o);
const fmtKg = (v) => (v >= 10000 ? (v / 1000).toFixed(1) + ' t' : Math.round(v).toLocaleString() + ' kg');
const levelDots = (n) => `<span class="level" title="${['', 'Beginner', 'Intermediate', 'Advanced'][n]}">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
};

function rxText(item) {
  const ex = EX_BY_ID[item.exId];
  if (!ex) return '';
  if (ex.type === 'cardio') return `${item.minutes} min`;
  if (ex.type === 'time') return `${item.sets} × ${item.secMin}–${item.secMax}s`;
  return `${item.sets} × ${item.repMin}${item.repMax !== item.repMin ? '–' + item.repMax : ''}`;
}
function estMinutes(day) {
  let s = 0;
  for (const it of day.items) {
    const ex = EX_BY_ID[it.exId]; if (!ex) continue;
    if (ex.type === 'cardio') s += it.minutes * 60;
    else if (ex.type === 'time') s += it.sets * (it.secMax + it.rest) + 60;
    else s += it.sets * (40 + it.rest) + 60;
  }
  return Math.round(s / 60 / 5) * 5;
}

// ---------- app state ----------
const store = new Store();
const thumbs = new Thumbnailer();
let viewer = null;
let tab = 'today';
const ui = { libMode: 'exercises', libZone: 'all', libMuscle: 'all', libQuery: '', openItem: null, progressEx: null };
const getViewer = () => (viewer ||= new Viewer());

if (!store.state.program) {
  const profile = { goal: 'muscle', level: 1, days: 3, minutes: 60, focus: 'balanced', pref: 'machine', limits: [] };
  store.set({ program: { ...generateProgram(profile), starter: true } });
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

function thumbImg(ex, cls = 'thumb') {
  return `<img class="${cls} loading" data-thumb="${esc(ex.id)}" alt="" width="320" height="240">`;
}
const thumbObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const img = e.target; thumbObserver.unobserve(img);
    const ex = EX_BY_ID[img.dataset.thumb];
    if (ex) thumbs.get(ex, (url) => { img.src = url; img.classList.remove('loading'); });
  }
}, { rootMargin: '200px' });
function hydrateThumbs(root) {
  root.querySelectorAll('img[data-thumb]').forEach((img) => {
    const id = img.dataset.thumb;
    if (thumbs.cache.has(id)) { img.src = thumbs.cache.get(id); img.classList.remove('loading'); }
    else thumbObserver.observe(img);
  });
}

// ---------- tabs ----------
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === t));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + t; });
  renderTab();
  window.scrollTo(0, 0);
  try { localStorage.setItem('spotter:tab', t); } catch { /* ignore */ }
}
function renderTab() {
  const el = $('#view-' + tab);
  ({ today: renderToday, library: renderLibrary, program: renderProgram, progress: renderProgress, coach: renderCoach })[tab](el);
  hydrateThumbs(el);
}

// ---------- TODAY ----------
function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function renderToday(el) {
  const s = store.state, p = s.program;
  const di = nextDayIndex(s), day = p?.days[di];
  const ws = weekStart();
  const thisWeek = s.sessions.filter((x) => x.start >= ws.getTime());
  const dots = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(ws.getDate() + i);
    const done = thisWeek.some((x) => new Date(x.start).toDateString() === d.toDateString());
    const isToday = d.toDateString() === new Date().toDateString();
    return `<div class="day-dot ${done ? 'done' : ''} ${isToday ? 'today' : ''}"><span>${d.getDate()}</span>${'MTWTFSS'[i]}</div>`;
  }).join('');
  const weekVol = thisWeek.reduce((a, x) => a + sessionVolume(x), 0);
  const active = s.active;
  el.innerHTML = `
  <div class="split">
    <section class="hero">
      <p class="eyebrow">${esc(fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }))}${p?.starter ? ' · starter plan' : ''}</p>
      ${active ? `<h1>Workout in progress</h1><p class="muted">${esc(active.dayName)} · started ${fmtClock((Date.now() - active.start) / 1000)} ago</p>
        <button class="btn btn-primary btn-block" data-act="resume">Resume workout</button>`
      : day ? `<h1>${esc(day.name.replace(/^Day \d+ · /, ''))}</h1>
        <div class="hero-meta"><span>Day <b>${di + 1}</b> of ${p.days.length}</span><span><b>${day.items.length}</b> exercises</span><span>≈ <b>${estMinutes(day)}</b> min</span></div>
        <div class="ex-list">${day.items.map((it) => { const ex = EX_BY_ID[it.exId]; return ex ? `<button class="ex-row" data-act="open-ex" data-id="${ex.id}">${thumbImg(ex)}<span class="name">${esc(ex.name)}<br><span class="sub">${it.warmup ? 'Warm-up · ' : ''}${esc(EQ_BY_ID[ex.eq].name)}</span></span><span class="rx">${rxText(it)}</span></button>` : ''; }).join('')}</div>
        <button class="btn btn-primary btn-block" data-act="start" data-day="${di}">Start workout</button>
        <div class="row"><button class="btn btn-sm" data-act="pick-day">Choose another day</button>${p.starter ? '<button class="btn btn-sm" data-act="wizard">Personalise my plan</button>' : ''}</div>`
      : `<h1>No program yet</h1><button class="btn btn-primary" data-act="wizard">Build my program</button>`}
    </section>
    <div style="display:grid;gap:22px;min-width:0">
      <section class="panel">
        <div class="spread"><h2>This week</h2><span class="muted num">${thisWeek.length} / ${p?.days.length ?? '–'} sessions</span></div>
        <div class="week">${dots}</div>
      </section>
      <section class="tiles">
        <div class="tile"><small>Workouts total</small><b>${s.sessions.length}</b></div>
        <div class="tile"><small>Lifted this week</small><b>${fmtKg(weekVol)}</b></div>
      </section>
      <section class="panel">
        <h2>Explore</h2>
        <p class="muted">Every machine in a Basic-Fit style club in 3D, with animated demos you can rotate, slow down and scrub.</p>
        <div class="row"><button class="btn btn-sm" data-act="tab" data-tab="library">Open the library</button><button class="btn btn-sm" data-act="tab" data-tab="coach">Ask the coach</button></div>
      </section>
    </div>
  </div>`;
}

// ---------- LIBRARY ----------
function renderLibrary(el) {
  const q = ui.libQuery.trim().toLowerCase();
  const tools = `
  <div class="lib-tools">
    <div class="spread"><h1>Library</h1><div class="seg" role="tablist">
      <button class="${ui.libMode === 'exercises' ? 'is-on' : ''}" data-act="lib-mode" data-v="exercises">Exercises</button>
      <button class="${ui.libMode === 'equipment' ? 'is-on' : ''}" data-act="lib-mode" data-v="equipment">Machines</button></div></div>
    <label class="search">${ICON.search}<input class="input" id="lib-q" type="search" placeholder="Search: squat, chest, leg press…" value="${esc(ui.libQuery)}" autocomplete="off"></label>
    <div class="scroll-x">${[{ id: 'all', name: 'All zones' }, ...ZONES].map((z) => `<button class="chip ${ui.libZone === z.id ? 'is-on' : ''}" data-act="lib-zone" data-v="${z.id}">${esc(z.name)}</button>`).join('')}</div>
    ${ui.libMode === 'exercises' ? `<div class="scroll-x">${['all', 'chest', 'lats', 'delts', 'biceps', 'triceps', 'abs', 'glutes', 'quads', 'hamstrings', 'calves', 'lowerback', 'cardio'].map((m) => `<button class="chip ${ui.libMuscle === m ? 'is-on' : ''}" data-act="lib-muscle" data-v="${m}">${m === 'all' ? 'All muscles' : esc(MUSCLES[m])}</button>`).join('')}</div>` : ''}
  </div>`;
  let body = '';
  if (ui.libMode === 'exercises') {
    const list = EXERCISES.filter((e) => (ui.libZone === 'all' || EQ_BY_ID[e.eq].zone === ui.libZone)
      && (ui.libMuscle === 'all' || e.primary.includes(ui.libMuscle) || e.secondary.includes(ui.libMuscle))
      && (!q || [e.name, EQ_BY_ID[e.eq].name, PATTERNS[e.pattern], ...e.primary.map((m) => MUSCLES[m])].join(' ').toLowerCase().includes(q)));
    body = list.length ? `<div class="grid">${list.map(exCard).join('')}</div>` : `<div class="empty">No exercise matches “${esc(ui.libQuery)}”.<button class="btn btn-sm" data-act="lib-clear">Clear filters</button></div>`;
  } else {
    body = ZONES.filter((z) => ui.libZone === 'all' || z.id === ui.libZone).map((z) => {
      const items = EQUIPMENT.filter((q2) => q2.zone === z.id && (!q || (q2.name + ' ' + q2.about).toLowerCase().includes(q)));
      if (!items.length) return '';
      return `<div class="zone-head"><h2>${esc(z.name)}</h2><span class="count">${items.length}</span></div><div class="grid">${items.map(eqCard).join('')}</div>`;
    }).join('') || `<div class="empty">No machine matches “${esc(ui.libQuery)}”.</div>`;
  }
  el.innerHTML = tools + `<div id="lib-results" style="display:grid;gap:14px">${body}</div>`;
}
function exCard(e) {
  return `<button class="card" data-act="open-ex" data-id="${e.id}">${thumbImg(e, 'shot')}<span class="body"><span class="title">${esc(e.name)}</span>
    <span class="meta"><span>${esc(EQ_BY_ID[e.eq].name)}</span>${levelDots(e.level)}</span>
    <span class="chips">${e.primary.slice(0, 2).map((m) => `<span class="chip chip-hot">${esc(MUSCLES[m])}</span>`).join('')}</span></span></button>`;
}
function eqCard(q) {
  const exs = exercisesFor(q.id); const first = exs[0];
  return `<button class="card" data-act="open-eq" data-id="${q.id}">${first ? thumbImg(first, 'shot') : ''}<span class="body"><span class="title">${esc(q.name)}</span>
    <span class="meta"><span>${exs.length} exercise${exs.length === 1 ? '' : 's'}</span></span></span></button>`;
}

// ---------- DETAIL (3D demo) ----------
function stageMarkup() {
  return `<div class="stage-col">
    <div class="stage" id="stage">
      <div class="stage-hud"><span class="phase" id="phase" data-p="ready"><i></i><span id="phase-txt">Ready</span></span><span class="rep-count" id="rep-count">Rep 1</span></div>
      <div class="legend" id="legend"></div>
      <span class="drag-hint">Drag to rotate · pinch to zoom</span>
    </div>
    <div class="controls">
      <div class="timeline">
        <button class="play" id="play" data-act="play" aria-label="Pause">${ICON.pause}</button>
        <div class="scrub-wrap"><div class="scrub-phases" id="scrub-phases"></div><input type="range" id="scrub" min="0" max="1000" value="0" aria-label="Scrub through one rep"></div>
      </div>
      <div class="ctrl-row">
        <div class="seg" id="speed">${[0.25, 0.5, 1].map((v) => `<button data-act="speed" data-v="${v}" class="${v === 1 ? 'is-on' : ''}">${v}×</button>`).join('')}</div>
        <div class="seg" id="views">${['3/4', 'front', 'side', 'top'].map((v) => `<button data-act="cam" data-v="${v}" class="${v === '3/4' ? 'is-on' : ''}">${v === '3/4' ? '3D' : v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
      </div>
      <div class="toggles">
        <button class="toggle" data-act="tog" data-v="ghost" aria-pressed="false">Start/end ghosts</button>
        <button class="toggle" data-act="tog" data-v="xray" aria-pressed="false">X-ray machine</button>
        <button class="toggle" data-act="tog" data-v="spin" aria-pressed="false">Turntable</button>
      </div>
    </div>
  </div>`;
}
let stageUnsub = null;
function attachStage(ex, root) {
  const v = getViewer();
  v.mount($('#stage', root));
  v.show(ex); v.playing = true; v.speed = 1;
  v.setGhosts(false); v.setXray(false); v.setAutoRotate(false);
  syncStageTheme();
  $('#legend', root).innerHTML = ex.primary.map((m) => `<span>${esc(MUSCLES[m])}</span>`).join('') + ex.secondary.slice(0, 3).map((m) => `<span class="sec">${esc(MUSCLES[m])}</span>`).join('');
  const sp = $('#scrub-phases', root);
  if (ex.cycle) sp.innerHTML = '<i style="width:100%;background:var(--good)"></i>';
  else { const tl = repTimeline(ex); sp.innerHTML = [['hold0', 'var(--faint)'], ['up', 'var(--hot)'], ['hold1', 'var(--accent)'], ['down', '#5ab0ff']].map(([k, c]) => `<i style="width:${(tl[k] / tl.total) * 100}%;background:${c}"></i>`).join(''); }
  const phaseEl = $('#phase', root), txt = $('#phase-txt', root), rep = $('#rep-count', root), scrub = $('#scrub', root);
  const label = { ready: ['Start position', ''], lift: ['Lift', 'exhale'], hold: ['Squeeze', 'hold'], lower: ['Lower', 'inhale · slow'], cycle: ['Keep moving', 'steady rhythm'] };
  let last = '';
  stageUnsub?.();
  stageUnsub = v.onFrame((ph) => {
    if (ph.phase !== last) { last = ph.phase; phaseEl.dataset.p = ph.phase; const [a, b] = label[ph.phase]; txt.innerHTML = `${a}${b ? ` <small>${b}</small>` : ''}`; }
    rep.textContent = ex.cycle ? `${Math.round(v.time)}s` : `Rep ${ph.rep + 1}`;
    if (!scrub.matches(':active')) scrub.value = Math.round(ph.frac * 1000);
  });
  scrub.oninput = () => { v.playing = false; setPlayBtn(root, false); v.scrubTo(scrub.value / 1000); };
}
function setPlayBtn(root, playing) { const b = $('#play', root); if (b) { b.innerHTML = playing ? ICON.pause : ICON.play; b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); } }
function syncStageTheme() { if (viewer) viewer.setTheme(getComputedStyle(document.documentElement).getPropertyValue('--stage-bg').trim() || '#12161c'); }
function detachStage() { stageUnsub?.(); stageUnsub = null; viewer?.unmount(); }

function exInfo(ex) {
  const eq = EQ_BY_ID[ex.eq];
  return `<div class="info">
    <div style="display:grid;gap:10px">
      <div class="row"><span class="chip">${esc(PATTERNS[ex.pattern])}</span><button class="chip" data-act="open-eq" data-id="${eq.id}">${esc(eq.name)} ›</button>${levelDots(ex.level)}</div>
      <div class="chips">${ex.primary.map((m) => `<span class="chip chip-hot">${esc(MUSCLES[m])}</span>`).join('')}${ex.secondary.map((m) => `<span class="chip chip-warm">${esc(MUSCLES[m])}</span>`).join('')}</div>
    </div>
    <div><h3>Set up</h3><ul class="bullets">${ex.setup.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <div><h3>How to do it</h3><ol class="steps">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    <div><h3>Coaching cues</h3><div class="cues">${ex.cues.map((c) => `<span class="cue">${esc(c)}</span>`).join('')}</div></div>
    <div><h3>Avoid</h3><ul class="bullets bad">${ex.mistakes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <div class="callout"><span><b>Breathing.</b> ${esc(ex.breathe)}</span></div>
    ${ex.tempo && !ex.cycle ? `<p class="muted">Demo tempo: ${ex.tempo.up}s up, ${ex.tempo.down}s down. Use the scrubber to freeze any point of the rep.</p>` : ''}
    ${ex.alt?.length ? `<div><h3>Machine taken? Try</h3><div class="mini-cards">${ex.alt.filter((a) => EX_BY_ID[a]).map((a) => `<button class="mini" data-act="open-ex" data-id="${a}">${thumbImg(EX_BY_ID[a], '')}<span>${esc(EX_BY_ID[a].name)}</span></button>`).join('')}</div></div>` : ''}
  </div>`;
}

function openExercise(id) {
  const ex = EX_BY_ID[id]; if (!ex) return;
  const el = $('#detail');
  ui.openItem = { kind: 'ex', id };
  el.innerHTML = `<div class="ov-head"><button class="icon-btn" data-act="close-detail" aria-label="Back">${ICON.back}</button>
      <div class="grow"><p class="eyebrow">${esc(EQ_BY_ID[ex.eq].name)}</p><h2>${esc(ex.name)}</h2></div>
      <button class="btn btn-sm" data-act="add-to-workout" data-id="${ex.id}">${store.state.active ? 'Add to workout' : 'Quick workout'}</button></div>
    <div class="ov-body"><div class="detail-grid">${stageMarkup()}${exInfo(ex)}</div></div>`;
  el.hidden = false; el.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  attachStage(ex, el);
  hydrateThumbs(el);
}
function openEquipment(id, exId) {
  const eq = EQ_BY_ID[id]; if (!eq) return;
  const exs = exercisesFor(id); const cur = EX_BY_ID[exId] || exs[0];
  const el = $('#detail');
  ui.openItem = { kind: 'eq', id };
  el.innerHTML = `<div class="ov-head"><button class="icon-btn" data-act="close-detail" aria-label="Back">${ICON.back}</button>
      <div class="grow"><p class="eyebrow">${esc(ZONES.find((z) => z.id === eq.zone).name)}</p><h2>${esc(eq.name)}</h2></div></div>
    <div class="ov-body"><div class="detail-grid">${stageMarkup()}
      <div class="info">
        <p style="font-size:1.08rem">${esc(eq.about)}</p>
        <div><h3>Adjust it</h3><ol class="steps">${eq.setup.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
        <div><h3>Exercises on this machine</h3><div class="ex-list">${exs.map((e) => `<button class="ex-row" data-act="eq-demo" data-eq="${eq.id}" data-id="${e.id}" ${e.id === cur.id ? 'style="background:var(--accent-soft)"' : ''}>${thumbImg(e)}<span class="name">${esc(e.name)}<br><span class="sub">${e.primary.map((m) => MUSCLES[m]).join(', ')}</span></span><span class="rx">${e.id === cur.id ? 'Playing' : 'Demo'}</span></button>`).join('')}</div></div>
        <button class="btn" data-act="open-ex" data-id="${cur.id}">Full technique guide: ${esc(cur.name)}</button>
      </div></div></div>`;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  attachStage(cur, el);
  hydrateThumbs(el);
}
function closeDetail() {
  $('#detail').hidden = true; ui.openItem = null;
  if (!$('#workout').hidden) { renderWorkout(); return; }
  detachStage(); document.body.style.overflow = '';
}

// ---------- WORKOUT ----------
let restTimer = null, clockTimer = null, wakeLock = null;
function newSetFor(item, sug) {
  const ex = EX_BY_ID[item.exId];
  if (ex.type === 'cardio') return { min: item.minutes, km: null, done: false };
  if (ex.type === 'time') return { sec: item.secMin, done: false };
  return { kg: sug?.kg ?? null, reps: item.repMax ?? item.repMin, done: false };
}
function startWorkout(dayIndex, items, name) {
  const s = store.state, p = s.program;
  const day = items ? { name, items } : p.days[dayIndex];
  const w = {
    id: uid(), programId: items ? null : p.id, dayIndex: items ? -1 : dayIndex, dayName: day.name, start: Date.now(), cur: 0,
    items: day.items.map((it) => {
      const sug = suggest(s.sessions, it, s.settings);
      const n = EX_BY_ID[it.exId].type === 'cardio' ? 1 : it.sets;
      return { exId: it.exId, target: { ...it }, sug, sets: Array.from({ length: n }, () => newSetFor(it, sug)), note: '' };
    }),
  };
  store.set({ active: w });
  openWorkout();
}
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* not allowed */ }
}
function openWorkout() {
  $('#workout').hidden = false; document.body.style.overflow = 'hidden';
  keepAwake();
  renderWorkout();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { const a = store.state.active; const c = $('#wo-clock'); if (a && c) c.textContent = fmtClock((Date.now() - a.start) / 1000); }, 1000);
}
function closeWorkout() {
  $('#workout').hidden = true; clearInterval(clockTimer); stopRest(); detachStage(); document.body.style.overflow = '';
  wakeLock?.release?.(); wakeLock = null; renderTab();
}
function saveActive() { store.set({ active: store.state.active }); }

function setRow(item, set, i) {
  const ex = EX_BY_ID[item.exId];
  const step = (field, delta, val, label, mode) => `<div class="stepper"><button data-act="step" data-i="${i}" data-f="${field}" data-d="${-delta}" aria-label="Less ${label}">−</button>
    <input type="number" inputmode="${mode}" step="any" id="in-${item.exId}-${i}-${field}" data-act-input="set" data-i="${i}" data-f="${field}" value="${val ?? ''}" placeholder="–" aria-label="${label}">
    <button data-act="step" data-i="${i}" data-f="${field}" data-d="${delta}" aria-label="More ${label}">+</button></div>`;
  let mid;
  if (ex.type === 'cardio') mid = step('min', 1, set.min, 'minutes', 'numeric') + step('km', 0.1, set.km, 'kilometres', 'decimal');
  else if (ex.type === 'time') mid = step('sec', 5, set.sec, 'seconds', 'numeric') + `<button class="btn btn-sm" data-act="hold-timer" data-i="${i}">Start ${set.sec || 0}s</button>`;
  else mid = step('kg', COMPOUND.has(ex.pattern) ? 2.5 : 1, set.kg, 'kilograms', 'decimal') + step('reps', 1, set.reps, 'reps', 'numeric');
  return `<div class="set ${set.done ? 'is-done' : ''}"><span class="idx">${i + 1}</span>${mid}<button class="check" data-act="done-set" data-i="${i}" aria-label="Set ${i + 1} done" aria-pressed="${set.done}">${ICON.check}</button></div>`;
}
function renderWorkout() {
  const w = store.state.active; if (!w) return closeWorkout();
  const item = w.items[w.cur], ex = EX_BY_ID[item.exId], t = item.target;
  const head = ex.type === 'cardio' ? ['Min', 'Km'] : ex.type === 'time' ? ['Seconds', 'Timer'] : ['Kg', 'Reps'];
  const el = $('#workout');
  const rest = t.rest ? `rest ${t.rest >= 60 ? (t.rest / 60).toFixed(t.rest % 60 ? 1 : 0) + ' min' : t.rest + 's'}` : '';
  el.innerHTML = `<div class="ov-head" style="display:grid;gap:8px">
      <div class="spread" style="flex-wrap:nowrap"><button class="icon-btn" data-act="wo-close" aria-label="Minimise workout">${ICON.close}</button>
      <div class="grow" style="text-align:center"><p class="eyebrow">${esc(w.dayName)}</p><span class="clock" id="wo-clock">${fmtClock((Date.now() - w.start) / 1000)}</span></div>
      <button class="btn btn-sm" data-act="wo-finish">Finish</button></div>
      <div class="wo-progress">${w.items.map((it, i) => `<i class="${i === w.cur ? 'cur' : it.sets.length && it.sets.every((s) => s.done) ? 'done' : ''}"></i>`).join('')}</div></div>
    <div class="ov-body"><div class="wo-grid">${stageMarkup()}
      <div class="wo-card">
        <div class="wo-title"><p class="eyebrow">Exercise ${w.cur + 1} of ${w.items.length} · ${esc(EQ_BY_ID[ex.eq].name)}</p><h2>${esc(ex.name)}</h2>
          <p class="muted"><span class="num">${rxText(t)}</span>${rest ? ' · ' + rest : ''}${t.warmup ? ' · warm-up' : ''}</p></div>
        ${item.sug ? `<div class="suggest ${item.sug.up ? 'up' : ''}"><span>${esc(item.sug.reason)}</span>${item.sug.kg != null ? `<div class="row"><b class="num">Target: ${item.sug.kg} kg × ${t.repMin}–${t.repMax}</b>${item.sug.up ? '<span class="chip" style="color:var(--good)">Level up</span>' : ''}</div>` : ''}</div>` : ''}
        <div class="sets"><div class="set-head"><span>Set</span><span>${head[0]}</span><span>${head[1]}</span><span></span></div>${item.sets.map((s, i) => setRow(item, s, i)).join('')}</div>
        <div class="row">${ex.type !== 'cardio' ? '<button class="btn btn-sm" data-act="add-set">+ Add set</button>' : ''}<button class="btn btn-sm" data-act="swap">Machine taken? Swap</button><button class="btn btn-sm" data-act="open-ex" data-id="${ex.id}">Technique</button></div>
        <details class="panel"><summary style="cursor:pointer;font-weight:600">Cues & setup</summary><div class="cues">${ex.cues.map((c) => `<span class="cue">${esc(c)}</span>`).join('')}</div><ul class="bullets">${ex.setup.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>
        <div class="field"><label for="wo-note">Notes</label><textarea class="input" id="wo-note" data-act-input="note" placeholder="Seat position, pin number, how it felt…">${esc(item.note)}</textarea></div>
        <div class="wo-nav"><button class="btn" data-act="wo-prev" ${w.cur === 0 ? 'disabled' : ''}>‹ Previous</button>${w.cur < w.items.length - 1 ? '<button class="btn btn-primary" data-act="wo-next">Next ›</button>' : '<button class="btn btn-primary" data-act="wo-finish">Finish</button>'}</div>
      </div></div></div>`;
  if ($('#detail').hidden) attachStage(ex, el);
  renderRest();
}
function currentItem() { const w = store.state.active; return w?.items[w.cur]; }
function markSet(i) {
  const w = store.state.active, item = currentItem(), set = item.sets[i];
  set.done = !set.done;
  if (set.done) {
    const ex = EX_BY_ID[item.exId];
    if (ex.type === 'reps' && (set.kg == null || set.kg === '')) set.kg = 0;
    // carry the weight forward to the remaining sets that have none yet
    if (ex.type === 'reps') for (const s of item.sets.slice(i + 1)) if (!s.done && (s.kg == null || s.kg === '')) s.kg = set.kg;
    saveActive();
    const allDone = item.sets.every((s) => s.done);
    if (item.target.rest && store.state.settings.restAuto && !(allDone && w.cur === w.items.length - 1)) startRest(item.target.rest, allDone ? 'next' : null);
    if (allDone && ex.type === 'cardio' && w.cur < w.items.length - 1) { w.cur++; saveActive(); }
  } else saveActive();
  renderWorkout();
}
// rest timer
let restState = null;
function startRest(sec, then) { restState = { end: Date.now() + sec * 1000, total: sec, then, over: false }; tickRest(); clearInterval(restTimer); restTimer = setInterval(tickRest, 250); }
function stopRest() { clearInterval(restTimer); restTimer = null; restState = null; $('#rest')?.remove(); }
function tickRest() {
  if (!restState) return;
  const left = (restState.end - Date.now()) / 1000;
  if (left <= 0 && !restState.over) { restState.over = true; alertDone(); if (restState.then === 'next') { const w = store.state.active; if (w && w.cur < w.items.length - 1) { w.cur++; saveActive(); renderWorkout(); } } }
  if (left < -20) return stopRest();
  renderRest();
}
function renderRest() {
  if (!restState || $('#workout').hidden) { $('#rest')?.remove(); return; }
  let r = $('#rest');
  if (!r) {
    r = document.createElement('div'); r.id = 'rest'; r.className = 'rest';
    r.innerHTML = `<svg class="ring" viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="27"/><circle class="fg" cx="32" cy="32" r="27" stroke-dasharray="169.6"/></svg>
      <div><div class="lbl" id="rest-lbl">Rest</div><div class="time" id="rest-time">0:00</div></div>
      <div class="btns"><button data-act="rest-add" data-v="-15">−15</button><button data-act="rest-add" data-v="15">+15</button><button class="skip" data-act="rest-skip">Skip</button></div>`;
    document.body.append(r);
  }
  const left = (restState.end - Date.now()) / 1000;
  r.classList.toggle('is-over', left <= 0);
  $('#rest-time').textContent = left > 0 ? fmtClock(left) : 'Go!';
  $('#rest-lbl').textContent = left > 0 ? (restState.then === 'next' ? 'Rest, then next exercise' : 'Rest') : 'Next set';
  r.querySelector('.fg').setAttribute('stroke-dashoffset', String(169.6 * (1 - Math.max(0, left) / restState.total)));
}
let audioCtx = null;
function alertDone() {
  const st = store.state.settings;
  if (st.vibrate) try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
  if (st.sound) try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach((d, i) => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = i === 2 ? 1320 : 880; g.gain.setValueAtTime(0.25, audioCtx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d + 0.15); o.connect(g).connect(audioCtx.destination); o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.16); });
  } catch { /* ignore */ }
}
function holdTimer(i) {
  const item = currentItem(), set = item.sets[i];
  const total = set.sec || item.target.secMin || 30;
  let left = total;
  openSheet(`<p class="eyebrow">${esc(EX_BY_ID[item.exId].name)} · set ${i + 1}</p><div class="summary-big num" id="hold-left" style="text-align:center">${left}s</div><button class="btn" data-act="close-sheet">Stop</button>`);
  const t = setInterval(() => {
    left--; const el = $('#hold-left');
    if (!el) { clearInterval(t); return; }
    el.textContent = left + 's';
    if (left <= 0) { clearInterval(t); alertDone(); closeSheet(); set.sec = total; if (!set.done) markSet(i); }
  }, 1000);
}
function finishWorkout() {
  const s = store.state, w = s.active;
  const session = { ...w, end: Date.now() };
  delete session.cur;
  for (const it of session.items) delete it.sug;
  session.items = session.items.filter((it) => it.sets.some((x) => x.done));
  if (!session.items.length) {
    openSheet(`<h2>Nothing logged yet</h2><p class="muted">Tick off at least one set to save this workout, or discard it.</p>
      <div class="row"><button class="btn" data-act="close-sheet">Keep training</button><button class="btn btn-danger" data-act="wo-discard">Discard workout</button></div>`);
    return;
  }
  const prs = [];
  for (const it of session.items) {
    const prev = bestE1rm(s.sessions, it.exId);
    const now = Math.max(0, ...it.sets.filter((x) => x.done).map((x) => e1rm(x.kg, x.reps)));
    if (now > 0 && now > prev && prev > 0) prs.push(`${EX_BY_ID[it.exId].name}: est. 1RM ${Math.round(now)} kg`);
  }
  store.addSession(session);
  store.set({ active: null });
  closeWorkout();
  const sets = session.items.reduce((a, it) => a + it.sets.filter((x) => x.done).length, 0);
  openSheet(`<p class="eyebrow">Workout saved</p><h2>${esc(session.dayName)}</h2>
    <div class="tiles"><div class="tile"><small>Duration</small><b>${fmtClock((session.end - session.start) / 1000)}</b></div><div class="tile"><small>Sets</small><b>${sets}</b></div><div class="tile"><small>Volume</small><b>${fmtKg(sessionVolume(session))}</b></div></div>
    ${prs.length ? `<div class="callout"><span><b class="pr">New personal records</b><br>${prs.map(esc).join('<br>')}</span></div>` : '<p class="muted">Progress is logged. Next time the app suggests the weights to beat.</p>'}
    <button class="btn btn-primary" data-act="close-sheet">Done</button>`);
}
function swapSheet() {
  const item = currentItem(), ex = EX_BY_ID[item.exId];
  const opts = EXERCISES.filter((e) => e.id !== ex.id && (e.pattern === ex.pattern || ex.alt?.includes(e.id)));
  openSheet(`<h2>Swap ${esc(ex.name)}</h2><p class="muted">Same movement, different equipment.</p><div class="pick-list">${opts.map((e) => `<button class="ex-row" data-act="do-swap" data-id="${e.id}">${thumbImg(e)}<span class="name">${esc(e.name)}<br><span class="sub">${esc(EQ_BY_ID[e.eq].name)}</span></span><span class="rx">${levelDots(e.level)}</span></button>`).join('') || '<p class="muted">No alternatives in the library.</p>'}</div>`);
}

// ---------- PROGRAM ----------
let editing = null; // "d:i"
function renderProgram(el) {
  const s = store.state, p = s.program;
  if (!p) { el.innerHTML = `<div class="empty"><h1>No program</h1><button class="btn btn-primary" data-act="wizard">Build my program</button></div>`; return; }
  el.innerHTML = `
  <div class="spread"><div style="display:grid;gap:6px;min-width:0"><p class="eyebrow">${p.starter ? 'Starter plan · personalise it' : p.byCoach ? 'Designed with your coach' : 'Your program'}</p><h1>${esc(p.name)}</h1></div>
    <div class="row"><button class="btn btn-sm" data-act="wizard">New program</button><button class="btn btn-sm" data-act="tab" data-tab="coach">Adjust with coach</button></div></div>
  ${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ''}
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));align-items:start">
  ${p.days.map((d, di) => `<section class="panel day-card">
    <div class="day-head"><input class="day-name" id="dayname-${di}" data-act-input="day-name" data-d="${di}" value="${esc(d.name)}" aria-label="Day name"><span class="muted num" style="flex:none">≈${estMinutes(d)} min</span></div>
    <div class="ex-list">${d.items.map((it, i) => { const ex = EX_BY_ID[it.exId]; if (!ex) return ''; const key = di + ':' + i; return `
      <button class="ex-row" data-act="edit-item" data-k="${key}">${thumbImg(ex)}<span class="name">${esc(ex.name)}<br><span class="sub">${it.warmup ? 'Warm-up · ' : ''}${it.rest ? 'rest ' + it.rest + 's' : esc(EQ_BY_ID[ex.eq].name)}</span></span><span class="rx">${rxText(it)}</span></button>
      ${editing === key ? itemEditor(it, ex, di, i, d.items.length) : ''}`; }).join('')}</div>
    <div class="row"><button class="btn btn-sm" data-act="add-item" data-d="${di}">+ Add exercise</button><button class="btn btn-sm" data-act="start" data-day="${di}">Start this day</button>${p.days.length > 1 ? `<button class="btn btn-sm btn-ghost btn-danger" data-act="del-day" data-d="${di}">Remove day</button>` : ''}</div>
  </section>`).join('')}
  </div>
  <div class="row"><button class="btn btn-sm" data-act="add-day">+ Add day</button></div>
  <section class="panel">
    <h2>Settings</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))">
      <div class="field"><label for="set-lower">Lower-body jump (kg)</label><input class="input" id="set-lower" type="number" step="0.5" data-act-input="setting" data-k="lowerInc" value="${s.settings.lowerInc}"></div>
      <div class="field"><label for="set-upper">Upper-body jump (kg)</label><input class="input" id="set-upper" type="number" step="0.5" data-act-input="setting" data-k="upperInc" value="${s.settings.upperInc}"></div>
    </div>
    <div class="toggles">${[['sound', 'Beep when rest ends'], ['vibrate', 'Vibrate'], ['restAuto', 'Auto rest timer']].map(([k, l]) => `<button class="toggle" data-act="setting-tog" data-k="${k}" aria-pressed="${!!s.settings[k]}">${l}</button>`).join('')}</div>
    <div><p class="label">Your data</p><p class="muted" style="margin-top:4px">${store.syncStatus === 'synced' ? 'Synced to your private Claude storage, so it follows you across devices.' : 'Saved in this browser. Export a backup now and then.'}</p></div>
    <div class="row"><button class="btn btn-sm" data-act="export">Export backup</button><label class="btn btn-sm" for="import-file">Import backup</label><input id="import-file" type="file" accept="application/json,.json" hidden><button class="btn btn-sm btn-ghost btn-danger" data-act="reset">Erase everything</button></div>
  </section>`;
}
function itemEditor(it, ex, di, i, n) {
  const f = (k, label, step = 1) => `<div class="field"><label for="ed-${k}">${label}</label><input class="input num" id="ed-${k}" type="number" min="0" step="${step}" data-act-input="item" data-d="${di}" data-i="${i}" data-k="${k}" value="${it[k] ?? ''}"></div>`;
  const fields = ex.type === 'cardio' ? f('minutes', 'Minutes') : ex.type === 'time' ? f('sets', 'Sets') + f('secMin', 'Min sec', 5) + f('secMax', 'Max sec', 5) + f('rest', 'Rest sec', 15) : f('sets', 'Sets') + f('repMin', 'Min reps') + f('repMax', 'Max reps') + f('rest', 'Rest sec', 15);
  return `<div class="item-ed">${fields}<div class="acts"><button class="btn btn-sm" data-act="move-item" data-d="${di}" data-i="${i}" data-v="-1" ${i === 0 ? 'disabled' : ''}>Move up</button><button class="btn btn-sm" data-act="move-item" data-d="${di}" data-i="${i}" data-v="1" ${i === n - 1 ? 'disabled' : ''}>Move down</button><button class="btn btn-sm" data-act="open-ex" data-id="${ex.id}">Demo</button><button class="btn btn-sm btn-danger" data-act="del-item" data-d="${di}" data-i="${i}">Remove</button></div></div>`;
}
function mutateProgram(fn) { const p = structuredClone(store.state.program); fn(p); delete p.starter; store.set({ program: p }); }

// wizard
let wiz = null;
function openWizard() {
  wiz = { goal: 'muscle', level: 1, days: 3, minutes: 60, focus: 'balanced', pref: 'machine', limits: [], ...(store.state.profile || {}) };
  $('#wizard').hidden = false; document.body.style.overflow = 'hidden';
  renderWizard();
}
function renderWizard() {
  const el = $('#wizard');
  const prog = generateProgram(wiz);
  const opt = (k, v, title, sub) => `<button class="opt ${wiz[k] === v ? 'is-on' : ''}" data-act="wiz" data-k="${k}" data-v="${v}"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  const seg = (k, vals, fmt = (x) => x) => `<div class="seg">${vals.map((v) => `<button class="${wiz[k] === v ? 'is-on' : ''}" data-act="wiz" data-k="${k}" data-v="${v}">${fmt(v)}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="ov-head"><button class="icon-btn" data-act="close-wizard" aria-label="Close">${ICON.close}</button><div class="grow"><h2>Build my program</h2></div></div>
  <div class="ov-body" style="display:grid;gap:26px;padding-top:20px">
    <div class="field"><span class="label">Your goal</span><div class="goal-grid">${Object.entries(GOALS).map(([k, g]) => opt('goal', k, g.name, g.blurb)).join('')}</div></div>
    <div class="field"><span class="label">Experience</span><div class="goal-grid">${Object.entries(LEVELS).map(([k, l]) => opt('level', +k, l.split(' (')[0], l.match(/\((.*)\)/)[1])).join('')}</div></div>
    <div class="row" style="gap:28px">
      <div class="field"><span class="label">Days per week</span>${seg('days', [2, 3, 4, 5, 6])}</div>
      <div class="field"><span class="label">Minutes per session</span>${seg('minutes', [30, 45, 60, 75])}</div>
    </div>
    <div class="field"><span class="label">Equipment preference</span><div class="goal-grid">${opt('pref', 'machine', 'Machines first', 'Guided paths, easy to learn, safe alone.')}${opt('pref', 'free', 'Free weights first', 'Barbells and dumbbells, more coordination.')}</div></div>
    <div class="field"><span class="label">Extra focus</span>${seg('focus', ['balanced', 'glutes', 'upper', 'core'], (v) => ({ balanced: 'Balanced', glutes: 'Glutes & legs', upper: 'Upper body', core: 'Core' }[v]))}</div>
    <div class="field"><span class="label">Anything to protect?</span><div class="toggles">${Object.entries(LIMITATIONS).map(([k, l]) => `<button class="toggle" data-act="wiz-lim" data-v="${k}" aria-pressed="${wiz.limits.includes(k)}">${l}</button>`).join('')}</div></div>
    <section class="panel"><div class="spread"><h2>Preview</h2><span class="muted">${esc(prog.name)}</span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))">${prog.days.map((d) => `<div><h3 style="margin-bottom:6px">${esc(d.name)}</h3>${d.items.map((it) => `<div class="spread" style="padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(EX_BY_ID[it.exId].name)}</span><span class="num muted">${rxText(it)}</span></div>`).join('')}</div>`).join('')}</div>
    </section>
    <button class="btn btn-primary" data-act="wiz-save">Use this program</button>
  </div>`;
}

// ---------- PROGRESS ----------
function renderProgress(el) {
  const ss = store.state.sessions;
  const now = Date.now(), month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const vol = ss.reduce((a, x) => a + sessionVolume(x), 0);
  const avg = ss.length ? ss.reduce((a, x) => a + (x.end - x.start), 0) / ss.length / 60000 : 0;
  // heat map: last 16 weeks
  const start = weekStart(); start.setDate(start.getDate() - 7 * 15);
  const counts = {};
  for (const x of ss) { const k = new Date(x.start).toDateString(); counts[k] = (counts[k] || 0) + 1; }
  const cells = [];
  for (let i = 0; i < 16 * 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const c = counts[d.toDateString()] || 0; cells.push(`<i class="${d > now ? '' : c > 1 ? 'l2' : c ? 'l1' : ''}" title="${d.toDateString()}${c ? ' · ' + c + ' workout' : ''}" style="${d > now ? 'opacity:.3' : ''}"></i>`); }
  const exIds = [...new Set(ss.flatMap((x) => x.items.filter((i) => EX_BY_ID[i.exId]?.type === 'reps').map((i) => i.exId)))];
  const sel = ui.progressEx && exIds.includes(ui.progressEx) ? ui.progressEx : exIds[0];
  let chart;
  if (sel) {
    const pts = ss.map((x) => { const it = x.items.find((i) => i.exId === sel); if (!it) return null; const best = Math.max(0, ...it.sets.filter((s) => s.done).map((s) => e1rm(s.kg, s.reps))); return best ? { t: x.start, v: best, top: Math.max(...it.sets.filter((s) => s.done).map((s) => s.kg || 0)) } : null; }).filter(Boolean);
    chart = lineChart(pts, false);
  } else {
    const demo = [52, 54, 54, 57, 58, 61, 60, 63, 65, 66].map((v, i) => ({ t: now - (9 - i) * 4 * 864e5, v, top: v * 0.8 }));
    chart = `<div class="row"><span class="example-tag">Example</span><span class="muted">Your own chart appears after your first logged workout.</span></div>` + lineChart(demo, true);
  }
  el.innerHTML = `<h1>Progress</h1>
  <section class="tiles">
    <div class="tile"><small>Workouts</small><b>${ss.length}</b></div>
    <div class="tile"><small>This month</small><b>${ss.filter((x) => x.start >= month.getTime()).length}</b></div>
    <div class="tile"><small>Total lifted</small><b>${fmtKg(vol)}</b></div>
    <div class="tile"><small>Avg. duration</small><b>${Math.round(avg)} min</b></div>
  </section>
  <div class="split">
    <section class="panel"><div class="spread"><h2>Strength trend</h2>${exIds.length ? `<select class="input" id="prog-ex" style="width:auto;min-height:38px">${exIds.map((id) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(EX_BY_ID[id].name)}</option>`).join('')}</select>` : ''}</div>
      <p class="muted">Estimated one-rep max (best set each session, Epley formula).</p>${chart}</section>
    <section class="panel"><h2>Consistency</h2><p class="muted">Last 16 weeks. Each square is a day.</p><div class="heat">${cells.join('')}</div></section>
  </div>
  <section style="display:grid;gap:12px"><h2>History</h2>
    ${ss.length ? `<div class="hist">${[...ss].reverse().map((x) => `<details><summary><span class="when">${esc(fmtDate(x.start))} · ${esc(x.dayName)}</span><span class="stat">${fmtClock((x.end - x.start) / 1000)}</span><span class="muted" style="font-size:.85rem">${x.items.length} exercises</span><span class="stat">${fmtKg(sessionVolume(x))}</span></summary>
      <div class="det">${x.items.map((it) => `<div class="line-item"><span>${esc(EX_BY_ID[it.exId]?.name || it.exId)}</span><span>${it.sets.filter((s) => s.done).map((s) => s.min != null ? s.min + ' min' + (s.km ? ' · ' + s.km + ' km' : '') : s.sec != null ? s.sec + 's' : (s.kg || 0) + '×' + s.reps).join('  ')}</span></div>${it.note ? `<p class="muted" style="font-size:.85rem">${esc(it.note)}</p>` : ''}`).join('')}
      <div class="row" style="justify-content:flex-end"><button class="btn btn-sm btn-ghost btn-danger" data-act="del-session" data-id="${x.id}">Delete</button></div></div></details>`).join('')}</div>`
    : `<div class="empty">No workouts logged yet.<button class="btn btn-primary" data-act="tab" data-tab="today">Start today’s workout</button></div>`}
  </section>`;
}
function lineChart(pts, demo) {
  if (pts.length < 2) return `<p class="muted">${pts.length ? `Best so far: <b class="num">${Math.round(pts[0].v)} kg</b>. Log one more session to see a trend.` : 'No completed sets yet.'}</p>`;
  const W = 560, H = 220, L = 40, R = 14, T = 14, B = 26;
  const t0 = pts[0].t, t1 = pts.at(-1).t;
  const lo = Math.floor(Math.min(...pts.map((p) => p.v)) * 0.95 / 5) * 5, hi = Math.ceil(Math.max(...pts.map((p) => p.v)) * 1.03 / 5) * 5;
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R), y = (v) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts.at(-1);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${demo ? 'Example ' : ''}strength trend">
    <g class="grid">${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('')}</g>
    <path class="area" d="${path}L${x(t1)},${H - B}L${x(t0)},${H - B}Z"/>
    <path class="line" d="${path}"/>
    ${pts.map((p, i) => `<circle class="dot ${i === pts.length - 1 ? 'end' : ''}" cx="${x(p.t)}" cy="${y(p.v)}" r="${i === pts.length - 1 ? 5 : 3.5}"><title>${fmtDate(p.t)}: ${Math.round(p.v)} kg (top set ${p.top} kg)</title></circle>`).join('')}
    <text x="${L}" y="${H - 6}">${fmtDate(t0, { day: 'numeric', month: 'short' })}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDate(t1, { day: 'numeric', month: 'short' })}</text>
    <text x="${Math.min(x(last.t), W - R - 4)}" y="${y(last.v) - 10}" text-anchor="end" style="fill:var(--fg)">${Math.round(last.v)} kg</text>
  </svg>`;
}

// ---------- COACH ----------
const coach = new Coach(store, { onShowExercise: openExercise });
let coachState = 'connecting', coachAbort = null, coachImage = null;
coach.init().then((ok) => { coachState = ok ? 'ready' : 'off'; if (tab === 'coach') renderTab(); });
function renderCoach(el) {
  const prompts = ['Build me a 3-day plan to lose fat', 'The leg press is busy. What else hits the same muscles?', 'How do I set up the lat pulldown?', 'Review my last workouts and tell me what to change'];
  if (coachState !== 'ready') {
    el.innerHTML = `<h1>Coach</h1><section class="panel">${coachState === 'connecting' ? '<p class="muted">Connecting to your coach…</p>' : `<h2>Coach chat is offline here</h2><p class="muted">The AI coach runs on Claude when Spotter is opened as a Claude artifact. Everything else in the app (3D demos, programs, workout logging, progress) works right here.</p><div class="row"><button class="btn btn-sm" data-act="wizard">Build a program with the wizard</button></div>`}</section>`;
    return;
  }
  const busy = coach.messages.some((m) => m.pending);
  el.innerHTML = `<div class="spread"><h1>Coach</h1>${coach.messages.length ? '<button class="btn btn-sm" data-act="coach-clear">New chat</button>' : ''}</div>
  <div class="chat" id="chat">${coach.messages.length ? coach.messages.map(msgHtml).join('') : `<div class="msg assistant">Hi, I’m your Spotter coach. I can see your program and logged workouts. Ask me to build or tweak a plan, explain technique, find a swap when a machine is taken${coach.limits?.images ? ', or snap a photo of a machine and I’ll tell you what it is' : ''}.</div>`}</div>
  ${coach.messages.length ? '' : `<div class="chips">${prompts.map((p) => `<button class="chip" data-act="coach-prompt">${esc(p)}</button>`).join('')}</div>`}
  ${coachImage ? `<div class="attach-preview"><img src="${coachImage.url}" alt="Photo to send"><span>Photo attached</span><button class="btn btn-sm btn-ghost" data-act="coach-unattach">Remove</button></div>` : ''}
  <form class="composer" id="composer">
    ${coach.limits?.images ? `<label class="attach" for="coach-photo" aria-label="Attach a photo">${ICON.camera}</label><input id="coach-photo" type="file" accept="${esc(coach.limits.images.mediaTypes.join(','))}" capture="environment" hidden>` : '<span></span>'}
    <textarea id="coach-input" rows="1" placeholder="Ask your coach…" aria-label="Message"></textarea>
    ${busy ? `<button type="button" class="send" data-act="coach-stop" aria-label="Stop">${ICON.stop}</button>` : `<button class="send" type="submit" aria-label="Send">${ICON.send}</button>`}
  </form>`;
  const chat = $('#chat'); chat.lastElementChild?.scrollIntoView({ block: 'end' });
}
function msgHtml(m) {
  if (m.role === 'user') return `<div class="msg user">${m.hasImage ? '📷 ' : ''}${esc(m.content)}</div>`;
  const body = m.pending && !m.content ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(m.content).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const chips = m.chips?.length ? `<div class="chips">${m.chips.map((id) => EX_BY_ID[id] ? `<button class="chip" data-act="open-ex" data-id="${id}">▶ ${esc(EX_BY_ID[id].name)} in 3D</button>` : '').join('')}</div>` : '';
  const prop = m.proposal ? `<div class="proposal"><b>${esc(m.proposal.name)}</b><span class="muted">${m.proposal.days.length} days · ${m.proposal.days.map((d) => esc(d.name)).join(', ')}</span>${m.proposal.notes ? `<span>${esc(m.proposal.notes)}</span>` : ''}<div class="row"><button class="btn btn-sm btn-primary" data-act="apply-proposal" data-id="${m.proposal.id}">Apply program</button><button class="btn btn-sm" data-act="preview-proposal" data-id="${m.proposal.id}">Preview</button></div></div>` : '';
  return `<div class="msg assistant ${m.error ? 'error' : ''}">${body}${chips}${prop}</div>`;
}
async function sendCoach(text) {
  text = text.trim(); if (!text && !coachImage) return;
  coachAbort = new AbortController();
  const img = coachImage; coachImage = null;
  const update = () => { if (tab !== 'coach') return; const chat = $('#chat'); if (!chat) return; chat.innerHTML = coach.messages.map(msgHtml).join(''); chat.lastElementChild?.scrollIntoView({ block: 'end' }); };
  const p = coach.ask(text || 'What machine is this and how do I use it?', { image: img?.blob, signal: coachAbort.signal, onUpdate: update });
  renderTab();
  await p;
  if (img) URL.revokeObjectURL(img.url);
  if (tab === 'coach') renderTab();
}
function findProposal(id) { return coach.messages.find((m) => m.proposal?.id === id)?.proposal; }

// ---------- sheet ----------
function openSheet(html) { const w = $('#sheet'); w.querySelector('.sheet').innerHTML = html; w.hidden = false; hydrateThumbs(w); }
function closeSheet() { $('#sheet').hidden = true; }
function pickerSheet(title, act, extra = '') {
  openSheet(`<h2>${esc(title)}</h2><label class="search">${ICON.search}<input class="input" id="pick-q" type="search" placeholder="Search exercises" autocomplete="off"></label>
    <div class="pick-list" id="pick-list">${EXERCISES.map((e) => `<button class="ex-row" data-act="${act}" data-id="${e.id}" ${extra} data-name="${esc((e.name + ' ' + EQ_BY_ID[e.eq].name + ' ' + e.primary.join(' ')).toLowerCase())}">${thumbImg(e)}<span class="name">${esc(e.name)}<br><span class="sub">${esc(EQ_BY_ID[e.eq].name)}</span></span><span class="rx">${levelDots(e.level)}</span></button>`).join('')}</div>`);
}

// ---------- events ----------
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id;
  const w = store.state.active;
  switch (a) {
    case 'tab': closeSheet(); setTab(t.dataset.tab); break;
    case 'open-ex': closeSheet(); openExercise(id); break;
    case 'open-eq': openEquipment(id); break;
    case 'eq-demo': openEquipment(t.dataset.eq, id); break;
    case 'close-detail': closeDetail(); break;
    case 'play': { const v = getViewer(); v.playing = !v.playing; setPlayBtn(t.closest('.overlay'), v.playing); break; }
    case 'speed': getViewer().speed = +t.dataset.v; t.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b === t)); break;
    case 'cam': getViewer().setView(t.dataset.v); t.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b === t)); break;
    case 'tog': {
      const on = t.getAttribute('aria-pressed') !== 'true'; t.setAttribute('aria-pressed', on);
      const v = getViewer();
      if (t.dataset.v === 'ghost') v.setGhosts(on); else if (t.dataset.v === 'xray') v.setXray(on); else v.setAutoRotate(on);
      break;
    }
    case 'lib-mode': ui.libMode = t.dataset.v; renderTab(); break;
    case 'lib-zone': ui.libZone = t.dataset.v; renderTab(); break;
    case 'lib-muscle': ui.libMuscle = t.dataset.v; renderTab(); break;
    case 'lib-clear': ui.libQuery = ''; ui.libZone = 'all'; ui.libMuscle = 'all'; renderTab(); break;
    case 'start': if (w) { openWorkout(); break; } startWorkout(+t.dataset.day); break;
    case 'resume': openWorkout(); break;
    case 'pick-day': openSheet(`<h2>Choose a day</h2><div class="pick-list">${store.state.program.days.map((d, i) => `<button class="ex-row" style="grid-template-columns:1fr auto" data-act="start-day" data-day="${i}"><span class="name">${esc(d.name)}<br><span class="sub">${d.items.length} exercises</span></span><span class="rx">≈${estMinutes(d)} min</span></button>`).join('')}</div>`); break;
    case 'start-day': closeSheet(); if (w) openWorkout(); else startWorkout(+t.dataset.day); break;
    case 'add-to-workout': {
      const ex = EX_BY_ID[id]; const it = { ...prescribe(ex, store.state.program?.goal || 'general', 1) };
      if (w) { w.items.push({ exId: id, target: it, sug: suggest(store.state.sessions, it, store.state.settings), sets: Array.from({ length: ex.type === 'cardio' ? 1 : it.sets }, () => newSetFor(it, null)), note: '' }); w.cur = w.items.length - 1; saveActive(); $('#detail').hidden = true; ui.openItem = null; openWorkout(); toast('Added to your workout'); }
      else { $('#detail').hidden = true; startWorkout(-1, [it], 'Quick workout'); }
      break;
    }
    // workout
    case 'wo-close': closeWorkout(); toast('Workout minimised. Resume from Today.'); break;
    case 'wo-next': if (w.cur < w.items.length - 1) { w.cur++; saveActive(); renderWorkout(); $('#workout').scrollTop = 0; } break;
    case 'wo-prev': if (w.cur > 0) { w.cur--; saveActive(); renderWorkout(); $('#workout').scrollTop = 0; } break;
    case 'wo-finish': finishWorkout(); break;
    case 'wo-discard': closeSheet(); store.set({ active: null }); closeWorkout(); toast('Workout discarded'); break;
    case 'done-set': markSet(+t.dataset.i); break;
    case 'step': {
      const item = currentItem(), s = item.sets[+t.dataset.i], f = t.dataset.f;
      s[f] = Math.max(0, Math.round(((+s[f] || 0) + +t.dataset.d) * 10) / 10); saveActive();
      const inp = document.getElementById(`in-${item.exId}-${t.dataset.i}-${f}`); if (inp) inp.value = s[f];
      break;
    }
    case 'add-set': { const item = currentItem(); const prev = item.sets.at(-1); item.sets.push({ ...prev, done: false }); saveActive(); renderWorkout(); break; }
    case 'swap': swapSheet(); break;
    case 'do-swap': {
      const item = currentItem(), ex = EX_BY_ID[id];
      // same kind of exercise keeps the prescription; otherwise prescribe fresh
      const target = EX_BY_ID[item.exId].type === ex.type ? { ...item.target, exId: id } : prescribe(ex, store.state.program?.goal || 'general', 1);
      Object.assign(item, { exId: id, target, sug: suggest(store.state.sessions, target, store.state.settings) });
      item.sets = item.sets.map(() => newSetFor(item.target, item.sug));
      saveActive(); closeSheet(); renderWorkout(); toast('Swapped to ' + ex.name); break;
    }
    case 'hold-timer': holdTimer(+t.dataset.i); break;
    case 'rest-add': if (restState) { restState.end += +t.dataset.v * 1000; restState.total = Math.max(restState.total, (restState.end - Date.now()) / 1000); restState.over = false; renderRest(); } break;
    case 'rest-skip': { const then = restState?.then; stopRest(); if (then === 'next' && w && w.cur < w.items.length - 1) { w.cur++; saveActive(); renderWorkout(); } break; }
    // program
    case 'wizard': closeSheet(); openWizard(); break;
    case 'close-wizard': $('#wizard').hidden = true; document.body.style.overflow = ''; break;
    case 'wiz': { const v = t.dataset.v; wiz[t.dataset.k] = /^\d+$/.test(v) ? +v : v; renderWizard(); break; }
    case 'wiz-lim': { const v = t.dataset.v; wiz.limits = wiz.limits.includes(v) ? wiz.limits.filter((x) => x !== v) : [...wiz.limits, v]; renderWizard(); break; }
    case 'wiz-save': store.set({ profile: { ...wiz }, program: generateProgram(wiz) }); $('#wizard').hidden = true; document.body.style.overflow = ''; setTab('program'); toast('Program saved'); break;
    case 'edit-item': editing = editing === t.dataset.k ? null : t.dataset.k; renderTab(); break;
    case 'move-item': mutateProgram((p) => { const d = p.days[+t.dataset.d].items, i = +t.dataset.i, j = i + +t.dataset.v; [d[i], d[j]] = [d[j], d[i]]; editing = t.dataset.d + ':' + j; }); renderTab(); break;
    case 'del-item': mutateProgram((p) => p.days[+t.dataset.d].items.splice(+t.dataset.i, 1)); editing = null; renderTab(); break;
    case 'add-item': pickerSheet('Add exercise', 'pick-add', `data-d="${t.dataset.d}"`); break;
    case 'pick-add': { const ex = EX_BY_ID[id], p = store.state.program; mutateProgram((pp) => pp.days[+t.dataset.d].items.push(prescribe(ex, p.goal || 'general', p.level || 1))); closeSheet(); renderTab(); toast(ex.name + ' added'); break; }
    case 'add-day': mutateProgram((p) => p.days.push({ name: `Day ${p.days.length + 1}`, items: [] })); renderTab(); break;
    case 'del-day': if (t.dataset.confirm) { mutateProgram((p) => p.days.splice(+t.dataset.d, 1)); renderTab(); } else { t.dataset.confirm = 1; t.textContent = 'Tap again to remove'; } break;
    case 'setting-tog': { const k = t.dataset.k; store.set({ settings: { ...store.state.settings, [k]: !store.state.settings[k] } }); t.setAttribute('aria-pressed', store.state.settings[k]); break; }
    case 'export': exportData(); break;
    case 'reset': if (t.dataset.confirm) { store.reset(); store.set({ program: { ...generateProgram({ goal: 'muscle', level: 1, days: 3, minutes: 60, focus: 'balanced', pref: 'machine', limits: [] }), starter: true } }); renderTab(); toast('All data erased'); } else { t.dataset.confirm = 1; t.textContent = 'Tap again to erase all data'; } break;
    case 'del-session': if (t.dataset.confirm) { store.deleteSession(id); renderTab(); } else { t.dataset.confirm = 1; t.textContent = 'Tap again to delete'; } break;
    // coach
    case 'coach-prompt': sendCoach(t.textContent); break;
    case 'coach-stop': coachAbort?.abort(); break;
    case 'coach-clear': coach.clear(); renderTab(); break;
    case 'coach-unattach': coachImage = null; renderTab(); break;
    case 'apply-proposal': { const pr = findProposal(id); if (!pr) break; store.set({ program: structuredClone(pr) }); toast('Program applied'); setTab('program'); break; }
    case 'preview-proposal': { const pr = findProposal(id); if (!pr) break; openSheet(`<h2>${esc(pr.name)}</h2>${pr.notes ? `<p class="muted">${esc(pr.notes)}</p>` : ''}${pr.days.map((d) => `<div><h3 style="margin:8px 0 4px">${esc(d.name)}</h3>${d.items.map((it) => `<div class="spread" style="padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(EX_BY_ID[it.exId].name)}</span><span class="num muted">${rxText(it)}</span></div>`).join('')}</div>`).join('')}<button class="btn btn-primary" data-act="apply-proposal" data-id="${pr.id}">Apply program</button>`); break; }
    case 'close-sheet': closeSheet(); break;
  }
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'lib-q') { ui.libQuery = t.value; const el = $('#view-library'); const pos = t.selectionStart; renderLibrary(el); hydrateThumbs(el); const n = $('#lib-q'); n.focus(); n.setSelectionRange(pos, pos); return; }
  if (t.id === 'pick-q') { const q = t.value.toLowerCase(); document.querySelectorAll('#pick-list .ex-row').forEach((r) => { r.hidden = q && !r.dataset.name.includes(q); }); return; }
  const a = t.dataset.actInput; if (!a) return;
  if (a === 'set') { const item = currentItem(); item.sets[+t.dataset.i][t.dataset.f] = t.value === '' ? null : +t.value; saveActive(); }
  if (a === 'note') { currentItem().note = t.value; clearTimeout(t._n); t._n = setTimeout(saveActive, 600); }
});
document.addEventListener('change', (ev) => {
  const t = ev.target, a = t.dataset.actInput;
  if (t.id === 'prog-ex') { ui.progressEx = t.value; renderTab(); }
  if (t.id === 'import-file' && t.files[0]) importData(t.files[0]);
  if (t.id === 'coach-photo' && t.files[0]) { const f = t.files[0]; coachImage = { blob: f, url: URL.createObjectURL(f) }; renderTab(); }
  if (a === 'day-name') mutateProgram((p) => { p.days[+t.dataset.d].name = t.value || p.days[+t.dataset.d].name; });
  if (a === 'item') { mutateProgram((p) => { const it = p.days[+t.dataset.d].items[+t.dataset.i]; const v = Math.max(0, Math.round(+t.value || 0)); it[t.dataset.k] = v; if (it.repMin > it.repMax) it.repMax = it.repMin; if (it.secMin > it.secMax) it.secMax = it.secMin; }); renderTab(); }
  if (a === 'setting') store.set({ settings: { ...store.state.settings, [t.dataset.k]: Math.max(0.5, +t.value || 2.5) } });
});
document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'composer') return;
  ev.preventDefault();
  const inp = $('#coach-input'); const v = inp.value; inp.value = '';
  sendCoach(v);
});
document.addEventListener('keydown', (ev) => {
  if (ev.target.id === 'coach-input' && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); $('#composer').requestSubmit(); }
  if (ev.key === 'Escape') { if (!$('#sheet').hidden) closeSheet(); else if (!$('#detail').hidden) closeDetail(); }
});
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#workout').hidden) { wakeLock = null; keepAwake(); } });

async function exportData() {
  const text = store.exportJSON(), filename = `spotter-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const dl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename, data: text }); toast('Backup saved'); } catch (e) { if (e?.code !== 'declined') toast('Could not save the backup file.'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => { try { store.importJSON(String(r.result)); renderTab(); toast('Backup restored'); } catch (e) { toast(e.message || 'That file could not be read.'); } };
  r.readAsText(file);
}

// ---------- boot ----------
function updateSync() {
  const el = $('#sync');
  el.textContent = store.syncStatus === 'synced' ? 'Synced' : 'Saved on this device';
  el.classList.toggle('is-synced', store.syncStatus === 'synced');
}
store.subscribe(updateSync);
store.connect().then(() => { updateSync(); if (['today', 'program', 'progress'].includes(tab) && $('#workout').hidden) renderTab(); });
const mq = window.matchMedia('(prefers-color-scheme: light)');
mq.addEventListener?.('change', syncStageTheme);
new MutationObserver(syncStageTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

let startTab = 'today';
try { startTab = localStorage.getItem('spotter:tab') || 'today'; } catch { /* ignore */ }
if (['today', 'library', 'program', 'progress', 'coach'].includes(location.hash.slice(1))) startTab = location.hash.slice(1);
setTab(startTab);
updateSync();
