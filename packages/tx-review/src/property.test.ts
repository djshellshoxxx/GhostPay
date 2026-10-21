import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { routerFee } from '@ghostpay/chain-adapters';
import {
  CHAIN, DEST, NOW, USDC, approve, buildTx, buildTyped, directSweep, erc20Metadata, nativeMetadata, permitSig, policy, relayedSweep, routerPayment,
} from './build.testutil.js';
import { decodeTx, decodeTypedData } from './decode.js';
import { review } from './review.js';
import type { Intent } from './types.js';

const P = policy();
const addr = fc.integer({ min: 0x10000, max: 0xffffff }).map((n): `0x${string}` => `0x${n.toString(16).padStart(40, '0')}`);
const deadline = fc.integer({ min: 1, max: 3600 }).map((d) => BigInt(NOW + d));
const gross = fc.bigInt({ min: 400n, max: 10n ** 30n });
const ok = (decoded: Intent | { kind: 'unknown' }, x: Intent, gross_?: bigint): boolean =>
  review(decoded as Intent, x, P, NOW, gross_ === undefined ? {} : { paymentGross: gross_ }).ok;

describe('property: review(decode(build(x)), x) = ok for random valid x', () => {
  it('router payments', () => {
    fc.assert(
      fc.property(gross, fc.constantFrom<'payERC20' | 'payERC20WithPermit' | 'native'>('payERC20', 'payERC20WithPermit', 'native'), addr, deadline, fc.nat({ max: 255 }), fc.bigInt({ min: 0n, max: 1000n }), (g, kind, stealth, dl, tag, slack) => {
        const fee = routerFee(g);
        const net = g - fee;
        const minNet = net - (slack < net ? slack : 0n) || 1n;
        const native = kind === 'native';
        const x = routerPayment({
          method: native ? 'payNative' : kind, token: native ? 'native' : USDC, gross: g, fee, minNet, stealth, deadline: dl,
          metadata: native ? nativeMetadata(tag, net) : erc20Metadata(tag, USDC, net),
        });
        expect(ok(decodeTx(buildTx(x)), x)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
  it('approve', () => {
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), (amt) => {
      const x = approve({ amount: amt });
      expect(ok(decodeTx(buildTx(x)), x, amt)).toBe(true);
    }), { numRuns: 100 });
  });
  it('direct sweep (ERC-20 and native)', () => {
    fc.assert(fc.property(fc.boolean(), fc.bigInt({ min: 10n ** 16n, max: 10n ** 30n }), addr, fc.bigInt({ min: 1n, max: 10n ** 9n }), fc.bigInt({ min: 21_000n, max: 100_000n }), (native, amt, to, fee, gas) => {
      const x = directSweep({ token: native ? 'native' : USDC, amount: amt, to: to === DEST ? addr_(1) : to, maxFeePerGas: fee, maxPriorityFeePerGas: fee, gasLimit: gas });
      expect(ok(decodeTx(buildTx(x)), x)).toBe(true);
    }), { numRuns: 100 });
  });
  it('relayed sweep and permit typed data', () => {
    fc.assert(fc.property(fc.bigInt({ min: 100_000n, max: 10n ** 30n }), fc.bigInt({ min: 0n, max: 1000n }), fc.bigInt({ min: 0n, max: 10n ** 12n }), deadline, addr, (amt, feeSlice, nonce, dl, owner) => {
      const fee = (amt * 300n) / 10_000n > feeSlice ? feeSlice : 1n;
      const s = relayedSweep({ amount: amt, fee, nonce, deadline: dl, owner });
      expect(ok(decodeTypedData(buildTyped(s)), s)).toBe(true);
      const p = permitSig({ value: amt, nonce, deadline: dl, owner });
      expect(ok(decodeTypedData(buildTyped(p)), p)).toBe(true);
    }), { numRuns: 100 });
  });
  it('a mutated builder output never reviews ok (random byte flip in router calldata)', () => {
    fc.assert(fc.property(fc.nat({ max: 400 }), fc.integer({ min: 1, max: 255 }), (pos, xor) => {
      const x = routerPayment();
      const t = buildTx(x);
      const bytes = t.data.slice(2).match(/../g) as string[];
      const i = pos % bytes.length;
      bytes[i] = ((parseInt(bytes[i] as string, 16) ^ xor) & 0xff).toString(16).padStart(2, '0');
      const r = review(decodeTx({ ...t, data: `0x${bytes.join('')}` }), x, P, NOW);
      expect(r.ok).toBe(false);
    }), { numRuns: 200 });
  });
});

function addr_(n: number): `0x${string}` {
  return `0x${(0x20000 + n).toString(16).padStart(40, '0')}`;
}
void CHAIN;
