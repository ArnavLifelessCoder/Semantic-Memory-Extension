/**
 * Post-build manifest handling for cross-browser support.
 *
 * Chrome MV3 and Firefox MV3 need slightly different manifests:
 *   - Chrome uses `background.service_worker`; a `background.scripts` key makes
 *     it warn "'background.scripts' requires manifest version of 2 or lower".
 *   - Firefox MV3 uses `background.scripts` and requires an add-on id
 *     (`browser_specific_settings.gecko.id`).
 *
 * So dist/manifest.json stays Chrome-clean (exactly what the build emitted),
 * and this script writes a Firefox variant to dist/manifest.firefox.json.
 * To package for Firefox: replace manifest.json with manifest.firefox.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');

const manifest = JSON.parse(readFileSync(resolve(distDir, 'manifest.json'), 'utf8'));

// Build the Firefox variant from the Chrome manifest.
const firefox = structuredClone(manifest);

// 1) Firefox add-on id + data collection disclosure (both required for MV3).
firefox.browser_specific_settings = {
  gecko: {
    id: 'semantic-memory@arnav.extension',
    strict_min_version: '121.0',
    // Extension is 100% on-device and transmits no user data.
    data_collection_permissions: {
      required: ['none'],
    },
  },
};

// 2) Firefox MV3 runs the background as an event page via `scripts`.
const swEntry = firefox.background?.service_worker;
if (swEntry) {
  firefox.background = { scripts: [swEntry], type: 'module' };
}

writeFileSync(resolve(distDir, 'manifest.firefox.json'), JSON.stringify(firefox, null, 2) + '\n', 'utf8');
console.log('[patch-manifest] wrote dist/manifest.firefox.json (Chrome manifest left untouched)');
