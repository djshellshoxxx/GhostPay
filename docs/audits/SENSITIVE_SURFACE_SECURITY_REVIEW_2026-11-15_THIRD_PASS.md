# GhostPay sensitive-surface security review — third pass

Date: 2026-11-15  
Repository: `djshellshoxxx/GhostPay`  
Reviewed ref: `chatgpt/ghostpay-pages-second-pass-notes-20261115`  
Review type: targeted manual source audit; no production code changed.

## Executive summary

The third pass concentrated on the parts of GhostPay where a defect could expose seller keys, authorize an unintended transaction, lose access to funds, or allow relayer abuse.

**One high-severity issue remains confirmed and unresolved: PAGES-02-R2, the unverified-backup invoice gate bypass.** This was reported in the second-pass review and is still present at the reviewed ref. It remains the priority remediation.

No additional independently confirmed exploitable defect was established in the sensitive paths inspected during this pass. This is not a clean bill of health: the review was source-based and did not include a full dynamic browser, wallet, RPC-adversary, or deployed-relayer penetration test.

## Finding SENSITIVE-03 — unverified keystore download still satisfies invoice gate

**Severity: High — potential irreversible loss of payment access**  
**Status: Confirmed; previously reported; unresolved**  
**Affected:** `apps/web/src/lib/session.ts`, `apps/web/src/views/SellerKeys.tsx`, `apps/web/src/AppShell.tsx`

### Evidence

1. `markKeystoreDownloaded` records a download as `external: 'unverified'`.
2. `setCustody` derives `backedUp` as true whenever `external !== 'none'`; it derives `verified` separately.
3. `BackupGate` currently renders its protected children when `backup.backedUp` is true. It does not require `backup.verified`.
4. `AppShell` places `CreateInvoice` behind this gate.
5. Therefore a seller can create and share payment requests after a download that has not been reopened and checked against the loaded keys.
6. The idle-lock path deliberately does not wipe keys when the only copy is unverified. That is safer while the tab remains alive, but it cannot protect against reload, tab closure, browser-profile loss, or device loss.

### Impact

A seller may receive funds at a stealth address while lacking a verified recovery copy of the spending/viewing keys. If the browser-held keys are subsequently lost and the downloaded file is missing, damaged, or belongs to another key set, those funds may become inaccessible.

This is a local availability / custody failure, not evidence of a remote attacker being able to steal keys.

### Required correction

- Gate invoice creation on `backup.verified === true || backup.waived === true`, not `backup.backedUp`.
- Preserve the existing `signerOnly` / payments-only exception for imported hex payment keys with a newly generated invoice signer.
- Show a distinct gate state for a downloaded-but-unverified file and direct the seller to the verify-backup action.
- Add regression tests for: unverified download remains blocked; matching verification unlocks; explicit waiver unlocks; signer-only payments-only behavior remains unchanged.
- Recheck the full invoice creation and share flow after the change.

## Sensitive areas reviewed

### 1. In-memory key custody and session lifecycle

Inspected `apps/web/src/lib/session.ts` and `packages/secret-box/src/secretBox.ts`.

- Private spending, viewing, and signing scalars are held in `SecretBox` objects backed by a module-private `WeakMap`.
- Temporary scalar copies are wiped in `withSessionSecrets` and `withSessionSecretsAsync`.
- Session revision guards reject stale asynchronous operations after keys are replaced or cleared.
- Import and backup-verification paths wipe decrypted byte arrays and temporary scalars in `finally` blocks.
- The SecretBox documentation correctly treats same-realm script compromise as outside its protection boundary; this abstraction reduces accidental disclosure but cannot protect secrets from malicious code executing in the page.

No additional confirmed defect identified in the inspected session/SecretBox implementation. JavaScript zeroization remains best-effort and cannot guarantee removal of engine/runtime copies.

### 2. Encrypted local vault and backup step-up

Inspected `apps/web/src/lib/keyVault.ts`.

- IndexedDB stores encrypted keystore text, not raw key bytes.
- Writes use an add-if-empty transaction and re-check the session guard before commit.
- Deletes compare the expected ciphertext and delete within one read/write transaction.
- Unlocking refuses to replace unsaved in-memory keys without explicit confirmation.
- Sweeps tied to a vault require the corresponding passphrase and verify the decrypted keys against the loaded session.
- Cross-tab deletion/replacement is considered when deciding whether the local vault still counts as a recoverable copy.

No additional confirmed defect identified. Real-browser multi-tab upgrade, quota exhaustion, and browser storage eviction still require browser-level testing; fake IndexedDB tests cannot fully model all browser implementations.

### 3. Transaction decoding and policy review

Inspected `packages/tx-review/src/decode.ts` and `packages/tx-review/src/review.ts`.

- Transaction decoding uses a closed selector table and canonical ABI re-encoding.
- Unknown selectors, malformed calldata, unexpected native value, trailing bytes, non-canonical calldata, and unsupported authorization-list transactions fail closed.
- Typed-data decoding requires the expected primary type, exact field/type layouts, exact domain keys, and valid non-zero addresses.
- The review compares decoded signed fields with a separately supplied expected intent and applies manifest policy caps and allowlists.
- The implementation documents an important trust assumption: if a compromised caller derives both the displayed expectation and signed intent from the same tampered source, comparison alone cannot repair that compromise.

No additional confirmed defect identified in these modules. This review did not independently prove every call site invokes the guard immediately before every wallet prompt; that requires a full call-site and wallet-adapter audit.

### 4. Seller sweep signing and relayer handoff

Inspected `apps/web/src/lib/sweep.ts` and the visible sweep execution path.

- The one-time stealth secret is derived locally and its address is checked against the selected stealth address before use.
- The quote is checked for expiry, fee cap, and fee recipient before signing.
- The EIP-712 order binds chain, token, owner, destination, fee recipient, amount, fee, deadline, and nonce.
- A session guard is captured to detect key changes during asynchronous work.
- The client treats the relayer-returned transaction hash as a claim and instructs that it must be verified against the user's own RPC.

No additional confirmed defect identified in the reviewed portions. A full end-to-end test with a malicious RPC, altered relayer response, wallet rejection, and ambiguous broadcast outcome was not performed.

### 5. Relayer HTTP boundary and quote-token binding

Inspected `apps/relayer/src/server.ts`, `apps/relayer/src/validate.ts`, and `apps/relayer/src/quoteToken.ts`.

- The server rejects query parameters, validates configured origins, limits request bodies, uses strict JSON parsing, and applies per-IP/network-group rate limits.
- The metrics route uses constant-time comparison for its bearer token.
- Sweep request parsing rejects unknown object fields through strict object parsing and validates integer/address/signature shapes.
- Quote tokens are HMAC-bound to chain, token, owner, destination, amount, fee, fee recipient, and expiry; verification uses constant-time MAC comparison and supports an explicit previous-key rotation slot.

No additional confirmed defect identified in the inspected boundary code. Origin checks are browser CORS controls, not authentication; non-browser clients can call public relayer endpoints. The relayer must continue to rely on signatures, policy checks, rate limits, budgets, and on-chain validation rather than treating CORS as an authorization control.

### 6. Relayer transaction lifecycle and restart recovery

Inspected the relayer service and chain-client interfaces, including send outcome handling and state-journal restoration.

- The service distinguishes definitely refused sends from outcome-unknown sends.
- Unknown sends retain reservations and block the chain lane until reconciliation.
- Restored journal entries preserve reservations and reconcile transaction hashes where possible.
- The chain client signs raw transactions before broadcast and exposes the hash to the service before the send boundary.

No additional confirmed defect identified in the inspected sections. This area deserves a dedicated follow-up with fault injection around process crash windows, journal write failure, duplicate RPC forwarding, nonce advancement, and receipt reorgs. The present pass did not execute those scenarios.

### 7. Pages build and CI supply-chain controls

Inspected the Pages workflow and CI workflow sections.

- Actions are pinned to full commit SHAs.
- The Pages build uses `npm ci --ignore-scripts`, rebuilds workspace libraries from source, and avoids restoring shared compiled-library caches for the published artifact.
- The CI workflow uses least-privilege default permissions and separates deployment permissions from pull-request checks.
- Deployment is gated to an explicit workflow dispatch on the main branch with the deploy input enabled.

No additional confirmed defect identified in the inspected workflow sections. This does not validate repository/environment protection rules, organization-level secrets, branch protection, or the live Pages configuration; those require owner-side settings inspection.

## Recommended remediation order

1. **Fix SENSITIVE-03 / PAGES-02-R2 before enabling invoice creation for an unverified backup.**
2. Add call-site coverage proving every wallet signing prompt is preceded by transaction review against independently constructed intent.
3. Add relayer fault-injection tests for crash/restart, unknown broadcast outcomes, journal failures, and nonce reconciliation.
4. Run real-browser tests for IndexedDB multi-tab upgrades, quota failure, and storage eviction.
5. Independently inspect GitHub environment protection, branch rules, Pages origin, and release signing-key configuration before any deployment decision.

## Limitations and disposition

- Source review only; no production runtime, wallet, or deployed endpoint was attacked.
- No cryptographic primitive or contract bytecode audit was performed.
- No CI was run as part of this documentation-only audit pass.
- No application code, branch protection, release configuration, deployment, or merge was changed.

**Disposition: keep the Pages freeze. Treat the backup gate as a release-blocking issue until corrected and regression-tested.**
