# SellerKeys preflight ownership — independent recovery plan

Date: 2026-11-20. Scope: read-only review of immutable local Git source. No tests were executed, no source or references were changed, and no service was started.

## Recommendation

Recover three small ownership checks on top of frozen idle integration `1ca7105e050f7d76aee18fe3efee3cd02cd72cb4`. Use refreshed #314 `e6ed3ee64a786c33b1af06b5fc7a51d742eb6544` as the behavioral donor. Its runtime is `49535f3bdbdda6f133e397097e56a8dde8413d94`; SellerKeys runtime source is identical at these two donor commits. Do not transplant the donor component wholesale: that would remove the idle suspension subscription and gates.

### Minimal product changes

1. **Export authorization continuation.** Current `onExport` awaits `authorizeKeyExport` and immediately invokes `exportKeystore`. Its ownership/session checks occur only after encryption. Add the donor's current-controller check and captured `unchanged()` check immediately after authorization and before encryption. A retired continuation must return without starting encryption. Adapt the result handler for an absent result. Preserve step-up authorization, the post-encryption session check, download error handling and download verification semantics.
2. **Unlock preflight owns the unlock controller.** Current `onUnlockVault` reads `loadedKeysRecoverable` before creating a controller; the read checks mount/session identity but not cancellation or operation supersession. Start the unlock controller and `unlockBusy` before this read. Check that same controller and captured session after resolution; pass the controller into `unlockVault` for the decrypt stage. A false result releases its own busy state and opens replacement confirmation. A rejected or stale preflight releases only its own owner; a retired owner stays silent. Avoid an unconditional preflight finalizer that clears a controller handed to decryption. Confirmation starts a fresh owner. Preserve explicit passphrase-edit, app-lock, cancellation and unmount boundaries.
3. **Synchronous durable-write owner.** Current disabled controls and `vaultWriteBusy` preserve pending-write lifetime, but handlers have no synchronous shared owner guard. A forced second save submission can start another save and replace `saveOperation` ownership. Add an independent ref/token shared by save/delete, checked before the helper call and cleared only by the initiating write's settlement. Reject save/delete while an unlock owns preflight/decryption; reject both ordinary and confirmed unlock while a durable write owns the slot. Cancellable operation retirement, input edits, session replacement and app lock must never clear this token or `vaultWriteBusy`. Preserve the current save guard/`VaultSavedForPreviousKeysError`, exact-ciphertext deletion and vault reauthentication behavior.

These changes can retain the current `operation` controller ref, `operationKind`, `unlockBusy`, `verifyBusy`, `busy` and `vaultWriteBusy`. The donor's larger `KeyOperation`/`pendingOperation` state conversion is not required for these missing behaviors. If a retirement helper is introduced, it must act only on the controller it owns and must not increment generation when the component observes its own installed session.

## Donor component cases: 17 expanded cases

| Donor case group | Cases | Frozen-current disposition |
| --- | ---: | --- |
| Superseded export authorization must not start encryption | 1 | Missing continuation check |
| Export to verification, late resolve/reject | 2 | Existing ownership behavior; stronger assertions |
| Verification to export, late resolve/reject | 2 | Existing ownership behavior; stronger assertions |
| Unlock to verification/export, late resolve/reject | 4 | Retained #307 unlock busy ownership; stronger matrix |
| Verification to unlock; late verification success | 1 | Existing decryption ownership behavior |
| Cancel verification, start newer verification, preserve edited passphrase | 1 | Existing controller/generation behavior |
| Verification retired by lock, session replacement or unmount | 3 | Existing cancellation boundaries; complements actual idle tests |
| Save remains busy through cancel/session/lock; forced form resubmit rejected | 1 | Lifetime retained; synchronous resubmit check missing |
| Pending deletion survives unlock edits, verification cancellation and lock | 1 | Existing durable-write lifetime |
| Canceled unlock preflight resolves after durable deletion starts | 1 | Missing preflight owner |

This is a source disposition, not a claim that tests were run or passed. The donor component suite uses deferred helper mocks and synthetic ciphertext to isolate ownership; it is not cryptographic or storage-integrity qualification.

### Focused acceptance

- Retain the donor's three gap-exposing cases: superseded authorization never invokes encryption/download; forced resubmit never starts a second save; canceled preflight cannot start unlock or release pending deletion.
- Qualify the new preflight terminal paths: false recoverability exposes confirmation and releases unlock busy; rejection releases only its own busy state; cancellation/edited inputs suppress late completion. Maintain a current-controller check before presenting any stale confirmation/error.
- Preserve the frozen-current deletion test's **session replacement** boundary. The donor's newer deletion case covers input edits, verification cancellation and lock, but omits that explicit boundary; replacing the current file without reconciling it loses coverage.
- Preserve `SellerKeys.completion.test.tsx`, especially own import/unlock success after session effects, identical-public-key replacement, explicit edit, and later deletion during a held unlock return. Preserve recovery/lock tests and idle suspended-copy tests. The session effect must still clear cancellable controls without incrementing `generation`; `ownCompletion` must still require exact installed `SessionPublic` object identity.
- The suspended-copy path must still allow encrypted export/verification/save and normal authorized unlock while hiding ordinary public identity/archive/registry access. Preserve backup guards and the independent durable-write lifetime; do not change key-vault, session, Sweep, fee or contract semantics as part of this recovery.

## Browser donor source review

`apps/web/e2e/backup-ownership.spec.ts` adds two journeys: export superseded by verification, and verification superseded by export followed by verification cancel/retry. It creates and rereads a real downloaded keystore; the delay hooks hold native AES-GCM completion or the designated uploaded file's read without replacing results or importing product internals. It counts downloads, checks current controls/notices, and completes real verification. Requests outside the local preview origin are blocked.

The selectors match the current SellerKeys form and existing backup E2E selectors. Current Playwright configuration uses the local preview, prepared manifest fixture, blocked service workers and installed Chromium; no new product fixture or dependency is apparent from source. The donor sets 120-second case timeouts because it retains production crypto costs. Use the refreshed head's browser spec: it differs from runtime `49535f3b` by follow-up test changes. These journeys do **not** cover delayed vault recoverability, durable save/delete or actual idle suspension; component cases and existing idle/completion suites remain necessary. Browser execution was not performed here.

## Exact source pins

| Path | Frozen idle blob | Refreshed donor blob |
| --- | --- | --- |
| `apps/web/src/views/SellerKeys.tsx` | `84c801a8e9eb1550a96802177045360988c85900` | `d509e675dda2910850c4a95a5697761107807f69` |
| `apps/web/src/views/SellerKeys.operation.test.tsx` | `29fd9ccaf8226c501e7c1d6e075822960507017c` | `05c846289be5827c2e9028c28661b1c2f242c9b0` |
| `apps/web/e2e/backup-ownership.spec.ts` | Absent | `78bc60dcd7e871166d632dd3b92302cc643eac8e` |

No blocker to a narrow recovery was found in the reviewed source. Integration and runtime qualification remain root-owned.
