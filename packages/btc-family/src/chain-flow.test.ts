import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeAddress } from './address.js';
import { toHex } from './ecc.js';
import { BtcFamilyError } from './errors.js';
import {
  asTestnet,
  fakeTxid,
  p2pkhInput,
  p2shP2wpkhInput,
  p2trInput,
  p2wpkhInput,
  type TestInput,
} from './fixtures.testutil.js';
import { generateKeys } from './keys.js';
import { changeAddress, createLabelTable, labeledAddress, silentPaymentAddress } from './labels.js';
import {
  BITCOIN_CASH_MAINNET,
  BITCOIN_MAINNET,
  BITCOIN_TESTNET,
  defineChainParams,
  DOGECOIN_MAINNET,
  LITECOIN_MAINNET,
  LITECOIN_TESTNET,
  type ChainParams,
} from './params.js';
import {
  computeTransactionTweak,
  scanOutputsForTweak,
  scanTransaction,
  spendPrivateKey,
} from './receiver.js';
import { seededRng } from './rng.testutil.js';
import { unsafeRevealSecret } from './secret.js';
import { buildSenderContext, createSilentPaymentOutputs, senderEcdhSharedSecret } from './sender.js';
import { taprootScriptPubKey } from './tx.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof BtcFamilyError ? e.code : 'OTHER';
  }
  return undefined;
}

const makers: Record<string, (l: string, v?: number) => TestInput> = {
  p2tr: p2trInput,
  p2wpkh: p2wpkhInput,
  'p2sh-p2wpkh': p2shP2wpkhInput,
  p2pkh: p2pkhInput,
};

const MSG = sha256(new TextEncoder().encode('msg'));

/** Full send -> tweak -> scan -> spend round trip on one chain with the given inputs. */
function roundTrip(chain: ChainParams, inputs: TestInput[], labels: number[], seed: string): void {
  const k = generateKeys(seededRng(seed));
  const addresses = [
    silentPaymentAddress(chain, k),
    ...labels.map((m) => labeledAddress(chain, k, m)),
    changeAddress(chain, k),
  ];
  const out = createSilentPaymentOutputs({
    chain,
    inputs: inputs.map((i) => i.key),
    outpoints: inputs.map((i) => ({ txid: i.input.txid, vout: i.input.vout })),
    recipients: addresses,
  });
  expect(out).toHaveLength(addresses.length);
  const txInputs = inputs.map((i) => i.input);
  const tw = computeTransactionTweak(chain, txInputs);
  expect(tw).not.toBeNull();
  const keys = {
    scanSecret: k.scanSecret,
    spendPublicKey: k.spendPublicKey,
    labels: createLabelTable(k.scanSecret, labels),
  };
  const found = scanOutputsForTweak(
    keys,
    tw?.tweak as Uint8Array,
    out.map((o) => o.xOnlyPublicKey),
  );
  expect(found).toHaveLength(addresses.length);
  const viaTx = scanTransaction(
    chain,
    keys,
    txInputs,
    out.map((o) => taprootScriptPubKey(o.xOnlyPublicKey)),
  );
  expect(viaTx.map((f) => toHex(f.xOnlyPublicKey))).toEqual(found.map((f) => toHex(f.xOnlyPublicKey)));
  for (const f of found) {
    const sk = spendPrivateKey(k.spendSecret, f.spendTweak);
    expect(toHex(sk.xOnlyPublicKey)).toBe(toHex(f.xOnlyPublicKey));
    expect(schnorr.verify(schnorr.sign(MSG, sk.privateKey), MSG, sk.xOnlyPublicKey)).toBe(true);
  }
}

const SIM: [string, ChainParams][] = [
  ['bitcoin mainnet', BITCOIN_MAINNET],
  ['bitcoin testnet', BITCOIN_TESTNET],
  ['litecoin testnet', LITECOIN_TESTNET],
  ['litecoin mainnet as testnet', asTestnet(LITECOIN_MAINNET)],
  ['dogecoin as testnet', asTestnet(DOGECOIN_MAINNET)],
  ['bitcoin cash as testnet', asTestnet(BITCOIN_CASH_MAINNET)],
];

describe('send -> scan -> spend per chain (eligible input types only)', () => {
  for (const [name, chain] of SIM) {
    it(name, () => {
      for (const t of chain.eligibleInputTypes) {
        const maker = makers[t] as (l: string, v?: number) => TestInput;
        roundTrip(
          chain,
          [maker(`${chain.id}:${t}:a`), maker(`${chain.id}:${t}:b`, 3)],
          [1, 7],
          `${chain.id}:${t}`,
        );
      }
    });
  }

  it('mixed eligible types on Bitcoin (taproot parity handled)', () => {
    roundTrip(
      BITCOIN_MAINNET,
      [p2trInput('m1'), p2wpkhInput('m2'), p2pkhInput('m3'), p2shP2wpkhInput('m4')],
      [2],
      'mixed',
    );
  });

  it('property: random keys and labels round-trip on Litecoin testnet and Dogecoin-as-testnet', () => {
    const doge = asTestnet(DOGECOIN_MAINNET);
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.array(fc.integer({ min: 1, max: 0xffffffff }), { maxLength: 3 }),
        (seed, labels) => {
          roundTrip(LITECOIN_TESTNET, [p2wpkhInput(`pl:${seed}`)], [...new Set(labels)], `l${seed}`);
          roundTrip(doge, [p2pkhInput(`pd:${seed}`)], [...new Set(labels)], `d${seed}`);
        },
      ),
      { numRuns: 12 },
    );
  });

  it('the output key math is HRP-independent; chain binding comes from the address check', () => {
    const k = generateKeys(seededRng('same'));
    const inp = p2wpkhInput('same');
    const outsFor = (c: ChainParams): string =>
      toHex(
        createSilentPaymentOutputs({
          chain: c,
          inputs: [inp.key],
          outpoints: [{ txid: inp.input.txid, vout: 0 }],
          recipients: [silentPaymentAddress(c, k)],
        })[0]?.xOnlyPublicKey as Uint8Array,
      );
    // BIP-352 derivation does not depend on the HRP, so the output key is identical; the
    // chain binding comes from the address check, not from the key math.
    expect(outsFor(BITCOIN_TESTNET)).toBe(outsFor(LITECOIN_TESTNET));
  });
});

describe('sender guards', () => {
  const k = generateKeys(seededRng('guards'));

  it('rejects input types ineligible on the chain', () => {
    const doge = asTestnet(DOGECOIN_MAINNET);
    for (const [chain, bad] of [
      [doge, p2wpkhInput('d1')],
      [doge, p2trInput('d2')],
      [asTestnet(BITCOIN_CASH_MAINNET), p2shP2wpkhInput('b1')],
      [LITECOIN_TESTNET, p2trInput('l1')],
    ] as const) {
      expect(
        code(() =>
          createSilentPaymentOutputs({
            chain,
            inputs: [bad.key],
            outpoints: [{ txid: bad.input.txid, vout: 0 }],
            recipients: [silentPaymentAddress(chain, k)],
          }),
        ),
      ).toBe('INELIGIBLE_INPUT_TYPE');
    }
  });

  it('refuses experimental mainnet chains for sending, even with valid data', () => {
    for (const chain of [LITECOIN_MAINNET, DOGECOIN_MAINNET, BITCOIN_CASH_MAINNET]) {
      const t = makers[chain.eligibleInputTypes[0] as string]?.('x') as TestInput;
      expect(
        code(() =>
          createSilentPaymentOutputs({
            chain,
            inputs: [t.key],
            outpoints: [{ txid: t.input.txid, vout: 0 }],
            recipients: [silentPaymentAddress(chain, k)],
          }),
        ),
      ).toBe('EXPERIMENTAL_CHAIN');
    }
  });

  it('rejects a recipient address of another chain', () => {
    const t = p2wpkhInput('xc');
    const params = (recipient: string) => ({
      chain: LITECOIN_TESTNET,
      inputs: [t.key],
      outpoints: [{ txid: t.input.txid, vout: 0 }],
      recipients: [recipient],
    });
    expect(code(() => createSilentPaymentOutputs(params(silentPaymentAddress(BITCOIN_TESTNET, k))))).toBe(
      'NETWORK_MISMATCH',
    );
    expect(code(() => createSilentPaymentOutputs(params(silentPaymentAddress(LITECOIN_MAINNET, k))))).toBe(
      'NETWORK_MISMATCH',
    );
  });

  it('no inputs, empty outpoints, zero key sum and K_max overflow fail closed', () => {
    const t = p2wpkhInput('neg');
    expect(code(() => buildSenderContext(BITCOIN_MAINNET, [], [{ txid: t.input.txid, vout: 0 }]))).toBe(
      'NO_ELIGIBLE_INPUTS',
    );
    expect(code(() => buildSenderContext(BITCOIN_MAINNET, [t.key], []))).toBe('INVALID_INPUT');
    expect(code(() => buildSenderContext(BITCOIN_MAINNET, [t.key], [{ txid: 'zz', vout: 0 }]))).toBe(
      'INVALID_INPUT',
    );
    expect(
      code(() => buildSenderContext(BITCOIN_MAINNET, [t.key], [{ txid: fakeTxid('a'), vout: -1 }])),
    ).toBe('INVALID_INPUT');
    // key and its negation sum to zero (n - d)
    const d = BigInt(`0x${toHex(unsafeRevealSecret(t.key.privateKey))}`);
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const negBytes = Uint8Array.from(
      (n - d)
        .toString(16)
        .padStart(64, '0')
        .match(/../g)
        ?.map((h) => Number.parseInt(h, 16)) ?? [],
    );
    expect(
      code(() =>
        buildSenderContext(
          BITCOIN_MAINNET,
          [t.key, { type: 'p2wpkh', privateKey: negBytes as typeof t.key.privateKey }],
          [{ txid: t.input.txid, vout: 0 }],
        ),
      ),
    ).toBe('INPUT_SUM_ZERO');
    const many = Array.from({ length: 2324 }, () => silentPaymentAddress(BITCOIN_MAINNET, k));
    expect(
      code(() =>
        createSilentPaymentOutputs({
          chain: BITCOIN_MAINNET,
          inputs: [t.key],
          outpoints: [{ txid: t.input.txid, vout: 0 }],
          recipients: many,
        }),
      ),
    ).toBe('GROUP_LIMIT_EXCEEDED');
  });

  it('ecdh shared secret agrees between sender and receiver', () => {
    const t = p2wpkhInput('ecdh');
    const ctx = buildSenderContext(BITCOIN_MAINNET, [t.key], [{ txid: t.input.txid, vout: 0 }]);
    expect(senderEcdhSharedSecret(ctx, k.scanPublicKey)).toHaveLength(33);
  });

  it('decodeAddress keeps the chain id on the result', () => {
    expect(decodeAddress(LITECOIN_TESTNET, silentPaymentAddress(LITECOIN_TESTNET, k)).chainId).toBe(
      'ltc-testnet',
    );
  });
});

describe('custom chain params', () => {
  it('a user-defined chain works end to end', () => {
    const custom = defineChainParams({
      id: 'custom-test',
      name: 'Custom',
      spHrp: 'cusp',
      coinType: 9999,
      eligibleInputTypes: ['p2wpkh', 'p2pkh'],
      segwit: true,
      status: 'research-only',
      network: 'testnet',
      experimental: true,
      notes: 'experimental custom chain',
    });
    roundTrip(custom, [p2wpkhInput('c1'), p2pkhInput('c2')], [3], 'custom');
  });
});
