/**
 * Package-wide contract: every public function either returns or throws a MetadataHardeningError,
 * for any runtime values a caller could pass, and no error message contains caller data.
 * Seeded, so a failure reproduces.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as mh from './index.js';
import { seededRng } from './testutil.testutil.js';

const SENTINEL = 'sentinel-secret-7f3a';
const HOSTILE_STRINGS = [
  SENTINEL,
  `https://${SENTINEL}.example/?k=${SENTINEL}#${SENTINEL}`,
  `https://user:${SENTINEL}@rpc.example/${SENTINEL}`,
  `${SENTINEL}\n${SENTINEL}`,
  `0x${SENTINEL}`,
  `<a target="_blank" title="${SENTINEL}">`,
  `MH-${SENTINEL}`,
  '',
  '0x',
  '__proto__',
  'constructor',
  'mask:3',
  'full',
  'https://a.example',
  '0x1111111111111111111111111111111111111111',
];
const NUMBERS = [0, 1, -1, 1.5, 31337, 11155111, 84532, 1000, 3600, 2 ** 32, 2 ** 53, Number.MAX_SAFE_INTEGER, NaN, Infinity];
const BIGINTS = [0n, 1n, 5n, 546n, 10n ** 18n, (1n << 64n) + 1n, (1n << 256n) - 1n, 1n << 256n, -1n];
const KEYS = [
  'chainId', 'network', 'nowMs', 'windowSec', 'gridSec', 'bucket', 'headroomBps', 'maxSlippageBps', 'amountPolicyMode', 'sigFigs', 'maxBps',
  'wantedFrom', 'head', 'grid', 'maxRequests', 'windowSize', 'maxExtraGrids', 'enabled', 'tagMode', 'scan', 'query', 'address', 'topics', 'kind',
  'token', 'announcer', 'routerAddress', 'stealthAddress', 'asset', 'amount', 'ephemeralPublicKey', 'metadata', 'signerMode', 'rbf',
  'acknowledgeUnusual', 'inputTotalSats', 'amountSats', 'feeSats', 'changeAddress', 'inputAddresses', 'extraSchemeId', 'unsafeFingerprintScheme',
  'id', 'deadlineSec', 'pad', 'txid', 'vout', 'scriptPubKey', 'global', 'inputs', 'outputs', 'keyType', 'key', 'value', 'rounding', 'noise',
];

const leaf = fc.oneof(
  fc.constantFrom(...HOSTILE_STRINGS),
  fc.string({ maxLength: 40 }),
  fc.constantFrom(...NUMBERS),
  fc.constantFrom(...BIGINTS),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.uint8Array({ maxLength: 70 }),
  fc.constantFrom(Symbol('s'), () => 1),
);
const value: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  v: fc.oneof(
    { depthSize: 'small', maxDepth: 3 },
    leaf,
    fc.array(tie('v'), { maxLength: 4 }),
    fc.dictionary(fc.constantFrom(...KEYS), tie('v'), { maxKeys: 8 }),
  ),
})).v;
const args = fc.array(value, { minLength: 0, maxLength: 4 });

const CLASSES = new Set(['MetadataHardeningError', 'RelayerPinning']);
const functions = Object.entries(mh).filter(([name, fn]) => typeof fn === 'function' && !CLASSES.has(name)) as [string, (...a: unknown[]) => unknown][];

function check(name: string, run: () => unknown): void {
  try {
    run();
  } catch (e) {
    if (!(e instanceof mh.MetadataHardeningError)) {
      throw new Error(`${name} leaked ${Object.prototype.toString.call(e)}: ${e instanceof Error ? e.message : 'non-error'}`, { cause: e });
    }
    expect(e.message, `${name} message must not echo caller data`).not.toContain(SENTINEL);
    expect(e.message).not.toMatch(/[\n\r]/);
  }
}

describe('contract: public functions fail only with MetadataHardeningError and never echo input', () => {
  it('exports the expected number of functions (guards this test against silently covering nothing)', () => {
    expect(functions.length).toBeGreaterThanOrEqual(55);
  });
  for (const [name, fn] of functions) {
    it(name, () => {
      fc.assert(
        fc.property(args, (a) => {
          check(name, () => fn(...a));
        }),
        { seed: 0x6d68, numRuns: 120 },
      );
    });
  }
  it('RelayerPinning: constructor and methods', () => {
    fc.assert(
      fc.property(value, value, value, (urls, id, confirm) => {
        check('RelayerPinning', () => {
          const p = new mh.RelayerPinning(urls as string[], seededRng(1));
          p.assign(id as string);
          p.failover(id as string, confirm as boolean);
          p.release(id as string);
        });
        const p = new mh.RelayerPinning(['https://a.example', 'https://b.example'], seededRng(2));
        check('RelayerPinning.assign', () => p.assign(id as string));
        check('RelayerPinning.failover', () => p.failover(id as string, confirm as boolean));
        check('RelayerPinning.release', () => p.release(id as string));
      }),
      { seed: 0x6d68, numRuns: 200 },
    );
  });
});
