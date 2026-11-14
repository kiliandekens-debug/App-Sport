import { useEffect } from 'react';
import { useData } from '../data.jsx';
import { ExerciseImage, Icon } from '../components.jsx';
import { fmtKg, fmtDay } from '../lib/stats.js';
import { muscleOf, equipOf } from '../lib/exercises.js';

// Bottom sheet with the exercise illustration and the user's history on it.
export default function ExerciseSheet({ exercise, onClose, children }) {
  const data = useData();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!exercise) return null;
  const st = data.exercises.get(exercise.name);
  const last = st?.history[st.history.length - 1];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={exercise.name} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        <div className="row">
          <span className="display grow" style={{ fontSize: 20, lineHeight: 1.2 }}>{exercise.name}</span>
          <button className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="close" /></button>
        </div>
        <ExerciseImage name={exercise.name} base={exercise.base} size="full" animate radius={16} />
        <span className="small muted">{exercise.muscle || muscleOf(exercise.name)} · {exercise.equip || equipOf(exercise.name)}</span>
        {st ? (
          <div className="grid3">
            <div className="tile" style={{ background: 'var(--raised)' }}><span className="xs muted">Séances</span><span className="v">{st.history.length}</span></div>
            <div className="tile" style={{ background: 'var(--raised)' }}><span className="xs muted">Record</span><span className="v" style={{ fontSize: 16 }}>{fmtKg(st.best.kg)} × {st.best.reps}</span></div>
            <div className="tile" style={{ background: 'var(--raised)' }}><span className="xs muted">Dernière</span><span className="v" style={{ fontSize: 16 }}>{fmtDay(last.date)}</span></div>
          </div>
        ) : <span className="small muted">Jamais fait pour l'instant.</span>}
        {last && <span className="small soft">Dernière fois : {last.sets.map((x) => `${fmtKg(x.weight_kg)} × ${x.reps}`).join(' · ')}</span>}
        {children}
        <span className="xs muted">Illustration : Free Exercise DB (domaine public).</span>
      </div>
    </div>
  );
}
