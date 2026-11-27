import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabase.js';
import { useData, importWorkouts, exportCsv, importRuns, deleteAccount } from '../data.jsx';
import { readStravaFile } from '../lib/strava.js';
import { VERSION, BUILD, BUILT_AT } from '../changelog.js';
import { WhatsNew } from '../update.jsx';
import { PasswordForm } from '../password.jsx';
import { pushSupported, pushEnabled, enablePush, disablePush, testPush, isIos, isStandalone, pushEvery, setPushEvery } from '../push.js';
import { isNative, healthRuns } from '../native.js';
import { testLive } from '../watch.js';
import { useSession, keepAwake, setKeepAwake, autoWarmup, setAutoWarmup, hasLest, setHasLest } from '../session.jsx';
import { useUi } from '../ui.jsx';
import { parseHevyCsv } from '../lib/csv.js';
import { GlassHeader, Group, SettingRow } from '../components.jsx';
import { fmtDay } from '../lib/stats.js';
import { getTheme, setTheme } from '../theme.js';
import { betaActive, redeemCode, ensureHealthConsent, hasHealthConsent, withdrawHealthConsent } from '../beta.js';
import { FeedbackSheet } from '../feedback.jsx';

const plural = (n, w, f = 's') => `${n} ${w}${n > 1 ? f : ''}`;
const Switch = ({ on, label, onToggle }) => <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={onToggle}><span /></button>;

// Réglages (the gear of the profile), in the manner of iOS Settings. /reglages/compte: the account.
export default function Reglages({ user }) {
  const { section } = useParams();
  return section === 'compte' ? <Compte user={user} /> : <Main user={user} />;
}

function Main({ user }) {
  const data = useData();
  const ui = useUi();
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const fileRef = useRef(null);
  const stravaRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [news, setNews] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [push, setPush] = useState(pushEnabled);
  const [pushMsg, setPushMsg] = useState('');
  const [every, setEvery] = useState(pushEvery);
  const [awake, setAwake] = useState(keepAwake);
  const [warm, setWarm] = useState(autoWarmup);
  const [lest, setLest] = useState(hasLest);
  const [theme, setThemeState] = useState(getTheme);
  const [healthOk, setHealthOk] = useState(() => hasHealthConsent(user));
  const beta = data.access?.beta;
  const s = data.summary;

  const togglePush = async () => {
    setPushMsg('');
    try {
      if (push) { await disablePush(); setPush(false); ui.notify('Notifications désactivées'); }
      else { await enablePush(); setPush(true); ui.notify('Notifications activées'); }
    } catch (e) { setPushMsg(e.message || String(e)); }
  };
  const download = () => {
    const blob = new Blob(['﻿' + exportCsv(data.workouts)], { type: 'text/csv;charset=utf-8' });
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
  const added = (res, what) => `${plural(res.added, what)} ajouté${what === 'course' || what === 'séance' ? 'e' : ''}${res.added > 1 ? 's' : ''}${res.skipped ? `, ${res.skipped} déjà présente${res.skipped > 1 ? 's' : ''}` : ''}.`;

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
      setStatus(added(res, 'séance'));
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
    setStatus('Lecture de l\'export Strava…');
    try {
      const runs = await readStravaFile(file);
      if (!runs.length) throw new Error('Aucune course trouvée dans ce fichier.');
      const res = await importRuns(runs, data.allLogs);
      await data.refresh();
      setStatus(added(res, 'course'));
    } catch (err) {
      setStatus(`Échec de l'import : ${err.message || err}`);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  const onHealth = async () => {
    if (!(await ensureHealthConsent(ui))) return;
    setHealthOk(true);
    setBusy(true);
    setStatus('Lecture d\'Apple Santé…');
    try {
      const runs = await healthRuns(365);
      const res = await importRuns(runs, data.allLogs);
      await data.refresh();
      setStatus(runs.length ? added(res, 'course') : 'Aucune course trouvée dans Apple Santé. Vérifie l\'accès dans Réglages › Santé › Accès aux données.');
    } catch (err) {
      setStatus(`Échec : ${err.message || err}`);
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

  const native = isNative();
  return (
    <main className="screen">
      <GlassHeader title="Réglages" back={{ to: '/profil', label: 'Retour au profil' }} />

      <div className="pad stack" style={{ gap: 26, paddingTop: 8 }}>
        <Group title="Entraînement" id="r-train" foot={<>
          <span className="gfoot">
            {!native && isIos() && !isStandalone() && !push
              ? 'Sur iPhone, les notifications marchent seulement depuis l\'app ajoutée à l\'écran d\'accueil.'
              : !pushSupported() && !isIos() ? 'Ce navigateur ne gère pas les notifications.'
              : 'Sur l\'Apple Watch, les notifications arrivent quand l\'iPhone est verrouillé.'}
          </span>
          {pushMsg && <span className="small" style={{ color: 'var(--danger)', lineHeight: 1.4 }}>{pushMsg}</span>}
        </>}>
          <SettingRow icon="bell" right={<Switch on={push} label="Notification de fin de repos" onToggle={togglePush} />}>Notification de fin de repos</SettingRow>
          {push && (
            <div className="grow-row" style={{ display: 'block' }}>
              <div className="seg" role="group" aria-label="Rappels pendant le repos" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {[[0, 'À la fin'], [30, 'Toutes les 30 s'], [15, 'Toutes les 15 s']].map(([v, l]) => (
                  <button key={v} className={every === v ? 'on' : ''} aria-pressed={every === v} onClick={() => { setPushEvery(v); setEvery(v); }}>{l}</button>
                ))}
              </div>
            </div>
          )}
          <SettingRow icon="sun" right={<Switch on={awake} label="Garder l'écran allumé" onToggle={() => { setKeepAwake(!awake); setAwake(!awake); ui.notify(!awake ? 'Écran allumé pendant la séance' : 'L\'écran pourra se verrouiller (effet à la prochaine séance)'); }} />}>Garder l'écran allumé</SettingRow>
          <SettingRow icon="flame" right={<Switch on={warm} label="Échauffement automatique" onToggle={() => { setAutoWarmup(!warm); setWarm(!warm); ui.notify(!warm ? 'Échauffement ajouté sur le premier exercice lourd de chaque muscle' : 'Échauffement seulement à la demande'); }} />}>Échauffement automatique</SettingRow>
          <SettingRow icon="dumbbell" right={<Switch on={lest} label="Ceinture de lest pour tractions et dips" onToggle={() => { setHasLest(!lest); setLest(!lest); ui.notify(!lest ? 'Le coach proposera du lest dès 12 reps aux tractions et aux dips' : 'Le coach restera au poids du corps'); }} />}>Lest pour tractions et dips</SettingRow>
        </Group>

        {((native && !session.active) || push) && (
          <Group title="Apple Watch et iPhone" id="r-watch">
            {native && !session.active && <SettingRow icon="watch" chevron onClick={async () => { const msg = await testLive(() => !sessionRef.current.active); await ui.confirm({ title: 'Dynamic Island', message: msg, ok: 'OK' }); }}>Tester la Dynamic Island</SettingRow>}
            {push && <SettingRow icon="send" chevron onClick={async () => { try { await testPush(); ui.notify('Notification de test dans 5 secondes'); } catch (e) { ui.notify(e.message || String(e)); } }}>Envoyer une notification de test</SettingRow>}
          </Group>
        )}

        <Group title="Apparence" id="r-app">
          <div className="grow-row" style={{ display: 'block' }}>
            <div className="seg" role="group" aria-label="Apparence" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => (
                <button key={k} className={theme === k ? 'on' : ''} aria-pressed={theme === k} onClick={() => { setTheme(k); setThemeState(k); }}>{l}</button>
              ))}
            </div>
          </div>
        </Group>

        <Group title="Données et intégrations" id="r-data" foot={<>
          {status && <span className="small soft" role="status">{status}</span>}
          <details className="gfoot">
            <summary>Où trouver ces fichiers ?</summary>
            <p><b>Hevy :</b> Profil, Réglages, Exporter les données.</p>
            <p><b>Strava :</b> sur strava.com, Paramètres, Mon compte, « Télécharger ou supprimer votre compte », « Demander une archive ». Choisis ici le .zip reçu par e-mail. Seules les courses sont importées.</p>
            <p>Les doublons sont ignorés : tu peux réimporter sans risque.</p>
          </details>
        </>}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          <input ref={stravaRef} type="file" accept=".zip,.csv,application/zip,text/csv" hidden onChange={onStrava} />
          {native && <SettingRow icon="heart" tone="health" onClick={onHealth} disabled={busy} right={<span className="val">Importer</span>}>Apple Santé</SettingRow>}
          <SettingRow icon="run" tone="strava" onClick={() => stravaRef.current?.click()} disabled={busy} right={<span className="val">Importer un fichier</span>}>Strava</SettingRow>
          <SettingRow icon="upload" tone="hevy" onClick={() => fileRef.current?.click()} disabled={busy} right={<span className="val">Importer un fichier</span>}>Hevy</SettingRow>
          <SettingRow icon="list" to="/historique">Historique des séances</SettingRow>
          {s.sessions > 0 && <SettingRow icon="download" chevron onClick={download}>Exporter mes séances (.csv)</SettingRow>}
        </Group>

        <Group title="Bêta et assistance" id="r-beta" foot={beta && betaActive(beta) ? <span className="gfoot">Tout Kadence est gratuit pour toi pendant la bêta. Merci pour tes retours.</span> : null}>
          {beta ? (
            <SettingRow icon="spark" right={<span className="val">{betaActive(beta) ? `jusqu'au ${fmtDay(new Date(beta.ends_at))} ${new Date(beta.ends_at).getFullYear()}` : 'terminée'}</span>}>Bêta-testeur n° {beta.seat}</SettingRow>
          ) : (
            <SettingRow icon="spark" chevron onClick={enterCode}>J'ai un code bêta</SettingRow>
          )}
          <SettingRow icon="send" chevron onClick={() => setFeedback(true)}>Donner mon avis</SettingRow>
          <SettingRow icon="info" onClick={() => setNews(true)} right={<span className="val">{VERSION}</span>}>Nouveautés</SettingRow>
        </Group>

        <Group title="Compte et confidentialité" id="r-account">
          <SettingRow icon="user" to="/reglages/compte" right={<span className="val ellipsis" style={{ maxWidth: 150 }}>{user?.email}</span>}>Mon compte</SettingRow>
          <SettingRow icon="shield" chevron onClick={() => window.open('https://sport.kadeon.be/confidentialite.html', '_blank')}>Confidentialité</SettingRow>
          {healthOk && <SettingRow icon="heart" onClick={withdrawHealth} danger>Retirer mon accord pour les données de santé</SettingRow>}
          {data.superadmin && <SettingRow icon="gear" chevron onClick={() => window.open('https://admin.kadeon.be', '_blank')}>Back-office</SettingRow>}
          <SettingRow icon="logout" tone="danger" onClick={signOut} danger>Se déconnecter</SettingRow>
        </Group>
      </div>

      <p className="settings-foot">Kadence {VERSION} ({BUILD}), {new Date(BUILT_AT).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}<br />Train. Track. Progress.</p>
      <WhatsNew open={news} onClose={() => setNews(false)} />
      {feedback && <FeedbackSheet onClose={() => setFeedback(false)} onSent={() => ui.notify('Merci, message envoyé')} />}
    </main>
  );
}

// Mon compte: name, e-mail, weight, password, deletion.
function Compte({ user }) {
  const ui = useUi();
  const session = useSession();
  const [pwd, setPwd] = useState(false);
  const name = user?.user_metadata?.name || '';
  const weight = user?.user_metadata?.weight_kg;

  const editName = async () => {
    const v = await ui.prompt({ title: 'Ton prénom', message: 'Affiché sur l\'accueil et ton profil.', value: name, placeholder: 'Kilian', ok: 'Enregistrer' });
    if (v == null) return;
    const n = v.trim().slice(0, 40);
    if (!n) { ui.notify('Indique un prénom'); return; }
    const { error } = await supabase.auth.updateUser({ data: { name: n } });
    ui.notify(error ? error.message : 'Prénom enregistré');
  };
  // Body weight: only used to count the calories of walks and tapis sessions.
  const editWeight = async () => {
    const v = await ui.prompt({ title: 'Ton poids (kg)', message: 'Sert seulement à calculer les calories de la marche et du tapis.', value: weight ? String(weight).replace('.', ',') : '', placeholder: '75', ok: 'Enregistrer' });
    if (v == null) return;
    const kg = Math.round(Number(v.replace(',', '.')) * 10) / 10;
    if (!(kg >= 30 && kg <= 250)) { ui.notify('Poids entre 30 et 250 kg'); return; }
    const { error } = await supabase.auth.updateUser({ data: { weight_kg: kg } });
    ui.notify(error ? error.message : 'Poids enregistré');
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

  return (
    <main className="screen">
      <GlassHeader title="Mon compte" back={{ to: '/reglages', label: 'Retour aux réglages' }} />
      <div className="pad stack" style={{ gap: 26, paddingTop: 8 }}>
        <Group title="Informations personnelles" id="c-info">
          <SettingRow icon="user" onClick={editName} right={<span className="val">{name || 'À indiquer'}</span>}>Prénom</SettingRow>
          <SettingRow icon="send" right={<span className="val ellipsis" style={{ maxWidth: 190 }}>{user?.email}</span>}>E-mail</SettingRow>
          <SettingRow icon="chart" onClick={editWeight} right={<span className="val">{weight ? `${String(weight).replace('.', ',')} kg` : 'À indiquer'}</span>}>Poids</SettingRow>
        </Group>
        <Group title="Sécurité" id="c-sec">
          <SettingRow icon="edit" onClick={() => setPwd(!pwd)} aria-expanded={pwd} chevron>Mot de passe</SettingRow>
        </Group>
        {pwd && <div className="card"><PasswordForm onDone={() => setPwd(false)} /></div>}
        <Group id="c-del" foot={<span className="gfoot">Efface définitivement tes séances, courses, routines et réglages.</span>}>
          <SettingRow icon="trash" tone="danger" onClick={removeAccount} danger>Supprimer mon compte</SettingRow>
        </Group>
      </div>
    </main>
  );
}
