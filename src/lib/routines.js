import { templateFor } from './stats.js';

export const LETTERS = 'ABCDEFGH';

const COMPOUND = /développé|developpe|couché|rowing|tirage|traction|presse|squat|soulevé|dips|chest press|militaire/i;
export const defaultRest = (name) => (COMPOUND.test(name) ? 120 : 90);

// Turns the last session with this title into a routine (sets and reps, no loads:
// loads are taken from the last time when the routine is started).
export function routineFromHistory(data, title) {
  const tpl = templateFor(data, title);
  const groups = new Map();
  return {
    name: title,
    exercises: tpl.map((t) => {
      const sid = t.sets.find((s) => s.superset_id != null)?.superset_id;
      if (sid != null && !groups.has(sid)) groups.set(sid, LETTERS[groups.size % LETTERS.length]);
      return {
        name: t.name,
        rest: defaultRest(t.name),
        superset: sid != null ? groups.get(sid) : null,
        sets: t.sets.map((s) => ({ type: s.set_type || 'normal', reps: s.reps ?? null, kg: null })),
      };
    }),
  };
}

// Supersets keep only groups with at least two exercises.
export function cleanSupersets(exercises) {
  const count = new Map();
  for (const e of exercises) if (e.superset) count.set(e.superset, (count.get(e.superset) || 0) + 1);
  return exercises.map((e) => (e.superset && count.get(e.superset) < 2 ? { ...e, superset: null } : e));
}

export function nextLetter(exercises) {
  const used = new Set(exercises.map((e) => e.superset).filter(Boolean));
  return [...LETTERS].find((l) => !used.has(l)) || 'A';
}

// The link between exercise i and the one after it: joins them into one superset,
// or, if they are already linked, splits the superset at that point.
export function toggleSuperset(exercises, i) {
  const ex = exercises[i];
  const nx = exercises[i + 1];
  if (!nx) return exercises;
  if (ex.superset && nx.superset === ex.superset) {
    const letter = ex.superset;
    const fresh = nextLetter(exercises);
    return cleanSupersets(exercises.map((e, j) => (j > i && e.superset === letter ? { ...e, superset: fresh } : e)));
  }
  const letter = ex.superset || nx.superset || nextLetter(exercises);
  const old = nx.superset;
  return cleanSupersets(exercises.map((e, j) => (j === i || j === i + 1 || (old && e.superset === old) ? { ...e, superset: letter } : e)));
}

export const SUPERSET_COLORS = { A: '#5AC8FA', B: '#FF8A3D', C: '#B38CFF', D: '#F5C04A', E: '#FF6B9A', F: '#7EE0B5', G: '#5AC8FA', H: '#FF8A3D' };
