import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession, mmss, num } from '../session.jsx';
import { useData } from '../data.jsx';
import { fmtKg, fmtInt } from '../lib/stats.js';
import { Icon } from '../components.jsx';

export default function Seance() {
  const s = useSession();
  const data = useData();
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  if (!s.active) {
    return (
      <main className="screen">
        <div className="center">
          <span className="title-s">Aucune séance en cours</span>
          <Link to="/" className="btn primary">Retour à l'accueil</Link>
        </div>
      </main>
    );
  }

  const ex = s.exercise;
  const finish = async () => {
    if (s.done === 0 && !window.confirm('Aucune série validée. Abandonner la séance ?')) return;
    setSaving(true);
    setErr('');
    try {
      const summary = await s.finish();
      nav('/coach', { state: { summary } });
    } catch (e) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  };

  const best = ex ? data.exercises.get(ex.name)?.best : null;
  const target = ex && ex.sets.length ? `${ex.sets.length} × ${ex.sets[0].reps || '?'}` : '';

  return (
    <main className="screen wide" style={{ paddingBottom: 'calc(140px + env(safe-area-inset-bottom))' }}>
      <div className="split">
        <div className="panel">
          <div className="head-row">
            <Link to="/" aria-label="Retour à l'accueil" className="icon-btn only-narrow"><Icon name="down" /></Link>
            <div className="grow stack" style={{ gap: 2 }}>
              <span className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Séance en cours</span>
              <span className="display" style={{ fontSize: 20 }}>{s.title}</span>
            </div>
            <Link to="/montre" aria-label="Vue montre" className="icon-btn"><Icon name="watch" /></Link>
            <button className="btn primary" onClick={finish} disabled={saving}>{saving ? '…' : 'Terminer'}</button>
          </div>
          {err && <p className="pad small" style={{ color: '#FF8A8A' }}>{err}</p>}

          <div className="grid3 pad" style={{ paddingBottom: 16 }}>
            <div className="tile"><span className="xs muted">Durée</span><span className="v accent">{mmss(s.elapsed)}</span></div>
            <div className="tile"><span className="xs muted">Volume</span><span className="v">{fmtInt(s.volume)} kg</span></div>
            <div className="tile"><span className="xs muted">Séries</span><span className="v">{s.done}<span className="muted" style={{ fontSize: 14 }}> / {s.total}</span></span></div>
          </div>

          <div className="pad stack" style={{ gap: 6 }}>
            <span className="label">Programme</span>
            {s.exercises.map((e, i) => {
              const d = e.sets.filter((x) => x.done).length;
              const full = d === e.sets.length && d > 0;
              return (
                <button key={e.name} className={`prog-item ${i === s.current ? 'cur' : ''}`} onClick={() => s.setCurrent(i)}>
                  <span className={`ring ${full ? 'full' : i === s.current ? 'on' : ''}`}>{full && <Icon name="check" size={14} width={3} />}</span>
                  <span className="grow stack" style={{ gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: i === s.current ? 600 : 400 }}>{e.name}</span>
                    {e.plan && <span className="tag" style={{ alignSelf: 'flex-start' }}>Coach : {fmtKg(e.plan.kg)} kg × {e.plan.reps}</span>}
                  </span>
                  <span className={`small ${i === s.current ? 'accent' : 'muted'}`}>{d}/{e.sets.length}</span>
                </button>
              );
            })}
            <Link to="/exercices" className="btn dashed" style={{ height: 48 }}>+ Ajouter un exercice</Link>
          </div>
        </div>

        <div className="panel" style={{ paddingTop: 20 }}>
          {ex ? (
            <div className="card" style={{ margin: '0 20px' }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow stack" style={{ gap: 4 }}>
                  <span className="display" style={{ fontSize: 22, lineHeight: 1.15 }}>{ex.name}</span>
                  <span className="small muted">
                    Objectif {target} · repos {mmss(s.restTotal)}{best ? ` · record ${fmtKg(best.kg)} kg × ${best.reps}` : ''}
                  </span>
                  {ex.plan && <span className="xs accent">{ex.plan.reason}</span>}
                </div>
                <Link to="/exercices" aria-label="Changer d'exercice" className="icon-btn sq"><Icon name="swap" size={18} /></Link>
              </div>
              <div className="sets-head"><span>Série</span><span>Précédent</span><span style={{ textAlign: 'center' }}>Kg</span><span style={{ textAlign: 'center' }}>Reps</span><span /></div>
              <div className="stack" style={{ gap: 6 }}>
                {ex.sets.map((x, i) => {
                  const p = ex.prev[i];
                  const prev = p ? `${fmtKg(p.kg)} × ${p.reps}` : '–';
                  if (x.done) {
                    return (
                      <div key={i} className="set-row done">
                        <span className="n">{i + 1}</span><span className="muted small">{prev}</span>
                        <span className="c">{fmtKg(num(x.kg))}</span><span className="c">{x.reps}</span>
                        <button className="check" aria-label={`Annuler la validation de la série ${i + 1}`} onClick={() => s.unvalidate(s.current, i)}><Icon name="check" size={18} width={2.5} /></button>
                      </div>
                    );
                  }
                  const active = i === s.activeSet;
                  return (
                    <div key={i} className={`set-row ${active ? 'active' : 'pending'}`}>
                      <span className="n">{i + 1}</span><span className="muted small">{prev}</span>
                      <input aria-label={`Charge en kg, série ${i + 1}`} inputMode="decimal" value={x.kg} onChange={(e) => s.setSet(s.current, i, { kg: e.target.value })} />
                      <input aria-label={`Répétitions, série ${i + 1}`} inputMode="numeric" value={x.reps} onChange={(e) => s.setSet(s.current, i, { reps: e.target.value })} />
                      <button className="check outline" aria-label={`Valider la série ${i + 1}`} onClick={() => s.validate(s.current, i)}><Icon name="check" size={18} width={2.5} /></button>
                    </div>
                  );
                })}
              </div>
              <button className="btn dashed" onClick={() => s.addSet(s.current)}>+ Ajouter une série</button>
            </div>
          ) : (
            <div className="card" style={{ margin: '0 20px' }}>
              <span>Pas encore d'exercice dans cette séance.</span>
              <Link to="/exercices" className="btn primary">Choisir un exercice</Link>
            </div>
          )}

          {s.next && (
            <div className="row" style={{ margin: '12px 20px 0', padding: '14px 16px', borderRadius: 16, background: 'var(--card)' }}>
              <span className="icon-btn sq muted"><Icon name="next" /></span>
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="xs muted">Ensuite</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.next.name}</span>
              </div>
              <span className="small muted">{s.next.sets.length} × {s.next.sets[0]?.reps || '?'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="dock">
        <div className="dock-in">
          {s.resting ? (
            <>
              <div className="progress"><div style={{ width: `${Math.round((s.restLeft / s.restTotal) * 100)}%` }} /></div>
              <div className="row" style={{ gap: 10 }}>
                <button className="rest-btn" aria-label="Retirer 15 secondes" onClick={() => s.shiftRest(-15)}>−15</button>
                <div className="grow stack" style={{ alignItems: 'center', gap: 0 }}>
                  <span className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Repos</span>
                  <span className="rest-num">{mmss(s.restLeft)}</span>
                </div>
                <button className="rest-btn" aria-label="Ajouter 15 secondes" onClick={() => s.shiftRest(15)}>+15</button>
                <button className="btn light" style={{ height: 52, borderRadius: 14 }} onClick={s.skipRest}>Passer</button>
              </div>
            </>
          ) : ex && s.activeSet >= 0 ? (
            <div className="row">
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="xs muted">À toi · série {s.activeSet + 1}</span>
                <span className="display" style={{ fontSize: 22 }}>{fmtKg(num(ex.sets[s.activeSet].kg))} kg × {ex.sets[s.activeSet].reps || '?'}</span>
              </div>
              <button className="btn primary" style={{ height: 56, borderRadius: 16, padding: '0 24px', fontSize: 16 }} onClick={() => s.validate(s.current, s.activeSet)}>Valider</button>
            </div>
          ) : (
            <div className="row">
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="xs accent" style={{ fontWeight: 600 }}>{ex ? 'Exercice terminé' : 'Séance vide'}</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.next ? `Prochain : ${s.next.name}` : 'Tout est fait, tu peux terminer'}</span>
              </div>
              {ex && <button className="btn" style={{ height: 52, borderRadius: 14 }} onClick={() => s.addSet(s.current)}>+ Série</button>}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
