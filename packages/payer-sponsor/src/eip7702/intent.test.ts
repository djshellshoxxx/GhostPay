import { describe, expect, it } from 'vitest';
import { zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  EIP7702_CONSTANTS,
  assertDelegateInManifest,
  buildClearingAuthorization,
  buildDelegatePayIntent,
  delegateDigest,
  delegateDomain,
  encodeDelegatePay,
  isDelegatedTo,
  type BuildDelegatePayIntentArgs,
} from './intent.js';
import { parseManifest } from '../manifest.js';
import { A } from '../vectors.testutil.js';
import { buildErc20Metadata, routerFee } from '../routerTargets.js';

const net = 1_000_000_000n - routerFee(1_000_000_000n);
const manifest = parseManifest({ deployments: [{ chainId: 31337, delegate: A.delegate }, { chainId: 84532 }] });
const base: BuildDelegatePayIntentArgs = {
  chainId: 31337,
  manifest,
  delegate: A.delegate,
  payer: A.payer,
  payerAccountNonce: 0,
  router: { kind: 'ghostpay', address: A.router },
  pay: { token: A.token, stealth: A.stealth, gross: 1_000_000_000n, minNet: net, deadline: 1n, ephemeralPubKey: `0x02${'12'.repeat(32)}`, metadata: buildErc20Metadata(1, A.token, net) },
  sponsorFee: 2_000_000n,
  sponsorFeeTo: A.sponsorFeeTo,
  deadline: 1_700_003_600n,
  nonce: 7n,
};
const code = (f: () => unknown, c: string) => expect(f).toThrowError(expect.objectContaining({ code: c }) as Error);

describe('EIP-7702 constants (EIP-7702 text)', () => {
  it('match the specification', () => {
    expect(EIP7702_CONSTANTS).toMatchObject({ SET_CODE_TX_TYPE: 4, MAGIC: 5, PER_AUTH_BASE_COST: 12500, PER_EMPTY_ACCOUNT_COST: 25000 });
  });
});

describe('buildDelegatePayIntent (PH-3-REQ-3)', () => {
  it('uses the target chain id (never 0), the supplied nonce and the manifest delegate', () => {
    const b = buildDelegatePayIntent({ ...base, payerAccountNonce: 3 });
    expect(b.authorization).toEqual({ chainId: 31337, address: A.delegate, nonce: 3 });
    expect(b.authorization.chainId).not.toBe(0);
    expect(b.typedData.domain.verifyingContract).toBe(A.payer);
    expect(b.intent.payloadHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('refuses a delegate that is not in the manifest', () => {
    code(() => buildDelegatePayIntent({ ...base, delegate: A.router }), 'MANIFEST_MISMATCH');
    code(() => buildDelegatePayIntent({ ...base, chainId: 84532, delegate: A.delegate }), 'MANIFEST_MISMATCH');
    code(() => assertDelegateInManifest(manifest, 84532, A.delegate), 'MANIFEST_MISMATCH');
    expect(() => assertDelegateInManifest(manifest, 31337, A.delegate)).not.toThrow();
  });
  it('enforces chain and argument ranges', () => {
    code(() => buildDelegatePayIntent({ ...base, chainId: 1 }), 'MAINNET_FORBIDDEN');
    expect(() => delegateDomain(1, A.payer)).toThrow();
    expect(() => buildDelegatePayIntent({ ...base, payerAccountNonce: -1 })).toThrow();
    expect(() => buildDelegatePayIntent({ ...base, payerAccountNonce: 1.5 })).toThrow();
    expect(() => buildDelegatePayIntent({ ...base, sponsorFee: -1n })).toThrow();
    expect(() => buildDelegatePayIntent({ ...base, nonce: -1n })).toThrow();
    expect(() => buildDelegatePayIntent({ ...base, deadline: 0n })).toThrow();
    expect(() => buildDelegatePayIntent({ ...base, sponsorFeeTo: zeroAddress })).toThrow();
  });
  it('the digest binds the payer address (domain) and every field', async () => {
    const d0 = delegateDigest(buildDelegatePayIntent(base).typedData);
    expect(delegateDigest(buildDelegatePayIntent({ ...base, payer: A.stealth }).typedData)).not.toBe(d0);
    expect(delegateDigest(buildDelegatePayIntent({ ...base, nonce: 8n }).typedData)).not.toBe(d0);
    const acct = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const sig = await acct.signTypedData(buildDelegatePayIntent({ ...base, payer: acct.address }).typedData);
    expect(encodeDelegatePay(buildDelegatePayIntent(base).intent, buildDelegatePayIntent(base).routerCalldata, sig)).toMatch(/^0x/);
  });
});

describe('clearing authorization and delegation designator', () => {
  it('uses the zero address, the target chain and the supplied nonce (PH-3-REQ-5)', () => {
    expect(buildClearingAuthorization({ chainId: 84532, payerAccountNonce: 4 })).toEqual({ chainId: 84532, address: zeroAddress, nonce: 4 });
    expect(() => buildClearingAuthorization({ chainId: 1, payerAccountNonce: 0 })).toThrow();
    expect(() => buildClearingAuthorization({ chainId: 31337, payerAccountNonce: -2 })).toThrow();
  });
  it('isDelegatedTo recognises 0xef0100 || address only', () => {
    expect(isDelegatedTo(`0xef0100${A.delegate.slice(2)}`, A.delegate)).toBe(true);
    expect(isDelegatedTo(`0xEF0100${A.delegate.slice(2).toUpperCase()}`, A.delegate)).toBe(true);
    expect(isDelegatedTo('0x', A.delegate)).toBe(false);
    expect(isDelegatedTo(`0xef0100${A.router.slice(2)}`, A.delegate)).toBe(false);
    expect(isDelegatedTo(`0xef0100${A.delegate.slice(2)}00`, A.delegate)).toBe(false);
  });
});
