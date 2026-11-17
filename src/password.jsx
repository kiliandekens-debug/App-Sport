import { useState } from 'react';
import { supabase } from './supabase.js';
import { useUi } from './ui.jsx';

export function PasswordForm({ onDone, submitLabel = 'Enregistrer le mot de passe' }) {
  const ui = useUi();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const short = p1.length > 0 && p1.length < 8;
  const mismatch = p2.length > 0 && p1 !== p2;
  const ok = p1.length >= 8 && p1 === p2;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) { ui.notify(error.message); return; }
    setP1(''); setP2('');
    ui.notify('Mot de passe enregistré');
    onDone?.();
  };
  return (
    <form onSubmit={save} className="stack" style={{ gap: 8 }}>
      <input className="input" type="password" autoComplete="new-password" placeholder="Nouveau mot de passe (8 caractères minimum)" value={p1} onChange={(e) => setP1(e.target.value)} aria-label="Nouveau mot de passe" />
      <input className="input" type="password" autoComplete="new-password" placeholder="Confirme le mot de passe" value={p2} onChange={(e) => setP2(e.target.value)} aria-label="Confirmation du mot de passe" />
      {(short || mismatch) && <span className="small" style={{ color: 'var(--danger)' }}>{short ? '8 caractères minimum.' : 'Les deux mots de passe ne sont pas identiques.'}</span>}
      <button className="btn primary" disabled={!ok || busy}>{busy ? '…' : submitLabel}</button>
    </form>
  );
}
