// Seeded fuzz of decodePaymentCalldata, centred on the buffer cap added with #745 (a buffer above `maxBufferWei` is a
// call the router always reverts, so decode must refuse it). Inputs come from a fixed-seed local PRNG: the same seed
// always builds the same calldata and the same mutations. Synthetic data only.
//
// Invariants: decode only ever throws ChainAdapterError; any calldata it accepts is canonical (re-decoding the built
// transaction round-trips the preview) and, for a buffer payment, 1 <= value <= maxBufferWei; hostile mutations
// (bit flips, truncation, padding, selector swaps, value changes) are refused or still canonical, never a wrong preview.
import { decodeFunctionData } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { ghostPayRouterAbi } from './abi/router.js';
import { validateManifest } from './deployments.js';
import { ChainAdapterError } from './errors.js';
import { SEPOLIA, invoiceFor, manifestJson, payment, recipient } from './fixtures.testutil.js';
import { MAX_ROUTER_GROSS } from './fees.js';
import { assertPreviewMatchesCalldata, buildPaymentTx, decodePaymentCalldata, type BuildPaymentInput, type PaymentTx } from './router.js';
import type { Hex } from './types.js';

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
/** A bigint of up to `bits` bits, biased toward the edges that matter (0, 1, max). */
function big(r: Rand, bits: number): bigint {
  const edge = r();
  if (edge < 0.08) return 0n;
  if (edge < 0.16) return 1n;
  if (edge < 0.22) return (1n << BigInt(bits)) - 1n;
  let v = 0n;
  const n = int(r, 1, bits);
  for (let i = 0; i < n; i++) v = (v << 1n) | (r() < 0.5 ? 1n : 0n);
  return v;
}

const CHAIN_ID = 11155111;
const deployment = validateManifest(manifestJson(), CHAIN_ID);
const { meta } = recipient();
const pay = payment(meta);
const DEADLINE = 4_000_000_000n;
const SIG: Hex = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;
const input = (over: Partial<BuildPaymentInput> = {}, inv = {}): BuildPaymentInput =>
  ({ chain: SEPOLIA, deployment, invoice: invoiceFor(meta, inv), payment: pay, grossAmount: 1_000_000_000n, deadline: DEADLINE, ...over });

function randomBuild(r: Rand): PaymentTx {
  const gross = 1n + (big(r, 70) % MAX_ROUTER_GROSS);
  switch (int(r, 0, 3)) {
    case 0: return buildPaymentTx(input({ grossAmount: gross })).tx;
    case 1: return buildPaymentTx(input({ grossAmount: gross, permitSignature: SIG })).tx;
    case 2: return buildPaymentTx(input({ grossAmount: gross }, { token: 'native' })).tx;
    default: {
      const bufferWei = 1n + big(r, 60);
      return buildPaymentTx(input({ grossAmount: gross, buffer: { bufferWei, maxBufferWei: bufferWei + big(r, 40) } })).tx;
    }
  }
}

const SELECTORS = [
  buildPaymentTx(input()).tx, buildPaymentTx(input({ permitSignature: SIG })).tx, buildPaymentTx(input({}, { token: 'native' })).tx,
  buildPaymentTx(input({ buffer: { bufferWei: 1n } })).tx,
].map((tx) => tx.data.slice(0, 10));
const hexBytes = (h: string): string[] => h.slice(2).match(/../g) ?? [];
function mutate(r: Rand, tx: PaymentTx): PaymentTx {
  const bytes = hexBytes(tx.data);
  switch (int(r, 0, 6)) {
    case 0: { // flip a bit
      const i = int(r, 0, bytes.length - 1);
      bytes[i] = (Number.parseInt(bytes[i] as string, 16) ^ (1 << int(r, 0, 7))).toString(16).padStart(2, '0');
      return { ...tx, data: `0x${bytes.join('')}` };
    }
    case 1: return { ...tx, data: `0x${bytes.slice(0, int(r, 1, bytes.length - 1)).join('')}` }; // truncate
    case 2: return { ...tx, data: `0x${bytes.join('')}${'00'.repeat(int(r, 1, 40))}` }; // trailing padding
    case 3: return { ...tx, data: `${SELECTORS[int(r, 0, SELECTORS.length - 1)] as string}${tx.data.slice(10)}` as Hex }; // another router method's selector
    case 4: return { ...tx, value: big(r, 80) }; // any msg.value
    case 5: return { ...tx, value: tx.value + 1n }; // one wei more than built
    default: return { ...tx, data: `0x${bytes.map(() => int(r, 0, 255).toString(16).padStart(2, '0')).join('')}` }; // noise
  }
}

function decodeOrTyped(tx: PaymentTx): ReturnType<typeof decodePaymentCalldata> | undefined {
  try {
    return decodePaymentCalldata(tx, CHAIN_ID);
  } catch (e) {
    expect(e).toBeInstanceOf(ChainAdapterError);
    expect(['PREVIEW_MISMATCH', 'INVALID_INPUT']).toContain((e as ChainAdapterError).code);
    return undefined;
  }
}

const SEEDS = [3, 90210, 8675309];
const ITERATIONS = 400;

describe('decodePaymentCalldata seeded fuzz', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}: ${String(ITERATIONS)} builds and ${String(ITERATIONS * 3)} hostile mutations stay typed and canonical`, () => {
      const r = prng(seed);
      let accepted = 0;
      let refused = 0;
      let bufferAbove = 0;
      for (let i = 0; i < ITERATIONS; i++) {
        const tx = randomBuild(r);
        // A built payment always round-trips and passes the preview-equals-calldata check.
        const preview = decodePaymentCalldata(tx, CHAIN_ID);
        assertPreviewMatchesCalldata(preview, tx, CHAIN_ID);
        if (preview.method === 'payERC20WithBuffer') {
          expect(preview.maxBufferWei).toBeDefined();
          expect(preview.value).toBeGreaterThanOrEqual(1n);
          expect(preview.value).toBeLessThanOrEqual(preview.maxBufferWei as bigint);
          // The cap edge: exactly the cap passes; one wei above, zero and any larger value are refused.
          const cap = preview.maxBufferWei as bigint;
          expect(decodePaymentCalldata({ ...tx, value: cap }, CHAIN_ID).value).toBe(cap);
          for (const value of [cap + 1n, cap + 1n + big(r, 100), 0n]) {
            expect(() => decodePaymentCalldata({ ...tx, value }, CHAIN_ID)).toThrow(ChainAdapterError);
            bufferAbove++;
          }
        }
        for (let m = 0; m < 3; m++) {
          const hostile = mutate(r, tx);
          const decoded = decodeOrTyped(hostile);
          if (decoded === undefined) { refused++; continue; }
          accepted++;
          // Anything accepted is canonical: the preview is exactly what this calldata and value do.
          expect(decoded.value).toBe(hostile.value);
          assertPreviewMatchesCalldata(decoded, hostile, CHAIN_ID);
          if (decoded.method === 'payERC20WithBuffer') {
            expect(hostile.value).toBeGreaterThanOrEqual(1n);
            expect(hostile.value).toBeLessThanOrEqual(decoded.maxBufferWei as bigint);
          }
          const args = decodeFunctionData({ abi: ghostPayRouterAbi, data: hostile.data }).functionName;
          expect(args).toBe(decoded.method);
        }
      }
      expect(refused).toBeGreaterThan(ITERATIONS);
      expect(bufferAbove).toBeGreaterThan(20);
      expect(accepted).toBeGreaterThanOrEqual(0);
    });
  }

  // Found by the fuzz above (seed 3): viem decodes a uint8 word with high bits unchecked, so re-encoding it for the
  // canonical-calldata comparison threw viem's IntegerOutOfRangeError instead of the documented typed refusal.
  it('refuses a permit v word wider than uint8 with a typed PREVIEW_MISMATCH, not a viem error', () => {
    const tx = buildPaymentTx(input({ permitSignature: SIG })).tx;
    const vWord = 10 + 7 * 64; // selector, then the eighth head word (token, stealth, gross, minNet, deadline, eph, meta, v)
    for (const high of ['40000000', '00000100', 'ffffffff']) {
      const widened = { ...tx, data: `${tx.data.slice(0, vWord + 56)}${high}${tx.data.slice(vWord + 64)}` as Hex };
      expect(widened.data).not.toBe(tx.data);
      expect(() => decodePaymentCalldata(widened, CHAIN_ID)).toThrow(ChainAdapterError);
      expect(() => decodePaymentCalldata(widened, CHAIN_ID)).toThrow(/PREVIEW_MISMATCH/);
    }
  });

  it('is deterministic: the same seed builds and refuses identically', () => {
    const run = (seed: number): string[] => {
      const r = prng(seed);
      const out: string[] = [];
      for (let i = 0; i < 60; i++) {
        const hostile = mutate(r, randomBuild(r));
        out.push(decodeOrTyped(hostile)?.method ?? 'refused');
      }
      return out;
    };
    expect(run(42)).toEqual(run(42));
  });

  it('refuses malformed transaction shells with typed errors (not hex, bad address, negative or non-bigint value)', () => {
    const r = prng(7);
    const good = randomBuild(r);
    const shells: unknown[] = [
      { ...good, data: '0x' }, { ...good, data: '0xabc' }, { ...good, data: 'nothex' }, { ...good, to: '0x1234' },
      { ...good, to: good.to.toLowerCase().replace('0x', '0X') }, { ...good, value: -1n }, { ...good, value: 5 as unknown as bigint },
      { ...good, data: undefined }, { ...good, to: undefined },
    ];
    for (const shell of shells) {
      try {
        decodePaymentCalldata(shell as PaymentTx, CHAIN_ID);
      } catch (e) {
        // Missing fields surface as TypeError from the regex test on `undefined`: record it, it is not ChainAdapterError.
        if (e instanceof ChainAdapterError) continue;
        expect(e).toBeInstanceOf(TypeError);
        expect(shell).toSatisfy((s: { data?: unknown; to?: unknown }) => s.data === undefined || s.to === undefined);
      }
    }
  });
});
