import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Back-office (admin.kadeon.be) : une app à part, construite depuis la racine du dépôt
//   vite build --config admin/vite.config.js   ->  admin/dist
// Elle réutilise la feuille de style de Kadence, mais aucun code de l'app ne l'importe.
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
