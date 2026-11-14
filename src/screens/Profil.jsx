import { useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import { useData, importWorkouts } from '../data.jsx';
import { parseHevyCsv } from '../lib/csv.js';
import { Bars, Icon } from '../components.jsx';
import { fmtDay, fmtInt } from '../lib/stats.js';
import { weeklyFacts } from '../lib/coach.js';

const COLORS = ['var(--accent)', '#5AC8FA', '#FF8A3D', '#D4D4D8', '#6E6E76', '#B38CFF', '#3A3A40', '#FF5C5C'];

export default function Profil({ user }) {
  const data = useData();
  const fileRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const { summary: s, months, muscles } = data;
  const facts = weeklyFacts(data);
  const name = user?.user_metadata?.name || 'Kilian';
  const peakIdx = months.reduce((b, m, i) => (m.tonnes > months[b].tonnes ? i : b), 0);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus('Lecture du fichier…');
    try {
      const parsed = parseHevyCsv(await file.text());
      if (!parsed.length) throw new Error('Aucune séance trouvée dans ce fichier.');
      const res = await importWorkouts(parsed, data.workouts, (d, t) => setStatus(`Import… ${d} / ${t} séances`));
      await data.refresh();
      setStatus(`${res.added} séances ajoutées${res.skipped ? `, ${res.skipped} déjà présentes` : ''}.`);
    } catch (err) {
      setStatus(`Échec de l'import : ${err.message || err}`);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <main className="screen">
      <div className="row" style={{ padding: '24px 20px 8px', gap: 14 }}>
        <div className="display accent" style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{name[0]}</div>
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="title" style={{ fontSize: 28 }}>{name}</h1>
          <span className="small muted">{s.since ? `Membre depuis le ${fmtDay(s.since)} ${s.since.getFullYear()}` : user?.email}</span>
        </div>
      </div>

      <div className="pad grid2" style={{ paddingTop: 8 }}>
        <div className="tile" style={{ borderRadius: 16, padding: '12px 14px' }}><span className="xs muted">Séances</span><span className="v accent" style={{ fontSize: 24, fontWeight: 700 }}>{s.sessions}</span></div>
        <div className="tile" style={{ borderRadius: 16, padding: '12px 14px' }}><span className="xs muted">Temps sous la barre</span><span className="v" style={{ fontSize: 24, fontWeight: 700 }}>{Math.round(s.hours)} h</span></div>
        <div className="tile" style={{ borderRadius: 16, padding: '12px 14px' }}><span className="xs muted">Tonnage total</span><span className="v" style={{ fontSize: 24, fontWeight: 700 }}>{fmtInt(s.tonnes)} t</span></div>
        <div className="tile" style={{ borderRadius: 16, padding: '12px 14px' }}><span className="xs muted">Séries de travail</span><span className="v" style={{ fontSize: 24, fontWeight: 700 }}>{fmtInt(s.workSets)}</span></div>
      </div>

      {s.sessions > 0 && (
        <>
          <div className="card" style={{ margin: '14px 20px 0', padding: 16, gap: 10 }}>
            <div className="between">
              <span style={{ fontSize: 14, fontWeight: 600 }}>Volume par mois</span>
              <span className="xs muted">pic : {Math.round(months[peakIdx].tonnes)} t</span>
            </div>
            <Bars
              values={months.map((m) => m.tonnes)}
              labels={months.map((m) => m.label)}
              highlight={[peakIdx]}
              partialLast
              label={`Volume mensuel en tonnes : ${months.map((m) => `${m.date.toLocaleDateString('fr-FR', { month: 'short' })} ${Math.round(m.tonnes)}`).join(', ')}`}
            />
          </div>

          <div className="card" style={{ margin: '14px 20px 0', padding: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Répartition des séries</span>
            <div role="img" aria-label={muscles.map((m) => `${m.name} ${Math.round(m.pct)} %`).join(', ')} style={{ height: 14, borderRadius: 7, overflow: 'hidden', display: 'flex' }}>
              {muscles.map((m, i) => <div key={m.name} style={{ width: `${Math.max(m.pct, 0.6)}%`, background: COLORS[i % COLORS.length] }} />)}
            </div>
            <div className="grid2" style={{ gap: '6px 12px' }}>
              {muscles.map((m, i) => (
                <div key={m.name} className="row" style={{ gap: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                  <span className="grow">{m.name}</span>
                  <span className="muted">{m.pct < 1 ? '< 1 %' : `${Math.round(m.pct)} %`}</span>
                </div>
              ))}
            </div>
          </div>

          {!!facts.length && (
            <div className="warn" style={{ margin: '14px 20px 0' }}>
              <span className="xs" style={{ color: 'var(--rest)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>À surveiller</span>
              {facts.map((f) => <span key={f} className="small" style={{ lineHeight: 1.4 }}>{f}</span>)}
            </div>
          )}
        </>
      )}

      <div className="section">
        <span className="label">Données</span>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        <button className="btn" style={{ borderRadius: 14, height: 52 }} disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={18} />Importer un export Hevy (.csv)
        </button>
        {status && <span className="small soft">{status}</span>}
        <span className="xs muted">Les séances déjà présentes (même date et heure) sont ignorées, tu peux réimporter sans doublons.</span>
        <button className="btn" style={{ borderRadius: 14, height: 48, background: 'transparent', border: '1px solid var(--border)' }} onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        <span className="xs muted" style={{ paddingBottom: 12 }}>Connecté : {user?.email}</span>
      </div>
    </main>
  );
}
