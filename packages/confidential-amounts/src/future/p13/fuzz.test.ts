/**
 * P13 fuzz and differential tests. Deterministic seeds; scale with P13_FUZZ_RUNS (default 300) for long local runs.
 * Invariant for every decoder: it either returns a value that satisfies its contract or throws a P13Error. Any other
 * exception (TypeError, RangeError, SyntaxError) is a bug.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Hex } from 'viem';
import { UINT64_MAX } from '../../abi.js';
import { CleartextBackend } from '../../backends/cleartext.js';
import { CleartextLedger } from '../../backends/ledger.js';
import { FEE_RECIPIENT, NOW as LEDGER_NOW, PAYER, ROUTER, TOKEN, counterRandom, payParams } from '../../fixtures.testutil.js';
import { P13Error } from './errors.js';
import { assetDigest, decodeAssetRef, decodeConfidentialAsset } from './asset.js';
import { createAesGcmSealer, generateRecordKey } from './cipher.js';
import { buildDisclosure, disclosureDigest } from './disclosure.js';
import { CTM_ASSET, NOW, mutable, sampleInvoice, seededBytes } from './fixtures.testutil.js';
import { decideOperation, type P13Operation } from './gate.js';
import { mapInvoiceAmounts } from './invoice.js';
import { amountsFromGross, decodeRecord, encodeRecord, type ConfidentialRecordV1 } from './record.js';
import { SecretAmount, assertNoSecretAmount } from './secret.js';
import { ConfidentialRecordStore, createMemoryKv } from './store.js';
import {
  MAX_UINT256,
  confidentialGrossForNet,
  confidentialRouterSplit,
  formatDecimalUnits,
  formatDisplayAmount,
  parseDecimalUnits,
  parseDisplayAmount,
} from './units.js';

const RUNS = Number(process.env['P13_FUZZ_RUNS'] ?? 300);
const SEED = 20261125;
const cfg = { seed: SEED, numRuns: RUNS };
/** Run count for the slower (crypto / ledger) properties. */
const SLOW = Math.max(50, Math.floor(RUNS / 3));

/** Runs `fn`; returns 'ok', the P13 code, or rethrows anything that is not a P13Error (a fuzz failure). */
function outcome(fn: () => unknown): string {
  try {
    fn();
    return 'ok';
  } catch (e) {
    if (e instanceof P13Error) return e.code;
    throw e;
  }
}

async function outcomeAsync(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'ok';
  } catch (e) {
    if (e instanceof P13Error) return e.code;
    throw e;
  }
}

const NS = 'p13:fuzz:eip155-31337';
function record(gross: bigint, id = '0123456789abcdef0123456789abcdef'): ConfidentialRecordV1 {
  return {
    schema: 'ghostpay.confidential-record/v1',
    recordId: id,
    revision: 1,
    state: 'prepared',
    protocolId: 'ctm-cleartext',
    asset: CTM_ASSET,
    assetDigest: assetDigest(CTM_ASSET),
    invoiceDigest: `keccak256:${'ab'.repeat(32)}`,
    planDigest: `sha256:${'cd'.repeat(32)}`,
    feePolicy: 'seller_pays',
    amounts: amountsFromGross(gross),
    sessionEpoch: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** Arbitrary JSON-like values including hostile shapes. */
const hostile = fc.oneof(
  fc.anything({ maxDepth: 4, withBigInt: true, withNullPrototype: true, withObjectString: true, withSparseArray: true }),
  fc.jsonValue({ maxDepth: 5 }),
);

describe('fuzz: numeric parsers', () => {
  it('parseDecimalUnits: total over arbitrary strings; accepted values round-trip exactly', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 90 }), fc.string({ unit: 'binary', maxLength: 90 }), fc.bigInt({ min: -10n, max: MAX_UINT256 + 10n }).map(String)), (s) => {
        const r = outcome(() => parseDecimalUnits(s));
        if (r === 'ok') expect(formatDecimalUnits(parseDecimalUnits(s))).toBe(s);
        else expect(['P13_INVALID_AMOUNT', 'P13_AMOUNT_RANGE']).toContain(r);
      }),
      cfg,
    );
  });

  it('parseDisplayAmount: total over arbitrary strings and decimals; accepted values format back canonically', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 110 }), fc.stringMatching(/^[0-9]{1,40}(\.[0-9]{0,40})?$/)), fc.integer({ min: -2, max: 40 }), (s, d) => {
        const r = outcome(() => parseDisplayAmount(s, d));
        if (r === 'ok') {
          const v = parseDisplayAmount(s, d);
          expect(parseDisplayAmount(formatDisplayAmount(v, d), d)).toBe(v);
        } else {
          expect(['P13_INVALID_AMOUNT', 'P13_AMOUNT_RANGE', 'P13_PRECISION', 'P13_INVALID_ASSET']).toContain(r);
        }
      }),
      cfg,
    );
  });

  it('grossForNet is minimal and in range for every net in the euint64 domain', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: UINT64_MAX }), (net) => {
        const r = outcome(() => confidentialGrossForNet(net));
        if (r !== 'ok') {
          expect(r).toBe('P13_AMOUNT_RANGE');
          expect(confidentialRouterSplit(UINT64_MAX).net).toBeLessThan(net);
          return;
        }
        const g = confidentialGrossForNet(net);
        expect(g).toBeLessThanOrEqual(UINT64_MAX);
        expect(confidentialRouterSplit(g).net).toBeGreaterThanOrEqual(net);
        if (g > 1n) expect(confidentialRouterSplit(g - 1n).net).toBeLessThan(net);
      }),
      cfg,
    );
  });
});

describe('differential: P13 router preview vs the independent CleartextLedger', () => {
  it('delivered net and collected fee match confidentialRouterSplit for random gross amounts', async () => {
    await fc.assert(
      fc.asyncProperty(fc.bigInt({ min: 1n, max: 10n ** 15n }), async (gross) => {
        const ledger = new CleartextLedger(counterRandom());
        ledger.deployToken(TOKEN);
        ledger.deployRouter(ROUTER, FEE_RECIPIENT, [TOKEN]);
        ledger.wrap(TOKEN, PAYER, gross);
        const backend = new CleartextBackend(ledger);
        ledger.execute(backend.buildSetOperator({ chainId: 31337, token: TOKEN, operator: ROUTER, until: LEDGER_NOW + 600, nowSec: LEDGER_NOW }), PAYER, LEDGER_NOW);
        const params = payParams({ gross });
        const receipt = ledger.execute(await backend.buildPayCalldata(params), PAYER, LEDGER_NOW);
        const expected = confidentialRouterSplit(gross);
        expect(ledger.peek(receipt.returned as Hex)).toBe(expected.net);
        expect(ledger.balanceOf(TOKEN, params.stealth)).toBe(expected.net);
        expect(ledger.balanceOf(TOKEN, ROUTER)).toBe(expected.fee);
        expect(ledger.balanceOf(TOKEN, PAYER)).toBe(0n);
      }),
      { seed: SEED, numRuns: SLOW },
    );
  });
});

describe('fuzz: strict decoders', () => {
  it('decodeAssetRef and decodeConfidentialAsset never throw a non-P13 error on hostile input', () => {
    fc.assert(
      fc.property(hostile, (v) => {
        expect(outcome(() => decodeAssetRef(v))).not.toBe('ok');
        expect(outcome(() => decodeConfidentialAsset(v))).not.toBe('ok');
      }),
      cfg,
    );
  });

  it('single-field mutations of a valid asset are accepted only when canonical-equivalent', () => {
    const base = mutable(CTM_ASSET);
    const keys = Object.keys(base);
    fc.assert(
      fc.property(fc.constantFrom(...keys), hostile, (k, v) => {
        const o = { ...base, [k]: v };
        const r = outcome(() => decodeConfidentialAsset(o));
        if (r === 'ok') expect(assetDigest(decodeConfidentialAsset(o))).toBe(assetDigest(CTM_ASSET));
      }),
      cfg,
    );
  });

  it('decodeRecord: byte-level mutations either fail with a P13 code or decode to a canonical record', () => {
    const bytes = encodeRecord(record(15_000_037n));
    fc.assert(
      fc.property(
        fc.array(fc.record({ pos: fc.nat(bytes.length), byte: fc.integer({ min: 0, max: 255 }), op: fc.constantFrom('set', 'insert', 'delete') }), { minLength: 1, maxLength: 4 }),
        (muts) => {
          const arr = Array.from(bytes);
          for (const m of muts) {
            const p = Math.min(m.pos, arr.length);
            if (m.op === 'set' && p < arr.length) arr[p] = m.byte;
            else if (m.op === 'insert') arr.splice(p, 0, m.byte);
            else if (p < arr.length) arr.splice(p, 1);
          }
          const mutated = Uint8Array.from(arr);
          const r = outcome(() => decodeRecord(mutated));
          if (r === 'ok') {
            const rec = decodeRecord(mutated);
            expect(encodeRecord(rec)).toEqual(mutated);
            const g = rec.amounts.gross.reveal((x) => x);
            const s = confidentialRouterSplit(g);
            expect(rec.amounts.net.reveal((x) => x)).toBe(s.net);
          }
        },
      ),
      cfg,
    );
  });

  it('decodeRecord rejects arbitrary byte strings with a P13 code', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (b) => {
        expect(outcome(() => decodeRecord(b))).not.toBe('ok');
      }),
      cfg,
    );
  });
});

describe('fuzz: gate', () => {
  const ops: P13Operation[] = ['inspect', 'export', 'recover', 'prepare', 'review', 'authorize', 'sign', 'submit', 'wrap', 'unwrap', 'decrypt', 'transfer'];
  const consent = disclosureDigest(buildDisclosure('ctm-cleartext'));
  const exact = { enabled: true, protocolId: 'ctm-cleartext', allowFixture: true, consentDigest: consent };

  it('never allows settlement, and allows local work only for the exact fixture configuration on 31337', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ops),
        fc.oneof(hostile, fc.record({ enabled: fc.boolean(), protocolId: fc.oneof(fc.constantFrom('ctm-cleartext', 'ct1-zama', 'ct2-fhenix'), fc.string()), allowFixture: fc.boolean(), consentDigest: fc.oneof(fc.constant(consent), fc.string()) }, { requiredKeys: [] }), fc.constant(exact)),
        fc.oneof(fc.constantFrom(31337, 11155111, 1, 0, -1), fc.integer()),
        (op, config, chainId) => {
          const r = decideOperation(op, config, chainId);
          if (['authorize', 'sign', 'submit', 'wrap', 'unwrap', 'decrypt', 'transfer'].includes(op)) expect(r.ok).toBe(false);
          if (r.ok && r.value.mode === 'local') {
            expect(chainId).toBe(31337);
            expect(config).toEqual(exact);
          }
          if (['inspect', 'export', 'recover'].includes(op)) expect(r).toEqual({ ok: true, value: { mode: 'read-only' } });
        },
      ),
      cfg,
    );
  });
});

describe('fuzz: secret scanner', () => {
  it('finds a SecretAmount hidden at any depth up to the bound, and never throws a non-P13 error', () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 4 }), fc.integer({ min: 0, max: 6 }), fc.boolean(), (base, depth, inject) => {
        let v: unknown = inject ? SecretAmount.from(5n) : null;
        for (let i = 0; i < depth; i++) v = i % 2 === 0 ? [v] : { k: v };
        const payload = { base, v };
        const r = outcome(() => assertNoSecretAmount(payload));
        if (inject) expect(r).toBe('P13_SECRET_SERIALIZE');
        else expect(['ok', 'P13_RECORD_LIMIT', 'P13_SECRET_SERIALIZE']).toContain(r);
      }),
      cfg,
    );
  });
});

describe('fuzz: invoice mapping', () => {
  it('accepted invoices satisfy the fee-policy relations; refusals carry P13 codes', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: (UINT64_MAX + 5n) * 10n ** 12n }), fc.constantFrom<'payer_pays' | 'seller_pays'>('payer_pays', 'seller_pays'), (amount, feePolicy) => {
        const inv = sampleInvoice({ amountPolicy: { mode: 'fixed_token', tokenAmount: amount.toString() }, feePolicy });
        const r = outcome(() => mapInvoiceAmounts(inv, CTM_ASSET, NOW));
        if (r !== 'ok') {
          expect(['P13_PRECISION', 'P13_AMOUNT_RANGE']).toContain(r);
          return;
        }
        const m = mapInvoiceAmounts(inv, CTM_ASSET, NOW);
        const conf = amount / 10n ** 12n;
        const gross = m.amounts.gross.reveal((x) => x);
        const net = m.amounts.net.reveal((x) => x);
        expect(amount % 10n ** 12n).toBe(0n);
        if (feePolicy === 'seller_pays') expect(gross).toBe(conf);
        else expect(net).toBeGreaterThanOrEqual(conf);
        expect(gross - net).toBe(m.amounts.fee.reveal((x) => x));
      }),
      { seed: SEED, numRuns: SLOW },
    );
  });
});

describe('fuzz: encrypted store', () => {
  it('any mutation of a stored envelope is detected; the original record is never silently altered', async () => {
    const kv = createMemoryKv();
    const store = new ConfidentialRecordStore(kv, createAesGcmSealer(await generateRecordKey(), { subtle: globalThis.crypto.subtle, rng: seededBytes(3) }), NS);
    await store.create(record(15_000_037n));
    const key = `${NS}/${record(1n).recordId}`;
    const original = kv.raw.get(key) ?? new Uint8Array();
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ pos: fc.nat(original.length - 1), xor: fc.integer({ min: 1, max: 255 }) }), { minLength: 1, maxLength: 3 }),
        fc.option(fc.nat(original.length), { nil: undefined }),
        async (flips, truncate) => {
          const bad = Uint8Array.from(original);
          for (const f of flips) bad[f.pos] = (bad[f.pos] ?? 0) ^ f.xor;
          const env = truncate === undefined ? bad : bad.subarray(0, truncate);
          kv.raw.set(key, env);
          const r = await outcomeAsync(() => store.load(record(1n).recordId));
          expect(['P13_RECORD_AUTH', 'P13_RECORD_INVALID', 'P13_RECORD_ROLLBACK']).toContain(r);
        },
      ),
      { seed: SEED, numRuns: SLOW },
    );
    kv.raw.set(key, original);
    expect((await store.load(record(1n).recordId))?.amounts.gross.reveal((x) => x)).toBe(15_000_037n);
  });

  it('importBackup on hostile input fails with a P13 code and writes nothing', async () => {
    const kv = createMemoryKv();
    const store = new ConfidentialRecordStore(kv, createAesGcmSealer(await generateRecordKey()), NS);
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          hostile,
          fc.record({ schema: fc.constant('ghostpay.confidential-backup/v1'), namespace: fc.constant(NS), records: fc.array(fc.oneof(fc.base64String({ maxLength: 200 }), fc.string({ maxLength: 50 }), hostile), { maxLength: 5 }) }),
        ),
        async (v) => {
          const r = await outcomeAsync(() => store.importBackup(v));
          if (r === 'ok') {
            // Only an empty record list can succeed against an empty store with this key.
            expect((v as { records?: unknown[] }).records).toEqual([]);
          }
          expect(kv.raw.size).toBe(0);
        },
      ),
      { seed: SEED, numRuns: SLOW },
    );
  });
});
