import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { useData } from './data.jsx';
import { templateFor, lastSetsOf, isWork } from './lib/stats.js';

const KEY = 'app-sport-session';
const SessionCtx = createContext(null);

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
const persist = (s) => {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* private mode */ }
};

export const num = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;

function buildExercise(data, name, templateSets) {
  const prev = lastSetsOf(data, name).filter(isWork).map((s) => ({ kg: s.weight_kg, reps: s.reps }));
  const plan = data.plans.get(name);
  const count = Math.max(1, (templateSets || []).filter((s) => s.set_type !== 'warmup').length || prev.length || 3);
  const sets = Array.from({ length: count }, (_, i) => {
    const p = prev[i] || prev[prev.length - 1];
    const kg = plan?.target_kg ?? p?.kg ?? '';
    const reps = plan?.target_reps ?? p?.reps ?? '';
    return { kg: String(kg), reps: String(reps), done: false };
  });
  return { name, prev, plan: plan ? { kg: Number(plan.target_kg), reps: plan.target_reps, reason: plan.reason } : null, sets };
}

export function SessionProvider({ children }) {
  const data = useData();
  const [s, setS] = useState(load);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { persist(s); }, [s]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const update = useCallback((fn) => setS((cur) => (cur ? fn(cur) : cur)), []);

  const start = useCallback((title) => {
    const tpl = templateFor(data, title);
    setS({
      title,
      startedAt: new Date().toISOString(),
      exercises: tpl.map((t) => buildExercise(data, t.name, t.sets)),
      current: 0,
      restUntil: null,
      restTotal: 120,
    });
  }, [data]);

  const addExercise = useCallback((name) => {
    setS((cur) => {
      const base = cur || { title: 'Séance libre', startedAt: new Date().toISOString(), exercises: [], current: 0, restUntil: null, restTotal: 120 };
      if (base.exercises.some((e) => e.name === name)) return base;
      const exercises = [...base.exercises, buildExercise(data, name)];
      return { ...base, exercises, current: exercises.length - 1 };
    });
  }, [data]);

  const setSet = (ei, si, patch) => update((c) => ({
    ...c,
    exercises: c.exercises.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((x, j) => (j === si ? { ...x, ...patch } : x)) })),
  }));

  const validate = (ei, si) => update((c) => {
    const exercises = c.exercises.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((x, j) => (j === si ? { ...x, done: true } : x)) }));
    const ex = exercises[ei];
    const allDone = ex.sets.every((x) => x.done);
    const nextEx = allDone ? exercises.findIndex((e, i) => i > ei && e.sets.some((x) => !x.done)) : -1;
    return { ...c, exercises, current: allDone && nextEx >= 0 ? nextEx : c.current, restUntil: Date.now() + c.restTotal * 1000 };
  });

  const finish = useCallback(async () => {
    const c = s;
    if (!c) return null;
    const done = c.exercises.flatMap((e, position) =>
      e.sets.filter((x) => x.done).map((x, set_index) => ({ exercise: e.name, position, set_index, set_type: 'normal', weight_kg: num(x.kg), reps: Math.round(num(x.reps)) })));
    const ended = new Date().toISOString();
    if (done.length) {
      const { data: w, error } = await supabase.from('workouts').insert({ title: c.title, started_at: c.startedAt, ended_at: ended, source: 'app' }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await supabase.from('sets').insert(done.map((d) => ({ ...d, workout_id: w.id })));
      if (e2) throw e2;
      const used = [...new Set(done.map((d) => d.exercise))];
      await supabase.from('coach_plans').delete().in('exercise', used);
    }
    const summary = {
      title: c.title,
      minutes: Math.round((Date.parse(ended) - Date.parse(c.startedAt)) / 60000),
      sets: done.length,
      volume: done.reduce((a, d) => a + d.weight_kg * d.reps, 0),
    };
    setS(null);
    await data.refresh();
    return summary;
  }, [s, data]);

  const value = useMemo(() => {
    if (!s) return { active: false, start, addExercise, cancel: () => setS(null) };
    const restLeft = s.restUntil ? Math.max(0, Math.round((s.restUntil - now) / 1000)) : 0;
    const ex = s.exercises[s.current];
    const activeSet = ex ? ex.sets.findIndex((x) => !x.done) : -1;
    let volume = 0, done = 0, total = 0;
    for (const e of s.exercises) for (const x of e.sets) { total += 1; if (x.done) { done += 1; volume += num(x.kg) * num(x.reps); } }
    const next = s.exercises.find((e, i) => i !== s.current && e.sets.some((x) => !x.done)) || null;
    return {
      active: true,
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
      start,
      addExercise,
      setCurrent: (i) => update((c) => ({ ...c, current: i })),
      setSet,
      validate,
      addSet: (ei) => update((c) => ({
        ...c,
        exercises: c.exercises.map((e, i) => (i !== ei ? e : { ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] || { kg: '', reps: '' }), done: false }] })),
      })),
      unvalidate: (ei, si) => setSet(ei, si, { done: false }),
      shiftRest: (d) => update((c) => ({ ...c, restUntil: Math.max(Date.now(), (c.restUntil || Date.now()) + d * 1000) })),
      skipRest: () => update((c) => ({ ...c, restUntil: null })),
      setRestTotal: (sec) => update((c) => ({ ...c, restTotal: sec })),
      finish,
      cancel: () => setS(null),
    };
  }, [s, now, start, addExercise, finish, update]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

export const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
