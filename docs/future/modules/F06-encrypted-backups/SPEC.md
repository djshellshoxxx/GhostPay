# F06 — Encrypted backup and independent recovery workflow

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f06-encrypted-backups`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **SPECIFICATION ONLY; implementation and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- This future workflow does not modify current beta gates, deployed behavior, or existing fee decisions.

## Objective and user journeys

Provide a coherent backup and recovery workflow for user-selected keys, merchant records, identities, and unresolved transactions. Users must distinguish creating an archive, retaining a copy, verifying that exact copy, and restoring it successfully.

1. User selects a backup scope and reviews precisely which key roles and records it contains or excludes.
2. Existing providers encrypt/authenticate the package locally. The browser offers a neutral filename and a deliberate download.
3. User reselects the saved file; verification authenticates the complete file and validates recoverability without changing the current profile.
4. On a fresh device, restore opens an isolated staging profile, previews conflicts and missing capabilities, and applies only after explicit confirmation.

[Spec 18 / requirement 3q](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md) is an existing beta prerequisite for independent per-stealth key recovery. F06 extends the product workflow around multiple data categories. It must not reclassify Spec 18 as deferred, replace its formats, or weaken its gates. Guardian/social recovery remains out of scope.

## Provenance and existing source

Future source: [encrypted backup proposal](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/06-encrypted-backups.md).

| Existing source / export | Reuse | Residual gap |
|---|---|---|
| [ux-vault/src/backup.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/backup.ts): `createBackup`, `decodeBackup`, `backupToText`, `backupFromText` | Authenticated address-book backup format | These exports are address-book-specific, not proof of complete wallet recovery |
| [ux-vault/src/keystore-portable.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/keystore-portable.ts): `createKeystoreApi` | Shared keystore codec | Multi-component manifest and scope-aware workflow |
| [keystore.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/keystore.ts): `encryptKeystore`, `validateKeystoreEnvelope`, `decryptKeystore` | Browser codec adapter | Saved-byte verification and staged product restore orchestration |
| [ux-vault/src/merge.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/merge.ts): `mergeBooks` | Explicit address-book merge report | Transactional cross-component conflicts and revision checks |
| [secret-box/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/secret-box/src/index.ts): `SecretBox`, `SecretScope`, `withScopeAsync` | Existing limited secret-lifetime mechanisms | Compose through P06 without exposing keys in UI state |

## Ownership and dependencies

Own proposed `apps/web/src/features/future/encrypted-backups/`: scope chooser, manifest preview, export/verify state machine, restore staging, and recovery report.

Hard providers: [P05 encrypted state/recovery](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state), [P06 key roles](https://github.com/djshellshoxxx/GhostPay/tree/future/p06-key-role-separation). Optional [P07 encrypted sync](https://github.com/djshellshoxxx/GhostPay/tree/future/p07-encrypted-device-sync) may transport ciphertext after separate consent; backup must work without it.

Providers own encryption, KDF policy, canonical codecs, key validation, and atomic persistence. F06 does not add cryptographic primitives, store passwords, auto-upload archives, introduce cloud accounts, or promise recovery without retained secrets/material.

## Proposed versioned model and API

```ts
interface BackupSelectionV1 {
  readonly schema: 'ghostpay.backup-selection/1';
  readonly profileRef: string;
  readonly revision: string;
  readonly components: readonly ('keys' | 'identities' | 'invoices' |
    'receipts' | 'contacts' | 'pending-transactions')[];
  readonly role: 'watch-only' | 'signing';
}
interface BackupVerificationV1 {
  readonly schema: 'ghostpay.backup-verification/1';
  readonly fileDigest: string;
  readonly componentVersions: Readonly<Record<string, string>>;
  readonly capabilities: readonly string[];
  readonly unresolvedRecords: number;
  readonly result: 'verified' | 'incomplete' | 'unsupported';
}
interface BackupWorkflowProvider {
  readonly capability: CapabilityDescriptorV1;
  export(selection: BackupSelectionV1, secret: SecretHandle,
    ctx: OperationContext): Promise<ModuleResult<{ archive: SecretHandle }>>;
  verify(savedFile: SecretHandle, secret: SecretHandle,
    ctx: OperationContext): Promise<ModuleResult<BackupVerificationV1>>;
  stageRestore(savedFile: SecretHandle, secret: SecretHandle,
    ctx: OperationContext): Promise<ModuleResult<{ stageId: string; conflicts: readonly string[] }>>;
  commitRestore(stageId: string, expectedRevision: string,
    ctx: OperationContext): Promise<ModuleResult<{ profileRef: string }>>;
}
```

Component manifest, source profile identity, key roles, creation revision, and component digests are authenticated inside the encrypted package. Only minimal codec/KDF routing information is outside, as dictated by reviewed provider formats. Amounts in archived records remain decimal strings and are revalidated as `bigint`; private keys and passwords travel only through scoped handles.

## Lifecycle and failure/recovery

Export states: scope-selected → encrypting → generated → download-requested → user-retention-confirmed → saved-file-verified. A click or browser download event does not establish durable retention. Verification binds the exact selected bytes/digest; selecting another file clears the previous success.

Restore states: untrusted file → bounded envelope check → authenticated decode → component validation → isolated staging → conflict preview → confirmed commit. Nothing mutates the active vault before authenticated validation and confirmation. Unknown components produce explicit partial/unsupported results rather than silently disappearing.

Lock, password replacement, profile change, cancellation, and session-epoch advancement revoke pending operations. Delayed decrypt/export completion must check context before releasing output or marking verification. Staging uses revision comparison so another tab cannot have its updates overwritten. On crash, either the old profile remains intact or a committed successor is discoverable; no half-restored active profile.

Rollback detection is qualified: a known local newer revision can reject or warn about an older archive; a completely fresh device cannot prove the archive is the latest without trusted external evidence. Recovery reports list unresolved transfers and gaps. Resume never automatically rebroadcasts a pending transaction or deletes the only recoverable key copy.

## Validation and proposed budgets

- Bound the outer file before KDF work; initial product ceiling 16 MiB, additionally constrained by each codec's existing maximum. Larger archives require reviewed streaming support.
- ≤32 components, ≤10,000 metadata records per component initially; reject duplicate IDs, inconsistent hashes, and unknown required versions.
- Enforce existing provider KDF parameter allowlists and resource ceilings; do not select new work factors from this UI specification.
- Proposed one active KDF/restore worker per session with visible cancellation; benchmark on supported mobile devices before defining timing guarantees.
- Validate every recovered key pair/address relation through P06, not just the first key or successful AEAD decryption.
- Neutral filenames omit merchant names, balances, addresses, and key roles. Error messages contain codes and affected component types, never secret content.

## Privacy and recovery threat table

| Event / observer | Limitation | Required response |
|---|---|---|
| Archive stolen | Offline password guessing possible | Existing reviewed KDF; accurate passphrase guidance |
| Cloud storage chosen by user | Ciphertext size/timing exposed | Optional explicit transfer; no default upload |
| Shared device after restore | Secrets available while unlocked | Scoped key handles and lock disposal |
| Old authentic archive imported | Authentic does not mean newest | Revision warning where verifiable; fresh-device caveat |
| Password and all copies lost | No publisher recovery capability | Honest recovery report; no guardian placeholder |

## Fee behavior

Local backup, saved-file verification, and restore are essential recovery functions and are not newly fee-gated. They must remain available when optional paid modules or gateways are unavailable. Optional external storage may have its own separately disclosed costs; no sync quote is requested merely by opening the backup dialog. This spec sets no fee rate, recipient, or new payment path.

## Acceptance matrix

| ID | Case | Required outcome |
|---|---|---|
| F06-A01 | Download clicked but file not reselected | No verified/retained guarantee |
| F06-A02 | Wrong password, corrupted tag, truncation | No active-profile mutation |
| F06-A03 | One invalid key among many valid keys | Entire required key component rejected |
| F06-A04 | Saved file differs from generated bytes | Verification tied to actual selected file; no inherited success |
| F06-A05 | Watch-only archive restored | No signing capability granted |
| F06-A06 | Concurrent profile update during staging | Commit rejected as stale; both states preserved |
| F06-A07 | Lock during decrypt/export | No late key installation or downloadable secret output |
| F06-A08 | Crash before/after commit boundary | Exactly one intact active profile generation |
| F06-A09 | Pending transactions in archive | Recovery report preserves uncertainty; no automatic resend |
| F06-A10 | Existing Spec 18 independent recovery | Remains compatible and independently verifiable |
| F06-A11 | Fresh device imports old authentic archive | No unsupported “latest backup” assertion |

## Implementation slices and existing commands

1. Scope/component manifest adapter using provider codecs; verify precise coverage reporting and watch-only semantics.
2. Export and saved-file verification coordinator; verify byte binding, fresh consent, cancellation, and neutral filenames.
3. Transactional restore staging/conflict UI; verify all-or-nothing application and concurrent writes.
4. Proposed `apps/web/e2e/future-backup-recovery.spec.ts` and fresh-profile drills; preserve separate standalone recovery acceptance from Spec 18.

Scripts exist in inspected manifests; **not executed for this spec-only branch**:

```sh
npm run test -w @ghostpay/ux-vault
npm run test -w @ghostpay/secret-box
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Rollout, migration, rollback, decisions

Default disabled until P05/P06 and current recovery prerequisites qualify. Read existing formats through existing codecs; introduce a versioned aggregate manifest only when compatibility is documented. Never rewrite the sole backup in place. Migration offers a new file plus verification while retaining the old independently readable copy.

Rollback disables aggregate creation but preserves old/new supported decoders and access to unresolved-key recovery. Owner decisions: initial component set, default selection, retention messaging, cross-device test matrix, and handling of optional unrecognized components. No implementation can label a backup “complete” without defining the scope against which completeness was checked.
