import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { UserFacingError } from './errors';
import { parseSeenTx, pollReceipt } from './wallet';

const hash = `0x${'ab'.repeat(32)}` as const;
const router = '0x1111111111111111111111111111111111111111' as const;
const noSleep = async (): Promise<void> => undefined;
const hex = (bytes: number): fc.Arbitrary<string> =>
  fc.uint8Array({ minLength: bytes, maxLength: bytes }).map((b) => `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`);

/** Mostly plausible receipt fields mixed with hostile values, so both acceptance and rejection paths are reached. */
const field = (good: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> =>
  fc.oneof({ weight: 4, arbitrary: good }, { weight: 1, arbitrary: fc.anything() });
const receipt = fc.record({
  transactionHash: field(fc.oneof(fc.constant(hash), fc.constant(hash.toUpperCase().replace('0X', '0x')), hex(32))),
  status: field(fc.constantFrom('0x0', '0x1', '0x2', '0x01', '1', '0x')),
  to: field(fc.constantFrom(router, router.toUpperCase().replace('0X', '0x'), null, '0x2222222222222222222222222222222222222222')),
  blockNumber: field(fc.oneof(fc.constant('0x10'), hex(4))),
}, { requiredKeys: [] });

describe('wallet RPC answers under generated hostile input', () => {
  it('accepts a receipt only for the submitted hash with a binary status, and fails with a typed error otherwise', async () => {
    let accepted = 0;
    let rejected = 0;
    await fc.assert(fc.asyncProperty(fc.oneof({ weight: 6, arbitrary: receipt }, { weight: 1, arbitrary: fc.anything() }), async (answer) => {
      const rpc = { request: async (): Promise<unknown> => answer };
      let result: Awaited<ReturnType<typeof pollReceipt>>;
      try {
        result = await pollReceipt(rpc, hash, router, noSleep, 1);
      } catch (e) {
        expect(e).toBeInstanceOf(UserFacingError);
        rejected++;
        return;
      }
      if (answer === null) return void expect(result).toBeUndefined();
      accepted++;
      const o = answer as Record<string, unknown>;
      expect(String(o['transactionHash']).toLowerCase()).toBe(hash);
      expect(['0x0', '0x1', '0x00', '0x01']).toContain(String(o['status']).toLowerCase());
      expect(result?.status).toBe(BigInt(String(o['status'])) === 1n ? 'success' : 'reverted');
      if (o['to'] !== null && o['to'] !== undefined) expect(String(o['to']).toLowerCase()).toBe(router);
    }), { numRuns: 1500, seed: 20261124 });
    // The corpus must reach both outcomes, or the property above is vacuous.
    expect(accepted).toBeGreaterThan(20);
    expect(rejected).toBeGreaterThan(20);
  });

  it('parses a transaction answer or throws a typed error, never a raw runtime error', () => {
    fc.assert(fc.property(fc.oneof(
      fc.anything(),
      fc.record({ hash: field(hex(32)), input: field(hex(4)), data: field(hex(4)), from: field(fc.constant(router)),
        to: field(fc.constant(router)), value: field(fc.constantFrom('0x0', '0x1', '-1', 'x')), chainId: field(fc.constant('0x14a34')) },
      { requiredKeys: [] }),
    ), (answer) => {
      try {
        const seen = parseSeenTx(answer);
        if (answer === null) expect(seen).toBeUndefined();
        else expect(typeof seen?.hash === 'string' && typeof seen.input === 'string').toBe(true);
      } catch (e) {
        expect(e).toBeInstanceOf(UserFacingError);
      }
    }), { numRuns: 1500, seed: 20261125 });
  });
});
