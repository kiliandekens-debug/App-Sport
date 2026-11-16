import { muscleOf } from './exercises.js';

// Running plan: computed from the profile (goal, level, dates) and adjusted by past runs.
// Nothing is stored except the profile and the logs, so the plan always reflects the latest results.

export const GOALS = {
  '5k': { label: '5 km', km: 5, peakLong: 60 },
  '10k': { label: '10 km', km: 10, peakLong: 75 },
  semi: { label: 'Semi-marathon', km: 21.1, peakLong: 105 },
  forme: { label: 'Forme', km: 5, peakLong: 55 },
};

export const mmss = (s) => {
  if (s == null || !isFinite(s)) return '–';
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
export const hms = (s) => {
  if (s == null) return '–';
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
// "28:30" -> 1710, "1:02:10" -> 3730, "28" -> 1680
export function parseDuration(text) {
  const parts = String(text || '').trim().replace(',', '.').split(':').map(Number);
  if (!parts.length || parts.some((n) => !isFinite(n) || n < 0)) return null;
  if (parts.length === 1) return Math.round(parts[0] * 60) || null;
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]) || null;
  return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]) || null;
}

export function pacesOf(profile) {
  const t5 = Number(profile.ref_time_s) * Math.pow(5 / Number(profile.ref_distance_km || 5), 1.06);
  const p5 = t5 / 5;
  return { p5, easy: p5 * 1.25, long: p5 * 1.3, steady: p5 * 1.14, tempo: p5 * 1.06, fast: p5 * 0.97, rep: p5 * 0.92 };
}

const r5 = (n) => Math.max(5, Math.round(n / 5) * 5);
const INTENSITY = { warm: 0.3, cool: 0.3, easy: 0.4, steady: 0.58, tempo: 0.74, fast: 0.95, rest: 0.22 };
export const TYPE_LABEL = { warm: 'Échauffement', cool: 'Retour au calme', easy: 'Facile', steady: 'Allure régulière', tempo: 'Seuil', fast: 'Rapide', rest: 'Récupération' };

const block = (type, mins, pace) => ({ type, mins, pace });
const rep = (reps, work, rest) => ({ type: 'rep', reps, work, rest });

function qualityTemplate(profile, f, w, p, scale) {
  const warm = block('warm', 10, p.easy * scale);
  const cool = block('cool', 8, p.easy * scale);
  const fartlek = [warm, rep(6, block('fast', 1, p.fast * scale), block('rest', 1.5, p.easy * 1.05 * scale)), cool];
  const tempo = (n, m) => [warm, rep(n, block('tempo', m, p.tempo * scale), block('rest', 2, p.easy * scale)), cool];
  const intervals = (n, m) => [{ ...warm, mins: 12 }, rep(n, block('fast', m, p.fast * scale), block('rest', 2, p.easy * scale)), cool];
  const list = f < 0.35 ? [fartlek, tempo(2, 8)] : f < 0.75 ? [intervals(5, 3), tempo(3, 8), intervals(4, 4)] : [tempo(2, 12), intervals(6, 3), tempo(1, 20)];
  return list[w % list.length];
}

const totalMins = (blocks) => blocks.reduce((a, b) => a + (b.type === 'rep' ? b.reps * (b.work.mins + b.rest.mins) : b.mins), 0);
const kmOf = (blocks) => blocks.reduce((a, b) => {
  if (b.type === 'rep') return a + b.reps * ((b.work.mins * 60) / b.work.pace + (b.rest.mins * 60) / b.rest.pace);
  return a + (b.mins * 60) / b.pace;
}, 0);

export function totalWeeks(profile, today = new Date()) {
  const start = new Date(profile.started_on);
  if (profile.target_date) {
    const w = Math.ceil((new Date(profile.target_date) - start) / (7 * 86400000));
    return Math.min(20, Math.max(4, w));
  }
  return profile.goal === 'forme' ? 12 : profile.goal === 'semi' ? 16 : 10;
}

function buildWeek(profile, w, total, adj) {
  const goal = GOALS[profile.goal] || GOALS['5k'];
  const p = pacesOf(profile);
  const scale = adj.paceScale;
  const days = Math.min(4, Math.max(2, profile.days_per_week));
  const taper = total >= 5 && profile.goal !== 'forme' && w === total - 1;
  const recover = !taper && (w + 1) % 4 === 0;
  const f = total <= 1 ? 1 : w / (total - 1);
  const L0 = profile.goal === 'semi' ? 40 : 30;
  const peakWeek = Math.max(1, total - 2);
  let longMin = L0 + (goal.peakLong - L0) * Math.min(1, w / peakWeek);
  let easyMin = 25 + 20 * f;
  if (recover) { longMin *= 0.75; easyMin *= 0.8; }
  if (taper) { longMin *= 0.6; easyMin *= 0.7; }
  longMin = r5(longMin * adj.volScale);
  easyMin = r5(easyMin * adj.volScale);

  const easy = (mins, long) => {
    const pace = (long ? p.long : p.easy) * scale;
    return [block(long ? 'steady' : 'easy', mins, pace)];
  };
  const quality = recover || taper
    ? [block('warm', 10, p.easy * scale), rep(4, block('fast', 1, p.fast * scale), block('rest', 2, p.easy * scale)), block('cool', 8, p.easy * scale)]
    : qualityTemplate(profile, f, w, p, scale);

  const defs = days === 2
    ? [['easy', easy(easyMin, false)], ['long', easy(longMin, true)]]
    : days === 3
      ? [['easy', easy(easyMin, false)], ['quality', quality], ['long', easy(longMin, true)]]
      : [['easy', easy(easyMin, false)], ['quality', quality], ['easy', easy(r5(easyMin * 0.8), false)], ['long', easy(longMin, true)]];

  return defs.map(([kind, blocks], i) => {
    const mins = Math.round(totalMins(blocks));
    const km = Math.round(kmOf(blocks) * 10) / 10;
    const titles = { easy: 'Footing facile', quality: blocks.some((b) => b.type === 'rep' && b.work.type === 'tempo') ? 'Allure seuil' : 'Fractionné', long: 'Sortie longue' };
    return { key: `${w}-${i}`, week: w, index: i, kind, title: titles[kind], blocks, mins, km, recover, taper };
  });
}

// Compares what was run with what was planned, and nudges the next sessions.
export function adaptation(profile, logs, planFor) {
  const recent = logs.filter((l) => l.session_key).slice(-3);
  if (!recent.length) return { paceScale: 1, volScale: 1, message: null, level: 'none' };
  const ratios = [];
  for (const l of recent) {
    const s = planFor(l.session_key);
    if (!s || !l.distance_km || !l.duration_s || !s.km) continue;
    ratios.push(l.duration_s / Number(l.distance_km) / ((s.mins * 60) / s.km));
  }
  const feels = recent.map((l) => l.feel).filter(Boolean);
  const r = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
  const feel = feels.length ? feels.reduce((a, b) => a + b, 0) / feels.length : 3;
  if (r > 1.04 || feel >= 4.3) {
    return { paceScale: 1.03, volScale: 0.9, level: 'easier', message: feel >= 4.3 ? 'Tes dernières sorties étaient dures. Je ralentis un peu les allures et je réduis les durées de 10 %.' : 'Tu cours plus lentement que prévu. Je ralentis un peu les allures et je réduis les durées de 10 %.' };
  }
  if (r < 0.98 && feel <= 2.7) {
    return { paceScale: 0.98, volScale: 1.05, level: 'harder', message: 'Tes sorties passent facilement. J\'accélère légèrement les allures et j\'ajoute 5 % de durée.' };
  }
  return { paceScale: 1, volScale: 1, level: 'ok', message: 'Tu suis le plan comme prévu. Rien à changer.' };
}

export function buildPlan(profile, logs, workouts = [], now = new Date()) {
  const total = totalWeeks(profile);
  const done = new Set(logs.map((l) => l.session_key).filter(Boolean));
  const base = [];
  for (let w = 0; w < total; w++) base.push(...buildWeek(profile, w, total, { paceScale: 1, volScale: 1 }));
  const adj = adaptation(profile, logs, (k) => base.find((s) => s.key === k));

  const weeks = [];
  for (let w = 0; w < total; w++) weeks.push(buildWeek(profile, w, total, adj).map((s) => ({ ...s, done: done.has(s.key) })));

  // The plan slides when weeks are missed: current week = calendar week minus fully skipped weeks.
  const start = new Date(profile.started_on);
  const calWeek = Math.max(0, Math.floor((now - start) / (7 * 86400000)));
  let missed = 0;
  for (let w = 0; w < Math.min(calWeek, total); w++) if (weeks[w].every((x) => !x.done)) missed += 1;
  let cur = Math.max(0, Math.min(calWeek - Math.min(2, missed), total - 1));
  while (cur < total - 1 && weeks[cur].every((s) => s.done)) cur += 1;
  const next = weeks.slice(cur).flat().find((s) => !s.done) || null;

  // Gym link: heavy legs in the last 24h and a hard session next.
  let note = null;
  if (next && next.kind === 'quality') {
    const recentLegs = workouts.some((w) => now - w.start < 26 * 3600000 && w.sets.filter((s) => muscleOf(s.exercise) === 'Jambes').length >= 6);
    if (recentLegs) note = 'Tu as travaillé les jambes dans les dernières 24 h. Si elles sont lourdes, fais plutôt un footing facile de même durée.';
  }
  return { total, weeks, current: cur, next, adj, note, finished: !next };
}

// "5:10 – 5:30 /km"
export const paceRange = (pace, below = 5, above = 10) => `${mmss(pace - below)} – ${mmss(pace + above)}`;

// Instructions to type in Apple's Exercice app (Watch › Course › ⋯ › Séance personnalisée).
export function appleSteps(session) {
  const simple = session.blocks.length === 1;
  if (simple) {
    const b = session.blocks[0];
    return {
      where: 'Exercice › Course (extérieur) › bouton ⋯ › Durée',
      steps: [
        { title: `Objectif : ${b.mins} min`, detail: `Choisis « Durée » et règle ${b.mins} minutes.` },
        { title: `Allure : ${paceRange(b.pace)} /km`, detail: 'Un effort où tu peux encore parler. Si tu veux une alerte, ajoute-la dans « Alerte d\'allure ».' },
      ],
    };
  }
  const steps = [];
  for (const b of session.blocks) {
    if (b.type === 'warm') steps.push({ title: `Échauffement : ${b.mins} min`, detail: 'Objectif « Durée ». Allure facile.' });
    else if (b.type === 'cool') steps.push({ title: `Retour au calme : ${b.mins} min`, detail: 'Objectif « Durée ». Allure facile.' });
    else if (b.type === 'rep') {
      steps.push({ title: `Intervalles : ${b.reps} répétitions`, detail: 'Ajoute un bloc « Intervalles » avec ces deux étapes.' });
      steps.push({ title: `Travail : ${fmtMin(b.work.mins)}`, detail: `Alerte d'allure ${paceRange(b.work.pace, 5, 5)} /km (${TYPE_LABEL[b.work.type].toLowerCase()}).` });
      steps.push({ title: `Récupération : ${fmtMin(b.rest.mins)}`, detail: 'Trotte très doucement ou marche.' });
    }
  }
  return { where: 'Exercice › Course (extérieur) › ⋯ › Séance personnalisée', steps };
}

export const fmtMin = (m) => (m % 1 ? `${Math.floor(m)} min ${Math.round((m % 1) * 60)} s` : `${m} min`);

// Flattened segments for the drawing.
export function segments(session) {
  const out = [];
  for (const b of session.blocks) {
    if (b.type === 'rep') for (let i = 0; i < b.reps; i++) { out.push({ ...b.work }); out.push({ ...b.rest }); }
    else out.push(b);
  }
  return out;
}
export const intensityOf = (type) => INTENSITY[type] ?? 0.4;

// "10 min échauffement, puis 6 × (1 min rapide + 1 min 30 s récup), puis 8 min retour au calme"
export function structureText(session) {
  return session.blocks.map((b) => {
    if (b.type === 'rep') return `${b.reps} × (${fmtMin(b.work.mins)} ${TYPE_LABEL[b.work.type].toLowerCase()} + ${fmtMin(b.rest.mins)} récup)`;
    return `${fmtMin(b.mins)} ${TYPE_LABEL[b.type].toLowerCase()}`;
  }).join(', puis ');
}

// Riegel: time over another distance from a known performance.
export const predict = (timeS, fromKm, toKm) => timeS * Math.pow(toKm / fromKm, 1.06);

export function goalPrediction(profile) {
  const g = GOALS[profile.goal] || GOALS['5k'];
  return predict(Number(profile.ref_time_s), Number(profile.ref_distance_km), g.km);
}

// A logged run that implies a better level than the stored one (only runs of 3 km or more count).
export function betterLevel(profile, logs) {
  const ref5 = predict(Number(profile.ref_time_s), Number(profile.ref_distance_km), 5);
  let best = null;
  for (const l of logs) {
    const km = Number(l.distance_km);
    if (!km || km < 3 || !l.duration_s) continue;
    if (new Date(l.done_at) < new Date(profile.updated_at || 0)) continue;
    const eq = predict(l.duration_s, km, 5);
    if (eq < ref5 * 0.985 && (!best || eq < best.eq5)) best = { eq5: eq, log: l, ref5 };
  }
  return best;
}

const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export function runStats(logs, weeksBack = 8, now = new Date()) {
  const valid = logs.filter((l) => Number(l.distance_km) > 0 && l.duration_s > 0);
  const totalKm = valid.reduce((a, l) => a + Number(l.distance_km), 0);
  const totalS = valid.reduce((a, l) => a + l.duration_s, 0);
  const thisMonday = mondayOf(now);
  const weeks = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const from = new Date(thisMonday); from.setDate(from.getDate() - i * 7);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    const km = valid.filter((l) => { const d = new Date(l.done_at); return d >= from && d < to; }).reduce((a, l) => a + Number(l.distance_km), 0);
    weeks.push({ from, km });
  }
  const longest = valid.reduce((a, l) => Math.max(a, Number(l.distance_km)), 0);
  return { count: valid.length, totalKm, avgPace: totalKm ? totalS / totalKm : null, weeks, longest, weekKm: weeks[weeks.length - 1].km };
}
