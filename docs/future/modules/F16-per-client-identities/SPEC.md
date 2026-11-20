# F16 — Per-client payment identity separation

| Field | Value |
| --- | --- |
| Module | F16 / per-client-identities |
| Status | Specification only; implementation is not authorized by this document |
| Specification date | 2026-11-19 |
| Source baseline | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Branch | future/f16-per-client-identities |
| Feature default | Disabled; retain existing release and payments gates |

Read the [shared contracts and invariants](../COMMON.md) and [module registry](../README.md) with this specification.
Proposed types, limits and file paths describe future implementation; they are not claims that these additions exist or passed qualification.
The current task authorizes these documentation branches. It does not activate services, change fees, deploy or expand beta blockers.

## 1. Objective and user journeys

Give a merchant distinct customer/project identities without sharing meta-address or invoice-signing bytes across unrelated audiences. Allocation and recovery must work offline and preserve every issued identity. Existing fresh per-payment destinations do not alone provide this audience separation, and no new derivation algorithm is selected here.

1. Merchant creates a local customer/project label, previews the isolated identity and confirms the intended audience.
2. Invoice creation requests the chosen child capability; a new customer cannot accidentally inherit another customer's signer or meta-address.
3. A fresh device restores the encrypted allocation index in discovery/recovery-only mode, derives existing authorized identities through P06 and performs bounded catch-up discovery without uploading the child list. It cannot allocate new identities until a trusted current checkpoint and explicit allocator handoff are verified.

## 2. Provenance and source reuse

Primary source: [docs/future/privacy-first/16-per-client-identities.md](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/16-per-client-identities.md).
Existing source and exports below were inspected at the baseline; reuse is required before proposing a competing implementation.

| Existing component | Inspected exports / contract | Reuse and residual gap |
| --- | --- | --- |
| [packages/core-crypto/src/keys.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/core-crypto/src/keys.ts) | generateKeySet, encodeMetaAddress, decodeMetaAddress | Reuse valid spend/view key primitives; no accepted child identity derivation follows from these exports. |
| [packages/core-crypto/src/stealth.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/core-crypto/src/stealth.ts) | deriveStealthPayment, checkAnnouncement, deriveStealthSecret | Reuse per-payment scheme-1 behavior within an identity. |
| [apps/web/src/lib/session.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/session.ts) | captureSessionVersionGuard, withSessionSecretsAsync | Preserve scoped secret access and stale-session refusal. |
| [packages/invoice-schema/src/sign.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/sign.ts) | signInvoice, verifyInvoiceSignature | Reuse invoice signature semantics with the separately selected P06 role. |

## 3. Ownership, dependencies and non-goals

Hard dependencies: [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md), [P05](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md). Optional integrations: [F08](https://github.com/djshellshoxxx/GhostPay/blob/future/f08-ghostid/docs/future/modules/F08-ghostid/SPEC.md).
Proposed owned paths: apps/web/src/features/per-client-identities/ and focused adjacent integration tests. Provider package edits require a separate claimed provider slice.
Own identity allocation/journal UI, persona selection and migration workflow. P06 owns the derivation/key-role protocol and independent vectors; P05 owns encrypted allocation persistence. The initial design permits one authoritative allocating device/checkpoint per root and generation. P06 must separately review any allocator handoff protocol or namespace extension; local CAS cannot coordinate offline restored devices. Concurrent multi-device allocation is excluded until a separately reviewed P06 namespace design and independent vectors exist. Optional F08 supplies a user-chosen public persona. Exclude a novel KDF, public customer directory, server-side child scanning, guardian recovery and automatic remote identity registration.
Product orchestration must consume provider interfaces; it must not duplicate cryptography, vault encryption, transport policy or transaction verification.
All boundary inputs are untrusted. Refuse unsupported protocol versions, unknown critical fields, invalid chain/asset combinations and data beyond documented limits.

## 4. Versioned data model and API

These are proposed contracts. OperationContext, ModuleResult<T>, SecretHandle and CapabilityDescriptorV1 are defined in COMMON.
Each operation receives operationId, sessionEpoch, AbortSignal and deadlineMs; results use ok/value or ok:false/code/retryable.

~~~ts
interface ChildIdentityV1 {
  version: 1; identityId: string; schemeId: string;
  allocationIndex: number; generation: number;
  localLabelRef: string; publicMetaAddress: string;
  invoiceSignerFingerprint: string;
  status: "reserved" | "issued" | "retired";
}
interface AllocationJournalV1 {
  version: 1; revision: number; schemeId: string;
  rootFingerprint: string; generation: number; allocatorDeviceFingerprint: string;
  allocatorMode: "authoritative" | "discovery-recovery-only";
  trustedCheckpointDigest: string;
  highestReservedIndex: number; issuedIds: readonly string[];
  retiredIds: readonly string[]; backupCoverageDigest: string;
}
interface IdentityService {
  reserve(expectedRevision: number, expectedCheckpointDigest: string,
    ctx: OperationContext):
    Promise<ModuleResult<ChildIdentityV1>>;
  issue(identityId: string, ctx: OperationContext):
    Promise<ModuleResult<ChildIdentityV1>>;
  restoreIndex(raw: unknown, ctx: OperationContext):
    Promise<ModuleResult<AllocationJournalV1>>;
}
~~~

The schemeId binds an accepted derivation ADR and version; a future provider cannot silently change derivation under an existing ID. Child spend/view/invoice-authentication roles are independent. Burn reserved indices after uncertain allocation rather than reusing them. Labels and linkage maps are encrypted. SecretHandle references stay ephemeral and never enter allocation JSON.

Allocator authority is not restored from a serialized allocatorMode field. Every imported/copied journal starts discovery-recovery-only. A provider-verified current checkpoint binds root, generation, complete reservation high-water mark and the sole allocating device. Explicit handoff freezes allocation on the source, authenticates the complete checkpoint and destination identity, verifies freshness and transfers authority under the separately reviewed P06 protocol before the destination may reserve. If freshness or sole-allocator continuity cannot be established, keep allocation blocked. A new device ID, local revision counter or edited generation number is not a disjoint derivation namespace. This operational boundary does not revoke secrets held by a malicious copied device; it depends on the documented trusted-device/owner continuity assumption.
Financial amounts use bigint internally and canonical unsigned decimal strings in JSON. Asset precision comes from validated metadata, not caller text.
Opaque secret handles are nonserializable; all signing/secret use runs within scoped provider callbacks. Persist no raw keys, witnesses or pre-signed transaction queues.

## 5. State, cancellation and recovery

Allocation: reserved → independently recoverable → issued → retired. Retired means no new invoice creation, not discard of funds or scan capability. On the authoritative allocating device, persist reservation before exposing derived public identity, then atomically mark issuance. Local tabs serialize allocation; uncertain reservation burns the index. Restore merges known high-water marks monotonically and previews conflicts, but an archive cannot prove that no other device issued later identities. Restored copies therefore remain discovery/recovery-only until current checkpoint freshness and explicit handoff are verified. If the prior allocator is unavailable and freshness is unknown, do not allocate in the old namespace; retain discovery and recovery pending a separately reviewed recovery/namespace decision.
Vault lock or account change aborts in-flight work, clears decrypted displays and invalidates the session epoch.
After every await and before persistence or UI publication, reject stale operation/epoch results; late completion cannot restore locked information.
Cancellation stops unsubmitted work. It cannot undo a transaction or external action already submitted; uncertain outcomes require reconciliation before a new attempt.
Stable feature errors: IDENTITY_SCHEME_UNAPPROVED, IDENTITY_ALLOCATION_CONFLICT, IDENTITY_BACKUP_INCOMPLETE, IDENTITY_INDEX_ROLLBACK, IDENTITY_ROLE_MISMATCH, IDENTITY_ALLOCATOR_NOT_AUTHORITATIVE, IDENTITY_CHECKPOINT_STALE. Error text is fixed/redacted and contains no invoice plaintext, key material or private endpoint credentials.

## 6. Input and resource budgets

These initial limits are proposed design budgets, not measured performance claims. Providers may enforce stricter limits.

| Boundary | Initial budget | Required behavior |
| --- | --- | --- |
| Active children | 64/profile initial product limit | Retired identities remain recoverable; no silent pruning. |
| Index | Safe integer 0–1,000,000 with monotonic reservations | Refuse exhaustion; never wrap or reuse. |
| Import | 1 MiB index metadata; 10,000 historical entries | Validate in bounded chunks before commit. |
| Scan work | One provider-budgeted batch per selected identity | Yield/cancel; no unbounded all-child loop. |
| Labels | 128 Unicode code points; encrypted only | Escape display and exclude from outbound requests. |

Apply limits before expensive decoding, cryptography or allocation. Bound response reads as well as parsing, and stop work at cancellation/deadline.
One profile-scoped operation owns a mutable workflow revision; conflicting tabs must fail with a conflict result rather than overwrite another writer.

## 7. Privacy and failure threat model

| Observer or failure | Required mitigation | Residual disclosure |
| --- | --- | --- |
| Cross-customer correlation | Independent role keys and public identifiers | Public profiles and transaction graphs may still correlate users. |
| Concurrent allocation | One authoritative allocator/checkpoint per root and generation; local CAS serializes its tabs only | Offline restored copies cannot prove freshness and cannot allocate. |
| Rollback import | Merge known high-water marks, require freshness/handoff and retain recovery-only mode | An old valid archive cannot reveal unseen allocations or revoke copied secrets. |
| Remote scanner | Local child matching through provider ports | Chain/range and traffic-volume metadata may remain visible. |

Transparent EVM sender, amount, timing, gas and transaction graphs remain observable. A fresh address, encrypted file, delay or private RPC is not an anonymity guarantee.
Browser extensions, the delivered JavaScript and the device remain outside full page-level control; state practical limits in the feature UI.

## 8. Fees and explicit consent

Creating, retiring or recovering local child identities does not create a new per-payment charge. Each actual payment retains its existing protocol rules. Recovery access must remain independent of fee gateways, team membership or paid cloud storage.
Do not set new rates, recipients or charge-enforcement behavior in this branch. Preserve current protocol rules and separate gas, third-party charges and proposed add-ons.
No unresolved paid quote may silently become a charge; display unavailable/pending policy and require a new explicit review if signed terms change.

## 9. Acceptance cases

| Case | Observable requirement |
| --- | --- |
| F16-AC01 | Unapproved or unknown derivation scheme cannot issue a child identity. |
| F16-AC02 | Independent published vectors verify spend/view/auth separation before activation. |
| F16-AC03 | Different audience identities share no unintended signer or meta-address bytes. |
| F16-AC04 | Concurrent tabs on the single authoritative allocating device cannot issue the same index twice; this assertion does not extend to independent offline copies. |
| F16-AC05 | After a crash, the authoritative device recovers durable reservations without reuse; missing or uncertain checkpoint continuity blocks allocation rather than guessing. |
| F16-AC06 | Restoring an older archive cannot reduce a known high-water mark or discard known issued children, and the imported copy stays discovery/recovery-only until freshness and explicit handoff are verified. |
| F16-AC07 | Retired identities remain discoverable and independently spendable. |
| F16-AC08 | Child lists and labels never reach RPC, relayer or host telemetry. |
| F16-AC09 | Lock/account switching invalidates pending derivation callbacks. |
| F16-AC10 | Legacy invoices and existing master-key recovery remain usable without automatic identity migration. |
| F16-AC11 | Restore the same stale backup to two devices while the authoritative device has issued later children: neither restored copy may reserve or issue, even if its own local CAS succeeds. |
| F16-AC12 | An explicit verified handoff freezes the old allocator and resumes beyond the complete checkpoint; absent, replayed or stale handoff evidence leaves the destination recovery-only. |

All cases require exact implementation SHA, fixture inputs and observed outcomes. An implementation-presence claim or old test count is insufficient.

## 10. Implementation slices and checks

1. Accept P06 derivation ADR and independent vectors; refuse implementation with only a proposed formula.
2. Define encrypted allocation journal and single-authoritative-device reserve/issue reducer; test local-tab CAS, crash recovery, checkpoint loss and stale two-device restores. A separately reviewed P06 handoff/namespace protocol is prerequisite to moving allocation authority.
3. Integrate identity selection into existing invoice signing via scoped P06 handles; test cross-audience separation.
4. Add backup coverage and restore conflict preview using P05; verify fresh-device discovery/recovery across gaps while allocation stays blocked until checkpoint freshness and explicit handoff are established.
5. Connect bounded discovery UI and retired-identity management; independently review network leakage and migration.

Keep slices independently reviewable. Record owned paths before editing; use existing providers behind injected ports and deterministic fixtures.

## 11. Verification commands and present evidence

Scripts were verified in [packages/core-crypto/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/core-crypto/package.json) and [apps/web/package.json](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/package.json). These are future implementation commands, **not run for this specification-only task**.

~~~sh
npm run typecheck -w @ghostpay/core-crypto
npm test -w @ghostpay/core-crypto -- --maxWorkers=1
npm run lint -w @ghostpay/core-crypto
npm run typecheck -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
~~~

Browser acceptance must cover Chromium, Firefox and WebKit, lock/reload/account change, keyboard access and instrumented network traces where applicable.
External-wallet, Tor, partner-service, real-chain and independent review evidence remain pending until actually performed for the enabled configuration.

## 12. Migration, rollout and rollback

Existing master identities are imported as explicit legacy entries; do not rederive or replace them. Imported allocation journals default to discovery/recovery-only regardless of saved authority flags. Require current trusted checkpoint continuity, the sole allocator role and a new verified recovery backup before exposing new child payment identities. Rollback disables allocation while preserving old/new invoice compatibility and the complete child recovery index.
Expose a capability flag separately from a release flag; specification completion is not capability availability.
Rollback must leave encrypted recovery exports and unresolved financial journals accessible. Never delete sole-copy keys or pending records to make a downgrade succeed.

## 13. Unresolved decisions and completion boundary

Owner decisions: accepted derivation scheme/ADR, user-facing audience semantics, maximum active children, trusted-checkpoint freshness and explicit allocator handoff/recovery policy. Concurrent allocating devices require a separate P06 namespace extension; this spec grants no such capability. P06 cryptographic review is a hard prerequisite; this product spec authorizes no custom derivation or guardian recovery.
Before implementation, refresh main and relevant branches, reconcile unique work, pin provider contracts and record ownership. Separate release qualification is required before activation.
5k/requirement 3q remains canonical in [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md); this module does not create a duplicate beta recovery requirement.
