import { isWork, isPlausible, fmtKg } from './stats.js';
import { incrementOf } from './exercises.js';

const kg = (v) => `${fmtKg(v)} kg`;

// Rule-based review of the latest session: one suggestion per exercise.
export function reviewLastSession(data) {
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
    facts.push(`Jambes : ${legSets} série${legSets > 1 ? 's' : ''} sur ${workSets.toLocaleString('fr-FR')}. Une séance jambes par semaine équilibrerait le programme.`);
  if (peak && lastFull && lastFull.tonnes < peak.tonnes * 0.6)
    facts.push(`Volume du mois dernier : ${Math.round(lastFull.tonnes)} t, contre ${Math.round(peak.tonnes)} t au pic. Tes charges plafonnent depuis que le volume a baissé.`);
  return facts;
}
