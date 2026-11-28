import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useData, savePlan } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { reviewLastSession } from '../lib/coach.js';
import { hasLest } from '../session.jsx';
import { fmtKg, fmtInt, fmtDay, sameDay, titleKey, isWork, isPlausible, volumeOf as volumeOfSets } from '../lib/stats.js';
import { incrementOf, exLabel } from '../lib/exercises.js';
import { Icon, ExerciseImage, GlassHeader } from '../components.jsx';
import { SessionAnalysis } from '../analysis.jsx';
import { ShareSheet } from '../social.jsx';

const KIND = {
  up: ['Charge en hausse', 'var(--done)', 'var(--ok)'],
  hold: ['Même charge', 'var(--chip)', 'var(--soft)'],
  question: ['À vérifier', 'var(--warn-bg)', 'var(--warm)'],
};

const volumeOf = (w) => volumeOfSets(w.sets);

function setsText(sets) {
  if (!sets.length) return '';
  const same = sets.every((s) => s.weight_kg === sets[0].weight_kg);
  return same
    ? `${fmtKg(sets[0].weight_kg)} kg × ${sets.map((s) => s.reps).join(', ')}`
    : sets.map((s) => `${fmtKg(s.weight_kg)} × ${s.reps}`).join(', ');
}

function Stepper({ label, value, unit, name, onStep }) {
  const btn = { width: 36, flexShrink: 0, height: 44, background: 'var(--card)', border: '1px solid var(--line)' };
  return (
    <div className="row" style={{ gap: 4, padding: 4, borderRadius: 12, background: 'var(--raised)' }}>
      <button className="icon-btn" style={btn} aria-label={`Moins de ${label} sur ${name}`} onClick={() => onStep(-1)}><Icon name="minus" size={16} /></button>
      <div className="grow stack" style={{ gap: 0, alignItems: 'center', minWidth: 0 }}>
        <span className="display" style={{ fontSize: String(value).length > 4 ? 19 : 22, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>{value}{unit && <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2 }}>{unit}</span>}</span>
        <span className="xs muted">{label}</span>
      </div>
      <button className="icon-btn" style={btn} aria-label={`Plus de ${label} sur ${name}`} onClick={() => onStep(1)}><Icon name="plus" size={16} /></button>
    </div>
  );
}

// One line per exercise: what was done, what to do next time, adjustable in place.
export default function Coach() {
  const data = useData();
  const ui = useUi();
  const { state } = useLocation();
  const [share, setShare] = useState(false);
  const review = useMemo(() => reviewLastSession(data, { lest: hasLest() }), [data]);
  const [answers, setAnswers] = useState({});
  const [tweak, setTweak] = useState({});
  const [saving, setSaving] = useState(false);

  if (!review) {
    return (
      <main className="screen">
        <GlassHeader title="Bilan" lead={<Link to="/" className="icon-btn" aria-label="Retour à l'accueil"><Icon name="back" size={20} /></Link>} />
        <div className="pad"><div className="card"><span className="muted">Termine une première séance : le coach te proposera ensuite les charges de la suivante.</span></div></div>
      </main>
    );
  }

  const w = review.workout;
  const prev = data.workouts.find((x) => x.id !== w.id && titleKey(x.title) === titleKey(w.title));
  const prevVol = prev ? volumeOf(prev) : 0;
  const deltaPct = prevVol ? Math.round(((review.volume - prevVol) / prevVol) * 100) : null;
  const minutes = w.end ? Math.round((w.end - w.start) / 60000) : null;

  const rows = review.items.map((it) => {
    const sets = w.sets.filter((s) => s.exercise === it.name && isWork(s) && isPlausible(s));
    const base = it.kind === 'question' ? (answers[it.name] ? it.replies[answers[it.name]].plan : null) : it.plan;
    const target = base ? { ...base, ...(tweak[it.name] || {}) } : null;
    const stat = data.exercises.get(it.name);
    const pr = stat && stat.history.length > 1 && stat.best.date.getTime() === w.start.getTime() ? stat.best : null;
    const saved = data.plans.get(it.name);
    const isSaved = !!(target && saved && Number(saved.target_kg) === target.target_kg && saved.target_reps === target.target_reps);
    return { ...it, sets, target, pr, isSaved };
  });
  const ready = rows.filter((r) => r.target);
  const pending = rows.length - ready.length;
  const allSaved = ready.length > 0 && ready.every((r) => r.isSaved);

  const step = (r, field, d) => {
    const cur = r.target[field];
    const next = field === 'target_kg' ? Math.max(0, Math.round((cur + d * incrementOf(r.name)) * 10) / 10) : Math.max(1, cur + d);
    setTweak({ ...tweak, [r.name]: { ...(tweak[r.name] || {}), [field]: next, reason: 'Ajusté par toi' } });
  };

  const apply = async () => {
    setSaving(true);
    try {
      for (const r of ready) await savePlan(r.name, { target_kg: r.target.target_kg, target_reps: r.target.target_reps, reason: r.target.reason });
      await data.refresh();
      ui.notify('Charges appliquées à la prochaine séance');
    } catch (e) {
      ui.notify(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="screen">
      <GlassHeader eyebrow="Bilan et prochaines charges" title="Bilan" lead={<Link to="/" className="icon-btn" aria-label="Retour à l'accueil"><Icon name="back" size={20} /></Link>} />

      <div className="pad stack" style={{ gap: 12, paddingTop: 10 }}>
        <div className="card hero" style={{ gap: 8 }}>
          <h2 className="label">{state?.summary ? 'Séance enregistrée' : `Dernière séance, ${sameDay(w.start, new Date()) ? "aujourd'hui" : `le ${fmtDay(w.start)}`}`}</h2>
          <span className="display">{w.title}</span>
          <div className="session-stats" style={{ padding: 0 }}>
            <span><b>{review.totalSets}</b>séries</span>
            <span><b>{fmtInt(review.volume)}</b>kg</span>
            {minutes != null && <span><b>{minutes}</b>min</span>}
          </div>
          {review.verdict && (
            <span className="stack" style={{ gap: 2 }}>
              <span style={{ fontWeight: 650 }}>{review.verdict.text}</span>
              <span className="small" style={{ lineHeight: 1.4 }}>{review.verdict.next}</span>
            </span>
          )}
          {deltaPct != null && (
            <span className="small" style={{ fontWeight: 600 }}>
              {deltaPct === 0 ? 'Même volume' : `${deltaPct > 0 ? '+' : '−'}${Math.abs(deltaPct)} % de volume`} par rapport au {fmtDay(prev.start)}
            </span>
          )}
        </div>

        {state?.summary && (
          <button className="card" onClick={() => setShare(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, textAlign: 'left', color: 'inherit', font: 'inherit', border: 'none', cursor: 'pointer', width: '100%' }}>
            <span className="tile-icon" style={{ background: 'color-mix(in srgb, var(--accent) 18%, var(--chip))', color: 'var(--accent-text)' }}><Icon name="users" size={20} /></span>
            <span className="grow stack" style={{ gap: 1 }}><span style={{ fontWeight: 650 }}>Partager avec mes amis</span><span className="xs muted">Bravos et commentaires dans le fil</span></span>
            <Icon name="chevron" size={16} />
          </button>
        )}
        {share && <ShareSheet source={{ kind: 'gym', w }} data={data} onClose={() => setShare(false)} />}

        <SessionAnalysis workout={w} />

        <div className="between" style={{ paddingTop: 12 }}>
          <h2 className="sec-title">Pour la prochaine fois</h2>
          <span className="xs muted">{rows.length} exercice{rows.length > 1 ? 's' : ''}</span>
        </div>

        {rows.map((r) => {
          const [label, bg, fg] = KIND[r.kind];
          return (
            <section key={r.name} className="card" style={{ padding: 14, gap: 10 }} aria-label={r.name}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <ExerciseImage name={r.name} size={44} />
                <div className="grow stack" style={{ gap: 3 }}>
                  <span className="display" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.15 }}>{exLabel(r.name)}</span>
                  <span className="xs muted">Fait : {setsText(r.sets)}</span>
                </div>
                <span className="xs" style={{ background: bg, color: fg, fontWeight: 700, borderRadius: 8, padding: '4px 8px', whiteSpace: 'nowrap' }}>{label}</span>
              </div>

              {r.pr && (
                <span className="row xs" style={{ gap: 6, color: 'var(--ok)', fontWeight: 700 }}>
                  <Icon name="check" size={14} width={3} />Nouveau record : {fmtKg(r.pr.kg)} kg × {r.pr.reps}
                </span>
              )}

              {r.kind === 'question' && (
                <div className="stack" style={{ gap: 8 }}>
                  <span className="small">Charge en forte baisse : {fmtKg(r.before)} kg la fois d'avant, {fmtKg(r.now)} kg cette fois. Pourquoi ?</span>
                  <div className="seg" role="group" aria-label={`Raison de la baisse sur ${r.name}`} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    {Object.keys(r.replies).map((k) => (
                      <button key={k} className={answers[r.name] === k ? 'on' : ''} aria-pressed={answers[r.name] === k} style={{ fontSize: 13, padding: '0 4px' }}
                        onClick={() => { setAnswers({ ...answers, [r.name]: k }); setTweak({ ...tweak, [r.name]: undefined }); }}>{k}</button>
                    ))}
                  </div>
                </div>
              )}

              {r.target && (
                <>
                  <div className="grid2">
                    <Stepper label="charge" value={fmtKg(r.target.target_kg)} unit="kg" name={r.name} onStep={(d) => step(r, 'target_kg', d)} />
                    <Stepper label="reps" value={`× ${r.target.target_reps}`} name={r.name} onStep={(d) => step(r, 'target_reps', d)} />
                  </div>
                  {r.isSaved && <span className="row xs" style={{ gap: 6, color: 'var(--ok)', fontWeight: 700 }}><Icon name="check" size={14} width={3} />Appliqué à la prochaine séance</span>}
                  <span className="xs muted">{r.target.reason}</span>
                </>
              )}
            </section>
          );
        })}

      </div>

      <div className="float-cta" style={{ position: 'sticky', bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 5, padding: '24px 20px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className="btn primary big" style={{ boxShadow: '0 8px 24px rgba(10, 14, 20, 0.28)', background: allSaved ? 'var(--ok)' : undefined, color: allSaved ? 'var(--on-ok)' : undefined }} onClick={apply} disabled={saving || !ready.length || allSaved}>
          {allSaved ? <><Icon name="check" size={18} width={3} />Appliqué à la prochaine séance</> : saving ? 'Enregistrement…' : 'Appliquer à la prochaine séance'}
        </button>
        {pending > 0 && !allSaved && <span className="xs muted" style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '2px 6px', alignSelf: 'center' }}>{pending} exercice{pending > 1 ? 's' : ''} à vérifier, non inclus pour l'instant</span>}
      </div>
    </main>
  );
}
