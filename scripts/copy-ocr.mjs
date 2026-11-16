// Copies the on-device OCR engine (Tesseract) into public/ocr so it is served from the app itself.
import { cpSync, mkdirSync } from 'node:fs';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`);
}
cpSync('node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz', `${out}/fra.traineddata.gz`);
