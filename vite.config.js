import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Version = package.json "version" (bumped at each release, see CHANGELOG in src/changelog.js).
// Build = the git commit being deployed (Vercel provides it; locally, git is asked).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = process.env.VERCEL_GIT_COMMIT_SHA || '';
if (!commit) { try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'local'; } }
const build = commit.slice(0, 7);
const builtAt = new Date().toISOString();

// Published at /version.json so a running app can tell that a newer one is online.
const versionFile = () => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, build, builtAt }) });
  },
});

export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(build),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
});
