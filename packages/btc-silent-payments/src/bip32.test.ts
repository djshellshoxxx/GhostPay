import { createBase58check } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { bip32Child, bip32Derive, bip32Master, HARDENED_OFFSET } from './bip32.js';
import { toHex } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { silentPaymentKeysFromSeed } from './keys.js';
import { unsafeRevealSecret } from './secret.js';
import { readVectorText } from './vectors.testutil.js';

const b58c = createBase58check(sha256);

interface ChainVector {
  readonly seed: string;
  readonly path: number[];
  readonly label: string;
  readonly key: string;
  readonly chainCode: string;
}

/** BIP-32 test vectors 1 to 4 parsed from the saved BIP text (vector 5 is invalid-key serialization). */
function parseVectors(): ChainVector[] {
  const text = readVectorText('bip-0032.mediawiki');
  const start = text.indexOf('===Test vector 1===');
  const end = text.indexOf('===Test vector 5===');
  const out: ChainVector[] = [];
  let seed = '';
  let chain: string | undefined;
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
      out.push({
        seed,
        path,
        label: chain,
        key: toHex(raw.slice(46, 78)),
        chainCode: toHex(raw.slice(13, 45)),
      });
      chain = undefined;
    }
  }
  return out;
}

const vectors = parseVectors();

describe('BIP-32 against the official test vectors 1-4', () => {
  it('parsed all chains', () => {
    expect(vectors).toHaveLength(6 + 6 + 2 + 3);
  });

  it.each(vectors)('seed $seed chain $label', (v) => {
    const node = bip32Derive(hexToBytes(v.seed), v.path);
    expect(toHex(unsafeRevealSecret(node.privateKey))).toBe(v.key);
    expect(toHex(node.chainCode)).toBe(v.chainCode);
  });
});

describe('BIP-352 derivation paths', () => {
  const seed = hexToBytes('000102030405060708090a0b0c0d0e0f');

  it("matches @scure/bip32 on m/352'/coin'/account'/{0',1'}/0 (differential)", () => {
    for (const [network, coin] of [
      ['mainnet', 0],
      ['testnet', 1],
    ] as const) {
      for (const account of [0, 1, 7]) {
        const root = HDKey.fromMasterSeed(seed);
        const scan = root.derive(`m/352'/${coin}'/${account}'/1'/0`).privateKey;
        const spend = root.derive(`m/352'/${coin}'/${account}'/0'/0`).privateKey;
        const keys = silentPaymentKeysFromSeed(seed, { network, account });
        expect(toHex(unsafeRevealSecret(keys.scanSecret))).toBe(toHex(scan as Uint8Array));
        expect(toHex(unsafeRevealSecret(keys.spendSecret))).toBe(toHex(spend as Uint8Array));
      }
    }
  });

  it('defaults the account to 0 and rejects bad accounts', () => {
    const a = silentPaymentKeysFromSeed(seed, { network: 'mainnet' });
    const b = silentPaymentKeysFromSeed(seed, { network: 'mainnet', account: 0 });
    expect(toHex(a.scanPublicKey)).toBe(toHex(b.scanPublicKey));
    for (const bad of [-1, 1.5, HARDENED_OFFSET, Number.NaN]) {
      expect(() => silentPaymentKeysFromSeed(seed, { network: 'mainnet', account: bad })).toThrow(
        SilentPaymentError,
      );
    }
  });

  it('scan and spend keys differ and the testnet keys differ from mainnet', () => {
    const m = silentPaymentKeysFromSeed(seed, { network: 'mainnet' });
    const t = silentPaymentKeysFromSeed(seed, { network: 'testnet' });
    expect(toHex(m.scanPublicKey)).not.toBe(toHex(m.spendPublicKey));
    expect(toHex(m.scanPublicKey)).not.toBe(toHex(t.scanPublicKey));
  });
});

describe('BIP-32 input validation', () => {
  it('rejects seeds outside 16..64 bytes and non-bytes', () => {
    for (const len of [0, 15, 65]) expect(() => bip32Master(new Uint8Array(len))).toThrow(SilentPaymentError);
    expect(() => bip32Master('seed' as unknown as Uint8Array)).toThrow(SilentPaymentError);
    expect(() => bip32Master(new Uint8Array(16))).not.toThrow();
  });

  it('rejects bad child indices', () => {
    const m = bip32Master(new Uint8Array(32).fill(1));
    for (const i of [-1, 1.5, 2 ** 32, Number.NaN])
      expect(() => bip32Child(m, i)).toThrow(SilentPaymentError);
  });
});
