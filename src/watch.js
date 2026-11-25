// Apple Watch companion (iPhone app only). The phone stays the reference: it sends the
// current session to the watch after every change, and applies what was done on the watch
// (sets validated, rest changed, session started or finished). The watch works on its own
// copy in the meantime, so it keeps going even while the iPhone is locked in a pocket.
import { createElement, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative, WatchBridge as Watch } from './native.js';
import { useSession, num, prevOf } from './session.jsx';
import { useData } from './data.jsx';
import { nextSession } from './lib/routines.js';
import { incrementOf, muscleOf } from './lib/exercises.js';
import { supabase, supabaseUrl, supabaseKey } from './supabase.js';
import { fmtKg } from './lib/stats.js';
import { watchWorkout, guidedRun, buildPlan, runVerdict, ymd } from './lib/running.js';
import { saveRunLog } from './data.jsx';
import { TEMPLATES, templateSession, summaryOf } from './lib/treadmill.js';

const SEQ = 'app-sport-watch-seq';
const readSeq = () => { try { return Number(localStorage.getItem(SEQ)) || 0; } catch { return 0; } };
const writeSeq = (v) => { try { localStorage.setItem(SEQ, String(v)); } catch { /* private mode */ } };

// What the watch needs, with the values shown in grey (last time) already filled in.
// No clock-dependent field: the watch computes elapsed time and rest left itself.
// Up to 5 other exercises for the same muscle, most recently done first, with their last
// load: what the watch offers when a machine is taken.
function alternativesOf(data, name) {
  const muscle = muscleOf(name);
  if (muscle === 'Autre') return [];
  return [...data.exercises.values()]
    .filter((x) => x.name !== name && x.muscle === muscle && x.history.length)
    .sort((a, b) => new Date(b.history[b.history.length - 1].date) - new Date(a.history[a.history.length - 1].date))
    .slice(0, 5)
    .map((x) => {
      const h = x.history[x.history.length - 1];
      const top = (h.sets || []).find((y) => y.weight_kg === h.maxKg);
      return { name: x.name, kg: Number(h.maxKg) || 0, reps: Number(top?.reps ?? h.maxReps) || 0, step: incrementOf(x.name) };
    });
}

// The next sessions of the running plan (today first), for Kadence's running screen on the watch.
export function watchRuns(data) {
  if (!data?.runProfile) return [];
  const today = ymd(new Date());
  return buildPlan(data.runProfile, data.runLogs, data.workouts).weeks.flat()
    .filter((x) => !x.done && !x.off && x.ymd >= today).slice(0, 7).map(guidedRun);
}

// Guided tapis sessions (12-3-30…), at the level reached, for the watch's Tapis card.
export function watchWalks(data) {
  return TEMPLATES.map((t) => {
    const x = templateSession(t, data.walkLogs || []);
    return { key: x.key, ymd: '', title: x.title, mins: x.mins, km: x.km, kind: 'tapis', activity: x.activity, steps: x.steps };
  });
}

// A run recorded by Kadence on the watch: saved as a run log, linked to its session of the
// plan, with the verdict against the plan from the watch's own splits (one per step).
async function saveWatchRun(a, data) {
  if (!(a.meters > 50) || !(a.secs > 30)) return;
  const done = new Date(a.start);
  if (data.allLogs.some((l) => Math.abs(new Date(l.done_at).getTime() - done.getTime()) < 3 * 60000)) return;
  if (a.activity && a.activity !== 'run') {
    // Tapis or incline walk: speed, incline and paliers set on the watch; D+ from them.
    const segs = Array.isArray(a.segments) ? a.segments.filter((x) => x.secs > 0).map((x) => ({ secs: Math.round(x.secs), speed: Number(x.speed) || 0, incline: Number(x.incline) || 0 })) : [];
    const sum = segs.length ? summaryOf(segs, a.weight || 75) : null;
    const tpl = a.key && String(a.key).startsWith('tpl:') ? TEMPLATES.find((t) => `tpl:${t.id}` === a.key) : null;
    await saveRunLog({
      done_at: done.toISOString(), activity: a.activity, session_key: tpl ? a.key : null, notes: tpl?.title || null,
      distance_km: Math.round(a.meters / 10) / 100, duration_s: Math.round(a.secs),
      speed_kmh: Math.round(((a.meters / a.secs) * 3.6) * 10) / 10, incline_pct: a.activity === 'walk' ? null : sum?.incline_pct ?? null,
      // Outdoor walk: no D+.
      elevation_m: a.activity === 'walk' ? null : a.elevation > 0 ? Math.round(a.elevation) : sum?.elevation_m ?? null,
      avg_hr: a.hr > 0 ? Math.round(a.hr) : null, calories: a.kcal > 0 ? Math.round(a.kcal) : sum?.calories ?? null,
      source: 'watch', segments: segs.length > 1 ? segs : null,
    });
    await data.refresh();
    return;
  }
  const plan = data.runProfile ? buildPlan(data.runProfile, data.runLogs, data.workouts).weeks.flat() : [];
  const session = a.key ? plan.find((x) => x.key === a.key) : null;
  const splits = session && Array.isArray(a.splits) && a.splits.length ? runVerdict(session, a.splits) : null;
  await saveRunLog({
    done_at: done.toISOString(), session_key: session?.key || null, kind: session?.kind || null,
    distance_km: Math.round(a.meters / 10) / 100, duration_s: Math.round(a.secs),
    avg_hr: a.hr > 0 ? Math.round(a.hr) : null, calories: a.kcal > 0 ? Math.round(a.kcal) : null,
    source: 'watch', splits,
  });
  await data.refresh();
}

export function watchState(s, suggestion, ack, data) {
  const runs = data ? watchRuns(data) : [];
  const walks = data ? watchWalks(data) : [];
  if (!s?.active) return { v: 1, ack, active: false, suggestion: suggestion || null, session: null, runs, walks };
  return {
    v: 1,
    ack,
    runs,
    walks,
    active: true,
    suggestion: null,
    session: {
      title: s.title,
      startedAt: Date.parse(s.startedAt),
      current: s.current,
      restUntil: s.restUntil || 0,
      restTotal: s.restTotal || 0,
      exercises: s.exercises.map((e) => ({
        name: e.name,
        rest: e.rest ?? 0,
        superset: e.superset || '',
        step: incrementOf(e.name),
        coach: e.plan ? `${fmtKg(e.plan.kg)} × ${e.plan.reps}` : '',
        alts: data ? alternativesOf(data, e.name) : [],
        sets: e.sets.map((x, j) => {
          const p = prevOf(e, j);
          return {
            kg: x.kg !== '' ? num(x.kg) : p ? Number(p.kg) || 0 : 0,
            reps: x.reps !== '' ? Math.round(num(x.reps)) : p ? Number(p.reps) || 0 : 0,
            warm: x.type === 'warmup',
            type: x.type || 'normal',
            done: Boolean(x.done),
            prev: p ? `${fmtKg(p.kg)} × ${p.reps}` : '',
          };
        }),
      })),
    },
  };
}

// Live Activity (Dynamic Island, lock screen): the next set, the rest timer, and the set
// that would beat the personal best (estimated 1RM, as in validate()): the set as planned,
// or with one more rep.
export function liveState(s, data) {
  if (!s?.active) return null;
  const base = {
    title: s.title,
    done: s.done,
    total: s.total,
    restStart: s.restUntil ? s.restUntil - (s.restTotal || 0) * 1000 : 0,
    restEnd: s.restUntil || 0,
  };
  const e = s.exercise;
  const i = s.activeSet;
  if (!e || i < 0) {
    const n = s.next;
    return { ...base, exercise: n ? n.name : s.title, setLabel: n ? 'Exercice suivant' : 'Tout est fait', next: '', record: '', ex: -1, name: '', set: -1, kg: 0, reps: 0, rest: 0 };
  }
  const x = e.sets[i];
  const p = prevOf(e, i);
  const kg = x.kg !== '' ? num(x.kg) : p ? Number(p.kg) || 0 : 0;
  const reps = x.reps !== '' ? Math.round(num(x.reps)) : p ? Number(p.reps) || 0 : 0;
  const warm = x.type === 'warmup';
  const same = (y) => (y.type === 'warmup') === warm;
  const rank = e.sets.slice(0, i + 1).filter(same).length;
  const of = e.sets.filter(same).length;
  let record = '';
  const best = data.exercises.get(e.name)?.best;
  if (!warm && kg > 0 && reps > 0 && best?.e1rm) {
    const today = Math.max(0, ...e.sets.filter((y) => y.done && y.type !== 'warmup').map((y) => num(y.kg) * (1 + num(y.reps) / 30)));
    const beats = (r) => kg * (1 + r / 30) > Math.max(best.e1rm, today);
    if (beats(reps)) record = `${fmtKg(kg)} × ${reps}`;
    else if (beats(reps + 1)) record = `${fmtKg(kg)} × ${reps + 1}`;
  }
  return {
    ...base,
    exercise: e.name,
    setLabel: `${warm ? 'Échauffement' : 'Série'} ${rank}/${of}`,
    next: kg > 0 ? `${fmtKg(kg)} × ${reps}` : `× ${reps}`,
    record,
    ex: s.current,
    name: e.name,
    set: i,
    kg,
    reps,
    rest: e.rest ?? 0,
  };
}

function WatchSyncInner() {
  const s = useSession();
  const data = useData();
  const nav = useNavigate();
  const sRef = useRef(s);
  sRef.current = s;
  const dataRef = useRef(data);
  dataRef.current = data;
  const ack = useRef(readSeq());
  const startedByWatch = useRef(false);
  const busy = useRef(false);
  const [, bump] = useState(0);

  // Phone → watch: the whole session after each change (deduplicated on the JSON).
  const { next } = nextSession(data);
  const json = JSON.stringify(watchState(s, next?.name, ack.current, data));
  useEffect(() => { Watch.update({ state: json }).catch(() => {}); }, [json]);

  // Live Activity: started with the session, updated after each change (typing settles first), ended with it.
  const live = JSON.stringify(liveState(s, data));
  useEffect(() => {
    const t = setTimeout(() => { Watch.live({ state: live }).catch(() => {}); }, live === 'null' ? 0 : 300);
    return () => clearTimeout(t);
  }, [live]);

  // Login handed to the native side, so that a session finished on the watch while the
  // iPhone is locked can be saved right away (only while the access token is still valid).
  useEffect(() => {
    const send = (sess) => Watch.setAuth({
      url: supabaseUrl, key: supabaseKey,
      access: sess?.access_token || '', expiresAt: sess?.expires_at ? sess.expires_at * 1000 : 0,
    }).catch(() => {});
    supabase.auth.getSession().then(({ data: d }) => send(d.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => send(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  // A session started on the iPhone opens the watch app and starts the workout there
  // (heart rate, calories, activity rings). Started from the watch: it already runs.
  const wasActive = useRef(s.active);
  useEffect(() => {
    if (s.active && !wasActive.current && !startedByWatch.current) Watch.startWorkout().catch(() => {});
    if (!s.active) startedByWatch.current = false;
    wasActive.current = s.active;
  }, [s.active]);

  // Watch → phone: actions queued by the native side, applied in order, each only once.
  useEffect(() => {
    const tick = () => new Promise((r) => { setTimeout(r, 150); });
    const drain = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const { actions = [] } = await Watch.drain();
        for (const raw of actions) {
          let a;
          try { a = JSON.parse(raw); } catch { continue; }
          if (!a || !(a.seq > ack.current)) continue;
          const done = () => { ack.current = a.seq; writeSeq(a.seq); };
          const cur = sRef.current;
          // Acknowledged once applied: the watch keeps its own copy until then.
          if (a.type !== 'finish') done();
          if (a.type === 'start') {
            if (cur.active) continue;
            const n = nextSession(dataRef.current).next;
            if (!n) continue;
            startedByWatch.current = true;
            if (n.id) cur.startRoutine(n); else cur.start(n.name);
            nav('/seance');
            await tick();
          } else if (a.type === 'finish') {
            await tick();
            try {
              if (!sRef.current.active) continue;
              // Already saved by the native side (iPhone locked): just close the session here.
              const summary = await sRef.current.finish({ save: !a.saved });
              if (summary) nav('/coach', { state: { summary } });
            } finally {
              done();
            }
          } else if (a.type === 'run') {
            try { await saveWatchRun(a, dataRef.current); } catch { /* offline: the run is in Apple Health and comes back with the next import */ }
          } else if (cur.active) {
            cur.fromWatch(a);
          }
        }
        // Re-send the state even when nothing changed, so the watch sees its actions acknowledged.
        if (actions.length) bump((x) => x + 1);
      } catch { /* not in the iPhone app, or saving failed: kept for the next try */ } finally {
        busy.current = false;
      }
    };
    drain();
    const subs = [Watch.addListener('action', drain)];
    import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', (st) => { if (st.isActive) drain(); })).then((h) => subs.push(h)).catch(() => {});
    return () => { subs.forEach((h) => Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {})); };
  }, [nav]);

  return null;
}

// A running session of the plan, sent to Apple's Workout app on the watch (iPhone app only).
export async function sendRunToWatch(session) {
  await Watch.scheduleRun({ workout: JSON.stringify(watchWorkout(session)) });
}

// Profil › Tester la Dynamic Island: a 30 s demo rest, then what the iPhone says about it.
export async function testLive(stillIdle) {
  const now = Date.now();
  const demo = {
    title: 'Test', exercise: 'Développé couché', setLabel: 'Série 2/4', next: '80 × 8', record: '80 × 9',
    restStart: now, restEnd: now + 30000, done: 1, total: 4, ex: -1, name: '', set: -1, kg: 80, reps: 8, rest: 90,
  };
  try {
    await Watch.live({ state: JSON.stringify(demo) });
  } catch (e) {
    return `Le module natif ne répond pas : ${e.message || e}`;
  }
  await new Promise((r) => { setTimeout(r, 1500); });
  const info = await Watch.liveInfo();
  setTimeout(() => { if (stillIdle()) Watch.live({ state: 'null' }).catch(() => {}); }, 35000);
  if (info.error) return info.error;
  if (info.running) return 'Activité démarrée : va sur l\'écran d\'accueil ou verrouille l\'iPhone pour voir la mèche (30 s).';
  return `Aucune activité démarrée (Activités en direct ${info.enabled ? 'activées' : 'désactivées'}).`;
}

export function WatchSync() {
  return isNative() ? createElement(WatchSyncInner) : null;
}
