import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, saveRoutine } from '../data.jsx';
import { useSession } from '../session.jsx';
import { fmtDay, sameDay } from '../lib/stats.js';
import { routineFromHistory, nextSession } from '../lib/routines.js';
import { Icon, ExerciseImage, GlassHeader } from '../components.jsx';
import { buildPlan, segments, intensityOf } from '../lib/running.js';
import { DayDetail, WorkoutSheet, RunSheet, dayInfo } from '../day.jsx';

// "aujourd'hui", "hier", "il y a 3 jours", then the date.
const ago = (d) => {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : days < 7 ? `il y a ${days} jours` : `le ${fmtDay(new Date(d))}`;
};

const firstName = (user) => (user?.user_metadata?.name || '').split(' ')[0] || 'Kilian';

export default function Accueil({ user }) {
  const data = useData();
  const session = useSession();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const today = new Date();
  const run = data.runProfile ? buildPlan(data.runProfile, data.runLogs, data.workouts) : null;

  // Least recently done routine, or the next one in the usual rotation of the history.
  const { routines, next } = nextSession(data);
  const last = data.workouts[0] || null;
  // What happened, or is planned, on each day of the week: gym, run, or rest.
  const planned = run ? run.weeks.flat() : [];
  const weekDays = data.weekDays.map((d) => ({ ...d, ...dayInfo(data, d.date, planned) }));
  const [selDay, setSelDay] = useState(() => Math.max(0, data.weekDays.findIndex((d) => d.today)));
  const [picked, setPicked] = useState(false);
  const sel = weekDays[selDay];
  const selEmpty = !sel.gym.length && !sel.runs.length && !(sel.plan && !sel.past);
  const [openW, setOpenW] = useState(null);
  const [openR, setOpenR] = useState(null);
  
  const startRoutine = (r) => { session.startRoutine(r); nav('/seance'); };
  const startProgram = (title) => { session.start(title); nav('/seance'); };
  const importFromHistory = async () => {
    setBusy(true);
    try {
      let pos = data.routines.length;
      for (const p of data.programs.slice(0, 4)) await saveRoutine({ ...routineFromHistory(data, p.title), position: pos++ });
      await data.refresh();
    } finally {
      setBusy(false);
    }
  };

  const sets = (r) => r.exercises.reduce((a, e) => a + e.sets.filter((s) => s.type !== 'warmup').length, 0);

  return (
    <main className="screen">
      <GlassHeader eyebrow={<span style={{ textTransform: 'capitalize' }}>{today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>} title={`Salut ${firstName(user)}`} />

      <div className="pad stack" style={{ paddingTop: 12, gap: 14 }}>
        <div className="week">
          {weekDays.map((d, i) => {
            const gym = d.gym.length > 0;
            const kind = gym ? 'gym' : d.run ? 'run' : d.plan && !d.past ? 'planned' : 'rest';
            const what = [gym && 'muscu', d.run && 'course', !gym && !d.run && d.plan && !d.past && `course prévue`].filter(Boolean).join(' et ') || 'repos';
            return (
              <button key={d.date.toISOString()} className="day" onClick={() => { setSelDay(i); setPicked(true); }} aria-pressed={selDay === i}
                aria-label={`${d.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} : ${what}`}>
                <span style={d.today ? { color: 'var(--text)', fontWeight: 800 } : null}>{d.letter}</span>
                <span className={`dot k-${kind}${d.today ? ' today' : ''}${selDay === i ? ' sel' : ''}`}>
                  {kind === 'rest' ? <span className="dnum">{d.date.getDate()}</span> : <Icon name={kind === 'gym' ? 'dumbbell' : 'run'} size={19} width={2.2} />}
                  {gym && d.run && <span className="dot-badge"><Icon name="run" size={11} width={2.4} /></span>}
                </span>
              </button>
            );
          })}
        </div>
        {(!selEmpty || picked) && <DayDetail d={sel} onRun={(key) => nav('/course', { state: { pick: key } })} onGym={(id) => setOpenW(id)} onRunLog={(id) => setOpenR(id)} />}
      </div>

      {!data.workouts.length && !session.active && (
        <Link to="/profil" className="card tile" style={{ margin: '20px 20px 0' }}>
          <span className="row" style={{ gap: 10 }}>
            <span className="tile-icon" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><Icon name="upload" size={20} /></span>
            <span className="grow stack" style={{ gap: 2 }}>
              <span style={{ fontWeight: 650 }}>Importe ton historique Hevy</span>
              <span className="xs muted">Tes charges, records et routines seront repris.</span>
            </span>
            <Icon name="chevron" size={18} />
          </span>
        </Link>
      )}

      {session.active ? (
        <div className="card lg hero" style={{ margin: '24px 20px 0' }}>
          <h2 className="label">Séance en cours</h2>
          <span className="display" style={{ fontSize: 26 }}>{session.title}</span>
          <span className="small muted">{session.done} / {session.total} séries validées</span>
          <Link to="/seance" className="btn primary big"><Icon name="play" size={18} width={2.5} />Reprendre</Link>
        </div>
      ) : next ? (
        <div className="card lg hero" style={{ margin: '24px 20px 0' }}>
          <div className="stack" style={{ gap: 6 }}>
            <h2 className="label">Salle, à faire ensuite</h2>
            <span className="display" style={{ fontSize: 26 }}>{next.name}</span>
            <span className="small muted">{next.exercises.length} exercice{next.exercises.length > 1 ? 's' : ''}, {sets(next)} série{sets(next) > 1 ? 's' : ''}{next.last ? `, ${ago(next.last)}` : ''}</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {next.exercises.slice(0, 3).map((e) => (
              <div key={e.name} className="row" style={{ gap: 10, fontSize: 14 }}>
                <ExerciseImage name={e.name} size={36} radius={8} />
                <span className="grow">{e.name}</span>
                <span className="muted">{e.sets.filter((x) => x.type !== 'warmup').length} × {e.sets[e.sets.length - 1]?.reps ?? '?'}</span>
              </div>
            ))}
            {next.exercises.length > 3 && <span className="small muted">+ {next.exercises.length - 3} autre{next.exercises.length - 3 > 1 ? 's' : ''}</span>}
          </div>
          <button className="btn primary big" onClick={() => (next.id ? startRoutine(next) : startProgram(next.name))}><Icon name="play" size={18} width={2.5} />Démarrer</button>
        </div>
      ) : null}

      <div className="list home-links" style={{ margin: '12px 20px 0' }}>
        <Link to="/course" className="home-link">
          <span className="tile-icon k-run"><Icon name="run" size={20} /></span>
          <span className="grow stack" style={{ gap: 1, minWidth: 0 }}>
            <span className="xs muted">Course</span>
            <span className="ellipsis" style={{ fontWeight: 600 }}>{run ? (run.next ? `${run.next.title}, ${run.next.mins} min` : 'Plan terminé') : 'Créer mon plan'}</span>
          </span>
          {run?.next && (
            <span className="mini-run" aria-hidden="true">
              {segments(run.next).map((g, i) => <span key={i} className={`seg-${g.type}`} style={{ flexGrow: g.mins, height: `${Math.round(intensityOf(g.type) * 100)}%` }} />)}
            </span>
          )}
          <Icon name="chevron" size={18} />
        </Link>
        {last && (
          <Link to="/coach" className="home-link">
            <span className="tile-icon"><Icon name="spark" size={20} /></span>
            <span className="grow stack" style={{ gap: 1, minWidth: 0 }}>
              <span className="xs muted">Bilan, {ago(last.start)}</span>
              <span className="ellipsis" style={{ fontWeight: 600 }}>{last.title}</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        )}
      </div>

      <div className="section">
        <div className="between">
          <h2 className="label">Mes routines</h2>
          <Link to="/routines/nouvelle" className="small" style={{ fontWeight: 600 }}>+ Nouvelle</Link>
        </div>
        {routines.length ? routines.map((r) => (
          <div key={r.id} className="prog-item" style={{ padding: '10px 6px 10px 14px' }}>
            <Link to={`/routines/${r.id}`} className="grow stack" style={{ gap: 2, color: 'inherit', textDecoration: 'none' }} aria-label={`Modifier la routine ${r.name}`}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</span>
              <span className="xs muted">{r.exercises.length} exercice{r.exercises.length > 1 ? 's' : ''} · {r.last ? (sameDay(r.last, today) ? "faite aujourd'hui" : `dernière fois le ${fmtDay(r.last)}`) : 'jamais faite'}</span>
            </Link>
            <button className="icon-btn sq" aria-label={`Démarrer ${r.name}`} disabled={session.active} onClick={() => startRoutine(r)}><Icon name="play" size={18} width={2.5} /></button>
          </div>
        )) : (
          <div className="card">
            <span style={{ fontWeight: 600 }}>Pas encore de routine</span>
            <span className="small muted">{data.programs.length ? `À partir de tes séances habituelles : ${data.programs.map((p) => p.title).join(', ')}.` : 'Crée ta première routine.'}</span>
            {!!data.programs.length && <button className="btn primary" onClick={importFromHistory} disabled={busy}>{busy ? 'Création…' : 'Créer depuis mon historique'}</button>}
            <Link to="/routines/nouvelle" className="btn">Créer une routine vide</Link>
          </div>
        )}
      </div>

      {!session.active && (
        <div className="section">
          <button className="text-btn" onClick={() => { session.startEmpty(); nav('/seance'); }}>
            <Icon name="plus" size={16} />Séance libre
          </button>
        </div>
      )}
      <WorkoutSheet id={openW} onClose={() => setOpenW(null)} />
      <RunSheet id={openR} onClose={() => setOpenR(null)} />
    </main>
  );
}
