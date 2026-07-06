/**
 * Produces store-ready zips from dist/, with manifest.json at the ZIP ROOT
 * (Chrome Web Store and Firefox AMO both require this — a nested folder or the
 * GitHub source zip fails validation with "manifest.json was not found").
 *
 *   dist/semantic-memory-chrome.zip   — uses dist/manifest.json
 *   dist/semantic-memory-firefox.zip  — uses dist/manifest.firefox.json (renamed)
 *
 * Run after `npm run build`:  node scripts/package.mjs
 */
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, renameSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
// Stage outside dist/ so cpSync doesn't refuse to copy dist into a subdir of itself.
const stageRoot = resolve(root, '.package-stage');

if (!existsSync(resolve(dist, 'manifest.json'))) {
  console.error('[package] dist/manifest.json not found — run `npm run build` first.');
  process.exit(1);
}

const version = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8')).version;

/**
 * Zip the CONTENTS of `srcDir` (not the dir itself) into `zipPath` with
 * standard forward-slash entry names. Uses bsdtar (`tar`), which ships with
 * Windows 10+ and every macOS/Linux — unlike PowerShell's Compress-Archive it
 * doesn't emit backslash separators that break AMO/web-ext validation.
 */
function zipContents(srcDir, zipPath) {
  rmSync(zipPath, { force: true });
  // Pass explicit top-level names (not ".") so entries have no "./" prefix.
  const entries = readdirSync(srcDir);
  execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', srcDir, ...entries], { stdio: 'inherit' });
}

const noZips = (src) => !src.endsWith('.zip');
rmSync(stageRoot, { recursive: true, force: true });

// --- Chrome zip: dist as-is (manifest.json already correct) ---
const chromeStage = resolve(stageRoot, 'chrome');
mkdirSync(chromeStage, { recursive: true });
cpSync(dist, chromeStage, { recursive: true, filter: noZips });
rmSync(resolve(chromeStage, 'manifest.firefox.json'), { force: true });
zipContents(chromeStage, resolve(dist, 'semantic-memory-chrome.zip'));

// --- Firefox zip: swap in the Firefox manifest as manifest.json ---
const ffStage = resolve(stageRoot, 'firefox');
mkdirSync(ffStage, { recursive: true });
cpSync(dist, ffStage, { recursive: true, filter: noZips });
rmSync(resolve(ffStage, 'manifest.json'), { force: true });
renameSync(resolve(ffStage, 'manifest.firefox.json'), resolve(ffStage, 'manifest.json'));
zipContents(ffStage, resolve(dist, 'semantic-memory-firefox.zip'));

rmSync(stageRoot, { recursive: true, force: true });

console.log(`[package] v${version} → dist/semantic-memory-chrome.zip and dist/semantic-memory-firefox.zip (manifest.json at root)`);
