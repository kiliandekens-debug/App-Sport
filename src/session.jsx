import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { useData } from './data.jsx';
import { templateFor, lastSetsOf, isWork } from './lib/stats.js';

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

const COMPOUND = /développé|developpe|couché|rowing|tirage|traction|presse|squat|soulevé|dips|chest press|militaire/i;
export const defaultRest = (name) => (COMPOUND.test(name) ? 120 : 90);

function restFor(name) {
  const saved = readJson(REST_KEY) || {};
  return saved[name] ?? defaultRest(name);
}

function buildExercise(data, name, templateSets) {
  const prev = lastSetsOf(data, name).filter((s) => s.weight_kg != null).map((s) => ({ kg: s.weight_kg, reps: s.reps, type: s.set_type }));
  const prevWork = prev.filter((p) => p.type !== 'warmup');
  const plan = data.plans.get(name);
  const shape = (templateSets && templateSets.length ? templateSets.map((s) => s.set_type) : prev.map((p) => p.type));
  const types = shape.length ? shape : ['normal', 'normal', 'normal'];
  let w = 0;
  const sets = types.map((type, i) => {
    const p = type === 'warmup' ? prev.filter((x) => x.type === 'warmup')[i] : prevWork[w++] || prevWork[prevWork.length - 1];
    const usePlan = plan && type !== 'warmup';
    return {
      kg: String(usePlan ? plan.target_kg : p?.kg ?? ''),
      reps: String(usePlan ? plan.target_reps : p?.reps ?? ''),
      type: type || 'normal',
      done: false,
    };
  });
  return {
    name,
    prev,
    rest: restFor(name),
    plan: plan ? { kg: Number(plan.target_kg), reps: plan.target_reps, reason: plan.reason } : null,
    sets,
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
    begin(title, templateFor(data, title).map((t) => buildExercise(data, t.name, t.sets)));
  }, [data]);

  const startEmpty = useCallback(() => {
    const h = new Date().getHours();
    begin(h < 12 ? 'Entraînement du matin' : h < 18 ? "Entraînement d'après-midi" : 'Entraînement du soir', []);
  }, []);

  const addExercise = useCallback((name) => {
    setS((cur) => {
      const base = cur || { title: 'Séance libre', startedAt: new Date().toISOString(), exercises: [], current: 0, restUntil: null, restTotal: 0 };
      if (base.exercises.some((e) => e.name === name)) return { ...base, current: base.exercises.findIndex((e) => e.name === name) };
      const exercises = [...base.exercises, buildExercise(data, name)];
      return { ...base, exercises, current: exercises.length - 1 };
    });
  }, [data]);

  const finish = useCallback(async () => {
    const c = s;
    if (!c) return null;
    const done = c.exercises.flatMap((e, position) =>
      e.sets.filter((x) => x.done).map((x, set_index) => ({ exercise: e.name, position, set_index, set_type: x.type || 'normal', weight_kg: num(x.kg), reps: Math.round(num(x.reps)) })));
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
    const base = { start, startEmpty, addExercise, cancel: () => setS(null) };
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
          const allDone = e.sets.every((x) => x.done);
          const nextEx = allDone ? exercises.findIndex((x, i) => i > ei && x.sets.some((y) => !y.done)) : -1;
          const rest = e.rest ?? 0;
          return {
            ...c,
            exercises,
            current: allDone && nextEx >= 0 ? nextEx : c.current,
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
      removeExercise: (ei) => update((c) => {
        const exercises = c.exercises.filter((_, i) => i !== ei);
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
  }, [s, now, start, startEmpty, addExercise, finish, update]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

export const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
