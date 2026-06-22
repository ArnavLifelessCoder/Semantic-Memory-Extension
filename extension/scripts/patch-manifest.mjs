/**
 * Post-build manifest patch for Firefox compatibility.
 *
 * The @crxjs/vite-plugin emits a Chrome-only manifest:
 *   - it drops the `background.scripts` key (Firefox MV3 fallback)
 *   - it never adds an add-on id (`browser_specific_settings.gecko.id`),
 *     which Firefox requires for MV3.
 *
 * This script rewrites dist/manifest.json after the build so a single zip
 * validates and installs on both Chrome and Firefox.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(__dirname, '../dist/manifest.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// 1) Firefox add-on id + data collection disclosure (both required for MV3).
manifest.browser_specific_settings = {
  gecko: {
    id: 'semantic-memory@arnav.extension',
    strict_min_version: '121.0',
    // Extension is 100% on-device and transmits no user data.
    data_collection_permissions: {
      required: ['none'],
    },
  },
};

// 2) Background scripts fallback for Firefox (Chrome uses service_worker).
const swEntry = manifest.background?.service_worker;
if (swEntry) {
  manifest.background.scripts = [swEntry];
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('[patch-manifest] dist/manifest.json patched for Firefox compatibility');
