import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession, mmss, num, prevOf } from '../session.jsx';
import { useUi } from '../ui.jsx';
import { onValidate } from './Seance.jsx';
import { useData } from '../data.jsx';
import { fmtKg, fmtInt } from '../lib/stats.js';
import { incrementOf } from '../lib/exercises.js';
import { Icon } from '../components.jsx';

// Compact view for a watch-sized screen: one piece of information at a time.
export default function Montre() {
  const s = useSession();
  const data = useData();
  const nav = useNavigate();
  const [field, setField] = useState('kg');
  const [summary, setSummary] = useState(null);
  const [saving, setSaving] = useState(false);
  const ui = useUi();

  const Frame = ({ children }) => (
    <div className="watch-wrap">
      <div className="stack" style={{ alignItems: 'center', gap: 12 }}>
        <div className="watch">{children}</div>
        <Link to={s.active ? '/seance' : '/'} className="xs muted">Quitter la vue montre</Link>
      </div>
    </div>
  );

  if (summary) {
    return (
      <Frame>
        <span className="xs accent" style={{ fontWeight: 600 }}>Séance terminée</span>
        <span className="display" style={{ fontSize: 16 }}>{summary.title}</span>
        {[['Durée', `${summary.minutes} min`], ['Volume', `${fmtInt(summary.volume)} kg`], ['Séries', summary.sets]].map(([k, v]) => (
          <div key={k} className="between"><span className="xs muted">{k}</span><span className="display" style={{ fontSize: 18, fontWeight: 600 }}>{v}</span></div>
        ))}
        <div className="grow" />
        <button className="btn primary" onClick={() => nav('/coach', { state: { summary } })}>Voir le bilan</button>
      </Frame>
    );
  }

  if (!s.active) {
    const next = data.nextProgram;
    return (
      <Frame>
        <span className="xs muted">Séance suggérée</span>
        <span className="display" style={{ fontSize: 18 }}>{next ? next.title : 'Aucune'}</span>
        <div className="grow" />
        {next && <button className="btn primary" onClick={() => s.start(next.title)}><Icon name="play" size={16} width={2.5} />Démarrer</button>}
      </Frame>
    );
  }

  const ex = s.exercise;

  if (s.resting) {
    const pct = s.restTotal ? s.restLeft / s.restTotal : 0;
    const c = 2 * Math.PI * 56;
    const nextSet = ex && s.activeSet >= 0 ? ex.sets[s.activeSet] : null;
    return (
      <Frame>
        <div style={{ position: 'relative', width: 128, height: 128, alignSelf: 'center' }}>
          <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`Repos restant ${mmss(s.restLeft)}`}>
            <circle cx="64" cy="64" r="56" fill="none" stroke="#2A1A0F" strokeWidth="10" />
            <circle cx="64" cy="64" r="56" fill="none" stroke="var(--rest)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 64 64)" style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10 }}>Repos</span>
            <span className="display" style={{ fontSize: 34, color: 'var(--rest)', lineHeight: 1 }}>{mmss(s.restLeft)}</span>
          </div>
        </div>
        <span className="xs muted" style={{ textAlign: 'center' }}>
          {nextSet ? `Ensuite : série ${s.activeSet + 1} · ${fmtKg(num(nextSet.kg))} × ${nextSet.reps}` : s.next ? `Ensuite : ${s.next.name}` : 'Dernière série faite'}
        </span>
        <div className="grid3" style={{ gap: 6, marginTop: 'auto' }}>
          <button className="btn" aria-label="Retirer 15 secondes" onClick={() => s.shiftRest(-15)}>−15</button>
          <button className="btn" aria-label="Ajouter 15 secondes" onClick={() => s.shiftRest(15)}>+15</button>
          <button className="btn light" aria-label="Passer le repos" onClick={s.skipRest}><Icon name="skip" size={16} width={2.5} /></button>
        </div>
      </Frame>
    );
  }

  if (!ex || s.activeSet < 0) {
    const remaining = s.exercises.map((e, i) => ({ e, i })).filter(({ e }) => e.sets.some((x) => !x.done));
    const end = async () => {
      setSaving(true);
      try { setSummary(await s.finish()); } catch (e) { ui.notify(`Échec de l'enregistrement : ${e.message || e}`); } finally { setSaving(false); }
    };
    return (
      <Frame>
        <span className="xs" style={{ fontWeight: 700, paddingLeft: 4 }}>{remaining.length ? 'Exercice suivant' : 'Tout est fait'}</span>
        <div className="stack" style={{ gap: 6, overflowY: 'auto', flex: 1 }}>
          {remaining.slice(0, 3).map(({ e, i }, k) => (
            <button key={e.name} className="btn" style={{ minHeight: 44, height: 'auto', borderRadius: 16, padding: '6px 10px', justifyContent: 'flex-start', textAlign: 'left', border: k === 0 ? '2px solid var(--accent)' : 'none' }} onClick={() => s.setCurrent(i)}>
              <span className="stack" style={{ gap: 1 }}>
                <span style={{ fontSize: 13 }}>{e.name}</span>
                <span className="muted" style={{ fontSize: 10, fontWeight: 400 }}>{e.sets.length} × {e.sets[0]?.reps || '?'}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={`btn ${remaining.length ? '' : 'primary'}`} onClick={end} disabled={saving}>{saving ? '…' : 'Terminer la séance'}</button>
      </Frame>
    );
  }

  const set = ex.sets[s.activeSet];
  const prev = prevOf(ex, s.activeSet);
  const kgShown = set.kg !== '' ? num(set.kg) : prev?.kg ?? 0;
  const repsShown = set.reps !== '' ? set.reps : prev?.reps ?? 0;
  const step = (d) => {
    if (field === 'kg') s.setSet(s.current, s.activeSet, { kg: String(Math.max(0, Math.round((num(kgShown) + d * incrementOf(ex.name)) * 10) / 10)).replace('.', ',') });
    else s.setSet(s.current, s.activeSet, { reps: String(Math.max(0, Math.round(num(repsShown)) + d)) });
  };
  const firstOfEx = !ex.sets.some((x) => x.done);

  return (
    <Frame>
      <div className="between xs"><span className="accent" style={{ fontWeight: 600 }}>{mmss(s.elapsed)}</span><span className="muted">{s.done}/{s.total}</span></div>
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{ex.name}</span>
      <span className="muted" style={{ fontSize: 11 }}>
        {firstOfEx && ex.plan ? `Coach : ${fmtKg(ex.plan.kg)} × ${ex.plan.reps}` : `Série ${s.activeSet + 1} / ${ex.sets.length}${prev ? ` · avant : ${fmtKg(prev.kg)} × ${prev.reps}` : ''}`}
      </span>
      <div className="grid2" style={{ gap: 6 }}>
        <button className={`cell ${field === 'kg' ? 'sel' : ''}`} style={{ color: 'inherit' }} onClick={() => setField('kg')} aria-pressed={field === 'kg'} aria-label={`Charge ${fmtKg(kgShown)} kilos`}>
          <span className="big">{fmtKg(kgShown)}</span><span className="muted" style={{ fontSize: 10 }}>kg</span>
        </button>
        <button className={`cell ${field === 'reps' ? 'sel' : ''}`} style={{ color: 'inherit' }} onClick={() => setField('reps')} aria-pressed={field === 'reps'} aria-label={`${repsShown} répétitions`}>
          <span className="big">{repsShown}</span><span className="muted" style={{ fontSize: 10 }}>reps</span>
        </button>
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
        <button className="step" aria-label={field === 'kg' ? 'Moins de charge' : 'Une rep de moins'} onClick={() => step(-1)}>−</button>
        <button className="step" aria-label={field === 'kg' ? 'Plus de charge' : 'Une rep de plus'} onClick={() => step(1)}>+</button>
      </div>
      <div className="grow" />
      <button className="btn primary" onClick={() => onValidate(s, ui, s.current, s.activeSet)}><Icon name="check" size={16} width={3} />Valider</button>
    </Frame>
  );
}
