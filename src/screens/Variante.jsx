import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase.js';
import { useData } from '../data.jsx';
import { MUSCLES, EQUIPS, muscleOf, equipOf } from '../lib/exercises.js';
import { Icon } from '../components.jsx';

function Seg({ options, value, onChange, label }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h2 className="label">{label}</h2>
      <div className="seg" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => <button key={o} type="button" className={value === o ? 'on' : ''} aria-pressed={value === o} onClick={() => onChange(o)}>{o}</button>)}
      </div>
    </div>
  );
}

const stripParen = (n) => n.replace(/\s*\([^)]*\)\s*$/, '');

export function VarianteForm({ base, onSaved, embedded }) {
  const data = useData();
  const [baseName, setBaseName] = useState(base?.name || '');
  const [sens, setSens] = useState('Normal');
  const [prise, setPrise] = useState('Neutre');
  const [cote, setCote] = useState('Deux bras');
  const [notes, setNotes] = useState('');
  const [sep, setSep] = useState(true);
  const [muscle, setMuscle] = useState(base?.muscle || 'Épaules');
  const [equip, setEquip] = useState(base?.equip || 'Machine');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (base) { setBaseName(base.name); setMuscle(base.muscle); setEquip(base.equip); }
  }, [base]);
  useEffect(() => {
    if (!base && baseName) { setMuscle(muscleOf(baseName) === 'Autre' ? muscle : muscleOf(baseName)); setEquip(equipOf(baseName)); }
  }, [baseName]); // eslint-disable-line react-hooks/exhaustive-deps

  const parts = [equip.toLowerCase()];
  if (sens === 'Inversé') parts.push('sens inversé');
  if (prise !== 'Neutre') parts.push(`prise ${prise.toLowerCase()}`);
  if (cote === 'Un bras') parts.push('unilatéral');
  const name = baseName ? `${stripParen(baseName.trim())} (${parts.join(', ')})` : '';

  const save = async () => {
    if (!name) return;
    setSaving(true);
    setMsg('');
    const { error } = await supabase.from('custom_exercises').insert({ name, base: baseName || null, muscle, equip, notes: notes || null, separate_progress: sep });
    setSaving(false);
    if (error) { setMsg(error.code === '23505' ? 'Cette variante existe déjà.' : error.message); return; }
    await data.refresh();
    setMsg('Variante enregistrée.');
    setNotes('');
    onSaved?.(name);
  };

  return (
    <div className={embedded ? 'card' : 'stack'} style={{ gap: 18 }}>
      {embedded && <span className="title-s">Nouvelle variante</span>}
      <label className="stack" style={{ gap: 8 }}>
        <h2 className="label">Exercice de base</h2>
        <input className="input" list="ex-names" value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder="Ex. Développé épaules (machine)" />
        <datalist id="ex-names">{data.exerciseList.map((e) => <option key={e.name} value={e.name} />)}</datalist>
      </label>
      <Seg label="Sens" options={['Normal', 'Inversé']} value={sens} onChange={setSens} />
      <Seg label="Prise" options={['Neutre', 'Pronation', 'Supination']} value={prise} onChange={setPrise} />
      <Seg label="Côté" options={['Deux bras', 'Un bras']} value={cote} onChange={setCote} />
      <div className="grid2">
        <label className="stack" style={{ gap: 8 }}>
          <h2 className="label">Muscle</h2>
          <select className="input" value={muscle} onChange={(e) => setMuscle(e.target.value)}>{MUSCLES.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="stack" style={{ gap: 8 }}>
          <h2 className="label">Matériel</h2>
          <select className="input" value={equip} onChange={(e) => setEquip(e.target.value)}>{EQUIPS.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
      </div>
      <label className="stack" style={{ gap: 8 }}>
        <h2 className="label">Comment je le fais</h2>
        <textarea rows={2} className="input" style={{ height: 'auto', padding: '12px 14px', resize: 'none' }} placeholder="Ex. assis face au dossier, siège cran 4" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="row" style={{ padding: 14, borderRadius: 14, background: embedded ? 'var(--raised)' : 'var(--card)' }}>
        <div className="grow stack" style={{ gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Progression séparée</span>
          <span className="xs muted">Records et graphiques à part de l'exercice de base</span>
        </div>
        <button type="button" className="switch" role="switch" aria-checked={sep} aria-label="Progression séparée" onClick={() => setSep(!sep)}><span /></button>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        <span className="xs muted">Nom dans l'app</span>
        <span className="display" style={{ fontSize: 18, fontWeight: 600 }}>{name || '–'}</span>
      </div>
      <button className="btn primary big" style={{ height: 52, borderRadius: 14 }} disabled={!name || saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer la variante'}</button>
      {msg && <span className="small accent">{msg}</span>}
    </div>
  );
}

export default function Variante() {
  const { state, search } = useLocation();
  const nav = useNavigate();
  const nom = new URLSearchParams(search).get('nom');
  const base = state?.base || (nom ? { name: nom, muscle: muscleOf(nom), equip: equipOf(nom) } : null);
  return (
    <main className="screen">
      <div className="head-row">
        <Link to="/exercices" aria-label="Retour aux exercices" className="icon-btn"><Icon name="back" /></Link>
        <h1 className="title-s grow">Nouvelle variante</h1>
      </div>
      <div className="pad" style={{ paddingTop: 8 }}>
        <VarianteForm base={base} onSaved={() => setTimeout(() => nav('/exercices'), 700)} />
      </div>
    </main>
  );
}
