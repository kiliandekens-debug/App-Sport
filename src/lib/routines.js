import { templateFor, titleKey, startOfWeek, sameDay } from './stats.js';
import { programById, placeStrength } from './programs.js';
import { scheduleOf } from './running.js';

export const LETTERS = 'ABCDEFGH';

const COMPOUND = /développé|developpe|couché|rowing|tirage|traction|presse|squat|soulevé|dips|chest press|militaire/i;
export const defaultRest = (name) => (COMPOUND.test(name) ? 120 : 90);

// Turns the last session with this title into a routine (sets and reps, no loads:
// loads are taken from the last time when the routine is started).
export function routineFromHistory(data, title) {
  const tpl = templateFor(data, title);
  const groups = new Map();
  return {
    name: title,
    exercises: tpl.map((t) => {
      const sid = t.sets.find((s) => s.superset_id != null)?.superset_id;
      if (sid != null && !groups.has(sid)) groups.set(sid, LETTERS[groups.size % LETTERS.length]);
      return {
        name: t.name,
        rest: defaultRest(t.name),
        superset: sid != null ? groups.get(sid) : null,
        sets: t.sets.map((s) => ({ type: s.set_type || 'normal', reps: s.reps ?? null, kg: null })),
      };
    }),
  };
}

// Supersets keep only groups with at least two exercises.
export function cleanSupersets(exercises) {
  const count = new Map();
  for (const e of exercises) if (e.superset) count.set(e.superset, (count.get(e.superset) || 0) + 1);
  return exercises.map((e) => (e.superset && count.get(e.superset) < 2 ? { ...e, superset: null } : e));
}

export function nextLetter(exercises) {
  const used = new Set(exercises.map((e) => e.superset).filter(Boolean));
  return [...LETTERS].find((l) => !used.has(l)) || 'A';
}

// The link between exercise i and the one after it: joins them into one superset,
// or, if they are already linked, splits the superset at that point.
export function toggleSuperset(exercises, i) {
  const ex = exercises[i];
  const nx = exercises[i + 1];
  if (!nx) return exercises;
  if (ex.superset && nx.superset === ex.superset) {
    const letter = ex.superset;
    const fresh = nextLetter(exercises);
    return cleanSupersets(exercises.map((e, j) => (j > i && e.superset === letter ? { ...e, superset: fresh } : e)));
  }
  const letter = ex.superset || nx.superset || nextLetter(exercises);
  const old = nx.superset;
  return cleanSupersets(exercises.map((e, j) => (j === i || j === i + 1 || (old && e.superset === old) ? { ...e, superset: letter } : e)));
}

export const SUPERSET_COLORS = { A: '#F2B705', B: '#3FBF7F', C: '#F2695C', D: '#B79CFF', E: '#5CC8F2', F: '#F29E4C', G: '#F2B705', H: '#3FBF7F' };

// The strength programme's week: for each day (Monday first), the routine planned, placed
// around the runs of the plan; done = a session of that name this week. null without programme.
export function programWeek(data, now = new Date()) {
  const p = data.program && programById(data.program.id);
  if (!p) return null;
  const byId = new Map(data.routines.map((r) => [r.id, r]));
  const routines = (data.program.routines || []).map((id) => byId.get(id) || null);
  if (!routines.some(Boolean)) return null;
  const place = placeStrength(p, data.runProfile ? scheduleOf(data.runProfile) : null);
  const monday = startOfWeek(now);
  const doneThisWeek = (r) => data.workouts.find((w) => w.start >= monday && titleKey(w.title) === titleKey(r.name)) || null;
  const days = place.map((i, d) => {
    const r = i == null ? null : routines[i];
    if (!r) return null;
    const date = new Date(monday);
    date.setDate(date.getDate() + d);
    const done = doneThisWeek(r);
    return { routine: r, dayId: p.days[i], date, done: !!done, today: sameDay(date, now) };
  });
  return { program: p, days, routines: routines.filter(Boolean) };
}

// The session suggested next. With a programme: today's session, else the next one of the
// week not done yet, else the first of the programme. Without: the routine done the longest
// time ago, or the next one in the usual rotation of the history. Shared by home and watch.
export function nextSession(data, now = new Date()) {
  const lastDone = (name) => data.workouts.find((w) => titleKey(w.title) === titleKey(name))?.start || null;
  const routines = data.routines.map((r) => ({ ...r, last: lastDone(r.name) }));
  const pw = programWeek(data, now);
  if (pw) {
    const todayIdx = (now.getDay() + 6) % 7;
    const pending = pw.days.filter((x, d) => x && !x.done && d >= todayIdx);
    const any = pw.days.filter((x) => x && !x.done);
    const pick = pending[0] || any[0] || pw.days.find(Boolean);
    const next = pick ? routines.find((r) => r.id === pick.routine.id) : null;
    if (next) return { routines, next, program: pw };
  }
  const suggested = routines.length
    ? [...routines].sort((a, b) => (a.last?.getTime() || 0) - (b.last?.getTime() || 0))[0]
    : null;
  const fromHistory = !suggested && data.nextProgram
    ? { ...routineFromHistory(data, data.nextProgram.title), name: data.nextProgram.title, last: data.nextProgram.last }
    : null;
  return { routines, next: suggested || fromHistory, program: null };
}
