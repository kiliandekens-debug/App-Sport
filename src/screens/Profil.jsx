import { useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import { Link } from 'react-router-dom';
import { useData, importWorkouts, exportCsv, importRuns } from '../data.jsx';
import { readStravaFile } from '../lib/strava.js';
import { MonthCalendar } from '../day.jsx';
import { buildPlan } from '../lib/running.js';
import { useSession } from '../session.jsx';
import { useUi } from '../ui.jsx';
import { parseHevyCsv } from '../lib/csv.js';
import { Bars, Icon, GlassHeader } from '../components.jsx';
import { fmtDay, fmtInt } from '../lib/stats.js';
import { weeklyFacts } from '../lib/coach.js';
import { getTheme, setTheme } from '../theme.js';

const COLORS = ['var(--accent)', 'var(--z0)', 'var(--z1)', 'var(--drop)', 'var(--z3)', 'var(--text)', 'var(--muted)', 'var(--border)'];

export default function Profil({ user }) {
  const data = useData();
  const fileRef = useRef(null);
  const stravaRef = useRef(null);
  const [stravaStatus, setStravaStatus] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setThemeState] = useState(getTheme);
  const session = useSession();
  const ui = useUi();
  const download = () => {
    const blob = new Blob(['\ufeff' + exportCsv(data.workouts)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `salle-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const signOut = async () => {
    if (session.active && !(await ui.confirm({ title: 'Une séance est en cours', message: 'Elle sera perdue si tu te déconnectes maintenant.', ok: 'Se déconnecter', danger: true }))) return;
    session.cancel();
    supabase.auth.signOut();
  };
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

  const onStrava = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStravaStatus('Lecture de l\'export Strava…');
    try {
      const runs = await readStravaFile(file);
      if (!runs.length) throw new Error('Aucune course trouvée dans ce fichier.');
      const res = await importRuns(runs, data.runLogs);
      await data.refresh();
      setStravaStatus(`${res.added} course${res.added > 1 ? 's' : ''} ajoutée${res.added > 1 ? 's' : ''}${res.skipped ? `, ${res.skipped} déjà présente${res.skipped > 1 ? 's' : ''}` : ''}.`);
    } catch (err) {
      setStravaStatus(`Échec de l'import : ${err.message || err}`);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  const planned = data.runProfile ? buildPlan(data.runProfile, data.runLogs, data.workouts).weeks.flat() : [];

  return (
    <main className="screen">
      <GlassHeader eyebrow={s.since ? `Membre depuis le ${fmtDay(s.since)} ${s.since.getFullYear()}` : user?.email} title={name}
        lead={<div className="glass-avatar display" aria-hidden="true">{name[0]}</div>} />

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
              <span className="xs" style={{ color: 'var(--warm)', fontWeight: 700 }}>À surveiller</span>
              {facts.map((f) => <span key={f} className="small" style={{ lineHeight: 1.4 }}>{f}</span>)}
            </div>
          )}
        </>
      )}

      <div className="section">
        <span className="label">Calendrier</span>
        <MonthCalendar planned={planned} />
      </div>

      <div className="section">
        <span className="label">Apparence</span>
        <div className="seg" role="group" aria-label="Apparence" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => (
            <button key={k} className={theme === k ? 'on' : ''} aria-pressed={theme === k} onClick={() => { setTheme(k); setThemeState(k); }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="section">
        <span className="label">Données</span>
        <Link to="/historique" className="btn" style={{ height: 52, justifyContent: 'flex-start' }}><Icon name="list" size={18} /><span className="grow" style={{ textAlign: 'left' }}>Historique des séances</span><Icon name="chevron" size={18} /></Link>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        <button className="btn" style={{ borderRadius: 14, height: 52 }} disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={18} />Importer un export Hevy (.csv)
        </button>
        {status && <span className="small soft">{status}</span>}
        {s.sessions > 0 && <button className="btn" style={{ height: 52 }} onClick={download}><Icon name="upload" size={18} />Exporter mes séances de salle (.csv)</button>}
        <span className="xs muted">Les séances déjà présentes (même date et heure) sont ignorées, tu peux réimporter sans doublons.</span>
        <input ref={stravaRef} type="file" accept=".zip,.csv,application/zip,text/csv" hidden onChange={onStrava} />
        <button className="btn" style={{ height: 52, marginTop: 6 }} disabled={busy} onClick={() => stravaRef.current?.click()}>
          <Icon name="run" size={18} />Importer mes courses Strava
        </button>
        {stravaStatus && <span className="small soft">{stravaStatus}</span>}
        <span className="xs muted" style={{ lineHeight: 1.45 }}>Sur strava.com (pas dans l'app) : Paramètres, Mon compte, « Télécharger ou supprimer votre compte », puis « Demander une archive ». Strava t'envoie un lien par e-mail : choisis ici le fichier .zip reçu, ou le fichier activities.csv qu'il contient. Seules les courses à pied sont importées, sans doublon.</span>
        <button className="btn" style={{ color: 'var(--danger)' }} onClick={signOut}>Se déconnecter</button>
        <span className="xs muted" style={{ paddingBottom: 12 }}>Connecté : {user?.email}</span>
      </div>
    </main>
  );
}
