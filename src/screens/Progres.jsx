import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useData } from '../data.jsx';
import { LineChart, ExerciseImage, GlassHeader, Icon, Bars } from '../components.jsx';
import { fmtKg, fmtDay, fmtInt, isWork, isPlausible } from '../lib/stats.js';
import { muscleLoad, GROUPS, REGIONS } from '../lib/anatomy.js';
import { BodyMap } from '../analysis.jsx';
import { fmtSets, nSets } from '../lib/analysis.js';
import { weeklyFacts } from '../lib/coach.js';

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

  const [allRecords, setAllRecords] = useState(false);
  const records = data.exerciseList.filter((e) => e.best).slice(0, allRecords ? 30 : 5);
  const [sel, setSel] = useState(null);

  // Last 7 days: sessions, tonnage, km, and the muscles they reached.
  const since = Date.now() - 7 * 86400000;
  const recent = data.workouts.filter((w) => w.start.getTime() > since);
  const recentSets = recent.flatMap((w) => w.sets.filter((x) => isWork(x) && isPlausible(x)));
  const load = muscleLoad(recentSets);
  const tonnes = recentSets.reduce((a, x) => a + x.weight_kg * x.reps, 0) / 1000;
  const km = data.runLogs.filter((l) => new Date(l.done_at).getTime() > since).reduce((a, l) => a + Number(l.distance_km || 0), 0);
  const topGroups = Object.entries(load.groups).sort((a, b) => b[1] - a[1]).slice(0, 4);
  // Start at the first month with volume: no row of empty bars before the history began.
  const firstMonth = data.months.findIndex((m) => m.tonnes > 0);
  const months = firstMonth > 0 ? data.months.slice(firstMonth) : data.months;
  const peakIdx = months.reduce((b, m, i) => (m.tonnes > months[b].tonnes ? i : b), 0);
  const facts = weeklyFacts(data);
  const s = data.summary;

  return (
    <main className="screen">
      <GlassHeader eyebrow={`${data.summary.sessions} séance${data.summary.sessions > 1 ? 's' : ''}${data.summary.since ? ` depuis le ${fmtDay(data.summary.since)} ${data.summary.since.getFullYear()}` : ''}`} title="Progrès"
        right={<Link to="/historique" className="icon-btn" aria-label="Historique des séances"><Icon name="list" size={20} /></Link>} />

      {data.workouts.length > 0 && (
        <div className="pad stack" style={{ paddingTop: 8, gap: 12 }}>
          <div className="card" style={{ gap: 14 }}>
            <div className="between"><h2 className="label">7 derniers jours</h2>{data.week.streak > 1 && <span className="row xs" style={{ gap: 4, color: 'var(--ok)', fontWeight: 700 }}><Icon name="flame" size={14} />{data.week.streak} semaines d'affilée</span>}</div>
            <div className="kpis">
              <span><b>{recent.length}</b>séance{recent.length > 1 ? 's' : ''}</span>
              <span><b>{fmtKg(tonnes)}</b>tonne{tonnes >= 2 ? 's' : ''}</span>
              <span><b>{fmtKg(km)}</b>km courus</span>
            </div>
            {recentSets.length > 0 && (
              <>
                <BodyMap regions={load.regions} selected={sel} onPick={(r) => setSel(sel === r ? null : r)} />
                {sel && <span className="small" style={{ lineHeight: 1.45 }}><b>{REGIONS[sel].name} :</b> {nSets(load.regions[sel])}. {REGIONS[sel].what}</span>}
                <div className="kpis small-kpis">
                  {topGroups.map(([g, n]) => <span key={g}><b>{fmtSets(n)}</b>{GROUPS[g].toLowerCase()}</span>)}
                </div>
              </>
            )}
          </div>
          {!!facts.length && (
            <div className="warn">
              <span className="xs" style={{ color: 'var(--warm)', fontWeight: 700 }}>À surveiller</span>
              {facts.map((f) => <span key={f} className="small" style={{ lineHeight: 1.4 }}>{f}</span>)}
            </div>
          )}
        </div>
      )}

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
          {data.exerciseList.filter((e) => e.best).length > 5 && (
            <button className="text-btn" onClick={() => setAllRecords(!allRecords)} aria-expanded={allRecords}>{allRecords ? 'Afficher moins' : 'Tous les records'}</button>
          )}
        </div>
      )}
      {s.sessions > 0 && (
        <div className="section">
          <h2 className="label">Depuis le début</h2>
          <div className="card" style={{ gap: 12 }}>
            <div className="kpis">
              <span><b>{s.sessions}</b>séance{s.sessions > 1 ? 's' : ''}</span>
              <span><b>{Math.round(s.hours)}</b>heure{Math.round(s.hours) >= 2 ? 's' : ''}</span>
              <span><b>{fmtInt(s.tonnes)}</b>tonne{Math.round(s.tonnes) >= 2 ? 's' : ''}</span>
            </div>
            <Bars values={months.map((m) => m.tonnes)} labels={months.map((m) => m.label)} highlight={[peakIdx]} partialLast
              label={`Volume mensuel en tonnes : ${months.map((m) => `${m.date.toLocaleDateString('fr-FR', { month: 'short' })} ${Math.round(m.tonnes)}`).join(', ')}`} />
            <span className="xs muted">Volume soulevé par mois. Pic : {Math.round(months[peakIdx].tonnes)} t.</span>
          </div>
        </div>
      )}
    </main>
  );
}
