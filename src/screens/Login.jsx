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
    <div className="screen login" style={{ paddingBottom: 0 }}>
      <div className="center" style={{ alignItems: 'stretch', textAlign: 'left', maxWidth: 400, margin: '0 auto', width: '100%', gap: 20 }}>
        <img src="/icon.svg" alt="" width="64" height="64" style={{ borderRadius: 18, boxShadow: '0 10px 30px rgba(232, 80, 14, 0.25)' }} />
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="title" style={{ fontSize: 40 }}>Kadeon Sport</h1>
          <p className="muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.45 }}>Ta muscu et ta course au même endroit. Entre ton e-mail, tu recevras un lien de connexion.</p>
        </div>
        {state === 'sent' ? (
          <div className="card"><strong>Lien envoyé.</strong><span className="muted small">Ouvre l'e-mail sur cet appareil pour te connecter.</span></div>
        ) : (
          <form onSubmit={send} className="glass stack" style={{ gap: 12, padding: 18, alignItems: 'stretch' }}>
            <label className="stack" style={{ gap: 6 }}>
              <span className="label">E-mail</span>
              <input className="input" type="email" required autoComplete="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn primary big" disabled={state === 'sending'}>{state === 'sending' ? 'Envoi…' : 'Recevoir le lien'}</button>
            {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
