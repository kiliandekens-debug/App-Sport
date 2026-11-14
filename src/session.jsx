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
    return { kg: kg == null ? '' : String(kg), reps: reps == null ? '' : String(reps), type, done: false };
  });
  return {
    name,
    prev,
    rest: routineEx.rest ?? restFor(name),
    superset: routineEx.superset || null,
    plan: plan ? { kg: Number(plan.target_kg), reps: plan.target_reps, reason: plan.reason } : null,
    sets,
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

export function SessionProvider({ children }) {
  const data = useData();
  const [s, setS] = useState(() => readJson(KEY));
  const [now, setNow] = useState(Date.now());
  const wasResting = useRef(false);

  useEffect(() => { writeJson(KEY, s); }, [s]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

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
      if (e2) throw e2;
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
      setSet: (ei, si, patch) => mapEx(ei, (e) => ({ ...e, sets: e.sets.map((x, j) => (j === si ? { ...x, ...patch } : x)) })),
      cycleType: (ei, si) => mapEx(ei, (e) => ({
        ...e,
        sets: e.sets.map((x, j) => (j === si ? { ...x, type: SET_TYPES[(SET_TYPES.indexOf(x.type || 'normal') + 1) % SET_TYPES.length] } : x)),
      })),
      validate: (ei, si) => {
        unlockAudio();
        update((c) => {
          const exercises = c.exercises.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((x, j) => (j === si ? { ...x, done: true } : x)) }));
          const e = exercises[ei];
          const open = (x) => x.sets.some((y) => !y.done);
          let current = c.current;
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
        const exercises = [...c.exercises];
        [exercises[ei], exercises[j]] = [exercises[j], exercises[ei]];
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
