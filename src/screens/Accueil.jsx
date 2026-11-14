import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../data.jsx';
import { useSession } from '../session.jsx';
import { templateFor, fmtDay, sameDay } from '../lib/stats.js';
import { Icon } from '../components.jsx';

const firstName = (user) => {
  const n = user?.user_metadata?.name || '';
  return n.split(' ')[0] || 'Kilian';
};

export default function Accueil({ user }) {
  const data = useData();
  const session = useSession();
  const nav = useNavigate();
  const today = new Date();
  const next = data.nextProgram;
  const tpl = next ? templateFor(data, next.title) : [];
  const nSets = tpl.reduce((a, e) => a + e.sets.filter((s) => s.set_type !== 'warmup').length, 0);
  const lastOfNext = next ? data.workouts.find((w) => w.title === next.title) : null;
  const minutes = lastOfNext?.end ? Math.round((lastOfNext.end - lastOfNext.start) / 60000) : null;

  const start = (title) => { session.start(title); nav('/seance'); };

  return (
    <main className="screen">
      <div className="head">
        <span className="small muted" style={{ textTransform: 'capitalize' }}>{today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1 className="title">Salut {firstName(user)}</h1>
      </div>

      <div className="pad stack" style={{ paddingTop: 12 }}>
        <span className="label">Cette semaine</span>
        <div className="week">
          {data.weekDays.map((d) => (
            <div key={d.letter + d.date.getDate()}>
              <span style={d.today ? { color: 'var(--text)', fontWeight: 700 } : null}>{d.letter}</span>
              <div className={`dot ${d.done ? 'on' : d.today ? 'today' : ''}`} aria-label={`${d.date.toLocaleDateString('fr-FR', { weekday: 'long' })} : ${d.done ? 'séance faite' : 'pas de séance'}`} />
            </div>
          ))}
        </div>
      </div>

      {session.active ? (
        <div className="card lg" style={{ margin: '24px 20px 0' }}>
          <span className="label accent" style={{ fontWeight: 600 }}>Séance en cours</span>
          <span className="display" style={{ fontSize: 26 }}>{session.title}</span>
          <span className="small muted">{session.done} / {session.total} séries validées</span>
          <Link to="/seance" className="btn primary big"><Icon name="play" size={18} width={2.5} />Reprendre</Link>
        </div>
      ) : next ? (
        <div className="card lg" style={{ margin: '24px 20px 0' }}>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label accent" style={{ fontWeight: 600 }}>Séance suggérée</span>
            <span className="display" style={{ fontSize: 26 }}>{next.title}</span>
            <span className="small muted">{tpl.length} exercices · {nSets} séries{minutes ? ` · environ ${minutes} min` : ''}</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {tpl.slice(0, 3).map((e) => {
              const n = e.sets.filter((s) => s.set_type !== 'warmup');
              const reps = n.length ? Math.max(...n.map((s) => s.reps || 0)) : 0;
              return <div key={e.name} className="between" style={{ fontSize: 14 }}><span>{e.name}</span><span className="muted">{n.length} × {reps}</span></div>;
            })}
            {tpl.length > 3 && <span className="small muted">+ {tpl.length - 3} autres</span>}
          </div>
          <button className="btn primary big" onClick={() => start(next.title)}><Icon name="play" size={18} width={2.5} />Démarrer la séance</button>
        </div>
      ) : (
        <div className="card lg" style={{ margin: '24px 20px 0' }}>
          <span className="display" style={{ fontSize: 22 }}>Aucune séance pour l'instant</span>
          <span className="small muted">Importe ton historique depuis le profil, ou démarre une séance libre.</span>
          <Link to="/profil" className="btn primary big">Importer mon historique</Link>
        </div>
      )}

      {!!data.programs.length && (
        <div className="section">
          <span className="label">Mon programme</span>
          {data.programs.filter((p) => p.title !== next?.title || session.active).map((p) => (
            <button key={p.title} className="prog-item" disabled={session.active} onClick={() => start(p.title)}>
              <span className="grow stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{p.title}</span>
                <span className="xs muted">Dernière fois : {sameDay(p.last, today) ? "aujourd'hui" : fmtDay(p.last)} · {p.count} fois en 4 mois</span>
              </span>
              <span className="muted"><Icon name="chevron" size={18} /></span>
            </button>
          ))}
        </div>
      )}

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
