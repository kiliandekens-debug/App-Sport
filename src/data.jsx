import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, fetchAll } from './supabase.js';
import { analyse } from './lib/stats.js';

const DataCtx = createContext(null);

export function DataProvider({ children }) {
  const [raw, setRaw] = useState({ workouts: [], custom: [], plans: [], routines: [], runProfile: null, runLogs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [workouts, sets, custom, plans, routines, runLogs, runProfileRes] = await Promise.all([
        fetchAll('workouts', 'id,title,started_at,ended_at', 'started_at'),
        fetchAll('sets', 'workout_id,exercise,position,set_index,set_type,weight_kg,reps,duration_seconds,distance_km,superset_id', 'id'),
        fetchAll('custom_exercises', '*', 'created_at'),
        fetchAll('coach_plans', '*', 'created_at'),
        fetchAll('routines', '*', 'position'),
        fetchAll('run_logs', '*', 'done_at'),
        supabase.from('run_profile').select('*').maybeSingle(),
      ]);
      const byId = new Map(workouts.map((w) => [w.id, { ...w, sets: [] }]));
      for (const s of sets) byId.get(s.workout_id)?.sets.push({ ...s, weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) });
      for (const w of byId.values()) w.sets.sort((a, b) => a.position - b.position || a.set_index - b.set_index);
      setRaw({ workouts: [...byId.values()], custom, plans, routines, runLogs, runProfile: runProfileRes.data || null });
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => {
    const data = analyse(raw.workouts);
    const plans = new Map(raw.plans.map((p) => [p.exercise, p]));
    return { ...data, custom: raw.custom, routines: raw.routines, runProfile: raw.runProfile, runLogs: raw.runLogs, plans, loading, error, refresh };
  }, [raw, loading, error, refresh]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);

// Inserts sessions that are not in the database yet (matched on start time).
export async function importWorkouts(parsed, existing, onProgress) {
  const known = new Set(existing.map((w) => new Date(w.started_at).getTime()));
  const todo = parsed.filter((w) => !known.has(new Date(w.started_at).getTime()));
  let done = 0;
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const { data: rows, error } = await supabase
      .from('workouts')
      .insert(chunk.map(({ title, started_at, ended_at }) => ({ title, started_at, ended_at, source: 'import' })))
      .select('id,started_at');
    if (error) throw error;
    const idOf = new Map(rows.map((r) => [new Date(r.started_at).getTime(), r.id]));
    const sets = chunk.flatMap((w) => w.sets.map((s) => ({ ...s, workout_id: idOf.get(new Date(w.started_at).getTime()) })));
    for (let j = 0; j < sets.length; j += 500) {
      const { error: e2 } = await supabase.from('sets').insert(sets.slice(j, j + 500));
      if (e2) throw e2;
    }
    done += chunk.length;
    onProgress?.(done, todo.length);
  }
  return { added: todo.length, skipped: parsed.length - todo.length };
}

// Routine exercises: [{ name, rest, superset, sets: [{ type, kg, reps }] }]
export async function saveRoutine(routine) {
  const row = { name: routine.name, exercises: routine.exercises, updated_at: new Date().toISOString() };
  if (routine.id) {
    const { error } = await supabase.from('routines').update(row).eq('id', routine.id);
    if (error) throw error;
    return routine.id;
  }
  const { data, error } = await supabase.from('routines').insert({ ...row, position: routine.position ?? 0 }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteRoutine(id) {
  const { error } = await supabase.from('routines').delete().eq('id', id);
  if (error) throw error;
}

export async function savePlan(exercise, plan) {
  const { error } = await supabase.from('coach_plans').upsert({ exercise, ...plan }, { onConflict: 'user_id,exercise' });
  if (error) throw error;
}

export async function saveRunProfile(profile) {
  const { error } = await supabase.from('run_profile').upsert({ ...profile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function saveRunLog(log) {
  const { error } = await supabase.from('run_logs').insert(log);
  if (error) throw error;
}

export async function deleteRunLog(id) {
  const { error } = await supabase.from('run_logs').delete().eq('id', id);
  if (error) throw error;
}

// Deleting a workout also deletes its sets (foreign key on delete cascade).
export async function deleteWorkout(id) {
  const { error } = await supabase.from('workouts').delete().eq('id', id);
  if (error) throw error;
}

export async function renameWorkout(id, title) {
  const { error } = await supabase.from('workouts').update({ title }).eq('id', id);
  if (error) throw error;
}

// All gym sets as a CSV in Hevy's column layout, so the file can be re-imported here or elsewhere.
export function exportCsv(workouts) {
  const q = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
  const iso = (d) => (d ? new Date(d).toISOString() : '');
  const rows = [['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes', 'set_index', 'set_type', 'weight_kg', 'reps', 'distance_km', 'duration_seconds', 'rpe'].join(',')];
  for (const w of [...workouts].sort((a, b) => a.start - b.start)) {
    for (const s of w.sets) rows.push([q(w.title), q(iso(w.started_at)), q(iso(w.ended_at)), '""', q(s.exercise), s.superset_id ?? '', '""', s.set_index, q(s.set_type), s.weight_kg ?? '', s.reps ?? '', s.distance_km ?? '', s.duration_seconds ?? '', ''].join(','));
  }
  return rows.join('\n');
}

// Stops the running plan. Logged runs are kept (history, stats).
export async function deleteRunProfile() {
  const { error } = await supabase.from('run_profile').delete().not('user_id', 'is', null);
  if (error) throw error;
}

// Adds runs from Strava, skipping those already logged (same start within 3 minutes).
export async function importRuns(runs, existing) {
  const known = existing.map((l) => new Date(l.done_at).getTime());
  const todo = runs.filter((r) => !known.some((t) => Math.abs(t - new Date(r.done_at).getTime()) < 3 * 60000));
  for (let i = 0; i < todo.length; i += 200) {
    const { error } = await supabase.from('run_logs').insert(todo.slice(i, i + 200));
    if (error) throw error;
  }
  return { added: todo.length, skipped: runs.length - todo.length };
}
