import { describe, expect, it } from 'vitest';
import { decodeSilentPaymentAddress } from './address.js';
import { toHex } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { generateSilentPaymentKeys } from './keys.js';
import {
  CHANGE_LABEL,
  changeAddress,
  checkLabel,
  createLabelTable,
  labeledAddress,
  labeledSpendPublicKey,
  labelTweak,
  silentPaymentAddress,
} from './labels.js';
import { seededRng } from './rng.testutil.js';
import { unsafeRevealSecret } from './secret.js';

const keys = generateSilentPaymentKeys(seededRng('labels'));

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('labels', () => {
  it('B_m = B_spend + label*G, scan key unchanged, deterministic, distinct per index', () => {
    const a1 = decodeSilentPaymentAddress(labeledAddress(keys, 'mainnet', 1));
    const a2 = decodeSilentPaymentAddress(labeledAddress(keys, 'mainnet', 2));
    expect(toHex(a1.scanPublicKey)).toBe(toHex(keys.scanPublicKey));
    expect(toHex(a1.spendPublicKey)).not.toBe(toHex(keys.spendPublicKey));
    expect(toHex(a1.spendPublicKey)).not.toBe(toHex(a2.spendPublicKey));
    expect(toHex(a1.spendPublicKey)).toBe(
      toHex(labeledSpendPublicKey(keys.spendPublicKey, keys.scanSecret, 1)),
    );
  });

  it('m = 0 is reserved: only changeAddress may use it', () => {
    expect(CHANGE_LABEL).toBe(0);
    expect(code(() => labeledAddress(keys, 'mainnet', 0))).toBe('RESERVED_LABEL');
    const ch = decodeSilentPaymentAddress(changeAddress(keys, 'mainnet'));
    expect(toHex(ch.spendPublicKey)).toBe(
      toHex(labeledSpendPublicKey(keys.spendPublicKey, keys.scanSecret, 0)),
    );
    expect(changeAddress(keys, 'testnet')).toMatch(/^tsp1q/);
  });

  it('validates the label range [0, 2^32-1]', () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(code(() => checkLabel(bad))).toBe('INVALID_LABEL');
      expect(code(() => labelTweak(keys.scanSecret, bad))).toBe('INVALID_LABEL');
    }
    expect(checkLabel(0xffffffff)).toBe(0xffffffff);
    expect(labeledAddress(keys, 'mainnet', 0xffffffff)).toMatch(/^sp1q/);
  });

  it('label tweaks differ per index and per scan key', () => {
    const other = generateSilentPaymentKeys(seededRng('labels2'));
    const t = (k: typeof keys, m: number): string => toHex(unsafeRevealSecret(labelTweak(k.scanSecret, m)));
    expect(t(keys, 1)).not.toBe(t(keys, 2));
    expect(t(keys, 1)).not.toBe(t(other, 1));
    expect(t(keys, 1)).toBe(t(keys, 1));
  });

  it('the unlabeled address uses B_spend', () => {
    const a = decodeSilentPaymentAddress(silentPaymentAddress(keys, 'mainnet'));
    expect(toHex(a.spendPublicKey)).toBe(toHex(keys.spendPublicKey));
  });

  it('label table always has the change label, dedupes, and exposes lookups', () => {
    const t = createLabelTable(keys.scanSecret, [5, 5, 0, 7]);
    expect(t.entries.map((e) => e.m)).toEqual([0, 5, 7]);
    expect(t.get(5)?.m).toBe(5);
    expect(t.get(6)).toBeUndefined();
    expect(createLabelTable(keys.scanSecret).entries.map((e) => e.m)).toEqual([0]);
    expect(code(() => createLabelTable(keys.scanSecret, [-3]))).toBe('INVALID_LABEL');
  });

  it('invalid spend key arguments are rejected', () => {
    expect(code(() => labeledSpendPublicKey(new Uint8Array(33), keys.scanSecret, 1))).toBe('INVALID_POINT');
  });
});
