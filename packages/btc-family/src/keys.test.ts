import { bytesToNumberBE } from '@noble/curves/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { createBase58check } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { bip32Child, bip32Derive, bip32Master, HARDENED_OFFSET } from './bip32.js';
import { toHex } from './ecc.js';
import { BtcFamilyError } from './errors.js';
import { generateKeys, keysFromSecrets, keysFromSeed, publicKeyOf } from './keys.js';
import { BITCOIN_CASH_MAINNET, BITCOIN_MAINNET, BITCOIN_TESTNET, LITECOIN_MAINNET } from './params.js';
import { randomScalar, resolveRng } from './rng.js';
import { seededRng } from './rng.testutil.js';
import { secretFrom } from './fixtures.testutil.js';
import { unsafeRevealSecret } from './secret.js';
import { readVectorText } from './vectors.testutil.js';

const b58c = createBase58check(sha256);

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof BtcFamilyError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('generateKeys', () => {
  it('is deterministic for a seeded rng and yields distinct valid keys', () => {
    const a = generateKeys(seededRng('k'));
    const b = generateKeys(seededRng('k'));
    expect(toHex(a.scanPublicKey)).toBe(toHex(b.scanPublicKey));
    expect(toHex(a.scanPublicKey)).not.toBe(toHex(a.spendPublicKey));
    expect(toHex(publicKeyOf(a.scanSecret))).toBe(toHex(a.scanPublicKey));
  });

  it('works with the global CSPRNG', () => {
    const a = generateKeys();
    const b = generateKeys();
    expect(toHex(a.scanPublicKey)).not.toBe(toHex(b.scanPublicKey));
  });

  it('rejects identical scan/spend secrets and a stuck rng', () => {
    const s = secretFrom('same');
    expect(code(() => keysFromSecrets(s, s))).toBe('INVALID_SCALAR');
    const stuck = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => a };
    expect(code(() => randomScalar(stuck))).toBe('RNG_FAILURE');
    expect(code(() => generateKeys(stuck))).toBe('RNG_FAILURE');
    const fixed = {
      getRandomValues<T extends ArrayBufferView | null>(a: T): T {
        if (a !== null) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(7);
        return a;
      },
    };
    expect(code(() => generateKeys(fixed))).toBe('RNG_FAILURE');
  });

  it('reports a missing random source', () => {
    expect(code(() => resolveRng({} as never))).toBe('RNG_UNAVAILABLE');
  });
});

describe('BIP-32', () => {
  it('matches the BIP-32 test vectors 1 to 4 from the saved BIP text', () => {
    const text = readVectorText('bip-0032.mediawiki');
    const start = text.indexOf('===Test vector 1===');
    const end = text.indexOf('===Test vector 5===');
    let seed = '';
    let chain: string | undefined;
    let checked = 0;
    for (const line of text.slice(start, end).split('\n')) {
      const s = /^Seed \(hex\): ([0-9a-f]+)/.exec(line);
      if (s !== null) seed = s[1] as string;
      const c = /^\* Chain (m.*)$/.exec(line);
      if (c !== null) chain = (c[1] as string).replaceAll('<sub>H</sub>', "'");
      const k = /^\*\* ext prv: (xprv\w+)/.exec(line);
      if (k !== null && chain !== undefined) {
        const raw = b58c.decode(k[1] as string);
        const path =
          chain === 'm'
            ? []
            : chain
                .slice(2)
                .split('/')
                .map((p) =>
                  p.endsWith("'") ? Number.parseInt(p, 10) + HARDENED_OFFSET : Number.parseInt(p, 10),
                );
        const node = bip32Derive(Uint8Array.from(Buffer.from(seed, 'hex')), path);
        expect(toHex(unsafeRevealSecret(node.privateKey))).toBe(toHex(raw.slice(46, 78)));
        expect(toHex(node.chainCode)).toBe(toHex(raw.slice(13, 45)));
        checked++;
        chain = undefined;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(14);
  });

  it('rejects bad seeds and child indices', () => {
    expect(code(() => bip32Master(new Uint8Array(15)))).toBe('INVALID_SEED');
    expect(code(() => bip32Master(new Uint8Array(65)))).toBe('INVALID_SEED');
    expect(code(() => bip32Master('x' as never))).toBe('INVALID_SEED');
    const m = bip32Master(new Uint8Array(16).fill(1));
    expect(code(() => bip32Child(m, -1))).toBe('INVALID_INPUT');
    expect(code(() => bip32Child(m, 2 ** 32))).toBe('INVALID_INPUT');
    expect(bytesToNumberBE(m.privateKey)).toBeGreaterThan(0n);
  });
});

describe('keysFromSeed', () => {
  const seed = new Uint8Array(32).fill(9);

  it('is deterministic and depends on coin type and account', () => {
    const a = keysFromSeed(BITCOIN_MAINNET, seed);
    expect(toHex(keysFromSeed(BITCOIN_MAINNET, seed).scanPublicKey)).toBe(toHex(a.scanPublicKey));
    expect(toHex(keysFromSeed(BITCOIN_TESTNET, seed).scanPublicKey)).not.toBe(toHex(a.scanPublicKey));
    expect(toHex(keysFromSeed(LITECOIN_MAINNET, seed).scanPublicKey)).not.toBe(toHex(a.scanPublicKey));
    expect(toHex(keysFromSeed(BITCOIN_CASH_MAINNET, seed).spendPublicKey)).not.toBe(toHex(a.spendPublicKey));
    expect(toHex(keysFromSeed(BITCOIN_MAINNET, seed, 1).scanPublicKey)).not.toBe(toHex(a.scanPublicKey));
    expect(toHex(a.scanPublicKey)).not.toBe(toHex(a.spendPublicKey));
  });

  it('uses the BIP-352 paths m/352h/coinh/accounth/{1h,0h}/0', () => {
    const k = keysFromSeed(LITECOIN_MAINNET, seed, 3);
    const H = HARDENED_OFFSET;
    const scan = bip32Derive(seed, [352 + H, 2 + H, 3 + H, 1 + H, 0]);
    const spend = bip32Derive(seed, [352 + H, 2 + H, 3 + H, H, 0]);
    expect(toHex(unsafeRevealSecret(k.scanSecret))).toBe(toHex(unsafeRevealSecret(scan.privateKey)));
    expect(toHex(unsafeRevealSecret(k.spendSecret))).toBe(toHex(unsafeRevealSecret(spend.privateKey)));
  });

  it('rejects bad accounts and seeds', () => {
    expect(code(() => keysFromSeed(BITCOIN_MAINNET, seed, -1))).toBe('INVALID_INPUT');
    expect(code(() => keysFromSeed(BITCOIN_MAINNET, seed, HARDENED_OFFSET))).toBe('INVALID_INPUT');
    expect(code(() => keysFromSeed(BITCOIN_MAINNET, seed, 1.5))).toBe('INVALID_INPUT');
    expect(code(() => keysFromSeed(BITCOIN_MAINNET, new Uint8Array(3)))).toBe('INVALID_SEED');
  });
});
