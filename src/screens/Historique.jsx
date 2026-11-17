import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useData } from '../data.jsx';
import { GlassHeader, Icon } from '../components.jsx';
import { WorkoutSheet, RunSheet } from '../day.jsx';
import { fmtKg, fmtInt, isWork, isPlausible } from '../lib/stats.js';
import { hms } from '../lib/running.js';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const dayLabel = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const volume = (w) => w.sets.filter((s) => isWork(s) && isPlausible(s)).reduce((a, s) => a + s.weight_kg * s.reps, 0);

// Every past session (gym and runs), newest first, grouped by month. Tap to see the detail, rename or delete.
export default function Historique() {
  const data = useData();
  const location = useLocation();
  const [open, setOpen] = useState(location.state?.open ? { kind: 'gym', id: location.state.open } : null);

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

  return (
    <main className="screen">
      <GlassHeader eyebrow={`${data.workouts.length} séances de salle, ${data.runLogs.length} course${data.runLogs.length > 1 ? 's' : ''}`} title="Historique" />
      <div className="pad stack" style={{ gap: 8, paddingTop: 8 }}>
        {!items.length && <div className="card"><span className="muted">Aucune séance pour l'instant. Termine une séance ou importe ton historique Hevy depuis le profil.</span></div>}
        {groups.map((g) => (
          <div key={g.key} className="stack" style={{ gap: 6 }}>
            <h2 className="label" style={{ padding: '14px 4px 2px' }}>{g.key}</h2>
            <div className="list">
              {g.items.map((it) => (
                <button key={it.kind + it.id} onClick={() => setOpen(it)}
                  style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--line)', color: 'inherit', textAlign: 'left', width: '100%', cursor: 'pointer' }}>
                  <span className="tile-icon" style={{ width: 36, height: 36, background: it.kind === 'run' ? 'color-mix(in srgb, var(--z1) 22%, var(--chip))' : 'var(--chip)' }}>
                    <Icon name={it.kind === 'run' ? 'timer' : 'dumbbell'} size={18} />
                  </span>
                  <span className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.kind === 'gym' ? it.w.title : `${it.l.notes || 'Course'}, ${fmtKg(Number(it.l.distance_km))} km`}</span>
                    <span className="xs muted">{dayLabel(it.date)}{it.kind === 'gym' ? `, ${it.w.sets.filter((s) => s.set_type !== 'warmup').length} séries, ${fmtInt(volume(it.w))} kg` : `, ${hms(it.l.duration_s)}`}</span>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              ))}
            </div>
          </div>
        ))}
        
      </div>

      <WorkoutSheet id={open?.kind === 'gym' ? open.id : null} onClose={() => setOpen(null)} />
      <RunSheet id={open?.kind === 'run' ? open.id : null} onClose={() => setOpen(null)} />
    </main>
  );
}
