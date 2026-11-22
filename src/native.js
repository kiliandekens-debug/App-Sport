// Native iPhone app (Capacitor) features. On the web every function here is a
// no-op or returns false, so the same code base serves both.
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();

// --- Rest notifications, scheduled on the phone itself (no server needed). ---
const REST_IDS = Array.from({ length: 40 }, (_, i) => 9000 + i);

async function notifications() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

export async function nativeNotifyPermission() {
  const LN = await notifications();
  const cur = await LN.checkPermissions();
  if (cur.display === 'granted') return true;
  const res = await LN.requestPermissions();
  return res.display === 'granted';
}

export async function nativeCancelRest() {
  const LN = await notifications();
  await LN.cancel({ notifications: REST_IDS.map((id) => ({ id })) });
}

// restUntil: ms timestamp; every: 0, 15 or 30 s reminders; body: next set.
export async function nativeScheduleRest(restUntil, every, body) {
  const LN = await notifications();
  await nativeCancelRest();
  if (!restUntil || restUntil <= Date.now()) return;
  const list = [];
  if (every) {
    for (let t = restUntil - every * 1000, i = 1; t > Date.now() + 1000 && i < REST_IDS.length; t -= every * 1000, i++) {
      const left = Math.round((restUntil - t) / 1000);
      list.push({ id: REST_IDS[i], title: `Repos : encore ${left} s`, body, schedule: { at: new Date(t), allowWhileIdle: true }, threadIdentifier: 'rest' });
    }
  }
  list.push({ id: REST_IDS[0], title: 'Repos terminé', body, schedule: { at: new Date(restUntil), allowWhileIdle: true }, threadIdentifier: 'rest' });
  await LN.schedule({ notifications: list });
}

// --- Screen kept on during a session. ---
export async function nativeKeepAwake(on) {
  const { KeepAwake } = await import('@capacitor-community/keep-awake');
  if (on) await KeepAwake.keepAwake(); else await KeepAwake.allowSleep();
}

// --- Apple Health: running workouts become run logs. ---
export async function healthAvailable() {
  if (!isNative()) return false;
  const { Health } = await import('capacitor-health');
  try { return (await Health.isHealthAvailable()).available; } catch { return false; }
}

const LINKED = 'app-sport-health-linked';
export const healthLinked = () => { try { return localStorage.getItem(LINKED) === '1'; } catch { return false; } };

// Returns runs in the shape importRuns() expects.
export async function healthRuns(days = 365) {
  const { Health } = await import('capacitor-health');
  await Health.requestHealthPermissions({ permissions: ['READ_WORKOUTS', 'READ_DISTANCE', 'READ_HEART_RATE', 'READ_ACTIVE_CALORIES'] });
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  try { localStorage.setItem(LINKED, '1'); } catch { /* private mode */ }
  const { workouts } = await Health.queryWorkouts({ startDate: start.toISOString(), endDate: end.toISOString(), includeHeartRate: true, includeRoute: false, includeSteps: false });
  return (workouts || [])
    .filter((w) => /running/i.test(w.workoutType) && w.distance > 300)
    .map((w) => {
      const hr = (w.heartRate || []).map((h) => h.bpm).filter(Boolean);
      return {
        done_at: new Date(w.startDate).toISOString(),
        distance_km: Math.round((w.distance / 1000) * 100) / 100,
        duration_s: Math.round(w.duration),
        avg_hr: hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null,
        calories: w.calories ? Math.round(w.calories) : null,
        source: 'apple-health',
      };
    });
}

// --- Status bar follows the app theme. ---
export async function nativeStatusBar(dark) {
  if (!isNative()) return;
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  try { await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }); } catch { /* not critical */ }
}
