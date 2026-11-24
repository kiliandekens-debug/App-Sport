import { useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import { Link } from 'react-router-dom';
import { useData, importWorkouts, exportCsv, importRuns, deleteAccount } from '../data.jsx';
import { readStravaFile } from '../lib/strava.js';
import { MonthCalendar } from '../day.jsx';
import { VERSION, BUILD, BUILT_AT } from '../changelog.js';
import { WhatsNew } from '../update.jsx';
import { PasswordForm } from '../password.jsx';
import { pushSupported, pushEnabled, enablePush, disablePush, testPush, isIos, isStandalone, pushEvery, setPushEvery } from '../push.js';
import { buildPlan } from '../lib/running.js';
import { isNative, healthRuns } from '../native.js';
import { testLive } from '../watch.js';
import { useSession, keepAwake, setKeepAwake, autoWarmup, setAutoWarmup, hasLest, setHasLest } from '../session.jsx';
import { useUi } from '../ui.jsx';
import { parseHevyCsv } from '../lib/csv.js';
import { Icon, GlassHeader } from '../components.jsx';
import { fmtDay } from '../lib/stats.js';
import { getTheme, setTheme } from '../theme.js';
import { betaActive, redeemCode, ensureHealthConsent, hasHealthConsent, withdrawHealthConsent } from '../beta.js';
import { FeedbackSheet } from '../feedback.jsx';

export default function Profil({ user }) {
  const data = useData();
  const fileRef = useRef(null);
  const stravaRef = useRef(null);
  const [stravaStatus, setStravaStatus] = useState('');
  const [news, setNews] = useState(false);
  const [pwd, setPwd] = useState(false);
  const [push, setPush] = useState(pushEnabled);
  const [pushMsg, setPushMsg] = useState('');
  const [every, setEvery] = useState(pushEvery);
  const [awake, setAwake] = useState(keepAwake);
  const [warm, setWarm] = useState(autoWarmup);
  const [lest, setLest] = useState(hasLest);
  const [feedback, setFeedback] = useState(false);
  const [healthOk, setHealthOk] = useState(() => hasHealthConsent(user));
  const togglePush = async () => {
    setPushMsg('');
    try {
      if (push) { await disablePush(); setPush(false); ui.notify('Notifications désactivées'); }
      else { await enablePush(); setPush(true); ui.notify('Notifications activées'); }
    } catch (e) { setPushMsg(e.message || String(e)); }
  };
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setThemeState] = useState(getTheme);
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const ui = useUi();
  const download = () => {
    const blob = new Blob(['\ufeff' + exportCsv(data.workouts)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kadeon-sport-export-${new Date().toLocaleDateString('sv-SE')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const signOut = async () => {
    if (session.active && !(await ui.confirm({ title: 'Une séance est en cours', message: 'Elle sera perdue si tu te déconnectes maintenant.', ok: 'Se déconnecter', danger: true }))) return;
    session.cancel();
    supabase.auth.signOut();
  };
  const { summary: s } = data;
  const name = user?.user_metadata?.name || 'Kilian';

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
      setStatus(`${res.added} séance${res.added > 1 ? 's' : ''} ajoutée${res.added > 1 ? 's' : ''}${res.skipped ? `, ${res.skipped} déjà présente${res.skipped > 1 ? 's' : ''}` : ''}.`);
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
    if (!(await ensureHealthConsent(ui))) { e.target.value = ''; return; }
    setHealthOk(true);
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
  const removeAccount = async () => {
    if (!(await ui.confirm({ title: 'Supprimer ton compte ?', message: 'Toutes tes séances, courses, routines et réglages seront effacés définitivement. Exporte d\'abord tes séances si tu veux les garder.', ok: 'Continuer', danger: true }))) return;
    if (!(await ui.confirm({ title: 'Dernière confirmation', message: 'Cette action est irréversible.', ok: 'Supprimer définitivement', danger: true }))) return;
    try {
      await deleteAccount();
      session.cancel();
      await supabase.auth.signOut();
    } catch (e) { ui.notify(e.message || String(e)); }
  };
  const onHealth = async () => {
    if (!(await ensureHealthConsent(ui))) return;
    setHealthOk(true);
    setBusy(true);
    setStravaStatus('Lecture d\'Apple Santé…');
    try {
      const runs = await healthRuns(365);
      const res = await importRuns(runs, data.runLogs);
      await data.refresh();
      setStravaStatus(runs.length ? `${res.added} course${res.added > 1 ? 's' : ''} ajoutée${res.added > 1 ? 's' : ''}${res.skipped ? `, ${res.skipped} déjà présente${res.skipped > 1 ? 's' : ''}` : ''}.` : 'Aucune course trouvée dans Apple Santé. Vérifie l\'accès dans Réglages › Santé › Accès aux données.');
    } catch (err) {
      setStravaStatus(`Échec : ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };
  const enterCode = async () => {
    const code = await ui.prompt({ title: 'Code bêta', message: 'Le code reçu de Kilian, par exemple KAD-ABCD-EFGH.', ok: 'Valider' });
    if (!code) return;
    try {
      const r = await redeemCode(code);
      await data.refresh();
      ui.notify(`Bienvenue dans la bêta : place n° ${r.seat}`);
    } catch (e) { ui.notify(e.message || String(e)); }
  };
  const withdrawHealth = async () => {
    if (!(await ui.confirm({ title: 'Retirer ton accord ?', message: 'Kadence n\'importera plus de courses depuis Apple Santé ni Strava. Les courses déjà enregistrées restent : tu peux les supprimer une par une dans Course, ou tout effacer en supprimant ton compte.', ok: 'Retirer mon accord', danger: true }))) return;
    try { await withdrawHealthConsent(); setHealthOk(false); ui.notify('Accord retiré'); } catch (e) { ui.notify(e.message || String(e)); }
  };
  const beta = data.access?.beta;
  const planned = data.runProfile ? buildPlan(data.runProfile, data.runLogs, data.workouts).weeks.flat() : [];

  const Row = ({ icon, tint, children, onClick, to, right, danger, ...rest }) => {
    const inner = (
      <>
        {icon && <span className="gi" style={tint ? { background: tint, color: '#fff' } : null}><Icon name={icon} size={17} /></span>}
        <span className="grow gl" style={danger ? { color: 'var(--danger)' } : null}>{children}</span>
        {right}
      </>
    );
    if (to) return <Link to={to} className="grow-row" {...rest}>{inner}<Icon name="chevron" size={16} /></Link>;
    if (onClick) return <button className="grow-row" onClick={onClick} {...rest}>{inner}</button>;
    return <div className="grow-row" {...rest}>{inner}</div>;
  };

  return (
    <main className="screen">
      <GlassHeader eyebrow={s.since ? `Membre depuis le ${fmtDay(s.since)} ${s.since.getFullYear()}` : user?.email} title={name}
        lead={<div className="glass-avatar display" aria-hidden="true">{name[0]}</div>} />

      <div className="section" style={{ paddingTop: 8 }}>
        <h2 className="label">Calendrier</h2>
        <MonthCalendar planned={planned} />
      </div>

      <div className="section">
        <h2 className="label">Pendant la séance</h2>
        <div className="glist">
          <Row icon="bell" tint="#FF3B30" right={<button className="switch" role="switch" aria-checked={push} aria-label="Notification de fin de repos" onClick={togglePush}><span /></button>}>
            Notification de fin de repos
          </Row>
          {push && (
            <div className="grow-row" style={{ display: 'block' }}>
              <div className="seg" role="group" aria-label="Rappels pendant le repos" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {[[0, 'À la fin'], [30, 'Toutes les 30 s'], [15, 'Toutes les 15 s']].map(([v, l]) => (
                  <button key={v} className={every === v ? 'on' : ''} aria-pressed={every === v} onClick={() => { setPushEvery(v); setEvery(v); }}>{l}</button>
                ))}
              </div>
            </div>
          )}
          <Row icon="sun" tint="#FF9500" right={<button className="switch" role="switch" aria-checked={awake} aria-label="Garder l'écran allumé" onClick={() => { setKeepAwake(!awake); setAwake(!awake); ui.notify(!awake ? 'Écran allumé pendant la séance' : 'L\'écran pourra se verrouiller (effet à la prochaine séance)'); }}><span /></button>}>
            Garder l'écran allumé
          </Row>
          <Row icon="flame" tint="#FF2D55" right={<button className="switch" role="switch" aria-checked={warm} aria-label="Échauffement automatique" onClick={() => { setAutoWarmup(!warm); setWarm(!warm); ui.notify(!warm ? 'Échauffement ajouté sur le premier exercice lourd de chaque muscle' : 'Échauffement seulement à la demande'); }}><span /></button>}>
            Échauffement automatique
          </Row>
          <Row icon="dumbbell" tint="#5856D6" right={<button className="switch" role="switch" aria-checked={lest} aria-label="Ceinture de lest pour tractions et dips" onClick={() => { setHasLest(!lest); setLest(!lest); ui.notify(!lest ? 'Le coach proposera du lest dès 12 reps aux tractions et aux dips' : 'Le coach restera au poids du corps'); }}><span /></button>}>
            Lest pour tractions et dips
          </Row>
          {isNative() && !session.active && <Row icon="flame" tint="#E8500E" onClick={async () => { const msg = await testLive(() => !sessionRef.current.active); await ui.confirm({ title: 'Dynamic Island', message: msg, ok: 'OK' }); }}>Tester la Dynamic Island</Row>}
          {push && <Row icon="send" tint="#8E8E93" onClick={async () => { try { await testPush(); ui.notify('Notification de test dans 5 secondes'); } catch (e) { ui.notify(e.message || String(e)); } }}>Envoyer une notification de test</Row>}
        </div>
        <span className="gfoot">
          {!isNative() && isIos() && !isStandalone() && !push
            ? 'Sur iPhone, les notifications marchent seulement depuis l\'app ajoutée à l\'écran d\'accueil.'
            : !pushSupported() && !isIos() ? 'Ce navigateur ne gère pas les notifications.'
            : 'Sur l\'Apple Watch, les notifications arrivent quand l\'iPhone est verrouillé.'}
        </span>
        {pushMsg && <span className="small" style={{ color: 'var(--danger)', lineHeight: 1.4 }}>{pushMsg}</span>}
      </div>

      <div className="section">
        <h2 className="label">Apparence</h2>
        <div className="seg" role="group" aria-label="Apparence" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => (
            <button key={k} className={theme === k ? 'on' : ''} aria-pressed={theme === k} onClick={() => { setTheme(k); setThemeState(k); }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="section">
        <h2 className="label">Données</h2>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        <input ref={stravaRef} type="file" accept=".zip,.csv,application/zip,text/csv" hidden onChange={onStrava} />
        <div className="glist">
          <Row icon="list" tint="#007AFF" to="/historique">Historique des séances</Row>
          {isNative() && <Row icon="flame" tint="#FF2D55" onClick={onHealth} disabled={busy}>Importer depuis Apple Santé</Row>}
          <Row icon="upload" tint="#5856D6" onClick={() => fileRef.current?.click()} disabled={busy}>Importer depuis Hevy</Row>
          <Row icon="run" tint="#FC4C02" onClick={() => stravaRef.current?.click()} disabled={busy}>Importer depuis Strava</Row>
          {s.sessions > 0 && <Row icon="download" tint="#34C759" onClick={download}>Exporter mes séances (.csv)</Row>}
        </div>
        {(status || stravaStatus) && <span className="small soft">{status || stravaStatus}</span>}
        <details className="gfoot">
          <summary>Où trouver ces fichiers ?</summary>
          <p><b>Hevy :</b> Profil, Réglages, Exporter les données.</p>
          <p><b>Strava :</b> sur strava.com, Paramètres, Mon compte, « Télécharger ou supprimer votre compte », « Demander une archive ». Choisis ici le .zip reçu par e-mail. Seules les courses sont importées.</p>
          <p>Les doublons sont ignorés : tu peux réimporter sans risque.</p>
        </details>
      </div>

      <div className="section">
        <h2 className="label">Bêta</h2>
        <div className="glist">
          {beta ? (
            <Row icon="spark" tint="#E8500E" right={<span className="xs muted">{betaActive(beta) ? `jusqu'au ${fmtDay(new Date(beta.ends_at))} ${new Date(beta.ends_at).getFullYear()}` : 'terminée'}</span>}>
              Bêta-testeur n° {beta.seat}
            </Row>
          ) : (
            <Row icon="spark" tint="#E8500E" onClick={enterCode}>J'ai un code bêta</Row>
          )}
          <Row icon="send" tint="#34C759" onClick={() => setFeedback(true)}>Donner mon avis</Row>
        </div>
        {beta && betaActive(beta) && <span className="gfoot">Tout Kadence est gratuit pour toi pendant la bêta. Merci pour tes retours.</span>}
      </div>

      <div className="section">
        <h2 className="label">Compte</h2>
        <div className="glist">
          {data.superadmin && <Row icon="user" tint="#8E8E93" onClick={() => window.open('https://admin.kadeon.be', '_blank')}>Back-office</Row>}
          <Row icon="edit" tint="#8E8E93" onClick={() => setPwd(!pwd)} aria-expanded={pwd}>Mot de passe</Row>
          <Row icon="spark" tint="#E8500E" onClick={() => setNews(true)} right={<span className="xs muted">{VERSION}</span>}>Nouveautés</Row>
          <Row onClick={signOut} danger>Se déconnecter</Row>
        </div>
        <div className="glist">
          <Row icon="trash" tint="#FF3B30" onClick={removeAccount} danger>Supprimer mon compte</Row>
          <Row icon="link" tint="#8E8E93" onClick={() => window.open('https://sport.kadeon.be/confidentialite.html', '_blank')}>Confidentialité</Row>
          {healthOk && <Row onClick={withdrawHealth} danger>Retirer mon accord pour les données de santé</Row>}
        </div>
        {pwd && <div className="card"><PasswordForm onDone={() => setPwd(false)} /></div>}
        <span className="gfoot" style={{ textAlign: 'center' }}>{user?.email}<br />Kadence {VERSION} ({BUILD}), {new Date(BUILT_AT).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <WhatsNew open={news} onClose={() => setNews(false)} />
      {feedback && <FeedbackSheet onClose={() => setFeedback(false)} onSent={() => ui.notify('Merci, message envoyé')} />}
    </main>
  );
}
