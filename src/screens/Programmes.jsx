import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, saveRoutine, saveProgram } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { Icon, ExerciseImage, GlassHeader } from '../components.jsx';
import { PROGRAMS, dayOf, placeStrength, programRoutines, targetText } from '../lib/programs.js';
import { scheduleOf } from '../lib/running.js';

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const RUN_SHORT = { quality: 'Séance clé', long: 'Sortie longue', easy: 'Footing' };

// The week of a programme placed around the runs of the plan: one column per day.
function WeekStrip({ p, schedule }) {
  const place = placeStrength(p, schedule);
  return (
    <div className="prog-week" role="list" aria-label="Semaine type">
      {place.map((i, d) => {
        const gym = i == null ? null : dayOf(p.days[i]).title;
        const run = schedule?.[d] ? RUN_SHORT[schedule[d]] : null;
        return (
          <div key={d} role="listitem" className="prog-day" aria-label={`${['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][d]} : ${[gym, run].filter(Boolean).join(' et ') || 'repos'}`}>
            <span className="xs muted">{LETTERS[d]}</span>
            {gym && <span className="prog-chip gym">{gym}</span>}
            {run && <span className="prog-chip run">{run}</span>}
            {!gym && !run && <span className="prog-chip rest">Repos</span>}
          </div>
        );
      })}
    </div>
  );
}

// Fixed coach programmes: pick one, the routines are created and the home screen follows it.
export default function Programmes() {
  const data = useData();
  const ui = useUi();
  const nav = useNavigate();
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const schedule = data.runProfile ? scheduleOf(data.runProfile) : null;
  const current = data.program?.id || null;

  const choose = async (p) => {
    if (current && current !== p.id && !(await ui.confirm({ title: `Passer à « ${p.title} » ?`, message: 'Les routines de ton programme actuel restent dans Mes routines. Ton historique et tes charges ne changent pas.', ok: 'Changer' }))) return;
    setBusy(true);
    try {
      // A routine of the same name from the previous programme is updated rather than duplicated.
      const mine = new Set(data.program?.routines || []);
      const ids = [];
      let pos = data.routines.length;
      for (const r of programRoutines(p, pos)) {
        const same = data.routines.find((x) => x.name === r.name && mine.has(x.id));
        ids.push(await saveRoutine({ ...r, id: same?.id, position: same ? same.position : pos++ }));
      }
      await saveProgram({ id: p.id, routines: ids, started_on: new Date().toISOString().slice(0, 10) });
      await data.refresh();
      ui.notify(`Programme « ${p.title} » activé`);
      nav('/');
    } catch (e) {
      ui.notify(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    if (!(await ui.confirm({ title: 'Arrêter le programme ?', message: 'Ses routines restent dans Mes routines. L\'accueil reprend la routine faite il y a le plus longtemps.', ok: 'Arrêter' }))) return;
    try { await saveProgram(null); await data.refresh(); ui.notify('Programme arrêté'); } catch (e) { ui.notify(e.message || String(e)); }
  };

  return (
    <main className="screen">
      <GlassHeader eyebrow="Écrits d'après 48 programmes de pros et de coachs" title="Programmes"
        lead={<Link to="/" className="icon-btn" aria-label="Retour à l'accueil"><Icon name="back" /></Link>} />
      <div className="pad stack" style={{ gap: 12, paddingTop: 10 }}>
        <span className="small muted" style={{ lineHeight: 1.45 }}>
          La structure ne change jamais : mêmes exercices, mêmes séries, chaque semaine. Le coach te propose seulement les charges. Les séances se placent autour de tes courses, sans jambes lourdes la veille d'une séance clé ou d'une sortie longue.
        </span>
        {PROGRAMS.map((p) => {
          const on = current === p.id;
          const shown = open === p.id;
          return (
            <section key={p.id} className="card stack" style={{ gap: 10, borderColor: on ? 'var(--accent)' : undefined }} aria-label={p.title}>
              <button onClick={() => setOpen(shown ? null : p.id)} aria-expanded={shown} style={{ textAlign: 'left', background: 'none', border: 'none', color: 'inherit', padding: 0 }}>
                <span className="between" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <span className="stack" style={{ gap: 3 }}>
                    <span className="xs" style={{ fontWeight: 700, color: 'var(--accent-text)' }}>{on ? 'Ton programme · ' : ''}{p.short}</span>
                    <span className="display" style={{ fontSize: 20 }}>{p.title}</span>
                    <span className="small muted" style={{ lineHeight: 1.45 }}>{p.about}</span>
                    <span className="xs muted">D'après {p.from}</span>
                  </span>
                  <Icon name={shown ? 'up' : 'down'} size={18} />
                </span>
              </button>
              <WeekStrip p={p} schedule={schedule} />
              {shown && (
                <div className="stack" style={{ gap: 12 }}>
                  {p.days.map((id) => {
                    const d = dayOf(id);
                    return (
                      <div key={id} className="stack" style={{ gap: 6 }}>
                        <span style={{ fontWeight: 700 }}>{d.title}</span>
                        {d.exercises.map((x) => (
                          <div key={x.name} className="row" style={{ gap: 10 }}>
                            <ExerciseImage name={x.name} size={34} radius={8} />
                            <span className="grow stack" style={{ gap: 0, minWidth: 0 }}>
                              <span className="small" style={{ fontWeight: 600 }}>{x.name}</span>
                              <span className="xs muted">{targetText(x)} · repos {x.rest >= 120 ? `${Math.floor(x.rest / 60)} min${x.rest % 60 ? ` ${x.rest % 60}` : ''}` : `${x.rest} s`}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <span className="xs muted" style={{ lineHeight: 1.45 }}>Progression : quand toutes les séries atteignent le haut de la fourchette, ajoute le plus petit palier de charge. Toutes les 6 semaines, ou si tu es usé, une semaine allégée.</span>
                </div>
              )}
              {on
                ? <button className="btn" onClick={stop}>Arrêter ce programme</button>
                : <button className="btn primary" disabled={busy} onClick={() => choose(p)}>{busy ? 'Création…' : 'Choisir ce programme'}</button>}
            </section>
          );
        })}
      </div>
    </main>
  );
}
