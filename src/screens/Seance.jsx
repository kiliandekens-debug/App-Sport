import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession, mmss, num, SET_LABEL, SET_NAME, REST_OPTIONS } from '../session.jsx';
import { useData } from '../data.jsx';
import { fmtKg, fmtInt } from '../lib/stats.js';
import { Icon } from '../components.jsx';

const TYPE_COLOR = { warmup: '#F5C04A', dropset: '#B38CFF', failure: '#FF6B6B' };
const restLabel = (sec) => (sec ? mmss(sec) : 'Désactivé');

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
          <button className="btn primary" onClick={() => s.startEmpty()}>Démarrer une séance vide</button>
          <Link to="/">Retour à l'accueil</Link>
        </div>
      </main>
    );
  }

  const ex = s.exercise;
  const ei = s.current;

  const finish = async () => {
    if (s.done === 0) {
      if (!window.confirm('Aucune série validée. Abandonner la séance ?')) return;
      s.cancel();
      nav('/');
      return;
    }
    if (!window.confirm('Terminer et enregistrer la séance ?')) return;
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

  const rename = () => {
    const t = window.prompt('Nom de la séance', s.title);
    if (t && t.trim()) s.rename(t.trim());
  };

  const best = ex ? data.exercises.get(ex.name)?.best : null;
  const work = ex ? ex.sets.filter((x) => x.type !== 'warmup') : [];
  const target = work.length ? `${work.length} × ${work[0].reps || '?'}` : '';
  let workN = 0;

  return (
    <main className="screen wide" style={{ paddingBottom: 'calc(150px + env(safe-area-inset-bottom))' }}>
      <div className="split">
        <div className="panel">
          <div className="head-row">
            <Link to="/" aria-label="Réduire la séance" className="icon-btn only-narrow"><Icon name="down" /></Link>
            <button className="grow stack" style={{ gap: 2, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0 }} onClick={rename} aria-label={`Renommer la séance ${s.title}`}>
              <span className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Séance en cours</span>
              <span className="display" style={{ fontSize: 20 }}>{s.title}</span>
            </button>
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
            <span className="label">Exercices</span>
            {s.exercises.map((e, i) => {
              const w = e.sets.filter((x) => x.type !== 'warmup');
              const d = w.filter((x) => x.done).length;
              const full = e.sets.length > 0 && e.sets.every((x) => x.done);
              return (
                <button key={e.name} className={`prog-item ${i === ei ? 'cur' : ''}`} onClick={() => s.setCurrent(i)}>
                  <span className={`ring ${full ? 'full' : i === ei ? 'on' : ''}`}>{full && <Icon name="check" size={14} width={3} />}</span>
                  <span className="grow stack" style={{ gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: i === ei ? 600 : 400 }}>{e.name}</span>
                    <span className="xs muted">Repos {restLabel(e.rest)}{e.plan ? ` · coach : ${fmtKg(e.plan.kg)} kg × ${e.plan.reps}` : ''}</span>
                  </span>
                  <span className={`small ${i === ei ? 'accent' : 'muted'}`}>{d}/{w.length}</span>
                </button>
              );
            })}
            <Link to="/exercices" className="btn dashed" style={{ height: 52 }}><Icon name="plus" size={18} />Ajouter un exercice</Link>
          </div>
        </div>

        <div className="panel" style={{ paddingTop: 20 }}>
          {ex ? (
            <div className="card" style={{ margin: '0 20px' }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow stack" style={{ gap: 4 }}>
                  <span className="display" style={{ fontSize: 22, lineHeight: 1.15 }}>{ex.name}</span>
                  <span className="small muted">Objectif {target || '–'}{best ? ` · record ${fmtKg(best.kg)} kg × ${best.reps}` : ''}</span>
                  {ex.plan && <span className="xs accent">Coach : {ex.plan.reason}</span>}
                </div>
                <Link to="/exercices" aria-label="Ajouter ou changer d'exercice" className="icon-btn sq"><Icon name="swap" size={18} /></Link>
              </div>

              <label className="row" style={{ gap: 10, padding: '8px 12px', borderRadius: 12, background: 'var(--raised)' }}>
                <span style={{ color: 'var(--rest)' }}><Icon name="timer" size={18} /></span>
                <span className="grow small">Temps de repos</span>
                <select
                  aria-label={`Temps de repos pour ${ex.name}`}
                  value={ex.rest ?? 0}
                  onChange={(e) => s.setRest(ei, Number(e.target.value))}
                  style={{ background: 'transparent', border: 'none', color: 'var(--rest)', fontWeight: 700, fontSize: 15, textAlign: 'right' }}
                >
                  {REST_OPTIONS.map((o) => <option key={o} value={o}>{restLabel(o)}</option>)}
                </select>
              </label>

              <div className="sets-head"><span>Série</span><span>Précédent</span><span style={{ textAlign: 'center' }}>Kg</span><span style={{ textAlign: 'center' }}>Reps</span><span /></div>
              <div className="stack" style={{ gap: 6 }}>
                {ex.sets.map((x, i) => {
                  const type = x.type || 'normal';
                  const label = type === 'normal' ? String(++workN) : SET_LABEL[type];
                  const p = type === 'warmup'
                    ? ex.prev.filter((q) => q.type === 'warmup')[ex.sets.slice(0, i).filter((y) => y.type === 'warmup').length]
                    : ex.prev.filter((q) => q.type !== 'warmup')[ex.sets.slice(0, i).filter((y) => y.type !== 'warmup').length];
                  const prev = p ? `${fmtKg(p.kg)} × ${p.reps}` : '–';
                  const typeBtn = (
                    <button
                      className="n"
                      onClick={() => s.cycleType(ei, i)}
                      aria-label={`Série ${i + 1}, ${SET_NAME[type]}. Changer le type`}
                      style={{ height: 40, borderRadius: 10, border: 'none', background: 'transparent', color: TYPE_COLOR[type] || 'inherit', fontWeight: 700, fontSize: 15 }}
                    >{label}</button>
                  );
                  if (x.done) {
                    return (
                      <div key={i} className="set-row done">
                        {typeBtn}<span className="muted small">{prev}</span>
                        <span className="c">{fmtKg(num(x.kg))}</span><span className="c">{x.reps}</span>
                        <button className="check" aria-label={`Annuler la validation de la série ${i + 1}`} onClick={() => s.unvalidate(ei, i)}><Icon name="check" size={18} width={2.5} /></button>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className={`set-row ${i === s.activeSet ? 'active' : 'pending'}`}>
                      {typeBtn}<span className="muted small">{prev}</span>
                      <input aria-label={`Charge en kg, série ${i + 1}`} inputMode="decimal" value={x.kg} placeholder={p ? fmtKg(p.kg) : 'kg'} onChange={(e) => s.setSet(ei, i, { kg: e.target.value })} />
                      <input aria-label={`Répétitions, série ${i + 1}`} inputMode="numeric" value={x.reps} placeholder={p ? String(p.reps) : 'reps'} onChange={(e) => s.setSet(ei, i, { reps: e.target.value })} />
                      <button className="check outline" aria-label={`Valider la série ${i + 1}`} onClick={() => s.validate(ei, i)}><Icon name="check" size={18} width={2.5} /></button>
                    </div>
                  );
                })}
              </div>
              <span className="xs muted">Touche le numéro d'une série pour la passer en échauffement (É), dégressive (D) ou échec (F).</span>
              <div className="grid2">
                <button className="btn dashed" onClick={() => s.addSet(ei)}>+ Série</button>
                <button className="btn dashed" onClick={() => s.removeLastSet(ei)} disabled={!ex.sets.length}>− Dernière série</button>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="icon-btn sq" aria-label="Monter l'exercice" onClick={() => s.moveExercise(ei, -1)} disabled={ei === 0}><Icon name="up" size={18} /></button>
                <button className="icon-btn sq" aria-label="Descendre l'exercice" onClick={() => s.moveExercise(ei, 1)} disabled={ei === s.exercises.length - 1}><Icon name="down" size={18} /></button>
                <div className="grow" />
                <button className="btn" style={{ background: 'transparent', color: '#FF8A8A', fontWeight: 500, fontSize: 14 }} onClick={() => { if (window.confirm(`Retirer ${ex.name} de la séance ?`)) s.removeExercise(ei); }}>
                  <Icon name="trash" size={16} />Retirer l'exercice
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ margin: '0 20px' }}>
              <span className="display" style={{ fontSize: 20 }}>Séance vide</span>
              <span className="small muted">Ajoute tes exercices un par un, comme dans Hevy. Tes dernières charges sont reprises automatiquement.</span>
              <Link to="/exercices" className="btn primary big"><Icon name="plus" size={18} width={2.5} />Ajouter un exercice</Link>
            </div>
          )}

          {ex && s.next && (
            <div className="row" style={{ margin: '12px 20px 0', padding: '14px 16px', borderRadius: 16, background: 'var(--card)' }}>
              <span className="icon-btn sq muted"><Icon name="next" /></span>
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="xs muted">Ensuite</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.next.name}</span>
              </div>
              <span className="small muted">{s.next.sets.filter((x) => x.type !== 'warmup').length} × {s.next.sets[s.next.sets.length - 1]?.reps || '?'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="dock">
        <div className="dock-in">
          {s.resting ? (
            <>
              <div className="progress"><div style={{ width: `${s.restTotal ? Math.round((s.restLeft / s.restTotal) * 100) : 0}%` }} /></div>
              <div className="row" style={{ gap: 10 }}>
                <button className="rest-btn" aria-label="Retirer 15 secondes" onClick={() => s.shiftRest(-15)}>−15</button>
                <div className="grow stack" style={{ alignItems: 'center', gap: 0 }}>
                  <span className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Repos</span>
                  <span className="rest-num" aria-live="off">{mmss(s.restLeft)}</span>
                </div>
                <button className="rest-btn" aria-label="Ajouter 15 secondes" onClick={() => s.shiftRest(15)}>+15</button>
                <button className="btn light" style={{ height: 52, borderRadius: 14 }} onClick={s.skipRest}>Passer</button>
              </div>
            </>
          ) : ex && s.activeSet >= 0 ? (
            <div className="row">
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="xs muted">À toi · {ex.name}</span>
                <span className="display" style={{ fontSize: 22 }}>{ex.sets[s.activeSet].kg ? fmtKg(num(ex.sets[s.activeSet].kg)) : '?'} kg × {ex.sets[s.activeSet].reps || '?'}</span>
              </div>
              <button className="btn primary" style={{ height: 56, borderRadius: 16, padding: '0 24px', fontSize: 16 }} onClick={() => s.validate(ei, s.activeSet)}>Valider</button>
            </div>
          ) : (
            <div className="row">
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="xs accent" style={{ fontWeight: 600 }}>{ex ? 'Exercice terminé' : 'Séance vide'}</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.next ? `Prochain : ${s.next.name}` : ex ? 'Ajoute un exercice ou termine' : 'Ajoute ton premier exercice'}</span>
              </div>
              {s.next
                ? <button className="btn" style={{ height: 52, borderRadius: 14 }} onClick={() => s.setCurrent(s.exercises.indexOf(s.next))}>Suivant</button>
                : <Link to="/exercices" className="btn" style={{ height: 52, borderRadius: 14 }}>+ Exercice</Link>}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
