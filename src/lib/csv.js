import Papa from 'papaparse';

const MONTHS = {
  'janv.': 1, janv: 1, jan: 1, 'févr.': 2, févr: 2, fevr: 2, feb: 2, mars: 3, mar: 3,
  'avr.': 4, avr: 4, apr: 4, mai: 5, may: 5, juin: 6, jun: 6, 'juil.': 7, juil: 7, jul: 7,
  août: 8, aout: 8, aug: 8, 'sept.': 9, sept: 9, sep: 9, 'oct.': 10, oct: 10,
  'nov.': 11, nov: 11, 'déc.': 12, déc: 12, dec: 12,
};

// Hevy exports dates like "14 nov. 2026, 09:43" (French) or "14 Nov 2026, 09:43".
export function parseHevyDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2}) (\S+) (\d{4}),? (\d{1,2}):(\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return new Date(Number(m[3]), month - 1, Number(m[1]), Number(m[4]), Number(m[5]));
}

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

// Returns [{ title, started_at, ended_at, sets: [...] }]
export function parseHevyCsv(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  const byStart = new Map();
  const positions = new Map();
  for (const r of data) {
    const start = parseHevyDate(r.start_time);
    if (!start || !r.exercise_title) continue;
    const key = start.toISOString();
    if (!byStart.has(key)) {
      const end = parseHevyDate(r.end_time);
      byStart.set(key, { title: r.title || 'Séance', started_at: key, ended_at: end ? end.toISOString() : null, sets: [] });
      positions.set(key, new Map());
    }
    const w = byStart.get(key);
    const pos = positions.get(key);
    if (!pos.has(r.exercise_title)) pos.set(r.exercise_title, pos.size);
    w.sets.push({
      exercise: r.exercise_title,
      position: pos.get(r.exercise_title),
      set_index: num(r.set_index) ?? 0,
      set_type: r.set_type || 'normal',
      weight_kg: num(r.weight_kg),
      reps: num(r.reps),
      distance_km: num(r.distance_km),
      duration_seconds: num(r.duration_seconds),
      rpe: num(r.rpe),
    });
  }
  return [...byStart.values()].sort((a, b) => a.started_at.localeCompare(b.started_at));
}
