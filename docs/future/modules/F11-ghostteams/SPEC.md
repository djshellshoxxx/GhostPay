# F11 — GhostTeams encrypted merchant collaboration

| Field | Value |
| --- | --- |
| Module | F11 / ghostteams |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/f11-ghostteams |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Enable scoped merchant collaboration without sharing a spending seed or requiring employee accounts. Drafting invoices, reconciling receipts, proposing payouts and signing a payment are different authorities. Revocation stops future grants; it cannot recall plaintext already disclosed. Local organizational approval must never be described as on-chain threshold enforcement.

1. Owner creates an encrypted, expiring invitation after previewing roles and record scope; member verifies the issuer fingerprint before acceptance.
2. Member receives only authorized material, prepares a signed proposal and returns it through file exchange or optional ciphertext synchronization.
3. Owner reviews changes, resolves conflicts and revokes access through a new membership epoch without deleting recovery records.

## 2. Provenance and source reuse

Primary source: [docs/future/privacy-first/11-ghostteams.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/11-ghostteams.md).
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [packages/merchant-multisig/src/policy.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-multisig/src/policy.ts) | validatePolicy, policyHash | Reuse approval policy validation; team capability scopes need an additional versioned layer. |
| [packages/merchant-multisig/src/approvals.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-multisig/src/approvals.ts) | evaluateApprovals, assertBound | Reuse exact proposal binding; successful local quorum does not restrict the on-chain key holder. |
| [packages/merchant-multisig/src/exchange.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-multisig/src/exchange.ts) | parseProposalExchange, serializeProposalExchange | Reuse canonical bounded exchange; invitations and revocation semantics remain additional work. |
| [packages/merchant-multisig/README.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-multisig/README.md) | Off-chain approvals and rollback limitations | Preserve trusted-policy, single-writer and queue-clock assumptions; do not claim contract enforcement. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P05](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md). Optional integrations: [P07](https://github.com/djshellshoxxx/GhostPay/blob/future/p07-encrypted-device-sync/docs/future/modules/P07-encrypted-device-sync/SPEC.md), [F08](https://github.com/djshellshoxxx/GhostPay/blob/future/f08-ghostid/docs/future/modules/F08-ghostid/SPEC.md).
Proposed owned paths: apps/web/src/features/ghostteams/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own membership/invitation UI and workflow reducers. P05 provides encrypted records and revision commits; P06 provides isolated signing roles. Optional P07 is ciphertext transport only. Exclude guardians, recovery delegates, shared hot seeds, remote staff directories and new on-chain multisig contracts.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
type TeamRole = "invoice-author" | "reconcile" | "payout-propose" | "payout-sign";
interface TeamCapabilityV1 {
  version: 1; teamId: string; capabilityId: string;
  issuerFingerprint: string; memberFingerprint: string;
  roles: readonly TeamRole[]; recordScope: readonly string[];
  membershipEpoch: number; expiresAtMs: number; nonce: string;
  signature: string;
}
interface TeamRevisionV1 {
  version: 1; teamId: string; revision: number;
  parentDigest: string; membershipEpoch: number; ciphertextRef: string;
}
interface TeamService {
  previewInvite(raw: unknown, ctx: OperationContext): Promise<ModuleResult<TeamCapabilityV1>>;
  acceptInvite(digest: string, ctx: OperationContext): Promise<ModuleResult<TeamRevisionV1>>;
  revokeMember(member: string, expectedRevision: number,
    ctx: OperationContext): Promise<ModuleResult<TeamRevisionV1>>;
}
~~~

Capability signatures bind team, member, roles, record scope, epoch and expiry under a dedicated domain. An invitation cannot authorize arbitrary message signing. Aliases, books and membership details are encrypted; public envelopes contain only routing essentials. Account/proposal imports remain data until accepted against a separately trusted current policy.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

Invitation lifecycle: draft → reviewed → signed → delivered → accepted, expired or revoked. Member changes pass received → validated → proposed → owner-reviewed → committed. Use compare-and-swap revisions; concurrent edits return a conflict preserving both drafts. Recovery retains a signed revision chain and revocation high-water mark; an older valid snapshot must not reinstall revoked membership.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: TEAM_SCOPE_DENIED, TEAM_EPOCH_STALE, TEAM_REVISION_CONFLICT, TEAM_INVITE_EXPIRED, TEAM_SIGNATURE_INVALID. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Members | 20 active members/workspace | Refuse expansion without discarding another member. |
| Invitation | 16 KiB; 32 record selectors; 7-day maximum expiry | Reject before expensive verification. |
| Proposal exchange | Existing 32 KiB limit; 64 queued proposals | Reuse canonical parser and reject duplicate fields. |
| State exchange | Existing 1 MiB metadata limit | Stage import without replacing authoritative state. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| Revoked member | Rotate future epoch keys and reject stale capabilities | Previously shared data may remain copied. |
| Malicious staff member | Enforce scope at read, draft, sign and commit boundaries | Authorized plaintext can be redistributed. |
| Rollback/fork | Revision chain and protected local high-water mark | Fresh-device restore needs a trusted checkpoint. |
| Local approval bypass | Label organization policy separately from signing control | The on-chain key holder can transact outside the app. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Local membership changes and file exchange carry no newly implied transaction charge. A future optional sync service must disclose its independent price before connection. Revocation and independent recovery must never require paying an operator.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| F11-AC01 | A reconciliation-only member cannot invoke invoice or payment signing callbacks. |
| F11-AC02 | Changing member, scope, epoch or expiry invalidates an invitation signature. |
| F11-AC03 | Duplicate invitation acceptance is idempotent and cannot add roles. |
| F11-AC04 | Revocation during a pending decrypt suppresses the result and clears visible records. |
| F11-AC05 | Concurrent writers preserve both drafts and produce a revision conflict. |
| F11-AC06 | An old signed snapshot cannot silently reinstate a revoked member. |
| F11-AC07 | Disabled sync causes zero requests during launch, invite creation and export. |
| F11-AC08 | Local proposal approval never appears as confirmed chain settlement. |
| F11-AC09 | Oversized and noncanonical exchanges cause no persistent mutation. |
| F11-AC10 | Keyboard/screen-reader flows identify roles without reading private locked content. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Define capability schemas and independent signing-domain fixtures in the feature directory; verify scope substitution rejects.
2. Build invitation/revocation reducer and revision CAS adapter; test expiry, replay and conflict preservation.
3. Connect P05/P06 ports; test locked refusal and watch-only separation from spending.
4. Add file exchange plus optional P07 adapter; verify ciphertext-only payloads and disabled-network traces.
5. Build role/proposal screens and fresh-device recovery drill; independently review escalation and local-quorum wording.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/merchant-multisig/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-multisig/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/merchant-multisig
npm test -w @ghostpay/merchant-multisig -- --maxWorkers=1
npm run lint -w @ghostpay/merchant-multisig
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Default disabled. Single-user vaults retain their meaning; creating a team writes a new encrypted namespace after explicit role review. Rollback disables invitations/edits but preserves revocation evidence, member exports and independent signing access.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: final role taxonomy, supported invitation channels, trusted checkpoint exchange on new devices, and whether separately enforced on-chain multisig is ever desired. Guardian recovery remains excluded.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
