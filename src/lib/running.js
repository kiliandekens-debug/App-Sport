import { muscleOf } from './exercises.js';

/* Running coach.
   - Paces from the athlete's VDOT (Jack Daniels' Running Formula): E, M, T, I, R.
   - Periodisation in phases (Daniels I-IV / Pfitzinger mesocycles): foundation, development,
     race-specific, taper. Taper length depends on the race distance.
   - Volume grows by about 8 % a week, with a lighter week every fourth week.
   - About 80 % of running time stays easy (Seiler, Fitzgerald 80/20); quality is capped.
   - Hills in the foundation phase (Lydiard); long runs with a race-pace finish for the
     half and the marathon (Pfitzinger, Hansons).
   The plan is computed from the profile and the logged runs, so it adapts every time. */

export const GOALS = {
  '5k': { label: '5 km', km: 5, peakKm: 32, longCapKm: 14, taper: 1, weeks: 8 },
  '10k': { label: '10 km', km: 10, peakKm: 40, longCapKm: 18, taper: 1, weeks: 10 },
  semi: { label: 'Semi-marathon', km: 21.0975, peakKm: 50, longCapKm: 22, taper: 2, weeks: 12 },
  marathon: { label: 'Marathon', km: 42.195, peakKm: 65, longCapKm: 32, taper: 3, weeks: 16 },
  forme: { label: 'Forme', km: 5, peakKm: 25, longCapKm: 12, taper: 0, weeks: 12 },
};

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const SLOT = { easy: 'Facile', quality: 'Qualité', long: 'Longue' };

// Sensible default weeks (Monday = 0): hard days never back to back, long run on Sunday.
export const DEFAULT_SCHEDULE = {
  2: [null, null, 'quality', null, null, null, 'long'],
  3: [null, 'quality', null, 'easy', null, null, 'long'],
  4: ['easy', null, 'quality', null, 'easy', null, 'long'],
  5: [null, 'quality', 'easy', 'quality', null, 'easy', 'long'],
  6: ['easy', 'quality', 'easy', 'quality', null, 'easy', 'long'],
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
export const fmtMin = (m) => (m < 1 ? `${Math.round(m * 60)} s` : m % 1 ? `${Math.floor(m)} min ${Math.round((m % 1) * 60)} s` : `${m} min`);

/* ---------- Daniels & Gilbert ---------- */
const vo2Of = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v in m/min
const pctMax = (tMin) => 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
export const vdotOf = (km, sec) => vo2Of((km * 1000) / (sec / 60)) / pctMax(sec / 60);
const speedFor = (vo2) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (vo2 + 4.6))) / (2 * 0.000104);
const paceAt = (vdot, frac) => 60000 / speedFor(vdot * frac); // sec per km

export function raceTime(vdot, km) {
  let lo = km * 100, hi = km * 1500;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotOf(km, mid) > vdot) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
export const predict = (timeS, fromKm, toKm) => raceTime(vdotOf(fromKm, timeS), toKm);
// Pace of an all-out race lasting `minutes`: Daniels' T ≈ 60 min, I ≈ 11 min, R ≈ 5 min.
function paceForDuration(vdot, minutes) {
  let lo = 0.3, hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (raceTime(vdot, mid) < minutes * 60) lo = mid; else hi = mid;
  }
  return (minutes * 60) / ((lo + hi) / 2);
}

export const vdotOfProfile = (p) => vdotOf(Number(p.ref_distance_km || 5), Number(p.ref_time_s));

// Training paces in sec/km. E is a range; the others are targets.
export function pacesOf(profile, scale = 1) {
  const v = vdotOfProfile(profile);
  const goal = GOALS[profile.goal] || GOALS['10k'];
  const s = (x) => x * scale;
  return {
    vdot: v,
    easyFast: s(paceAt(v, 0.74)),
    easy: s(paceAt(v, 0.68)),
    easySlow: s(paceAt(v, 0.62)),
    recovery: s(paceAt(v, 0.6)),
    marathon: s(raceTime(v, 42.195) / 42.195),
    half: s(raceTime(v, 21.0975) / 21.0975),
    threshold: s(paceForDuration(v, 60)),
    interval: s(paceForDuration(v, 11)),
    rep: s(paceForDuration(v, 5)),
    race: s(raceTime(v, goal.km) / goal.km),
  };
}

/* ---------- Blocks ---------- */
export const TYPE_LABEL = {
  warm: 'Échauffement', cool: 'Retour au calme', easy: 'Facile', recovery: 'Très facile', steady: 'Endurance',
  race: 'Allure objectif', tempo: 'Seuil', fast: 'VMA', rep: 'Vitesse', hill: 'Côte', stride: 'Ligne droite', rest: 'Récupération',
};
const INTENSITY = { warm: 0.3, cool: 0.3, rest: 0.22, recovery: 0.32, easy: 0.4, steady: 0.48, race: 0.64, tempo: 0.74, fast: 0.9, rep: 0.97, hill: 0.92, stride: 0.95 };
export const intensityOf = (type) => INTENSITY[type] ?? 0.4;
// What it should feel like (talk test, Daniels' descriptions).
export const FEEL = {
  easy: 'Aisé : tu peux parler en phrases complètes.',
  recovery: 'Très facile, plus lent que d\'habitude. Aucune ambition de vitesse.',
  steady: 'Aisé et régulier. Tu dois finir en te disant que tu aurais pu continuer.',
  race: 'Contrôlé, l\'allure exacte de ta course objectif.',
  tempo: 'Confortablement dur : quelques mots seulement. Tenable environ une heure en course.',
  fast: 'Dur : 3 à 5 minutes à ce rythme, pas beaucoup plus.',
  rep: 'Rapide mais relâché. Soigne la foulée, récupère complètement.',
  hill: 'Fort en montée, buste droit, petits pas rapides. Redescends en trottinant.',
};

const B = (type, mins, pace) => ({ type, mins, pace });
const R = (reps, work, rest) => ({ type: 'rep', reps, work, rest });
const r5 = (n) => Math.max(5, Math.round(n / 5) * 5);
const totalMins = (blocks) => blocks.reduce((a, b) => a + (b.type === 'rep' ? b.reps * (b.work.mins + b.rest.mins) : b.mins), 0);
const kmOf = (blocks) => blocks.reduce((a, b) => (b.type === 'rep'
  ? a + b.reps * ((b.work.mins * 60) / b.work.pace + (b.rest.mins * 60) / b.rest.pace)
  : a + (b.mins * 60) / b.pace), 0);

/* ---------- Session library ---------- */
// Each returns { family, title, why, blocks }. p = paces.
const LIB = {
  hills: (p, n) => ({ family: 'hills', title: 'Côtes', why: 'Renforce les jambes et la foulée sans le choc de la vitesse sur le plat (méthode Lydiard). Prépare au travail rapide des semaines suivantes.',
    blocks: [B('warm', 15, p.easy), R(n, B('hill', 1, p.interval), B('rest', 2, p.recovery)), B('cool', 10, p.easy)] }),
  fartlek: (p, n) => ({ family: 'fartlek', title: 'Fartlek', why: 'Des changements de rythme libres, pour réveiller la vitesse en douceur.',
    blocks: [B('warm', 12, p.easy), R(n, B('fast', 1, p.interval), B('rest', 1.5, p.easy)), B('cool', 10, p.easy)] }),
  reps: (p, n) => ({ family: 'reps', title: 'Vitesse (allure R)', why: 'Améliore la vitesse et l\'économie de course : tu dépenses moins d\'énergie à la même allure (Daniels, allure R).',
    blocks: [B('warm', 15, p.easy), R(n, B('rep', 1, p.rep), B('rest', 2, p.recovery)), B('cool', 10, p.easy)] }),
  cruise: (p, n, m) => ({ family: 'threshold', title: 'Seuil fractionné', why: 'Repousse ton seuil lactique : tu tiendras une allure plus rapide plus longtemps (Daniels, allure T en « cruise intervals »).',
    blocks: [B('warm', 15, p.easy), R(n, B('tempo', m, p.threshold), B('rest', 1, p.easy)), B('cool', 10, p.easy)] }),
  tempo: (p, m) => ({ family: 'threshold', title: 'Tempo continu', why: 'Un bloc continu à allure seuil : la séance clé pour le 10 km et le semi.',
    blocks: [B('warm', 15, p.easy), B('tempo', m, p.threshold), B('cool', 10, p.easy)] }),
  vo2: (p, n, m) => ({ family: 'vo2', title: 'VMA (allure I)', why: 'Développe ta VO2max, la taille de ton moteur aérobie (Daniels, allure I). Récupération aussi longue que l\'effort.',
    blocks: [B('warm', 15, p.easy), R(n, B('fast', m, p.interval), B('rest', m * 0.8, p.recovery)), B('cool', 10, p.easy)] }),
  racePace: (p, n, m) => ({ family: 'race', title: 'Allure objectif', why: 'Habitue le corps et la tête à l\'allure exacte de ta course.',
    blocks: [B('warm', 15, p.easy), R(n, B('race', m, p.race), B('rest', 2, p.easy)), B('cool', 10, p.easy)] }),
  progression: (p, m) => ({ family: 'progression', title: 'Sortie progressive', why: 'Commence facile, finis au seuil : endurance et contrôle de l\'allure dans la même sortie.',
    blocks: [B('easy', Math.round(m * 0.5), p.easy), B('steady', Math.round(m * 0.3), (p.easy + p.marathon) / 2), B('tempo', Math.round(m * 0.2), p.threshold)] }),
};

// Quality sessions by phase and goal; "slot" alternates families when there are two per week.
function qualityFor(goal, phase, q, slot, p, lighter) {
  const pick = (list) => list[(q + slot) % list.length];
  if (phase === 'base') return pick([LIB.hills(p, lighter ? 5 : 6), LIB.fartlek(p, 6), LIB.hills(p, lighter ? 6 : 8)]);
  if (phase === 'taper') return pick([LIB.racePace(p, 3, goal === 'marathon' ? 8 : 4), LIB.cruise(p, 2, 6)]);
  if (phase === 'dev') {
    return slot === 1 ? pick([LIB.cruise(p, 3, 6), LIB.tempo(p, 15)]) : pick([LIB.reps(p, lighter ? 6 : 8), LIB.cruise(p, 3, 6), LIB.reps(p, 10), LIB.cruise(p, 4, 6)]);
  }
  // Race-specific phase.
  const spec = {
    '5k': [LIB.vo2(p, 5, 3), LIB.cruise(p, 3, 7), LIB.vo2(p, 6, 3), LIB.reps(p, 10), LIB.racePace(p, 5, 3)],
    '10k': [LIB.vo2(p, 5, 4), LIB.cruise(p, 4, 7), LIB.racePace(p, 4, 6), LIB.tempo(p, 20), LIB.vo2(p, 6, 3)],
    semi: [LIB.cruise(p, 3, 10), LIB.vo2(p, 5, 4), LIB.tempo(p, 25), LIB.racePace(p, 3, 12), LIB.cruise(p, 4, 8)],
    marathon: [LIB.cruise(p, 3, 12), LIB.racePace(p, 3, 15), LIB.tempo(p, 25), LIB.vo2(p, 5, 4), LIB.racePace(p, 2, 25)],
    forme: [LIB.fartlek(p, 8), LIB.cruise(p, 3, 6), LIB.progression(p, 40), LIB.hills(p, 8)],
  }[goal] || [];
  const list = slot === 1 ? spec.filter((s) => s.family === 'threshold' || s.family === 'race').concat(spec) : spec;
  const s = pick(list);
  return lighter ? { ...s, blocks: s.blocks.map((b) => (b.type === 'rep' ? { ...b, reps: Math.max(2, b.reps - 1) } : b)) } : s;
}

/* ---------- Plan ---------- */
const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function scheduleOf(profile) {
  const s = Array.isArray(profile.schedule) && profile.schedule.length === 7 ? profile.schedule : DEFAULT_SCHEDULE[Math.min(6, Math.max(2, profile.days_per_week || 3))];
  return s.map((x) => (x === 'easy' || x === 'quality' || x === 'long' ? x : null));
}

// Warnings a coach would give about a week layout.
export function scheduleIssues(schedule) {
  const out = [];
  const n = schedule.filter(Boolean).length;
  const hard = (x) => x === 'quality' || x === 'long';
  if (n < 2) out.push('Choisis au moins deux jours.');
  if (schedule.filter((x) => x === 'long').length > 1) out.push('Une seule sortie longue par semaine suffit.');
  if (schedule.filter((x) => x === 'quality').length > 2) out.push('Deux séances de qualité par semaine au maximum : au-delà, le risque de blessure grimpe sans gain.');
  for (let i = 0; i < 7; i++) {
    if (hard(schedule[i]) && hard(schedule[(i + 1) % 7]) && schedule.filter(Boolean).length > 2) {
      out.push(`${DAYS[i]} et ${DAYS[(i + 1) % 7].toLowerCase()} sont deux jours durs d'affilée. Laisse si possible un jour facile ou de repos entre les deux.`);
      break;
    }
  }
  return out;
}

export function totalWeeks(profile) {
  const goal = GOALS[profile.goal] || GOALS['10k'];
  if (profile.target_date) {
    const w = Math.floor((mondayOf(new Date(profile.target_date)) - mondayOf(new Date(profile.started_on))) / (7 * 86400000)) + 1;
    return Math.min(24, Math.max(3, w));
  }
  return goal.weeks;
}

function phaseOf(goal, w, total) {
  const g = GOALS[goal] || GOALS['10k'];
  const taper = goal === 'forme' ? 0 : Math.min(g.taper, Math.max(0, total - 3));
  if (w >= total - taper) return 'taper';
  const n = total - taper;
  if (w < Math.ceil(n * 0.3)) return 'base';
  if (w < Math.ceil(n * 0.6)) return 'dev';
  return 'spec';
}
export const PHASES = {
  base: { label: 'Fondation', tip: 'Construire l\'endurance : surtout du facile, des côtes et des lignes droites pour la foulée.' },
  dev: { label: 'Développement', tip: 'On ajoute le seuil et la vitesse. Le facile reste facile, c\'est lui qui te fait progresser.' },
  spec: { label: 'Spécifique', tip: 'Les séances ressemblent à ta course : VMA, seuil et allure objectif.' },
  taper: { label: 'Affûtage', tip: 'Le volume baisse, l\'intensité reste : tu arrives frais le jour J. Ne rattrape pas les séances manquées.' },
};

function weekVolume(profile, w, total, phase) {
  const g = GOALS[profile.goal] || GOALS['10k'];
  const days = scheduleOf(profile).filter(Boolean).length;
  const start = Math.max(Number(profile.weekly_km) || days * 5, days * 4);
  const peak = Math.max(start, Math.min(g.peakKm * (0.55 + days * 0.11), start * 1.6, start + 25));
  let v = Math.min(peak, start * Math.pow(1.08, w - Math.floor(w / 4)));
  if (phase !== 'taper' && (w + 1) % 4 === 0) v *= 0.8; // lighter week every fourth week
  if (phase === 'taper') {
    const left = total - w; // 1 = race week
    v = peak * (left === 1 ? 0.5 : left === 2 ? 0.65 : 0.8);
  }
  return { km: v, light: phase !== 'taper' && (w + 1) % 4 === 0 };
}

function buildWeek(profile, w, total, adj, qualityCount, opts = {}) {
  const goal = profile.goal in GOALS ? profile.goal : '10k';
  const g = GOALS[goal];
  const p = pacesOf(profile, adj.paceScale * (opts.paceMul ?? 1));
  const phase = phaseOf(goal, w, total);
  const { km: vol0, light } = weekVolume(profile, w, total, phase);
  const vol = vol0 * adj.volScale * (opts.volMul ?? 1);
  const schedule = scheduleOf(profile);
  const monday = addDays(mondayOf(new Date(profile.started_on)), w * 7);
  const raceWeek = !!profile.target_date && w === total - 1 && goal !== 'forme';
  const raceDay = raceWeek ? (new Date(profile.target_date).getDay() + 6) % 7 : -1;

  // 1. Quality sessions.
  const out = [];
  let slot = 0;
  for (let d = 0; d < 7; d++) {
    if (schedule[d] !== 'quality' || d === raceDay) continue;
    if (opts.noQuality) {
      // Back from a break: the quality day stays a quality day, in a light form (Daniels: strides first, then short pick-ups).
      const light = opts.reentryWeek < Math.ceil(opts.easyWeeks / 2)
        ? { family: 'reentry', title: 'Qualité en reprise : lignes droites', blocks: [B('easy', 25, p.easy), R(6, B('stride', 1 / 3, p.rep), B('rest', 1, p.recovery)), B('cool', 5, p.easy)] }
        : { family: 'reentry', title: 'Qualité en reprise : fartlek doux', blocks: [B('warm', 15, p.easy), R(6, B('fast', 0.5, p.interval), B('rest', 1.5, p.easy)), B('cool', 10, p.easy)] };
      out.push({ d, kind: 'quality', ...light, why: `Ton jour de qualité, en version allégée : tu reprends après une pause, et les tendons se réadaptent moins vite que le souffle. Les vraies séances (fractionné, seuil) reviennent ${opts.backOn}.` });
      continue;
    }
    if (raceWeek && d > raceDay) continue;
    if (raceWeek && raceDay - d < 2) { out.push({ d, kind: 'easy' }); continue; } // no hard work 2 days before the race
    const s = qualityFor(goal, phase, qualityCount.n++, slot++, p, light);
    out.push({ d, kind: 'quality', ...s });
  }
  // 2. Long run (or the race itself in race week).
  for (let d = 0; d < 7; d++) {
    if (raceWeek && d === raceDay) {
      const t = raceTime(vdotOfProfile(profile), g.km) * adj.paceScale;
      out.push({ d, kind: 'race', family: 'race', title: `Jour J : ${g.label}`, why: `Objectif estimé : ${hms(t)}. Pars légèrement plus lent que l'allure visée sur le premier kilomètre, puis cale-toi dessus. Accélère seulement dans le dernier quart.`,
        blocks: [B('warm', goal === 'marathon' || goal === 'semi' ? 10 : 15, p.easy), B('race', Math.round(t / 60), p.race)] });
      continue;
    }
    if (schedule[d] !== 'long' || (raceWeek && d > raceDay)) continue;
    const longKm = Math.min(g.longCapKm, Math.max(5, vol * (schedule.filter(Boolean).length <= 3 ? 0.36 : 0.3)), 150 * 60 / p.easy);
    const mins = r5((longKm * p.easy * 1.03) / 60);
    const finish = (goal === 'semi' || goal === 'marathon') && phase === 'spec' && w % 2 === 1;
    const prog = goal === '10k' && phase === 'spec' && w % 2 === 1;
    if (finish) {
      const fast = r5(mins * 0.25);
      out.push({ d, kind: 'long', family: 'long', title: 'Sortie longue, fin à allure objectif', why: 'Apprendre à tenir l\'allure de course sur des jambes fatiguées (Pfitzinger, Hansons). La première partie reste vraiment facile.',
        blocks: [B('steady', mins - fast, p.easy * 1.03), B('race', fast, p.race)] });
    } else if (prog) {
      out.push({ d, kind: 'long', family: 'long', ...LIB.progression(p, mins), title: 'Sortie longue progressive' });
    } else {
      out.push({ d, kind: 'long', family: 'long', title: 'Sortie longue', why: 'Construit l\'endurance, les réserves d\'énergie et la résistance des tendons. Elle doit rester facile du début à la fin.',
        blocks: [B('steady', mins, p.easy * 1.03)] });
    }
  }
  // 3. Easy days share what is left of the weekly volume (80/20).
  const used = out.reduce((a, s) => a + (s.blocks ? kmOf(s.blocks) : 0), 0);
  const easyDays = [];
  for (let d = 0; d < 7; d++) {
    if ((schedule[d] === 'easy' || out.some((x) => x.d === d && x.kind === 'easy' && !x.blocks)) && !(raceWeek && d >= raceDay)) easyDays.push(d);
  }
  const share = easyDays.length ? Math.max(0, vol - used) / easyDays.length : 0;
  let stridesGiven = false;
  for (const d of easyDays) {
    const prevHard = out.some((x) => (x.d === (d + 6) % 7) && (x.kind === 'quality' || x.kind === 'long'));
    const recovery = prevHard && easyDays.length >= 2;
    const pace = recovery ? p.recovery : p.easy;
    // An easy run stays under an hour (Daniels); beyond that it would be a long run the athlete did not ask for.
    const mins = Math.min(r5(((recovery ? share * 0.75 : share) * pace) / 60), 60);
    const m = Math.max(20, mins);
    const strides0 = !recovery && !stridesGiven && phase !== 'taper' && (phase === 'base' || phase === 'dev' || raceWeek);
    const mEasy = strides0 ? Math.min(m, 50) : m;
    const strides = !recovery && !stridesGiven && phase !== 'taper' && (phase === 'base' || phase === 'dev' || raceWeek);
    if (strides) stridesGiven = true;
    const blocks = strides ? [B('easy', mEasy, pace), R(6, B('stride', 1 / 3, p.rep), B('rest', 1, p.recovery))] : [B(recovery ? 'recovery' : 'easy', m, pace)];
    const idx = out.findIndex((x) => x.d === d);
    const s = recovery
      ? { family: 'recovery', title: 'Footing de récupération', why: 'Fait circuler le sang après la séance dure de la veille, sans ajouter de fatigue. Ralentis franchement.', blocks }
      : strides
        ? { family: 'easy', title: 'Footing + lignes droites', why: 'L\'essentiel de ta progression vient du facile (80/20). Les 6 lignes droites de 20 s entretiennent la vitesse et la foulée sans fatigue.', blocks }
        : { family: 'easy', title: 'Footing facile', why: 'L\'essentiel de ta progression vient du facile : 80 % de ton temps de course devrait être à cette allure.', blocks };
    if (idx >= 0) out[idx] = { d, kind: recovery ? 'recovery' : 'easy', ...s };
    else out.push({ d, kind: recovery ? 'recovery' : 'easy', ...s });
  }

  // The first week starts on the day the plan was created: earlier days are not part of it.
  const startYmd = String(profile.started_on).slice(0, 10);
  return out.sort((a, b) => a.d - b.d).filter((s) => ymd(addDays(monday, s.d)) >= startYmd).map((s) => {
    const date = addDays(monday, s.d);
    return {
      ...s, key: `${w}-${s.d}`, week: w, date, ymd: ymd(date), phase, light,
      mins: Math.round(totalMins(s.blocks)), km: Math.round(kmOf(s.blocks) * 10) / 10,
      recover: light, taper: phase === 'taper',
    };
  });
}

// Compares what was run with what was planned, and nudges the next sessions.
export function adaptation(logs, planFor, missedRecent) {
  const recent = logs.filter((l) => l.session_key).slice(-4);
  const ratios = [];
  for (const l of recent) {
    const s = planFor(l.session_key);
    if (!s || !l.distance_km || !l.duration_s || !s.km) continue;
    ratios.push(l.duration_s / Number(l.distance_km) / ((s.mins * 60) / s.km));
  }
  const feels = recent.map((l) => l.feel).filter(Boolean);
  const r = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
  const feel = feels.length ? feels.reduce((a, b) => a + b, 0) / feels.length : 3;
  const res = { paceScale: 1, volScale: 1, level: recent.length ? 'ok' : 'none', message: recent.length ? 'Tu suis le plan comme prévu. On continue.' : null };
  if (r > 1.04 || feel >= 4.3) {
    Object.assign(res, { paceScale: 1.03, volScale: 0.9, level: 'easier', message: feel >= 4.3 ? 'Tes dernières sorties étaient dures. Je ralentis les allures de 3 % et je réduis le volume de 10 % : mieux vaut un cran en dessous que la blessure.' : 'Tu cours plus lentement que prévu. Je ralentis un peu les allures et je réduis le volume de 10 %.' });
  } else if (r < 0.97 && feel <= 2.5 && recent.length >= 3) {
    Object.assign(res, { paceScale: 0.98, volScale: 1.05, level: 'harder', message: 'Tes sorties passent facilement. J\'accélère les allures de 2 % et j\'ajoute 5 % de volume.' });
  } else if (r < 0.95 && recent.length >= 2) {
    res.message = 'Tu cours plus vite que prévu sur tes footings. Ralentis : le facile doit rester facile pour que les séances dures portent.';
  }
  if (missedRecent >= 2) {
    res.volScale = Math.min(res.volScale, 0.9);
    res.message = `Tu as manqué ${missedRecent} séances ces deux dernières semaines. Je réduis le volume de 10 % pour reprendre en douceur. Ne cherche pas à les rattraper.`;
    res.level = 'easier';
  }
  return res;
}

export function buildPlan(profile, logs, workouts = [], now = new Date()) {
  const total = totalWeeks(profile);
  const done = new Map(logs.filter((l) => l.session_key).map((l) => [l.session_key, l]));
  const todayStr = ymd(now);
  // Back from a break (Daniels): the weeks from the return on follow the return protocol.
  const fit = fitnessFromHistory(logs, workouts, now);
  const reentry = profile.reentry === false ? null : (fit.protocol || null);
  const startMonday = mondayOf(new Date(profile.started_on));
  // If the level was entered before the break, paces are slowed for the lost fitness; if after, it is already current.
  const levelBeforeBreak = !!(reentry && fit.break && new Date(profile.updated_at || profile.started_on) < fit.break.from);
  // The return protocol starts at the return (or now), but never before the plan itself starts.
  const anchor = reentry && reentry.start > startMonday ? reentry.start : startMonday;
  const returnWeek = reentry ? Math.floor((mondayOf(anchor) - startMonday) / (7 * 86400000)) : 0;
  const back = reentry ? addDays(startMonday, (returnWeek + reentry.easyWeeks) * 7) : null;
  const backOnLabel = back ? `la semaine du ${back.getDate()} ${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][back.getMonth()]}` : '';
  const flat = (adj) => {
    const qc = { n: 0 };
    const weeks = [];
    for (let w = 0; w < total; w++) {
      const k = w - returnWeek;
      const opts = reentry && k >= 0 && k < reentry.weeks.length
        ? { volMul: reentry.weeks[k], noQuality: k < reentry.easyWeeks, paceMul: levelBeforeBreak ? reentry.paceMul : 1, reentryWeek: k, easyWeeks: reentry.easyWeeks, backOn: backOnLabel } : {};
      weeks.push(buildWeek(profile, w, total, adj, qc, opts));
    }
    return weeks;
  };
  const base = flat({ paceScale: 1, volScale: 1 });
  const missedRecent = base.flat().filter((s) => !done.has(s.key) && s.ymd < todayStr && (now - s.date) < 14 * 86400000).length;
  const adj = adaptation(logs, (k) => base.flat().find((s) => s.key === k), missedRecent);
  const weeks = flat(adj).map((wk) => wk.map((s) => ({
    ...s,
    done: done.has(s.key),
    log: done.get(s.key) || null,
    missed: !done.has(s.key) && s.ymd < todayStr,
    today: s.ymd === todayStr,
  })));
  const all = weeks.flat();
  const next = all.find((s) => !s.done && s.ymd >= todayStr) || null;
  let current = next ? next.week : total - 1;
  if (all.length && now < all[0].date) current = 0;

  let note = null;
  if (next && (next.kind === 'quality' || next.kind === 'long') && next.ymd <= ymd(new Date(now.getTime() + 86400000))) {
    const recentLegs = workouts.some((w) => now - w.start < 30 * 3600000 && w.sets.filter((s) => muscleOf(s.exercise) === 'Jambes').length >= 6);
    if (recentLegs) note = 'Tu as travaillé les jambes à la salle dans les dernières 24 h. Si elles sont lourdes, remplace la séance par un footing facile de même durée et décale la qualité de deux jours.';
  }
  const phases = [];
  for (const wk of weeks) {
    const ph = wk[0]?.phase;
    if (!ph) continue;
    if (!phases.length || phases[phases.length - 1].key !== ph) phases.push({ key: ph, weeks: 0 });
    phases[phases.length - 1].weeks += 1;
  }
  // 80/20 measured on time actually spent at each intensity (warm-ups and recoveries count as easy).
  let easyMin = 0, totalMin = 0;
  for (const s of all) for (const g of segments(s)) { totalMin += g.mins; if (relaxed(g.type)) easyMin += g.mins; }
  return { total, weeks, current, next, adj, note, reentry: reentry && { ...reentry, gap: fit.breakDays, backOn: backOnLabel }, fit, finished: !next, phases, easyShare: totalMin ? easyMin / totalMin : 0, phase: weeks[current]?.[0]?.phase || 'base' };
}

// "5:10 – 5:30"
export const paceRange = (pace, below = 5, above = 10) => `${mmss(pace - below)} – ${mmss(pace + above)}`;

const relaxed = (t) => t === 'easy' || t === 'recovery' || t === 'steady' || t === 'warm' || t === 'cool' || t === 'rest';

// Instructions to type in Apple's Exercice app (Watch › Course › ⋯ › Séance personnalisée).
export function appleSteps(session) {
  if (session.blocks.length === 1) {
    const b = session.blocks[0];
    return {
      where: 'Exercice › Course (extérieur) › bouton ⋯ › Durée',
      steps: [
        { title: `Objectif : ${b.mins} min`, detail: `Choisis « Durée » et règle ${b.mins} minutes.` },
        { title: `Allure : ${paceRange(b.pace)} /km`, detail: relaxed(b.type) ? 'Si tu veux, ajoute une alerte d\'allure. Si tu ne peux plus parler, ralentis.' : 'Ajoute une alerte d\'allure sur cette plage.' },
      ],
    };
  }
  const steps = [];
  for (const b of session.blocks) {
    if (b.type === 'warm') steps.push({ title: `Échauffement : ${fmtMin(b.mins)}`, detail: 'Objectif « Durée ». Allure facile.' });
    else if (b.type === 'cool') steps.push({ title: `Retour au calme : ${fmtMin(b.mins)}`, detail: 'Objectif « Durée ». Allure facile.' });
    else if (b.type === 'rep') {
      steps.push({ title: `Intervalles : ${b.reps} répétitions`, detail: 'Ajoute un bloc « Intervalles » avec les deux étapes suivantes.' });
      steps.push({ title: `Travail : ${fmtMin(b.work.mins)}`, detail: b.work.type === 'hill' ? 'En côte, à l\'effort (l\'allure ne compte pas en montée).' : b.work.type === 'stride' ? 'Accélération progressive jusqu\'à rapide, relâché.' : `Alerte d'allure ${paceRange(b.work.pace, 5, 5)} /km (${TYPE_LABEL[b.work.type].toLowerCase()}).` });
      steps.push({ title: `Récupération : ${fmtMin(b.rest.mins)}`, detail: b.work.type === 'hill' ? 'Redescends en trottinant.' : 'Trotte très doucement ou marche.' });
    } else {
      steps.push({ title: `Travail : ${fmtMin(b.mins)}, ${TYPE_LABEL[b.type].toLowerCase()}`, detail: `Objectif « Durée ». Alerte d'allure ${relaxed(b.type) ? paceRange(b.pace) : paceRange(b.pace, 5, 5)} /km.` });
    }
  }
  return { where: 'Exercice › Course (extérieur) › ⋯ › Séance personnalisée', steps };
}

export function segments(session) {
  const out = [];
  for (const b of session.blocks) {
    if (b.type === 'rep') for (let i = 0; i < b.reps; i++) { out.push({ ...b.work }); out.push({ ...b.rest }); }
    else out.push(b);
  }
  return out;
}

export function structureText(session) {
  return session.blocks.map((b) => {
    if (b.type === 'rep') return `${b.reps} × (${fmtMin(b.work.mins)} ${TYPE_LABEL[b.work.type].toLowerCase()} + ${fmtMin(b.rest.mins)} récup)`;
    return `${fmtMin(b.mins)} ${TYPE_LABEL[b.type].toLowerCase()}`;
  }).join(', puis ');
}

// The main effort of a session, to say what it should feel like.
export function mainType(session) {
  const order = ['rep', 'hill', 'fast', 'tempo', 'race', 'steady', 'easy', 'recovery'];
  const types = session.blocks.flatMap((b) => (b.type === 'rep' ? [b.work.type] : [b.type]));
  return order.find((t) => types.includes(t)) || 'easy';
}

export function goalPrediction(profile) {
  const g = GOALS[profile.goal] || GOALS['10k'];
  return raceTime(vdotOfProfile(profile), g.km);
}

// A logged run of 3 km or more that implies a better level than the stored one.
export function betterLevel(profile, logs) {
  const v0 = vdotOfProfile(profile);
  let best = null;
  for (const l of logs) {
    const km = Number(l.distance_km);
    if (!km || km < 3 || !l.duration_s) continue;
    if (new Date(l.done_at) < new Date(profile.updated_at || 0)) continue;
    const v = vdotOf(km, l.duration_s);
    if (v > v0 * 1.015 && (!best || v > best.vdot)) best = { vdot: v, log: l, eq5: raceTime(v, 5), ref5: raceTime(v0, 5) };
  }
  return best;
}

export function runStats(logs, weeksBack = 8, now = new Date()) {
  const valid = logs.filter((l) => Number(l.distance_km) > 0 && l.duration_s > 0);
  const totalKm = valid.reduce((a, l) => a + Number(l.distance_km), 0);
  const totalS = valid.reduce((a, l) => a + l.duration_s, 0);
  const thisMonday = mondayOf(now);
  const weeks = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const from = addDays(thisMonday, -i * 7);
    const to = addDays(from, 7);
    const km = valid.filter((l) => { const d = new Date(l.done_at); return d >= from && d < to; }).reduce((a, l) => a + Number(l.distance_km), 0);
    weeks.push({ from, km });
  }
  const longest = valid.reduce((a, l) => Math.max(a, Number(l.distance_km)), 0);
  return { count: valid.length, totalKm, avgPace: totalKm ? totalS / totalKm : null, weeks, longest, weekKm: weeks[weeks.length - 1].km };
}

/* ---------- Real history: level, volume, breaks ---------- */
const DAY = 86400000;
const plausible = (l) => {
  const km = Number(l.distance_km), t = Number(l.duration_s);
  if (!(km >= 3 && t >= 600)) return false;
  const pace = t / km;
  return pace > 150 && pace < 720;
};

// Fitness lost after a break without running (Daniels' return-to-running tables; Coyle et al. 1984):
// almost nothing up to 5 days, ~7 % at 4 weeks, ~13 % at 8 weeks, up to ~20 % after 3 months.
// Cross-training (here: gym sessions during the break) softens the loss by a quarter.
export function detraining(gapDays, crossTraining = false) {
  let loss;
  if (gapDays <= 5) loss = 0;
  else if (gapDays <= 28) loss = (gapDays - 5) * (0.07 / 23);
  else if (gapDays <= 56) loss = 0.07 + (gapDays - 28) * (0.06 / 28);
  else if (gapDays <= 90) loss = 0.13 + (gapDays - 56) * (0.05 / 34);
  else loss = 0.2;
  return 1 - loss * (crossTraining ? 0.75 : 1);
}

// Return protocol (Daniels): volume as a share of the usual load, week by week, and how many
// of those weeks stay easy only.
export function returnProtocol(gapDays, crossTraining = false) {
  const factor = detraining(gapDays, crossTraining);
  const paceMul = 1 / Math.pow(factor, 0.9);
  if (gapDays <= 14) return { weeks: [0.75], easyWeeks: 0, factor, paceMul, label: 'courte pause' };
  if (gapDays <= 28) return { weeks: [0.5, 0.75], easyWeeks: 1, factor, paceMul, label: 'pause de 2 à 4 semaines' };
  if (gapDays <= 56) return { weeks: [0.33, 0.5, 0.5, 0.75], easyWeeks: 2, factor, paceMul, label: 'pause de 4 à 8 semaines' };
  return { weeks: [0.33, 0.4, 0.5, 0.6, 0.75], easyWeeks: 4, factor, paceMul, label: 'longue pause' };
}

// Breaks: gaps of 8 days or more. A lone run between two gaps does not end a break
// (one outing in a month is not training again). Returns the latest break, ongoing or recent.
function latestBreak(dates, now) {
  if (!dates.length) return null;
  const gaps = [];
  for (let i = 1; i < dates.length; i++) gaps.push({ from: dates[i - 1], to: dates[i] });
  gaps.push({ from: dates[dates.length - 1], to: now, ongoing: true });
  let j = gaps.length - 1;
  while (j >= 0 && (gaps[j].to - gaps[j].from) / DAY < 8) j -= 1; // most recent real gap
  if (j < 0) return null;
  let from = gaps[j].from;
  const to = gaps[j].to;
  // Merge earlier gaps separated by a single isolated run.
  let k = j - 1;
  while (k >= 0 && (gaps[k].to - gaps[k].from) / DAY >= 8) { from = gaps[k].from; k -= 1; }
  const ongoing = !!gaps[j].ongoing;
  return { from, to, days: Math.floor((to - from) / DAY), ongoing, isolated: j - 1 - k };
}

// What the logged runs say: level (best recent effort), usual weekly volume, breaks.
export function fitnessFromHistory(logs, workouts = [], now = new Date()) {
  const runs = logs.filter((l) => Number(l.distance_km) > 0 && l.duration_s > 0).map((l) => ({ ...l, date: new Date(l.done_at) })).sort((a, b) => a.date - b.date);
  if (!runs.length) return { runs: 0 };
  const lastRun = runs[runs.length - 1].date;
  const brk = latestBreak(runs.map((r) => r.date), now);
  // The break counts only if it is still going on, or ended recently enough to still be in the return phase.
  const relevant = brk && (brk.ongoing || (now - brk.to) / DAY < 42) ? brk : null;
  const refEnd = relevant ? relevant.from : lastRun; // fitness is measured before the break
  const crossTraining = relevant ? workouts.filter((w) => w.start > relevant.from && w.start < relevant.to).length >= Math.max(1, Math.floor(relevant.days / 7)) : false;
  // Level: best effort (race or hard run) in the 120 days before the break.
  const window = runs.filter((r) => plausible(r) && r.date <= refEnd && refEnd - r.date <= 120 * DAY);
  const pool = window.length ? window : runs.filter(plausible);
  const scored = pool.map((r) => ({ run: r, vdot: vdotOf(Number(r.distance_km), r.duration_s) * (window.length ? 1 : 0.95) })).sort((a, b) => b.vdot - a.vdot);
  const best = scored[0] || null;
  const breakDays = relevant ? relevant.days : Math.floor((now - lastRun) / DAY);
  const factor = detraining(relevant && !relevant.ongoing ? Math.floor((relevant.to - relevant.from) / DAY) : breakDays, crossTraining);
  // Usual volume: average of the 8 best weeks among the 12 before the break (break weeks are ignored).
  const weeks = [];
  for (let i = 0; i < 12; i++) {
    const end = new Date(refEnd.getTime() + DAY - i * 7 * DAY);
    const start = new Date(end - 7 * DAY);
    weeks.push(runs.filter((r) => r.date > start && r.date <= end).reduce((a, r) => a + Number(r.distance_km), 0));
  }
  const usual = weeks.sort((a, b) => b - a).slice(0, 8).reduce((a, b) => a + b, 0) / 8;
  const kmIn = (from, to) => runs.filter((r) => r.date > from && r.date <= to).reduce((a, r) => a + Number(r.distance_km), 0);
  const longest = runs.reduce((a, r) => (Number(r.distance_km) > Number(a.distance_km) ? r : a), runs[0]);
  return {
    runs: runs.length,
    totalKm: runs.reduce((a, r) => a + Number(r.distance_km), 0),
    lastRun, crossTraining, factor,
    gapDays: Math.floor((now - lastRun) / DAY),
    break: relevant,
    breakDays,
    best: best && { ...best.run, vdot: best.vdot },
    top: scored.slice(0, 3).map((x) => ({ ...x.run, vdot: x.vdot })),
    vdotPeak: best?.vdot ?? null,
    vdotNow: best ? best.vdot * factor : null,
    weeklyUsual: usual,
    weeklyNow: kmIn(new Date(now - 28 * DAY), now) / 4,
    longest,
    // The plan starts from the usual volume; the return protocol scales the first weeks down.
    startKm: Math.max(5, Math.round(usual)),
    protocol: relevant && relevant.days >= 8 ? { ...returnProtocol(relevant.days, crossTraining), start: relevant.ongoing ? now : relevant.to } : null,
  };
}

// Kilometres per month over the last 12 months, oldest first.
export function monthlyKm(logs, now = new Date()) {
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({ date: d, km: logs.filter((l) => { const t = new Date(l.done_at); return t >= d && t < e; }).reduce((a, l) => a + Number(l.distance_km || 0), 0) });
  }
  return out;
}
