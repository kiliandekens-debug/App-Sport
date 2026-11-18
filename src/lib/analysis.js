// Session analysis: which zone was trained, which muscles worked, and what the
// research says could make the session better. Every rule cites its source.
import { REGIONS, GROUPS, LEG_GROUPS, targetsOf, muscleLoad, isCompound, primaryOf } from './anatomy.js';
import { isWork, isPlausible } from './stats.js';

const DAY = 86400000;
const workSets = (w) => w.sets.filter((s) => isWork(s) && isPlausible(s) && Object.keys(targetsOf(s.exercise)).length);
const half = (x) => Math.round(x * 2) / 2;
export const fmtSets = (x) => String(half(x)).replace('.', ',');
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}`);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export const SOURCES = {
  volume: 'Schoenfeld, Ogborn et Krieger, 2017 (méta-analyse volume et hypertrophie)',
  landmarks: 'Renaissance Periodization, Mike Israetel (repères de volume par muscle)',
  perSession: 'Pelland et al., 2024 (méta-régression volume et fréquence)',
  frequency: 'Schoenfeld, Ogborn et Krieger, 2016 (méta-analyse fréquence)',
  load: 'Schoenfeld et al., 2017 (charges lourdes contre légères)',
  order: 'Simão et al., 2012 (ordre des exercices)',
  incline: 'Rodríguez-Ridao et al., 2020 (angle du développé incliné)',
  overhead: 'Maeo et al., 2023 (extension au-dessus de la tête contre poulie)',
  legCurl: 'Maeo et al., 2021 (leg curl assis contre allongé)',
  lengthened: 'Wolf et al., 2023 (travail en position étirée)',
  balance: 'Recommandation commune de Schoenfeld et Helms : équilibrer poussée et tirage',
};

// Primary (weight 1) sets per group: decides the zone's name.
function primaryGroups(sets) {
  const out = {};
  for (const s of sets) {
    const seen = new Set();
    for (const [r, w] of Object.entries(targetsOf(s.exercise))) {
      const g = REGIONS[r].group;
      if (w === 1 && !seen.has(g)) { out[g] = (out[g] || 0) + 1; seen.add(g); }
    }
  }
  return out;
}

function zoneOf(prim) {
  const entries = Object.entries(prim).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (!total) return null;
  const share = (keys) => keys.reduce((a, k) => a + (prim[k] || 0), 0) / total;
  // A group is a target of the session when it got at least one full exercise.
  const main = entries.filter(([, n]) => n >= 3 && n / total >= 0.15).map(([g]) => g);
  if (!main.length) main.push(entries[0][0]);
  if (share(LEG_GROUPS) >= 0.7) return { key: 'legs', name: 'Jambes', main: main.filter((g) => LEG_GROUPS.includes(g)) };
  if (main.length === 1) return { key: main[0], name: GROUPS[main[0]], main };
  if (main.length === 2) return { key: main.join('+'), name: `${GROUPS[main[0]]} et ${lower(GROUPS[main[1]])}`, main };
  if (share(['pecs', 'epaules', 'triceps']) >= 0.75) return { key: 'push', name: 'Poussée', main };
  if (share(['dos', 'biceps']) >= 0.75) return { key: 'pull', name: 'Tirage', main };
  if (share(LEG_GROUPS) >= 0.25) return { key: 'full', name: 'Corps complet', main };
  return { key: 'upper', name: 'Haut du corps', main };
}

// The three deltoid heads move the arm in different directions: count the busiest one.
function loadOf(load, g) {
  if (g !== 'epaules') return load.groups[g] || 0;
  return Math.max(0, ...['deltAnt', 'deltLat', 'deltPost'].map((r) => load.regions[r] || 0));
}

// w: a workout from data.workouts ({ id, start, sets }); workouts: all of them.
export function analyseSession(w, workouts) {
  const sets = workSets(w);
  if (!sets.length) return null;
  const { regions, groups } = muscleLoad(sets);
  const prim = primaryGroups(sets);
  const zone = zoneOf(prim);
  if (!zone) return null;

  // Exercises in the order they were done.
  const order = [];
  for (const s of [...w.sets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.set_index ?? 0) - (b.set_index ?? 0))) {
    if (!order.includes(s.exercise) && Object.keys(targetsOf(s.exercise)).length) order.push(s.exercise);
  }
  const names = order.filter((n) => sets.some((s) => s.exercise === n));
  const hits = (pred) => names.filter((n) => Object.entries(targetsOf(n)).some(([r, wt]) => pred(r, wt)));

  // Rolling windows ending with this session.
  const end = w.start.getTime();
  const within = (days) => workouts.filter((x) => x.start.getTime() <= end && x.start.getTime() > end - days * DAY);
  const week = within(7);
  const weekLoad = muscleLoad(week.flatMap(workSets));
  const freq = {};
  for (const x of week) {
    const g = muscleLoad(workSets(x)).groups;
    for (const [k, n] of Object.entries(g)) if (n >= 2) freq[k] = (freq[k] || 0) + 1;
  }
  const monthSets = within(28).flatMap(workSets);
  const month = muscleLoad(monthSets);

  // Muscles of this session, most worked first.
  const muscles = Object.entries(regions)
    .map(([r, n]) => ({
      region: r, sets: n, ...REGIONS[r],
      primary: names.some((e) => targetsOf(e)[r] === 1),
      exercises: names.filter((e) => targetsOf(e)[r]),
    }))
    .sort((a, b) => b.sets - a.sets);
  const support = [...new Set(muscles.filter((m) => !zone.main.includes(m.group) && !m.primary).map((m) => lower(m.name)))].slice(0, 3);

  const tips = [], goods = [];
  const tip = (id, title, text, source) => tips.push({ id, title, text, source });
  const good = (id, title, text, source) => goods.push({ id, title, text, source });

  for (const g of zone.main) {
    const label = GROUPS[g];
    const inSession = loadOf({ regions, groups }, g);
    const weekly = loadOf(weekLoad, g);
    const times = freq[g] || 0;
    if (inSession > 11) {
      tip(`split-${g}`, `${label} : ${fmtSets(inSession)} séries en une séance`,
        times <= 1
          ? `Au-delà d'environ 10 séries pour un muscle dans la même séance, chaque série de plus rapporte peu. Garde le même total mais coupe-le en deux séances dans la semaine : les dernières séries seront faites moins fatigué.`
          : `Au-delà d'environ 10 séries pour un muscle dans la même séance, chaque série de plus rapporte peu. Tu peux en retirer 2 ou 3 sans rien perdre.`,
        SOURCES.perSession);
    }
    const times_ = times >= 2 ? `, en ${times} séances` : '';
    if (weekly < 8) {
      tip(`low-${g}`, `${label} : ${fmtSets(weekly)} séries sur 7 jours`,
        `La croissance musculaire augmente nettement à partir d'environ 10 séries par muscle et par semaine. Ajoute 2 à 4 séries cette semaine, ou une deuxième séance qui touche ce muscle.`,
        SOURCES.volume);
    } else if (weekly > 25) {
      tip(`high-${g}`, `${label} : ${fmtSets(weekly)} séries sur 7 jours`,
        `C'est au-dessus de ce que la plupart des pratiquants récupèrent bien (environ 20 séries, en comptant le travail indirect des autres séances). Si tes charges stagnent ou que tu traînes des courbatures, baisse un peu.`,
        SOURCES.landmarks);
    } else if (weekly > 20) {
      good(`week-${g}`, `${label} : ${fmtSets(weekly)} séries sur 7 jours${times_}`, 'Haut de la fourchette utile (10 à 20 séries, travail indirect compris) : inutile d’en ajouter.', SOURCES.volume);
    } else if (weekly >= 10) {
      good(`week-${g}`, `${label} : ${fmtSets(weekly)} séries sur 7 jours${times_}`, times >= 2 ? 'Dans la zone efficace de 10 à 20 séries, réparties sur 2 séances : idéal.' : 'Dans la zone efficace de 10 à 20 séries par semaine.', times >= 2 ? SOURCES.frequency : SOURCES.volume);
    }
  }

  const main = new Set(zone.main);
  // Exercise selection.
  if (main.has('pecs') && !hits((r, wt) => r === 'pecHaut' && wt === 1).length) {
    tip('incline', 'Pas de développé incliné',
      `Le haut des pectoraux travaille surtout à l'incliné. Un banc réglé vers 30° le sollicite le plus sans transférer tout l'effort sur l'avant d'épaule. Remplace un développé à plat par un incliné.`,
      SOURCES.incline);
  }
  if (main.has('triceps') && !names.some((n) => targetsOf(n).triceps === 1 && /au-dessus|overhead|nuque|french/i.test(n))) {
    tip('overhead', 'Pas d’extension au-dessus de la tête',
      `Bras au-dessus de la tête, la longue portion du triceps (la plus grosse) est étirée. En 12 semaines, cet exercice a donné environ 40 % de croissance en plus que l'extension à la poulie haute. Remplace une extension à la poulie par celle-ci.`,
      SOURCES.overhead);
  }
  if (main.has('epaules') && (regions.deltLat || 0) < 3) {
    tip('lateral', 'Peu de travail pour l’épaule latérale',
      `Les développés sollicitent surtout l'avant de l'épaule. C'est l'élévation latérale qui élargit les épaules : vise au moins 3 séries, idéalement à la poulie qui garde la tension en bas du mouvement.`,
      SOURCES.landmarks);
  }
  if (main.has('dos')) {
    const vertical = hits((r, wt) => r === 'dorsaux' && wt === 1).filter((n) => (targetsOf(n).hautDos || 0) < 1);
    const horizontal = hits((r, wt) => r === 'hautDos' && wt === 1);
    if (vertical.length && !horizontal.length) tip('row', 'Pas de rowing', 'Les tirages verticaux ciblent la largeur (dorsaux). Ajoute un rowing pour l’épaisseur du milieu du dos et l’arrière d’épaule.', SOURCES.landmarks);
    if (horizontal.length && !vertical.length) tip('pulldown', 'Pas de tirage vertical', 'Les rowings ciblent l’épaisseur du dos. Ajoute un tirage poitrine ou des tractions pour la largeur des dorsaux.', SOURCES.landmarks);
  }
  if (main.has('biceps') && !names.some((n) => targetsOf(n).biceps === 1 && /incliné|incline|bayesian|derrière/i.test(n))) {
    tip('stretch-biceps', 'Biceps : pas de curl en position étirée',
      `Les muscles grossissent davantage quand ils sont chargés étirés. Le curl incliné assis (bras derrière le corps) étire le biceps : remplace un de tes curls par celui-ci.`,
      SOURCES.lengthened);
  }
  if ((main.has('ischios') || main.has('legs')) && names.some((n) => /leg curl allong|lying leg curl/i.test(n)) && !names.some((n) => /leg curl assis|seated leg curl/i.test(n))) {
    tip('seated-curl', 'Leg curl assis plutôt qu’allongé',
      `Assis, la hanche pliée étire les ischios. En 12 semaines, le leg curl assis a donné environ deux fois plus de croissance que la version allongée.`,
      SOURCES.legCurl);
  }

  // Order: a compound for a muscle should come before its isolation work.
  for (const g of zone.main) {
    const idx = (pred) => names.findIndex((n) => pred(n));
    const firstIso = idx((n) => !isCompound(n) && Object.entries(targetsOf(n)).some(([r, wt]) => wt === 1 && REGIONS[r].group === g));
    const firstComp = idx((n) => isCompound(n) && Object.entries(targetsOf(n)).some(([r, wt]) => wt === 1 && REGIONS[r].group === g));
    if (firstIso >= 0 && firstComp > firstIso) {
      tip(`order-${g}`, 'Ordre des exercices',
        `${names[firstIso]} passe avant ${names[firstComp]}. L'exercice fait en premier progresse le mieux : commence par le polyarticulaire, le plus lourd, et garde l'isolation pour la fin.`,
        SOURCES.order);
      break;
    }
  }

  // Loads: 5 to 30 reps near failure all build muscle; very heavy or very light sets cost more.
  const reps = sets.filter((s) => zone.main.includes(REGIONS[Object.keys(targetsOf(s.exercise))[0]].group)).map((s) => s.reps);
  if (reps.length) {
    const lo = reps.filter((r) => r < 5).length / reps.length;
    const hi = reps.filter((r) => r > 20).length / reps.length;
    const sorted = [...reps].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)], p90 = sorted[Math.ceil(sorted.length * 0.9) - 1];
    if (lo > 0.5) tip('heavy', 'Séries très lourdes', 'Plus de la moitié de tes séries font moins de 5 reps. Pour le muscle, des séries de 6 à 15 reps donnent autant de résultat avec moins de fatigue pour les articulations.', SOURCES.load);
    else if (hi > 0.5) tip('light', 'Séries très longues', 'Plus de la moitié de tes séries dépassent 20 reps. Ça marche si tu vas près de l’échec, mais c’est long et dur à doser : une charge pour 8 à 15 reps est plus simple.', SOURCES.load);
    else good('reps', `Séries de ${p10} à ${p90} reps`, 'Dans la plage efficace pour la masse musculaire, à condition de finir à 1 ou 2 reps de l’échec.', SOURCES.load);
  }

  // Balance over 4 weeks.
  let push = 0, pull = 0;
  for (const s of monthSets) {
    const r = primaryOf(s.exercise);
    if (['pecs', 'pecHaut', 'deltAnt'].includes(r)) push += 1;
    else if (['dorsaux', 'hautDos', 'deltPost'].includes(r)) pull += 1;
  }
  const legs = LEG_GROUPS.reduce((a, g) => a + (month.groups[g] || 0), 0);
  if (zone.key !== 'legs' && legs < 4) {
    const last = workouts.find((x) => x.start.getTime() <= end && LEG_GROUPS.some((g) => (muscleLoad(workSets(x)).groups[g] || 0) >= 2));
    const weeks = last ? Math.floor((end - last.start.getTime()) / (7 * DAY)) : null;
    tip('legs', 'Jambes oubliées',
      `${weeks ? `Dernière vraie séance jambes il y a ${weeks} semaines.` : 'Pas de séance jambes dans ton historique récent.'} Les jambes représentent près de la moitié de ta masse musculaire : une séance par semaine (squat ou presse, leg curl assis, mollets) suffit pour démarrer. Ta course à pied ne les remplace pas pour la force.`,
      SOURCES.balance);
  }
  if (push > 0 && pull > 0 && pull / push < 0.7 && ['pecs', 'push', 'epaules', 'pecs+epaules', 'pecs+triceps', 'epaules+triceps'].includes(zone.key)) {
    tip('balance', 'Plus de poussée que de tirage',
      `Sur 4 semaines : ${fmtSets(push)} séries de poussée pour ${fmtSets(pull)} de tirage. Vise à peu près autant des deux, sinon les épaules s’enroulent vers l’avant. Ajoute des rowings ou des oiseaux.`,
      SOURCES.balance);
  }

  return { zone, support, muscles, groups, regions, week: weekLoad.groups, tips, goods: goods.slice(0, 3), sets: sets.length };
}
