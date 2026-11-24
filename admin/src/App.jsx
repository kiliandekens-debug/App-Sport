import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(url, key, { auth: { storageKey: 'kadence-admin-auth' } });

// Thème : suit l'appareil.
const dark = window.matchMedia?.('(prefers-color-scheme: dark)');
const applyTheme = () => {
  document.documentElement.setAttribute('data-theme', dark?.matches ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark?.matches ? '#111316' : '#F1F2F4');
};
applyTheme();
try { dark.addEventListener('change', applyTheme); } catch { /* old browser */ }

const DAY = 86400000;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (d) => (d ? new Date(d).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const ago = (d) => {
  if (!d) return 'jamais';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / DAY);
  return days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : `il y a ${days} j`;
};
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const lastActivity = (u) => [u.last_workout, u.last_run].filter(Boolean).map((d) => new Date(d).getTime()).sort((a, b) => b - a)[0] || null;

async function call(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...extra } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return data;
}

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="adm"><p className="muted">Connexion…</p></div>;
  if (!session) return <Login />;
  return <Dashboard email={session.user.email} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setState('busy'); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) { setError(/invalid login/i.test(err.message) ? 'E-mail ou mot de passe incorrect.' : err.message); setState('idle'); }
  };
  return (
    <div className="adm" style={{ maxWidth: 420, paddingTop: 60 }}>
      <div className="adm-head"><h1>Back-office</h1></div>
      <p className="muted small" style={{ margin: 0 }}>Kadence. Réservé au superadmin : chaque action est vérifiée par le serveur.</p>
      <form className="card" onSubmit={submit}>
        <label className="stack" style={{ gap: 6 }}><span className="label">E-mail</span>
          <input className="input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="stack" style={{ gap: 6 }}><span className="label">Mot de passe</span>
          <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary big" disabled={state === 'busy'}>{state === 'busy' ? '…' : 'Se connecter'}</button>
        {error && <span className="small adm-err" role="alert">{error}</span>}
      </form>
      <p className="xs muted" style={{ margin: 0 }}>Pas de mot de passe ? Définis-en un dans l'app Kadence (Profil › Mot de passe).</p>
    </div>
  );
}

const TABS = [['sante', 'Santé'], ['users', 'Utilisateurs'], ['beta', 'Bêta'], ['avis', 'Avis']];

function Dashboard({ email }) {
  const [tab, setTab] = useState(() => (location.hash.slice(1) && TABS.some((t) => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'sante'));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await call('overview')); setError(''); } catch (e) { setError(e.message); }
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);
  const act = async (action, extra, done) => {
    try { const r = await call(action, extra); await load(); done?.(r); } catch (e) { alert(e.message); }
  };
  const newFeedback = data?.feedback.filter((f) => f.status === 'new').length || 0;

  return (
    <div className="adm">
      <div className="adm-head">
        <div className="stack" style={{ gap: 2 }}>
          <span className="xs muted">Kadence · {email}</span>
          <h1>Back-office</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={load} disabled={busy}>{busy ? '…' : 'Actualiser'}</button>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Quitter</button>
        </div>
      </div>
      <div className="seg" role="tablist" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" className={tab === k ? 'on' : ''} aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}{k === 'avis' && newFeedback ? ` (${newFeedback})` : ''}
          </button>
        ))}
      </div>
      {error && <div className="card adm-err">{error}</div>}
      {!data && !error && <p className="muted">Chargement…</p>}
      {data && tab === 'sante' && <Health data={data} />}
      {data && tab === 'users' && <Users data={data} act={act} />}
      {data && tab === 'beta' && <Beta data={data} act={act} />}
      {data && tab === 'avis' && <Feedback data={data} act={act} />}
      {data && <p className="xs muted" style={{ margin: 0 }}>Données du {fmtTime(data.at)}. Seule l'activité est visible ici (dates et nombres), jamais le contenu des séances.</p>}
    </div>
  );
}

function Tile({ label, value, tone }) {
  return <div className={`adm-tile ${tone || ''}`}><b>{value}</b><span className="xs muted">{label}</span></div>;
}

function Health({ data }) {
  const h = data.health;
  const active = data.users.filter((u) => { const a = lastActivity(u); return a && Date.now() - a < 14 * DAY; }).length;
  return (
    <>
      <h2 className="label">Utilisation</h2>
      <div className="adm-tiles">
        <Tile label="comptes" value={data.users.length} />
        <Tile label="actifs (14 jours)" value={active} />
        <Tile label="inscrits (7 jours)" value={h.signups7} />
        <Tile label="inscrits (30 jours)" value={h.signups30} />
        <Tile label="places bêta prises" value={`${data.beta.given}/${data.beta.total}`} />
        <Tile label="avis à lire" value={data.feedback.filter((f) => f.status === 'new').length} />
      </div>
      <h2 className="label">Serveur</h2>
      <div className="adm-tiles">
        <Tile label="tâches cron (24 h)" value={h.cron_runs} tone={h.cron_runs > 0 ? 'ok' : 'bad'} />
        <Tile label="échecs cron (24 h)" value={h.cron_fails} tone={h.cron_fails ? 'bad' : 'ok'} />
        <Tile label="notifications en retard" value={h.pushes_late} tone={h.pushes_late ? 'bad' : 'ok'} />
        <Tile label="notifications envoyées (24 h)" value={h.pushes_sent} />
        <Tile label="appareils (notifications web)" value={h.push_devices} />
        <Tile label="taille de la base" value={`${Math.round(h.db_bytes / 1048576)} Mo`} />
      </div>
      <p className="xs muted" style={{ margin: 0 }}>Dernière tâche cron : {fmtTime(h.cron_last)}. Les déploiements et les erreurs du site sont dans le rapport de maintenance de chaque nuit.</p>
    </>
  );
}

function Users({ data, act }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => data.users
    .map((u) => ({ ...u, last: lastActivity(u) }))
    .filter((u) => !q || u.email?.toLowerCase().includes(q.toLowerCase()))
    .filter((u) => filter === 'all' || (filter === 'active' ? u.last && Date.now() - u.last < 14 * DAY : !(u.last && Date.now() - u.last < 14 * DAY)))
    .sort((a, b) => (b.last || 0) - (a.last || 0)), [data.users, filter, q]);
  const role = async (u, r) => {
    if (r === u.role || !confirm(`Passer ${u.email} en « ${r} » ?`)) return;
    await act('set_role', { user_id: u.id, role: r });
  };
  return (
    <>
      <div className="adm-form">
        <label>Rechercher<input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e-mail" /></label>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {[['all', 'Tous'], ['active', 'Actifs'], ['idle', 'Inactifs']].map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <span className="xs muted">{plural(list.length, 'compte')}. Actif = au moins une séance ou une course ces 14 derniers jours.</span>
      <div className="adm-list">
        {list.map((u) => {
          const active = u.last && Date.now() - u.last < 14 * DAY;
          return (
            <div key={u.id} className="adm-row">
              <div className="top">
                <span className="email">{u.email}</span>
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className={`adm-tag ${active ? 'on' : ''}`}>{active ? 'Actif' : 'Inactif'}</span>
                  {u.seat && <span className={`adm-tag ${u.beta_revoked ? 'off' : 'brand'}`}>Bêta n° {u.seat}{u.beta_revoked ? ' (retirée)' : ''}</span>}
                  {u.role !== 'user' && <span className="adm-tag">{u.role}</span>}
                  {!u.email_confirmed_at && <span className="adm-tag off">E-mail non confirmé</span>}
                </span>
              </div>
              <span className="xs muted">
                Inscrit le {fmt(u.created_at)} ({u.provider}) · connexion {ago(u.last_sign_in_at)} · dernière activité {ago(u.last)}
              </span>
              <span className="xs muted">
                {plural(u.workouts, 'séance')} de salle, {plural(u.runs, 'course')} · {u.last7} cette semaine · {plural(u.feedback, 'avis')}
                {u.seat ? ` · bêta jusqu'au ${fmt(u.beta_end)}` : ''}
              </span>
              <div className="adm-actions">
                <select className="input" style={{ height: 36, width: 'auto' }} value={u.role} onChange={(e) => role(u, e.target.value)} aria-label={`Rôle de ${u.email}`}>
                  <option value="user">Utilisateur</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option>
                </select>
                {u.seat && !u.beta_revoked && <button className="btn" onClick={() => confirm(`Retirer la place bêta de ${u.email} ? Elle reste comptée.`) && act('revoke_beta', { user_id: u.id })}>Retirer la bêta</button>}
                {u.seat && u.beta_revoked && <button className="btn" onClick={() => act('restore_beta', { user_id: u.id })}>Rendre la bêta</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Beta({ data, act }) {
  const [count, setCount] = useState(5);
  const [note, setNote] = useState('');
  const [days, setDays] = useState(30);
  const [fresh, setFresh] = useState([]);
  const left = data.beta.total - data.beta.given;
  const create = (e) => {
    e.preventDefault();
    act('create_codes', { count, note, max_uses: 1, expires_days: days }, (r) => setFresh(r.codes));
  };
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => alert('Copié'), () => {});
  const usable = (c) => c.uses < c.max_uses && (!c.expires_at || new Date(c.expires_at) > new Date());
  return (
    <>
      <div className="adm-tiles">
        <Tile label="places prises" value={data.beta.given} />
        <Tile label="places restantes" value={left} tone={left > 0 ? 'ok' : 'bad'} />
        <Tile label="codes encore valables" value={data.beta.codes.filter(usable).length} />
      </div>
      <form className="card" onSubmit={create}>
        <h2 className="label">Créer des codes d'invitation</h2>
        <div className="adm-form">
          <label>Nombre (1 à 20)<input className="input" type="number" min="1" max="20" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
          <label>Valables (jours, 0 = sans limite)<input className="input" type="number" min="0" max="365" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          <label>Pour qui (note)<input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="ex. salle, collègues" /></label>
          <button className="btn primary" disabled={left <= 0}>Créer</button>
        </div>
        <span className="xs muted">Un code = une personne = une place (premium 1 an). Une place donnée reste comptée, même si le compte est supprimé.</span>
        {fresh.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small">Nouveaux codes :</span>
            {fresh.map((c) => <span key={c} className="adm-code">{c}</span>)}
            <button type="button" className="btn" onClick={() => copy(fresh.join('\n'))}>Copier les codes</button>
          </div>
        )}
      </form>
      <h2 className="label">Codes</h2>
      <div className="adm-list">
        {data.beta.codes.length === 0 && <span className="small muted">Aucun code pour l'instant.</span>}
        {data.beta.codes.map((c) => (
          <div key={c.code} className="adm-row">
            <div className="top">
              <span className="adm-code">{c.code}</span>
              <span className={`adm-tag ${usable(c) ? 'on' : c.uses >= c.max_uses ? 'brand' : 'off'}`}>{usable(c) ? 'Valable' : c.uses >= c.max_uses ? 'Utilisé' : 'Expiré'}</span>
            </div>
            <span className="xs muted">{c.note || 'Sans note'} · créé le {fmt(c.created_at)} · {c.uses}/{c.max_uses} utilisé{c.expires_at ? ` · expire le ${fmt(c.expires_at)}` : ''}</span>
            {usable(c) && (
              <div className="adm-actions">
                <button className="btn" onClick={() => copy(c.code)}>Copier</button>
                <button className="btn" onClick={() => confirm(`Désactiver ${c.code} ?`) && act('disable_code', { code: c.code })}>Désactiver</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

const STATUS = [['new', 'Nouveau'], ['read', 'Lu'], ['done', 'Traité']];
function Feedback({ data, act }) {
  const [show, setShow] = useState('open');
  const list = data.feedback.filter((f) => (show === 'open' ? f.status !== 'done' : true));
  return (
    <>
      <div className="seg" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button className={show === 'open' ? 'on' : ''} onClick={() => setShow('open')}>À traiter</button>
        <button className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>Tous</button>
      </div>
      <div className="adm-list">
        {list.length === 0 && <span className="small muted">Aucun avis {show === 'open' ? 'à traiter' : 'pour l\'instant'}.</span>}
        {list.map((f) => (
          <div key={f.id} className="adm-row">
            <div className="top">
              <span className="email">{f.email || 'compte supprimé'}</span>
              <span className={`adm-tag ${f.status === 'new' ? 'brand' : f.status === 'done' ? 'on' : ''}`}>{STATUS.find((s) => s[0] === f.status)?.[1]}</span>
            </div>
            <span className="xs muted">{fmtTime(f.created_at)} · {f.platform || '?'} · v{f.app_version || '?'}{f.page ? ` · ${f.page}` : ''}</span>
            <div className="adm-msg small">{f.message}</div>
            <div className="adm-actions">
              {STATUS.filter((s) => s[0] !== f.status).map(([k, l]) => (
                <button key={k} className="btn" onClick={() => act('feedback_status', { id: f.id, status: k })}>Marquer « {l} »</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
