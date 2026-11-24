import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonicalize } from '@ghostpay/invoice-schema';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { reviewTeamInvitation } from './invitation';

const encoder = new TextEncoder();
const nowMs = 1_800_000_000_000;
const weekMs = 7 * 24 * 60 * 60 * 1000;
const issuer = generateKeyPairSync('ed25519');
const otherIssuer = generateKeyPairSync('ed25519');
const claims = {
  version: 1,
  teamId: 'team-1',
  capabilityId: 'cap-1',
  issuerFingerprint: 'a'.repeat(64),
  memberFingerprint: 'b'.repeat(64),
  roles: ['reconcile'],
  recordScope: ['record-1'],
  membershipEpoch: 2,
  expiresAtMs: nowMs + 60_000,
  nonce: 'nonce-1',
};
function signClaims(body = claims, key = issuer.privateKey, domain = 'ghostpay:ghostteams:capability:v1\n') {
  return sign(null, encoder.encode(domain + canonicalize(body)), key).toString('base64url');
}

const signature = signClaims();
const encode = (body: unknown = { ...claims, signature }) => encoder.encode(canonicalize(body));
const context = {
  teamId: claims.teamId,
  issuerFingerprint: claims.issuerFingerprint,
  memberFingerprint: claims.memberFingerprint,
  membershipEpoch: claims.membershipEpoch,
  nowMs,
  verifyIssuerSignature: (message: Uint8Array, signed: Uint8Array) =>
    verify(null, message, issuer.publicKey, signed),
};

describe('GhostTeams offline invitation review', () => {
  it('verifies the exact, immutable claims and omits the signature from the review', () => {
    const result = reviewTeamInvitation(encode(), context);
    expect(result).toEqual({ ok: true, value: claims });
    if (!result.ok) throw new Error('expected verified claims');
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.roles)).toBe(true);
    expect(Object.isFrozen(result.value.recordScope)).toBe(true);
  });

  it('uses the exact versioned signing message with canonical field order', () => {
    const verifyIssuerSignature = vi.fn(context.verifyIssuerSignature);
    expect(reviewTeamInvitation(encode(), { ...context, verifyIssuerSignature }).ok).toBe(true);
    const expected = 'ghostpay:ghostteams:capability:v1\n' +
      '{"capabilityId":"cap-1","expiresAtMs":1800000060000,' +
      `"issuerFingerprint":"${'a'.repeat(64)}","memberFingerprint":"${'b'.repeat(64)}",` +
      '"membershipEpoch":2,"nonce":"nonce-1","recordScope":["record-1"],' +
      '"roles":["reconcile"],"teamId":"team-1","version":1}';
    expect(verifyIssuerSignature).toHaveBeenCalledExactlyOnceWith(
      encoder.encode(expected),
      Uint8Array.from(Buffer.from(signature, 'base64url')),
    );
  });

  it.each([
    { teamId: 'team-2' },
    { issuerFingerprint: 'c'.repeat(64) },
    { memberFingerprint: 'd'.repeat(64) },
    { membershipEpoch: 3 },
    { roles: ['payout-sign'] },
    { recordScope: ['record-2'] },
    { expiresAtMs: nowMs + 120_000 },
    { nonce: 'nonce-2' },
    { capabilityId: 'cap-2' },
  ])('binds changed claims to the signature (%j)', (change) => {
    expect(reviewTeamInvitation(encode({ ...claims, ...change, signature }), { ...context, ...change }))
      .toMatchObject({ ok: false, code: 'TEAM_SIGNATURE_INVALID' });
  });

  it('rejects a valid signature from another issuer or domain', () => {
    for (const signed of [signClaims(claims, otherIssuer.privateKey), signClaims(claims, issuer.privateKey, 'other-domain\n')]) {
      expect(reviewTeamInvitation(encode({ ...claims, signature: signed }), context))
        .toMatchObject({ ok: false, code: 'TEAM_SIGNATURE_INVALID' });
    }
  });

  it('compares scope, epoch and exact expiry before calling the verifier', () => {
    const verifier = vi.fn(context.verifyIssuerSignature);
    const trusted = { ...context, verifyIssuerSignature: verifier };
    expect(reviewTeamInvitation(encode(), { ...trusted, memberFingerprint: 'd'.repeat(64) }))
      .toMatchObject({ ok: false, code: 'TEAM_SCOPE_DENIED' });
    expect(reviewTeamInvitation(encode(), { ...trusted, membershipEpoch: 3 }))
      .toMatchObject({ ok: false, code: 'TEAM_EPOCH_STALE' });
    expect(reviewTeamInvitation(encode(), { ...trusted, nowMs: claims.expiresAtMs }))
      .toMatchObject({ ok: false, code: 'TEAM_INVITE_EXPIRED' });
    expect(reviewTeamInvitation(encode(), { ...trusted, nowMs: Number.NaN }))
      .toMatchObject({ ok: false, code: 'TEAM_INVITE_INVALID' });
    expect(verifier).not.toHaveBeenCalled();
    expect(reviewTeamInvitation(encode(), { ...trusted, nowMs: claims.expiresAtMs - 1 }).ok).toBe(true);
  });

  it('accepts at most seven days remaining and 32 unique scope selectors', () => {
    const body = {
      ...claims,
      recordScope: Array.from({ length: 32 }, (_, index) => `record-${index}`),
      expiresAtMs: nowMs + weekMs,
    };
    const bytes = encode({ ...body, signature: signClaims(body) });
    expect(reviewTeamInvitation(bytes, context).ok).toBe(true);
    expect(reviewTeamInvitation(bytes, { ...context, nowMs: nowMs - 1 }))
      .toMatchObject({ ok: false, code: 'TEAM_INVITE_INVALID' });
  });

  it.each([
    { version: 2 }, { extra: true }, { nonce: 'nonce\n' }, { signature: '' }, { signature: 'AB' }, { signature: 'AA==' },
    { roles: [] }, { roles: ['owner'] }, { roles: ['reconcile', 'reconcile'] },
    { recordScope: [] }, { recordScope: ['record-1', 'record-1'] },
    { recordScope: Array.from({ length: 33 }, (_, index) => `record-${index}`) },
    { membershipEpoch: '2' }, { memberFingerprint: 'b'.repeat(63) + '\n' },
  ])('refuses malformed fields before verification (%j)', (change) => {
    const verifier = vi.fn(context.verifyIssuerSignature);
    expect(reviewTeamInvitation(encode({ ...claims, signature, ...change }), { ...context, verifyIssuerSignature: verifier }))
      .toMatchObject({ ok: false, code: 'TEAM_INVITE_INVALID' });
    expect(verifier).not.toHaveBeenCalled();
  });

  it('rejects malformed UTF-8, noncanonical JSON, duplicate fields and oversized input', () => {
    const canonical = new TextDecoder().decode(encode());
    const verifier = vi.fn(context.verifyIssuerSignature);
    const malformed = [
      new Uint8Array([0xff]), new Uint8Array(16 * 1024 + 1),
      encoder.encode(' ' + canonical), encoder.encode('\uFEFF' + canonical),
      encoder.encode(canonical.replace('"version":1', '"version":1,"version":1')),
    ];
    for (const input of malformed) {
      expect(reviewTeamInvitation(input, { ...context, verifyIssuerSignature: verifier }))
        .toMatchObject({ ok: false, code: 'TEAM_INVITE_INVALID' });
    }
    expect(verifier).not.toHaveBeenCalled();
  });

  it('returns a fixed error when signature verification fails internally', () => {
    const verifyIssuerSignature = () => { throw new Error('provider detail'); };
    expect(reviewTeamInvitation(encode(), { ...context, verifyIssuerSignature }))
      .toEqual({ ok: false, code: 'TEAM_SIGNATURE_INVALID', retryable: false });
  });

  it('rejects seeded arbitrary byte arrays and signed scope substitutions', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 2048 }), (input) => {
      expect(reviewTeamInvitation(input, context).ok).toBe(false);
    }), { seed: 1109, numRuns: 500 });
    fc.assert(fc.property(fc.integer({ min: 2 }), (index) => {
      const altered = encode({ ...claims, signature, recordScope: [`record-${index}`] });
      expect(reviewTeamInvitation(altered, context)).toMatchObject({ ok: false, code: 'TEAM_SIGNATURE_INVALID' });
    }), { seed: 1110, numRuns: 500 });
  });
});
