// Fixed strength programmes written from the research (docs/recherche/recherche-muscu.md):
// the structure never changes, the coach only suggests the loads. Exercise names are the
// library's (images, muscles); a routine resolves them to the names of the history.
// Each exercise: sets, rep range, reps in reserve (RIR), rest (s).

const X = (name, sets, reps, rir, rest) => ({ name, sets, reps, rir, rest });

const DAYS = {
  fbA: { title: 'Full body A', legs: 'heavy', exercises: [
    X('Squat (barre)', 3, '6-8', '2', 180), X('Développé couché (barre)', 3, '6-8', '1-2', 150),
    X('Tirage vertical prise large (poulie)', 3, '8-12', '1-2', 120), X('Leg curl assis (machine)', 3, '10-12', '1', 90),
    X('Élévation latérale (haltères)', 3, '12-15', '0-1', 75), X('Curl (haltères)', 2, '10-15', '0-1', 75),
    X('Extension triceps corde (poulie haute)', 2, '10-15', '0-1', 75)] },
  fbB: { title: 'Full body B', legs: 'moderate', exercises: [
    X('Soulevé de terre roumain (barre)', 3, '6-10', '2', 150), X('Développé militaire (haltères)', 3, '8-10', '1-2', 120),
    X('Rowing assis (poulie)', 3, '8-12', '1-2', 120), X('Presse à cuisses', 3, '10-12', '2', 120),
    X('Développé incliné (haltères)', 2, '8-12', '1', 120), X('Pec deck (machine)', 2, '12-15', '0-1', 75),
    X('Mollets debout (machine)', 3, '10-15', '0-1', 60)] },
  fbC: { title: 'Full body C', legs: 'light', exercises: [
    X('Développé couché (machine)', 3, '8-12', '1', 120), X('Tractions prise large', 3, '6-10', '1-2', 120),
    X('Squat bulgare (haltères)', 2, '8-12', '2-3', 90), X('Leg extension (machine)', 2, '12-15', '1', 75),
    X('Rowing unilatéral (haltère)', 2, '10-12', '1', 90), X('Élévation latérale (poulie)', 3, '12-20', '0-1', 60),
    X('Oiseau (machine)', 2, '12-20', '0-1', 60), X('Curl incliné (haltères)', 2, '10-15', '0-1', 60),
    X('Extension au-dessus de la tête corde (poulie)', 2, '10-15', '0-1', 60)] },
  lowA: { title: 'Bas A', legs: 'heavy', exercises: [
    X('Squat (barre)', 3, '5-8', '2', 180), X('Soulevé de terre roumain (barre)', 3, '6-10', '2', 150),
    X('Presse à cuisses', 2, '10-15', '1-2', 120), X('Leg curl assis (machine)', 3, '10-12', '1', 90),
    X('Mollets debout (machine)', 3, '8-12', '0-1', 75), X('Crunch corde (poulie)', 2, '10-15', '1', 60)] },
  lowRunner: { title: 'Bas', legs: 'heavy', exercises: [
    X('Squat (barre)', 3, '5-8', '2', 180), X('Soulevé de terre roumain (barre)', 3, '6-10', '2', 150),
    X('Presse à cuisses', 2, '10-15', '1-2', 120), X('Leg curl assis (machine)', 3, '10-12', '1', 90),
    X('Leg extension (machine)', 2, '12-15', '1', 75), X('Mollets debout (machine)', 3, '8-12', '0-1', 75),
    X('Crunch corde (poulie)', 2, '10-15', '1', 60)] },
  upA: { title: 'Haut A', legs: 'none', exercises: [
    X('Développé couché (barre)', 3, '5-8', '1-2', 150), X('Rowing penché (barre)', 3, '6-10', '1-2', 120),
    X('Développé militaire (haltères)', 2, '8-12', '1', 120), X('Tirage vertical prise large (poulie)', 2, '10-12', '1', 90),
    X('Élévation latérale (haltères)', 3, '12-20', '0-1', 60), X('Extension triceps corde (poulie haute)', 2, '10-15', '0-1', 60),
    X('Curl (barre EZ)', 2, '10-15', '0-1', 60)] },
  lowB: { title: 'Bas B', legs: 'heavy', exercises: [
    X('Presse à cuisses', 3, '8-12', '1-2', 150), X('Hip thrust (barre)', 3, '8-12', '1-2', 120),
    X('Squat bulgare (haltères)', 2, '8-12', '2', 90), X('Leg curl allongé (machine)', 3, '10-15', '0-1', 90),
    X('Leg extension (machine)', 2, '12-15', '0-1', 75), X('Mollets assis (machine)', 3, '12-15', '0-1', 60)] },
  upB: { title: 'Haut B', legs: 'none', exercises: [
    X('Développé incliné (haltères)', 3, '8-12', '1', 120), X('Tractions prise large', 3, '6-10', '1-2', 120),
    X('Rowing unilatéral (haltère)', 3, '8-12', '1', 90), X('Écarté vis-à-vis (poulie haute)', 2, '12-15', '0-1', 75),
    X('Élévation latérale (poulie)', 3, '12-20', '0-1', 60), X('Oiseau (machine)', 2, '12-20', '0-1', 60),
    X('Curl incliné (haltères)', 2, '10-15', '0-1', 60), X('Extension au-dessus de la tête corde (poulie)', 2, '10-15', '0-1', 60)] },
  fbLight: { title: 'Full body léger', legs: 'light', exercises: [
    X('Presse à cuisses', 2, '12-15', '2-3', 120), X('Développé couché (machine)', 2, '10-12', '1-2', 90),
    X('Tirage vertical prise large (poulie)', 2, '10-12', '1-2', 90), X('Leg curl assis (machine)', 2, '12-15', '1-2', 75),
    X('Élévation latérale (haltères)', 2, '15-20', '0-1', 60), X('Planche', 3, '30-45 s', '', 45)] },
  push: { title: 'Poussée', legs: 'none', exercises: [
    X('Développé couché (barre)', 4, '5-8', '1-2', 150), X('Développé incliné (haltères)', 3, '8-12', '1', 120),
    X('Développé militaire (haltères)', 3, '8-12', '1', 120), X('Pec deck (machine)', 2, '12-15', '0-1', 75),
    X('Élévation latérale (haltères)', 3, '12-20', '0-1', 60), X('Extension triceps corde (poulie haute)', 3, '10-15', '0-1', 60)] },
  pull: { title: 'Tirage', legs: 'none', exercises: [
    X('Tractions prise large', 4, '6-10', '1-2', 120), X('Rowing penché (barre)', 3, '6-10', '1-2', 120),
    X('Rowing assis (poulie)', 3, '10-12', '1', 90), X('Pull-over (haltère)', 2, '12-15', '0-1', 75),
    X('Oiseau (machine)', 3, '12-20', '0-1', 60), X('Curl (barre EZ)', 3, '8-12', '0-1', 75)] },
  upFull: { title: 'Haut complet', legs: 'none', exercises: [
    X('Développé couché (machine)', 3, '8-12', '1', 120), X('Tirage vertical prise en V (poulie)', 3, '8-12', '1', 120),
    X('Rowing unilatéral (haltère)', 2, '10-12', '1', 90), X('Écarté vis-à-vis (poulie haute)', 2, '12-15', '0-1', 60),
    X('Élévation latérale (poulie)', 3, '12-20', '0-1', 60), X('Curl incliné (haltères)', 2, '10-15', '0-1', 60),
    X('Extension au-dessus de la tête corde (poulie)', 2, '10-15', '0-1', 60)] },
  arms: { title: 'Bras et épaules', legs: 'none', exercises: [
    X('Élévation latérale (haltères)', 3, '15-20', '0-1', 60), X('Oiseau (poulie)', 2, '15-20', '0-1', 60),
    X('Curl marteau (haltères)', 3, '10-15', '0-1', 60), X('Extension triceps corde (poulie haute)', 3, '10-15', '0-1', 60)] },
};

// Monday = 0. `days` are the usual weekdays when there is no running plan.
export const PROGRAMS = [
  { id: 'fb3', short: '3 jours', title: 'Full body 3 jours', days: ['fbA', 'fbB', 'fbC'], week: [0, 2, 4],
    about: 'Tout le corps à chaque séance, jambes lourdes le lundi seulement. Le plus simple à caser avec 3 courses par semaine.', from: 'Helms, Nippard, Schoenfeld' },
  { id: 'ul4', short: '4 jours', title: 'Haut / bas 4 jours', days: ['lowA', 'upA', 'lowB', 'upB'], week: [0, 1, 3, 4],
    about: 'Deux séances bas, deux séances haut : chaque muscle deux fois par semaine, le classique des naturels.', from: 'Lyle McDonald, Eric Helms' },
  { id: 'run4', short: '4 jours coureur', title: '4 jours, la course d\'abord', days: ['upA', 'lowRunner', 'upB', 'fbLight'], week: [0, 1, 3, 4],
    about: 'Une seule séance jambes lourde par semaine, loin de la séance clé et de la sortie longue. Pour une préparation 10 km ou semi.', from: 'Alex Viada, Eric Helms' },
  { id: 'ppl5', short: '5 jours', title: 'Bas / poussée / tirage 5 jours', days: ['lowA', 'push', 'pull', 'lowB', 'upFull'], week: [0, 1, 2, 4, 5],
    about: 'Plus de volume (haut de la fourchette utile). Pour les semaines où le sommeil et la récupération suivent.', from: 'Eric Helms, PHAT' },
  { id: 'ppl6', short: '6 jours', title: '5 jours + bras et épaules', days: ['lowA', 'push', 'pull', 'arms', 'lowB', 'upFull'], week: [0, 1, 2, 3, 4, 5],
    about: 'Le programme 5 jours avec une courte séance bras et épaules. Retire-la en premier si la fatigue s\'installe.', from: 'Eric Helms, PHAT' },
];
export const programById = (id) => PROGRAMS.find((p) => p.id === id) || null;
export const dayOf = (id) => DAYS[id];

// « 3 × 6-8 · 2 reps en réserve »
export function targetText(t) {
  if (!t) return '';
  const rir = t.rir === '' || t.rir == null ? '' : t.rir === '0-1' ? ' · jusqu\'à l\'échec ou presque' : ` · ${t.rir} rep${t.rir === '1' ? '' : 's'} en réserve`;
  return `${t.sets} × ${t.reps}${rir}`;
}

// The routines of a programme, ready for saveRoutine(). The target goes with each exercise.
export function programRoutines(p, position = 0) {
  return p.days.map((id, i) => ({
    name: DAYS[id].title,
    position: position + i,
    exercises: DAYS[id].exercises.map((x) => ({
      name: x.name, rest: x.rest, superset: null,
      target: { sets: x.sets, reps: x.reps, rir: x.rir },
      sets: Array.from({ length: x.sets }, () => ({ type: 'normal' })),
    })),
  }));
}

// Where each strength day goes in the week, around the runs (schedule: 7 × 'easy' | 'quality'
// | 'long' | null, Monday first). Rules from the research: no heavy legs the day before the key
// session or the long run, not the day after the long run, few sessions on the long-run day.
// Returns 7 × (index in p.days | null).
export function placeStrength(p, schedule) {
  const n = p.days.length;
  const run = schedule || Array(7).fill(null);
  const hard = (d) => run[(d + 7) % 7] === 'quality' || run[(d + 7) % 7] === 'long';
  const legs = p.days.map((id) => DAYS[id].legs);
  let best = null;
  const pick = (start, acc) => {
    if (acc.length === n) {
      for (let rot = 0; rot < n; rot++) {
        const week = Array(7).fill(null);
        acc.forEach((d, i) => { week[d] = (i + rot) % n; });
        let score = 0;
        for (let d = 0; d < 7; d++) {
          const i = week[d];
          if (i == null) continue;
          const l = legs[i];
          if (l === 'heavy' && hard(d + 1)) score -= 100;
          if (l === 'moderate' && hard(d + 1)) score -= 25;
          if (l === 'light' && hard(d + 1)) score -= 3;
          if (l === 'heavy' && run[(d + 6) % 7] === 'long') score -= 15;
          if (l !== 'none' && hard(d)) score -= 3;
          if (run[d] === 'long') score -= 8;
          else if (run[d] === 'quality') score -= 2;
          else if (run[d]) score -= 1;
          const j = week[(d + 1) % 7];
          if (d < 6 && j != null && l === 'heavy' && legs[j] === 'heavy') score -= 50;
          if (!p.week.includes(d)) score -= 2; // close to the programme's usual week
        }
        if (rot) score -= 0.5; // keep the programme's order when nothing else matters
        if (!best || score > best.score) best = { score, week };
      }
      return;
    }
    for (let d = start; d < 7; d++) pick(d + 1, [...acc, d]);
  };
  pick(0, []);
  return best ? best.week : p.week.reduce((w, d, i) => { w[d] = i; return w; }, Array(7).fill(null));
}

/* ---------- Coach's words: short, plain, from the research ---------- */
export const CUES = {
  gym: [
    'Garde 1 à 2 reps en réserve sur les gros mouvements.',
    'Va à l\'échec seulement sur la dernière série des machines et des isolations.',
    'Haut de la fourchette sur toutes les séries : ajoute le plus petit palier de charge.',
    'Repos de 2 à 3 minutes sur les exercices de base, 1 à 2 minutes sur les isolations.',
    'Contrôle la descente et marque l\'étirement en bas du mouvement.',
    'Une ou deux séries d\'approche avant la première série lourde, pas plus.',
    'Arrête la séance quand la qualité baisse : plus de séries ne veut pas dire plus de muscle.',
    'Si la dernière série est bien plus dure que la première, la charge est trop lourde.',
    'Un exercice qui fait mal se remplace, le mouvement de base reste.',
  ],
  easy: [
    'Footing facile : tu dois pouvoir parler en phrases complètes.',
    'Le facile fait la plus grande partie du progrès. Ne le transforme pas en séance.',
    'Trop vite sur un footing, c\'est de la fatigue sans gain. Ralentis.',
  ],
  quality: [
    'Échauffe-toi 15 minutes avant d\'accélérer.',
    'Le premier effort doit sembler facile : la séance se gagne sur les derniers.',
    'Tiens l\'allure, pas plus vite : la cible est la séance, pas un record.',
  ],
  long: [
    'Sortie longue : facile du début à la fin. Bois toutes les 20 à 30 minutes si elle dépasse 1 h 15.',
    'Pars plus lentement que tu ne le voudrais, la fin compte plus que le début.',
  ],
  rest: [
    'Jour de repos : c\'est là que le corps progresse. Dors bien.',
    'Repos ou marche tranquille. Les jambes fraîches font les bonnes séances.',
  ],
};

// One cue per day, the same all day long (no flicker between screens).
const pickOf = (list, date) => list[(Math.floor(new Date(date).setHours(0, 0, 0, 0) / 86400000)) % list.length];

// The advice of the day: the most useful sentence for today, nothing more.
// ctx: { date, run (session of today or null), gym (strength day of today or null),
//        tomorrowHard, legsYesterday, pause }
export function adviceOfDay(ctx) {
  const { date = new Date(), run, gym, tomorrowHard, legsYesterday, pause } = ctx;
  if (pause?.kind === 'malade') return 'Malade : repos complet. On reprend en douceur quand tu vas mieux.';
  if (pause?.kind === 'douleur') return 'Douleur : pas de course ni d\'exercice qui fait mal. Vélo ou marche si ça ne réveille rien.';
  if (pause?.kind === 'fatigue') return 'Fatigue : les séances dures sont remplacées par du facile. Dors 8 h si tu peux.';
  if (pause?.kind === 'vacances') return 'Vacances : rien d\'obligatoire. Bouge si tu en as envie, le plan reprend à ton retour.';
  if (run && (run.kind === 'quality' || run.kind === 'long') && legsYesterday) return 'Jambes travaillées hier : si elles sont lourdes, fais la séance en footing facile de même durée.';
  if (gym && dayOf(gym)?.legs === 'heavy' && tomorrowHard) return 'Séance clé demain : garde 3 reps en réserve sur les jambes aujourd\'hui.';
  if (run && gym) return 'Course et muscu aujourd\'hui : cours d\'abord, puis la salle au moins 3 heures après.';
  if (run?.kind === 'race') return 'Jour de course : rien de nouveau aujourd\'hui. Pars un peu plus lent que l\'allure visée.';
  if (run?.kind === 'quality') return pickOf(CUES.quality, date);
  if (run?.kind === 'long') return pickOf(CUES.long, date);
  if (run) return pickOf(CUES.easy, date);
  if (gym) return pickOf(CUES.gym, date);
  return pickOf(CUES.rest, date);
}
