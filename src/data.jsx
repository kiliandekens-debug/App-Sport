import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, fetchAll } from './supabase.js';
import { analyse } from './lib/stats.js';

const DataCtx = createContext(null);

export function DataProvider({ children }) {
  const [raw, setRaw] = useState({ workouts: [], custom: [], plans: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [workouts, sets, custom, plans] = await Promise.all([
        fetchAll('workouts', 'id,title,started_at,ended_at', 'started_at'),
        fetchAll('sets', 'workout_id,exercise,position,set_index,set_type,weight_kg,reps,duration_seconds,distance_km', 'id'),
        fetchAll('custom_exercises', '*', 'created_at'),
        fetchAll('coach_plans', '*', 'created_at'),
      ]);
      const byId = new Map(workouts.map((w) => [w.id, { ...w, sets: [] }]));
      for (const s of sets) byId.get(s.workout_id)?.sets.push({ ...s, weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) });
      for (const w of byId.values()) w.sets.sort((a, b) => a.position - b.position || a.set_index - b.set_index);
      setRaw({ workouts: [...byId.values()], custom, plans });
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
    return { ...data, custom: raw.custom, plans, loading, error, refresh };
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

export async function savePlan(exercise, plan) {
  const { error } = await supabase.from('coach_plans').upsert({ exercise, ...plan }, { onConflict: 'user_id,exercise' });
  if (error) throw error;
}
