// Apple Watch companion (iPhone app only). The phone stays the reference: it sends the
// current session to the watch after every change, and applies what was done on the watch
// (sets validated, rest changed, session started or finished). The watch works on its own
// copy in the meantime, so it keeps going even while the iPhone is locked in a pocket.
import { createElement, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerPlugin } from '@capacitor/core';
import { isNative } from './native.js';
import { useSession, num, prevOf } from './session.jsx';
import { useData } from './data.jsx';
import { nextSession } from './lib/routines.js';
import { incrementOf } from './lib/exercises.js';
import { fmtKg } from './lib/stats.js';

const Watch = registerPlugin('WatchBridge');
const SEQ = 'app-sport-watch-seq';
const readSeq = () => { try { return Number(localStorage.getItem(SEQ)) || 0; } catch { return 0; } };
const writeSeq = (v) => { try { localStorage.setItem(SEQ, String(v)); } catch { /* private mode */ } };

// What the watch needs, with the values shown in grey (last time) already filled in.
// No clock-dependent field: the watch computes elapsed time and rest left itself.
export function watchState(s, suggestion, ack) {
  if (!s?.active) return { v: 1, ack, active: false, suggestion: suggestion || null, session: null };
  return {
    v: 1,
    ack,
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
        sets: e.sets.map((x, j) => {
          const p = prevOf(e, j);
          return {
            kg: x.kg !== '' ? num(x.kg) : p ? Number(p.kg) || 0 : 0,
            reps: x.reps !== '' ? Math.round(num(x.reps)) : p ? Number(p.reps) || 0 : 0,
            warm: x.type === 'warmup',
            done: Boolean(x.done),
            prev: p ? `${fmtKg(p.kg)} × ${p.reps}` : '',
          };
        }),
      })),
    },
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
  const json = JSON.stringify(watchState(s, next?.name, ack.current));
  useEffect(() => { Watch.update({ state: json }).catch(() => {}); }, [json]);

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
              const summary = await sRef.current.finish();
              if (summary) nav('/coach', { state: { summary } });
            } finally {
              done();
            }
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

export function WatchSync() {
  return isNative() ? createElement(WatchSyncInner) : null;
}
