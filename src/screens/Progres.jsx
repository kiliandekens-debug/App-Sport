import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useData } from '../data.jsx';
import { LineChart, ExerciseImage, GlassHeader, Icon, Bars } from '../components.jsx';
import { fmtKg, fmtDay, fmtInt, isWork, isPlausible } from '../lib/stats.js';
import { muscleLoad, GROUPS, REGIONS } from '../lib/anatomy.js';
import { BodyMap } from '../analysis.jsx';
import { nSets } from '../lib/analysis.js';
import { weeklyFacts } from '../lib/coach.js';

const METRICS = [
  ['e1rm', '1RM estimé', (v) => `${fmtKg(Math.round(v * 2) / 2)} kg`],
  ['maxKg', 'Charge max', (v) => `${fmtKg(v)} kg`],
  ['vol', 'Volume', (v) => `${fmtInt(v)} kg`],
  ['maxReps', 'Reps', (v) => `${v} reps`],
];

// Strength trend on the estimated 1RM: progress over the last 8 weeks, or a plateau
// (last 4 sessions within ±1.5 %), with what to do about it.
function strengthTrend(history) {
  const h = history.filter((x) => x.e1rm > 0);
  if (h.length < 3) return null;
  const last = h[h.length - 1];
  const tail = h.slice(-4);
  const hi = Math.max(...tail.map((x) => x.e1rm));
  const lo = Math.min(...tail.map((x) => x.e1rm));
  if (tail.length === 4 && hi / lo < 1.015) {
    return { kind: 'flat', word: 'plateau', text: `Plateau : ton 1RM estimé ne bouge plus depuis 4 séances (≈ ${fmtKg(Math.round(last.e1rm * 2) / 2)} kg). Change de plage de répétitions (par exemple 6-8 au lieu de 10-12) ou de variante pendant 3 semaines.` };
  }
  const from = new Date(last.date).getTime() - 56 * 86400000;
  const base = h.find((x) => new Date(x.date).getTime() >= from) || h[0];
  if (base === last) return null;
  const pct = Math.round(((last.e1rm - base.e1rm) / base.e1rm) * 100);
  const weeks = Math.max(1, Math.round((new Date(last.date) - new Date(base.date)) / (7 * 86400000)));
  if (pct >= 2) return { kind: 'up', word: 'en progression' };
  if (pct <= -3) return { kind: 'down', word: 'en baisse', text: `En baisse depuis ${weeks} semaine${weeks > 1 ? 's' : ''} : fatigue, sommeil ou trop de volume. Une semaine allégée peut aider.` };
  return { kind: 'flat', word: 'stable' };
}

export default function Progres() {
  const data = useData();
  const list = data.exerciseList.filter((e) => e.history.length >= 2);
  const [name, setName] = useState(list[0]?.name || '');
  const [metric, setMetric] = useState('e1rm');
  const ex = data.exercises.get(name);
  const hist = ex ? ex.history.slice(-12) : [];
  const [, label, fmt] = METRICS.find((m) => m[0] === metric);
  const values = hist.map((h) => h[metric]);
  const last = hist[hist.length - 1];
  const delta = values.length ? Math.round((values[values.length - 1] - values[0]) * 10) / 10 : 0;
  const trend = ex ? strengthTrend(ex.history) : null;

  const [allRecords, setAllRecords] = useState(false);
  const allBest = data.exerciseList.filter((e) => e.best).sort((a, b) => b.best.date - a.best.date);
  const records = allBest.slice(0, allRecords ? 30 : 3);
  const pct = values.length && values[0] ? Math.round(((values[values.length - 1] - values[0]) / values[0]) * 100) : 0;
  const [sel, setSel] = useState(null);

  // Last 7 days: sessions, tonnage, km, and the muscles they reached.
  const since = Date.now() - 7 * 86400000;
  const recent = data.workouts.filter((w) => w.start.getTime() > since);
  const recentSets = recent.flatMap((w) => w.sets.filter((x) => isWork(x) && isPlausible(x)));
  const load = muscleLoad(recentSets);
  const tonnes = recentSets.reduce((a, x) => a + x.weight_kg * x.reps, 0) / 1000;
  const km = data.runLogs.filter((l) => new Date(l.done_at).getTime() > since).reduce((a, l) => a + Number(l.distance_km || 0), 0);
  const walks = data.walkLogs.filter((l) => new Date(l.done_at).getTime() > since);
  const dplus = Math.round(walks.reduce((a, l) => a + Number(l.elevation_m || 0), 0));
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
          <div className="card" style={{ gap: 12 }}>
            <div className="between"><h2 className="label">Ta semaine</h2>{data.week.streak > 1 && <span className="row xs" style={{ gap: 4, color: 'var(--ok)', fontWeight: 700 }}><Icon name="flame" size={14} />{data.week.streak} semaines d'affilée</span>}</div>
            <div className="kpis">
              <span><b>{recent.length}</b>séance{recent.length > 1 ? 's' : ''}</span>
              <span><b>{fmtKg(tonnes)}</b>tonne{tonnes >= 2 ? 's' : ''}</span>
              <span><b>{fmtKg(km)}</b>km couru{km >= 2 ? 's' : ''}</span>
            </div>
            {walks.length > 0 && <span className="small"><span className="muted">Marche et tapis : </span><b>{walks.length}</b> séance{walks.length > 1 ? 's' : ''}{dplus ? <>, <b>{dplus}</b> m de dénivelé</> : null}</span>}
            {recentSets.length > 0 && (
              <>
                <span className="small" style={{ lineHeight: 1.45 }}>
                  <span className="muted">Séries par muscle : </span>
                  {topGroups.map(([g, n], i) => <span key={g}>{i ? ' · ' : ''}{GROUPS[g]} <b>{Math.round(n)}</b></span>)}
                </span>
                <details className="disclose">
                  <summary>Voir le schéma des muscles</summary>
                  <div className="stack" style={{ gap: 8, paddingTop: 8 }}>
                    <BodyMap regions={load.regions} selected={sel} onPick={(r) => setSel(sel === r ? null : r)} />
                    {sel && <span className="small" style={{ lineHeight: 1.45 }}><b>{REGIONS[sel].name} :</b> {nSets(load.regions[sel])}. {REGIONS[sel].what}</span>}
                  </div>
                </details>
              </>
            )}
            {!!facts.length && (
              <div className="warn" style={{ gap: 2 }}>
                <span className="small" style={{ lineHeight: 1.4 }}><b style={{ color: 'var(--warm)' }}>À surveiller : </b>{facts[0]}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!list.length ? (
        <div className="pad"><div className="card"><span className="muted">Pas encore assez de séances pour tracer une progression.</span></div></div>
      ) : (
        <>
          <div className="pad stack" style={{ paddingTop: 16, gap: 6 }}>
            <h2 className="label">Un exercice</h2>
            <select className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Exercice">
              {list.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
          </div>

          {ex && last && (
            <div className="card lg" style={{ margin: '10px 20px 0', gap: 14 }}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <select className="metric-pick" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Mesure affichée">
                    {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <span className="display" style={{ fontSize: 34, lineHeight: 1.1 }}>{fmt(last[metric])}</span>
                  <span className="small" style={{ color: delta > 0 ? 'var(--ok)' : delta < 0 && metric === 'e1rm' ? 'var(--danger)' : 'var(--muted)', fontWeight: 600 }}>
                    {delta === 0 ? 'Stable' : `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))} (${pct > 0 ? '+' : ''}${pct} %)`} depuis le {fmtDay(hist[0].date)}{metric === 'e1rm' && trend?.word && delta !== 0 ? `, ${trend.word}` : ''}
                  </span>
                </div>
                <ExerciseImage name={ex.name} size={56} />
              </div>
              <LineChart values={values} format={fmt} label={`${label} par séance : ${values.map((v) => fmt(v)).join(', ')}`} />
              <div className="between xs muted"><span>{fmtDay(hist[0].date)}</span><span>{fmtDay(last.date)}</span></div>
              {metric === 'e1rm' && trend?.text && (
                <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0, background: trend.kind === 'up' ? 'var(--ok)' : trend.kind === 'down' ? 'var(--danger)' : 'var(--accent)' }} />
                  <span className="small" style={{ lineHeight: 1.45 }}>{trend.text}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!!records.length && (
        <div className="section">
          <h2 className="label">Tes derniers records</h2>
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
          {allBest.length > 3 && (
            <button className="text-btn" onClick={() => setAllRecords(!allRecords)} aria-expanded={allRecords}>{allRecords ? 'Afficher moins' : 'Tous les records'}</button>
          )}
        </div>
      )}
      {s.sessions > 0 && (
        <div className="section">
          <h2 className="label">Depuis le début</h2>
          <div className="card" style={{ gap: 8 }}>
            <div className="kpis">
              <span><b>{s.sessions}</b>séance{s.sessions > 1 ? 's' : ''}</span>
              <span><b>{Math.round(s.hours)}</b>heure{Math.round(s.hours) >= 2 ? 's' : ''}</span>
              <span><b>{fmtInt(s.tonnes)}</b>tonne{Math.round(s.tonnes) >= 2 ? 's' : ''}</span>
            </div>
            <details className="disclose">
              <summary>Volume par mois</summary>
              <div className="stack" style={{ gap: 8, paddingTop: 8 }}>
                <Bars values={months.map((m) => m.tonnes)} labels={months.map((m) => m.label)} highlight={[peakIdx]} partialLast
                  label={`Volume mensuel en tonnes : ${months.map((m) => `${m.date.toLocaleDateString('fr-FR', { month: 'short' })} ${Math.round(m.tonnes)}`).join(', ')}`} />
                <span className="xs muted">Volume soulevé par mois. Pic : {Math.round(months[peakIdx].tonnes)} t.</span>
              </div>
            </details>
          </div>
        </div>
      )}
    </main>
  );
}
