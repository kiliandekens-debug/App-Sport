import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, saveRoutine } from '../data.jsx';
import { useSession } from '../session.jsx';
import { fmtDay, fmtKg, fmtInt, sameDay, titleKey, isWork, isPlausible } from '../lib/stats.js';
import { routineFromHistory } from '../lib/routines.js';
import { Icon, ExerciseImage, GlassHeader } from '../components.jsx';
import { buildPlan, segments, intensityOf } from '../lib/running.js';

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

  // Last time each routine was done, matched on the session title.
  const lastDone = (name) => data.workouts.find((w) => titleKey(w.title) === titleKey(name))?.start || null;
  const routines = data.routines.map((r) => ({ ...r, last: lastDone(r.name) }));
  const suggested = routines.length
    ? [...routines].sort((a, b) => (a.last?.getTime() || 0) - (b.last?.getTime() || 0))[0]
    : null;
  // Without routines, the next session is guessed from the usual rotation in the history.
  const fromHistory = !suggested && data.nextProgram
    ? { ...routineFromHistory(data, data.nextProgram.title), name: data.nextProgram.title, last: data.nextProgram.last }
    : null;
  const next = suggested || fromHistory;
  const last = data.workouts[0] || null;
  const lastWork = last ? last.sets.filter((x) => isWork(x) && isPlausible(x)) : [];
  const runDays = data.runLogs.map((l) => new Date(l.done_at));
  const weekDays = data.weekDays.map((d) => ({ ...d, run: runDays.some((r) => sameDay(r, d.date)) }));
  const weekKm = data.runLogs.filter((l) => new Date(l.done_at) >= weekDays[0].date).reduce((a, l) => a + Number(l.distance_km || 0), 0);

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
          {weekDays.map((d) => (
            <div key={d.date.toISOString()}>
              <span style={d.today ? { color: 'var(--text)', fontWeight: 700 } : null}>{d.letter}</span>
              <div className={`dot ${d.done ? 'on' : d.run ? 'run-only' : d.today ? 'today' : ''}`} aria-label={`${d.date.toLocaleDateString('fr-FR', { weekday: 'long' })} : ${[d.done && 'salle', d.run && 'course'].filter(Boolean).join(' et ') || 'rien'}`}>
                {d.run && <span className="dot-run" aria-hidden="true" />}
              </div>
            </div>
          ))}
        </div>
        {(data.summary.sessions > 0 || weekKm > 0) && (
          <div className="row week-stats">
            {(data.week.sessions > 0 || !weekKm) && <span><b className="display">{data.week.sessions}</b>séance{data.week.sessions > 1 ? 's' : ''} de salle</span>}
            {data.week.kg > 0 && <span><b className="display">{fmtKg(data.week.kg / 1000)} t</b>soulevées</span>}
            {weekKm > 0 && <span><b className="display">{fmtKg(weekKm)} km</b>courus</span>}
            {data.week.streak > 1 && <span className="row" style={{ gap: 5, color: 'var(--ok)' }}><Icon name="flame" size={16} /><b className="display" style={{ color: 'var(--ok)' }}>{data.week.streak}</b>semaines d'affilée</span>}
          </div>
        )}
      </div>

      {!data.workouts.length && !session.active && (
        <Link to="/profil" className="card tile" style={{ margin: '20px 20px 0' }}>
          <span className="row" style={{ gap: 10 }}>
            <span className="tile-icon" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><Icon name="upload" size={20} /></span>
            <span className="grow stack" style={{ gap: 2 }}>
              <span style={{ fontWeight: 650 }}>Importe ton historique Hevy</span>
              <span className="xs muted">Dans Hevy : Profil, Réglages, Exporter les données. Puis ici : Profil, Importer. Tes charges, records et routines seront repris.</span>
            </span>
            <Icon name="chevron" size={18} />
          </span>
        </Link>
      )}

      {session.active ? (
        <div className="card lg hero" style={{ margin: '24px 20px 0' }}>
          <span className="label">Séance en cours</span>
          <span className="display" style={{ fontSize: 26 }}>{session.title}</span>
          <span className="small muted">{session.done} / {session.total} séries validées</span>
          <Link to="/seance" className="btn primary big"><Icon name="play" size={18} width={2.5} />Reprendre</Link>
        </div>
      ) : next ? (
        <div className="card lg hero" style={{ margin: '24px 20px 0' }}>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Salle, à faire ensuite</span>
            <span className="display" style={{ fontSize: 26 }}>{next.name}</span>
            <span className="small muted">{next.exercises.length} exercices, {sets(next)} séries{next.last ? `, ${ago(next.last)}` : ''}</span>
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

      <Link to="/course" className="card tile" style={{ margin: '12px 20px 0' }}>
        <span className="row" style={{ gap: 10 }}>
          <span className="tile-icon"><Icon name="timer" size={20} /></span>
          <span className="grow stack" style={{ gap: 1 }}>
            <span className="xs muted">Course à pied</span>
            <span style={{ fontWeight: 600 }}>{run ? (run.next ? `${run.next.title}, ${run.next.mins} min` : 'Plan terminé') : 'Crée ton plan de course'}</span>
          </span>
          <Icon name="chevron" size={18} />
        </span>
        {run?.next && (
          <span className="mini-run" aria-hidden="true">
            {segments(run.next).map((g, i) => <span key={i} className={`seg-${g.type}`} style={{ flexGrow: g.mins, height: `${Math.round(intensityOf(g.type) * 100)}%` }} />)}
          </span>
        )}
      </Link>

      {last && (
        <Link to="/coach" className="card tile" style={{ margin: '12px 20px 0' }}>
          <span className="row" style={{ gap: 10 }}>
            <span className="tile-icon"><Icon name="spark" size={20} /></span>
            <span className="grow stack" style={{ gap: 1 }}>
              <span className="xs muted">Dernière séance, {ago(last.start)}</span>
              <span style={{ fontWeight: 600 }}>{last.title}</span>
              <span className="xs muted">{lastWork.length} séries, {fmtInt(lastWork.reduce((a, x) => a + x.weight_kg * x.reps, 0))} kg. Voir le bilan du coach</span>
            </span>
            <Icon name="chevron" size={18} />
          </span>
        </Link>
      )}

      <div className="section">
        <div className="between">
          <span className="label">Mes routines</span>
          <Link to="/routines/nouvelle" className="small" style={{ fontWeight: 600 }}>+ Nouvelle</Link>
        </div>
        {routines.length ? routines.map((r) => (
          <div key={r.id} className="prog-item" style={{ padding: '10px 6px 10px 14px' }}>
            <Link to={`/routines/${r.id}`} className="grow stack" style={{ gap: 2, color: 'inherit', textDecoration: 'none' }} aria-label={`Modifier la routine ${r.name}`}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</span>
              <span className="xs muted">{r.exercises.length} exercices · {r.last ? (sameDay(r.last, today) ? "faite aujourd'hui" : `dernière fois le ${fmtDay(r.last)}`) : 'jamais faite'}</span>
            </Link>
            <button className="icon-btn sq" aria-label={`Démarrer ${r.name}`} disabled={session.active} onClick={() => startRoutine(r)}><Icon name="play" size={18} width={2.5} /></button>
          </div>
        )) : (
          <div className="card">
            <span style={{ fontWeight: 600 }}>Pas encore de routine</span>
            <span className="small muted">Je peux créer tes routines à partir de tes séances habituelles ({data.programs.map((p) => p.title).join(', ') || 'aucune pour l\'instant'}). Tu pourras ensuite les modifier.</span>
            {!!data.programs.length && <button className="btn primary" onClick={importFromHistory} disabled={busy}>{busy ? 'Création…' : 'Créer depuis mon historique'}</button>}
            <Link to="/routines/nouvelle" className="btn">Créer une routine vide</Link>
          </div>
        )}
      </div>

      {!session.active && (
        <div className="section">
          <button className="btn dashed" style={{ height: 52, borderRadius: 14 }} onClick={() => { session.startEmpty(); nav('/seance'); }}>
            <Icon name="plus" size={18} />Démarrer une séance vide
          </button>
        </div>
      )}
    </main>
  );
}
