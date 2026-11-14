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

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return <div className="center"><p>Variables Supabase manquantes : VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.</p></div>;
  }
  if (session === undefined) return <Loading text="Connexion…" />;
  if (!session) return <Login />;

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
        <Route path="/profil" element={<Profil user={user} />} />
        <Route path="/montre" element={<Montre />} />
        <Route path="/routines/:id" element={<Routine key={pathname} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideNav && <Nav />}
    </div>
  );
}
