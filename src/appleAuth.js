// « Continuer avec Apple » : one button for sign-up and sign-in.
// - iPhone app: the system sheet (Face ID) through the app's native module, then
//   signInWithIdToken (no browser).
// - Web: Supabase's OAuth redirect to Apple, back to the app signed in.
// The beta code typed before is kept on the device and used at the first opening (beta.js).
import { supabase } from './supabase.js';
import { isNative, WatchBridge } from './native.js';

const PENDING = 'kad-pending-invite';

// On the web, Apple needs the OAuth secret made from the .p8 key in Supabase (Authentication ›
// Providers › Apple › Secret Key). Turn this on once it is set; the iPhone app does not need it.
const WEB_READY = false;
export const appleAvailable = () => isNative() || WEB_READY;

export function rememberInvite(code) {
  try {
    const c = (code || '').trim().toUpperCase();
    if (c) localStorage.setItem(PENDING, c); else localStorage.removeItem(PENDING);
  } catch { /* private mode: the code can still be typed in Profil */ }
}

export function takePendingInvite() {
  try {
    const c = localStorage.getItem(PENDING);
    localStorage.removeItem(PENDING);
    return c || null;
  } catch { return null; }
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const randomNonce = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

// Resolves when signed in (iPhone) or when the browser leaves for Apple (web).
// Returns false when the person closed the Apple sheet.
export async function signInWithApple() {
  if (isNative()) {
    const raw = randomNonce();
    let res;
    try {
      res = await WatchBridge.appleSignIn({ nonce: await sha256Hex(raw) });
    } catch (e) {
      if (/cancel/i.test(e?.code || e?.message || '')) return false;
      throw e;
    }
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: res.idToken, nonce: raw });
    if (error) throw error;
    // Apple gives the name only the very first time: keep it.
    const name = [res.givenName, res.familyName].filter(Boolean).join(' ').trim();
    if (name && !data?.user?.user_metadata?.name) await supabase.auth.updateUser({ data: { name } });
    return true;
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: window.location.origin } });
  if (error) throw error;
  return true;
}
