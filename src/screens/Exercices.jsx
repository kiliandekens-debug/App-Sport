import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../data.jsx';
import { useSession } from '../session.jsx';
import { LIBRARY, MUSCLES, EQUIPS, muscleOf, equipOf } from '../lib/exercises.js';
import { Icon } from '../components.jsx';
import { VarianteForm } from './Variante.jsx';

export default function Exercices() {
  const data = useData();
  const session = useSession();
  const nav = useNavigate();
  const [muscle, setMuscle] = useState('Tous');
  const [equip, setEquip] = useState('Tout');
  const [q, setQ] = useState('');
  const [base, setBase] = useState(null);

  const all = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of data.custom) { seen.add(c.name.toLowerCase()); out.push({ name: c.name, muscle: c.muscle, equip: c.equip, source: 'custom' }); }
    for (const e of data.exerciseList) {
      if (seen.has(e.name.toLowerCase())) continue;
      seen.add(e.name.toLowerCase());
      out.push({ name: e.name, muscle: muscleOf(e.name), equip: equipOf(e.name), source: 'history', count: e.history.length });
    }
    for (const e of LIBRARY) if (!seen.has(e.name.toLowerCase())) out.push(e);
    return out;
  }, [data]);

  const query = q.trim().toLowerCase();
  const list = all
    .filter((x) => muscle === 'Tous' || x.muscle === muscle)
    .filter((x) => equip === 'Tout' || x.equip === equip)
    .filter((x) => !query || x.name.toLowerCase().includes(query));

  const add = (name) => {
    session.addExercise(name);
    nav('/seance');
  };

  return (
    <main className="screen wide">
      <div className="split">
        <div className="panel">
          <div className="head" style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="small muted">{all.length} exercices{session.active ? ` · ajout à « ${session.title} »` : ''}</span>
              <h1 className="title">Exercices</h1>
            </div>
            <Link to="/variante" aria-label="Créer un exercice ou une variante" className="icon-btn accent only-narrow"><Icon name="plus" width={2.5} /></Link>
          </div>

          <div className="pad" style={{ paddingTop: 8 }}>
            <label className="search">
              <span className="muted"><Icon name="search" size={18} /></span>
              <input aria-label="Rechercher un exercice" placeholder="Rechercher (ex. développé, poulie)" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          <div className="pad chips" style={{ paddingTop: 12 }}>
            {['Tous', ...MUSCLES].map((m) => <button key={m} className={`chip ${muscle === m ? 'on' : ''}`} aria-pressed={muscle === m} onClick={() => setMuscle(m)}>{m}</button>)}
          </div>
          <div className="pad chips" style={{ paddingTop: 8 }}>
            {['Tout', ...EQUIPS].map((m) => <button key={m} className={`chip ${equip === m ? 'on' : ''}`} aria-pressed={equip === m} onClick={() => setEquip(m)}>{m}</button>)}
          </div>

          <div className="pad stack" style={{ paddingTop: 14, gap: 6 }}>
            {list.map((ex) => (
              <div key={ex.name} className="ex-item">
                <button className="grow stack" style={{ gap: 2, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0 }} onClick={() => (window.innerWidth < 900 ? nav('/variante', { state: { base: ex } }) : setBase(ex))} aria-label={`Créer une variante de ${ex.name}`}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{ex.name}</span>
                  <span className="xs muted">{ex.muscle} · {ex.equip}{ex.count ? ` · ${ex.count} séances` : ''}</span>
                </button>
                {ex.source === 'custom' && <span className="tag">Perso</span>}
                <button className="icon-btn sq" aria-label={`Ajouter ${ex.name} à la séance`} onClick={() => add(ex.name)}><Icon name="plus" size={18} /></button>
              </div>
            ))}
            {!list.length && (
              <div className="card" style={{ border: '1px dashed var(--border)', background: 'transparent' }}>
                <span>Aucun exercice ne correspond.</span>
                <Link to={`/variante?nom=${encodeURIComponent(q)}`}>Le créer moi-même</Link>
              </div>
            )}
            <Link to="/variante" className="btn dashed only-narrow" style={{ height: 52, marginTop: 8 }}>Il manque ma version ? Créer une variante</Link>
          </div>
        </div>

        <div className="panel only-wide" style={{ paddingTop: 28 }}>
          <VarianteForm base={base} onSaved={() => setBase(null)} embedded />
        </div>
      </div>
    </main>
  );
}
