import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { PERMIT_STATES, classifyPermit, diagnoseSignedPermit, splitPermitSignature, type PermitPreflight, type PermitPreflightReader, type SignedPermitEvidence } from './permit.js';
import { PERMIT_TYPES, eip712DomainSeparator } from './sweep.js';
import type { Address, Hex } from './types.js';

const owner = privateKeyToAccount(`0x${'ab'.repeat(32)}`);
const TOKEN: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const SPENDER: Address = '0x5555555555555555555555555555555555555555';
const DOMAIN = { name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN } as const;
const NOW = 1_800_000_000n;
const VALUE = 5_000_000n;
const DEADLINE = NOW + 1200n;

async function sign(nonce: bigint, value = VALUE, deadline = DEADLINE, signer = owner): Promise<Hex> {
  return signer.signTypedData({
    domain: DOMAIN,
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: { owner: owner.address, spender: SPENDER, value, nonce, deadline },
  });
}

interface ChainState {
  allowance?: bigint;
  nonce?: bigint;
  separator?: Hex | 'revert';
  simulate?: boolean;
}

function reader(s: ChainState = {}): PermitPreflightReader & { simulated: number } {
  const r = {
    simulated: 0,
    allowance: () => Promise.resolve(s.allowance ?? 0n),
    nonce: () => Promise.resolve(s.nonce ?? 0n),
    domainSeparator: () => (s.separator === 'revert' ? Promise.reject(new Error('revert')) : Promise.resolve(s.separator ?? eip712DomainSeparator(DOMAIN))),
    ...(s.simulate === undefined
      ? {}
      : {
          simulatePermit: (): Promise<boolean> => {
            r.simulated += 1;
            return Promise.resolve(s.simulate === true);
          },
        }),
  };
  return r;
}

function input(signed?: PermitPreflight['signed'], over: Partial<PermitPreflight> = {}): PermitPreflight {
  return { token: TOKEN, permitCapable: true, owner: owner.address, spender: SPENDER, value: VALUE, domain: DOMAIN, now: NOW, ...(signed === undefined ? {} : { signed }), ...over };
}

describe('classifyPermit (spec 04 pre-flight)', () => {
  it('lists exactly the six states of the spec', () => {
    expect([...PERMIT_STATES].sort()).toEqual(['already_allowed', 'expired', 'nonce_consumed', 'ok_to_permit', 'sig_invalid', 'unsupported_token']);
  });

  it('unsupported_token: capability table says no ERC-2612, before any read', async () => {
    const r = reader({ allowance: VALUE });
    expect(await classifyPermit(input(undefined, { permitCapable: false }), r)).toBe('unsupported_token');
  });

  it('unsupported_token: DAI-style or missing DOMAIN_SEPARATOR, or no domain', async () => {
    expect(await classifyPermit(input(), reader({ separator: `0x${'11'.repeat(32)}` }))).toBe('unsupported_token');
    expect(await classifyPermit(input(), reader({ separator: 'revert' }))).toBe('unsupported_token');
    const noDomain: PermitPreflight = { token: TOKEN, permitCapable: true, owner: owner.address, spender: SPENDER, value: VALUE, now: NOW };
    expect(await classifyPermit(noDomain, reader())).toBe('unsupported_token');
    const otherContract = { ...DOMAIN, verifyingContract: SPENDER };
    expect(await classifyPermit(input(undefined, { domain: otherContract }), reader())).toBe('unsupported_token');
  });

  it('already_allowed: allowance covers the value, permit is skipped (front-run tolerated)', async () => {
    const sig = await sign(0n);
    expect(await classifyPermit(input(), reader({ allowance: VALUE }))).toBe('already_allowed');
    // Front-runner submitted our permit: nonce moved AND allowance is set -> allowance path, not an error.
    expect(await classifyPermit(input({ nonce: 0n, deadline: DEADLINE, signature: sig }), reader({ allowance: VALUE, nonce: 1n }))).toBe('already_allowed');
  });

  it('ok_to_permit: before signing, and for a valid signature over the current nonce', async () => {
    expect(await classifyPermit(input(), reader())).toBe('ok_to_permit');
    const sig = await sign(3n);
    const r = reader({ nonce: 3n, simulate: true });
    expect(await classifyPermit(input({ nonce: 3n, deadline: DEADLINE, signature: sig }), r)).toBe('ok_to_permit');
    expect(r.simulated).toBe(1);
  });

  it('expired: permit deadline not after now', async () => {
    const sig = await sign(0n, VALUE, NOW);
    expect(await classifyPermit(input({ nonce: 0n, deadline: NOW, signature: sig }), reader())).toBe('expired');
  });

  it('nonce_consumed: on-chain nonce moved past the signed one and allowance does not cover', async () => {
    const sig = await sign(0n);
    expect(await classifyPermit(input({ nonce: 0n, deadline: DEADLINE, signature: sig }), reader({ nonce: 1n, allowance: VALUE - 1n }))).toBe('nonce_consumed');
  });

  it('sig_invalid: wrong signer, future nonce, wrong value, malformed bytes, bad v, simulation revert', async () => {
    const other = privateKeyToAccount(`0x${'cd'.repeat(32)}`);
    const signed = (signature: Hex, nonce = 0n): PermitPreflight['signed'] => ({ nonce, deadline: DEADLINE, signature });
    expect(await classifyPermit(input(signed(await sign(0n, VALUE, DEADLINE, other))), reader())).toBe('sig_invalid');
    expect(await classifyPermit(input(signed(await sign(5n), 5n)), reader({ nonce: 4n }))).toBe('sig_invalid');
    expect(await classifyPermit(input(signed(await sign(0n, VALUE + 1n))), reader())).toBe('sig_invalid');
    expect(await classifyPermit(input(signed('0x1234')), reader())).toBe('sig_invalid');
    const good = await sign(0n);
    const badV = `${good.slice(0, 130)}1d` as Hex;
    expect(await classifyPermit(input(signed(badV)), reader())).toBe('sig_invalid');
    expect(await classifyPermit(input(signed(good)), reader({ simulate: false }))).toBe('sig_invalid');
  });

  it('propagates RPC failures on allowance/nonce reads instead of guessing a state', async () => {
    const r: PermitPreflightReader = { ...reader(), allowance: () => Promise.reject(new Error('rpc down')) };
    await expect(classifyPermit(input(), r)).rejects.toThrow(/rpc down/);
  });
});

describe('splitPermitSignature', () => {
  it('splits 65-byte signatures and normalises yParity 0/1 to v 27/28', async () => {
    const sig = await sign(0n);
    const p = splitPermitSignature(sig);
    expect(p?.r).toBe(sig.slice(0, 66));
    expect(p?.s).toBe(`0x${sig.slice(66, 130)}`);
    expect([27, 28]).toContain(p?.v);
    const zero = `${sig.slice(0, 130)}00` as Hex;
    expect(splitPermitSignature(zero)?.v).toBe(27);
    expect(splitPermitSignature('0x12')).toBeUndefined();
  });
});

describe('diagnoseSignedPermit (spec 04 relayer-side diagnosis)', () => {
  const SEP = eip712DomainSeparator(DOMAIN);
  const ev = async (nonceSigned: bigint, over: Partial<SignedPermitEvidence> = {}): Promise<SignedPermitEvidence> => {
    const parts = splitPermitSignature(await sign(nonceSigned));
    if (parts === undefined) throw new Error('bad test signature');
    return { owner: owner.address, spender: SPENDER, value: VALUE, deadline: DEADLINE, v: parts.v, r: parts.r, s: parts.s, nonce: nonceSigned, domainSeparator: SEP, ...over };
  };

  it('valid_for_current_nonce: signature over the current nonce', async () => {
    expect(await diagnoseSignedPermit(await ev(3n))).toBe('valid_for_current_nonce');
    expect(await diagnoseSignedPermit(await ev(0n))).toBe('valid_for_current_nonce');
  });

  it('normalises v 0/1 to 27/28', async () => {
    const e = await ev(2n);
    expect(await diagnoseSignedPermit({ ...e, v: e.v - 27 })).toBe('valid_for_current_nonce');
  });

  it('nonce_consumed: signed over nonce-1 (used elsewhere)', async () => {
    expect(await diagnoseSignedPermit(await ev(2n, { nonce: 3n }))).toBe('nonce_consumed');
    expect(await diagnoseSignedPermit(await ev(0n, { nonce: 1n }))).toBe('nonce_consumed');
  });

  it('sig_invalid: older consumed nonces and future nonces are not reported as consumed', async () => {
    expect(await diagnoseSignedPermit(await ev(1n, { nonce: 5n }))).toBe('sig_invalid');
    expect(await diagnoseSignedPermit(await ev(4n, { nonce: 3n }))).toBe('sig_invalid');
  });

  it('nonce 0 edge: there is no nonce-1 to check', async () => {
    expect(await diagnoseSignedPermit(await ev(5n, { nonce: 0n }))).toBe('sig_invalid');
  });

  it('sig_invalid: wrong spender, value, deadline or owner in the evidence', async () => {
    expect(await diagnoseSignedPermit(await ev(1n, { spender: TOKEN }))).toBe('sig_invalid');
    expect(await diagnoseSignedPermit(await ev(1n, { value: VALUE + 1n }))).toBe('sig_invalid');
    expect(await diagnoseSignedPermit(await ev(1n, { deadline: DEADLINE + 1n }))).toBe('sig_invalid');
    expect(await diagnoseSignedPermit(await ev(1n, { owner: SPENDER }))).toBe('sig_invalid');
  });

  it('sig_invalid: signed by someone else', async () => {
    const other = privateKeyToAccount(`0x${'cd'.repeat(32)}`);
    const parts = splitPermitSignature(await sign(1n, VALUE, DEADLINE, other));
    if (parts === undefined) throw new Error('bad');
    expect(await diagnoseSignedPermit({ ...(await ev(1n)), ...parts })).toBe('sig_invalid');
  });

  it('sig_invalid: domain separator mismatch', async () => {
    expect(await diagnoseSignedPermit(await ev(1n, { domainSeparator: `0x${'11'.repeat(32)}` }))).toBe('sig_invalid');
  });

  it('sig_invalid and never throws on malformed v/r/s and high-s', async () => {
    const e = await ev(1n);
    expect(await diagnoseSignedPermit({ ...e, v: 5 })).toBe('sig_invalid');
    expect(await diagnoseSignedPermit({ ...e, v: 29 })).toBe('sig_invalid');
    expect(await diagnoseSignedPermit({ ...e, v: 1.5 })).toBe('sig_invalid');
    expect(await diagnoseSignedPermit({ ...e, r: '0x1234' })).toBe('sig_invalid');
    expect(await diagnoseSignedPermit({ ...e, s: 'nothex' as Hex })).toBe('sig_invalid');
    expect(await diagnoseSignedPermit({ ...e, r: `0x${'00'.repeat(32)}` })).toBe('sig_invalid');
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const high: Hex = `0x${(n - BigInt(e.s)).toString(16).padStart(64, '0')}`;
    expect(await diagnoseSignedPermit({ ...e, s: high, v: e.v === 27 ? 28 : 27 })).toBe('sig_invalid');
    expect(await diagnoseSignedPermit({ ...e, s: `0x${'ff'.repeat(32)}` })).toBe('sig_invalid');
  });

  it('unsupported_token: missing nonce or domain separator', async () => {
    expect(await diagnoseSignedPermit(await ev(1n, { nonce: null }))).toBe('unsupported_token');
    expect(await diagnoseSignedPermit(await ev(1n, { domainSeparator: null }))).toBe('unsupported_token');
  });
});
