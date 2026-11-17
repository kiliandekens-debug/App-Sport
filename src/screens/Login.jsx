import { useState } from 'react';
import { supabase } from '../supabase.js';

// Sign in with e-mail and password, or with a link sent by e-mail.
export default function Login() {
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  const fail = (err) => {
    const m = err?.message || String(err);
    setError(/invalid login credentials/i.test(m) ? 'E-mail ou mot de passe incorrect.' : /email not confirmed/i.test(m) ? 'Adresse e-mail pas encore confirmée.' : /rate limit/i.test(m) ? 'Trop d\'e-mails envoyés en peu de temps. Réessaie dans une heure, ou connecte-toi avec ton mot de passe.' : m);
    setState('idle');
  };

  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    setError('');
    if (mode === 'password') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) fail(err);
      return;
    }
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } });
    if (err) fail(err); else setState('sent');
  };

  const forgot = async () => {
    if (!email.trim()) { setError('Indique ton e-mail, puis touche « Mot de passe oublié ».'); return; }
    setState('sending');
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (err) fail(err); else setState('reset-sent');
  };

  return (
    <div className="screen login" style={{ paddingBottom: 0 }}>
      <div className="center" style={{ alignItems: 'stretch', textAlign: 'left', maxWidth: 400, margin: '0 auto', width: '100%', gap: 20 }}>
        <img src="/icon.svg" alt="" width="64" height="64" style={{ borderRadius: 18, boxShadow: '0 10px 30px rgba(232, 80, 14, 0.25)' }} />
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="title" style={{ fontSize: 40 }}>Kadeon Sport</h1>
          <p className="muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.45 }}>Ta muscu et ta course au même endroit.</p>
        </div>
        {state === 'sent' || state === 'reset-sent' ? (
          <div className="glass stack" style={{ gap: 8, padding: 18, alignItems: 'stretch' }}>
            <strong>{state === 'sent' ? 'Lien envoyé.' : 'E-mail envoyé.'}</strong>
            <span className="muted small" style={{ lineHeight: 1.45 }}>{state === 'sent' ? 'Ouvre l\'e-mail sur cet appareil pour te connecter.' : 'Ouvre le lien reçu pour choisir un nouveau mot de passe.'}</span>
            <button className="btn" onClick={() => setState('idle')}>Retour</button>
          </div>
        ) : (
          <form onSubmit={submit} className="glass stack" style={{ gap: 12, padding: 18, alignItems: 'stretch' }}>
            <div className="seg" role="group" aria-label="Méthode de connexion" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <button type="button" className={mode === 'password' ? 'on' : ''} aria-pressed={mode === 'password'} onClick={() => setMode('password')}>Mot de passe</button>
              <button type="button" className={mode === 'link' ? 'on' : ''} aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Lien par e-mail</button>
            </div>
            <label className="stack" style={{ gap: 6 }}>
              <span className="label">E-mail</span>
              <input className="input" type="email" required autoComplete="username" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {mode === 'password' && (
              <label className="stack" style={{ gap: 6 }}>
                <span className="label">Mot de passe</span>
                <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
            <button className="btn primary big" disabled={state === 'sending'}>{state === 'sending' ? '…' : mode === 'password' ? 'Se connecter' : 'Recevoir le lien'}</button>
            {mode === 'password' && <button type="button" className="btn" style={{ background: 'transparent' }} onClick={forgot}>Mot de passe oublié ?</button>}
            {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
