import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sendFeedback } from './beta.js';

// Feuille « Donner mon avis » : un message libre, envoyé avec la page, la version et l'appareil.
export function FeedbackSheet({ onClose, onSent }) {
  const [text, setText] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const { pathname } = useLocation();
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setState('busy'); setError('');
    try { await sendFeedback(text.trim(), pathname); onSent?.(); onClose(); } catch (err) { setError(err.message || String(err)); setState('idle'); }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="Donner mon avis" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <span className="sheet-grip" />
        <span className="display" style={{ fontSize: 20 }}>Donner mon avis</span>
        <span className="small muted" style={{ lineHeight: 1.45 }}>Un bug, une idée, quelque chose de pas clair ? Kilian lit chaque message.</span>
        <textarea className="input" autoFocus rows={6} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)}
          aria-label="Ton message" placeholder="Ton message" style={{ height: 'auto', minHeight: 140, padding: 12, resize: 'vertical', lineHeight: 1.45 }} />
        {error && <span className="small" role="alert" style={{ color: 'var(--danger)' }}>{error}</span>}
        <div className="grid2">
          <button type="button" className="btn" style={{ borderRadius: 14, height: 50 }} onClick={onClose}>Annuler</button>
          <button className="btn primary" style={{ borderRadius: 14, height: 50 }} disabled={!text.trim() || state === 'busy'}>{state === 'busy' ? '…' : 'Envoyer'}</button>
        </div>
      </form>
    </div>
  );
}
