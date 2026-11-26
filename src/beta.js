import { supabase } from './supabase.js';
import { VERSION } from './changelog.js';
import { isNative } from './native.js';
import { takePendingInvite } from './appleAuth.js';

// Bêta : 50 places, premium pendant 1 an, obtenues avec un code d'invitation (créé dans le
// back-office). La base vérifie tout (fonction redeem_invite) ; l'app ne fait qu'afficher.

export async function loadAccess() {
  const [g, p] = await Promise.all([
    supabase.from('grants').select('kind,seat,starts_at,ends_at,revoked_at').eq('kind', 'beta').maybeSingle(),
    supabase.rpc('is_premium'),
  ]);
  return { beta: g.data || null, premium: p.data === true };
}

export const betaActive = (b) => Boolean(b && !b.revoked_at && (!b.ends_at || new Date(b.ends_at) > new Date()));

export async function redeemCode(code) {
  const { data, error } = await supabase.rpc('redeem_invite', { p_code: code });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Code saisi à l'inscription : utilisé une seule fois, à la première ouverture du compte.
export async function redeemPendingCode() {
  const { data } = await supabase.auth.getUser();
  const meta = data?.user?.user_metadata?.invite_code;
  // « Continuer avec Apple » : the code typed before is kept on the device (appleAuth.js).
  const code = meta || takePendingInvite();
  if (!code) return null;
  let res;
  try { res = await redeemCode(code); } catch (e) { res = { error: e.message || String(e) }; }
  if (meta) await supabase.auth.updateUser({ data: { invite_code: null } });
  return res;
}

// « Donner mon avis » : lu dans le back-office.
export async function sendFeedback(message, page) {
  const { error } = await supabase.from('feedback').insert({
    message: message.slice(0, 4000),
    page: (page || '').slice(0, 200),
    app_version: VERSION,
    platform: isNative() ? 'iPhone' : /iPhone|iPad/.test(navigator.userAgent) ? 'Web iOS' : 'Web',
  });
  if (error) throw error;
}

// Données de santé (RGPD, article 9) : accord explicite avant d'importer des courses avec
// fréquence cardiaque et calories (Apple Santé, Strava). Gardé dans le compte, avec la date.
export const hasHealthConsent = (user) => Boolean(user?.user_metadata?.health_consent_at);

export async function ensureHealthConsent(ui) {
  const { data } = await supabase.auth.getUser();
  if (hasHealthConsent(data?.user)) return true;
  const ok = await ui.confirm({
    title: 'Tes données de santé',
    message: 'Tes courses contiennent des données de santé : fréquence cardiaque, calories, distance et durée. '
      + 'Kadence les enregistre sur ses serveurs dans l\'Union européenne (Irlande), uniquement pour ton suivi et ton coach. '
      + 'Elles ne sont ni partagées ni vendues, et jamais utilisées pour de la publicité. '
      + 'Tu peux retirer ton accord à tout moment dans Profil, et tout effacer en supprimant ton compte.',
    ok: 'J\'accepte',
    cancel: 'Pas maintenant',
  });
  if (!ok) return false;
  const { error } = await supabase.auth.updateUser({ data: { health_consent_at: new Date().toISOString() } });
  if (error) { ui.notify(error.message); return false; }
  return true;
}

export async function withdrawHealthConsent() {
  const { error } = await supabase.auth.updateUser({ data: { health_consent_at: null } });
  if (error) throw error;
  try { localStorage.removeItem('app-sport-health-linked'); } catch { /* private mode */ }
}
