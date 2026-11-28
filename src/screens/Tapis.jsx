import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, saveRunLog } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { Icon, GlassHeader } from '../components.jsx';
import { RunSheet } from '../day.jsx';
import { ShareSheet } from '../social.jsx';
import { hasFriends } from '../social.js';
import { fmtDay } from '../lib/stats.js';
import { hms, parseDuration } from '../lib/running.js';
import { isNative, nativeKeepAwake } from '../native.js';
import { ACTIVITIES, TEMPLATES, templateSession, summaryOf, caloriesOf, weekElevation, thisWeek, fmtSpeed, fmtIncline, logTitle, SPEED_MIN, SPEED_MAX, INCLINE_MAX } from '../lib/treadmill.js';

const num = (v) => Number(String(v ?? '').replace(',', '.'));
const n1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const n2 = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PHASE_TINT = { work: 'var(--brand)', recovery: 'var(--rest)', easy: 'var(--ok)' };
const FREE = {
  incline_walk: { speed: 5, incline: 8 },
  treadmill: { speed: 9, incline: 1 },
};
const toLocalInput = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Two short beeps and a vibration at each palier. Audio is unlocked by the "Démarrer" tap.
let audio = null;
const unlockAudio = () => {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { /* no audio */ }
};
function signal(times = 2) {
  try { navigator.vibrate?.(Array.from({ length: times * 2 - 1 }, (_, i) => (i % 2 ? 100 : 200))); } catch { /* not supported */ }
  if (!audio) return;
  for (let i = 0; i < times; i++) {
    const t = audio.currentTime + i * 0.25;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.2);
  }
}

// What to tell at a change of palier: « Monte à 10 % », « Accélère à 5,5 km/h »…
export function changeText(from, to) {
  const parts = [];
  if (from && to.incline !== from.incline) parts.push(`${to.incline > from.incline ? 'Monte' : 'Descends'} à ${fmtIncline(to.incline)}`);
  if (from && to.speed !== from.speed) parts.push(`${to.speed > from.speed ? 'Accélère' : 'Ralentis'} à ${fmtSpeed(to.speed)}`);
  if (!from) parts.push(`Règle le tapis : ${fmtSpeed(to.speed)}, ${fmtIncline(to.incline)}`);
  return parts.join(', ') || 'Garde le même réglage';
}

// Screen kept on while the timer runs.
function useKeepAwake(on) {
  useEffect(() => {
    if (!on) return undefined;
    if (isNative()) { nativeKeepAwake(true).catch(() => {}); return () => { nativeKeepAwake(false).catch(() => {}); }; }
    if (!('wakeLock' in navigator)) return undefined;
    let lock = null;
    let stopped = false;
    const get = async () => { try { lock = await navigator.wakeLock.request('screen'); if (stopped) lock.release(); } catch { /* refused */ } };
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    get();
    document.addEventListener('visibilitychange', onVis);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, [on]);
}

// A value with − and + buttons, like the tapis' own keys.
function Stepper({ label, value, onMinus, onPlus }) {
  return (
    <div className="card stack" style={{ gap: 6, alignItems: 'center', padding: 12 }}>
      <span className="xs muted" style={{ fontWeight: 600 }}>{label}</span>
      <b className="display" style={{ fontSize: 34, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</b>
      <div className="row" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label={`${label} moins`} onClick={onMinus} style={{ width: 48, height: 44 }}><Icon name="minus" /></button>
        <button className="icon-btn" aria-label={`${label} plus`} onClick={onPlus} style={{ width: 48, height: 44 }}><Icon name="plus" /></button>
      </div>
    </div>
  );
}

// Elapsed seconds of a run (pauses excluded).
const elapsedOf = (r, now) => (r.acc + (r.since ? now - r.since : 0)) / 1000;
// Closes the current palier at `at` seconds and returns the list of paliers.
const closeSegs = (r, at) => (at - r.cur.at >= 1 ? [...r.segs, { secs: Math.round(at - r.cur.at), speed: r.cur.speed, incline: r.cur.incline }] : r.segs);

// The phone timer: guided (steps of a template) or free (speed and incline set by hand).
function Player({ run: initial, weight, onEnd, onCancel }) {
  const ui = useUi();
  const [r, setR] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState(() => (initial.steps ? changeText(null, initial.steps[0]) : null));
  useKeepAwake(true);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  const t = elapsedOf(r, now);
  const steps = r.steps;
  const ends = useMemo(() => (steps ? steps.reduce((a, x) => [...a, (a[a.length - 1] || 0) + x.secs], []) : []), [steps]);
  const total = ends[ends.length - 1] || 0;
  const idx = steps ? Math.min(ends.findIndex((e) => t < e) === -1 ? steps.length - 1 : ends.findIndex((e) => t < e), steps.length - 1) : -1;

  // Guided: change of palier → new speed and incline, message, beeps. End → result form.
  const finished = useRef(false);
  useEffect(() => {
    if (!steps || finished.current) return;
    if (t >= total) { finish(); return; }
    if (idx > r.idx) {
      const s = steps[idx];
      setMsg(changeText(steps[r.idx], s));
      signal(idx === steps.length - 1 ? 3 : 2);
      setR((x) => {
        // Steps skipped while the phone was asleep are logged as planned.
        let segs = closeSegs(x, ends[x.idx]);
        for (let j = x.idx + 1; j < idx; j++) segs = [...segs, { secs: steps[j].secs, speed: steps[j].speed, incline: steps[j].incline }];
        return { ...x, idx, segs, cur: { at: ends[idx - 1], speed: s.speed, incline: s.incline } };
      });
    }
  });
  // 3-2-1 before a change.
  const left = steps ? Math.ceil(ends[idx] - t) : 0;
  const lastBeep = useRef(0);
  useEffect(() => {
    if (!steps || !r.since || left > 3 || left < 1 || lastBeep.current === `${idx}-${left}`) return;
    lastBeep.current = `${idx}-${left}`;
    signal(1);
  }, [left, idx, steps, r.since]);

  const segsNow = closeSegs(r, t);
  const sum = summaryOf(segsNow, weight);

  const adjust = (key, delta) => {
    setR((x) => {
      const at = elapsedOf(x, Date.now());
      const v = key === 'speed' ? clamp(Math.round((x.cur.speed + delta) * 10) / 10, SPEED_MIN, SPEED_MAX) : clamp(Math.round((x.cur.incline + delta) * 2) / 2, 0, INCLINE_MAX);
      if (v === x.cur[key]) return x;
      return { ...x, segs: closeSegs(x, at), cur: { ...x.cur, at, [key]: v } };
    });
  };
  const pause = () => setR((x) => (x.since ? { ...x, acc: x.acc + (Date.now() - x.since), since: 0 } : { ...x, since: Date.now() }));
  function finish() {
    if (finished.current) return;
    finished.current = true;
    const at = Math.min(elapsedOf(r, Date.now()), total || Infinity);
    onEnd({ ...r, segs: closeSegs(r, at), endedAt: Date.now() });
  }
  const stop = async () => {
    if (t < 30) { onCancel(); return; }
    const ok = await ui.confirm({ title: 'Terminer la séance ?', message: 'Tu pourras vérifier les chiffres avant de l\'enregistrer.', ok: 'Terminer' });
    if (ok) finish();
  };

  const s = steps ? steps[idx] : null;
  const nextS = steps ? steps[idx + 1] : null;
  const tint = s ? PHASE_TINT[s.phase] || 'var(--brand)' : 'var(--brand)';
  const stepPct = s ? Math.round(((t - (ends[idx - 1] || 0)) / s.secs) * 100) : 0;

  return (
    <div role="dialog" aria-modal="true" aria-label={r.title} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--bg)', overflowY: 'auto', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
      <div className="pad stack" style={{ gap: 12, paddingTop: 14, maxWidth: 520, margin: '0 auto' }}>
        <div className="between">
          <span className="stack" style={{ gap: 0 }}>
            <span className="xs muted" style={{ fontWeight: 600 }}>{ACTIVITIES[r.activity]}</span>
            <span className="display" style={{ fontSize: 20 }}>{r.title}</span>
          </span>
          <span className="display" style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{hms(Math.floor(t))}</span>
        </div>

        {s && (
          <section className="card stack" style={{ gap: 6, borderTop: `4px solid ${tint}` }} aria-live="polite">
            <span className="row xs" style={{ gap: 6, fontWeight: 800, color: tint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.title} · {idx + 1}/{steps.length}</span>
            <b className="display" style={{ fontSize: 64, lineHeight: 1, color: tint, fontVariantNumeric: 'tabular-nums' }}>{hms(Math.max(0, left))}</b>
            {msg && <span style={{ fontWeight: 700, fontSize: 18 }}>{msg}</span>}
            <div style={{ height: 6, borderRadius: 3, background: 'var(--chip)', overflow: 'hidden' }}><div style={{ width: `${clamp(stepPct, 0, 100)}%`, height: 6, background: tint }} /></div>
            {nextS && <span className="small muted">Ensuite : {nextS.title.toLowerCase()}, {fmtSpeed(nextS.speed)}, {fmtIncline(nextS.incline)}</span>}
          </section>
        )}
        {!s && <span className="small muted" style={{ lineHeight: 1.45 }}>Règle la vitesse et la pente comme sur le tapis : chaque changement est noté comme un palier.</span>}

        <div className="grid2">
          <Stepper label="Vitesse" value={fmtSpeed(r.cur.speed)} onMinus={() => adjust('speed', -0.1)} onPlus={() => adjust('speed', 0.1)} />
          <Stepper label="Pente" value={fmtIncline(r.cur.incline)} onMinus={() => adjust('incline', -0.5)} onPlus={() => adjust('incline', 0.5)} />
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div className="kpis">
            <span><b>{n2(sum.distance_km)}</b>km</span>
            <span><b>{sum.elevation_m}</b>m D+</span>
            <span><b>{sum.calories}</b>kcal</span>
          </div>
        </div>

        <button className="btn big" onClick={pause}>{r.since ? 'Pause' : 'Reprendre'}</button>
        <button className="btn primary big" onClick={stop}>Terminer</button>
        {steps && idx < steps.length - 1 && (
          <button className="btn" onClick={() => setR((x) => ({ ...x, acc: ends[idx] * 1000 - (x.since ? Date.now() - x.since : 0) }))}>Palier suivant</button>
        )}
      </div>
    </div>
  );
}

// Result to save, from the timer (prefilled) or typed by hand. The distance can be corrected:
// the tapis' own counter is the reference.
function EndForm({ draft, weight, onSave, onCancel }) {
  const [f, setF] = useState(draft);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const secs = parseDuration(f.duration);
  const speed = num(f.speed);
  // Outdoor walk: flat, no D+. Tapis: incline between 0 and 15 %.
  const flat = f.activity === 'walk';
  const incline = flat ? 0 : clamp(num(f.incline) || 0, 0, INCLINE_MAX);
  const speedOk = !!draft.segs || (speed >= SPEED_MIN && speed <= SPEED_MAX);
  // Typed by hand: one palier from the average speed and incline.
  const segs = draft.segs && draft.segs.length ? draft.segs : secs && speedOk ? [{ secs, speed, incline }] : [];
  const auto = segs.length ? summaryOf(segs, weight) : null;
  const km = f.distance !== '' ? num(f.distance) : auto?.distance_km || 0;
  // Distance corrected: speed and D+ follow it, the calories too.
  const scale = auto?.distance_km ? km / auto.distance_km : 1;
  const elevation = auto && !flat ? Math.round(auto.elevation_m * scale) : 0;
  const calories = segs.length ? caloriesOf(segs.map((x) => ({ ...x, speed: x.speed * scale })), weight) : 0;
  // Date field emptied (iOS « Effacer ») → no save, instead of an error on tap.
  const ok = secs > 0 && km > 0 && speedOk && f.feel && !Number.isNaN(new Date(f.when).getTime());
  const save = () => onSave({
    done_at: new Date(f.when).toISOString(), activity: f.activity, duration_s: secs, distance_km: Math.round(km * 100) / 100,
    speed_kmh: Math.round(((km / secs) * 3600) * 10) / 10, incline_pct: flat ? null : auto?.incline_pct ?? incline, elevation_m: flat ? null : elevation,
    calories, feel: f.feel, notes: f.title || null, session_key: f.key || null, source: draft.segs ? 'timer' : 'manual',
    segments: segs.length > 1 ? segs.map((x) => ({ ...x, speed: Math.round(x.speed * scale * 10) / 10 })) : null,
    avg_hr: f.hr ? Number(f.hr) : null,
  });
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Séance à enregistrer">
      <h2 className="label">{draft.segs ? 'Vérifie et enregistre' : 'Ajouter une séance'}</h2>
      {!draft.segs && (
        <div className="seg" role="group" aria-label="Activité" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {['incline_walk', 'treadmill', 'walk'].map((k) => <button key={k} className={f.activity === k ? 'on' : ''} aria-pressed={f.activity === k} onClick={() => set('activity', k)}>{k === 'incline_walk' ? 'Marche inclinée' : k === 'treadmill' ? 'Course tapis' : 'Marche dehors'}</button>)}
        </div>
      )}
      <div className="grid2">
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Durée</span><input className="input" placeholder="30:00" value={f.duration} onChange={(e) => set('duration', e.target.value)} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Distance (km)</span><input className="input" inputMode="decimal" placeholder={auto ? n2(auto.distance_km) : ''} value={f.distance} onChange={(e) => set('distance', e.target.value)} /></label>
        {!draft.segs && (
          <>
            <label className="stack" style={{ gap: 4 }}><span className="xs muted">Vitesse moyenne (km/h)</span><input className="input" inputMode="decimal" value={f.speed} onChange={(e) => set('speed', e.target.value)} aria-invalid={!speedOk} /></label>
            {!flat && <label className="stack" style={{ gap: 4 }}><span className="xs muted">Pente moyenne (0 à {INCLINE_MAX} %)</span><input className="input" inputMode="decimal" value={f.incline} onChange={(e) => set('incline', e.target.value)} /></label>}
          </>
        )}
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Fréquence cardiaque moy.</span><input className="input" inputMode="numeric" value={f.hr} onChange={(e) => set('hr', e.target.value)} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Date et heure</span><input className="input" type="datetime-local" value={f.when} onChange={(e) => set('when', e.target.value)} /></label>
      </div>
      {!speedOk && f.speed !== '' && <span className="xs" style={{ color: 'var(--danger)' }}>Vitesse entre {SPEED_MIN} et {SPEED_MAX} km/h.</span>}
      {draft.segs && <span className="xs muted">Distance calculée avec la vitesse réglée. Si le compteur du tapis dit autre chose, corrige-la.</span>}
      {km > 0 && secs > 0 && (
        <div className="kpis">
          <span><b>{n1((km / secs) * 3600)}</b>km/h moy.</span>
          {!flat && <span><b>{elevation}</b>m D+</span>}
          <span><b>{calories}</b>kcal</span>
        </div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <span className="xs muted">Comment c'était ?</span>
        <div className="seg" role="group" aria-label="Ressenti" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          {[[1, 'Très facile'], [2, 'Facile'], [3, 'Bien'], [4, 'Dur'], [5, 'Très dur']].map(([n, l]) => (
            <button key={n} className={f.feel === n ? 'on' : ''} aria-pressed={f.feel === n} aria-label={l} title={l} onClick={() => set('feel', n)}>{n}</button>
          ))}
        </div>
        <span className="xs muted">{f.key ? '1 à 3 : la prochaine fois sera un peu plus dure. 5 : un peu plus facile.' : '1 = très facile, 5 = très dur'}</span>
      </div>
      <button className="btn primary big" disabled={!ok} onClick={save}>Enregistrer</button>
      <button className="btn" onClick={onCancel}>{draft.segs ? 'Ne pas enregistrer' : 'Annuler'}</button>
    </section>
  );
}

// Tapis et marche inclinée: guided sessions, free session, manual entry and history.
export default function Tapis({ user }) {
  const data = useData();
  const ui = useUi();
  const weight = Number(user?.user_metadata?.weight_kg) || 75;
  const [open, setOpen] = useState(null); // template id shown in detail
  const [run, setRun] = useState(null); // timer running
  const [draft, setDraft] = useState(null); // result form
  const [freeKind, setFreeKind] = useState('incline_walk');
  const [sheet, setSheet] = useState(null);
  const [shareLog, setShareLog] = useState(null);
  const walks = data.walkLogs;
  const sessions = useMemo(() => TEMPLATES.map((t) => templateSession(t, walks)), [walks]);
  const week = thisWeek(walks);
  const dplus = weekElevation(walks);
  const recent = [...walks].sort((a, b) => new Date(b.done_at) - new Date(a.done_at)).slice(0, 8);

  const startGuided = (s) => {
    unlockAudio();
    signal(1);
    setRun({ title: s.title, key: s.key, activity: s.activity, steps: s.steps, idx: 0, acc: 0, since: Date.now(), startedAt: Date.now(), segs: [], cur: { at: 0, speed: s.steps[0].speed, incline: s.steps[0].incline } });
  };
  const startFree = () => {
    unlockAudio();
    const d = FREE[freeKind];
    setRun({ title: 'Séance libre', key: null, activity: freeKind, steps: null, idx: -1, acc: 0, since: Date.now(), startedAt: Date.now(), segs: [], cur: { at: 0, ...d } });
  };
  const ended = (r) => {
    setRun(null);
    const secs = r.segs.reduce((a, x) => a + x.secs, 0);
    setDraft({ segs: r.segs, activity: r.activity, title: r.steps ? r.title : '', key: r.key, duration: hms(secs), distance: '', hr: '', feel: null, when: toLocalInput(new Date(r.startedAt)) });
    window.scrollTo(0, 0);
  };
  const manual = () => { setDraft({ segs: null, activity: 'incline_walk', title: '', key: null, duration: '', distance: '', speed: '5', incline: '10', hr: '', feel: null, when: toLocalInput() }); window.scrollTo(0, 0); };
  const save = async (log) => {
    try {
      const row = await saveRunLog(log);
      await data.refresh(); setDraft(null); setOpen(null);
      ui.notify(log.elevation_m ? `Séance enregistrée : ${log.elevation_m} m de dénivelé` : 'Séance enregistrée');
      if (row && (await hasFriends())) setShareLog(row);
    } catch (e) { ui.notify(e.message || String(e)); }
  };

  const detail = open ? sessions.find((x) => x.key === `tpl:${open}`) : null;

  return (
    <main className="screen">
      <GlassHeader eyebrow={week.length ? `${week.length} séance${week.length > 1 ? 's' : ''} cette semaine, ${dplus} m de D+` : 'Marche inclinée et course sur tapis'} title="Tapis"
        lead={<Link to="/course" className="icon-btn" aria-label="Retour à la course"><Icon name="back" /></Link>} />
      <div className="pad stack" style={{ gap: 12, paddingTop: 10 }}>
        {draft && <EndForm draft={draft} weight={weight} onSave={save} onCancel={() => setDraft(null)} />}

        {!draft && detail && (
          <section className="card stack" style={{ gap: 12 }} aria-label={detail.title}>
            <div className="between">
              <span className="display" style={{ fontSize: 24 }}>{detail.title}</span>
              <button className="icon-btn" aria-label="Fermer" onClick={() => setOpen(null)}><Icon name="close" /></button>
            </div>
            <span className="small muted" style={{ lineHeight: 1.45 }}>{detail.about}</span>
            <div className="kpis">
              <span><b>{detail.mins}</b>min</span>
              <span><b>{n1(detail.km)}</b>km</span>
              <span><b>{detail.elevation}</b>m D+</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {detail.steps.map((x, i) => (
                <div key={i} className="between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="row" style={{ gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: PHASE_TINT[x.phase] }} />{x.title}</span>
                  <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(x.secs / 60)} min · {x.hint}</span>
                </div>
              ))}
            </div>
            {detail.level > 0 && <span className="xs muted">Niveau {detail.level + 1} : la séance s'est durcie parce que les dernières fois étaient faciles.</span>}
            <button className="btn primary big" onClick={() => startGuided(detail)}><Icon name="play" size={18} />Démarrer sur le téléphone</button>
            {isNative() && <span className="xs muted" style={{ textAlign: 'center' }}>Aussi sur l'Apple Watch : ouvre Kadence, carte Tapis.</span>}
          </section>
        )}

        {!draft && !detail && (
          <>
            <section className="stack" style={{ gap: 8 }} aria-label="Séances guidées">
              <h2 className="sec-title">Séances guidées</h2>
              <div className="list">
                {sessions.map((s) => (
                  <button key={s.key} onClick={() => setOpen(s.key.slice(4))} style={{ textAlign: 'left', width: '100%', color: 'inherit', background: 'transparent', border: 'none' }}>
                    <span className="grow stack" style={{ gap: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{s.title}{s.level > 0 ? <><span className="sr-only"> · niveau {s.level + 1}</span><span className="tag ok" aria-hidden="true" style={{ marginLeft: 8, verticalAlign: 1 }}>Niveau {s.level + 1}</span></> : null}</span>
                      <span className="xs muted">{s.mins} min · {n1(s.km)} km · {s.elevation} m D+</span>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </div>
            </section>

            <section className="card stack" style={{ gap: 10 }} aria-label="Séance libre">
              <h2 className="label">Séance libre</h2>
              <div className="seg" role="group" aria-label="Activité" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {['incline_walk', 'treadmill'].map((k) => <button key={k} className={freeKind === k ? 'on' : ''} aria-pressed={freeKind === k} onClick={() => setFreeKind(k)}>{ACTIVITIES[k]}</button>)}
              </div>
              <span className="xs muted">Tu règles la vitesse et la pente toi-même, Kadence calcule la distance, le dénivelé et les calories.</span>
              <button className="btn primary" onClick={startFree}><Icon name="play" size={16} />Démarrer</button>
              <button className="btn" onClick={manual}><Icon name="plus" size={16} />Ajouter une séance déjà faite</button>
            </section>

            {recent.length > 0 && (
              <section className="stack" style={{ gap: 8 }} aria-label="Tes dernières séances">
                <h2 className="sec-title">Tes dernières séances</h2>
                <div className="list">
                  {recent.map((l) => (
                    <button key={l.id} onClick={() => setSheet(l.id)} style={{ textAlign: 'left', width: '100%', color: 'inherit', background: 'transparent', border: 'none' }}>
                      <span className="grow stack" style={{ gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{logTitle(l)}</span>
                        <span className="xs muted">{fmtDay(new Date(l.done_at))} · {hms(l.duration_s)} · {n2(Number(l.distance_km))} km{l.elevation_m ? ` · ${Math.round(l.elevation_m)} m D+` : ''}{l.incline_pct ? ` · ${fmtIncline(Number(l.incline_pct))}` : ''}</span>
                      </span>
                      <Icon name="chevron" size={16} />
                    </button>
                  ))}
                </div>
              </section>
            )}
            {!user?.user_metadata?.weight_kg && <span className="xs muted" style={{ lineHeight: 1.45 }}>Calories calculées pour 75 kg. Indique ton poids dans Profil pour un calcul juste.</span>}
          </>
        )}
      </div>
      {run && <Player run={run} weight={weight} onEnd={ended} onCancel={() => setRun(null)} />}
      <RunSheet id={sheet} onClose={() => setSheet(null)} />
      {shareLog && <ShareSheet source={{ kind: 'run', l: shareLog }} data={data} onClose={() => setShareLog(null)} />}
    </main>
  );
}
