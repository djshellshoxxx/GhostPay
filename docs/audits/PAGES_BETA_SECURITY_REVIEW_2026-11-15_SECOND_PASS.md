# GhostPay Pages beta — security review, second pass

Date: 2026-11-15  
Reviewed PRs: #165 and #166  
Reviewed heads:
- #165: `9b3a3070499a2a6d70349d540f7aaaed006426e9`
- #166: `f3872e90eb255b46a773d78f4f5adb6239db2b4f`

## Scope and method

This was a targeted manual source review of the Pages-only backup verification, idle-lock, IndexedDB recovery, QR classification, bounded relayer-response handling, Pages artifact verifier, and post-deployment smoke-test changes. The review compared the implementation with its tests and documented security intent. It was not a full repository audit, dynamic penetration test, or independent cryptographic review.

## Finding PAGES-02-R2 — unverified backup still clears the invoice-creation gate

**Severity: High — potential irreversible loss of payment access**

**Affected code:** `apps/web/src/views/SellerKeys.tsx`, exported `BackupGate`; `apps/web/src/lib/session.ts`, `setCustody`.

**Evidence:**

1. `setCustody` sets `backedUp = true` when `external !== 'none'`. `markKeystoreDownloaded` changes an unverified download to `external: 'unverified'`. Therefore a download that has not been reopened and verified produces `backedUp: true`, `verified: false`.
2. `BackupGate` returns its children whenever `backup.backedUp` is true. It does not require `backup.verified`.
3. The `CreateInvoice` view is wrapped in `BackupGate` by `AppShell`. Thus a seller can create invoices and receive payments after a download that the UI itself says is not verified.
4. The new idle-lock path correctly keeps keys in memory when the only copy is unverified. That does not protect against closing/reloading the tab, browser-data loss, or device loss. If the downloaded file was not actually saved or is unusable, payments to that meta-address may become unrecoverable.

This contradicts the stated purpose of GP-PAGES-02: a download alone does not prove that a recoverable backup exists. The visible warning reduces the chance of user error but does not enforce the backup gate.

**Recommended correction:**

- Make invoice creation require `backup.verified === true` or the explicit `backup.waived === true` acknowledgement. Do not use `backedUp` as the gate predicate.
- Keep the separate `signerOnly` / payments-only exception exactly as designed; do not accidentally block payments that remain recoverable from typed hex.
- Give the gate distinct copy for “downloaded but not verified”, with a direct link to Seller keys and Verify backup.
- Add regression tests proving that an unverified download does not unlock invoice creation, that successful verification does, and that the explicit waiver still works.
- Add a case for hex-imported payment keys with a generated signer so the C-R10 exception remains intact.

No production change is made by this audit note.

## Other areas reviewed

### Backup verification

The verification routine compares the meta-address, signer public key, spending public key, and viewing public key; it does not import or replace keys. It checks the session guard around the asynchronous decrypt and wipes decrypted byte arrays and temporary scalars in a `finally` block. The component caps the selected file size before reading it. I found no additional confirmed defect in this path during this pass.

### Idle locking

The wall-clock deadline is checked on visibility restoration, focus, pageshow, a periodic interval, and the first activity after the deadline. A lock-once guard prevents repeated lock events within one idle period. Existing tests cover sleep-like clock advancement and visibility/activity paths. No additional confirmed defect identified.

### IndexedDB recovery

Both vault adapters clear failed/blocked open promises, close late-success connections after a blocked request, drop connections on version change/close, and retry an operation once when `transaction()` throws `InvalidStateError`. Quota errors are distinguished. The new fake-IDB tests exercise these branches. Remaining validation gap: fake-IDB tests do not fully reproduce browser-specific multi-tab upgrade and quota behavior; retain real-browser coverage for those cases.

### QR classification

The bearer-link classification now takes precedence over testnet, unsigned, and unverified flags. That preserves the warning that anyone seeing the QR can read the invoice. The added tests cover the precedence cases. No additional confirmed defect identified.

### Optional relayer client response bound

The streamed response reader counts bytes and cancels once the 16 KiB limit is exceeded. This avoids buffering an arbitrarily large normal Fetch response. The no-body fallback is appropriate for standard Fetch responses, where a null body has no payload. No additional confirmed defect identified.

### Pages artifact verifier and smoke test

The verifier now strips HTML comments before checking CSP and active tags, and checks quoted/unquoted `src`/`href` forms. The smoke-test URL classifier checks both origin and project subpath. These are useful hardening changes. This review did not establish that the regex-based HTML verifier is a complete HTML parser; it should remain a defense-in-depth artifact check, not the sole CSP assurance.

## CI evidence at review time

- PR #165: application CI, Pages artifact/browser acceptance, beta acceptance, CLI qualification, and hosting kit all passed on its exact head. Pages deploy and post-deployment smoke jobs were skipped.
- PR #166: Pages artifact/browser acceptance, beta acceptance, CLI qualification, and hosting kit passed on its exact head. Application CI was still running when checked; no failure had been reported.
- Passing CI is not a substitute for review of the finding above. Neither PR is a deployed or production-qualified release.

## Disposition

**Do not treat the Pages beta backup gate as complete until PAGES-02-R2 is fixed or the product owner explicitly accepts the risk.** Keep the existing deployment freeze and do not infer deployment authorization from successful build or acceptance workflows.
