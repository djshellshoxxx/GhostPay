// Playwright-only fixture preparation. This module is not imported by the application or release build.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { canonicalManifestJson, loadDeployment, manifestDigest, verifyObjectManifestSignature } from '@ghostpay/chain-adapters';

const TEMPLATE = fileURLToPath(new URL('./fixtures/84532.json', import.meta.url));
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Prepare a new ephemeral copy of the authored fake deployment, signed for the current structured domain. */
export function prepareManifestFixture({ templateFile = TEMPLATE, tempRoot = tmpdir() } = {}) {
  const manifest = loadDeployment(readFileSync(templateFile, 'utf8'), 84532);
  // Never turn this test helper into an arbitrary deployment-signing utility.
  if (manifest.router.toLowerCase() !== '0x1111111111111111111111111111111111111111' ||
      manifest.sweepRelayer.toLowerCase() !== '0x2222222222222222222222222222222222222222' ||
      manifest.feeRecipient.toLowerCase() !== '0x4444444444444444444444444444444444444444') {
    throw new Error('Only the authored fake Playwright deployment may be prepared.');
  }
  // Public, deterministic test material, also used in authored unit fixtures. Never use it for real funds or release trust.
  const testKey = new Uint8Array(32).fill(7);
  try {
    const publicKey = hex(secp256k1.getPublicKey(testKey, true));
    const digest = Uint8Array.from(manifestDigest(manifest).slice(2).match(/../g) ?? [], (part) => parseInt(part, 16));
    const signature = `0x${hex(secp256k1.sign(digest, testKey, { prehash: false, lowS: true }))}`;
    const output = JSON.stringify({ ...JSON.parse(canonicalManifestJson(manifest)), signature }, null, 2) + '\n';
    if (verifyObjectManifestSignature(loadDeployment(output, 84532), [publicKey]).status !== 'valid') {
      throw new Error('Prepared Playwright deployment did not verify.');
    }
    const directory = mkdtempSync(join(tempRoot, 'ghostpay-e2e-deployments-'));
    try {
      writeFileSync(join(directory, '84532.json'), output, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch (error) {
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    return { directory, publicKey };
  } finally {
    testKey.fill(0);
  }
}
