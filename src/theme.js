// Appearance: follows the phone by default, or forced to light / dark from the profile.
const KEY = 'app-sport-theme';

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14161A' : '#E9ECEF');
}

export function setTheme(t) {
  try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* private mode */ }
  applyTheme(t);
}
