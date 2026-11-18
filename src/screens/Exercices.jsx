import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../data.jsx';
import { useSession } from '../session.jsx';
import { LIBRARY, MUSCLES, EQUIPS, muscleOf, equipOf } from '../lib/exercises.js';
import { Icon, ExerciseImage, GlassHeader } from '../components.jsx';
import { VarianteForm } from './Variante.jsx';
import ExerciseSheet from './ExerciseSheet.jsx';

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Your exercises (custom variants, then history by frequency), then the base library.
export function useCatalog() {
  const data = useData();
  return useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of data.custom) { seen.add(c.name.toLowerCase()); out.push({ name: c.name, base: c.base, muscle: c.muscle, equip: c.equip, source: 'custom' }); }
    for (const e of data.exerciseList) {
      if (seen.has(e.name.toLowerCase())) continue;
      seen.add(e.name.toLowerCase());
      out.push({ name: e.name, muscle: muscleOf(e.name), equip: equipOf(e.name), source: 'history', count: e.history.length });
    }
    for (const e of LIBRARY) if (!seen.has(e.name.toLowerCase())) out.push(e);
    return out;
  }, [data]);
}

export function ExercisePicker({ selected = new Set(), onAdd, onOpen, bottomPad = 0 }) {
  const all = useCatalog();
  const [muscle, setMuscle] = useState('Tous');
  const [equip, setEquip] = useState('Tout');
  const [q, setQ] = useState('');
  // "developpe" finds "Développé"; every word must match the name, muscle or equipment.
  const words = fold(q).split(/\s+/).filter(Boolean);
  const list = all
    .filter((x) => muscle === 'Tous' || x.muscle === muscle)
    .filter((x) => equip === 'Tout' || x.equip === equip)
    .filter((x) => { const hay = fold(`${x.name} ${x.muscle} ${x.equip}`); return words.every((w) => hay.includes(w)); });

  return (
    <>
      <div className="pad" style={{ paddingTop: 8 }}>
        <label className="search">
          <span className="muted"><Icon name="search" size={18} /></span>
          <input type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Rechercher un exercice" placeholder="Rechercher (ex. développé, poulie)" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="pad chips" style={{ paddingTop: 12 }}>
        {['Tous', ...MUSCLES].map((m) => <button key={m} className={`chip ${muscle === m ? 'on' : ''}`} aria-pressed={muscle === m} onClick={() => setMuscle(m)}>{m}</button>)}
      </div>
      <div className="pad chips" style={{ paddingTop: 8 }}>
        {['Tout', ...EQUIPS].map((m) => <button key={m} className={`chip ${equip === m ? 'on' : ''}`} aria-pressed={equip === m} onClick={() => setEquip(m)}>{m}</button>)}
      </div>
      <div className="pad stack" style={{ paddingTop: 14, gap: 6, paddingBottom: bottomPad }}>
        {list.map((ex) => (
          <div key={ex.name} className="ex-item" style={{ paddingLeft: 6 }}>
            <button className="grow row" style={{ gap: 12, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0 }} onClick={() => onOpen?.(ex)} aria-label={`Voir ${ex.name}`}>
              <ExerciseImage name={ex.name} base={ex.base} size={48} />
              <span className="grow stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{ex.name}</span>
                <span className="xs muted">{ex.muscle} · {ex.equip}{ex.count ? ` · ${ex.count} séance${ex.count > 1 ? 's' : ''}` : ''}</span>
              </span>
            </button>
            {ex.source === 'custom' && <span className="tag">Perso</span>}
            {selected.has(ex.name)
              ? <span className="icon-btn sq accent" aria-label={`${ex.name} est ajouté`}><Icon name="check" size={18} width={2.5} /></span>
              : <button className="icon-btn sq" aria-label={`Ajouter ${ex.name}`} onClick={() => onAdd(ex)}><Icon name="plus" size={18} /></button>}
          </div>
        ))}
        {!list.length && (
          <div className="card" style={{ border: '1px dashed var(--border)', background: 'transparent' }}>
            <span>Aucun exercice ne correspond.</span>
            <Link to={`/variante?nom=${encodeURIComponent(q)}`}>Le créer moi-même</Link>
          </div>
        )}
      </div>
    </>
  );
}

export default function Exercices() {
  const session = useSession();
  const nav = useNavigate();
  const [base, setBase] = useState(null);
  const [open, setOpen] = useState(null);
  const all = useCatalog();

  const inSession = new Set(session.active ? session.exercises.map((e) => e.name) : []);
  const add = (ex) => {
    session.addExercise(ex.name);
    if (!session.active) nav('/seance');
  };
  const variant = (ex) => {
    setOpen(null);
    if (window.innerWidth < 900) nav('/variante', { state: { base: ex } });
    else setBase(ex);
  };

  return (
    <main className="screen wide">
      {session.active && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 12, padding: '0 20px', display: 'flex', justifyContent: 'center' }}>
          <Link to="/seance" className="btn primary big" style={{ maxWidth: 440, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
            Retour à la séance · {session.exercises.length} exercice{session.exercises.length > 1 ? 's' : ''}
          </Link>
        </div>
      )}
      <div className="split">
        <div className="panel">
          <GlassHeader eyebrow={`${all.length} exercices${session.active ? `, ajout à « ${session.title} »` : ''}`} title="Exercices"
            right={<Link to="/variante" aria-label="Créer un exercice ou une variante" className="icon-btn accent only-narrow"><Icon name="plus" width={2.5} /></Link>} />
          <ExercisePicker selected={inSession} onAdd={add} onOpen={setOpen} bottomPad={session.active ? 72 : 0} />
          <div className="pad only-narrow" style={{ paddingTop: 8 }}>
            <Link to="/variante" className="btn dashed" style={{ height: 52, width: '100%' }}>Il manque ma version ? Créer une variante</Link>
          </div>
        </div>
        <div className="panel only-wide" style={{ paddingTop: 28 }}>
          <VarianteForm base={base} onSaved={() => setBase(null)} embedded />
        </div>
      </div>

      <ExerciseSheet exercise={open} onClose={() => setOpen(null)}>
        <div className="stack" style={{ gap: 8 }}>
          {inSession.has(open?.name)
            ? <Link className="btn primary big" to="/seance">Déjà dans la séance, y retourner</Link>
            : <button className="btn primary big" onClick={() => { add(open); setOpen(null); }}><Icon name="plus" size={18} width={2.5} />Ajouter à la séance</button>}
          <button className="btn" onClick={() => variant(open)}>Créer une variante de cet exercice</button>
        </div>
      </ExerciseSheet>
    </main>
  );
}
