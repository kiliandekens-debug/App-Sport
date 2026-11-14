import { useState } from 'react';
import { supabase } from '../supabase.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  const send = async (e) => {
    e.preventDefault();
    setState('sending');
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) { setError(err.message); setState('idle'); } else setState('sent');
  };

  return (
    <div className="screen" style={{ paddingBottom: 0 }}>
      <div className="center" style={{ alignItems: 'stretch', textAlign: 'left', maxWidth: 380, margin: '0 auto', width: '100%' }}>
        <h1 className="title">Salle</h1>
        <p className="muted" style={{ margin: 0 }}>Ton suivi d'entraînement. Connecte-toi avec ton e-mail, tu recevras un lien.</p>
        {state === 'sent' ? (
          <div className="card"><strong>Lien envoyé.</strong><span className="muted small">Ouvre l'e-mail sur cet appareil pour te connecter.</span></div>
        ) : (
          <form onSubmit={send} className="stack">
            <label className="stack" style={{ gap: 6 }}>
              <span className="label">E-mail</span>
              <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn primary big" disabled={state === 'sending'}>{state === 'sending' ? 'Envoi…' : 'Recevoir le lien'}</button>
            {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
