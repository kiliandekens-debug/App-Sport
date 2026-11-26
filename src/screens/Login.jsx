import { useState } from 'react';
import { supabase } from '../supabase.js';
import { Wordmark } from '../brand.jsx';
import { signInWithApple, rememberInvite, appleAvailable } from '../appleAuth.js';

// Sign in with e-mail and password, or with a link sent by e-mail; or create an account
// (with an optional beta invitation code, used at the first opening of the account).
export default function Login() {
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  const fail = (err) => {
    const m = err?.message || String(err);
    setError(/invalid login credentials/i.test(m) ? 'E-mail ou mot de passe incorrect.' : /signups? not allowed|signup is disabled/i.test(m) ? 'Les inscriptions sont fermées pour le moment.' : /already registered/i.test(m) ? 'Un compte existe déjà avec cet e-mail : connecte-toi.' : /password should be|weak password/i.test(m) ? 'Mot de passe trop faible : au moins 8 caractères, avec des lettres et des chiffres.' : /email not confirmed/i.test(m) ? 'Adresse e-mail pas encore confirmée.' : /rate limit/i.test(m) ? 'Trop d\'e-mails envoyés en peu de temps. Réessaie dans une heure, ou connecte-toi avec ton mot de passe.' : m);
    setState('idle');
  };

  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    setError('');
    if (mode === 'signup') {
      if (password.length < 8) { fail(new Error('weak password')); return; }
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin, data: code.trim() ? { invite_code: code.trim().toUpperCase() } : {} },
      });
      if (err) { fail(err); return; }
      // Supabase hides existing addresses: an empty identity list means the account already exists.
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) { fail(new Error('already registered')); return; }
      if (!data?.session) setState('confirm');
      return;
    }
    if (mode === 'password') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) fail(err);
      return;
    }
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } });
    if (err) fail(err); else setState('sent');
  };

  // « Continuer avec Apple » : sign-up and sign-in in one; the beta code typed is kept for the first opening.
  const apple = async () => {
    setState('sending');
    setError('');
    if (mode === 'signup') rememberInvite(code);
    try {
      const ok = await signInWithApple();
      if (!ok) setState('idle');
    } catch (err) { fail(err); }
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
        <img src="/icon.svg" alt="" width="64" height="64" style={{ borderRadius: 18, boxShadow: '0 10px 30px rgba(0, 163, 255, 0.22)' }} />
        <div className="stack" style={{ gap: 12 }}>
          <h1 className="title" translate="no" style={{ margin: 0, lineHeight: 0 }}><Wordmark width={230} /></h1>
          <p className="muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.45 }}>Ta muscu et ta course au même endroit.</p>
        </div>
        {state === 'confirm' ? (
          <div className="glass stack" style={{ gap: 8, padding: 18, alignItems: 'stretch' }}>
            <strong>Vérifie ta boîte mail.</strong>
            <span className="muted small" style={{ lineHeight: 1.45 }}>Ouvre le lien reçu pour confirmer ton adresse, puis connecte-toi avec ton mot de passe.{code.trim() ? ' Ton code bêta sera utilisé à la première ouverture.' : ''}</span>
            <button className="btn" onClick={() => { setState('idle'); setMode('password'); }}>Retour</button>
          </div>
        ) : state === 'sent' || state === 'reset-sent' ? (
          <div className="glass stack" style={{ gap: 8, padding: 18, alignItems: 'stretch' }}>
            <strong>{state === 'sent' ? 'Lien envoyé.' : 'E-mail envoyé.'}</strong>
            <span className="muted small" style={{ lineHeight: 1.45 }}>{state === 'sent' ? 'Ouvre l\'e-mail sur cet appareil pour te connecter.' : 'Ouvre le lien reçu pour choisir un nouveau mot de passe.'}</span>
            <button className="btn" onClick={() => setState('idle')}>Retour</button>
          </div>
        ) : (
          <form onSubmit={submit} className="glass stack" style={{ gap: 12, padding: 18, alignItems: 'stretch' }}>
            {mode === 'signup' && <strong style={{ fontSize: 18 }}>Créer un compte</strong>}
            {mode === 'signup' && (
              <label className="stack" style={{ gap: 6 }}>
                <h2 className="label">Code bêta (facultatif)</h2>
                <input className="input" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="KAD-ABCD-EFGH" value={code} onChange={(e) => setCode(e.target.value)} />
                <span className="xs muted" style={{ lineHeight: 1.4 }}>Avec un code, tout Kadence est gratuit pendant un an (50 places).</span>
              </label>
            )}
            {appleAvailable() && <>
            <button type="button" className="btn big apple-btn" disabled={state === 'sending'} onClick={apple}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M16.37 1.43c0 1.14-.5 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z" /></svg>
              Continuer avec Apple
            </button>
            <div className="or-sep" aria-hidden="true"><span>ou avec ton e-mail</span></div>
            </>}
            {mode !== 'signup' && (
              <div className="seg" role="group" aria-label="Méthode de connexion" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <button type="button" className={mode === 'password' ? 'on' : ''} aria-pressed={mode === 'password'} onClick={() => { setMode('password'); setError(''); }}>Mot de passe</button>
                <button type="button" className={mode === 'link' ? 'on' : ''} aria-pressed={mode === 'link'} onClick={() => { setMode('link'); setError(''); }}>Lien par e-mail</button>
              </div>
            )}
            <label className="stack" style={{ gap: 6 }}>
              <h2 className="label">E-mail</h2>
              <input className="input" type="email" required autoComplete="username" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {mode !== 'link' && (
              <label className="stack" style={{ gap: 6 }}>
                <h2 className="label">Mot de passe</h2>
                <input className="input" type="password" required minLength={mode === 'signup' ? 8 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
            <button className="btn primary big" disabled={state === 'sending'}>{state === 'sending' ? '…' : mode === 'password' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Recevoir le lien'}</button>
            {mode === 'password' && <button type="button" className="btn" style={{ background: 'transparent' }} onClick={forgot}>Mot de passe oublié ?</button>}
            <button type="button" className="btn" style={{ background: 'transparent' }} onClick={() => { setMode(mode === 'signup' ? 'password' : 'signup'); setError(''); }}>
              {mode === 'signup' ? "J'ai déjà un compte" : 'Pas encore de compte ? Créer un compte'}
            </button>
            {mode === 'signup' && <span className="xs muted" style={{ lineHeight: 1.4 }}>En créant un compte, tu acceptes la <a href="https://sport.kadeon.be/confidentialite.html" target="_blank" rel="noreferrer">politique de confidentialité</a>.</span>}
            {error && <span className="small" role="alert" style={{ color: 'var(--danger)' }}>{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
