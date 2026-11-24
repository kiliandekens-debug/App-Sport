// Tapis et marche inclinée.
// - Calories : équations métaboliques de l'ACSM (marche et course, avec la pente).
// - Dénivelé : distance × pente.
// - Séances guidées : paliers de vitesse et de pente, les mêmes sur le téléphone et la montre.
// - Progression : +1 % de pente (ou +5 min) à chaque séance du même modèle jugée facile (session_key 'tpl:<id>').

export const ACTIVITIES = {
  run: 'Course dehors',
  treadmill: 'Course sur tapis',
  incline_walk: 'Marche inclinée',
  walk: 'Marche dehors',
};
export const WALKS = new Set(['incline_walk', 'walk']);
export const isWalk = (l) => WALKS.has(l?.activity);
export const INDOOR = new Set(['treadmill', 'incline_walk']);
// Name of a log in lists: its note, else its kind of activity.
export const logTitle = (l) => l?.notes || ACTIVITIES[l?.activity] || 'Course';

const num1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
export const fmtSpeed = (kmh) => `${num1(kmh)} km/h`;
export const fmtIncline = (pct) => `${num1(pct)} %`;

// VO2 (ml/kg/min) at a speed (km/h) and grade (%), ACSM. Walking below 8 km/h, running above.
export function vo2(speedKmh, inclinePct, walking = speedKmh < 8) {
  const s = (speedKmh * 1000) / 60; // m/min
  const g = Math.max(0, inclinePct) / 100;
  return walking ? 0.1 * s + 1.8 * s * g + 3.5 : 0.2 * s + 0.9 * s * g + 3.5;
}

// Calories of a list of segments [{ secs, speed, incline }] for a body weight (kg).
// About 5 kcal per litre of oxygen; resting share removed (active calories, like Apple Health).
export function caloriesOf(segments, weightKg = 75) {
  return Math.round(segments.reduce((a, x) => a + ((vo2(x.speed, x.incline) - 3.5) * weightKg / 1000) * 5 * (x.secs / 60), 0));
}
export const distanceOf = (segments) => segments.reduce((a, x) => a + (x.speed / 3.6) * x.secs, 0); // m
export const elevationOf = (segments) => segments.reduce((a, x) => a + (x.speed / 3.6) * x.secs * Math.max(0, x.incline) / 100, 0); // m

// Summary of a session from its segments, ready for run_logs.
export function summaryOf(segments, weightKg) {
  const secs = segments.reduce((a, x) => a + x.secs, 0);
  const m = distanceOf(segments);
  return {
    duration_s: Math.round(secs),
    distance_km: Math.round(m / 10) / 100,
    speed_kmh: secs ? Math.round(((m / secs) * 3.6) * 10) / 10 : 0,
    incline_pct: secs ? Math.round((segments.reduce((a, x) => a + x.incline * x.secs, 0) / secs) * 10) / 10 : 0,
    elevation_m: Math.round(elevationOf(segments)),
    calories: caloriesOf(segments, weightKg),
  };
}

// Guided sessions. Each step: minutes, speed (km/h), incline (%), and what it is.
const S = (mins, speed, incline, title, phase = 'work') => ({ mins, speed, incline, title, phase });
export const TEMPLATES = [
  {
    id: '12-3-30', title: '12-3-30', activity: 'incline_walk',
    about: 'La séance culte : 30 min de marche à 12 % de pente et 4,8 km/h. Beaucoup de dénivelé, peu de choc pour les articulations.',
    build: (lvl) => [S(30, 4.8, Math.min(15, 12 + lvl), 'Marche en montée')],
  },
  {
    id: 'progressive', title: 'Montée progressive', activity: 'incline_walk',
    about: 'La pente monte toutes les 5 minutes, puis redescend. Idéal pour commencer.',
    build: (lvl) => [
      S(5, 4.5, 3, 'Échauffement', 'easy'), S(5, 5, 6 + lvl, 'Palier 1'), S(5, 5, 8 + lvl, 'Palier 2'),
      S(5, 5, 10 + lvl, 'Palier 3'), S(5, 5, 12 + lvl, 'Palier 4'), S(5, 4.5, 2, 'Retour au calme', 'easy'),
    ],
  },
  {
    id: 'paliers', title: 'Paliers', activity: 'incline_walk',
    about: 'Alterne 4 min de forte pente et 2 min plus douce, 5 fois. Le cœur monte et redescend : bon pour le cardio.',
    build: (lvl) => [
      S(5, 4.5, 3, 'Échauffement', 'easy'),
      ...Array.from({ length: 5 }, () => [S(4, 5, 10 + lvl, 'Forte pente'), S(2, 5, 5, 'Pente douce', 'recovery')]).flat(),
      S(5, 4.5, 2, 'Retour au calme', 'easy'),
    ],
  },
  {
    id: 'endurance', title: 'Endurance en côte', activity: 'incline_walk',
    about: '40 min à pente moyenne, à un rythme où tu peux parler. Brûle des graisses et construit le fond.',
    build: (lvl) => [S(5, 4.5, 4, 'Échauffement', 'easy'), S(30 + lvl * 5, 5, 8, 'Marche régulière'), S(5, 4.5, 2, 'Retour au calme', 'easy')],
  },
];

// Level of a template (0, 1, 2…): +1 each time a session of it felt easy (1-3 on 5),
// −1 when it felt very hard (5). Kept between 0 and 3.
export function levelOf(id, walkLogs) {
  const done = walkLogs.filter((l) => l.session_key === `tpl:${id}`).sort((a, b) => new Date(a.done_at) - new Date(b.done_at));
  let lvl = 0;
  for (const l of done) {
    if (l.feel && l.feel <= 3) lvl += 1;
    else if (l.feel === 5) lvl -= 1;
    lvl = Math.max(0, Math.min(3, lvl));
  }
  return lvl;
}

// A template as steps with seconds, for the phone's timer and the watch.
export function templateSession(t, walkLogs = []) {
  const lvl = levelOf(t.id, walkLogs);
  const steps = t.build(lvl).map((x) => ({
    secs: Math.round(x.mins * 60), phase: x.phase, title: x.title,
    hint: `${fmtSpeed(x.speed)} · ${fmtIncline(x.incline)}`, fast: 0, slow: 0, alert: false,
    speed: x.speed, incline: x.incline,
  }));
  const segs = steps.map((x) => ({ secs: x.secs, speed: x.speed, incline: x.incline }));
  return {
    key: `tpl:${t.id}`, ymd: '', title: t.title, activity: t.activity, about: t.about, level: lvl,
    mins: Math.round(steps.reduce((a, x) => a + x.secs, 0) / 60),
    km: Math.round(distanceOf(segs) / 100) / 10,
    elevation: Math.round(elevationOf(segs)),
    steps,
  };
}

// Walks of this week (Monday first), and their D+, for the screen and Progrès.
export function thisWeek(walkLogs, now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return walkLogs.filter((l) => new Date(l.done_at) >= monday);
}
export const weekElevation = (walkLogs, now = new Date()) => Math.round(thisWeek(walkLogs, now).reduce((a, l) => a + Number(l.elevation_m || 0), 0));
