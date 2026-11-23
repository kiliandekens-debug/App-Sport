import { isWork, isPlausible, fmtKg } from './stats.js';
import { incrementOf } from './exercises.js';

const kg = (v) => `${fmtKg(v)} kg`;

// Rule-based review of the latest session: one suggestion per exercise.
// Pull-ups and dips can take a dip belt; assisted, machine and bench versions cannot.
const LESTABLE = /traction|pull[- ]?up|chin[- ]?up|\bdips?\b/i;
const NO_LEST = /assist|machine|banc|bande/i;
export const isLestable = (name) => LESTABLE.test(name) && !NO_LEST.test(name);

// options.lest: a dip belt is available (setting in Profil).
export function reviewLastSession(data, { lest = false } = {}) {
  const w = data.workouts[0];
  if (!w) return null;
  const work = w.sets.filter((s) => isWork(s) && isPlausible(s));
  const volume = work.reduce((a, s) => a + s.weight_kg * s.reps, 0);
  const names = [...new Set(work.map((s) => s.exercise))];

  const items = names.map((name) => {
    const sets = work.filter((s) => s.exercise === name);
    const maxKg = Math.max(...sets.map((s) => s.weight_kg));
    const top = sets.filter((s) => s.weight_kg === maxKg);
    const minRepsAtTop = Math.min(...top.map((s) => s.reps));
    const maxReps = Math.max(...sets.map((s) => s.reps));
    const ex = data.exercises.get(name);
    const before = ex ? ex.history.filter((h) => h.workoutId !== w.id) : [];
    const prev = before[before.length - 1];
    const repTop = (prev ? prev.maxReps : maxReps) >= 10 ? 12 : 8;
    const inc = incrementOf(name);

    if (prev && maxKg < prev.maxKg * 0.8) {
      return {
        name,
        kind: 'question',
        text: `Sur ${name.toLowerCase()}, tu es passé de ${kg(prev.maxKg)} à ${kg(maxKg)}, avec ${maxReps} reps au mieux. Que s'est-il passé ?`,
        before: prev.maxKg,
        now: maxKg,
        replies: {
          'Autre machine': {
            reply: `Noté, je repars de ta charge d'aujourd'hui sur cette machine : ${kg(maxKg + inc)} × ${repTop} la prochaine fois.`,
            plan: { target_kg: maxKg + inc, target_reps: repTop, reason: 'Nouvelle machine : on monte un peu' },
          },
          Fatigue: {
            reply: `Compris. On garde ${kg(prev.maxKg)} comme référence, sans hausse la prochaine fois.`,
            plan: { target_kg: prev.maxKg, target_reps: Math.min(prev.maxReps, repTop), reason: 'Retour à ta charge habituelle' },
          },
          'Erreur de saisie': {
            reply: `Je garde ${kg(prev.maxKg)} comme vraie charge. Vise ${repTop} reps sur toutes les séries.`,
            plan: { target_kg: prev.maxKg, target_reps: repTop, reason: 'Charge corrigée' },
          },
        },
      };
    }
    // Bodyweight (0 kg): with a dip belt, pull-ups and dips get 2.5 kg once 12 reps are reached.
    if (maxKg === 0 && lest && isLestable(name) && minRepsAtTop >= 12) {
      return {
        name,
        kind: 'up',
        plan: { target_kg: 2.5, target_reps: 8, reason: `${minRepsAtTop} reps au poids du corps : ajoute 2,5 kg de lest` },
      };
    }
    // Otherwise adding 2.5 kg to a bodyweight squat makes no sense: aim for one more rep.
    if (maxKg === 0) {
      return {
        name,
        kind: 'hold',
        plan: { target_kg: 0, target_reps: minRepsAtTop + 1, reason: 'Poids du corps : une rep de plus' },
      };
    }
    if (minRepsAtTop >= repTop) {
      return {
        name,
        kind: 'up',
        plan: { target_kg: maxKg + inc, target_reps: repTop - 2, reason: `${repTop} reps ou plus à ${kg(maxKg)} : on monte la charge` },
      };
    }
    return {
      name,
      kind: 'hold',
      plan: { target_kg: maxKg, target_reps: Math.min(minRepsAtTop + 1, repTop), reason: 'Même charge, une rep de plus' },
    };
  });

  return { workout: w, totalSets: work.length, volume, items };
}

export function weeklyFacts(data) {
  const facts = [];
  const { legSets, workSets, peak, lastFull } = data.alerts;
  if (workSets > 100 && legSets / workSets < 0.05)
    facts.push(`Jambes : ${legSets} série${legSets > 1 ? 's' : ''} sur ${workSets.toLocaleString('fr-FR')} depuis le début. Une séance jambes par semaine équilibrerait le programme.`);
  if (peak && lastFull && lastFull.tonnes < peak.tonnes * 0.6)
    facts.push(`Volume du mois dernier : ${Math.round(lastFull.tonnes)} t, contre ${Math.round(peak.tonnes)} t au pic. Tes charges plafonnent depuis que le volume a baissé.`);
  return facts;
}

// Lighter week suggested when the body needs it: 6 weeks or more in a row without a break,
// or the estimated 1RM down two sessions running on at least 2 of the main exercises.
// `state` = deloadState() (session.jsx): nothing suggested within 6 weeks of the last one,
// or within 7 days of « Plus tard ».
export function deloadAdvice(data, state = {}) {
  const now = Date.now();
  if (state.last && now - state.last < 42 * 86400000) return null;
  if (state.later && now - state.later < 7 * 86400000) return null;
  const counts = new Map();
  for (const w of data.workouts) {
    if (now - w.start > 42 * 86400000) continue;
    for (const st of w.sets) counts.set(st.exercise, (counts.get(st.exercise) || 0) + 1);
  }
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => data.exercises.get(n)).filter((e) => e?.history.length >= 3);
  const falling = main.filter((e) => {
    const h = e.history.slice(-3).map((x) => x.e1rm);
    return h[2] < h[1] && h[1] < h[0];
  });
  if (falling.length >= 2) {
    return { why: `Ton 1RM estimé baisse depuis 2 séances sur ${falling.slice(0, 2).map((e) => e.name).join(' et ')} : signe de fatigue accumulée.` };
  }
  const weeks = data.week?.streak || 0;
  if (weeks >= 6) return { why: `${weeks} semaines d'affilée sans pause. Une semaine plus légère laisse ton corps assimiler, et tu repars plus fort.` };
  return null;
}
