export const MUSCLES = ['Pectoraux', 'Épaules', 'Dos', 'Biceps', 'Triceps', 'Jambes', 'Abdos', 'Cardio'];
export const EQUIPS = ['Machine', 'Poulie', 'Haltères', 'Barre', 'Poids du corps', 'Cardio'];

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

const E = (name, muscle, equip) => ({ name, muscle, equip, source: 'library' });

export const LIBRARY = [
  E('Développé épaules (machine)', 'Épaules', 'Machine'),
  E('Développé militaire (barre)', 'Épaules', 'Barre'),
  E('Arnold press', 'Épaules', 'Haltères'),
  E('Élévation latérale (haltères)', 'Épaules', 'Haltères'),
  E('Élévation latérale (machine)', 'Épaules', 'Machine'),
  E('Élévation frontale (haltères)', 'Épaules', 'Haltères'),
  E('Oiseau (haltères)', 'Épaules', 'Haltères'),
  E('Tirage menton (barre)', 'Épaules', 'Barre'),
  E('Tractions', 'Dos', 'Poids du corps'),
  E('Rowing (barre)', 'Dos', 'Barre'),
  E('Rowing unilatéral (haltère)', 'Dos', 'Haltères'),
  E('Pull-over (poulie)', 'Dos', 'Poulie'),
  E('Soulevé de terre (barre)', 'Dos', 'Barre'),
  E('Développé couché (barre)', 'Pectoraux', 'Barre'),
  E('Écarté vis-à-vis (poulie)', 'Pectoraux', 'Poulie'),
  E('Dips', 'Pectoraux', 'Poids du corps'),
  E('Pompes', 'Pectoraux', 'Poids du corps'),
  E('Curl (haltères)', 'Biceps', 'Haltères'),
  E('Curl marteau (haltères)', 'Biceps', 'Haltères'),
  E('Curl incliné (haltères)', 'Biceps', 'Haltères'),
  E('Barre au front', 'Triceps', 'Barre'),
  E('Extension nuque (haltère)', 'Triceps', 'Haltères'),
  E('Kickback (poulie)', 'Triceps', 'Poulie'),
  E('Dips entre bancs', 'Triceps', 'Poids du corps'),
  E('Squat (barre)', 'Jambes', 'Barre'),
  E('Presse à cuisses', 'Jambes', 'Machine'),
  E('Fentes (haltères)', 'Jambes', 'Haltères'),
  E('Leg extension', 'Jambes', 'Machine'),
  E('Soulevé de terre roumain', 'Jambes', 'Barre'),
  E('Hip thrust (barre)', 'Jambes', 'Barre'),
  E('Mollets debout (machine)', 'Jambes', 'Machine'),
  E('Crunch (poulie)', 'Abdos', 'Poulie'),
  E('Relevé de jambes suspendu', 'Abdos', 'Poids du corps'),
  E('Gainage', 'Abdos', 'Poids du corps'),
];
