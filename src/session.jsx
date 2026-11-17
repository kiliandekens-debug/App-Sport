import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { useData } from './data.jsx';
import { templateFor, lastSetsOf } from './lib/stats.js';
import { defaultRest, routineFromHistory, toggleSuperset as toggleSS, cleanSupersets } from './lib/routines.js';

const KEY = 'app-sport-session';
const REST_KEY = 'app-sport-rest';
const SessionCtx = createContext(null);

const readJson = (k) => {
  try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; }
};
const writeJson = (k, v) => {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
};

export const num = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;

// Set types, as in Hevy: tap the set number to cycle through them.
export const SET_TYPES = ['normal', 'warmup', 'dropset', 'failure'];
export const SET_LABEL = { warmup: 'É', dropset: 'D', failure: 'F' };
export const SET_NAME = { normal: 'normale', warmup: "d'échauffement", dropset: 'dégressive', failure: "jusqu'à l'échec" };
export const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300];

// Warm-up sets are computed from the first working set: 40 / 60 / 80 % for three sets
// (Hevy's default). A warm-up edited by hand stops following the working weight.
const WARM_SCHEMES = { 1: [[0.6, 5]], 2: [[0.5, 5], [0.75, 3]], 3: [[0.4, 5], [0.6, 5], [0.8, 3]], 4: [[0.3, 5], [0.5, 5], [0.7, 3], [0.85, 2]] };
const round05 = (v) => Math.round(v * 2) / 2;

export function applyWarmups(sets) {
  const base = num(sets.find((x) => x.type !== 'warmup')?.kg);
  const n = sets.filter((x) => x.type === 'warmup').length;
  if (!base || !n) return sets;
  const scheme = WARM_SCHEMES[Math.min(n, 4)];
  let i = 0;
  return sets.map((x) => {
    if (x.type !== 'warmup') return x;
    const step = scheme[Math.min(i++, scheme.length - 1)];
    return x.auto && !x.done ? { ...x, kg: String(round05(base * step[0])).replace('.', ',') } : x;
  });
}

// Adds three automatic warm-up sets, or puts the existing ones back on automatic.
export function withAutoWarmups(sets) {
  const has = sets.some((x) => x.type === 'warmup');
  const next = has
    ? sets.map((x) => (x.type === 'warmup' && !x.done ? { ...x, auto: true } : x))
    : [...WARM_SCHEMES[3].map(([, reps]) => ({ kg: '', reps: String(reps), type: 'warmup', done: false, auto: true })), ...sets];
  return applyWarmups(next);
}

function restFor(name) {
  const saved = readJson(REST_KEY) || {};
  return saved[name] ?? defaultRest(name);
}

// routineEx: { name, rest, superset, sets: [{ type, kg, reps }] } (all optional but name).
// Loads not fixed by the routine come from the coach plan, then from the last session.
function buildExercise(data, routineEx) {
  const { name } = routineEx;
  const prev = lastSetsOf(data, name).filter((s) => s.weight_kg != null).map((s) => ({ kg: s.weight_kg, reps: s.reps, type: s.set_type }));
  const prevWork = prev.filter((p) => p.type !== 'warmup');
  const prevWarm = prev.filter((p) => p.type === 'warmup');
  const plan = data.plans.get(name);
  const shape = routineEx.sets?.length ? routineEx.sets : prev.length ? prev.map((p) => ({ type: p.type })) : [{}, {}, {}];
  let w = 0, u = 0;
  const sets = shape.map((t) => {
    const type = t.type || 'normal';
    const p = type === 'warmup' ? prevWarm[u++] : prevWork[w++] || prevWork[prevWork.length - 1];
    const usePlan = plan && type !== 'warmup';
    const kg = t.kg ?? (usePlan ? plan.target_kg : p?.kg);
    const reps = usePlan && t.kg == null ? plan.target_reps : t.reps ?? p?.reps;
    return { kg: kg == null ? '' : String(kg), reps: reps == null ? '' : String(reps), type, done: false, auto: type === 'warmup' && t.kg == null };
  });
  return {
    name,
    prev,
    rest: routineEx.rest ?? restFor(name),
    superset: routineEx.superset || null,
    plan: plan ? { kg: Number(plan.target_kg), reps: plan.target_reps, reason: plan.reason } : null,
    sets: applyWarmups(sets),
  };
}

// The current session as a routine (set shapes and target reps, loads left to "last time").
export function sessionToRoutine(s, name) {
  return {
    name,
    exercises: s.exercises.map((e) => ({
      name: e.name,
      rest: e.rest,
      superset: e.superset || null,
      sets: e.sets.map((x) => ({ type: x.type || 'normal', reps: x.reps === '' ? null : Math.round(num(x.reps)), kg: null })),
    })),
  };
}

// Short beep with the Web Audio API; the context is unlocked by the "validate" tap.
let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* no audio */ }
}
function restOverAlert() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
  if (!audioCtx) return;
  [0, 0.25].forEach((t) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime + t);
    o.stop(audioCtx.currentTime + t + 0.2);
  });
}

// Value shown in grey for set j: same rank among warm-ups or working sets, last time.
export function prevOf(e, j) {
  const type = e.sets[j].type || 'normal';
  const rank = e.sets.slice(0, j).filter((x) => (x.type === 'warmup') === (type === 'warmup')).length;
  const pool = e.prev.filter((p) => (p.type === 'warmup') === (type === 'warmup'));
  return pool[rank] || null;
}

function fillFromPrev(e, j) {
  const x = e.sets[j];
  const p = prevOf(e, j);
  return {
    ...x,
    kg: x.kg === '' && p ? String(p.kg).replace('.', ',') : x.kg === '' ? '0' : x.kg,
    reps: x.reps === '' && p ? String(p.reps) : x.reps,
  };
}

// A superset must stay a block of neighbours; members cut off by a move leave the group.
function splitBrokenSupersets(exercises) {
  const out = exercises.map((e) => ({ ...e }));
  const seen = new Set();
  for (let i = 0; i < out.length; i++) {
    const l = out[i].superset;
    if (!l) continue;
    if (seen.has(l) && out[i - 1]?.superset !== l) out[i].superset = null;
    seen.add(l);
  }
  return cleanSupersets(out);
}

export function SessionProvider({ children }) {
  const data = useData();
  const [s, setS] = useState(() => readJson(KEY));
  const [now, setNow] = useState(Date.now());
  const wasResting = useRef(false);

  useEffect(() => { writeJson(KEY, s); }, [s]);
  // The clock only runs during a session: otherwise it would re-render every screen twice a second.
  const active = Boolean(s);
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);

  // Keep the screen on during a session (rest timer visible without unlocking the phone).
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let stopped = false;
    const get = async () => { try { lock = await navigator.wakeLock.request('screen'); if (stopped) lock.release(); } catch { /* refused or unsupported */ } };
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    get();
    document.addEventListener('visibilitychange', onVis);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, [active]);

  const resting = Boolean(s?.restUntil && s.restUntil > now);
  useEffect(() => {
    if (wasResting.current && !resting && s?.restUntil) restOverAlert();
    wasResting.current = resting;
  }, [resting, s?.restUntil]);

  const update = useCallback((fn) => setS((cur) => (cur ? fn(cur) : cur)), []);
  const mapEx = (ei, fn) => update((c) => ({ ...c, exercises: c.exercises.map((e, i) => (i === ei ? fn(e) : e)) }));

  const begin = (title, exercises) => setS({ title, startedAt: new Date().toISOString(), exercises, current: 0, restUntil: null, restTotal: 0 });

  const start = useCallback((title) => {
    const r = routineFromHistory(data, title);
    begin(title, r.exercises.map((e) => buildExercise(data, { ...e, rest: undefined })));
  }, [data]);

  const startRoutine = useCallback((routine) => {
    begin(routine.name, (routine.exercises || []).map((e) => buildExercise(data, e)));
  }, [data]);

  const startEmpty = useCallback(() => {
    const h = new Date().getHours();
    begin(h < 12 ? 'Entraînement du matin' : h < 18 ? "Entraînement d'après-midi" : 'Entraînement du soir', []);
  }, []);

  const addExercise = useCallback((name) => {
    setS((cur) => {
      const base = cur || { title: 'Séance libre', startedAt: new Date().toISOString(), exercises: [], current: 0, restUntil: null, restTotal: 0 };
      if (base.exercises.some((e) => e.name === name)) return { ...base, current: base.exercises.findIndex((e) => e.name === name) };
      const exercises = [...base.exercises, buildExercise(data, { name })];
      return { ...base, exercises, current: exercises.length - 1 };
    });
  }, [data]);

  const finish = useCallback(async () => {
    const c = s;
    if (!c) return null;
    const done = c.exercises.flatMap((e, position) =>
      e.sets.filter((x) => x.done).map((x, set_index) => ({
        exercise: e.name, position, set_index, set_type: x.type || 'normal', weight_kg: num(x.kg), reps: Math.round(num(x.reps)),
        superset_id: e.superset ? e.superset.charCodeAt(0) - 64 : null,
      })));
    const ended = new Date().toISOString();
    if (done.length) {
      const { data: w, error } = await supabase.from('workouts').insert({ title: c.title, started_at: c.startedAt, ended_at: ended, source: 'app' }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await supabase.from('sets').insert(done.map((d) => ({ ...d, workout_id: w.id })));
      if (e2) {
        // Without this, the half-saved workout would block every retry (same start time).
        await supabase.from('workouts').delete().eq('id', w.id);
        throw e2;
      }
      const used = [...new Set(done.map((d) => d.exercise))];
      await supabase.from('coach_plans').delete().in('exercise', used);
    }
    const work = done.filter((d) => d.set_type !== 'warmup');
    const summary = {
      title: c.title,
      minutes: Math.round((Date.parse(ended) - Date.parse(c.startedAt)) / 60000),
      sets: work.length,
      volume: work.reduce((a, d) => a + d.weight_kg * d.reps, 0),
    };
    setS(null);
    await data.refresh();
    return summary;
  }, [s, data]);

  const value = useMemo(() => {
    const base = { start, startRoutine, startEmpty, addExercise, cancel: () => setS(null) };
    if (!s) return { active: false, ...base };
    const restLeft = s.restUntil ? Math.max(0, Math.ceil((s.restUntil - now) / 1000)) : 0;
    const ex = s.exercises[s.current];
    const activeSet = ex ? ex.sets.findIndex((x) => !x.done) : -1;
    let volume = 0, done = 0, total = 0;
    for (const e of s.exercises) for (const x of e.sets) {
      if (x.type === 'warmup') continue;
      total += 1;
      if (x.done) { done += 1; volume += num(x.kg) * num(x.reps); }
    }
    const next = s.exercises.find((e, i) => i > s.current && e.sets.some((x) => !x.done))
      || s.exercises.find((e, i) => i !== s.current && e.sets.some((x) => !x.done)) || null;

    return {
      active: true,
      ...base,
      ...s,
      elapsed: Math.floor((now - Date.parse(s.startedAt)) / 1000),
      resting: restLeft > 0,
      restLeft,
      exercise: ex,
      activeSet,
      next,
      volume,
      done,
      total,
      finish,
      rename: (title) => update((c) => ({ ...c, title })),
      setCurrent: (i) => update((c) => ({ ...c, current: i })),
      setSet: (ei, si, patch) => mapEx(ei, (e) => ({ ...e, sets: applyWarmups(e.sets.map((x, j) => (j === si ? { ...x, ...patch, auto: 'kg' in patch ? false : x.auto } : x))) })),
      addWarmups: (ei) => mapEx(ei, (e) => ({ ...e, sets: withAutoWarmups(e.sets) })),
      cycleType: (ei, si) => mapEx(ei, (e) => ({
        ...e,
        sets: e.sets.map((x, j) => (j === si ? { ...x, type: SET_TYPES[(SET_TYPES.indexOf(x.type || 'normal') + 1) % SET_TYPES.length] } : x)),
      })),
      // Empty fields take the values shown in grey (last time), as in Hevy. Returns false if reps are still missing.
      validate: (ei, si) => {
        const target = s.exercises[ei]?.sets[si];
        if (!target) return false;
        const filled = fillFromPrev(s.exercises[ei], si);
        if (!(num(filled.reps) > 0)) return false;
        // New personal best (estimated 1RM) on a working set, compared with history and this session.
        let record = null;
        const kgV = num(filled.kg), repsV = num(filled.reps);
        if ((filled.type || 'normal') !== 'warmup' && kgV > 0) {
          const est = kgV * (1 + repsV / 30);
          const best = data.exercises.get(s.exercises[ei].name)?.best;
          const today = Math.max(0, ...s.exercises[ei].sets.filter((x) => x.done && x.type !== 'warmup').map((x) => num(x.kg) * (1 + num(x.reps) / 30)));
          if (best && est > best.e1rm && est > today) record = { kg: kgV, reps: repsV, name: s.exercises[ei].name };
        }
        unlockAudio();
        update((c) => {
          const exercises = c.exercises.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((x, j) => (j === si ? { ...fillFromPrev(e, j), done: true } : x)) }));
          const e = exercises[ei];
          const open = (x) => x.sets.some((y) => !y.done);
          let current = ei;
          let rest = e.rest ?? 0;
          if (e.superset) {
            // Superset: go straight to the next exercise of the group, rest after the last one.
            const members = exercises.map((x, i) => ({ x, i })).filter((m) => m.x.superset === e.superset);
            const pos = members.findIndex((m) => m.i === ei);
            const after = members.slice(pos + 1).find((m) => open(m.x));
            if (after) return { ...c, exercises, current: after.i, restUntil: null };
            const first = members.find((m) => open(m.x));
            rest = Math.max(...members.map((m) => m.x.rest ?? 0));
            if (first) current = first.i;
            else {
              const nx = exercises.findIndex((x, i) => i > members[members.length - 1].i && open(x));
              if (nx >= 0) current = nx;
            }
          } else if (!open(e)) {
            const nx = exercises.findIndex((x, i) => i > ei && open(x));
            if (nx >= 0) current = nx;
          }
          return {
            ...c,
            exercises,
            current,
            restUntil: rest > 0 ? Date.now() + rest * 1000 : null,
            restTotal: rest,
          };
        });
        return record ? { record } : true;
      },
      unvalidate: (ei, si) => mapEx(ei, (e) => ({ ...e, sets: e.sets.map((x, j) => (j === si ? { ...x, done: false } : x)) })),
      addSet: (ei) => mapEx(ei, (e) => {
        const last = e.sets.filter((x) => x.type !== 'warmup').pop() || e.sets[e.sets.length - 1] || { kg: '', reps: '' };
        return { ...e, sets: [...e.sets, { kg: last.kg, reps: last.reps, type: 'normal', done: false }] };
      }),
      removeLastSet: (ei) => mapEx(ei, (e) => ({ ...e, sets: e.sets.slice(0, -1) })),
      toggleSuperset: (ei) => update((c) => ({ ...c, exercises: toggleSS(c.exercises, ei) })),
      removeExercise: (ei) => update((c) => {
        const exercises = cleanSupersets(c.exercises.filter((_, i) => i !== ei));
        return { ...c, exercises, current: Math.min(c.current, Math.max(0, exercises.length - 1)) };
      }),
      moveExercise: (ei, d) => update((c) => {
        const j = ei + d;
        if (j < 0 || j >= c.exercises.length) return c;
        let exercises = [...c.exercises];
        [exercises[ei], exercises[j]] = [exercises[j], exercises[ei]];
        exercises = splitBrokenSupersets(exercises);
        return { ...c, exercises, current: c.current === ei ? j : c.current === j ? ei : c.current };
      }),
      setRest: (ei, sec) => {
        const name = s.exercises[ei]?.name;
        if (name) writeJson(REST_KEY, { ...(readJson(REST_KEY) || {}), [name]: sec });
        mapEx(ei, (e) => ({ ...e, rest: sec }));
      },
      shiftRest: (d) => update((c) => ({
        ...c,
        restUntil: Math.max(Date.now(), (c.restUntil || Date.now()) + d * 1000),
        restTotal: Math.max(c.restTotal, Math.ceil(((c.restUntil || Date.now()) + d * 1000 - Date.now()) / 1000)),
      })),
      skipRest: () => update((c) => ({ ...c, restUntil: null })),
    };
  }, [s, now, start, startRoutine, startEmpty, addExercise, finish, update]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

export const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
