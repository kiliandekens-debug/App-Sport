import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, saveRoutine } from '../data.jsx';
import { useSession } from '../session.jsx';
import { fmtDay, fmtKg, sameDay, titleKey } from '../lib/stats.js';
import { routineFromHistory } from '../lib/routines.js';
import { Icon, ExerciseImage } from '../components.jsx';
import { buildPlan } from '../lib/running.js';

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

  const startRoutine = (r) => { session.startRoutine(r); nav('/seance'); };
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
      <div className="head">
        <span className="small muted" style={{ textTransform: 'capitalize' }}>{today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1 className="title">Salut {firstName(user)}</h1>
      </div>

      <div className="pad stack" style={{ paddingTop: 12, gap: 14 }}>
        <div className="week">
          {data.weekDays.map((d) => (
            <div key={d.date.toISOString()}>
              <span style={d.today ? { color: 'var(--text)', fontWeight: 700 } : null}>{d.letter}</span>
              <div className={`dot ${d.done ? 'on' : d.today ? 'today' : ''}`} aria-label={`${d.date.toLocaleDateString('fr-FR', { weekday: 'long' })} : ${d.done ? 'séance faite' : 'pas de séance'}`} />
            </div>
          ))}
        </div>
        {data.summary.sessions > 0 && (
          <div className="row" style={{ gap: 18, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <span><b className="display" style={{ color: 'var(--text)', fontSize: 17, marginRight: 5 }}>{data.week.sessions}</b>séance{data.week.sessions > 1 ? 's' : ''} cette semaine</span>
            <span><b className="display" style={{ color: 'var(--text)', fontSize: 17, marginRight: 5 }}>{fmtKg(data.week.kg / 1000)} t</b>soulevées</span>
            {data.week.streak > 1 && <span className="row" style={{ gap: 5, color: 'var(--ok)' }}><Icon name="flame" size={16} /><b className="display" style={{ fontSize: 17 }}>{data.week.streak}</b>semaines d'affilée</span>}
          </div>
        )}
      </div>

      {session.active ? (
        <div className="card lg hero" style={{ margin: '24px 20px 0' }}>
          <span className="label">Séance en cours</span>
          <span className="display" style={{ fontSize: 26 }}>{session.title}</span>
          <span className="small muted">{session.done} / {session.total} séries validées</span>
          <Link to="/seance" className="btn primary big"><Icon name="play" size={18} width={2.5} />Reprendre</Link>
        </div>
      ) : suggested ? (
        <div className="card lg hero" style={{ margin: '24px 20px 0' }}>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">À faire ensuite</span>
            <span className="display" style={{ fontSize: 26 }}>{suggested.name}</span>
            <span className="small muted">{suggested.exercises.length} exercices · {sets(suggested)} séries{suggested.last ? ` · dernière fois le ${fmtDay(suggested.last)}` : ''}</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {suggested.exercises.slice(0, 3).map((e) => (
              <div key={e.name} className="row" style={{ gap: 10, fontSize: 14 }}>
                <ExerciseImage name={e.name} size={36} radius={8} />
                <span className="grow">{e.name}</span>
                <span className="muted">{e.sets.filter((s) => s.type !== 'warmup').length} × {e.sets[e.sets.length - 1]?.reps ?? '?'}</span>
              </div>
            ))}
            {suggested.exercises.length > 3 && <span className="small muted">+ {suggested.exercises.length - 3} autres</span>}
          </div>
          <button className="btn primary big" onClick={() => startRoutine(suggested)}><Icon name="play" size={18} width={2.5} />Démarrer la routine</button>
        </div>
      ) : null}

      <Link to="/course" className="card row" style={{ margin: '14px 20px 0', flexDirection: 'row', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}>
        <Icon name="timer" size={22} />
        <span className="grow stack" style={{ gap: 1 }}>
          <span style={{ fontWeight: 600 }}>Course à pied</span>
          <span className="small muted">{run ? (run.next ? `Prochaine sortie : ${run.next.title.toLowerCase()}, ${run.next.mins} min` : 'Plan terminé') : 'Crée ton plan selon ton objectif'}</span>
        </span>
      </Link>

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
