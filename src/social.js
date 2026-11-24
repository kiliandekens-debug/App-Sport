// Fil des amis. Une publication est une copie des chiffres que l'auteur a choisi de montrer :
// les amis ne lisent jamais les tables de séances ou de courses (règles RLS côté base).
import { supabase } from './supabase.js';
import { isWork, isPlausible, fmtKg } from './lib/stats.js';
import { buildPlan, segments, intensityOf } from './lib/running.js';
import { isWalk, ACTIVITIES } from './lib/treadmill.js';

const INVITE = 'kadence-friend-code';
export const INVITE_BASE = 'https://sport.kadeon.be/ami/';

// Code d'ami venu d'un lien /ami/<code>, gardé jusqu'à la connexion.
export function keepInviteFromUrl() {
  const m = window.location.pathname.match(/^\/ami\/([A-Za-z0-9]{6,12})$/);
  if (!m) return;
  try { localStorage.setItem(INVITE, m[1].toUpperCase()); } catch { /* private mode */ }
  window.history.replaceState(null, '', '/amis');
}
export function takePendingInvite() {
  try { const c = localStorage.getItem(INVITE); if (c) localStorage.removeItem(INVITE); return c; } catch { return null; }
}

const uid = async () => (await supabase.auth.getUser()).data.user;
const defaultName = (u) => (u?.user_metadata?.name || u?.email?.split('@')[0] || 'Moi').slice(0, 40);

// Mon profil social, créé à la première visite.
export async function ensureProfile() {
  const u = await uid();
  const { data, error } = await supabase.from('social_profiles').select('*').eq('user_id', u.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: made, error: e2 } = await supabase.from('social_profiles').insert({ user_id: u.id, name: defaultName(u) }).select('*').single();
  if (e2) throw e2;
  return made;
}
export async function updateProfile(patch) {
  const u = await uid();
  const { error } = await supabase.from('social_profiles').update(patch).eq('user_id', u.id);
  if (error) throw error;
}

// Amis, demandes reçues et envoyées, avec les noms.
export async function loadFriends() {
  const u = await uid();
  const { data: rows, error } = await supabase.from('friendships').select('*');
  if (error) throw error;
  const other = (f) => (f.requester === u.id ? f.addressee : f.requester);
  const ids = [...new Set(rows.map(other))];
  const names = new Map();
  if (ids.length) {
    const { data: ps, error: e2 } = await supabase.from('social_profiles').select('user_id,name').in('user_id', ids);
    if (e2) throw e2;
    for (const p of ps) names.set(p.user_id, p.name);
  }
  const item = (f) => ({ id: f.id, user: other(f), name: names.get(other(f)) || 'Ami', since: f.created_at });
  return {
    me: u.id,
    friends: rows.filter((f) => f.status === 'accepted').map(item),
    incoming: rows.filter((f) => f.status === 'pending' && f.addressee === u.id).map(item),
    outgoing: rows.filter((f) => f.status === 'pending' && f.requester === u.id).map(item),
  };
}

// At least one friend: the app then offers to share at the end of a session.
export async function hasFriends() {
  const { count, error } = await supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('status', 'accepted');
  return !error && count > 0;
}

export async function requestFriend(code) {
  const { data, error } = await supabase.rpc('request_friend', { p_code: code });
  if (error) throw error;
  return data;
}
export async function respondFriend(id, accept) {
  const { error } = await supabase.rpc('respond_friend', { p_id: id, p_accept: accept });
  if (error) throw error;
}
export async function removeFriend(id) {
  const { error } = await supabase.from('friendships').delete().eq('id', id);
  if (error) throw error;
}
export async function blockUser(userId) {
  const { error } = await supabase.rpc('block_user', { p_user: userId });
  if (error) throw error;
}
export async function report({ postId = null, commentId = null, userId = null, reason = null }) {
  const { error } = await supabase.from('reports').insert({ post_id: postId, comment_id: commentId, reported_user: userId, reason });
  if (error) throw error;
}

// Publications de moi et de mes amis depuis `days` jours, avec bravos et nombre de commentaires.
export async function loadFeed(days = 84) {
  const u = await uid();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: posts, error } = await supabase.from('posts').select('*').gte('done_at', since).order('done_at', { ascending: false }).limit(300);
  if (error) throw error;
  const ids = posts.map((p) => p.id);
  const users = [...new Set(posts.map((p) => p.user_id))];
  const [r, c, n] = await Promise.all([
    ids.length ? supabase.from('reactions').select('post_id,user_id').in('post_id', ids) : { data: [] },
    ids.length ? supabase.from('comments').select('post_id').in('post_id', ids) : { data: [] },
    users.length ? supabase.from('social_profiles').select('user_id,name').in('user_id', users) : { data: [] },
  ]);
  for (const x of [r, c, n]) if (x.error) throw x.error;
  const names = new Map(n.data.map((p) => [p.user_id, p.name]));
  return posts.map((p) => {
    const re = r.data.filter((x) => x.post_id === p.id);
    return { ...p, name: names.get(p.user_id) || 'Ami', mine: p.user_id === u.id, bravos: re.length, bravoed: re.some((x) => x.user_id === u.id), comments: c.data.filter((x) => x.post_id === p.id).length };
  });
}

export async function loadComments(postId) {
  const { data, error } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at');
  if (error) throw error;
  const users = [...new Set(data.map((x) => x.user_id))];
  const { data: ps } = users.length ? await supabase.from('social_profiles').select('user_id,name').in('user_id', users) : { data: [] };
  const names = new Map((ps || []).map((p) => [p.user_id, p.name]));
  return data.map((x) => ({ ...x, name: names.get(x.user_id) || 'Ami' }));
}
export async function addComment(postId, body) {
  const { error } = await supabase.from('comments').insert({ post_id: postId, body: body.trim().slice(0, 500) });
  if (error) throw error;
}
export async function deleteComment(id) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}
export async function setBravo(postId, on) {
  const u = await uid();
  const q = on ? supabase.from('reactions').insert({ post_id: postId }) : supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', u.id);
  const { error } = await q;
  if (error) throw error;
}

export async function publish(post) {
  const { error } = await supabase.from('posts').upsert(post, { onConflict: 'user_id,kind,ref_id' });
  if (error) throw error;
}
export async function unpublish(id) {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
}
// Mes publications, pour savoir ce qui est déjà partagé (ref_id).
export async function mySharedRefs() {
  const u = await uid();
  const { data, error } = await supabase.from('posts').select('id,kind,ref_id').eq('user_id', u.id);
  if (error) throw error;
  return new Map(data.map((p) => [`${p.kind}:${p.ref_id}`, p.id]));
}

// --- What a post shows, built from the session (the author chooses before publishing). ---

// A gym session: duration, sets, tonnage, each exercise with its best set, and the records.
export function gymPost(w, data, { loads = true, hr = null } = {}) {
  const work = w.sets.filter((s) => isWork(s) && isPlausible(s));
  const byEx = new Map();
  for (const s of work) { if (!byEx.has(s.exercise)) byEx.set(s.exercise, []); byEx.get(s.exercise).push(s); }
  const records = [];
  const exercises = [...byEx].map(([name, sets]) => {
    const best = sets.reduce((b, s) => (s.weight_kg * (1 + s.reps / 30) > b.weight_kg * (1 + b.reps / 30) ? s : b), sets[0]);
    const ex = data.exercises?.get(name);
    if (ex && ex.history.length > 1 && ex.best && ex.best.date.getTime() === w.start.getTime()) records.push(`${name} ${fmtKg(ex.best.kg)} kg × ${ex.best.reps}`);
    return {
      n: name, s: sets.length,
      b: loads ? (best.weight_kg ? `${fmtKg(best.weight_kg)} kg × ${best.reps}` : `poids du corps × ${best.reps}`) : null,
      sets: loads ? sets.map((s) => ({ kg: s.weight_kg, reps: s.reps })) : null,
    };
  });
  const tonnes = work.reduce((a, s) => a + s.weight_kg * s.reps, 0) / 1000;
  return {
    kind: 'gym', ref_id: w.id, title: w.title.slice(0, 80), done_at: w.started_at,
    stats: { mins: w.end ? Math.round((w.end - w.start) / 60000) : null, sets: work.length, tonnes: Math.round(tonnes * 10) / 10, exercises, records: loads ? records.slice(0, 3) : [], ...(hr ? { hr } : {}) },
  };
}

// A run or a walk: distance, time, pace or speed, D+, and the session's profile when it was planned.
export function runPost(l, data, { hr = false } = {}) {
  const walk = isWalk(l);
  const km = Number(l.distance_km) || 0;
  let title = l.notes || (walk ? ACTIVITIES[l.activity] : 'Course');
  let bars = null;
  if (!walk && l.session_key && data.runProfile) {
    const s = buildPlan(data.runProfile, data.runLogs, data.workouts).weeks.flat().find((x) => x.key === l.session_key);
    if (s) {
      title = s.title;
      bars = segments(s).map((x) => [Math.round(x.mins * 10) / 10, Math.round(intensityOf(x.type) * 100) / 100, x.type]);
    }
  }
  const v = l.splits;
  return {
    kind: walk ? 'walk' : 'run', ref_id: l.id, title: String(title).slice(0, 80), done_at: l.done_at,
    stats: {
      km, secs: l.duration_s, activity: l.activity || 'run',
      ...(walk || l.activity === 'treadmill' ? { speed: Number(l.speed_kmh) || (l.duration_s ? Math.round((km / l.duration_s) * 36000) / 10 : 0) } : {}),
      ...(l.elevation_m ? { elevation: Math.round(l.elevation_m) } : {}),
      ...(l.incline_pct ? { incline: Number(l.incline_pct) } : {}),
      ...(bars ? { bars } : {}),
      ...(v?.matched && v.total >= 2 ? { held: v.ok, of: v.total } : {}),
      ...(hr && l.avg_hr ? { hr: l.avg_hr } : {}),
    },
  };
}

// This week's ranking among friends, from published sessions only.
export function ranking(posts, now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const people = new Map();
  for (const p of posts) {
    if (!people.has(p.user_id)) people.set(p.user_id, { user: p.user_id, name: p.name, mine: p.mine, sessions: 0, km: 0, dplus: 0, tonnes: 0, weeks: new Map() });
    const x = people.get(p.user_id);
    const d = new Date(p.done_at);
    const wk = Math.floor((monday - new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))) / (7 * 86400000) + 0.5);
    x.weeks.set(wk, (x.weeks.get(wk) || 0) + 1);
    if (d < monday) continue;
    x.sessions += 1;
    x.km += Number(p.stats?.km || 0);
    x.dplus += Number(p.stats?.elevation || 0);
    x.tonnes += Number(p.stats?.tonnes || 0);
  }
  // Streak: weeks in a row with at least 2 sessions (this week counts once it has 2).
  for (const x of people.values()) {
    let n = 0;
    let w = (x.weeks.get(0) || 0) >= 2 ? 0 : 1;
    while ((x.weeks.get(w) || 0) >= 2) { n += 1; w += 1; }
    x.streak = n;
    delete x.weeks;
  }
  return [...people.values()];
}
