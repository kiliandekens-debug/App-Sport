import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, fetchAll } from './supabase.js';
import { analyse } from './lib/stats.js';
import { isNative, healthRuns, healthLinked, runIntervals } from './native.js';
import { buildPlan, runVerdict, ymd } from './lib/running.js';

const DataCtx = createContext(null);

export function DataProvider({ children }) {
  const [raw, setRaw] = useState({ workouts: [], custom: [], plans: [], routines: [], runProfile: null, runLogs: [], superadmin: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [workouts, sets, custom, plans, routines, runLogs, runProfileRes, adminRes] = await Promise.all([
        fetchAll('workouts', 'id,title,started_at,ended_at', 'started_at'),
        fetchAll('sets', 'workout_id,exercise,position,set_index,set_type,weight_kg,reps,duration_seconds,distance_km,superset_id', 'id'),
        fetchAll('custom_exercises', '*', 'created_at'),
        fetchAll('coach_plans', '*', 'created_at'),
        fetchAll('routines', '*', 'position'),
        fetchAll('run_logs', '*', 'done_at'),
        supabase.from('run_profile').select('*').maybeSingle(),
        supabase.rpc('is_superadmin'),
      ]);
      const byId = new Map(workouts.map((w) => [w.id, { ...w, sets: [] }]));
      for (const s of sets) byId.get(s.workout_id)?.sets.push({ ...s, weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) });
      for (const w of byId.values()) w.sets.sort((a, b) => a.position - b.position || a.set_index - b.set_index);
      setRaw({ workouts: [...byId.values()], custom, plans, routines, runLogs, runProfile: runProfileRes.data || null, superadmin: adminRes.data === true });
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // iPhone app linked to Apple Health: new runs come in by themselves at each launch.
  const [healthDone, setHealthDone] = useState(false);
  useEffect(() => {
    if (loading || healthDone || !isNative() || !healthLinked()) return;
    setHealthDone(true);
    healthRuns(30)
      .then((runs) => importRuns(runs, raw.runLogs))
      .then((res) => { if (res.added) refresh(); })
      .catch(() => { /* access withdrawn or offline: the manual import still works */ });
  }, [loading, healthDone, raw.runLogs, refresh]);

  const value = useMemo(() => {
    const data = analyse(raw.workouts);
    const plans = new Map(raw.plans.map((p) => [p.exercise, p]));
    return { ...data, custom: raw.custom, routines: raw.routines, runProfile: raw.runProfile, runLogs: raw.runLogs, superadmin: raw.superadmin, plans, loading, error, refresh };
  }, [raw, loading, error, refresh]);

  // Runs imported from Apple Health or Strava are linked to the planned session of the same
  // day; on the iPhone, the intervals recorded by the watch are compared with the plan.
  const linking = useRef(false);
  useEffect(() => {
    if (loading || linking.current || !raw.runProfile || !raw.runLogs.length) return;
    linking.current = true;
    linkRuns(raw.runProfile, raw.runLogs, value.workouts)
      .then((changed) => { if (changed) refresh(); })
      .catch(() => { /* offline: next time */ })
      .finally(() => { linking.current = false; });
  }, [loading, raw.runProfile, raw.runLogs, value.workouts, refresh]);

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

// Last 3 weeks: links each run without a planned session to the one of the same day, and
// (iPhone app) adds the watch's intervals and the verdict against the plan. True if changed.
async function linkRuns(profile, logs, workouts) {
  const sessions = buildPlan(profile, logs, workouts).weeks.flat();
  const since = Date.now() - 21 * 86400000;
  const taken = new Set(logs.map((l) => l.session_key).filter(Boolean));
  let changed = false;
  for (const l of logs) {
    const at = new Date(l.done_at);
    if (at.getTime() < since) continue;
    let s = l.session_key ? sessions.find((x) => x.key === l.session_key) : null;
    const patch = {};
    if (!l.session_key) {
      s = sessions.find((x) => x.ymd === ymd(at) && !taken.has(x.key));
      if (s) { patch.session_key = s.key; patch.kind = s.kind; taken.add(s.key); }
    }
    if (s && !l.splits && l.source === 'apple-health' && isNative()) {
      const end = new Date(at.getTime() + (l.duration_s || 0) * 1000);
      const iv = await runIntervals(new Date(at.getTime() - 60000), new Date(end.getTime() + 60000));
      if (iv.length) patch.splits = runVerdict(s, iv);
    }
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('run_logs').update(patch).eq('id', l.id);
      if (!error) changed = true;
    }
  }
  return changed;
}

// App Store requirement: wipes every row of the signed-in user, then the login itself
// (kept only when another project in the same database still uses it).
export async function deleteAccount() {
  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  return data;
}

// Superadmin only (checked again in the database).
export async function adminUsers() {
  const { data, error } = await supabase.rpc('admin_users');
  if (error) throw error;
  return data || [];
}
export async function adminSetRole(target, role) {
  const { error } = await supabase.rpc('admin_set_role', { target, new_role: role });
  if (error) throw error;
}
