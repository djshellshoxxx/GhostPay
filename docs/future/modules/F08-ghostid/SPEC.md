# F08 — GhostID independent merchant identities

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f08-ghostid`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **SPECIFICATION ONLY; implementation and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- No current beta scope, fee recipient/rate, production deployment, or custody change is authorized here.

## Objective and user journeys

Manage portable pseudonymous merchant identities without a mandatory account directory, globally unique handle service, or link between unrelated personas. A customer can verify a profile signature, independently confirm a fingerprint, and understand rotation/expiry without treating these as legal identity certification.

1. Merchant creates a persona with a separate invoice-authentication key role through P06, chooses public fields, and exports a signed profile.
2. Customer imports the profile or explicitly requests it from a selected origin, verifies it, and optionally pins the full fingerprint after independent confirmation.
3. Merchant rotates a key with authenticated continuity where supported, or retires a persona. Customers explicitly review continuity before updating a pin.
4. Merchant keeps recovery material and private persona labels locally encrypted. Profiles remain usable without a GhostPay identity server.

Reusing a persona intentionally links that persona's activity. Independent personas must not share public identifiers by default; the UI cannot promise anonymity against network, public-chain, or content correlation.

## Provenance and existing foundations

Source scope: [original GhostID proposal](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/08-ghostid.md).

| Verified source / export | Reuse | Residual gap |
|---|---|---|
| [invoice-schema/src/merchantProfile.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/merchantProfile.ts): `merchantIdFor`, `signMerchantProfile`, `verifyMerchantProfile`, `MAX_PROFILE_BYTES` | Domain-separated signed profiles | Persona lifecycle and reviewed rotation format |
| [merchantIdentity.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/merchantIdentity.ts): `readMerchantKey`, `rememberMerchantKey`, `forgetMerchantKey`, `merchantPinLock` | Explicit public origin-key pin preferences with concurrency checks | Persona-scoped private metadata and rotation review |
| [MerchantProfilePanel.tsx](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/components/MerchantProfilePanel.tsx) | Existing profile UI | Multiple independent personas and migration/conflict UX |
| [invoice-schema/src/envelope.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/envelope.ts): `isTrustedSeller` via index | Existing selected-signer invoice trust boundary | Do not turn an unrelated origin pin into global invoice authority |

Existing public origin/key preferences explicitly do not independently identify a business or authorize every invoice. Preserve that trust boundary.

## Ownership and dependencies

Own proposed `apps/web/src/features/future/ghostid/`: persona selection, disclosure preview, signed profile coordination, pin/rotation UX, and encrypted identity journal. P06 owns key generation, role separation, signing, and recovery.

Hard providers: [P06 key roles](https://github.com/djshellshoxxx/GhostPay/tree/future/p06-key-role-separation) and [P05 encrypted state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state). Optional [F16 per-client identities](https://github.com/djshellshoxxx/GhostPay/tree/future/f16-per-client-identities) creates audience-scoped receiving identities through its own provider; F08 does not duplicate its derivation scheme.

Excluded: legal-identity attestation, global names, public contact discovery, automatic DNS/social verification, spending/viewing key reuse for profile authentication, and social/guardian recovery.

## Proposed versioned contracts

```ts
interface PersonaV1 {
  readonly schema: 'ghostpay.persona/1';
  readonly personaRef: string;
  readonly revision: string;
  readonly authenticationKeyRef: string;
  readonly publicProfileDigest?: string;
  readonly status: 'draft' | 'active' | 'retired';
}
interface RotationStatementV1 {
  readonly schema: 'ghostpay.persona-rotation/1';
  readonly oldFingerprint: string;
  readonly newFingerprint: string;
  readonly sequence: string;
  readonly effectiveAt: number;
  readonly expiresAt: number;
  readonly audienceScope: string;
}
interface GhostIdProvider {
  readonly capability: CapabilityDescriptorV1;
  create(input: unknown, ctx: OperationContext): Promise<ModuleResult<PersonaV1>>;
  publishPreview(personaRef: string, ctx: OperationContext):
    Promise<ModuleResult<{ previewId: string; publicFields: readonly string[] }>>;
  verifyProfile(bytes: SecretHandle, ctx: OperationContext):
    Promise<ModuleResult<{ fingerprint: string; trust: 'valid' | 'pinned' }>>;
  reviewRotation(statement: unknown, ctx: OperationContext):
    Promise<ModuleResult<{ reviewId: string; continuity: 'verified' | 'unestablished' }>>;
}
```

Formats are proposed and must be reconciled with existing closed-schema profile v1. Do not add rotation fields to old signed bytes without a new version/domain. Key references are opaque local identifiers; signatures are produced through scoped P06 callbacks. Any optional amounts/templates keep canonical decimal strings and exact `bigint` interpretation in the underlying invoice provider.

Private aliases, pin notes, persona-to-project maps, recovery status, and rotation history are encrypted. Public profile exports contain only deliberately approved fields. Capability discovery returns no persona inventory.

## Lifecycle, failures, and recovery

Persona creation progresses draft → recovery-ready → active; publishing has a separate disclosure approval. A profile's signature, expiry, origin claim, and current selected pin are checked independently. A signed `origins` list is a merchant assertion, not proof that the signer controls every listed domain.

Rotation review must bind both old and new fingerprints, sequence, scope, effective time, expiry, and required signatures under the eventual reviewed P06 policy. Reject rollback, forks, unknown predecessors, or a continuity claim that lacks the old authority. If the old key is lost/compromised, recovery uses explicit independent re-verification rather than fabricated continuity.

Updating a customer pin requires exact displayed-key confirmation under a revision/lock check. Another tab's change invalidates the review. Lock or persona replacement advances session epoch and revokes pending sign/export tasks. Late callbacks cannot publish an old persona's profile or save a stale pin.

Static retirement cannot recall already copied profiles. Offline verification reports the last authenticated evidence it has; absence of a revocation fetch is not proof that a key remains uncompromised. Never auto-load a new network revocation service to strengthen that claim.

## Validation and proposed budgets

- Preserve `MAX_PROFILE_BYTES` of 8,192 bytes for existing v1 profiles and existing strict fields/signature rules. New formats declare separate reviewed limits.
- Initial persona budget: 16 local personas, 256 customer pins per encrypted profile, and 64 rotation statements per chain; exceeding limits offers explicit archival workflow.
- Public names obey current normalization/control-character restrictions. Render all names and descriptions as text; never load logos/avatars or external profile assets automatically.
- Reject duplicate persona/key-role assignments that would unintentionally share authentication keys. Intentional reuse requires a visible linked-identity decision.
- Proposed rotation statement ceiling: 16 KiB. Verification uses a bounded predecessor chain and cancellation, with no arbitrary recursive URL resolution.
- Full fingerprints, not short visual prefixes, decide trust. Confusable names or identical avatars cannot satisfy key continuity.

## Privacy and trust matrix

| Observer / relation | Remaining visibility | Required behavior |
|---|---|---|
| Profile reader | Public key, name, accepted assets, approved origin claims | Deliberate publication preview |
| Profile host | Visitors and requested profile | Explicit retrieval; no auto-fetch for pasted profiles |
| Two persona audiences | Shared public bytes could correlate identities | Separate keys/IDs by default; compare accidental shared fields |
| Customer with pin | Prior trust anchor and rotation history | Local scope; no automatic cross-persona trust propagation |
| Offline verifier | Stale evidence possibility | Distinguish valid signature from current revocation knowledge |

## Fee behavior

Persona creation, local signing, import, and pin management introduce no fee-enforcing transaction. No registry registration or on-chain naming purchase is implicit. Any optional paid publishing service requires a separate scoped module and explicit quote; F08 works with user-hosted files. This specification chooses no fee rate/recipient and cannot make key recovery contingent on payment.

## Acceptance matrix

| ID | Case | Required result |
|---|---|---|
| F08-A01 | Profile field/signature tampered | Strict verification rejection |
| F08-A02 | Two independently created personas | Separate authentication keys and no unintended shared identity fields |
| F08-A03 | Profile key differs from selected pin | Visible conflict; no auto-replacement |
| F08-A04 | Forged, forked, or rolled-back rotation | Continuity refused |
| F08-A05 | Lost old key with new signed profile | Independent re-verification required |
| F08-A06 | Pin changed by another tab | Stale confirmation cannot overwrite current key |
| F08-A07 | Lock during profile signing/export | No stale artifact release or pin mutation |
| F08-A08 | Valid signature on claimed domain | UI does not falsely assert domain-control proof |
| F08-A09 | Avatar/external URL in imported metadata | No unsolicited resource fetch |
| F08-A10 | Retired profile checked offline | Authenticity and freshness limitations shown separately |

## Implementation slices and existing commands

1. Persona model and P06/P05 adapters in owned paths; verify key-role isolation and recovery readiness.
2. Profile disclosure/export and independent import UX; preserve existing closed-schema profile validation.
3. Rotation format review and pin-update coordinator; verify continuity, rollback, forks, and cross-tab races.
4. Proposed `apps/web/e2e/future-ghostid.spec.ts`; verify keyboard/mobile persona switching, lock, and zero unwanted egress.

Existing scripts were inspected; **not run**:

```sh
npm run test -w @ghostpay/invoice-schema
npm run test -w @ghostpay/ux-vault
npm run test -w @ghostpay/secret-box
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Migration, rollback, owner decisions

Default disabled. Existing merchant profiles import without re-signing or changing fingerprints. Existing public origin pins can be offered for explicit scoped migration; private aliases move to encrypted storage, while invoice trust remains separately selected. Never silently broaden a pin from one origin/persona to all invoices.

Rollback disables creation/rotation but retains signature verification and independent recovery of existing personas. Owner decisions: initial public fields, rotation authentication policy, compromised-key recovery UX, limits, and whether domain-control evidence belongs in a future independent adapter. Release requires exact-head trust-boundary tests and independent key-lifecycle review.
