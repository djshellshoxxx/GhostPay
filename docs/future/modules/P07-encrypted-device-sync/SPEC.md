# P07 — Optional encrypted device synchronization

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P07` / `encrypted-device-sync` |
| Branch | `future/p07-encrypted-device-sync` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | [P05](https://github.com/djshellshoxxx/GhostPay/blob/future/p05-encrypted-local-state/docs/future/modules/P05-encrypted-local-state/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md) |
| Optional integrations | [P02](https://github.com/djshellshoxxx/GhostPay/blob/future/p02-rpc-policy/docs/future/modules/P02-rpc-policy/SPEC.md) |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Let a user exchange selected encrypted records between independently authorized devices using manual files or an explicitly chosen ciphertext store. Keep GhostPay usable without an account, synchronization provider or publisher-operated service. A remote store sees ciphertext and metadata only; it cannot alter spending authority or become required for recovery.

Sources: [issue #284 P07](https://github.com/djshellshoxxx/GhostPay/issues/284) and [issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283). P05 owns encrypted record/merge primitives and P06 owns device authentication. P02 is optional for a user-selected network transport port; manual file exchange must work without it.

## 2. Existing implementation and remaining delta

- [Settings exchange](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/settingsExchange.ts) exports `buildSettingsExport`, `parseSettingsExchange`, `previewSettingsExchange`, `needsTrustConfirmation`, and `applySettingsExchange`. These are explicit import/export helpers, not synchronization.
- [Seller pairing](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sellerPairing.ts) exports `exportSellerPairing` / `parseSellerPairing`; do not reinterpret public pairing as secret-sharing consent.
- [Backup codecs](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/backup.ts) provides `createBackup`, `decodeBackup` and text conversion; [merge helpers](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/merge.ts) is existing logic to reconcile.
- [Secret lifetime](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/secret-box/src/index.ts) and [session](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/session.ts) provide scoped secrets and epoch guards.

The delta is authenticated device membership, bounded encrypted change bundles, explicit conflict resolution and rollback detection across an untrusted store. No existing file exchange is described as proven end-to-end encrypted continuous sync.

## 3. Scope and ownership

Own a pure sync planner, signed/encrypted bundle validation and optional transport adapters. P05 performs atomic durable merges; P06 authenticates devices. Product F11 owns team permissions, and F06 owns recovery presentation. P07 must not import these consumers or infer team spending authority from a device record.

Default selected scope is nonsecret preferences and encrypted metadata only. Keys, pending transaction authorizations and recovery-critical state require separately approved scope and explicit preview. No plaintext secrets, witness material, bearer invoices or contact aliases enter object names, request headers or URLs.

## 4. Proposed data and API

```ts
interface SyncEnvelopeV1 {
  version: 1; channelId: string; deviceId: string;
  deviceEpoch: string; sequence: string;
  previousDigest: string | null; payloadDigest: string;
  encryptedPayload: string; signature: string;
}
interface SyncSelectionV1 {
  version: 1; profileScope: string;
  recordKinds: readonly string[];
  includeRecoveryMaterial: false;
}
interface EncryptedSyncProvider {
  export(selection: SyncSelectionV1, device: SecretHandle,
    ctx: OperationContext): Promise<ModuleResult<SyncEnvelopeV1>>;
  preview(envelopes: readonly SyncEnvelopeV1[], ctx: OperationContext):
    Promise<ModuleResult<SyncMergePreview>>;
  commit(plan: SyncPlanHandle, ctx: OperationContext):
    Promise<ModuleResult<SyncRevision>>;
  capability(): CapabilityDescriptorV1;
}
```

Use independent opaque channel/device identifiers; never reuse public wallet addresses as storage identifiers. Bind version, channel, device epoch, sequence, payload digest and previous digest to device authentication and encryption AAD. Exact cryptographic suite/rotation requires an accepted ADR; no custom cryptography is specified here.

## 5. Lifecycle, concurrency and failures

1. Pair devices through an explicit authenticated local exchange, showing fingerprints and permitted record classes.
2. Preview selected scope; encrypt locally using reviewed P05 primitives and authenticate with P06 device role.
3. Save/export a bounded bundle, or send through a separately consented transport. Provider account credentials are outside the bundle.
4. Download only after consent; validate size, membership, epoch, signature and sequence before decrypting/previewing.
5. Show conflicts and trust-policy changes. Apply a P05 revision-bound atomic merge only after approval.
6. Forked histories and conflicting tombstones require explicit resolution; latest wall-clock timestamp never wins sensitive conflicts automatically.
7. Lock, cancellation, device removal or session change discards pending plaintext and late merges.

Remote deletion is not secure erasure, and revoked devices may retain old plaintext/keys. Device revocation rotates future encryption membership and preserves independent recovery. Browser closure stops optional work; there is no service-worker signer or unattended background transfer. Reorged/imported payment records stay historical hints until independently revalidated.

## 6. Proposed resource limits

Allow eight active devices per channel, 10,000 records per preview, 16 MiB decoded bundles and 1 MiB individual records, subject to stricter P05 limits. Limit remote concurrency to two reads and one write; requests have 30-second deadlines and streaming byte caps.

Sequence values are bounded unsigned 64-bit decimal strings. Keep a bounded authenticated high-water mark and unresolved-fork inventory; do not trim evidence needed to detect replay. No permanent polling loop by default. Explicit sync sessions have a five-minute deadline and stop on lock or policy change. All budgets require mobile tests before activation.

## 7. Privacy and trust matrix

| Observer / failure | Exposure or risk | Treatment |
|---|---|---|
| Ciphertext store | IP, channel, timing, size, access patterns | User choice, opaque paths, optional transport and truthful disclosure |
| Authorized device | Selected decrypted data | Least scope and explicit membership |
| Revoked device | Previously received data | Future rotation; no false remote-erasure claim |
| Malicious store | Replay, omission, reorder, forks | Authenticated sequence/digest chain and visible conflicts |
| Compromised device | Authorized material and signatures | Device-specific keys; local revoke and recovery |
| Imported settings | Weaker privacy/trust policy | Explicit diff and renewed consent; no silent activation |

## 8. Pricing policy

Manual encrypted exchange and local merge remain free. Optional third-party storage or a self-hosted service may have a separately disclosed price; choosing sync does not authorize protocol payments. P07 does not configure fee recipients, charge per decrypt or require a subscription to recover local data. A store outage cannot hold funds or keys hostage.

## 9. Acceptance cases

- **P07-A01:** Manual two-device exchange works without network or publisher account.
- **P07-A02:** Remote traces expose only ciphertext/approved public headers and opaque object names.
- **P07-A03:** Replay, reordered sequence and forked predecessor fail or produce explicit conflict without mutation.
- **P07-A04:** Wrong device/channel/epoch/signature refuses before merge.
- **P07-A05:** Lock or concurrent local revision change invalidates the approved merge plan.
- **P07-A06:** Revoked devices cannot authenticate future changes; prior-data limits are accurately described.
- **P07-A07:** Tombstone conflicts preserve recoverable source data and never delete sole-copy keys automatically.
- **P07-A08:** Malformed or oversized bundles refuse atomically; storage quota does not destroy originals.
- **P07-A09:** Imported endpoint/trust changes require renewed disclosure and consent.
- **P07-A10:** Provider outage leaves local records, manual export and canonical recovery usable.

## 10. Slices and future checks

Slice 1 defines device membership and immutable fixtures. Slice 2 implements manual bundles/conflict preview. Slice 3 integrates atomic P05 merges and P06 epochs. Slice 4 adds one optional transport and independent replay, leakage and device-revocation review.

Confirmed existing scripts for future implementation; **not run here**:

```bash
npm run test -w @ghostpay/ux-vault
npm run test -w @ghostpay/secret-box
npm run test -w @ghostpay/qr-exchange
npm run test -w @ghostpay/web
npm run typecheck -w @ghostpay/web
npm run build -w @ghostpay/web
```

New sync-specific package commands are not asserted to exist. Add meaningful tests alongside its eventual owning module and record actual engine/device results separately.

## 11. Migration, rollback and decisions

Legacy backups remain importable through explicit adapters; they are not signed sync history retroactively. Rollback disables transport and keeps verified local records, source bundles and recovery copies. Resolve encryption membership, sequence-fork recovery, allowed record scope and service credential storage before implementation. Recovery-secret sync requires a separate explicit decision; this version excludes it.
