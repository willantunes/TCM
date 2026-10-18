// Program generator, set/rep prescriptions and progression suggestions.
import { EX_BY_ID } from './exercises.js';
import { uid } from './store.js';

export const GOALS = {
  muscle: { name: 'Build muscle', blurb: 'Moderate weights, 6–15 reps, enough volume to grow.' },
  strength: { name: 'Get stronger', blurb: 'Heavier compound lifts, low reps, longer rest.' },
  fatloss: { name: 'Lose fat', blurb: 'Keep muscle with weights, add cardio finishers, short rests.' },
  general: { name: 'Fit & healthy', blurb: 'Balanced strength and cardio, joint-friendly.' },
};
export const LEVELS = { 1: 'Beginner (0–6 months)', 2: 'Intermediate (6 months–2 years)', 3: 'Advanced (2+ years)' };

const POOLS = {
  squat: { machine: ['leg-press', 'smith-squat', 'goblet-squat', 'back-squat'], free: ['goblet-squat', 'back-squat', 'smith-squat', 'leg-press'] },
  hinge: { machine: ['back-extension', 'rdl', 'kb-swing', 'deadlift'], free: ['rdl', 'deadlift', 'kb-swing', 'back-extension'] },
  lunge: { machine: ['reverse-lunge'], free: ['reverse-lunge'] },
  'push-h': { machine: ['chest-press', 'db-bench', 'push-up', 'bench-press'], free: ['db-bench', 'bench-press', 'push-up', 'chest-press'] },
  'push-v': { machine: ['shoulder-press', 'db-shoulder-press'], free: ['db-shoulder-press', 'shoulder-press'] },
  'pull-v': { machine: ['lat-pulldown', 'assisted-pullup'], free: ['assisted-pullup', 'lat-pulldown'] },
  'pull-h': { machine: ['seated-row', 'barbell-row'], free: ['barbell-row', 'seated-row'] },
  fly: { machine: ['pec-fly', 'cable-fly'], free: ['cable-fly', 'pec-fly'] },
  'rear-delt': { machine: ['rear-delt', 'face-pull'], free: ['face-pull', 'rear-delt'] },
  lateral: { machine: ['lateral-raise'], free: ['lateral-raise'] },
  biceps: { machine: ['machine-curl', 'db-curl'], free: ['db-curl', 'machine-curl'] },
  triceps: { machine: ['triceps-pushdown', 'assisted-dip'], free: ['triceps-pushdown', 'assisted-dip'] },
  'quad-iso': { machine: ['leg-extension'], free: ['leg-extension'] },
  'ham-iso': { machine: ['leg-curl'], free: ['leg-curl'] },
  glute: { machine: ['hip-thrust', 'hip-abduction'], free: ['hip-thrust', 'kb-swing'] },
  abductor: { machine: ['hip-abduction'], free: ['hip-abduction'] },
  adductor: { machine: ['hip-adduction'], free: ['hip-adduction'] },
  calves: { machine: ['smith-calf'], free: ['smith-calf'] },
  core: { machine: ['ab-crunch', 'plank', 'knee-raise'], free: ['plank', 'knee-raise', 'ab-crunch'] },
};

const AVOID = {
  knees: ['back-squat', 'reverse-lunge', 'goblet-squat', 'smith-squat', 'stairs', 'treadmill-run', 'kb-swing'],
  back: ['deadlift', 'back-squat', 'barbell-row', 'rdl', 'kb-swing', 'back-extension'],
  shoulders: ['bench-press', 'assisted-dip', 'db-shoulder-press', 'shoulder-press', 'cable-fly', 'push-up'],
};
export const LIMITATIONS = { knees: 'Sensitive knees', back: 'Lower back', shoulders: 'Shoulders' };

const TEMPLATES = {
  fbA: { name: 'Full body A', slots: ['squat', 'push-h', 'pull-v', 'hinge', 'lateral', 'core', 'biceps'] },
  fbB: { name: 'Full body B', slots: ['hinge', 'push-v', 'pull-h', 'lunge', 'fly', 'triceps', 'core'] },
  fbC: { name: 'Full body C', slots: ['squat', 'pull-v', 'push-h', 'glute', 'rear-delt', 'calves', 'core'] },
  upper: { name: 'Upper body', slots: ['push-h', 'pull-v', 'push-v', 'pull-h', 'lateral', 'biceps', 'triceps'] },
  lower: { name: 'Lower body', slots: ['squat', 'hinge', 'quad-iso', 'ham-iso', 'glute', 'calves', 'core'] },
  push: { name: 'Push', slots: ['push-h', 'push-v', 'fly', 'lateral', 'triceps', 'core'] },
  pull: { name: 'Pull', slots: ['pull-v', 'pull-h', 'rear-delt', 'biceps', 'hinge', 'core'] },
  legs: { name: 'Legs', slots: ['squat', 'hinge', 'lunge', 'quad-iso', 'ham-iso', 'calves', 'abductor'] },
};
function split(days, level) {
  if (days <= 2) return ['fbA', 'fbB'];
  if (days === 3) return level >= 2 ? ['push', 'pull', 'legs'] : ['fbA', 'fbB', 'fbC'];
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return ['upper', 'lower', 'push', 'pull', 'legs'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

export const COMPOUND = new Set(['squat', 'hinge', 'lunge', 'push-h', 'push-v', 'pull-h', 'pull-v']);
const LOWER = new Set(['squat', 'hinge', 'lunge', 'glute']);

export function prescribe(ex, goal, level) {
  if (ex.type === 'cardio') return { exId: ex.id, minutes: 10 };
  if (ex.type === 'time') return { exId: ex.id, sets: 3, secMin: level >= 2 ? 45 : 30, secMax: level >= 2 ? 60 : 45, rest: 60 };
  const c = COMPOUND.has(ex.pattern);
  const table = {
    strength: c ? [4, 4, 6, 180] : [3, 8, 12, 90],
    muscle: c ? [level >= 2 ? 4 : 3, 6, 10, 120] : [3, 10, 15, 75],
    fatloss: c ? [3, 10, 12, 60] : [3, 12, 15, 45],
    general: c ? [3, 8, 12, 90] : [2, 12, 15, 60],
  }[goal] || [3, 8, 12, 90];
  let [sets, repMin, repMax, rest] = table;
  if (level === 1) sets = Math.min(sets, 3);
  if (ex.pattern === 'core') { repMin = 10; repMax = 15; rest = 60; }
  if (ex.id === 'kb-swing') { repMin = 12; repMax = 20; }
  return { exId: ex.id, sets, repMin, repMax, rest };
}

export function candidates(pattern, { pref = 'machine', level = 1, limits = [] } = {}) {
  const pool = POOLS[pattern]?.[pref === 'free' ? 'free' : 'machine'] || [];
  const avoid = new Set(limits.flatMap((l) => AVOID[l] || []));
  const ok = pool.filter((id) => EX_BY_ID[id] && !avoid.has(id));
  const fit = ok.filter((id) => EX_BY_ID[id].level <= level);
  return fit.length ? fit : ok;
}

export function generateProgram(profile) {
  const { goal = 'muscle', level = 1, days = 3, minutes = 60, focus = 'balanced', pref = 'machine', limits = [] } = profile;
  const count = { 30: 4, 45: 5, 60: 6, 75: 7 }[minutes] || 6;
  const used = {};
  const plan = split(days, level).map((tk, di) => {
    let slots = [...TEMPLATES[tk].slots];
    const isLower = ['lower', 'legs', 'fbA', 'fbB', 'fbC'].includes(tk);
    if (focus === 'glutes' && isLower) slots = ['glute', ...slots.filter((s) => s !== 'glute'), 'abductor'];
    if (focus === 'upper' && !['lower', 'legs'].includes(tk)) slots.splice(3, 0, 'fly', 'lateral');
    if (focus === 'core') slots.splice(2, 0, 'core');
    const picked = [];
    for (const slot of slots) {
      if (picked.length >= count) break;
      const list = candidates(slot, { pref, level, limits }).filter((id) => !picked.some((p) => p.exId === id));
      if (!list.length) continue;
      used[slot] = (used[slot] ?? -1) + 1;
      const id = list[used[slot] % list.length];
      picked.push(prescribe(EX_BY_ID[id], goal, level));
    }
    const warm = limits.includes('knees') ? 'bike' : ['crosstrainer', 'bike', 'row-erg'][di % 3];
    const items = [{ exId: warm, minutes: 5, warmup: true }, ...picked];
    if (goal === 'fatloss' || goal === 'general') {
      const fin = (limits.includes('knees') ? ['bike', 'row-erg', 'crosstrainer'] : ['treadmill-run', 'row-erg', 'stairs', 'bike'])[di % (limits.includes('knees') ? 3 : 4)];
      items.push({ exId: fin, minutes: goal === 'fatloss' ? 15 : 10 });
    }
    return { name: `Day ${di + 1} · ${TEMPLATES[tk].name}`, items };
  });
  return { id: uid(), name: `${GOALS[goal].name} · ${days} days/week`, goal, level, createdAt: Date.now(), days: plan };
}

// ---------- history helpers ----------
export const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);

export function lastPerformance(sessions, exId) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const it = sessions[i].items.find((x) => x.exId === exId && x.sets.some((s) => s.done));
    if (it) return { session: sessions[i], item: it, sets: it.sets.filter((s) => s.done) };
  }
  return null;
}

export function bestE1rm(sessions, exId) {
  let best = 0;
  for (const s of sessions) for (const it of s.items) if (it.exId === exId) for (const st of it.sets) if (st.done) best = Math.max(best, e1rm(st.kg, st.reps));
  return best;
}

const roundTo = (x, step) => Math.round(x / step) * step;

// Double progression: hit the top of the rep range on every set → add weight next time.
export function suggest(sessions, item, settings) {
  const ex = EX_BY_ID[item.exId];
  if (!ex || ex.type !== 'reps') return null;
  const last = lastPerformance(sessions, item.exId);
  if (!last) return { kg: null, reason: `New exercise: choose a weight you can lift ${item.repMax} times with about 2 reps to spare.` };
  const top = Math.max(...last.sets.map((s) => s.kg || 0));
  const topSets = last.sets.filter((s) => (s.kg || 0) === top);
  const inc = LOWER.has(ex.pattern) && COMPOUND.has(ex.pattern) ? settings.lowerInc : settings.upperInc;
  const lastStr = last.sets.map((s) => `${s.kg || 0}×${s.reps}`).join(', ');
  if (top === 0) return { kg: 0, reason: `Last time: ${lastStr}. Aim for more reps.` };
  if (topSets.length >= Math.min(item.sets, last.sets.length) && topSets.every((s) => s.reps >= item.repMax))
    return { kg: roundTo(top + inc, 0.5), up: true, reason: `Last time ${lastStr}. You hit ${item.repMax}+ on every set, so add ${inc} kg.` };
  if (topSets.some((s) => s.reps < item.repMin - 2))
    return { kg: roundTo(top * 0.9, 0.5), down: true, reason: `Last time ${lastStr} fell short of ${item.repMin} reps. Drop about 10% and own the range.` };
  return { kg: top, reason: `Last time ${lastStr}. Same weight, beat at least one rep.` };
}

export function sessionVolume(s) {
  let v = 0;
  for (const it of s.items) for (const st of it.sets) if (st.done) v += (st.kg || 0) * (st.reps || 0);
  return v;
}

export function nextDayIndex(state) {
  const p = state.program;
  if (!p) return 0;
  const last = [...state.sessions].reverse().find((s) => s.programId === p.id);
  return last ? (last.dayIndex + 1) % p.days.length : 0;
}
