import { useEffect, useState } from 'react';
import { BUILD, VERSION, CHANGELOG } from './changelog.js';
import { Icon } from './components.jsx';

const SEEN = 'app-sport-seen-version';

// Checks /version.json when the app comes back to the screen (and every 10 minutes):
// if another build is online, offers to reload.
export function useUpdateCheck() {
  const [next, setNext] = useState(null);
  useEffect(() => {
    if (BUILD === 'local') return undefined;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const v = await r.json();
        if (!stop && v.build && v.build !== BUILD) setNext(v);
      } catch { /* offline */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    check();
    const t = setInterval(check, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return next;
}

export function UpdateBanner() {
  const next = useUpdateCheck();
  const [later, setLater] = useState(null);
  const show = next && later !== next.build;
  // Reserve room at the bottom of the page so the banner never hides the last button.
  useEffect(() => {
    document.body.classList.toggle('has-update', !!show);
    return () => document.body.classList.remove('has-update');
  }, [show]);
  if (!show) return null;
  return (
    <div className="update-banner" role="status">
      <span className="grow small"><b>Nouvelle version {next.version}</b> disponible.</span>
      <button className="btn primary" style={{ height: 36, borderRadius: 18, padding: '0 14px', fontSize: 14 }} onClick={() => window.location.reload()}>Mettre à jour</button>
      <button className="icon-btn" aria-label="Plus tard" style={{ width: 36, height: 36, borderRadius: 18 }} onClick={() => setLater(next.build)}><Icon name="close" size={16} /></button>
    </div>
  );
}

// Release notes. Shown once automatically after an update, and from the profile.
export function WhatsNew({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Nouveautés" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        <div className="row">
          <div className="grow stack" style={{ gap: 2 }}>
            <span className="xs muted" style={{ fontWeight: 600 }}>Version {VERSION} ({BUILD})</span>
            <span className="display">Nouveautés</span>
          </div>
          <button className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="close" /></button>
        </div>
        {CHANGELOG.map((r, i) => (
          <section key={r.version} className="stack" style={{ gap: 6, padding: 14, borderRadius: 18, background: i === 0 ? 'color-mix(in srgb, var(--accent) 10%, var(--raised))' : 'var(--raised)' }}>
            <div className="between"><b>{r.version} · {r.title}</b><span className="xs muted">{new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {r.items.map((t) => <li key={t} className="small" style={{ lineHeight: 1.4 }}>{t}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// True once after the app was updated to a version not seen yet.
export function useFreshVersion() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    try {
      const seen = localStorage.getItem(SEEN);
      if (seen && seen !== VERSION) setFresh(true);
      localStorage.setItem(SEEN, VERSION);
    } catch { /* private mode */ }
  }, []);
  return [fresh, () => setFresh(false)];
}
