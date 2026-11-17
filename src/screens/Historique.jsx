import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useData, deleteWorkout, renameWorkout } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { GlassHeader, Icon, ExerciseImage } from '../components.jsx';
import { fmtKg, fmtInt, isWork, isPlausible } from '../lib/stats.js';
import { hms } from '../lib/running.js';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const dayLabel = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const volume = (w) => w.sets.filter((s) => isWork(s) && isPlausible(s)).reduce((a, s) => a + s.weight_kg * s.reps, 0);

// Every past session (gym and runs), newest first, grouped by month. Tap to see the detail, rename or delete.
export default function Historique() {
  const data = useData();
  const ui = useUi();
  const location = useLocation();
  const [open, setOpen] = useState(location.state?.open ? { kind: 'gym', id: location.state.open } : null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    const gym = data.workouts.map((w) => ({ kind: 'gym', id: w.id, date: w.start, w }));
    const runs = data.runLogs.map((l) => ({ kind: 'run', id: l.id, date: new Date(l.done_at), l }));
    return [...gym, ...runs].sort((a, b) => b.date - a.date);
  }, [data.workouts, data.runLogs]);

  const groups = [];
  for (const it of items) {
    const key = `${MONTHS[it.date.getMonth()]} ${it.date.getFullYear()}`;
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(it);
  }

  const w = open?.kind === 'gym' ? data.workouts.find((x) => x.id === open.id) : null;
  const exercises = w ? [...new Set(w.sets.map((s) => s.exercise))].map((name) => ({ name, sets: w.sets.filter((s) => s.exercise === name) })) : [];

  const records = w ? exercises.filter((e) => { const st = data.exercises.get(e.name); return st?.best && st.best.date.getTime() === w.start.getTime() && st.history.length > 1; }).length : 0;

  const remove = async () => {
    if (!(await ui.confirm({ title: 'Supprimer cette séance ?', message: `${w.title}, ${dayLabel(w.start)}. Ses séries disparaissent aussi de tes progrès et records.`, ok: 'Supprimer', danger: true }))) return;
    setBusy(true);
    try { await deleteWorkout(w.id); await data.refresh(); setOpen(null); ui.notify('Séance supprimée'); } catch (e) { ui.notify(e.message || String(e)); } finally { setBusy(false); }
  };
  const rename = async () => {
    const t = await ui.prompt({ title: 'Nom de la séance', value: w.title, ok: 'Renommer' });
    if (!t || t === w.title) return;
    try { await renameWorkout(w.id, t.trim()); await data.refresh(); ui.notify('Séance renommée'); } catch (e) { ui.notify(e.message || String(e)); }
  };

  return (
    <main className="screen">
      <GlassHeader eyebrow={`${data.workouts.length} séances de salle, ${data.runLogs.length} course${data.runLogs.length > 1 ? 's' : ''}`} title="Historique" />
      <div className="pad stack" style={{ gap: 8, paddingTop: 8 }}>
        {!items.length && <div className="card"><span className="muted">Aucune séance pour l'instant. Termine une séance ou importe ton historique Hevy depuis le profil.</span></div>}
        {groups.map((g) => (
          <div key={g.key} className="stack" style={{ gap: 6 }}>
            <span className="label" style={{ padding: '14px 4px 2px' }}>{g.key}</span>
            <div className="list">
              {g.items.map((it) => (
                <button key={it.kind + it.id} onClick={() => it.kind === 'gym' && setOpen(it)} disabled={it.kind !== 'gym'}
                  style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--line)', color: 'inherit', textAlign: 'left', width: '100%', cursor: it.kind === 'gym' ? 'pointer' : 'default' }}>
                  <span className="tile-icon" style={{ width: 36, height: 36, background: it.kind === 'run' ? 'color-mix(in srgb, var(--z1) 22%, var(--chip))' : 'var(--chip)' }}>
                    <Icon name={it.kind === 'run' ? 'timer' : 'dumbbell'} size={18} />
                  </span>
                  <span className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.kind === 'gym' ? it.w.title : `Course, ${fmtKg(Number(it.l.distance_km))} km`}</span>
                    <span className="xs muted">{dayLabel(it.date)}{it.kind === 'gym' ? `, ${it.w.sets.filter((s) => s.set_type !== 'warmup').length} séries, ${fmtInt(volume(it.w))} kg` : `, ${hms(it.l.duration_s)}`}</span>
                  </span>
                  {it.kind === 'gym' && <Icon name="chevron" size={18} />}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!!data.runLogs.length && <span className="xs muted" style={{ padding: '8px 4px' }}>Les courses se modifient et se suppriment depuis l'onglet Course.</span>}
      </div>

      {w && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="sheet wsheet" role="dialog" aria-modal="true" aria-label={w.title} onClick={(e) => e.stopPropagation()}>
            <span className="sheet-grip" />
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow stack" style={{ gap: 4 }}>
                <span className="xs muted" style={{ textTransform: 'capitalize', fontWeight: 600 }}>{w.start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span className="display">{w.title}</span>
              </div>
              <button className="icon-btn" aria-label="Fermer" onClick={() => setOpen(null)}><Icon name="close" /></button>
            </div>

            <div className="wstats">
              {w.end && <div><b className="display">{Math.round((w.end - w.start) / 60000)}</b><span>min</span></div>}
              <div><b className="display">{w.sets.filter((x) => isWork(x)).length}</b><span>séries</span></div>
              <div><b className="display">{fmtInt(volume(w))}</b><span>kg</span></div>
              {records > 0 && <div className="pr"><b className="display">{records}</b><span>record{records > 1 ? 's' : ''}</span></div>}
            </div>

            <div className="stack" style={{ gap: 10 }}>
              {exercises.map((e) => {
                const stat = data.exercises.get(e.name);
                const pr = stat?.best && stat.best.date.getTime() === w.start.getTime() && stat.history.length > 1;
                let n = 0;
                return (
                  <section key={e.name} className="wex">
                    <div className="row" style={{ gap: 12 }}>
                      <ExerciseImage name={e.name} size={44} radius={12} />
                      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                        <span style={{ fontWeight: 650, lineHeight: 1.25 }}>{e.name}</span>
                        <span className="xs muted">{e.sets.filter((x) => isWork(x)).length} séries{pr ? '' : stat?.best ? `, record ${fmtKg(stat.best.kg)} kg × ${stat.best.reps}` : ''}</span>
                      </div>
                      {pr && <span className="tag" style={{ background: 'var(--ok)', color: 'var(--on-ok)' }}>Record</span>}
                    </div>
                    <div className="wsets">
                      {e.sets.map((x, i) => {
                        const warm = x.set_type === 'warmup';
                        const label = warm ? 'É' : String(++n);
                        return (
                          <div key={i} className={`wset${warm ? ' warm' : ''}`}>
                            <span className="wn">{label}</span>
                            <span><b className="display">{fmtKg(x.weight_kg)}</b> kg × <b className="display">{x.reps}</b></span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="row" style={{ gap: 8, paddingTop: 4 }}>
              <button className="btn grow" onClick={rename}><Icon name="edit" size={16} />Renommer</button>
              <button className="btn grow" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} disabled={busy} onClick={remove}><Icon name="trash" size={16} />Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
