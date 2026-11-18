// Which muscles an exercise trains. Regions are what the body map draws; groups are
// what volume guidelines are counted on. Weights: 1 = prime mover, 0.5 = synergist
// (the usual "fractional sets" convention, e.g. Pelland et al. 2024).

export const REGIONS = {
  pecHaut: { name: 'Haut des pectoraux', group: 'pecs', what: 'Faisceau claviculaire du grand pectoral : monte et ramène le bras devant toi. Ciblé par les angles inclinés.' },
  pecs: { name: 'Pectoraux', group: 'pecs', what: 'Grand pectoral : ramène les bras devant toi et pousse. Moteur principal des développés et des écartés.' },
  deltAnt: { name: 'Épaule avant', group: 'epaules', what: 'Deltoïde antérieur : lève le bras vers l’avant. Il aide déjà beaucoup sur tous les développés.' },
  deltLat: { name: 'Épaule latérale', group: 'epaules', what: 'Deltoïde moyen : écarte le bras sur le côté. C’est lui qui donne la largeur d’épaules.' },
  deltPost: { name: 'Arrière d’épaule', group: 'epaules', what: 'Deltoïde postérieur : tire le bras vers l’arrière. Souvent en retard, il équilibre la posture.' },
  biceps: { name: 'Biceps', group: 'biceps', what: 'Plie le coude et tourne l’avant-bras paume vers le haut. Il aide sur tous les tirages.' },
  avantBras: { name: 'Avant-bras', group: 'biceps', what: 'Brachio-radial et fléchisseurs : plient le coude en prise neutre et tiennent la prise.' },
  triceps: { name: 'Triceps', group: 'triceps', what: 'Tend le coude. Sa longue portion, la plus grosse, se travaille mieux bras au-dessus de la tête.' },
  trapezes: { name: 'Trapèzes', group: 'dos', what: 'Haussent et stabilisent les omoplates.' },
  hautDos: { name: 'Milieu du dos', group: 'dos', what: 'Rhomboïdes et trapèzes moyens : resserrent les omoplates. Ciblés par les rowings.' },
  dorsaux: { name: 'Grands dorsaux', group: 'dos', what: 'Ramènent les bras le long du corps. Ils donnent la largeur du dos (forme en V).' },
  lombaires: { name: 'Lombaires', group: 'dos', what: 'Érecteurs du rachis : tiennent le dos droit sous charge.' },
  abdos: { name: 'Abdominaux', group: 'abdos', what: 'Grand droit : enroule le buste et gaine le tronc.' },
  obliques: { name: 'Obliques', group: 'abdos', what: 'Font tourner et pencher le buste, stabilisent le tronc.' },
  quads: { name: 'Quadriceps', group: 'quads', what: 'Tendent le genou : squat, presse, fentes.' },
  adducteurs: { name: 'Adducteurs', group: 'quads', what: 'Ramènent les jambes l’une vers l’autre, très actifs au squat profond.' },
  fessiers: { name: 'Fessiers', group: 'fessiers', what: 'Tendent la hanche : le muscle le plus puissant du corps.' },
  ischios: { name: 'Ischio-jambiers', group: 'ischios', what: 'Plient le genou et tendent la hanche.' },
  mollets: { name: 'Mollets', group: 'mollets', what: 'Tendent la cheville : marche, course, saut.' },
};

export const GROUPS = {
  pecs: 'Pectoraux', epaules: 'Épaules', dos: 'Dos', biceps: 'Biceps', triceps: 'Triceps',
  abdos: 'Abdos', quads: 'Quadriceps', fessiers: 'Fessiers', ischios: 'Ischio-jambiers', mollets: 'Mollets',
};
export const LEG_GROUPS = ['quads', 'fessiers', 'ischios', 'mollets'];

// First match wins, so specific patterns come before generic ones.
const RULES = [
  [/tapis|elliptique|\bv[ée]lo\b|rameur|treadmill|course|marche/, null],
  // Legs first: "machine", "écartés" or "kickback" also appear in leg exercise names.
  [/leg curl|curl (jambe|ischio)|ischio|glute ham/, { ischios: 1 }],
  [/hip thrust|pont fessier|glute bridge|kickback fessier|fessier/, { fessiers: 1, ischios: 0.5 }],
  [/abducteur|abduction/, { fessiers: 1 }],
  [/adducteur|adduction/, { adducteurs: 1 }],
  [/leg extension|extension (des )?jambes|extension quadri/, { quads: 1 }],
  [/mollet|calf/, { mollets: 1 }],
  [/fente|lunge|bulgare|step-?up/, { quads: 1, fessiers: 1, adducteurs: 0.5 }],
  [/thruster/, { quads: 1, fessiers: 0.5, deltAnt: 1, triceps: 0.5 }],
  [/squat|hack/, { quads: 1, fessiers: 1, adducteurs: 0.5 }],
  [/presse (à|a) cuisses|presse horizontale|leg press/, { quads: 1, fessiers: 0.5, adducteurs: 0.5 }],
  [/swing/, { fessiers: 1, ischios: 1, lombaires: 0.5 }],
  [/épaulé|epaule\b|clean|snatch|arraché/, { fessiers: 1, quads: 1, trapezes: 1, ischios: 0.5, deltLat: 0.5 }],
  [/crunch/, { abdos: 1, obliques: 0.5 }],
  // Shoulders and rear delts before chest (reverse fly is an "écarté").
  [/oiseau|rowing arrière|rear delt|reverse fly|écarté inversé|ecarte inverse|deltoïde post/, { deltPost: 1, hautDos: 0.5 }],
  [/vers (le )?visage|face pull/, { deltPost: 1, hautDos: 0.5, trapezes: 0.5 }],
  [/tirage menton|upright row/, { deltLat: 1, trapezes: 1 }],
  [/élévation lat|elevation lat|lateral raise/, { deltLat: 1 }],
  [/frontale|front raise/, { deltAnt: 1, pecHaut: 0.5 }],
  [/militaire|presse épaules|presse epaules|développé épaules|developpe epaules|shoulder press|overhead press|arnold/, { deltAnt: 1, deltLat: 0.5, triceps: 0.5 }],
  [/shrug|haussement/, { trapezes: 1 }],
  // Triceps before chest: "dips triceps", "machine dips assis".
  [/dips (\(triceps|\(machine|triceps|entre|assis)|machine dips|dips machine/, { triceps: 1, pecs: 0.5, deltAnt: 0.5 }],
  [/au-dessus|overhead|nuque|french/, { triceps: 1 }],
  [/(développé|developpe|couché|couche|pompe|bench).*(prise serrée|prise serree)|close-?grip bench/, { triceps: 1, pecs: 0.5, deltAnt: 0.5 }],
  [/triceps|skull|barre au front|kickback|pushdown/, { triceps: 1 }],
  // Chest.
  [/(incliné|incline).*(couché|couche|développé|developpe|press|bench)|(couché|couche|développé|developpe|press|bench).*(incliné|incline)/, { pecHaut: 1, pecs: 0.5, deltAnt: 0.5, triceps: 0.5 }],
  [/(incliné|incline).*(écarté|ecarte|fly)/, { pecHaut: 1, pecs: 0.5 }],
  [/butterfly|pec deck|écarté|ecarte|\bfly/, { pecs: 1, pecHaut: 0.5, deltAnt: 0.5 }],
  [/couché|couche|décliné|decline|chest|bench|pompe|push-?up|dips/, { pecs: 1, pecHaut: 0.5, deltAnt: 0.5, triceps: 0.5 }],
  // Back.
  [/bras tendus|straight-?arm/, { dorsaux: 1 }],
  [/pull-?over/, { dorsaux: 1, pecs: 0.5 }],
  [/tirage (poitrine|vertical|nuque)|pulldown|traction|pull-?up|\bchin|tirage machine convergente/, { dorsaux: 1, biceps: 0.5, hautDos: 0.5 }],
  [/rowing (penché|penche|barre)|barre t|t-?bar|bent over/, { hautDos: 1, dorsaux: 1, deltPost: 0.5, biceps: 0.5, lombaires: 0.5 }],
  [/rowing|row\b|tirage (assis|horizontal|poulie basse)|tirage à la poulie|seated cable/, { hautDos: 1, dorsaux: 1, deltPost: 0.5, biceps: 0.5 }],
  [/soulevé de terre roumain|roumain|rdl|jambes tendues|good morning/, { ischios: 1, fessiers: 1, lombaires: 0.5 }],
  [/soulevé de terre|souleve de terre|deadlift/, { fessiers: 1, ischios: 1, lombaires: 1, quads: 0.5, trapezes: 0.5, avantBras: 0.5 }],
  [/lombaire|hyperextension|extension (du )?dos|back extension/, { lombaires: 1, fessiers: 0.5 }],
  // Arms.
  [/marteau|hammer/, { biceps: 1, avantBras: 1 }],
  [/curl|biceps/, { biceps: 1, avantBras: 0.5 }],
  [/poignet|wrist|avant-bras/, { avantBras: 1 }],
  [/farmer/, { avantBras: 1, trapezes: 1, abdos: 0.5 }],
  // Core.
  [/oblique|coude-genou|russian|rotation|bûcheron|bucheron|wood ?chop/, { obliques: 1, abdos: 0.5 }],
  [/planche|gainage|plank/, { abdos: 1, obliques: 0.5 }],
  [/crunch|abdo|relevé de (jambes|genoux)|releve de (jambes|genoux)|slam|get-up|leg raise|roue|sit-?up/, { abdos: 1, obliques: 0.5 }],
];

const cache = new Map();
export function targetsOf(name) {
  if (cache.has(name)) return cache.get(name);
  const n = (name || '').toLowerCase();
  let out = {};
  for (const [re, t] of RULES) if (re.test(n)) { out = t || {}; break; }
  cache.set(name, out);
  return out;
}

// Main region of an exercise (highest weight, first listed).
export function primaryOf(name) {
  const t = targetsOf(name);
  let best = null;
  for (const [r, w] of Object.entries(t)) if (!best || w > t[best]) best = r;
  return best;
}

// Single-joint movements; everything else that trains several groups is compound.
const ISOLATION = /curl|extension|élévation|elevation|oiseau|butterfly|pec deck|écarté|ecarte|\bfly|mollet|calf|shrug|bras tendus|straight-?arm|kickback|pull-?over|vers (le )?visage|face pull|abducteur|adducteur|crunch|skull|barre au front|pushdown/i;
export function isCompound(name) {
  if (ISOLATION.test(name)) return false;
  const groups = new Set(Object.keys(targetsOf(name)).map((r) => REGIONS[r].group));
  return groups.size >= 2;
}

// sets: [{ exercise }] (work sets only). Regions get summed fractional sets; a group
// counts a set once, with the highest weight among its regions.
export function muscleLoad(sets) {
  const regions = {}, groups = {};
  for (const s of sets) {
    const t = targetsOf(s.exercise);
    const g = {};
    for (const [r, w] of Object.entries(t)) {
      regions[r] = (regions[r] || 0) + w;
      const k = REGIONS[r].group;
      g[k] = Math.max(g[k] || 0, w);
    }
    for (const [k, w] of Object.entries(g)) groups[k] = (groups[k] || 0) + w;
  }
  return { regions, groups };
}
