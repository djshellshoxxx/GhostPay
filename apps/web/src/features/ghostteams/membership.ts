import { canonicalize } from '@ghostpay/invoice-schema';
import { reviewTeamInvitation } from './invitation';

type InvitationReview = ReturnType<typeof reviewTeamInvitation>;
type InvitationClaims = Extract<InvitationReview, { ok: true }>['value'];
type InvitationContext = Parameters<typeof reviewTeamInvitation>[1];

const MAX_MEMBERS = 20;

/** Caller supplies the current, authenticated snapshot from its own team store. */
export interface TeamMembershipSnapshot {
  readonly teamId: string;
  readonly issuerFingerprint: string;
  readonly revision: number;
  readonly membershipEpoch: number;
  readonly members: readonly InvitationClaims[];
}

type MembershipPlan =
  | Extract<InvitationReview, { ok: false }>
  | {
      readonly ok: true;
      readonly changed: false;
      readonly value: TeamMembershipSnapshot;
    }
  | {
      readonly ok: true;
      readonly changed: true;
      readonly expectedRevision: number;
      readonly value: TeamMembershipSnapshot;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'TEAM_REVISION_CONFLICT'
        | 'TEAM_MEMBERSHIP_CONFLICT'
        | 'TEAM_MEMBER_LIMIT'
        | 'TEAM_MEMBER_NOT_FOUND'
        | 'TEAM_COUNTER_EXHAUSTED';
      readonly retryable: boolean;
    };

type AcceptanceContext = Pick<
  InvitationContext, 'memberFingerprint' | 'nowMs' | 'verifyIssuerSignature'
>;

function nextRevision(
  current: TeamMembershipSnapshot,
  members: readonly InvitationClaims[],
  membershipEpoch: number,
): MembershipPlan {
  if (current.revision === Number.MAX_SAFE_INTEGER) {
    return { ok: false, code: 'TEAM_COUNTER_EXHAUSTED', retryable: false };
  }
  return {
    ok: true,
    changed: true,
    expectedRevision: current.revision,
    value: Object.freeze({
      ...current,
      revision: current.revision + 1,
      membershipEpoch,
      members: Object.freeze(members),
    }),
  };
}

/** Prepare a membership update after explicit acceptance. The caller must commit it atomically. */
export function planTeamInvitationAcceptance(
  current: TeamMembershipSnapshot,
  expectedRevision: number,
  invitation: Uint8Array,
  context: AcceptanceContext,
): MembershipPlan {
  if (expectedRevision !== current.revision) {
    return { ok: false, code: 'TEAM_REVISION_CONFLICT', retryable: true };
  }

  const review = reviewTeamInvitation(invitation, {
    ...context,
    teamId: current.teamId,
    issuerFingerprint: current.issuerFingerprint,
    membershipEpoch: current.membershipEpoch,
  });
  if (!review.ok) return review;

  const claims = review.value;
  const existing = current.members.find((member) => member.memberFingerprint === claims.memberFingerprint);
  if (existing && canonicalize(existing) === canonicalize(claims)) {
    return { ok: true, changed: false, value: current };
  }

  if (existing || current.members.some((member) =>
    member.capabilityId === claims.capabilityId || member.nonce === claims.nonce)) {
    return { ok: false, code: 'TEAM_MEMBERSHIP_CONFLICT', retryable: false };
  }
  if (current.members.length >= MAX_MEMBERS) {
    return { ok: false, code: 'TEAM_MEMBER_LIMIT', retryable: false };
  }
  return nextRevision(current, [...current.members, claims], current.membershipEpoch);
}

/** Prepare a revocation after the caller verifies owner authority and confirms the member. */
export function planTeamMemberRevocation(
  current: TeamMembershipSnapshot,
  expectedRevision: number,
  memberFingerprint: string,
): MembershipPlan {
  if (expectedRevision !== current.revision) {
    return { ok: false, code: 'TEAM_REVISION_CONFLICT', retryable: true };
  }

  const members = current.members.filter((member) => member.memberFingerprint !== memberFingerprint);
  if (members.length === current.members.length) {
    return { ok: false, code: 'TEAM_MEMBER_NOT_FOUND', retryable: false };
  }
  if (current.membershipEpoch === Number.MAX_SAFE_INTEGER) {
    return { ok: false, code: 'TEAM_COUNTER_EXHAUSTED', retryable: false };
  }
  return nextRevision(current, members, current.membershipEpoch + 1);
}
