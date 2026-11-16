// Reads an Apple Exercice run summary on the device (no server, no API key):
// the screenshot is cleaned up, read by Tesseract, then the numbers are picked out by their units.

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const MONTH_RE = /(\d{1,2})\s*(janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c)/i;
const numFr = (t) => Number(String(t).replace(/\s/g, '').replace(',', '.'));

export function parseRunText(raw, now = new Date()) {
  const text = String(raw || '').replace(/[’`´]/g, "'").replace(/[|]/g, ' ');
  const out = { distance_km: null, duration_s: null, avg_hr: null, calories: null, done_at: null };

  const dist = text.match(/(?<![\d/])(\d{1,3}[.,]\d{1,2})\s*KM\b/i);
  if (dist) out.distance_km = numFr(dist[1]);

  const dur = text.match(/(?<![\d:])(\d{1,2}):([0-5]\d):([0-5]\d)(?![\d:])/);
  if (dur) out.duration_s = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);
  else {
    const labelled = text.match(/(?:dur[ée]e|temps)[^\n\d]{0,30}\n?\s*(\d{1,2}):([0-5]\d)(?!\s*[-–—:])/i);
    if (labelled) out.duration_s = Number(labelled[1]) * 60 + Number(labelled[2]);
  }

  const hrs = [...text.matchAll(/(\d{2,3})\s*BPM/gi)].map((m) => Number(m[1])).filter((n) => n >= 60 && n <= 220);
  if (hrs.length) out.avg_hr = hrs[0];

  const cal = text.match(/(\d{1,2}[\s.]?\d{3}|\d{2,4})\s*K?CAL/i);
  if (cal) out.calories = numFr(cal[1].replace('.', ''));

  const range = text.match(/(?<!\d)([01]?\d|2[0-3])[:h]([0-5]\d)\s*[-–—]\s*(?:[01]?\d|2[0-3])[:h][0-5]\d/);
  const date = text.match(MONTH_RE);
  if (range || date) {
    const d = new Date(now);
    if (date) {
      const key = date[2].toLowerCase().replace('fevr', 'févr').replace('aout', 'août').replace('dec', 'déc');
      const m = MONTHS.indexOf(key);
      if (m >= 0) { d.setMonth(m, Number(date[1])); if (d > now && d - now > 86400000) d.setFullYear(d.getFullYear() - 1); }
    }
    if (range) d.setHours(Number(range[1]), Number(range[2]), 0, 0);
    out.done_at = d.toISOString();
  }
  out.found = ['distance_km', 'duration_s', 'avg_hr', 'calories'].filter((k) => out[k] != null).length;
  return out;
}

// Apple's summary is coloured text on black: turn it into dark text on white, enlarged, which Tesseract reads far better.
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(2.5, Math.max(1, 1800 / bmp.width));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const px = img.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 16) sum += Math.max(px[i], px[i + 1], px[i + 2]);
  const dark = sum / (px.length / 16) < 110;
  for (let i = 0; i < px.length; i += 4) {
    let v = Math.max(px[i], px[i + 1], px[i + 2]);
    if (!dark) v = 255 - (255 - Math.min(px[i], px[i + 1], px[i + 2]));
    const ink = dark ? v : 255 - v;
    const o = ink > 95 ? 0 : ink > 55 ? 255 - ink * 2 : 255;
    px[i] = px[i + 1] = px[i + 2] = o;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function readRunScreenshot(file) {
  const [{ createWorker }, canvas] = await Promise.all([import('tesseract.js'), prepare(file)]);
  const worker = await createWorker('fra', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', gzip: true });
  try {
    const { data } = await worker.recognize(canvas);
    return { ...parseRunText(data.text), text: data.text };
  } finally {
    await worker.terminate();
  }
}
