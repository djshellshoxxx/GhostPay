import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonicalize } from '@ghostpay/invoice-schema';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  planTeamInvitationAcceptance, planTeamMemberRevocation, type TeamMembershipSnapshot,
} from './membership';

const encoder = new TextEncoder();
const issuer = generateKeyPairSync('ed25519');
const nowMs = 1_800_000_000_000;
const empty: TeamMembershipSnapshot = Object.freeze({
  teamId: 'team-a',
  issuerFingerprint: 'a'.repeat(64),
  revision: 0,
  membershipEpoch: 1,
  members: Object.freeze([]),
});

function claimsFor(index: number, epoch = empty.membershipEpoch) {
  return {
    version: 1,
    teamId: empty.teamId,
    capabilityId: `cap-${index}`,
    issuerFingerprint: empty.issuerFingerprint,
    memberFingerprint: index.toString(16).padStart(64, '0'),
    roles: ['reconcile'],
    recordScope: ['record-1'],
    membershipEpoch: epoch,
    expiresAtMs: nowMs + 60_000,
    nonce: `nonce-${index}`,
  };
}

function invitation(claims: ReturnType<typeof claimsFor>) {
  const message = encoder.encode('ghostpay:ghostteams:capability:v1\n' + canonicalize(claims));
  const signature = sign(null, message, issuer.privateKey).toString('base64url');
  return encoder.encode(canonicalize({ ...claims, signature }));
}

function contextFor(claims: ReturnType<typeof claimsFor>) {
  return {
    memberFingerprint: claims.memberFingerprint,
    nowMs,
    verifyIssuerSignature: (message: Uint8Array, signature: Uint8Array) =>
      verify(null, message, issuer.publicKey, signature),
  };
}

function accept(current: TeamMembershipSnapshot, index: number): TeamMembershipSnapshot {
  const claims = claimsFor(index, current.membershipEpoch);
  const plan = planTeamInvitationAcceptance(current, current.revision, invitation(claims), contextFor(claims));
  if (!plan.ok || !plan.changed) throw new Error('Expected an acceptance plan');
  return plan.value;
}

describe('offline GhostTeams membership transitions', () => {
  it('plans acceptance at the expected revision and returns the current snapshot for an exact duplicate', () => {
    const claims = claimsFor(1);
    const encoded = invitation(claims);
    const context = contextFor(claims);
    const plan = planTeamInvitationAcceptance(empty, 0, encoded, context);
    expect(plan).toMatchObject({
      ok: true, changed: true, expectedRevision: 0,
      value: { revision: 1, membershipEpoch: 1, members: [claims] },
    });
    if (!plan.ok || !plan.changed) throw new Error('Expected an acceptance plan');
    expect(Object.isFrozen(plan.value.members)).toBe(true);
    expect(empty.members).toEqual([]);
    const duplicate = planTeamInvitationAcceptance(plan.value, 1, encoded, context);
    expect(duplicate).toMatchObject({ ok: true, changed: false });
    if (!duplicate.ok) throw new Error('Expected an idempotent result');
    expect(duplicate.value).toBe(plan.value);
  });

  it('rejects a signed invitation that would change the existing member’s roles', () => {
    const current = accept(empty, 1);
    const escalation = {
      ...claimsFor(1), capabilityId: 'cap-new', nonce: 'nonce-new', roles: ['payout-sign'],
    };
    expect(planTeamInvitationAcceptance(current, 1, invitation(escalation), contextFor(escalation)))
      .toEqual({ ok: false, code: 'TEAM_MEMBERSHIP_CONFLICT', retryable: false });
    expect(current.members[0]?.roles).toEqual(['reconcile']);
  });

  it.each(['capabilityId', 'nonce'] as const)('rejects reuse of a %s by another recipient', (key) => {
    const prior = claimsFor(1);
    const current = accept(empty, 1);
    const repeated = { ...claimsFor(2), [key]: prior[key] };
    expect(planTeamInvitationAcceptance(current, 1, invitation(repeated), contextFor(repeated)))
      .toMatchObject({ ok: false, code: 'TEAM_MEMBERSHIP_CONFLICT' });
  });

  it('refuses stale revisions early and lets the conflicting draft be tried against the new revision', () => {
    const current = accept(empty, 1);
    const claims = claimsFor(2);
    const encoded = invitation(claims);
    const verifyIssuerSignature = vi.fn(contextFor(claims).verifyIssuerSignature);
    const context = { ...contextFor(claims), verifyIssuerSignature };
    expect(planTeamInvitationAcceptance(current, 0, encoded, context))
      .toEqual({ ok: false, code: 'TEAM_REVISION_CONFLICT', retryable: true });
    expect(verifyIssuerSignature).not.toHaveBeenCalled();
    expect(planTeamMemberRevocation(current, 0, claimsFor(1).memberFingerprint))
      .toEqual({ ok: false, code: 'TEAM_REVISION_CONFLICT', retryable: true });
    expect(planTeamInvitationAcceptance(current, 1, encoded, context))
      .toMatchObject({ ok: true, expectedRevision: 1, value: { members: [claimsFor(1), claims] } });
  });

  it('revokes a member, advances the epoch, and rejects every prior-epoch invitation', () => {
    const current = accept(accept(empty, 1), 2);
    const revoked = claimsFor(1);
    const removal = planTeamMemberRevocation(current, 2, revoked.memberFingerprint);
    expect(removal).toMatchObject({
      ok: true, changed: true, expectedRevision: 2,
      value: { revision: 3, membershipEpoch: 2, members: [claimsFor(2)] },
    });
    if (!removal.ok) throw new Error('Expected a revocation plan');
    for (const claims of [revoked, claimsFor(3)]) {
      expect(planTeamInvitationAcceptance(removal.value, 3, invitation(claims), contextFor(claims)))
        .toMatchObject({ ok: false, code: 'TEAM_EPOCH_STALE' });
    }
    expect(accept(removal.value, 1).members).toEqual([claimsFor(2), claimsFor(1, 2)]);
    expect(current.members).toHaveLength(2);
  });

  it('checks time and the selected member again at acceptance', () => {
    const claims = claimsFor(1);
    const encoded = invitation(claims);
    expect(planTeamInvitationAcceptance(empty, 0, encoded, { ...contextFor(claims), nowMs: claims.expiresAtMs }))
      .toMatchObject({ ok: false, code: 'TEAM_INVITE_EXPIRED' });
    expect(planTeamInvitationAcceptance(empty, 0, encoded, contextFor(claimsFor(2))))
      .toMatchObject({ ok: false, code: 'TEAM_SCOPE_DENIED' });
  });

  it('accepts 20 members and keeps a duplicate idempotent at capacity', () => {
    let current = empty;
    for (let index = 1; index <= 20; index++) current = accept(current, index);
    const extra = claimsFor(21);
    expect(planTeamInvitationAcceptance(current, 20, invitation(extra), contextFor(extra)))
      .toMatchObject({ ok: false, code: 'TEAM_MEMBER_LIMIT' });
    const duplicate = claimsFor(1);
    expect(planTeamInvitationAcceptance(current, 20, invitation(duplicate), contextFor(duplicate)))
      .toMatchObject({ ok: true, changed: false });
    expect(current.members).toHaveLength(20);
  });

  it('reports a missing member and fails closed at the integer limits', () => {
    const claims = claimsFor(1);
    const limit = Number.MAX_SAFE_INTEGER;
    expect(planTeamMemberRevocation(empty, 0, claims.memberFingerprint))
      .toMatchObject({ ok: false, code: 'TEAM_MEMBER_NOT_FOUND' });
    expect(planTeamInvitationAcceptance({ ...empty, revision: limit }, limit, invitation(claims), contextFor(claims)))
      .toMatchObject({ ok: false, code: 'TEAM_COUNTER_EXHAUSTED' });
    const current = accept(empty, 1);
    expect(planTeamMemberRevocation({ ...current, membershipEpoch: limit }, 1, claims.memberFingerprint))
      .toMatchObject({ ok: false, code: 'TEAM_COUNTER_EXHAUSTED' });
  });

  it('preserves unrelated members and blocks old invitations across generated join and revoke sequences', () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.integer({ min: 1, max: 65535 }), { minLength: 1, maxLength: 10 }),
      fc.nat(),
      (indexes, choice) => {
        const current = indexes.reduce(accept, empty);
        const revoked = current.members[choice % current.members.length];
        if (!revoked) throw new Error('Expected a member to revoke');
        const plan = planTeamMemberRevocation(current, current.revision, revoked.memberFingerprint);
        if (!plan.ok || !plan.changed) throw new Error('Expected revocation');
        expect(plan.value.members.map((member) => member.memberFingerprint))
          .toEqual(current.members.filter((member) => member !== revoked).map((member) => member.memberFingerprint));
        const prior = claimsFor(indexes[choice % indexes.length] ?? 0);
        expect(planTeamInvitationAcceptance(plan.value, plan.value.revision, invitation(prior), contextFor(prior)))
          .toMatchObject({ ok: false, code: 'TEAM_EPOCH_STALE' });
      },
    ), { seed: 1103, numRuns: 300 });
  });
});
