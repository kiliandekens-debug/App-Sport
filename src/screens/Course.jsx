import { useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { readRunScreenshot, parseRunText } from '../lib/runocr.js';
import { useData, saveRunProfile, saveRunLog, deleteRunLog, deleteRunProfile } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { Icon, Bars, GlassHeader } from '../components.jsx';
import { fmtDay } from '../lib/stats.js';
import { isNative } from '../native.js';
import { sendRunToWatch } from '../watch.js';
import { ShareSheet } from '../social.jsx';
import { hasFriends } from '../social.js';
import { GOALS, DAYS, DAY_SHORT, SLOT, PHASES, buildPlan, appleSteps, sessionSteps, autoSchedule, segments, intensityOf, mmss, hms, parseDuration, TYPE_LABEL, paceRange, pacesOf, goalPrediction, betterLevel, runStats, scheduleOf, scheduleIssues, raceTime, vdotOfProfile, fitnessFromHistory, monthlyKm } from '../lib/running.js';

const FILL = { warm: 'var(--z0)', cool: 'var(--z0)', rest: 'var(--z0)', recovery: 'var(--z0)', easy: 'var(--z1)', steady: 'var(--z1)', race: 'var(--z2)', tempo: 'var(--z3)', fast: 'var(--z4)', rep: 'var(--z4)', hill: 'var(--z4)', stride: 'var(--z4)' };
const localYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localYmd(new Date());
const whenLabel = (s) => (s.today ? "Aujourd'hui" : s.ymd === localYmd(new Date(Date.now() + 86400000)) ? 'Demain' : `${DAY_SHORT[(s.date.getDay() + 6) % 7]} ${fmtDay(s.date)}`);

// The session drawn as a profile: width = time, height = effort.
function RunChart({ session }) {
  const segs = segments(session);
  const total = segs.reduce((a, s) => a + s.mins, 0);
  // A steady run is one block: a short band is enough, no need for a big empty chart.
  const W = 320, H = segs.length === 1 ? 34 : 110, GAP = 1.5;
  let x = 0;
  const kinds = [...new Set(segs.map((s) => s.type))];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={`Séance de ${session.mins} minutes : ${kinds.map((k) => TYPE_LABEL[k]).join(', ')}`} style={{ display: 'block' }}>
        {segs.map((s, i) => {
          const w = (s.mins / total) * W;
          const h = intensityOf(s.type) * H;
          const rect = <rect key={i} x={x + GAP / 2} y={H - h} width={Math.max(1, w - GAP)} height={h} rx={3} fill={FILL[s.type]} />;
          x += w;
          return rect;
        })}
        <line x1="0" y1={H + 0.5} x2={W} y2={H + 0.5} stroke="var(--line)" />
        <text x="0" y={H + 14} fontSize="11" fill="var(--muted)">0</text>
        <text x={W} y={H + 14} fontSize="11" fill="var(--muted)" textAnchor="end">{session.mins} min</text>
      </svg>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {kinds.map((k) => (
          <span key={k} className="row xs muted" style={{ gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: FILL[k], display: 'inline-block' }} />{TYPE_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

function SessionRow({ s, active, onPick }) {
  const status = s.done ? 'Faite' : s.missed ? 'Non faite' : active ? 'Affichée' : 'Voir';
  return (
    <button className="card row" disabled={s.done} onClick={onPick} aria-label={`${whenLabel(s)}, ${s.title}, ${s.mins} minutes, ${status}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, textAlign: 'left', width: '100%', color: 'inherit', background: s.done ? 'var(--done)' : undefined, borderColor: s.done ? 'var(--done-line)' : active ? 'var(--accent)' : undefined, borderWidth: active && !s.done ? 2 : undefined, opacity: s.missed ? 0.6 : 1 }}>
      <span className="stack" style={{ width: 44, flexShrink: 0, alignItems: 'center', gap: 0 }}>
        <span className="xs muted">{DAY_SHORT[(s.date.getDay() + 6) % 7]}</span>
        <span className="display" style={{ fontSize: 20, lineHeight: 1.1 }}>{s.date.getDate()}</span>
      </span>
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: s.kind === 'quality' || s.kind === 'race' ? 'var(--z4)' : s.kind === 'long' ? 'var(--z2)' : 'var(--z1)' }} />
      <span className="grow stack" style={{ gap: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{s.title}</span>
        <span className="xs muted">{s.mins} min, ≈ {String(s.km).replace('.', ',')} km{s.blocks.length === 1 ? `, ${paceRange(s.blocks[0].pace)} /km` : ''}</span>
        {s.done && s.log?.splits?.text && (
          <span className="xs" style={{ fontWeight: 600, color: s.log.splits.slow || s.log.splits.fast ? 'var(--accent)' : 'var(--ok)' }}>{s.log.splits.text}</span>
        )}
      </span>
      {s.done ? <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 13, background: 'var(--ok)', color: 'var(--on-ok)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} width={3} /></span>
        : <span className="xs" style={{ color: s.missed ? 'var(--muted)' : 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.today && !active ? "Aujourd'hui" : status}</span>}
    </button>
  );
}

// What the coach reads in the logged runs: level, usual volume, break.
function FitCard({ fit }) {
  const b = fit.best;
  return (
    <section className="card stack" style={{ gap: 10 }} aria-label="Ce que disent tes courses">
      <h2 className="label">{fit.runs > 1 ? `Ce que disent tes ${fit.runs} courses` : 'Ce que dit ta course'}</h2>
      {b && <span className="small" style={{ lineHeight: 1.5 }}>Meilleure performance récente : <b>{b.notes || 'course'}</b>, {fmtDay(new Date(b.done_at))} {new Date(b.done_at).getFullYear()}, {fmtKm(b.distance_km)} km en {hms(b.duration_s)}. Niveau (VDOT) : <b>{fmt1(fit.vdotPeak)}</b>.</span>}
      <span className="small" style={{ lineHeight: 1.5 }}>Volume habituel : <b>{Math.round(fit.weeklyUsual)} km par semaine</b>. Plus longue sortie : {fmtKm(fit.longest.distance_km)} km.</span>
      {fit.break && fit.break.days >= 8 && (
        <div className="warn" style={{ gap: 4 }}>
          <span className="xs" style={{ fontWeight: 700 }}>Reprise après {fit.break.days} jours {fit.break.ongoing ? 'sans entraînement régulier' : 'de pause'}</span>
          <span className="small" style={{ lineHeight: 1.45 }}>
            {fit.break.isolated > 0 ? `Une sortie isolée pendant cette période ne compte pas comme une reprise. ` : ''}
            Forme estimée : −{Math.round((1 - fit.factor) * 100)} %{fit.crossTraining ? ' (la salle limite la perte)' : ''}, soit un niveau de {fmt1(fit.vdotNow)}. Le plan démarre par {fit.protocol.weeks.length} semaine{fit.protocol.weeks.length > 1 ? 's' : ''} de reprise à {fit.protocol.weeks.map((x) => `${Math.round(x * 100)} %`).join(', ')} du volume{fit.protocol.easyWeeks ? `, dont ${fit.protocol.easyWeeks} en footing uniquement` : ''} (méthode Daniels).
          </span>
        </div>
      )}
    </section>
  );
}

function HistoryCard({ logs, fit }) {
  const months = monthlyKm(logs);
  const max = Math.max(...months.map((m) => m.km), 1);
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Ton historique de course">
      <div className="between"><h2 className="label">Ton historique</h2><span className="xs muted">{fit.runs} course{fit.runs > 1 ? 's' : ''}, {Math.round(fit.totalKm)} km</span></div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 4, height: 70 }} role="img" aria-label={`Kilomètres par mois : ${months.map((m) => `${Math.round(m.km)}`).join(', ')}`}>
        {months.map((m, i) => <div key={i} style={{ flex: 1, height: `${Math.max(3, (m.km / max) * 100)}%`, borderRadius: '5px 5px 2px 2px', background: i === months.length - 1 ? 'var(--accent)' : 'var(--z1)', opacity: m.km ? 1 : 0.25 }} />)}
      </div>
      <div className="row xs muted" style={{ justifyContent: 'space-between' }}>{months.map((m, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{'JFMAMJJASOND'[m.date.getMonth()]}</span>)}</div>
      {!!fit.top?.length && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="xs muted" style={{ fontWeight: 600 }}>Meilleures performances (120 jours avant ta dernière période d'entraînement)</span>
          {fit.top.map((t) => (
            <div key={t.done_at} className="between" style={{ padding: '8px 10px', borderRadius: 12, background: 'var(--raised)', gap: 10 }}>
              <span className="grow small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes || 'Course'}<span className="muted">, {fmtDay(new Date(t.done_at))}</span></span>
              <span className="small" style={{ whiteSpace: 'nowrap' }}><b className="display">{fmtKm(t.distance_km)} km</b> en {hms(t.duration_s)}</span>
            </div>
          ))}
        </div>
      )}
      <span className="xs muted">Dernière course : {fmtDay(fit.lastRun)} ({fit.gapDays === 0 ? "aujourd'hui" : `il y a ${fit.gapDays} jour${fit.gapDays > 1 ? 's' : ''}`}).</span>
    </section>
  );
}

const fmtKm = (v) => String(Math.round(Number(v) * 10) / 10).replace('.', ',');
const fmt1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

// Plan creation: a few simple questions, one per screen. The coach places the week by itself
// (autoSchedule) around the long-run day, and reads the level from the logged runs.
const GOAL_TEXT = { '5k': '5 km', '10k': '10 km', semi: 'Semi-marathon', marathon: 'Marathon', forme: 'Être en forme' };
const RUNS_TEXT = { 2: 'Pour commencer ou reprendre', 3: 'Le bon équilibre, conseillé', 4: 'Pour progresser vraiment', 5: 'Si tu cours déjà beaucoup', 6: 'Coureur confirmé' };
const LEVELS = [[2400, 'Je débute', '5 km en 40 min environ'], [1980, 'Je cours un peu', '5 km en 33 min environ'], [1680, 'Je cours régulièrement', '5 km en 28 min environ'], [1440, 'Je cours vite', '5 km en 24 min environ']];
const PLAIN = { width: '100%', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', textAlign: 'left' };
const longDayOf = (sched) => { const i = sched.indexOf('long'); return i >= 0 ? i : 6; };
const fmtDate = (ymdStr) => new Date(`${ymdStr}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const TAPIS_LINK = (
  <Link to="/tapis" className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}>
    <span className="tile-icon" style={{ width: 40, height: 40, background: 'color-mix(in srgb, var(--ok) 20%, var(--chip))' }}><Icon name="up" size={20} /></span>
    <span className="grow stack" style={{ gap: 1 }}>
      <span style={{ fontWeight: 650 }}>Tapis et marche inclinée</span>
      <span className="xs muted">12-3-30 et séances guidées, vitesse et pente, dénivelé</span>
    </span>
    <Icon name="chevron" size={16} />
  </Link>
);

function Choice({ on, title, detail, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ textAlign: 'left', width: '100%', color: 'inherit', background: on ? 'var(--raised)' : 'transparent', border: 'none' }}>
      <span className="grow stack" style={{ gap: 2 }}>
        <span style={{ fontWeight: on ? 700 : 600, fontSize: 17 }}>{title}</span>
        {detail && <span className="xs muted">{detail}</span>}
      </span>
      {on ? <span style={{ color: 'var(--accent)' }}><Icon name="check" size={18} width={3} /></span> : <Icon name="chevron" size={16} />}
    </button>
  );
}

function Setup({ initial, onSave, onCancel, onStop, fit }) {
  const initialSched = initial ? scheduleOf(initial) : null;
  const [goal, setGoal] = useState(initial?.goal || '10k');
  const [runs, setRuns] = useState(initialSched ? initialSched.filter(Boolean).length : 3);
  const [longDay, setLongDay] = useState(initialSched ? longDayOf(initialSched) : 6);
  // Days picked one by one in the advanced settings; otherwise the coach places them.
  const [custom, setCustom] = useState(() => (initialSched && initialSched.join() !== autoSchedule(initialSched.filter(Boolean).length, longDayOf(initialSched)).join() ? initialSched : null));
  const auto = !initial && fit?.vdotNow ? Math.round(raceTime(fit.vdotNow, 5)) : null;
  const [refKm, setRefKm] = useState(initial?.ref_distance_km || 5);
  const [refTime, setRefTime] = useState(initial ? hms(initial.ref_time_s) : auto ? hms(auto) : '');
  const [weekly, setWeekly] = useState(initial?.weekly_km != null ? String(initial.weekly_km) : fit?.startKm ? String(fit.startKm) : '');
  const [date, setDate] = useState(initial?.target_date || '');
  const [reentry, setReentry] = useState(initial ? initial.reentry !== false : true);
  const [start, setStart] = useState(initial?.started_on ? String(initial.started_on).slice(0, 10) : today());
  const kindText = { easy: 'Footing', quality: 'Séance rythmée', long: 'Sortie longue' };
  const steps = ['goal', 'week', 'race', ...(initial || auto ? [] : ['level']), 'summary'];
  const [step, setStep] = useState(initial ? 'summary' : 'goal');
  const [from, setFrom] = useState(null); // editing one answer from the summary: come back to it
  const [busy, setBusy] = useState(false);

  const schedule = custom || autoSchedule(runs, longDay);
  const secs = parseDuration(refTime);
  const count = schedule.filter(Boolean).length;
  const issues = scheduleIssues(schedule);
  const dateIssue = date && start && date <= start ? 'La date de la course doit être après le début du programme.' : null;
  const blocking = count < 2 || schedule.filter((x) => x === 'quality').length > 2 || schedule.filter((x) => x === 'long').length > 1;
  const bad = !secs || secs < 600 || secs > 20000 || blocking || !start || !!dateIssue;
  const preview = secs ? raceTime(vdotOfProfile({ ref_distance_km: refKm, ref_time_s: secs }), GOALS[goal].km) : null;
  const setDay = (i, v) => setCustom(schedule.map((x, j) => (j === i ? v : x)));
  const idx = steps.indexOf(step);
  const next = () => { if (from) { setFrom(null); setStep('summary'); } else setStep(steps[Math.min(idx + 1, steps.length - 1)]); window.scrollTo(0, 0); };
  const back = () => { if (from) { setFrom(null); setStep('summary'); } else setStep(steps[Math.max(idx - 1, 0)]); window.scrollTo(0, 0); };
  const edit = (k) => { setFrom(k); setStep(k); window.scrollTo(0, 0); };
  
  const save = async () => {
    setBusy(true);
    try {
      await onSave({ goal, schedule, days_per_week: count, weekly_km: weekly === '' ? null : Number(String(weekly).replace(',', '.')) || 0, ref_distance_km: Number(refKm), ref_time_s: secs, target_date: date || null, started_on: start, reentry });
    } finally { setBusy(false); }
  };

  const question = (title, help, body, canNext = true) => (
    <main className="screen">
      <GlassHeader eyebrow={`Étape ${idx + 1} sur ${steps.length - 1}`} title="Plan de course" />
      <div className="pad stack" style={{ gap: 14, paddingTop: 10 }}>
        <div className="row" style={{ gap: 4 }} aria-hidden="true">
          {steps.slice(0, -1).map((k, i) => <span key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= idx ? 'var(--accent)' : 'var(--chip)' }} />)}
        </div>
        <h2 className="display" style={{ margin: '6px 0 0', fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.01em' }}>{title}</h2>
        {help && <span className="small muted" style={{ lineHeight: 1.45 }}>{help}</span>}
        {body}
        {canNext && <button className="btn primary big" onClick={next}>{from ? 'OK' : 'Suivant'}</button>}
        {(idx > 0 || from) && <button className="btn" onClick={back}>Retour</button>}
        {!from && idx === 0 && onCancel && <button className="btn" onClick={onCancel}>Annuler</button>}
      </div>
    </main>
  );

  if (step === 'goal') {
    return question('Ton objectif ?', auto ? `Ton niveau, je le connais déjà grâce à tes ${fit.runs} course${fit.runs > 1 ? 's' : ''}. Trois questions et ton plan est prêt.` : 'Quelques questions et ton plan est prêt.', (
      <>
        <div className="list">{Object.keys(GOALS).map((k) => <Choice key={k} on={goal === k} title={GOAL_TEXT[k]} onClick={() => { setGoal(k); next(); }} />)}</div>
        {!initial && <span className="label" style={{ paddingTop: 8 }}>Plutôt tapis ou marche ?</span>}
        {!initial && TAPIS_LINK}
      </>
    ), false);
  }
  if (step === 'week') {
    const preview = autoSchedule(runs, longDay);
    return question('Ta semaine', 'Choisis le nombre de sorties et le jour de ta sortie longue. Je place le reste tout seul, jamais deux jours durs d\'affilée.', (
      <>
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Sorties par semaine</span>
          <div className="seg" role="group" aria-label="Sorties par semaine" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {[2, 3, 4, 5, 6].map((n) => <button key={n} className={runs === n ? 'on' : ''} aria-pressed={runs === n} aria-label={`${n} sorties`} onClick={() => { setRuns(n); setCustom(null); }} style={{ height: 46, fontSize: 18 }}>{n}</button>)}
          </div>
          <span className="xs muted">{RUNS_TEXT[runs]}</span>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Jour de la sortie longue</span>
          <div className="seg" role="group" aria-label="Jour de la sortie longue" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {DAYS.map((d, i) => <button key={d} className={longDay === i ? 'on' : ''} aria-pressed={longDay === i} aria-label={d} onClick={() => { setLongDay(i); setCustom(null); }} style={{ height: 46, fontSize: 15 }}>{d.slice(0, 2)}</button>)}
          </div>
          <span className="xs muted">La plus longue course de la semaine, tranquille : choisis un jour où tu as le temps.</span>
        </div>
        <section className="card stack" style={{ gap: 8 }} aria-label="Aperçu de ta semaine">
          {DAYS.map((d, i) => (
            <div key={d} className="between" style={{ opacity: preview[i] ? 1 : 0.45 }}>
              <span style={{ fontWeight: preview[i] ? 600 : 400 }}>{d}</span>
              <span className="row small" style={{ gap: 8 }}>
                {preview[i] && <span style={{ width: 8, height: 8, borderRadius: 4, background: preview[i] === 'quality' ? 'var(--z4)' : preview[i] === 'long' ? 'var(--z2)' : 'var(--z1)' }} />}
                {preview[i] ? kindText[preview[i]] : 'Repos'}
              </span>
            </div>
          ))}
        </section>
      </>
    ));
  }
  if (step === 'race') {
    return question('Une course prévue ?', 'Avec une date, le plan se termine le jour J, après quelques jours plus légers pour arriver frais.', (
      <>
        <input className="input" type="date" min={start || today()} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date de la course" />
        {dateIssue && <span className="small" style={{ color: 'var(--danger)' }}>{dateIssue}</span>}
        {!date && <button className="btn" onClick={() => { setDate(''); next(); }}>Pas de course prévue</button>}
      </>
    ), !!date && !dateIssue);
  }
  if (step === 'level') {
    return question('Ton niveau ?', 'Il fixe tes allures. Pas besoin d\'être précis : le coach s\'ajuste après tes premières sorties.', (
      <>
        <div className="list">{LEVELS.map(([t, l, d]) => <Choice key={t} on={Number(refKm) === 5 && secs === t} title={l} detail={d} onClick={() => { setRefKm(5); setRefTime(hms(t)); next(); }} />)}</div>
        <span className="small muted">Ou ton temps récent sur 5 km :</span>
        <input className="input" inputMode="text" placeholder="Par exemple 28:30" value={refTime} onChange={(e) => { setRefKm(5); setRefTime(e.target.value); }} aria-label="Temps sur 5 km" />
      </>
    ), !!secs);
  }

  // Summary: every answer, the week the coach built, then create.
  const order = [0, 1, 2, 3, 4, 5, 6].filter((d) => schedule[d]);
  return (
    <main className="screen">
      <GlassHeader eyebrow="Plan de course" title={initial ? 'Ton plan' : 'Ton plan est prêt'} />
      <div className="pad stack" style={{ gap: 14, paddingTop: 10 }}>
        <div className="list">
          <button style={PLAIN} onClick={() => edit('goal')}><span className="grow stack" style={{ gap: 1, textAlign: 'left' }}><span className="xs muted">Objectif</span><b>{GOAL_TEXT[goal]}</b></span><span className="xs" style={{ color: 'var(--accent)', fontWeight: 600 }}>Modifier</span></button>
          <button style={PLAIN} onClick={() => edit('week')}><span className="grow stack" style={{ gap: 1, textAlign: 'left' }}><span className="xs muted">Ta semaine</span><b>{count} sorties, la longue le {DAYS[longDayOf(schedule)].toLowerCase()}</b></span><span className="xs" style={{ color: 'var(--accent)', fontWeight: 600 }}>Modifier</span></button>
          <button style={PLAIN} onClick={() => edit('race')}><span className="grow stack" style={{ gap: 1, textAlign: 'left' }}><span className="xs muted">Course</span><b>{date ? fmtDate(date) : 'Pas de date'}</b></span><span className="xs" style={{ color: 'var(--accent)', fontWeight: 600 }}>Modifier</span></button>
        </div>

        <section className="card stack" style={{ gap: 10 }} aria-label="Ta semaine type">
          <h2 className="label">Ta semaine type</h2>
          {order.map((d) => (
            <div key={d} className="between">
              <span style={{ fontWeight: 600 }}>{DAYS[d]}</span>
              <span className="row small" style={{ gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: schedule[d] === 'quality' ? 'var(--z4)' : schedule[d] === 'long' ? 'var(--z2)' : 'var(--z1)' }} />
                {kindText[schedule[d]]}
              </span>
            </div>
          ))}
          <span className="xs muted" style={{ lineHeight: 1.45 }}>Les autres jours : repos (ou salle). Les séances changent chaque semaine et s'adaptent à tes courses.</span>
          {!!issues.length && <div className="warn">{issues.map((t) => <span key={t} className="small" style={{ lineHeight: 1.4 }}>{t}</span>)}</div>}
        </section>

        <section className="card stack" style={{ gap: 6 }} aria-label="Ton niveau">
          <h2 className="label">Ton niveau</h2>
          <span className="small" style={{ lineHeight: 1.45 }}>
            {secs ? <>Environ <b>{hms(secs)}</b> sur {fmtKm(refKm)} km{auto && refTime === hms(auto) ? ', d\'après tes courses' : ''}.</> : 'À indiquer dans les réglages ci-dessous.'}
            {preview && goal !== 'forme' ? <> Temps possible aujourd'hui sur {GOALS[goal].label.toLowerCase()} : <b>{hms(preview)}</b>.</> : null}
          </span>
          {fit?.protocol && reentry && <span className="small muted" style={{ lineHeight: 1.45 }}>Tu reprends après {fit.break.days} jours : les premières semaines seront plus légères.</span>}
        </section>

        <button className="btn primary big" disabled={bad || busy} onClick={save}>{initial ? 'Mettre à jour le plan' : 'Créer mon plan'}</button>

        <details className="card disclose-card">
          <summary><span className="grow" style={{ fontWeight: 650 }}>Réglages avancés</span><Icon name="chevron" size={16} /></summary>
          <div className="stack" style={{ gap: 16, padding: '0 18px 18px' }}>
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Temps de référence</span>
              <span className="xs muted">Un temps récent sur une distance. Il fixe toutes tes allures.</span>
              <div className="seg" role="group" aria-label="Distance de référence" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {[[3, '3 km'], [5, '5 km'], [10, '10 km']].map(([k, l]) => <button key={k} className={Number(refKm) === k ? 'on' : ''} aria-pressed={Number(refKm) === k} onClick={() => setRefKm(k)}>{l}</button>)}
              </div>
              <input className="input" inputMode="text" placeholder="Par exemple 28:30" value={refTime} onChange={(e) => setRefTime(e.target.value)} aria-label="Temps de référence" />
            </div>
            <label className="stack" style={{ gap: 6 }}>
              <span className="label">Kilomètres par semaine en ce moment</span>
              <span className="xs muted">Le volume part de là et monte d'environ 8 % par semaine, jamais plus.</span>
              <input className="input" inputMode="decimal" placeholder="Par exemple 15 (0 si tu reprends)" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
            </label>
            {fit?.protocol && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="label">Reprise progressive</span>
                <div className="seg" role="group" aria-label="Reprise progressive" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <button className={reentry ? 'on' : ''} aria-pressed={reentry} onClick={() => setReentry(true)}>Oui (conseillé)</button>
                  <button className={!reentry ? 'on' : ''} aria-pressed={!reentry} onClick={() => setReentry(false)}>Non</button>
                </div>
              </div>
            )}
            <label className="stack" style={{ gap: 6 }}>
              <span className="label">Début du programme</span>
              <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Début du programme" />
              {initial && start !== String(initial.started_on).slice(0, 10) && <span className="xs" style={{ color: 'var(--warm)', lineHeight: 1.4 }}>Changer la date de début recale toutes les séances : celles déjà cochées ne seront plus reliées au plan (tes courses restent enregistrées).</span>}
            </label>
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Choisir mes jours moi-même</span>
              <span className="xs muted">Seulement si la semaine proposée ne te convient pas.</span>
              <div className="list">
                {DAYS.map((d, i) => (
                  <div key={d} style={{ padding: '8px 8px 8px 12px', gap: 8 }}>
                    <span style={{ width: 70, fontWeight: 600, fontSize: 14 }}>{d}</span>
                    <div className="seg grow" role="group" aria-label={`Sortie du ${d.toLowerCase()}`} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', background: 'var(--raised)' }}>
                      {[[null, 'Repos'], ['easy', SLOT.easy], ['quality', SLOT.quality], ['long', SLOT.long]].map(([v, l]) => (
                        <button key={l} className={schedule[i] === v ? 'on' : ''} aria-pressed={schedule[i] === v} onClick={() => setDay(i, v)} style={{ fontSize: 12, height: 34, padding: 0 }}>{l}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {custom && <button className="text-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setCustom(null)}>Revenir à la semaine du coach</button>}
            </div>
          </div>
        </details>

        {onCancel && <button className="btn" onClick={onCancel}>Annuler les modifications</button>}
        {onStop && <button className="btn" style={{ color: 'var(--danger)' }} onClick={onStop}><Icon name="trash" size={16} />Arrêter ce programme</button>}
      </div>
    </main>
  );
}

const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function ResultForm({ draft, session, onSave, onCancel, note }) {
  const [f, setF] = useState(draft);
  const set = (k, v) => setF({ ...f, [k]: v });
  const secs = parseDuration(f.duration);
  const km = Number(String(f.distance).replace(',', '.'));
  const ok = km > 0 && secs > 0;
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Résultat de la course">
      <h2 className="label">Résultat à enregistrer</h2>
      {note && <span className="small" style={{ color: 'var(--rest)' }}>{note}</span>}
      <div className="grid2">
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Distance (km)</span><input className="input" inputMode="decimal" value={f.distance} onChange={(e) => set('distance', e.target.value)} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Durée</span><input className="input" inputMode="text" placeholder="32:15" value={f.duration} onChange={(e) => set('duration', e.target.value)} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Fréquence cardiaque moy.</span><input className="input" inputMode="numeric" value={f.hr} onChange={(e) => set('hr', e.target.value)} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Calories</span><input className="input" inputMode="numeric" value={f.cal} onChange={(e) => set('cal', e.target.value)} /></label>
      </div>
      <label className="stack" style={{ gap: 4 }}><span className="xs muted">Date et heure</span><input className="input" type="datetime-local" value={f.when} onChange={(e) => set('when', e.target.value)} /></label>
      {ok && <span className="small muted">Allure moyenne : {mmss(secs / km)} /km{session ? ` (prévu : ${mmss((session.mins * 60) / session.km)})` : ''}</span>}
      <div className="stack" style={{ gap: 6 }}>
        <span className="xs muted">Comment c'était ?</span>
        <div className="seg" role="group" aria-label="Ressenti" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          {[[1, 'Très facile'], [2, 'Facile'], [3, 'Bien'], [4, 'Dur'], [5, 'Très dur']].map(([n, l]) => (
            <button key={n} className={f.feel === n ? 'on' : ''} aria-pressed={f.feel === n} aria-label={l} title={l} onClick={() => set('feel', n)}>{n}</button>
          ))}
        </div>
        <span className="xs muted">1 = très facile, 5 = très dur</span>
      </div>
      <button className="btn primary big" disabled={!ok || !f.feel} onClick={() => onSave({ ...f, secs, km })}>Enregistrer la course</button>
      <button className="btn" onClick={onCancel}>Annuler</button>
    </section>
  );
}

export default function Course() {
  const data = useData();
  const ui = useUi();
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftNote, setDraftNote] = useState(null);
  const [reading, setReading] = useState(false);
  const location = useLocation();
  const [picked, setPicked] = useState(location.state?.pick || null);
  // The plan's paces include the coach's current adjustment.
  const [showPlan, setShowPlan] = useState(false);
  const [tab, setTab] = useState('seance');
  const [sending, setSending] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [shareLog, setShareLog] = useState(null);
  const pick = (key) => { setPicked(key); setTab('seance'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const profile = data.runProfile;

  const plan = useMemo(() => (profile ? buildPlan(profile, data.runLogs, data.workouts) : null), [profile, data.runLogs, data.workouts]);
  const fit = useMemo(() => fitnessFromHistory(data.runLogs, data.workouts), [data.runLogs, data.workouts]);

  const saveProfile = async (p) => {
    try { await saveRunProfile(p); await data.refresh(); setEditing(false); ui.notify('Plan enregistré'); } catch (e) { ui.notify(e.message || String(e)); }
  };

  const stopPlan = async () => {
    if (!(await ui.confirm({ title: 'Arrêter ce programme ?', message: 'Le plan est supprimé. Tes courses déjà enregistrées restent dans ton historique et tes statistiques.', ok: 'Arrêter', danger: true }))) return;
    try { await deleteRunProfile(); await data.refresh(); setEditing(false); setPicked(null); window.scrollTo(0, 0); ui.notify('Programme arrêté'); } catch (e) { ui.notify(e.message || String(e)); }
  };

  if (!profile || editing) return <Setup initial={profile} onSave={saveProfile} onCancel={profile ? () => setEditing(false) : null} onStop={profile ? stopPlan : null} fit={fit} />;

  const all = plan.weeks.flat();
  const firstSession = all[0];
  const notStarted = !!firstSession && firstSession.ymd > today();
  const next = all.find((x) => x.key === picked && !x.done) || plan.next;
  const isPicked = next && plan.next && next.key !== plan.next.key;
  const paces = pacesOf(profile, plan.adj.paceScale);
  const stats = runStats(data.runLogs);
  const better = betterLevel(profile, data.runLogs);
  const plannedWeekKm = (plan.weeks[plan.current] || []).reduce((a, x) => a + x.km, 0);
  const km1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const weekSessions = plan.weeks[plan.current] || [];
  const apple = next ? appleSteps(next) : null;
  const sendToWatch = async () => {
    setSending(true);
    try {
      await sendRunToWatch(next);
      ui.notify(next.ymd === today() ? 'Séance envoyée : ouvre Exercice sur la montre, elle est en haut' : 'Séance envoyée : elle sera dans Exercice le jour prévu');
    } catch (e) {
      ui.notify(e.message || String(e));
    } finally {
      setSending(false);
    }
  };
  const logs = [...data.runLogs].reverse();

  const empty = () => ({ distance: '', duration: '', hr: '', cal: '', feel: null, when: toLocalInput() });
  const fill = (r) => {
    if (!r.found) {
      setDraftNote('Je n\'ai pas réussi à lire les valeurs. Saisis-les à la main, ou colle le texte de la capture.');
      setDraft(empty());
      return;
    }
    setDraftNote(r.found < 2 ? 'Je n\'ai lu qu\'une partie des valeurs. Complète et vérifie avant d\'enregistrer.' : 'Vérifie les valeurs lues sur ta capture avant d\'enregistrer.');
    setDraft({
      distance: r.distance_km != null ? String(r.distance_km).replace('.', ',') : '',
      duration: r.duration_s != null ? hms(r.duration_s) : '',
      hr: r.avg_hr != null ? String(r.avg_hr) : '',
      cal: r.calories != null ? String(r.calories) : '',
      feel: null,
      when: toLocalInput(r.done_at),
    });
  };

  const readCapture = async (file) => {
    if (!file) return;
    setReading(true);
    try {
      fill(await readRunScreenshot(file));
    } catch {
      fill({ found: 0 });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const pasteText = async () => {
    const text = await ui.prompt({ title: 'Coller le texte de la capture', message: 'Dans Photos, appuie longuement sur le texte de la capture, « Tout sélectionner », « Copier », puis colle ici.', placeholder: 'Texte copié', ok: 'Lire' });
    if (text) fill(parseRunText(text));
  };

  const manual = () => { setDraftNote(null); setDraft(empty()); };

  const saveResult = async (f) => {
    try {
      const row = await saveRunLog({
        done_at: new Date(f.when).toISOString(), session_key: next?.key || null, kind: next?.kind || null,
        distance_km: f.km, duration_s: f.secs, avg_hr: f.hr ? Number(f.hr) : null, calories: f.cal ? Number(f.cal) : null,
        feel: f.feel, source: draftNote && !draftNote.includes('pas réussi') ? 'screenshot' : 'manual',
      });
      await data.refresh();
      setDraft(null);
      setPicked(null);
      ui.notify('Course enregistrée, plan mis à jour');
      if (row && (await hasFriends())) setShareLog(row);
    } catch (e) { ui.notify(e.message || String(e)); }
  };

  return (
    <main className="screen">
      <GlassHeader eyebrow={notStarted ? `${GOALS[profile.goal]?.label || 'Course'}, première sortie ${whenLabel(firstSession).toLowerCase()}` : `${GOALS[profile.goal]?.label || 'Course'}, semaine ${Math.min(plan.current + 1, plan.total)} sur ${plan.total}, ${PHASES[plan.phase].label.toLowerCase()}`} title="Course" />

      <div className="pad stack" style={{ gap: 12, paddingTop: 10 }}>
        {!draft && (
          <div className="seg" role="tablist" aria-label="Sections de la course" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {[['seance', 'Aujourd\'hui'], ['plan', 'Mon plan'], ['suivi', 'Mes courses']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        )}
        {draft && <ResultForm draft={draft} session={next} note={draftNote} onSave={saveResult} onCancel={() => setDraft(null)} />}

        {!draft && tab === 'seance' && plan.finished && (
          <div className="card stack" style={{ gap: 8 }}>
            <span className="display" style={{ fontSize: 22 }}>Plan terminé</span>
            <span className="small muted">Tu as fait toutes les séances prévues. Définis un nouvel objectif pour continuer.</span>
            <button className="btn primary" onClick={() => setEditing(true)}>Nouvel objectif</button>
          </div>
        )}

        {!draft && tab === 'seance' && notStarted && (
          <div className="card stack" style={{ gap: 6 }}>
            <span style={{ fontWeight: 650 }}>Ton programme commence le {new Date(`${String(profile.started_on).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span className="small muted" style={{ lineHeight: 1.45 }}>D'ici là : footing facile si tu veux, 30 min maximum.</span>
          </div>
        )}

        {!draft && tab === 'seance' && next && (
          <>
            <div className="card hero" style={{ gap: 8 }}>
              <h2 className="label">{isPicked ? `Séance choisie : ${whenLabel(next).toLowerCase()}` : `Prochaine sortie : ${whenLabel(next).toLowerCase()}`}</h2>
              <span className="display">{next.title}</span>
              <div className="session-stats" style={{ padding: 0 }}>
                <span><b>{next.mins}</b>min</span>
                <span><b>≈ {String(next.km).replace('.', ',')}</b>km</span>
              </div>
              {(next.recover || next.taper) && <span className="small" style={{ fontWeight: 600 }}>{next.taper ? 'Semaine d\'affûtage : on garde les jambes fraîches.' : 'Semaine plus légère : volume réduit de 20 % pour assimiler.'}</span>}
            </div>

            <section className="card stack" style={{ gap: 14 }} aria-label="Ce que tu fais">
              <h2 className="label">Ce que tu fais</h2>
              <ol className="stack" style={{ gap: 14, margin: 0, padding: 0, listStyle: 'none' }}>
                {sessionSteps(next).map((st, i) => (
                  <li key={i} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                    <span className="display" style={{ minWidth: 28, height: 28, borderRadius: 9, background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{i + 1}</span>
                    <div className="grow stack" style={{ gap: 3, minWidth: 0 }}>
                      <span style={{ fontWeight: 650, lineHeight: 1.3 }}>{st.title}</span>
                      {st.lines.map((l, j) => <span key={j} className="small muted" style={{ lineHeight: 1.45 }}>{l}</span>)}
                    </div>
                  </li>
                ))}
              </ol>
              <span className="xs muted" style={{ lineHeight: 1.45 }}>Les allures sont par kilomètre. Pas de montre ? Fie-toi aux sensations décrites : elles comptent plus que les chiffres.</span>
              <details className="disclose">
                <summary>Pourquoi cette séance</summary>
                <p className="small" style={{ lineHeight: 1.5 }}>{next.why}</p>
              </details>
              <details className="disclose">
                <summary>Voir le profil de la séance</summary>
                <div style={{ paddingTop: 8 }}><RunChart session={next} /></div>
              </details>
            </section>

            {isNative() && (
              <button className="btn big" onClick={sendToWatch} disabled={sending}>
                <Icon name="send" size={16} width={2.5} />{sending ? 'Envoi…' : 'Envoyer à la montre'}
              </button>
            )}
            <details className="card stack disclose-card" aria-label="À saisir dans Exercice">
              <summary>
                <span className="grow stack" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 650 }}>{isNative() ? 'Ou la programmer à la main' : 'Programmer la séance sur la montre'}</span>
                  <span className="xs muted">{apple.where}</span>
                </span>
                <Icon name="chevron" size={16} />
              </summary>
              <ol className="stack" style={{ gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
                {apple.steps.map((st, i) => (
                  <li key={i} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                    <span className="display" style={{ minWidth: 26, height: 26, borderRadius: 8, background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{i + 1}</span>
                    <div className="grow stack" style={{ gap: 1 }}>
                      <span style={{ fontWeight: 600 }}>{st.title}</span>
                      <span className="small muted">{st.detail}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </details>

            {plan.note && <div className="warn"><span className="xs" style={{ fontWeight: 700 }}>Jambes</span><span className="small" style={{ lineHeight: 1.4 }}>{plan.note}</span></div>}
            {((plan.reentry && plan.reentry.weeks.length > 0) || (plan.adj.message && !isPicked)) && (
              <div className="card stack" style={{ gap: 4 }}>
                <span className="xs" style={{ fontWeight: 700 }}>Le coach</span>
                {plan.reentry && plan.reentry.weeks.length > 0 && <span className="small" style={{ lineHeight: 1.45 }}>Tu reprends après {plan.reentry.gap} jours : volume réduit les premières semaines{plan.reentry.easyWeeks ? `, séances rythmées allégées jusqu'à ${plan.reentry.backOn}` : ''}.</span>}
                {plan.adj.message && !isPicked && <span className="small" style={{ lineHeight: 1.45 }}>{plan.adj.message}</span>}
              </div>
            )}
            {better && (
              <div className="card stack" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600 }}>Tu as progressé</span>
                <span className="small muted">Ta course du {fmtDay(new Date(better.log.done_at))} équivaut à {hms(better.eq5)} sur 5 km, contre {hms(better.ref5)} enregistré. Je peux recalculer tes allures sur ce niveau.</span>
                <button className="btn" onClick={() => saveProfile({ ...profile, ref_distance_km: 5, ref_time_s: Math.round(better.eq5) })}>Mettre à jour mes allures</button>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => readCapture(e.target.files?.[0])} />
            {!logOpen ? (
              <button className="btn primary big" disabled={reading} onClick={() => setLogOpen(true)}>
                <Icon name="plus" size={18} />{reading ? 'Lecture de la capture…' : 'J\'ai couru'}
              </button>
            ) : (
              <div className="card stack" style={{ gap: 8 }}>
                <span style={{ fontWeight: 650 }}>Enregistrer ta course</span>
                <button className="btn primary" disabled={reading} onClick={() => { setLogOpen(false); fileRef.current?.click(); }}>Avec une capture d'écran</button>
                <button className="btn" onClick={() => { setLogOpen(false); manual(); }}>Saisir à la main</button>
                <button className="btn" onClick={() => { setLogOpen(false); pasteText(); }}>Coller le texte de la capture</button>
                <button className="text-btn" onClick={() => setLogOpen(false)}>Annuler</button>
                {isNative() && <span className="xs muted" style={{ lineHeight: 1.4 }}>Avec la montre, ta course arrive toute seule depuis Apple Santé : rien à faire.</span>}
              </div>
            )}
          </>
        )}
        {!draft && tab === 'seance' && TAPIS_LINK}

        {!draft && tab === 'plan' && (
          <>
            <div className="between" style={{ paddingTop: 4 }}>
              <h2 className="label">Cette semaine</h2>
              <span className="xs muted">{weekSessions.filter((s) => s.done).length} sur {weekSessions.length} faites</span>
            </div>
            {weekSessions.map((s) => <SessionRow key={s.key} s={s} active={next?.key === s.key} onPick={() => pick(s.key)} />)}

            <section className="card stack" style={{ gap: 12, marginTop: 12 }} aria-label="Ton programme">
              <div className="between"><h2 className="label">Ton programme</h2><span className="xs muted">{plan.total} semaines</span></div>
              <div className="row" style={{ gap: 3 }} aria-hidden="true">
                {plan.phases.map((ph) => <div key={ph.key} style={{ flexGrow: ph.weeks, flexBasis: 0, height: 8, borderRadius: 4, background: ph.key === plan.phase ? 'var(--accent)' : 'var(--chip)' }} />)}
              </div>
              <span className="xs muted" style={{ lineHeight: 1.5 }}>
                {plan.phases.map((ph, i) => (
                  <span key={ph.key}>{i ? ', puis ' : ''}<b style={{ color: ph.key === plan.phase ? 'var(--text)' : 'inherit' }}>{PHASES[ph.key].label}</b> ({ph.weeks} sem.)</span>
                ))}
              </span>
              <span className="small" style={{ lineHeight: 1.45 }}>{PHASES[plan.phase].tip}</span>
              <span className="xs muted">{Math.round(plan.easyShare * 100)} % du temps de course en facile sur l'ensemble du plan (cible 80 %).</span>
            </section>

            <section className="card stack" style={{ gap: 12 }} aria-label="Tes allures">
              <div className="between">
                <h2 className="label">Tes allures</h2>
                <span className="xs muted">par km</span>
              </div>
              <div className="stack" style={{ gap: 9 }}>
                {[['Footing', `${mmss(paces.easyFast)} – ${mmss(paces.easySlow)}`, 'footings et sortie longue : tu peux parler', 'var(--z1)'],
                  [`Objectif ${GOALS[profile.goal]?.label === 'Forme' ? '5 km' : GOALS[profile.goal]?.label.toLowerCase()}`, mmss(paces.race), 'allure de course', 'var(--z2)'],
                  ['Soutenu (seuil)', mmss(paces.threshold), 'confortablement dur, tenable environ 1 h', 'var(--z3)'],
                  ['Vite (VMA)', mmss(paces.interval), 'dur, par blocs de 3 à 5 min', 'var(--z4)'],
                  ['Très vite', mmss(paces.rep), 'efforts courts et relâchés', 'var(--z4)']].map(([l, v, d, c]) => (
                  <div key={l} className="row" style={{ gap: 10 }}>
                    <span style={{ width: 4, height: 30, borderRadius: 2, background: c, flexShrink: 0 }} />
                    <span className="grow stack" style={{ gap: 0 }}><b style={{ fontSize: 15 }}>{l}</b><span className="xs muted">{d}</span></span>
                    <span className="display" style={{ fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="grid2" style={{ gap: 6 }}>
                {[['5 km', 5], ['10 km', 10], ['Semi', 21.0975], ['Marathon', 42.195]].map(([l, k]) => (
                  <div key={l} className="between" style={{ padding: '8px 10px', borderRadius: 12, background: 'var(--raised)' }}>
                    <span className="xs muted">{l}</span><b className="display" style={{ fontSize: 15 }}>{hms(raceTime(paces.vdot, k) * plan.adj.paceScale)}</b>
                  </div>
                ))}
              </div>
              <span className="xs muted">Temps possibles aujourd'hui avec la préparation adaptée à chaque distance.</span>
            </section>

            <button className="btn" aria-expanded={showPlan} onClick={() => setShowPlan(!showPlan)}>{showPlan ? 'Masquer le plan complet' : `Voir le plan complet (${plan.total} semaines)`}</button>
            {showPlan && plan.weeks.map((wk, i) => (
              <div key={i} className="stack" style={{ gap: 8 }}>
                <div className="between" style={{ paddingTop: 8 }}>
                  <h2 className="label">Semaine {i + 1}{i === plan.current ? ' (en cours)' : ''}, {PHASES[wk[0]?.phase]?.label.toLowerCase()}{wk[0]?.recover ? ', allégée' : ''}</h2>
                  <span className="xs muted">≈ {km1(wk.reduce((a, x) => a + x.km, 0))} km</span>
                </div>
                {wk.map((s) => <SessionRow key={s.key} s={s} active={next?.key === s.key} onPick={() => pick(s.key)} />)}
              </div>
            ))}

            <div className="grid2" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Modifier</button>
              <button className="btn" style={{ color: 'var(--danger)' }} onClick={stopPlan}><Icon name="trash" size={16} />Arrêter</button>
            </div>
          </>
        )}

        {!draft && tab === 'suivi' && (
          <>
            {fit.runs > 0 && <HistoryCard logs={data.runLogs} fit={fit} />}

            {stats.count > 0 && (
              <section className="card stack" style={{ gap: 12 }} aria-label="Ton suivi">
                <h2 className="label">Ton suivi</h2>
                <div className="session-stats" style={{ padding: 0, flexWrap: 'wrap', rowGap: 6 }}>
                  <span><b>{stats.count}</b>sortie{stats.count > 1 ? 's' : ''}</span>
                  <span><b>{km1(stats.totalKm)}</b>km au total</span>
                  <span><b>{mmss(stats.avgPace)}</b>/km en moyenne</span>
                </div>
                <Bars values={stats.weeks.map((w) => w.km)} labels={stats.weeks.map((w) => `${w.from.getDate()}/${w.from.getMonth() + 1}`)} height={72} highlight={[stats.weeks.length - 1]} label="Kilomètres par semaine sur 8 semaines" />
                <span className="small muted">Cette semaine : {km1(stats.weekKm)} km sur {km1(plannedWeekKm)} prévus. Plus longue sortie : {km1(stats.longest)} km.</span>
              </section>
            )}

            {!!logs.length && (
              <>
                <h2 className="label" style={{ paddingTop: 4 }}>Dernières courses</h2>
                {logs.slice(0, 6).map((l) => (
                  <div key={l.id} className="card row" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                    <div className="grow stack" style={{ gap: 1 }}>
                      <span style={{ fontWeight: 600 }}>{String(Number(l.distance_km)).replace('.', ',')} km en {hms(l.duration_s)}</span>
                      <span className="xs muted">{fmtDay(new Date(l.done_at))} · {mmss(l.duration_s / Number(l.distance_km))} /km{l.avg_hr ? ` · ${l.avg_hr} bpm` : ''}{l.feel ? ` · ressenti ${l.feel}/5` : ''}</span>
                    </div>
                    <button className="icon-btn" aria-label="Supprimer cette course" onClick={async () => {
                      if (!(await ui.confirm({ title: 'Supprimer cette course ?', message: 'Le plan sera recalculé.', ok: 'Supprimer', danger: true }))) return;
                      try { await deleteRunLog(l.id); await data.refresh(); } catch (e) { ui.notify(e.message || String(e)); }
                    }}><Icon name="close" size={16} /></button>
                  </div>
                ))}
              </>
            )}
            {!logs.length && !fit.runs && <div className="card"><span className="small muted">Tes courses enregistrées apparaîtront ici.</span></div>}
          </>
        )}
      </div>
      {shareLog && <ShareSheet source={{ kind: 'run', l: shareLog }} data={data} onClose={() => setShareLog(null)} />}
    </main>
  );
}
