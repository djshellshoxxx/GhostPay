#!/usr/bin/env node
// Build-time validation of apps/web/deployments/<chainId>.json (S3-01). The manifests are imported into the hashed bundle,
// so a malformed or mislabelled file must stop the build rather than ship. Uses the built @ghostpay/chain-adapters.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @returns {Promise<string[]>} list of problems (empty when fine) */
export async function validateDeployments(dir, releaseKeys = []) {
  const { loadDeployment, verifyObjectManifestSignature } = await import('@ghostpay/chain-adapters');
  const problems = [];
  if (!existsSync(dir)) return problems;
  const names = readdirSync(dir);
  for (const name of names) {
    if (name === 'README.md') continue;
    const m = /^([1-9][0-9]{0,15})\.json$/.exec(name);
    if (m === null) {
      problems.push(`${name}: only <chainId>.json files and README.md may live in deployments/`);
      continue;
    }
    const chainId = Number(m[1]);
    try {
      const manifest = loadDeployment(readFileSync(join(dir, name), 'utf8'), chainId);
      if (releaseKeys.length === 0) {
        problems.push(`${name}: deployment manifests require at least one configured release verification key`);
        continue;
      }
      if (verifyObjectManifestSignature(manifest, releaseKeys).status !== 'valid') {
        problems.push(`${name}: manifest signature is missing or invalid for the configured release keys`);
      }
    } catch (e) {
      problems.push(`${name}: ${e instanceof Error ? e.message : 'invalid'}`);
    }
  }
  return problems;
}

/**
 * Compressed public keys whose secret keys are public (SEC-44 / E-21): the Playwright and devnet manifest-signing key
 * (secret 0x07 * 32, apps/web/e2e/prepare-manifest.mjs and e2e/devnet/prepare-devnet-manifest.mjs), the other
 * repeated-byte secrets used by unit fixtures, the default anvil/hardhat accounts and the smallest scalars. Anyone can
 * sign a manifest that one of these verifies, so a release build must never trust one.
 */
export const PUBLIC_TEST_RELEASE_KEYS = Object.freeze([
  '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f', // secret 0x01 * 32
  '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766', // secret 0x02 * 32
  '02531fe6068134503d2723133227c867ac8fa6c83c537e9a44c3c5bdbdcb1fe337', // secret 0x03 * 32
  '03462779ad4aad39514614751a71085f2f10e1c7a593e4e030efb5b8721ce55b0b', // secret 0x04 * 32
  '0362c0a046dacce86ddd0343c6d3c7c79c2208ba0d9c9cf24a6d046d21d21f90f7', // secret 0x05 * 32
  '03f006a18d5653c4edf5391ff23a61f03ff83d237e880ee61187fa9f379a028e0a', // secret 0x06 * 32
  '02989c0b76cb563971fdc9bef31ec06c3560f3249d6ee9e5d83c57625596e05f6f', // secret 0x07 * 32 (Playwright manifest key)
  '03f991f944d1e1954a7fc8b9bf62e0d78f015f4c07762d505e20e6c45260a3661b', // secret 0x08 * 32
  '0256b328b30c8bf5839e24058747879408bdb36241dc9c2e7c619faa12b2920967', // secret 0x09 * 32
  '03f76a39d05686e34a4420897e359371836145dd3973e3982568b60f8433adde6e', // secret 0x0a * 32
  '02552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84', // secret 0x0b * 32
  '030f0fb9a244ad31a369ee02b7abfbbb0bfa3812b9a39ed93346d03d67d412d177', // secret 0x0c * 32
  '022f1b310f4c065331bc0d79ba4661bb9822d67d7c4a1b0a1892e1fd0cd23aa68d', // secret 0x0d * 32
  '0299c2aa85d2b21a62f396907a802a58e521dafd5bddaccbd72786eea189bc4dc9', // secret 0x0e * 32
  '021a7a569e91dbf60581509c7fc946d1003b60c7dee85299538db6353538d59574', // secret 0x0f * 32
  '03a92c9b7cac68758de5783ed8e5123598e4ad137091e42987d3bad8a08e35bf3d', // secret 0x10 * 32
  '038318535b54105d4a7aae60c08fc45f9687181b4fdfc625bd1a753fa7397fed75', // anvil/hardhat account 0
  '02ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0', // anvil/hardhat account 1
  '039d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f04', // anvil/hardhat account 2
  '0220b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0eb', // anvil/hardhat account 3
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', // secret 1 (the generator)
  '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5', // secret 2
  '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9', // secret 3
]);

/**
 * A release build records a full commit id (scripts/release-build.sh, scripts/pages/build-pages.sh export GP_COMMIT);
 * Playwright, devnet and unit builds do not. A Pages development build (GHOSTPAY_PAGES_DEV=1) is never a release.
 */
export function isReleaseBuildEnv(env) {
  return /^[0-9a-f]{40}$/.test(env.GP_COMMIT ?? '') && env.GHOSTPAY_PAGES_DEV !== '1';
}

/**
 * Parses GHOSTPAY_RELEASE_PUBKEYS. In a production build (explicit `production`, else derived from `env`) a key from
 * PUBLIC_TEST_RELEASE_KEYS fails the build: fail closed, never silently dropped.
 */
export function parseReleaseKeys(text, options = {}) {
  const keys = (text ?? '').split(',').map((k) => k.trim().toLowerCase()).filter((k) => k !== '');
  if (keys.length > 8) throw new Error('GHOSTPAY_RELEASE_PUBKEYS: at most 8 release keys may be configured');
  for (const k of keys) if (!/^(?:02|03)[0-9a-f]{64}$/.test(k)) throw new Error('GHOSTPAY_RELEASE_PUBKEYS: each key must be a 33-byte compressed secp256k1 public key (66 hex digits)');
  const production = options.production ?? isReleaseBuildEnv(options.env ?? process.env);
  if (production && keys.some((k) => PUBLIC_TEST_RELEASE_KEYS.includes(k))) {
    throw new Error('GHOSTPAY_RELEASE_PUBKEYS: a public test key (its secret key is published) cannot verify manifests in a production build');
  }
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
