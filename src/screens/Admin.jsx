import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useData, adminUsers, adminSetRole } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { GlassHeader } from '../components.jsx';
import { fmtDay } from '../lib/stats.js';
import { VERSION, BUILD, BUILT_AT } from '../changelog.js';

const ROLES = [['superadmin', 'Superadmin'], ['admin', 'Admin'], ['user', 'Utilisateur']];
const day = (d) => (d ? `${fmtDay(new Date(d))} ${new Date(d).getFullYear()}` : 'jamais');

// Superadmin only: accounts, their activity and roles, and what is deployed.
export default function Admin({ user }) {
  const data = useData();
  const ui = useUi();
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const load = () => adminUsers().then(setUsers).catch((e) => setErr(e.message || String(e)));
  useEffect(() => { if (data.superadmin) load(); }, [data.superadmin]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data.superadmin) return <Navigate to="/profil" replace />;

  const setRole = async (u, role) => {
    if (role === u.role) return;
    if (!(await ui.confirm({ title: `Rôle de ${u.email}`, message: `Passer de « ${ROLES.find((r) => r[0] === u.role)?.[1]} » à « ${ROLES.find((r) => r[0] === role)?.[1]} » ?`, ok: 'Changer' }))) return;
    try { await adminSetRole(u.id, role); await load(); ui.notify('Rôle modifié'); } catch (e) { ui.notify(e.message || String(e)); }
  };

  return (
    <main className="screen">
      <GlassHeader eyebrow="Réservé au superadmin" title="Administration" />
      <div className="pad stack" style={{ gap: 12, paddingTop: 8 }}>
        <section className="card stack" style={{ gap: 6 }}>
          <span className="label">Application</span>
          <span className="small">Kadeon Sport {VERSION}, build {BUILD}</span>
          <span className="xs muted">Publiée le {day(BUILT_AT)}, sur sport.kadeon.be</span>
        </section>

        <div className="between" style={{ paddingTop: 8 }}>
          <span className="label">Comptes</span>
          <span className="xs muted">{users ? `${users.length} compte${users.length > 1 ? 's' : ''}` : ''}</span>
        </div>
        {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
        {!users && !err && <span className="small muted">Chargement…</span>}
        {users?.map((u) => (
          <section key={u.id} className="card stack" style={{ gap: 10 }}>
            <div className="stack" style={{ gap: 2 }}>
              <span style={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{u.email}{u.id === user.id ? ' (toi)' : ''}</span>
              <span className="xs muted">Créé le {day(u.created_at)}, dernière connexion {day(u.last_sign_in_at)}</span>
              <span className="xs muted">{u.workouts} séances de salle, {u.runs} courses, {u.has_password ? 'mot de passe défini' : 'connexion par lien seulement'}</span>
            </div>
            <div className="seg" role="group" aria-label={`Rôle de ${u.email}`} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {ROLES.map(([k, l]) => (
                <button key={k} className={u.role === k ? 'on' : ''} aria-pressed={u.role === k} disabled={u.id === user.id} onClick={() => setRole(u, k)}>{l}</button>
              ))}
            </div>
            {u.id === user.id && <span className="xs muted">Ton propre rôle ne peut pas être modifié ici, pour ne jamais perdre l'accès superadmin.</span>}
          </section>
        ))}
        <span className="xs muted" style={{ lineHeight: 1.45 }}>Chaque compte ne voit que ses propres données. Les droits sont vérifiés dans la base de données, pas seulement dans l'app.</span>
      </div>
    </main>
  );
}
