import { muscleOf } from './exercises.js';

export const isWork = (s) => s.set_type !== 'warmup' && s.weight_kg != null && s.reps > 0;
// Rows with absurd reps (e.g. 67 on a chest press) are almost always typing errors.
export const isPlausible = (s) => !(s.reps > 40 && s.weight_kg > 0);
export const e1rm = (kg, reps) => kg * (1 + reps / 30);

export const fmtKg = (v) => (v == null ? '–' : String(Math.round(v * 10) / 10).replace('.', ','));
export const fmtInt = (v) => Math.round(v).toLocaleString('fr-FR');
const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const fmtDay = (d) => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
export const fmtLongDay = (d) =>
  d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
export const sameDay = (a, b) => a.toDateString() === b.toDateString();

export const titleKey = (t) => t.toLowerCase().replace(/[^\p{L}]+/gu, ' ').trim();

export function startOfWeek(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// workouts: [{ id, title, started_at, ended_at, sets: [] }] (any order)
export function analyse(workouts) {
  const ws = [...workouts]
    .map((w) => ({ ...w, start: new Date(w.started_at), end: w.ended_at ? new Date(w.ended_at) : null }))
    .sort((a, b) => b.start - a.start);

  let tonnage = 0;
  let workSets = 0;
  let minutes = 0;
  const byMonth = new Map();
  const byMuscle = new Map();
  const exercises = new Map();

  for (const w of ws) {
    if (w.end) minutes += Math.max(0, (w.end - w.start) / 60000);
    const mk = `${w.start.getFullYear()}-${w.start.getMonth()}`;
    const perEx = new Map();
    for (const s of w.sets) {
      if (!isWork(s) || !isPlausible(s)) continue;
      const vol = s.weight_kg * s.reps;
      tonnage += vol;
      workSets += 1;
      byMonth.set(mk, (byMonth.get(mk) || 0) + vol);
      const m = muscleOf(s.exercise);
      byMuscle.set(m, (byMuscle.get(m) || 0) + 1);
      if (!perEx.has(s.exercise)) perEx.set(s.exercise, []);
      perEx.get(s.exercise).push(s);
    }
    for (const [name, sets] of perEx) {
      if (!exercises.has(name)) exercises.set(name, { name, muscle: muscleOf(name), history: [], best: null });
      const ex = exercises.get(name);
      let maxKg = 0, bestE = 0, vol = 0, maxReps = 0, bestSet = null;
      for (const s of sets) {
        const e = e1rm(s.weight_kg, s.reps);
        vol += s.weight_kg * s.reps;
        maxReps = Math.max(maxReps, s.reps);
        if (s.weight_kg > maxKg) maxKg = s.weight_kg;
        if (e > bestE) { bestE = e; bestSet = s; }
      }
      const allSets = w.sets.filter((s) => s.exercise === name);
      ex.history.push({ date: w.start, workoutId: w.id, maxKg, e1rm: bestE, vol, maxReps, sets, allSets });
      if (!ex.best || bestE > ex.best.e1rm) ex.best = { e1rm: bestE, kg: bestSet.weight_kg, reps: bestSet.reps, date: w.start };
    }
  }
  for (const ex of exercises.values()) ex.history.reverse(); // oldest → newest

  const exerciseList = [...exercises.values()].sort((a, b) => b.history.length - a.history.length);

  // Last 14 months of volume, oldest first.
  const now = new Date();
  const months = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      date: d,
      label: MONTH_SHORT[d.getMonth()][0].toUpperCase(),
      tonnes: (byMonth.get(`${d.getFullYear()}-${d.getMonth()}`) || 0) / 1000,
      current: i === 0,
    });
  }

  const muscleTotal = [...byMuscle.values()].reduce((a, b) => a + b, 0) || 1;
  const muscles = [...byMuscle.entries()]
    .map(([name, n]) => ({ name, n, pct: (n / muscleTotal) * 100 }))
    .sort((a, b) => b.n - a.n);

  // Programs = session titles used over the last 4 months. "Dos / Biceps ✌🏻" and
  // "Dos/Biceps" are the same program; the most recent spelling is shown.
  const recent = ws.filter((w) => now - w.start < 120 * 86400000);
  const progMap = new Map();
  for (const w of recent) {
    const key = titleKey(w.title);
    const p = progMap.get(key) || { title: w.title, count: 0, last: w.start };
    p.count += 1;
    if (w.start > p.last) { p.last = w.start; p.title = w.title; }
    progMap.set(key, p);
  }
  const programs = [...progMap.values()].sort((a, b) => b.count - a.count).slice(0, 4);
  const rotation = programs.slice(0, 3);
  const nextProgram = rotation.length ? [...rotation].sort((a, b) => a.last - b.last)[0] : null;

  const weekStart = startOfWeek(now);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { date: d, done: ws.some((w) => sameDay(w.start, d)), today: sameDay(d, now), letter: 'LMMJVSD'[i] };
  });

  // Consecutive weeks with at least one session, up to this week (or last week if this one is empty).
  const weekSet = new Set(ws.map((w) => startOfWeek(w.start).getTime()));
  const cursor = startOfWeek(now);
  if (!weekSet.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (weekSet.has(cursor.getTime())) { streak += 1; cursor.setDate(cursor.getDate() - 7); }
  const thisWeek = ws.filter((w) => w.start >= weekStart);
  const week = {
    sessions: thisWeek.length,
    kg: thisWeek.reduce((a, w) => a + w.sets.filter((x) => isWork(x) && isPlausible(x)).reduce((b, x) => b + x.weight_kg * x.reps, 0), 0),
    streak,
  };

  const full = months.slice(0, 13);
  const peak = full.reduce((a, b) => (b.tonnes > a.tonnes ? b : a), full[0]);
  const lastFull = full[full.length - 1];
  const legSets = byMuscle.get('Jambes') || 0;

  return {
    workouts: ws,
    summary: {
      sessions: ws.length,
      hours: minutes / 60,
      tonnes: tonnage / 1000,
      workSets,
      since: ws.length ? ws[ws.length - 1].start : null,
    },
    months,
    muscles,
    exercises,
    exerciseList,
    programs,
    nextProgram,
    weekDays,
    week,
    alerts: { legSets, workSets, peak, lastFull },
  };
}

// The exercises of the most recent session with that title, in order.
export function templateFor(data, title) {
  const w = data.workouts.find((x) => x.title === title);
  if (!w) return [];
  const order = new Map();
  for (const s of w.sets) {
    if (!order.has(s.exercise)) order.set(s.exercise, { name: s.exercise, position: s.position ?? order.size, sets: [] });
    order.get(s.exercise).sets.push(s);
  }
  return [...order.values()].sort((a, b) => a.position - b.position);
}

export function lastSetsOf(data, name) {
  const ex = data.exercises.get(name);
  if (!ex || !ex.history.length) return [];
  return ex.history[ex.history.length - 1].allSets;
}
