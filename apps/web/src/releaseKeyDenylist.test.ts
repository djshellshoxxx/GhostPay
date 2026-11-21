import { secp256k1 } from '@noble/curves/secp256k1.js';
import { describe, expect, it } from 'vitest';
import { PUBLIC_TEST_RELEASE_KEYS, isReleaseBuildEnv, parseReleaseKeys } from '../scripts/validate-deployments.mjs';
import { prepareManifestFixture } from '../e2e/prepare-manifest.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const COMMIT = 'a'.repeat(40);

// SEC-44 / E-21: the Playwright manifest-signing key (0x07 * 32) is public; a release build must never trust it.
describe('release key denylist (SEC-44)', () => {
  const playwrightKey = hex(secp256k1.getPublicKey(new Uint8Array(32).fill(7), true));

  it('lists the public Playwright manifest key and every other derivable public test key', () => {
    expect(PUBLIC_TEST_RELEASE_KEYS).toContain(playwrightKey);
    for (let n = 1; n <= 16; n++) expect(PUBLIC_TEST_RELEASE_KEYS).toContain(hex(secp256k1.getPublicKey(new Uint8Array(32).fill(n), true)));
    for (const k of ['ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d']) {
      expect(PUBLIC_TEST_RELEASE_KEYS).toContain(hex(secp256k1.getPublicKey(Uint8Array.from(Buffer.from(k, 'hex')), true)));
    }
  });

  it('the e2e fixture key is on the denylist', () => {
    const root = mkdtempSync(join(tmpdir(), 'gp-denylist-'));
    try {
      expect(PUBLIC_TEST_RELEASE_KEYS).toContain(prepareManifestFixture({ tempRoot: root }).publicKey);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a public test key in a production build', () => {
    expect(() => parseReleaseKeys(playwrightKey, { production: true })).toThrow(/public test key/);
    expect(() => parseReleaseKeys(`02${'ab'.repeat(32)},${playwrightKey.toUpperCase()}`, { production: true })).toThrow(/public test key/);
  });

  it('keeps accepting it in test/dev builds and any other key in production', () => {
    expect(parseReleaseKeys(playwrightKey, { production: false })).toEqual([playwrightKey]);
    const k = `02${'ab'.repeat(32)}`;
    expect(parseReleaseKeys(k, { production: true })).toEqual([k]);
  });

  it('derives production from the release-build environment when not told', () => {
    expect(isReleaseBuildEnv({ GP_COMMIT: COMMIT })).toBe(true);
    expect(isReleaseBuildEnv({ GP_COMMIT: COMMIT, GHOSTPAY_PAGES_DEV: '1' })).toBe(false);
    expect(isReleaseBuildEnv({})).toBe(false);
    expect(isReleaseBuildEnv({ GP_COMMIT: 'unknown' })).toBe(false);
    expect(() => parseReleaseKeys(playwrightKey, { env: { GP_COMMIT: COMMIT } })).toThrow(/public test key/);
    expect(parseReleaseKeys(playwrightKey, { env: {} })).toEqual([playwrightKey]);
  });
});
