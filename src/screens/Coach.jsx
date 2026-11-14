import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useData, savePlan } from '../data.jsx';
import { reviewLastSession, weeklyFacts } from '../lib/coach.js';
import { fmtKg, fmtInt, fmtDay, sameDay } from '../lib/stats.js';
import { Icon } from '../components.jsx';

export default function Coach() {
  const data = useData();
  const { state } = useLocation();
  const review = useMemo(() => reviewLastSession(data), [data]);
  const facts = useMemo(() => weeklyFacts(data), [data]);
  const [answers, setAnswers] = useState({});
  const [applied, setApplied] = useState(false);
  const [err, setErr] = useState('');

  if (!review) {
    return (
      <main className="screen"><div className="center"><span className="title-s">Le coach attend ta première séance</span></div></main>
    );
  }

  const w = review.workout;
  const when = sameDay(w.start, new Date()) ? "d'aujourd'hui" : `du ${fmtDay(w.start)}`;

  const planned = review.items
    .map((it) => {
      if (it.kind !== 'question') return { name: it.name, ...it.plan };
      const a = answers[it.name];
      return a ? { name: it.name, ...it.replies[a].plan } : { name: it.name, pending: true };
    });

  const apply = async () => {
    setErr('');
    try {
      for (const p of planned.filter((x) => !x.pending)) {
        await savePlan(p.name, { target_kg: p.target_kg, target_reps: p.target_reps, reason: p.reason });
      }
      await data.refresh();
      setApplied(true);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <main className="screen wide">
      <div className="head-row" style={{ borderBottom: '1px solid var(--chip)', paddingTop: 24 }}>
        <span className="icon-btn accent"><Icon name="spark" size={22} /></span>
        <div className="grow stack" style={{ gap: 2 }}>
          <h1 className="title-s">Coach</h1>
          <span className="xs muted">Bilan de la séance {when} · {w.title}</span>
        </div>
      </div>

      <div className="split" style={{ paddingTop: 16 }}>
        <div className="panel pad stack" style={{ gap: 12 }}>
          {state?.summary && (
            <div className="card" style={{ border: '1px solid #3B4A17', background: 'var(--done)' }}>
              <span className="row" style={{ gap: 8, fontWeight: 700, color: 'var(--ok)' }}><Icon name="check" size={18} width={3} />Séance enregistrée</span>
              <span className="display" style={{ fontSize: 22 }}>{state.summary.title}</span>
              <div className="session-stats" style={{ padding: 0 }}>
                <span><b>{state.summary.minutes}</b>min</span>
                <span><b>{fmtInt(state.summary.volume)}</b>kg</span>
                <span><b>{state.summary.sets}</b>séries</span>
              </div>
            </div>
          )}
          <div className="bubble">
            {review.totalSets} séries, {fmtInt(review.volume)} kg soulevés.
            {review.items.some((i) => i.kind === 'question') ? ' Une chose m\'intrigue.' : ' Voici ce que je propose pour la suite.'}
          </div>

          {review.items.filter((i) => i.kind === 'question').map((it) => (
            <div key={it.name} className="stack" style={{ gap: 12 }}>
              <div className="bubble">
                <span>{it.text}</span>
                <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 56 }} role="img" aria-label={`Charge : ${fmtKg(it.before)} kg avant, ${fmtKg(it.now)} kg cette fois`}>
                  <div className="grow stack" style={{ alignItems: 'center', gap: 4 }}><div style={{ width: '100%', height: 44, borderRadius: 6, background: 'var(--border)' }} /><span className="xs muted">Avant</span></div>
                  <div className="grow stack" style={{ alignItems: 'center', gap: 4 }}><div style={{ width: '100%', height: Math.max(6, 44 * (it.now / it.before)), borderRadius: 6, background: 'var(--rest-fill)' }} /><span className="xs muted">Cette fois</span></div>
                </div>
              </div>
              {answers[it.name] ? (
                <>
                  <div className="bubble me">{answers[it.name]}</div>
                  <div className="bubble">{it.replies[answers[it.name]].reply}</div>
                </>
              ) : (
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {Object.keys(it.replies).map((k) => (
                    <button key={k} className="reply" onClick={() => setAnswers({ ...answers, [it.name]: k })}>{k}</button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {facts.map((f) => <div key={f} className="bubble">{f}</div>)}
          <span className="xs muted">Les conseils viennent de règles simples appliquées à ton historique (double progression), pas d'une IA en ligne.</span>
        </div>

        <div className="panel pad" style={{ paddingTop: 0 }}>
          <div className="card" style={{ outline: '1px solid #2A2A2E', marginTop: 12 }}>
            <div className="between">
              <span className="display" style={{ fontSize: 17 }}>Prochaine fois · {w.title}</span>
              <span className="xs muted">Proposé</span>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {planned.map((p) => (
                <div key={p.name} className="stack" style={{ gap: 2 }}>
                  <div className="between" style={{ fontSize: 14 }}>
                    <span>{p.name}</span>
                    <span style={{ fontWeight: 700 }} className={p.pending ? 'muted' : 'accent'}>{p.pending ? 'En attente' : `${fmtKg(p.target_kg)} kg × ${p.target_reps}`}</span>
                  </div>
                  <span className="xs muted">{p.pending ? 'Réponds à la question à gauche' : p.reason}</span>
                </div>
              ))}
            </div>
            <button className={`btn big ${applied ? '' : 'primary'}`} style={{ height: 48, borderRadius: 14, fontSize: 15, color: applied ? 'var(--ok)' : undefined, background: applied ? 'var(--done)' : undefined }} onClick={apply} disabled={applied}>
              {applied ? 'Ajouté au programme' : 'Appliquer à la prochaine séance'}
            </button>
            {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
          </div>
        </div>
      </div>
    </main>
  );
}
