# P05 — Encrypted local state and recovery primitives

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P05` / `encrypted-local-state` |
| Branch | `future/p05-encrypted-local-state` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md) |
| Optional integrations | None |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Provide reusable encrypted local-record storage, atomic import/merge, verified backup state and lock-aware access for future workflows. A storage failure must preserve the last recoverable copy and never convert sensitive data to plaintext persistence.

Sources: [issue #284 P05](https://github.com/djshellshoxxx/GhostPay/issues/284), [issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283), and [architecture 5b](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5b.md). Independent key roles come from P06. The approved [spec 18 / requirement 3q](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md) remains canonical prerequisite for payment-key recovery; P05 does not reimplement, rename, defer or count it as a new future feature.

## 2. Existing implementation and residual delta

- [Vault](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/vault.ts) exports `createVault`, `VaultStorage`, `ProfileSession` and a current 16-profile ceiling.
- [Profile envelope](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/envelope.ts) supplies `seal`, `open`, `parseHeader`, KDF policy and a 16 MiB blob cap.
- [Portable keystore](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/keystore-portable.ts) exports `createKeystoreApi`; its scrypt/AES-GCM key format is distinct from the profile envelope. Do not conflate their KDFs or AAD domains.
- [Backup codec](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/backup.ts) exports `createBackup`, `decodeBackup`, `backupToText` and `backupFromText`.
- [Browser key vault](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/keyVault.ts) supplies `IndexedDbKeyVaultStore`, `authorizeKeyExport`, `saveEncryptedVault`, `unlockEncryptedVault`, and guarded deletion.
- [Session](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/session.ts) provides `verifyDownloadedBackup`, session guards and recoverability summaries.

The delta is a shared record-classification contract, device/profile isolation, guarded retention/merge planning and consumer-independent lifecycle evidence. Reuse current codecs/CAS semantics; passing helper tests alone does not qualify new browser storage flows.

## 3. Scope and owned state

Own encrypted metadata records, authenticated index metadata, import previews and backup-verification state. P06 owns key roles and handles. Product F06 owns the end-user recovery workflow; P07 owns optional sync. P05 has no network port and does not import either consumer.

Classify records as recovery-critical, pending-operation, security-evidence or nonessential metadata. Retention controls may propose deletion only of the last class. Sole-copy keys, vaults, backups, transaction uncertainty and required evidence are excluded. A browser IndexedDB copy is not automatically an independently verified external backup.

## 4. Proposed data and API

```ts
interface LocalRecordV1 {
  version: 1; recordId: string; revision: string;
  profileScope: string; deviceScope: string;
  kind: string;
  retentionClass: 'recovery' | 'pending' | 'evidence' | 'metadata';
  ciphertext: string; envelopeFormat: string;
}
interface ImportPreviewV1 {
  version: 1; previewId: string; baseRevision: string;
  planDigest: string; sessionEpoch: number;
  expiresAt: string; // Canonical unsigned decimal UTC epoch milliseconds.
  added: number; conflicts: number; refused: number;
  recoveryImpact: readonly string[];
}
declare const importPlanBrand: unique symbol;
interface ImportPlanHandle { readonly [importPlanBrand]: true }
interface EncryptedStateProvider {
  read(ref: RecordRef, key: SecretHandle, ctx: OperationContext):
    Promise<ModuleResult<ScopedRecord>>;
  previewImport(bytes: Uint8Array, key: SecretHandle, ctx: OperationContext):
    Promise<ModuleResult<{ preview: ImportPreviewV1; plan: ImportPlanHandle }>>;
  approveImport(plan: ImportPlanHandle, approvedDigest: string,
    ctx: OperationContext): ModuleResult<ImportPlanHandle>;
  commit(plan: ImportPlanHandle, ctx: OperationContext):
    Promise<ModuleResult<Revision>>;
  revokePlan(plan: ImportPlanHandle): void;
  capability(): CapabilityDescriptorV1;
}
```

Record headers contain no contact names or invoice text. Bind identity, kind, schema and revision to authenticated data. `previewImport` authenticates and stages an immutable candidate without changing durable state, returning a public summary and provider-registered nonserializable plan handle. The handle binds candidate digest, profile/key identity, base storage revision, operation/session epoch and expiry. `approveImport` records the explicit reviewed digest in provider-private state; an unapproved, forged or serialized handle cannot commit. `commit` rechecks every binding and consumes approval atomically with the revision compare-and-swap; concurrent/repeated commit calls cannot apply the same plan twice. Refusal or uncertain storage completion requires read-back reconciliation before any new plan, never blind retry.

`expiresAt` is canonical unsigned decimal UTC epoch milliseconds, bounded and compared exactly with the injected UTC clock; initial preview lifetime is at most five minutes and never exceeds the operation deadline. Clock rollback, lock, profile/key replacement, cancellation or expiry invalidates the plan. `revokePlan` disposes staged data without modifying originals. A preview is not authority after state changes. Scoped plaintext callbacks cannot return secret buffers or serialize key handles; consumers receive minimal public summaries.

## 5. State transitions and failures

1. Unlock with an authorized role and capture session/storage revision.
2. Read/decrypt bounded records, validate their schema and keep plaintext ephemeral.
3. Prepare additions, merge conflicts or selective export locally; show counts, exact plan digest and recovery impact. Explicit user approval calls `approveImport`; preview creation alone remains read-only.
4. Verify destination capacity, unchanged candidate digest/base revision/session, and single-use approval; commit atomically using compare-and-swap/batch semantics.
5. Verify exported backup through an actual read-back/decrypt comparison before marking it verified.
6. Lock, sleep expiry or key replacement cancels operations, wipes transient buffers and rejects late commits/downloads.
7. Concurrent-tab change returns conflict and leaves both durable originals recoverable.

Quota exhaustion, disk failure or interrupted migration never deletes the source first. Rollback protection needs authenticated revision semantics; encryption alone cannot detect restoration of an old valid blob. Reorg changes payment-evidence classification without destroying underlying encrypted records or pretending imported history is fresh chain proof.

## 6. Proposed bounds and resource policy

Keep existing lower limits. Cap a record at 1 MiB, an import at 16 MiB decoded, 10,000 records per operation and 16 active local profiles. Validate size/header/KDF cost before expensive allocation. Run one expensive unlock/import KDF at a time; defer UI responsiveness thresholds to measured mobile results.

Proposed import preview budget: 30 seconds and 64 MiB working memory, cancellable between records and cryptographic awaits. Never silently skip malformed records: reject atomically or show an explicit noncommitting rejected-record report. Unknown future schemas remain untouched. Object URLs are revoked promptly and downloads require deliberate gestures.

## 7. Privacy and trust matrix

| Observer / failure | Exposure or risk | Required treatment |
|---|---|---|
| Local profile reader | Ciphertext sizes/counts and public headers | Opaque identifiers; bounded metadata |
| Compromised active origin | Decrypted data while unlocked | Narrow secret scope; no absolute protection claim |
| Export recipient | Entire selected decrypted scope with password | Explicit selection and scope display |
| Lost browser/device | Data loss or old encrypted copies | Independently verified backup/recovery prerequisite |
| Concurrent tab | Lost updates or obsolete delete plan | Revision-bound atomic commit |
| Old valid archive | Rollback/forked history | Authenticated revision/conflict semantics; not silent replacement |

## 8. Pricing policy

Local encryption, lock, backup verification, import and independent recovery remain free. No fee is charged for recovering access to existing funds. Optional remote storage belongs to P07 and an explicitly chosen service, not this provider. P05 cannot charge, configure a recipient or alter protocol fees.

## 9. Acceptance cases

- **P05-A01:** Persistence/console/network traces contain ciphertext or approved headers only.
- **P05-A02:** Wrong passphrase, altered AAD, unsupported schema and excessive KDF cost refuse without mutation.
- **P05-A03:** Quota/fault injection leaves original records readable and no partial import installed.
- **P05-A04:** Concurrent revision changes invalidate a previously approved import/delete plan.
- **P05-A05:** Lock/sleep/key replacement during decryption prevents late render, commit and export.
- **P05-A06:** Download alone stays unverified; read-back comparison proves exact selected identity/scope.
- **P05-A07:** Retention never selects recovery-critical, pending or security-evidence records automatically.
- **P05-A08:** Legacy profile/keystore formats remain compatible and domain-separated.
- **P05-A09:** Browser-process restart preserves atomic state; private-mode/storage-unavailable paths fail honestly.
- **P05-A10:** Spec 18 recovery is referenced and qualified separately, never replaced by metadata backup success.
- **P05-A11:** Preview creation and unapproved/forged/serialized plans cannot mutate storage; only the reviewed candidate digest can be approved.
- **P05-A12:** Changed candidate bytes, wrong revision/profile/epoch, expiry and clock rollback invalidate commit authority without touching originals.
- **P05-A13:** Concurrent/repeated commits consume a plan at most once; interrupted completion is reconciled by durable revision before another import plan is made.

## 10. Implementation slices and future checks

Slice 1 freezes record classes and current codec compatibility fixtures. Slice 2 adds consumer storage ports and revision-bound previews. Slice 3 integrates lock, read-back verification and retention exclusions. Slice 4 independently checks real browser restart, quota, concurrency and source-preserving recovery.

Existing verification commands for future implementation; **not run here**:

```bash
npm run test -w @ghostpay/ux-vault
npm run typecheck -w @ghostpay/ux-vault
npm run lint -w @ghostpay/ux-vault
npm run test -w @ghostpay/secret-box
npm run test -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## 11. Migration, rollback and decisions

Migrate copy-on-write with read-back verification and retained originals. Do not reinterpret a legacy encrypted file as a new schema solely by filename. Rollback remains possible until explicit cleanup confirmation and recovery proof. Decide retention defaults, authenticated index metadata and no-vault re-auth behavior without weakening spec 18. No new cryptographic primitive, recovery guardian or mandatory account is introduced.
