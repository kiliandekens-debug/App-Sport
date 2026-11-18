import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useData } from '../data.jsx';
import { LineChart, ExerciseImage, GlassHeader, Icon } from '../components.jsx';
import { fmtKg, fmtDay, fmtInt } from '../lib/stats.js';

const METRICS = [
  ['maxKg', 'Charge max', (v) => `${fmtKg(v)} kg`],
  ['vol', 'Volume', (v) => `${fmtInt(v)} kg`],
  ['maxReps', 'Reps', (v) => `${v} reps`],
];

export default function Progres() {
  const data = useData();
  const list = data.exerciseList.filter((e) => e.history.length >= 2);
  const [name, setName] = useState(list[0]?.name || '');
  const [metric, setMetric] = useState('maxKg');
  const ex = data.exercises.get(name);
  const hist = ex ? ex.history.slice(-12) : [];
  const [, label, fmt] = METRICS.find((m) => m[0] === metric);
  const values = hist.map((h) => h[metric]);
  const last = hist[hist.length - 1];
  const delta = values.length ? Math.round((values[values.length - 1] - values[0]) * 10) / 10 : 0;

  const records = data.exerciseList.slice(0, 8).filter((e) => e.best);

  return (
    <main className="screen">
      <GlassHeader eyebrow={`${data.summary.sessions} séance${data.summary.sessions > 1 ? 's' : ''}${data.summary.since ? ` depuis le ${fmtDay(data.summary.since)} ${data.summary.since.getFullYear()}` : ''}`} title="Progrès"
        right={<Link to="/historique" className="icon-btn" aria-label="Historique des séances"><Icon name="list" size={20} /></Link>} />

      {!list.length ? (
        <div className="pad"><div className="card"><span className="muted">Pas encore assez de séances pour tracer une progression.</span></div></div>
      ) : (
        <>
          <div className="pad stack" style={{ paddingTop: 8 }}>
            <label className="stack" style={{ gap: 6 }}>
              <h2 className="label">Exercice</h2>
              <select className="input" value={name} onChange={(e) => setName(e.target.value)}>
                {list.map((e) => <option key={e.name} value={e.name}>{e.name} ({e.history.length})</option>)}
              </select>
            </label>
            <div className="chips">
              {METRICS.map(([k, l]) => (
                <button key={k} className={`chip ${metric === k ? 'on' : ''}`} onClick={() => setMetric(k)} aria-pressed={metric === k}>{l}</button>
              ))}
            </div>
          </div>

          {ex && last && (
            <div className="card lg" style={{ margin: '16px 20px 0', gap: 14 }}>
              <div className="between" style={{ alignItems: 'flex-end' }}>
                <div className="stack" style={{ gap: 4 }}>
                  <span className="small muted">{label}, dernière séance</span>
                  <span className="display" style={{ fontSize: 34, lineHeight: 1.1 }}>{fmt(last[metric])}</span>
                  <span className="xs" style={{ color: delta > 0 ? 'var(--ok)' : 'var(--muted)' }}>
                    {delta === 0 ? 'Stable' : `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))}`} depuis le {fmtDay(hist[0].date)}
                  </span>
                </div>
                <ExerciseImage name={ex.name} size={56} />
              </div>
              <LineChart values={values} format={fmt} label={`${label} par séance : ${values.map((v) => fmt(v)).join(', ')}`} />
              <div className="between xs muted"><span>{fmtDay(hist[0].date)}</span><span>{fmtDay(last.date)}</span></div>
            </div>
          )}
        </>
      )}

      {!!records.length && (
        <div className="section">
          <h2 className="label">Records personnels</h2>
          <div className="list">
            {records.map((e) => (
              <div key={e.name}>
                <span style={{ fontSize: 15 }} className="grow">{e.name}</span>
                <span className="stack" style={{ gap: 0, alignItems: 'flex-end' }}>
                  <span className="display" style={{ fontWeight: 600 }}>{fmtKg(e.best.kg)} kg × {e.best.reps}</span>
                  <span className="xs muted">{fmtDay(e.best.date)} {e.best.date.getFullYear()}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
