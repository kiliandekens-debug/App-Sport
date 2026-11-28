import { useState } from 'react';
import { exLabel } from '../lib/exercises.js';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, saveRoutine, deleteRoutine } from '../data.jsx';
import { useSession, SET_TYPES, SET_LABEL, SET_NAME, REST_OPTIONS, mmss } from '../session.jsx';
import { defaultRest, toggleSuperset, cleanSupersets } from '../lib/routines.js';
import { Icon, ExerciseImage, SupersetTag, GlassHeader } from '../components.jsx';
import { useUi } from '../ui.jsx';
import { ExercisePicker } from './Exercices.jsx';

const TYPE_COLOR = { warmup: 'var(--warm)', dropset: 'var(--drop)', failure: 'var(--danger)' };
const restLabel = (sec) => (sec ? mmss(sec) : 'Désactivé');

export default function Routine() {
  const { id } = useParams();
  const data = useData();
  const session = useSession();
  const nav = useNavigate();
  const ui = useUi();
  const existing = data.routines.find((r) => r.id === id);
  const [r, setR] = useState(() => existing
    ? { id: existing.id, name: existing.name, exercises: existing.exercises || [] }
    : { name: '', exercises: [], position: data.routines.length });
  const [picking, setPicking] = useState(id === 'nouvelle');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  if (id !== 'nouvelle' && !existing) {
    return <main className="screen"><div className="center"><span>Routine introuvable.</span><Link to="/">Retour</Link></div></main>;
  }

  const setEx = (i, fn) => setR((c) => ({ ...c, exercises: c.exercises.map((e, j) => (j === i ? fn(e) : e)) }));
  const setSet = (i, k, patch) => setEx(i, (e) => ({ ...e, sets: e.sets.map((x, j) => (j === k ? { ...x, ...patch } : x)) }));
  const move = (i, d) => setR((c) => {
    const j = i + d;
    if (j < 0 || j >= c.exercises.length) return c;
    const ex = [...c.exercises];
    [ex[i], ex[j]] = [ex[j], ex[i]];
    return { ...c, exercises: ex };
  });
  const addEx = (ex) => setR((c) => {
    if (c.exercises.some((e) => e.name === ex.name)) return c;
    const st = data.exercises.get(ex.name);
    const last = st?.history[st.history.length - 1];
    const sets = last ? last.sets.map((s) => ({ type: s.set_type || 'normal', reps: s.reps, kg: null })) : [{ type: 'normal', reps: 10, kg: null }, { type: 'normal', reps: 10, kg: null }, { type: 'normal', reps: 10, kg: null }];
    return { ...c, exercises: [...c.exercises, { name: ex.name, rest: defaultRest(ex.name), superset: null, sets }] };
  });

  const save = async (andStart) => {
    if (!r.name.trim()) { setErr('Donne un nom à la routine.'); return; }
    setSaving(true);
    setErr('');
    try {
      const clean = { ...r, name: r.name.trim(), exercises: cleanSupersets(r.exercises) };
      const newId = await saveRoutine(clean);
      await data.refresh();
      if (andStart) { session.startRoutine(clean); nav('/seance'); } else { ui.notify('Routine enregistrée'); nav(`/routines/${newId}`, { replace: true }); }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await ui.confirm({ title: `Supprimer « ${r.name} » ?`, message: 'Tes séances passées ne sont pas touchées.', ok: 'Supprimer', danger: true }))) return;
    try { await deleteRoutine(r.id); await data.refresh(); nav('/'); } catch (e) { setErr(e.message || String(e)); }
  };
  const dirty = JSON.stringify(existing ? { name: existing.name, exercises: existing.exercises || [] } : { name: '', exercises: [] }) !== JSON.stringify({ name: r.name, exercises: r.exercises });
  const leave = async (e) => {
    if (!dirty) return;
    e.preventDefault();
    if (await ui.confirm({ title: 'Quitter sans enregistrer ?', message: 'Tes modifications de la routine seront perdues.', ok: 'Quitter', danger: true })) nav('/');
  };

  if (picking) {
    return (
      <main className="screen" style={{ paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
        <GlassHeader title="Ajouter des exercices" back={{ onClick: () => setPicking(false), label: 'Retour à la routine' }} />
        <ExercisePicker selected={new Set(r.exercises.map((e) => e.name))} onAdd={addEx} />
        <div className="glass-dock"><div className="dock-in">
          <button className="btn primary big" onClick={() => setPicking(false)}>{r.exercises.length ? `Terminé, ${r.exercises.length} exercice${r.exercises.length > 1 ? 's' : ''}` : 'Retour à la routine'}</button>
        </div></div>
      </main>
    );
  }

  return (
    <main className="screen" style={{ paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
      <GlassHeader title={id === 'nouvelle' ? 'Nouvelle routine' : 'Routine'} back={{ to: '/', onClick: leave, label: 'Retour à l\'accueil' }}
        right={<button className="btn" onClick={() => save(false)} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>} />

      <div className="pad stack" style={{ gap: 14 }}>
        <label className="stack" style={{ gap: 6 }}>
          <h2 className="glabel">Nom</h2>
          <input className="input" value={r.name} placeholder="Ex. Pecs du lundi" onChange={(e) => setR({ ...r, name: e.target.value })} />
        </label>

        {r.exercises.map((e, i) => {
          let n = 0;
          const linked = e.superset && r.exercises[i + 1]?.superset === e.superset;
          return (
            <div key={e.name} className="stack" style={{ gap: 0 }}>
              <div className="card" style={{ padding: 14, gap: 10, borderLeft: e.superset ? `4px solid var(--accent)` : undefined }}>
                <div className="row">
                  <ExerciseImage name={e.name} size={52} />
                  <div className="grow stack" style={{ gap: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{exLabel(e.name)}</span>
                    <SupersetTag letter={e.superset} />
                  </div>
                </div>
                <div className="row" style={{ gap: 8, fontSize: 11, color: 'var(--muted)', padding: '0 4px' }}>
                  <span style={{ width: 40 }}>Série</span><span className="grow">Reps visées</span><span style={{ width: 84 }}>Kg</span>
                </div>
                {e.sets.map((x, k) => {
                  const type = x.type || 'normal';
                  const label = type === 'normal' ? String(++n) : SET_LABEL[type];
                  return (
                    <div key={k} className="row" style={{ gap: 8 }}>
                      <button aria-label={`Série ${k + 1}, ${SET_NAME[type]}. Changer le type`} onClick={() => setSet(i, k, { type: SET_TYPES[(SET_TYPES.indexOf(type) + 1) % SET_TYPES.length] })}
                        style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: 'var(--raised)', color: TYPE_COLOR[type] || 'var(--text)', fontWeight: 700 }}>{label}</button>
                      <input className="input grow" style={{ height: 40, textAlign: 'center' }} inputMode="numeric" aria-label={`Reps visées, série ${k + 1}`} value={x.reps ?? ''} onChange={(ev) => setSet(i, k, { reps: ev.target.value === '' ? null : Number(ev.target.value) })} />
                      <input className="input" style={{ height: 40, width: 84, textAlign: 'center' }} inputMode="decimal" aria-label={`Charge fixe en kg, série ${k + 1}`} placeholder="auto" value={x.kg ?? ''} onChange={(ev) => setSet(i, k, { kg: ev.target.value === '' ? null : Number(ev.target.value.replace(',', '.')) })} />
                    </div>
                  );
                })}
                {!e.sets.some((x) => x.type === 'warmup') && (
                  <button className="btn dashed" onClick={() => setEx(i, (ex) => ({ ...ex, sets: [{ type: 'warmup', reps: 5, kg: null }, { type: 'warmup', reps: 5, kg: null }, { type: 'warmup', reps: 3, kg: null }, ...ex.sets] }))}>
                    <Icon name="flame" size={16} />Échauffement auto (40, 60, 80 %)
                  </button>
                )}
                <span className="xs muted">« auto » reprend ta charge de la dernière fois. Les échauffements (É) en auto sont calculés depuis ta première série de travail.</span>
                <div className="grid2">
                  <button className="btn dashed" onClick={() => setEx(i, (ex) => ({ ...ex, sets: [...ex.sets, { ...(ex.sets[ex.sets.length - 1] || { reps: 10 }), type: 'normal' }] }))}>+ Série</button>
                  <button className="btn dashed" disabled={e.sets.length <= 1} onClick={() => setEx(i, (ex) => ({ ...ex, sets: ex.sets.slice(0, -1) }))}>− Série</button>
                </div>
                <label className="row" style={{ gap: 10, padding: '8px 12px', borderRadius: 12, background: 'var(--raised)' }}>
                  <span style={{ color: 'var(--rest)' }}><Icon name="timer" size={18} /></span>
                  <span className="grow small">Repos</span>
                  <select aria-label={`Repos pour ${e.name}`} value={e.rest ?? 0} onChange={(ev) => setEx(i, (ex) => ({ ...ex, rest: Number(ev.target.value) }))}
                    style={{ background: 'transparent', border: 'none', color: 'var(--rest)', fontWeight: 700, fontSize: 16 }}>
                    {REST_OPTIONS.map((o) => <option key={o} value={o}>{restLabel(o)}</option>)}
                  </select>
                </label>
                <div className="row" style={{ gap: 8 }}>
                  <button className="icon-btn sq" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={18} /></button>
                  <button className="icon-btn sq" aria-label="Descendre" disabled={i === r.exercises.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={18} /></button>
                  <div className="grow" />
                  <button className="icon-btn sq" aria-label={`Retirer ${e.name}`} style={{ color: 'var(--danger)' }} onClick={() => setR((c) => ({ ...c, exercises: cleanSupersets(c.exercises.filter((_, j) => j !== i)) }))}><Icon name="trash" size={18} /></button>
                </div>
              </div>
              {i < r.exercises.length - 1 && (
                <button className="btn" onClick={() => setR((c) => ({ ...c, exercises: toggleSuperset(c.exercises, i) }))}
                  style={{ alignSelf: 'center', height: 36, margin: '6px 0', fontSize: 13, fontWeight: 500, background: linked ? 'var(--done)' : 'transparent', color: linked ? 'var(--accent)' : 'var(--muted)', border: '1px dashed var(--border)' }}>
                  <Icon name="link" size={16} />{linked ? `Superset ${e.superset} · délier` : 'Lier en superset'}
                </button>
              )}
            </div>
          );
        })}

        <button className="btn dashed" style={{ height: 52 }} onClick={() => setPicking(true)}><Icon name="plus" size={18} />Ajouter des exercices</button>
        {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
        {r.id && <button className="btn" style={{ background: 'transparent', color: 'var(--danger)' }} onClick={remove}><Icon name="trash" size={16} />Supprimer la routine</button>}
      </div>

      <div className="dock"><div className="dock-in">
        <button className="btn primary big" disabled={saving || !r.exercises.length || session.active} onClick={() => save(true)}>
          <Icon name="play" size={18} width={2.5} />{session.active ? 'Une séance est déjà en cours' : 'Enregistrer et démarrer'}
        </button>
      </div></div>
    </main>
  );
}
