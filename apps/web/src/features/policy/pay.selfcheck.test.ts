import { buildNativeMetadata, parseMetadata } from '@ghostpay/core-crypto';
import { ghostPayPolicyRouterAbi, type Hex, type PolicyPayment } from '@ghostpay/policy-scheme';
import { bytesToHex, decodeFunctionData, encodeFunctionData } from 'viem/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEPLOYMENT, account } from './fixtures.testutil';
import { preparePolicyPayment } from './pay';

// Lets a test replace the built router call, as a faulty or hostile builder would.
const ctl = vi.hoisted(() => ({ tamper: undefined as ((built: PolicyPayment) => PolicyPayment) | undefined }));
vi.mock('@ghostpay/policy-scheme', async (importOriginal) => {
  const real = await importOriginal<typeof import('@ghostpay/policy-scheme')>();
  return {
    ...real,
    buildPolicyPaymentTx: (input: Parameters<typeof real.buildPolicyPaymentTx>[0]): PolicyPayment => {
      const built = real.buildPolicyPaymentTx(input);
      return ctl.tamper === undefined ? built : ctl.tamper(built);
    },
  };
});

const a1 = account('acct-001');
/** A valid compressed point other than the derived R (the secp256k1 generator). */
const OTHER_R: Hex = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const prepare = () => preparePolicyPayment({ metaAddress: a1.metaAddress, deployment: DEPLOYMENT, token: 'native', gross: 1_000_000n, nowSec: 1n });

/** payNative call with R or the view tag replaced; `built.metadata` follows the call, so only R and the tag differ. */
function withNative(built: PolicyPayment, change: { readonly eph?: Hex; readonly viewTag?: (tag: number) => number }): PolicyPayment {
  const d = decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: built.tx.data });
  if (d.functionName !== 'payNative') throw new Error('fixture is not payNative');
  const a = d.args;
  const meta = parseMetadata(a[5]);
  const metadata = bytesToHex(buildNativeMetadata(change.viewTag?.(meta.viewTag) ?? meta.viewTag, meta.netAmount));
  const data = encodeFunctionData({ abi: ghostPayPolicyRouterAbi, functionName: 'payNative', args: [a[0], a[1], a[2], a[3], change.eph ?? a[4], metadata] });
  return { ...built, metadata, tx: { ...built.tx, data } };
}

describe('preparePolicyPayment self-check binds R and the view tag to the derivation', () => {
  afterEach(() => { ctl.tamper = undefined; });
  it('accepts the untouched builder output', () => {
    ctl.tamper = (built) => withNative(built, {});
    expect(prepare().built.method).toBe('payNative');
  });
  it('refuses a built call with another R or view tag (same owner and policy hash)', () => {
    const changes = [{ eph: OTHER_R }, { viewTag: (tag: number) => (tag + 1) % 256 }];
    const got = changes.map((change) => {
      ctl.tamper = (built) => withNative(built, change);
      try {
        prepare();
        return 'prepared';
      } catch (e) {
        return e instanceof Error ? e.message : 'thrown';
      }
    });
    expect(got).toEqual(changes.map(() => 'The prepared payment failed its self-check. Nothing was sent.'));
  });
});
