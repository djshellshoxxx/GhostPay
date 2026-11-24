import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { manifestDigest, validateManifest } from '@ghostpay/chain-adapters';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeManifestJson } from './test/fakeManifest';

// The deployments README and release docs tell operators to run `npm run validate:deployments -w @ghostpay/web`.
// These tests pin that the script exists, runs the real validator, and fails closed from the command line.
const webRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = join(webRoot, 'scripts', 'validate-deployments.mjs');
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Inherited env without release keys or npm_* lifecycle variables, so each case sets exactly what it tests. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === 'GHOSTPAY_RELEASE_PUBKEYS' || k.toLowerCase().startsWith('npm_')) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** The installed @ghostpay/chain-adapters the validator imports (hoisted to the workspace root by npm). */
function chainAdaptersDir(): string {
  for (const base of [join(webRoot, 'node_modules'), resolve(webRoot, '../../node_modules')]) {
    const p = join(base, '@ghostpay', 'chain-adapters');
    if (existsSync(p)) return realpathSync(p);
  }
  throw new Error('@ghostpay/chain-adapters is not installed');
}

/**
 * The CLI always validates `<script dir>/../deployments`, so fail-closed cases run a byte-identical copy of the
 * validator in a temporary tree (scripts/, deployments/, node_modules/@ghostpay/chain-adapters -> installed package)
 * instead of writing into the real apps/web/deployments directory.
 */
function sandbox(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gp-validate-cli-'));
  dirs.push(root);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'deployments'));
  mkdirSync(join(root, 'node_modules', '@ghostpay'), { recursive: true });
  copyFileSync(scriptPath, join(root, 'scripts', 'validate-deployments.mjs'));
  symlinkSync(chainAdaptersDir(), join(root, 'node_modules', '@ghostpay', 'chain-adapters'), 'dir');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'deployments', name), text);
  return root;
}

const runCli = (root: string, env: Record<string, string> = {}): SpawnSyncReturns<string> =>
  spawnSync(process.execPath, [join(root, 'scripts', 'validate-deployments.mjs')], { cwd: root, encoding: 'utf8', env: cleanEnv(env) });

function signedManifest(sk: Uint8Array, chainId: number): string {
  const base = JSON.parse(fakeManifestJson(chainId)) as Record<string, unknown>;
  const digest = Uint8Array.from(manifestDigest(validateManifest(base, chainId)).slice(2).match(/../g) ?? [], (h) => parseInt(h, 16));
  return JSON.stringify({ ...base, signature: `0x${hex(secp256k1.sign(digest, sk, { prehash: false, lowS: true }))}` });
}

describe('npm run validate:deployments', () => {
  it('is defined and maps to the build-time validator', () => {
    const pkg = JSON.parse(readFileSync(join(webRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['validate:deployments']).toBe('node scripts/validate-deployments.mjs');
    expect(existsSync(join(webRoot, pkg.scripts['validate:deployments']!.split(' ')[1]!))).toBe(true);
  });

  it('runs against the real deployments/ directory and passes without keys only when no manifest is shipped', () => {
    const shipped = readdirSync(join(webRoot, 'deployments')).filter((n) => n !== 'README.md');
    const r = spawnSync('npm', ['run', '--silent', 'validate:deployments'], { cwd: webRoot, encoding: 'utf8', env: cleanEnv() });
    if (shipped.length === 0) {
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('deployments/: ok');
    } else {
      // A shipped manifest is never accepted without a configured release key.
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/require at least one configured release verification key/);
    }
  });

  it('fails closed from the CLI for unsigned, wrongly signed or keyless manifests and accepts a correctly signed one', () => {
    const sk = secp256k1.utils.randomSecretKey();
    const pub = hex(secp256k1.getPublicKey(sk, true));
    const otherPub = hex(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true));

    const empty = runCli(sandbox({ 'README.md': 'x' }));
    expect(empty.status, empty.stderr).toBe(0);
    expect(empty.stdout).toContain('deployments/: ok');

    const unsigned = sandbox({ '84532.json': fakeManifestJson(84532) });
    const noKey = runCli(unsigned);
    expect(noKey.status).toBe(1);
    expect(noKey.stderr).toMatch(/deployment validation FAILED[\s\S]*84532\.json: deployment manifests require at least one configured release verification key/);
    const unsignedWithKey = runCli(unsigned, { GHOSTPAY_RELEASE_PUBKEYS: pub });
    expect(unsignedWithKey.status).toBe(1);
    expect(unsignedWithKey.stderr).toMatch(/84532\.json: manifest signature is missing or invalid/);

    const signed = sandbox({ '84532.json': signedManifest(sk, 84532) });
    const wrongKey = runCli(signed, { GHOSTPAY_RELEASE_PUBKEYS: otherPub });
    expect(wrongKey.status).toBe(1);
    expect(wrongKey.stderr).toMatch(/manifest signature is missing or invalid/);
    const signedNoKey = runCli(signed);
    expect(signedNoKey.status).toBe(1);
    const ok = runCli(signed, { GHOSTPAY_RELEASE_PUBKEYS: pub });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('deployments/: ok');

    const badKey = runCli(sandbox({}), { GHOSTPAY_RELEASE_PUBKEYS: '02abc' });
    expect(badKey.status).not.toBe(0);
    expect(badKey.stderr).toMatch(/each key must be a 33-byte compressed secp256k1 public key/);

    const badName = runCli(sandbox({ 'base.json': fakeManifestJson(84532) }), { GHOSTPAY_RELEASE_PUBKEYS: pub });
    expect(badName.status).toBe(1);
    expect(badName.stderr).toMatch(/base\.json: only <chainId>\.json files/);
  });
});
