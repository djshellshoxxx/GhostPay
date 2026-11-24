import {
  planTeamInvitationAcceptance, planTeamMemberRevocation, type TeamMembershipSnapshot,
} from './membership';

type MembershipPlan = ReturnType<typeof planTeamInvitationAcceptance>;
type PlanFailure = Extract<MembershipPlan, { ok: false }>;
type InvitationContext = Parameters<typeof planTeamInvitationAcceptance>[3];

interface AuthenticatedHead {
  /** Provider-issued version bound to this team, issuer and exact authenticated parent. */
  readonly token: string;
  readonly snapshot: TeamMembershipSnapshot;
}

/** One unlocked owner session and team. Implementations must supply immutable, authenticated
 * heads and reject rollback relative to their trusted checkpoint. Never attach a spend signer. */
export interface TeamMembershipProvider {
  readonly readAuthenticated: () => Promise<AuthenticatedHead>;
  readonly isCurrent: () => boolean;
  readonly nowMs: () => number;
  readonly verifyIssuerSignature: InvitationContext['verifyIssuerSignature'];
  /** Require owner approval for this parent and candidate. Within one atomic transaction,
   * compare the exact head, run guard immediately before mutation, and acknowledge only after
   * commit. An identical snapshot is a conditional read with no write or revision increment. */
  readonly compareAndSwapOwnerReviewed: (
    parent: AuthenticatedHead, next: TeamMembershipSnapshot, guard: () => void,
  ) => Promise<'applied' | 'conflict' | 'denied'>;
}

type MembershipChange =
  | { readonly kind: 'accept'; readonly invitation: Uint8Array; readonly memberFingerprint: string }
  | { readonly kind: 'revoke'; readonly memberFingerprint: string };

type CommitFailure = PlanFailure | {
  readonly ok: false;
  readonly code: 'TEAM_SESSION_STALE' | 'TEAM_STATE_UNAVAILABLE' | 'TEAM_COMMIT_UNCONFIRMED' | 'TEAM_CHANGE_INVALID';
  readonly retryable: false;
};
type CommitResult = CommitFailure | { readonly ok: true; readonly changed: boolean; readonly revision: number };
type MembershipReview = CommitFailure | {
  readonly ok: true;
  readonly snapshot: TeamMembershipSnapshot;
  readonly commit: (change: MembershipChange) => Promise<CommitResult>;
};

const stale = { ok: false, code: 'TEAM_SESSION_STALE', retryable: false } as const;
const unconfirmed = { ok: false, code: 'TEAM_COMMIT_UNCONFIRMED', retryable: false } as const;

/** Open the version the owner will review. A conflict or unknown outcome requires a fresh
 * read and an explicit decision about the original draft. Nothing automatically rebases it. */
export async function openTeamMembershipReview(provider: TeamMembershipProvider): Promise<MembershipReview> {
  try {
    if (!provider.isCurrent()) return stale;
    const head = await provider.readAuthenticated();
    if (!provider.isCurrent()) return stale;

    let needsRead = false;
    async function commit(change: MembershipChange): Promise<CommitResult> {
      if (needsRead) return unconfirmed;
      const expired = new Error('Invitation expired');
      const invalidSession = new Error('Session expired');
      try {
        if (!provider.isCurrent()) return stale;
        const { snapshot } = head;
        const reviewedAt = provider.nowMs();
        if (!Number.isSafeInteger(reviewedAt) || reviewedAt < 0) return stale;
        const { kind, memberFingerprint } = change;
        let plan: MembershipPlan;
        let expiresAt: number | undefined;
        if (kind === 'accept') {
          plan = planTeamInvitationAcceptance(snapshot, snapshot.revision, change.invitation, {
            memberFingerprint, nowMs: reviewedAt, verifyIssuerSignature: provider.verifyIssuerSignature,
          });
          if (!plan.ok) return plan;
          // The planner includes the verified claims for both a new and a duplicate invitation.
          const member = plan.value.members.find(candidate => candidate.memberFingerprint === memberFingerprint);
          if (!member) return { ok: false, code: 'TEAM_CHANGE_INVALID', retryable: false };
          expiresAt = member.expiresAtMs;
        } else if (kind === 'revoke') {
          plan = planTeamMemberRevocation(snapshot, snapshot.revision, memberFingerprint);
          if (!plan.ok) return plan;
        } else {
          return { ok: false, code: 'TEAM_CHANGE_INVALID', retryable: false };
        }

        function guard(): void {
          const now = provider.nowMs();
          if (!provider.isCurrent() || !Number.isSafeInteger(now) || now < reviewedAt) throw invalidSession;
          if (expiresAt !== undefined && now >= expiresAt) throw expired;
        }
        const outcome = await provider.compareAndSwapOwnerReviewed(head, plan.value, guard);
        if (outcome === 'conflict') return { ok: false, code: 'TEAM_REVISION_CONFLICT', retryable: true };
        if (outcome === 'denied') return { ok: false, code: 'TEAM_SCOPE_DENIED', retryable: false };
        if (outcome === 'applied' && provider.isCurrent()) {
          return { ok: true, changed: plan.changed, revision: plan.value.revision };
        }
      } catch (error) {
        if (error === expired) return { ok: false, code: 'TEAM_INVITE_EXPIRED', retryable: false };
        if (error === invalidSession) return stale;
      }
      // A transport/acknowledgement error (or a lock after commit) cannot prove rollback.
      needsRead = true;
      return unconfirmed;
    }
    return { ok: true, snapshot: head.snapshot, commit };
  } catch {
    return { ok: false, code: 'TEAM_STATE_UNAVAILABLE', retryable: false };
  }
}
