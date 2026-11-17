import Papa from 'papaparse';
import { parseHevyDate } from './csv.js';

// Strava's account export ("Download or delete your account" > "Request your archive") is a .zip
// with an activities.csv inside. Runs are read from it; rides, swims, gym sessions are ignored.

const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "Nov 14, 2026, 7:05:12 AM" (UTC in Strava exports), or a French date, or ISO.
export function parseStravaDate(s) {
  const t = String(s || '').trim();
  const m = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?(AM|PM)?/i);
  if (m && MON[m[1].toLowerCase()] != null) {
    let h = Number(m[4]);
    if (m[7]) { const pm = m[7].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    return new Date(Date.UTC(Number(m[3]), MON[m[1].toLowerCase()], Number(m[2]), h, Number(m[5]), Number(m[6] || 0)));
  }
  return parseHevyDate(t);
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function parseStravaCsv(text) {
  const { data } = Papa.parse(text, { skipEmptyLines: true });
  if (!data.length) return [];
  const head = data[0].map((h) => String(h).trim().toLowerCase());
  const all = (name) => head.map((h, i) => (h === name ? i : -1)).filter((i) => i >= 0);
  const one = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const iDate = one('activity date', 'date de l\'activité', 'date');
  const iType = one('activity type', 'type d\'activité', 'type');
  const iName = one('activity name', 'nom de l\'activité', 'nom');
  const dists = all('distance');
  const elapsed = all('elapsed time');
  const iMoving = one('moving time');
  const iHr = one('average heart rate', 'fréquence cardiaque moyenne');
  const iCal = one('calories');
  if (iDate < 0 || iType < 0 || !dists.length) throw new Error('Ce fichier ne ressemble pas à un export Strava (activities.csv).');

  const out = [];
  for (const r of data.slice(1)) {
    const type = String(r[iType] || '');
    if (!/run|course|trail/i.test(type)) continue;
    const date = parseStravaDate(r[iDate]);
    if (!date || Number.isNaN(date.getTime())) continue;
    // The second "Distance" column is in metres; the first one is in km (or miles).
    let km = null;
    if (dists.length > 1 && num(r[dists[1]]) > 0) km = num(r[dists[1]]) / 1000;
    else if (num(r[dists[0]]) > 0) km = num(r[dists[0]]) > 200 ? num(r[dists[0]]) / 1000 : num(r[dists[0]]);
    const secs = (iMoving >= 0 && num(r[iMoving]) > 0 ? num(r[iMoving]) : null) ?? (elapsed.length ? num(r[elapsed[0]]) : null);
    if (!km || !secs) continue;
    out.push({
      done_at: date.toISOString(),
      distance_km: Math.round(km * 100) / 100,
      duration_s: Math.round(secs),
      avg_hr: iHr >= 0 && num(r[iHr]) > 0 ? Math.round(num(r[iHr])) : null,
      calories: iCal >= 0 && num(r[iCal]) > 0 ? Math.round(num(r[iCal])) : null,
      notes: iName >= 0 ? String(r[iName] || '').slice(0, 200) || null : null,
      source: 'strava',
    });
  }
  return out;
}

// Accepts the whole Strava archive (.zip) or activities.csv alone.
export async function readStravaFile(file) {
  if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /(^|\/)activities\.csv$/i.test(f.name) });
    const name = Object.keys(files)[0];
    if (!name) throw new Error('Pas de fichier activities.csv dans cette archive.');
    return parseStravaCsv(strFromU8(files[name]));
  }
  return parseStravaCsv(await file.text());
}
