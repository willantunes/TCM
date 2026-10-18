// AI coach: asks Claude through the artifact's `sample` capability, with page tools so the coach
// can read your training data, propose a program you approve, and open 3D demos.
import { EXERCISES, EX_BY_ID, EQUIPMENT, PATTERNS } from './exercises.js';
import { sessionVolume } from './programs.js';
import { uid } from './store.js';

const INSTRUCTIONS = `You are Spotter, an encouraging, precise personal trainer inside a gym app used on the gym floor (typical European budget gym: selectorized machines, cables, dumbbells, barbells, squat racks, Smith machine, cardio).
Rules:
- Keep answers short and scannable for a phone screen: a one-line answer first, then at most 5 bullets. Use plain language and metric units (kg, km/h).
- Only recommend exercises from the app's library (use list_exercises). Refer to exercises by their exact app names.
- When the user wants a new or changed plan, call propose_program with a complete plan; the user approves it in the app. Do not paste the full plan as text as well, just summarise it in 2-3 lines.
- When explaining technique, call show_exercise so the user can watch the 3D demo.
- Use get_training_context to personalise (goal, level, program, recent sessions, personal bests).
- If the user reports sharp pain, numbness, chest pain or dizziness, tell them to stop and consult a medical professional; do not diagnose.
- If the user sends a photo of a machine, identify it, map it to the closest equipment in the app, and explain how to set it up.`;

export class Coach {
  constructor(store, { onProposal, onShowExercise }) {
    this.store = store;
    this.onProposal = onProposal;
    this.onShowExercise = onShowExercise;
    this.messages = []; // { role, content, chips?: [exId], proposal?: id, image? }
    this.sample = null; this.limits = null; this.ready = false;
    this.proposals = new Map();
    try { this.messages = JSON.parse(sessionStorage.getItem('spotter:coach') || '[]'); } catch { /* ignore */ }
  }
  async init() {
    if (!window.claude?.use) return false;
    this.sample = await window.claude.use('sample');
    if (!this.sample) return false;
    this.limits = await this.sample.limits().catch(() => null);
    this.ready = true;
    return true;
  }
  persist() { try { sessionStorage.setItem('spotter:coach', JSON.stringify(this.messages.slice(-30).map(({ image, ...m }) => m))); } catch { /* ignore */ } }

  context() {
    const s = this.store.state;
    const sessions = s.sessions.slice(-8).map((x) => ({
      date: new Date(x.start).toISOString().slice(0, 10), day: x.dayName, minutes: Math.round((x.end - x.start) / 60000),
      volumeKg: Math.round(sessionVolume(x)),
      exercises: x.items.filter((i) => i.sets.some((st) => st.done)).map((i) => `${EX_BY_ID[i.exId]?.name}: ${i.sets.filter((st) => st.done).map((st) => st.min ? `${st.min} min` : st.sec ? `${st.sec}s` : `${st.kg || 0}kg×${st.reps}`).join(', ')}`),
    }));
    const program = s.program && { name: s.program.name, days: s.program.days.map((d) => ({ name: d.name, items: d.items.map((i) => ({ exId: i.exId, name: EX_BY_ID[i.exId]?.name, sets: i.sets, reps: i.repMin ? `${i.repMin}-${i.repMax}` : undefined, seconds: i.secMin ? `${i.secMin}-${i.secMax}` : undefined, minutes: i.minutes, rest: i.rest })) })) };
    return { profile: s.profile, program, recentSessions: sessions, totalSessions: s.sessions.length };
  }

  tools() {
    return [
      { name: 'get_training_context', description: "Returns the user's profile (goal, level, days/week, limitations), current program and the last 8 workouts with sets.",
        execute: () => this.context() },
      { name: 'list_exercises', description: 'Returns every exercise in the app library: id, name, movement pattern, equipment, difficulty level (1-3), primary muscles, type (reps/time/cardio).',
        execute: () => EXERCISES.map((e) => ({ id: e.id, name: e.name, pattern: PATTERNS[e.pattern], equipment: EQUIPMENT.find((q) => q.id === e.eq)?.name, level: e.level, muscles: e.primary, type: e.type })) },
      { name: 'show_exercise', description: 'Adds a button under your reply that opens the 3D animated demo of an exercise. Call once per exercise you discuss (max 4).',
        inputSchema: { type: 'object', properties: { exId: { type: 'string', description: 'Exercise id from list_exercises' } }, required: ['exId'] },
        execute: ({ exId }) => { if (!EX_BY_ID[String(exId)]) throw new Error('Unknown exercise id'); this._chips.add(String(exId)); return 'Demo button added.'; } },
      { name: 'propose_program', description: 'Proposes a complete training program. The user sees it as a card and can apply it (replacing their current program). Each day lists exercises in order. Use reps for type "reps", secMin/secMax for type "time", minutes for type "cardio".',
        inputSchema: { type: 'object', properties: {
          name: { type: 'string' }, notes: { type: 'string', description: 'One or two sentences on why this plan fits.' },
          days: { type: 'array', items: { type: 'object', properties: {
            name: { type: 'string' },
            items: { type: 'array', items: { type: 'object', properties: {
              exId: { type: 'string' }, sets: { type: 'integer' }, repMin: { type: 'integer' }, repMax: { type: 'integer' },
              secMin: { type: 'integer' }, secMax: { type: 'integer' }, minutes: { type: 'integer' }, rest: { type: 'integer', description: 'seconds' } }, required: ['exId'] } } }, required: ['name', 'items'] } } },
          required: ['name', 'days'] },
        execute: (input) => {
          const days = (Array.isArray(input.days) ? input.days : []).map((d) => ({
            name: String(d.name || 'Day'),
            items: (Array.isArray(d.items) ? d.items : []).filter((i) => EX_BY_ID[String(i.exId)]).map((i) => {
              const ex = EX_BY_ID[String(i.exId)], n = (v, dflt) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : dflt);
              if (ex.type === 'cardio') return { exId: ex.id, minutes: n(i.minutes, 10) };
              if (ex.type === 'time') return { exId: ex.id, sets: n(i.sets, 3), secMin: n(i.secMin, 30), secMax: n(i.secMax, 45), rest: n(i.rest, 60) };
              return { exId: ex.id, sets: n(i.sets, 3), repMin: n(i.repMin, 8), repMax: n(i.repMax, 12), rest: n(i.rest, 90) };
            }),
          })).filter((d) => d.items.length);
          if (!days.length) throw new Error('No valid days. Use exercise ids from list_exercises.');
          const id = uid();
          this.proposals.set(id, { id, name: String(input.name || 'Coach program'), notes: String(input.notes || ''), days, createdAt: Date.now(), byCoach: true });
          this._proposal = id;
          return 'Shown to the user as a card with an "Apply" button.';
        } },
    ];
  }

  async ask(text, { image, onUpdate, signal } = {}) {
    const userMsg = { role: 'user', content: text, hasImage: !!image };
    this.messages.push(userMsg);
    const reply = { role: 'assistant', content: '', chips: [], pending: true };
    this.messages.push(reply);
    onUpdate?.();
    this._chips = new Set(); this._proposal = null;
    const history = this.messages.filter((m) => !m.pending && !m.error).slice(-12);
    const turns = [{ role: 'user', content: `${INSTRUCTIONS}\n\nToday is ${new Date().toDateString()}.` }];
    for (const m of history) turns.push({ role: m.role, content: m.content || (m.hasImage ? '(photo)' : '…') });
    const opts = { signal, cache: false, onText: ({ text: t }) => { reply.content = t; onUpdate?.(); } };
    if (this.limits?.tools) { opts.tools = this.tools(); delete opts.cache; }
    if (image && this.limits?.images) opts.images = [image];
    try {
      const res = await this.sample(turns, opts);
      reply.content = res.text;
    } catch (e) {
      reply.error = true;
      const map = {
        not_granted: 'The coach needs your permission to use Claude. Allow it when prompted and try again.',
        rate_limited: 'Too many questions in a short time. Wait a minute and try again.',
        refused: 'I can’t help with that one. Try asking about training, technique or your program.',
        session_expired: 'Your session expired. Sign in again to use the coach.',
        cancelled: 'Stopped.',
      };
      reply.content = (e?.text ? e.text + '\n\n' : '') + (map[e?.code] || 'The coach is unavailable right now. Try again in a moment.');
      if (e?.code === 'refused') reply.content = map.refused;
    }
    reply.pending = false;
    reply.chips = [...this._chips];
    if (this._proposal) { reply.proposal = this.proposals.get(this._proposal); this.onProposal?.(reply.proposal); }
    this.persist();
    onUpdate?.();
    return reply;
  }
  clear() { this.messages = []; this.persist(); }
}
