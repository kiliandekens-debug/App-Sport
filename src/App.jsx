import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase, configured } from './supabase.js';
import { DataProvider, useData } from './data.jsx';
import { SessionProvider } from './session.jsx';
import { Nav, Loading } from './components.jsx';
import Login from './screens/Login.jsx';
import Accueil from './screens/Accueil.jsx';
import Seance from './screens/Seance.jsx';
import Progres from './screens/Progres.jsx';
import Exercices from './screens/Exercices.jsx';
import Variante from './screens/Variante.jsx';
import Coach from './screens/Coach.jsx';
import Profil from './screens/Profil.jsx';
import Montre from './screens/Montre.jsx';
import Routine from './screens/Routine.jsx';
import Course from './screens/Course.jsx';
import Historique from './screens/Historique.jsx';
import Admin from './screens/Admin.jsx';
import { PasswordForm } from './password.jsx';
import { UpdateBanner, WhatsNew, useFreshVersion } from './update.jsx';

export default function App() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return <div className="center"><p>Variables Supabase manquantes : VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.</p></div>;
  }
  if (session === undefined) return <Loading text="Connexion…" />;
  if (!session) return <Login />;
  if (recovery) {
    return (
      <div className="screen login"><div className="center" style={{ alignItems: 'stretch', maxWidth: 400, margin: '0 auto', width: '100%' }}>
        <h1 className="title-s">Nouveau mot de passe</h1>
        <div className="glass stack" style={{ padding: 18, alignItems: 'stretch' }}><PasswordForm onDone={() => setRecovery(false)} /></div>
      </div></div>
    );
  }

  return (
    <DataProvider>
      <SessionProvider>
        <Shell user={session.user} />
      </SessionProvider>
    </DataProvider>
  );
}

function Shell({ user }) {
  const data = useData();
  const { pathname } = useLocation();
  const hideNav = pathname.startsWith('/seance') || pathname.startsWith('/montre') || pathname.startsWith('/variante') || pathname.startsWith('/routines');

  const [fresh, closeFresh] = useFreshVersion();
  if (data.loading) return <Loading />;
  return (
    <div className="app">
      {data.error && <div className="pad small" style={{ color: 'var(--danger)', paddingTop: 12 }}>Erreur de chargement : {data.error}</div>}
      <Routes>
        <Route path="/" element={<Accueil user={user} />} />
        <Route path="/seance" element={<Seance />} />
        <Route path="/progres" element={<Progres />} />
        <Route path="/exercices" element={<Exercices />} />
        <Route path="/variante" element={<Variante />} />
        <Route path="/coach" element={<Coach />} />
        <Route path="/course" element={<Course />} />
        <Route path="/historique" element={<Historique />} />
        <Route path="/admin" element={<Admin user={user} />} />
        <Route path="/profil" element={<Profil user={user} />} />
        <Route path="/montre" element={<Montre />} />
        <Route path="/routines/:id" element={<Routine key={pathname} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideNav && <Nav />}
      <UpdateBanner />
      <WhatsNew open={fresh} onClose={closeFresh} />
    </div>
  );
}
