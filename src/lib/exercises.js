export const MUSCLES = ['Pectoraux', 'Épaules', 'Dos', 'Biceps', 'Triceps', 'Jambes', 'Abdos', 'Cardio'];
export const EQUIPS = ['Machine', 'Poulie', 'Haltères', 'Barre', 'Poids du corps', 'Kettlebell', 'Cardio', 'Autre'];

const MUSCLE_RULES = [
  [/tapis|elliptique|\bv[ée]lo\b|rameur|treadmill/i, 'Cardio'],
  [/\bleg\b|cuisse|squat|fente|mollet|hip thrust|roumain|ischio|quadri|adducteur|abducteur/i, 'Jambes'],
  [/couché|couche|chest|butterfly|pec deck|écarté|ecarte|pompe|dips(?! entre)/i, 'Pectoraux'],
  [/vers visage|face pull|élévation|elevation|oiseau|militaire|épaules|epaules|shoulder|arnold|tirage menton/i, 'Épaules'],
  [/tirage|rowing|row|traction|pull|shrug|soulevé de terre(?! roumain)|lombaire/i, 'Dos'],
  [/curl(?! jambe| ischio)|biceps/i, 'Biceps'],
  [/triceps|skullcrusher|barre au front|kickback|extension nuque|dips entre/i, 'Triceps'],
  [/crunch|abdo|gainage|planche|relevé de jambes|roue/i, 'Abdos'],
];

export function muscleOf(name) {
  for (const [re, m] of MUSCLE_RULES) if (re.test(name)) return m;
  return 'Autre';
}

export function equipOf(name) {
  const n = name.toLowerCase();
  if (/tapis|elliptique|\bv[ée]lo\b|rameur/.test(n)) return 'Cardio';
  if (/kettlebell/.test(n)) return 'Kettlebell';
  if (/haltère|haltere|dumbbell/.test(n)) return 'Haltères';
  if (/poulie|cable|corde|vers visage|face pull/.test(n)) return 'Poulie';
  if (/barre|barbell|ez/.test(n)) return 'Barre';
  if (/machine|pec deck|butterfly|presse|leg curl|leg extension|chest press/.test(n)) return 'Machine';
  return 'Poids du corps';
}

// Small increment used by the coach when it proposes a heavier load.
export function incrementOf(name) {
  const e = equipOf(name);
  if (/élévation|elevation|oiseau|curl/i.test(name)) return 1;
  if (e === 'Haltères') return 2;
  return 2.5;
}

export { LIBRARY } from './library.js';
