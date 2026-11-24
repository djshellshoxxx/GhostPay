import { canonicalize, parseStrictJson, type JsonValue } from '@ghostpay/invoice-schema';
import { base64urlnopad } from '@scure/base';

const SIGNING_DOMAIN = 'ghostpay:ghostteams:capability:v1\n';
const MAX_INVITATION_BYTES = 16 * 1024;
const MAX_SCOPE = 32;
const MAX_REMAINING_MS = 7 * 24 * 60 * 60 * 1000;

type TeamRole = 'invoice-author' | 'reconcile' | 'payout-propose' | 'payout-sign';

interface TeamInvitationClaims {
  readonly version: 1;
  readonly teamId: string;
  readonly capabilityId: string;
  readonly issuerFingerprint: string;
  readonly memberFingerprint: string;
  readonly roles: readonly TeamRole[];
  readonly recordScope: readonly string[];
  readonly membershipEpoch: number;
  readonly expiresAtMs: number;
  readonly nonce: string;
}

interface InvitationReviewContext {
  readonly teamId: string;
  readonly issuerFingerprint: string;
  readonly memberFingerprint: string;
  readonly membershipEpoch: number;
  readonly nowMs: number;
  /** Verify using the independently selected issuer key. The invitation never supplies the key. */
  readonly verifyIssuerSignature: (message: Uint8Array, signature: Uint8Array) => boolean;
}

type InvitationError =
  | 'TEAM_INVITE_INVALID'
  | 'TEAM_SCOPE_DENIED'
  | 'TEAM_EPOCH_STALE'
  | 'TEAM_INVITE_EXPIRED'
  | 'TEAM_SIGNATURE_INVALID';

type InvitationReview =
  | { readonly ok: true; readonly value: TeamInvitationClaims }
  | { readonly ok: false; readonly code: InvitationError; readonly retryable: false };

function fail(code: InvitationError): InvitationReview {
  return { ok: false, code, retryable: false };
}

function isRole(value: JsonValue): value is TeamRole {
  return value === 'invoice-author' || value === 'reconcile' ||
    value === 'payout-propose' || value === 'payout-sign';
}

function isIdentifier(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && !/[^A-Za-z0-9_-]/.test(value);
}

function isFingerprint(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
}

/** Review a decrypted invitation in memory. Success is evidence for review, never a grant or acceptance. */
export function reviewTeamInvitation(
  encoded: Uint8Array,
  context: InvitationReviewContext,
): InvitationReview {
  if (encoded.byteLength === 0 || encoded.byteLength > MAX_INVITATION_BYTES) {
    return fail('TEAM_INVITE_INVALID');
  }

  let value: JsonValue;
  try {
    // Preserve any BOM so the canonical comparison rejects it.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(encoded);
    value = parseStrictJson(text);
    if (canonicalize(value) !== text) return fail('TEAM_INVITE_INVALID');
  } catch {
    return fail('TEAM_INVITE_INVALID');
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 11) {
    return fail('TEAM_INVITE_INVALID');
  }
  const {
    version, teamId, capabilityId, issuerFingerprint, memberFingerprint, roles,
    recordScope, membershipEpoch, expiresAtMs, nonce, signature,
  } = value;
  if (version !== 1 || !isIdentifier(teamId) || !isIdentifier(capabilityId) ||
      !isFingerprint(issuerFingerprint) || !isFingerprint(memberFingerprint) ||
      !Array.isArray(roles) || roles.length === 0 || roles.length > 4 ||
      !roles.every(isRole) || new Set(roles).size !== roles.length ||
      !Array.isArray(recordScope) || recordScope.length === 0 || recordScope.length > MAX_SCOPE ||
      !recordScope.every(isIdentifier) || new Set(recordScope).size !== recordScope.length ||
      typeof membershipEpoch !== 'number' || typeof expiresAtMs !== 'number' ||
      !isIdentifier(nonce) || typeof signature !== 'string' ||
      signature.length === 0 || signature.length > 512) {
    return fail('TEAM_INVITE_INVALID');
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64urlnopad.decode(signature);
  } catch {
    return fail('TEAM_INVITE_INVALID');
  }

  const { nowMs, verifyIssuerSignature } = context;
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return fail('TEAM_INVITE_INVALID');
  if (teamId !== context.teamId || issuerFingerprint !== context.issuerFingerprint ||
      memberFingerprint !== context.memberFingerprint) return fail('TEAM_SCOPE_DENIED');
  if (membershipEpoch !== context.membershipEpoch) return fail('TEAM_EPOCH_STALE');
  if (expiresAtMs <= nowMs) return fail('TEAM_INVITE_EXPIRED');
  // V1 has no issuance timestamp, so this bounds the remaining lifetime at review.
  if (expiresAtMs - nowMs > MAX_REMAINING_MS) return fail('TEAM_INVITE_INVALID');

  const claims = {
    version, teamId, capabilityId, issuerFingerprint, memberFingerprint,
    roles, recordScope, membershipEpoch, expiresAtMs, nonce,
  } satisfies TeamInvitationClaims;
  const message = new TextEncoder().encode(SIGNING_DOMAIN + canonicalize(claims));
  try {
    if (verifyIssuerSignature(message, signatureBytes) !== true) return fail('TEAM_SIGNATURE_INVALID');
  } catch {
    return fail('TEAM_SIGNATURE_INVALID');
  }
  const verifiedClaims = Object.freeze({
    ...claims,
    roles: Object.freeze(roles),
    recordScope: Object.freeze(recordScope),
  });
  return { ok: true, value: verifiedClaims };
}
