import { bytesToNumberBE } from '@noble/curves/utils.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Mutable override: when set for a tag, taggedHash returns these bytes instead. */
const override = vi.hoisted(() => ({
  tag: undefined as string | undefined,
  value: undefined as Uint8Array | undefined,
}));

vi.mock('./ecc.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ecc.js')>();
  return {
    ...actual,
    taggedHash: (tag: string, ...msgs: Uint8Array[]): Uint8Array =>
      override.tag === tag && override.value !== undefined
        ? override.value.slice()
        : actual.taggedHash(tag, ...msgs),
  };
});

const { encodeSilentPaymentAddress } = await import('./address.js');
const { mulG, scalarBytes, taggedHash } = await import('./ecc.js');
const { SilentPaymentError } = await import('./errors.js');
const { generateSilentPaymentKeys, silentPaymentKeysFromSecrets } = await import('./keys.js');
const { createLabelTable, labelTweak } = await import('./labels.js');
const { computeTransactionTweak, scanOutputsForTweak } = await import('./receiver.js');
const { createSilentPaymentOutputs } = await import('./sender.js');
const { CURVE_ORDER, unsafeRevealSecret } = await import('./secret.js');
const { p2wpkhInput, secretFrom } = await import('./fixtures.testutil.js');
const { seededRng } = await import('./rng.testutil.js');

const keys = generateSilentPaymentKeys(seededRng('edge'));
const address = encodeSilentPaymentAddress('mainnet', keys.scanPublicKey, keys.spendPublicKey);
const tin = p2wpkhInput('edge');
const params = {
  inputs: [tin.key],
  outpoints: [{ txid: tin.input.txid, vout: tin.input.vout }],
  recipients: [address],
  network: 'mainnet' as const,
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
  return undefined;
}

afterEach(() => {
  override.tag = undefined;
  override.value = undefined;
});

const ZERO = new Uint8Array(32);
const N = scalarBytes(CURVE_ORDER);
const MAX = new Uint8Array(32).fill(0xff);

describe('invalid hash outputs fail closed (probability about 2^-128 in practice, so mocked)', () => {
  it.each([ZERO, N, MAX])('sender: input_hash that is not a valid scalar', (bad) => {
    override.tag = 'BIP0352/Inputs';
    override.value = bad;
    expect(codeOf(() => createSilentPaymentOutputs(params))).toBe('INPUT_HASH_INVALID');
  });

  it.each([ZERO, N, MAX])('sender: t_k that is not a valid scalar', (bad) => {
    override.tag = 'BIP0352/SharedSecret';
    override.value = bad;
    expect(codeOf(() => createSilentPaymentOutputs(params))).toBe('TWEAK_INVALID');
  });

  it('sender: output at infinity (t_k = -b_spend) is rejected', () => {
    override.tag = 'BIP0352/SharedSecret';
    override.value = scalarBytes(CURVE_ORDER - bytesToNumberBE(keys.spendSecret));
    expect(codeOf(() => createSilentPaymentOutputs(params))).toBe('DERIVED_KEY_INVALID');
  });

  it('receiver: input_hash that is not a valid scalar', () => {
    override.tag = 'BIP0352/Inputs';
    override.value = ZERO;
    expect(codeOf(() => computeTransactionTweak([tin.input]))).toBe('INPUT_HASH_INVALID');
  });

  it('receiver: t_k not valid / P_k at infinity / label sum zero', () => {
    const tweak = mulG(5n).toBytes(true);
    const out = [new Uint8Array(32).fill(7)];
    override.tag = 'BIP0352/SharedSecret';
    override.value = ZERO;
    expect(codeOf(() => scanOutputsForTweak(keys, tweak, out))).toBe('TWEAK_INVALID');
    override.value = scalarBytes(CURVE_ORDER - bytesToNumberBE(keys.spendSecret));
    expect(codeOf(() => scanOutputsForTweak(keys, tweak, out))).toBe('DERIVED_KEY_INVALID');
  });

  it('receiver: t_k + label = 0 is rejected when that label matches', () => {
    const table = createLabelTable(keys.scanSecret, [3]);
    const label = bytesToNumberBE(unsafeRevealSecret(labelTweak(keys.scanSecret, 3)));
    const t = CURVE_ORDER - label; // t_k + label = 0 mod n
    const pk = mulG(bytesToNumberBE(keys.spendSecret)).add(mulG(t));
    const labeled = pk.add(table.get(3)!.point);
    // labeled = B_spend + t*G + label*G = B_spend: its x is the spend key's x
    const x = labeled.toBytes(true).slice(1);
    override.tag = 'BIP0352/SharedSecret';
    override.value = scalarBytes(t);
    // Make label 3 the first label entry that matches by using a table with only label 3 (change label cannot match).
    expect(codeOf(() => scanOutputsForTweak({ ...keys, labels: table }, mulG(5n).toBytes(true), [x]))).toBe(
      'DERIVED_KEY_INVALID',
    );
  });

  it('label tweak that is not a valid scalar is rejected', () => {
    override.tag = 'BIP0352/Label';
    override.value = ZERO;
    expect(codeOf(() => labelTweak(keys.scanSecret, 1))).toBe('TWEAK_INVALID');
    override.value = N;
    expect(codeOf(() => createLabelTable(keys.scanSecret, [1]))).toBe('TWEAK_INVALID');
  });

  it('sanity: real hashing is restored after each test', () => {
    expect(taggedHash('BIP0352/Label', secretFrom('x'))).toHaveLength(32);
    expect(silentPaymentKeysFromSecrets(secretFrom('a'), secretFrom('b')).scanPublicKey).toHaveLength(33);
  });
});
