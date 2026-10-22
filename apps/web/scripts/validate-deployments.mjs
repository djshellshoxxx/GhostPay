#!/usr/bin/env node
// Build-time validation of apps/web/deployments/<chainId>.json (S3-01). The manifests are imported into the hashed bundle,
// so a malformed or mislabelled file must stop the build rather than ship. Uses the built @ghostpay/chain-adapters.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @returns {Promise<string[]>} list of problems (empty when fine) */
export async function validateDeployments(dir, releaseKeys = []) {
  const { loadDeployment, verifyManifestSignature } = await import('@ghostpay/chain-adapters');
  const problems = [];
  if (!existsSync(dir)) return problems;
  for (const name of readdirSync(dir)) {
    if (name === 'README.md') continue;
    const m = /^([1-9][0-9]{0,15})\.json$/.exec(name);
    if (m === null) {
      problems.push(`${name}: only <chainId>.json files and README.md may live in deployments/`);
      continue;
    }
    const chainId = Number(m[1]);
    try {
      const manifest = loadDeployment(readFileSync(join(dir, name), 'utf8'), chainId);
      if (releaseKeys.length > 0 && verifyManifestSignature(manifest, releaseKeys).status !== 'valid') {
        problems.push(`${name}: release keys are configured but the manifest signature is missing or invalid`);
      }
    } catch (e) {
      problems.push(`${name}: ${e instanceof Error ? e.message : 'invalid'}`);
    }
  }
  return problems;
}

export function parseReleaseKeys(text) {
  const keys = (text ?? '').split(',').map((k) => k.trim().toLowerCase()).filter((k) => k !== '');
  for (const k of keys) if (!/^(?:02|03)[0-9a-f]{64}$/.test(k)) throw new Error('GHOSTPAY_RELEASE_PUBKEYS: each key must be a 33-byte compressed secp256k1 public key (66 hex digits)');
  return keys;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL('../deployments', import.meta.url));
  const problems = await validateDeployments(dir, parseReleaseKeys(process.env.GHOSTPAY_RELEASE_PUBKEYS));
  if (problems.length > 0) {
    console.error(`deployment validation FAILED:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
  console.log('deployments/: ok');
}
