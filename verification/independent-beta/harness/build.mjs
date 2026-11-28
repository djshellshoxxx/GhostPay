// W5 independent payment-state verifier: build the UNMODIFIED web app exactly as the repository's own Playwright
// config does (signed ephemeral fake 84532 manifest, chosen build profile), then fingerprint the output.
// Usage: node verification/independent-beta/harness/build.mjs [--profile lean|full] [--skip-build]
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const REPO = resolve(HERE, '../../..');
export const WEB = join(REPO, 'apps/web');
export const DIST = join(WEB, 'dist');

/** Paths whose content defines the candidate; everything under verification/ is the harness, not the candidate. */
export const PRODUCTION_PATHS = ['apps', 'packages', 'package.json', 'package-lock.json', 'tsconfig.base.json'];

function git(...args) {
  return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
}

/** Source identity of the candidate: HEAD plus proof that no production path differs from it. */
export function sourceIdentity() {
  const head = git('rev-parse', 'HEAD');
  // Only verification/independent-beta and the additive claim may differ from the pinned base.
  const dirty = git('status', '--porcelain', '--', ...PRODUCTION_PATHS);
  return { head, productionTreeClean: dirty === '', dirty: dirty === '' ? [] : dirty.split('\n') };
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === '.w5-build.json') continue; // the harness's own record, not part of the candidate bundle
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** sha256 over every dist file (path + content), so a result can be tied to one exact bundle. */
export function distFingerprint() {
  if (!existsSync(join(DIST, 'index.html'))) return null;
  const h = createHash('sha256');
  const files = walk(DIST);
  for (const f of files) {
    h.update(relative(DIST, f));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return { sha256: h.digest('hex'), files: files.length };
}

async function main() {
  const args = process.argv.slice(2);
  const profile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'lean';
  if (profile !== 'lean' && profile !== 'full') throw new Error(`unknown profile ${profile}`);
  const id = sourceIdentity();
  if (!id.productionTreeClean) {
    throw new Error(`refusing to build: production paths differ from HEAD:\n${id.dirty.join('\n')}`);
  }
  if (args.includes('--skip-build')) {
    // Re-fingerprint only a bundle this script built from the same production source and profile (finding 10).
    const prev = existsSync(join(DIST, '.w5-build.json')) ? JSON.parse(readFileSync(join(DIST, '.w5-build.json'), 'utf8')) : null;
    if (prev === null || prev.profile !== profile) throw new Error('refusing --skip-build: no matching build record for this profile');
    const changed = git('diff', '--name-only', prev.head, 'HEAD', '--', ...PRODUCTION_PATHS);
    if (changed !== '') throw new Error(`refusing --skip-build: production paths changed since ${prev.head}:\n${changed}`);
  }
  if (!args.includes('--skip-build')) {
    // Reuse the repository's own fixture helper (read-only import) so the bundle trusts only the ephemeral test key.
    const { prepareManifestFixture } = await import(join(WEB, 'e2e/prepare-manifest.mjs'));
    const fixture = prepareManifestFixture();
    // Whitelisted environment (audit finding 10): an inherited GP_COMMIT, GHOSTPAY_PAGES_DEV or report path must not
    // change what is built.
    const keep = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'NODE_OPTIONS', 'npm_config_cache', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'];
    const baseEnv = Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
    const r = spawnSync('npm', ['run', 'build'], {
      cwd: WEB,
      stdio: 'inherit',
      env: {
        ...baseEnv,
        GHOSTPAY_RELEASE_PUBKEYS: fixture.publicKey,
        GHOSTPAY_DEPLOYMENTS_DIR: fixture.directory,
        GHOSTPAY_LOCAL_BUILD_PROFILE: profile,
        // GP_COMMIT is deliberately NOT set: a full commit id marks a release build, which (correctly) refuses the
        // published test key. This matches apps/web/playwright.config.ts. Source identity is recorded below instead.
      },
    });
    if (r.status !== 0) throw new Error(`web build failed with status ${r.status}`);
  }
  const record = { profile, ...id, dist: distFingerprint(), builtAt: new Date().toISOString() };
  writeFileSync(join(DIST, '.w5-build.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
