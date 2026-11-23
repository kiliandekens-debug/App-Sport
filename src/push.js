import { supabase } from './supabase.js';
import { isNative, nativeNotifyPermission, nativeCancelRest, nativeScheduleRest } from './native.js';

// Web Push: notifications at the end of each rest, on the iPhone and, when it is locked, the Apple Watch.
// iOS only allows it for the app added to the home screen (iOS 16.4 or later).
export const VAPID_PUBLIC = 'BLj3qvyn9DEQWKMp6it88p9_IrdTj7_558NG-ajaY4dStwgwvFTzL9pf2XLe3wWTihx3sKR259qGhoFRznqUd_o';
const FLAG = 'app-sport-push';

export const pushSupported = () => isNative() || (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
export const pushEnabled = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
// Countdown reminders during the rest: 0 (end only), 15 or 30 seconds.
const EVERY = 'app-sport-push-every';
export const pushEvery = () => { try { return Number(localStorage.getItem(EVERY) || 0); } catch { return 0; } };
export const setPushEvery = (s) => { try { localStorage.setItem(EVERY, String(s)); } catch { /* private mode */ } };
const mmssOf = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function registerSw() {
  if (isNative() || !('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

export async function enablePush() {
  // iPhone app: notifications are scheduled on the phone, no subscription needed.
  if (isNative()) {
    if (!(await nativeNotifyPermission())) throw new Error('Notifications refusées. Tu peux les autoriser dans Réglages › Notifications › Kadence.');
    try { localStorage.setItem(FLAG, '1'); } catch { /* private mode */ }
    return;
  }
  if (!pushSupported()) throw new Error(isIos() && !isStandalone() ? 'Ajoute d\'abord l\'app à l\'écran d\'accueil (Partager › Sur l\'écran d\'accueil), puis ouvre-la depuis l\'icône.' : 'Ce navigateur ne gère pas les notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Tu peux les autoriser dans Réglages › Notifications › Kadence.');
  const reg = (await registerSw()) || (await navigator.serviceWorker.ready);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
  try { localStorage.setItem(FLAG, '1'); } catch { /* private mode */ }
}

export async function disablePush() {
  try { localStorage.removeItem(FLAG); } catch { /* private mode */ }
  if (isNative()) { await nativeCancelRest(); return; }
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
}

export async function testPush() {
  if (isNative()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({ notifications: [{ id: 8999, title: 'Kadence', body: 'Les notifications fonctionnent.', schedule: { at: new Date(Date.now() + 5000) } }] });
    return;
  }
  const { error } = await supabase.from('scheduled_pushes').insert({ send_at: new Date(Date.now() + 5000).toISOString(), tag: 'test', title: 'Kadence', body: 'Les notifications fonctionnent. Verrouille l\'iPhone : elles arriveront aussi sur ta montre.', url: '/profil' });
  if (error) throw error;
}

// Keeps exactly one pending "end of rest" notification in step with the session's timer.
// Calls are queued: two quick changes (+15 s tapped twice) must not interleave their
// delete and insert, or the older « Repos terminé » would stay scheduled and arrive too early.
let last = null;
let queue = Promise.resolve();
export function syncRestPush(restUntil, body) {
  if (!pushEnabled()) return queue;
  const key = restUntil ? `${restUntil}|${body}` : null;
  if (key === last) return queue;
  last = key;
  // A call overtaken by a newer one before its turn has nothing left to do.
  queue = queue.then(() => (key === last ? applyRestPush(restUntil, body) : undefined));
  return queue;
}

async function applyRestPush(restUntil, body) {
  const key = restUntil ? `${restUntil}|${body}` : null;
  if (isNative()) {
    try { await nativeScheduleRest(restUntil, pushEvery(), body); } catch { /* permission withdrawn: nothing to do */ }
    return;
  }
  let ok = false;
  try {
    const { error } = await supabase.from('scheduled_pushes').delete().is('sent_at', null).eq('tag', 'rest');
    if (error) throw error;
    if (restUntil && restUntil > Date.now() + 3000) {
      // One notification per step, all with the same tag: each one replaces the previous on the iPhone and the watch.
      const rows = [];
      const every = pushEvery();
      if (every > 0) {
        for (let t = restUntil - every * 1000; t > Date.now() + 4000; t -= every * 1000) {
          const left = Math.round((restUntil - t) / 1000);
          rows.push({ send_at: new Date(t).toISOString(), tag: 'rest', title: `Repos : encore ${mmssOf(left)}`, body: `Ensuite : ${body}`, url: '/seance' });
        }
      }
      rows.push({ send_at: new Date(restUntil).toISOString(), tag: 'rest', title: 'Repos terminé', body, url: '/seance' });
      const { error: e2 } = await supabase.from('scheduled_pushes').insert(rows);
      if (e2) throw e2;
    }
    ok = true;
  } catch { /* offline: the in-app beep still works, and we retry below */ }
  // Failed (gym without network): forget the key so the same timer can be scheduled again,
  // and retry in 10 s unless a newer change has taken over or the rest is already over.
  if (!ok && last === key) {
    last = undefined; // matches no key, not even « no rest » (null)
    if (!restUntil || restUntil > Date.now() + 3000) setTimeout(() => { if (last === undefined) syncRestPush(restUntil, body); }, 10000);
  }
}
