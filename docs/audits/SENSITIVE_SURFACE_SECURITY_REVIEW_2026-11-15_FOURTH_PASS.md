# GhostPay sensitive-surface security review — fourth pass

Date: 2026-11-15  
Repository: `djshellshoxxx/GhostPay`  
Reviewed ref: `chatgpt/ghostpay-sensitive-surface-audit-20261115`  
Review type: targeted source audit of wallet authorization, signing boundaries, relayer startup/wiring, and transaction-state durability. Documentation only.

## Executive summary

This pass traced the sensitive operations more deeply through their call paths:

- payer wallet connection, transaction submission, and EIP-712 signing;
- payment and approval pre-sign review;
- direct and relayed seller sweep signing;
- relayer startup, hot-key loading, quote-token verification, and on-chain send;
- journal persistence, nonce ownership, and single-process locking.

**No new independently confirmed exploitable vulnerability was established in the paths inspected.** The previously confirmed high-severity backup-gate defect (PAGES-02-R2 / SENSITIVE-03) remains unresolved and must still block release.

This is a source-level review, not a live wallet/provider attack, deployed-relayer penetration test, or independent smart-contract audit.

## Finding carried forward — unverified backup bypasses invoice gate

**Severity: High — potential irreversible loss of payment access**  
**Status: Confirmed, previously reported, unresolved**  
**Files:** `apps/web/src/lib/session.ts`, `apps/web/src/views/SellerKeys.tsx`, `apps/web/src/AppShell.tsx`

The earlier finding remains valid: a downloaded keystore is recorded as `external: 'unverified'`; `backedUp` becomes true for any external backup state; and `BackupGate` uses `backedUp` rather than `verified` or an explicit waiver. Invoice creation can therefore proceed before the downloaded file has been verified against the loaded keys.

**Required:** block invoice creation unless `verified === true` or `waived === true`, while preserving the signer-only/payments-only exception. Add regression tests for unverified download, successful verification, explicit waiver, and signer-only behavior.

## Fourth-pass review details

### 1. Payer wallet authority and transaction submission

**Inspected:** `apps/web/src/lib/wallet.ts`, `apps/web/src/lib/payExec.ts`

Observed controls:

- Wallet connection compares `eth_requestAccounts` with `eth_accounts` and checks the configured chain.
- The app rechecks account and chain before signing or sending.
- A temporary authority guard watches `accountsChanged`, `chainChanged`, and `disconnect` events where the provider supports listeners.
- The transaction-attempt journal is written before the provider send call; a returned transaction hash is preserved if journal completion fails.
- Provider errors after initiating `eth_sendTransaction` are treated as an unknown submission outcome, not proof that nothing was broadcast.
- When a user RPC is configured, the returned transaction is compared with the intended sender, destination, calldata, value, and chain. The app avoids claiming verified success when the transaction cannot be independently matched.

No additional confirmed defect identified in the inspected flow. Residual limitation: a wallet provider and a separately configured RPC can both be malicious or inconsistent; the application cannot make a compromised wallet/provider trustworthy.

### 2. Payment and approval authorization

**Inspected:** `apps/web/src/lib/payExec.ts`, `apps/web/src/lib/txGuard.ts`, `packages/tx-review/src/decode.ts`, `packages/tx-review/src/review.ts`

Observed controls:

- Approval transactions are constructed for the manifest router and checked for the exact token, spender, and amount before the wallet prompt.
- The final payment path calls `assertReadyToSend`, checks invoice expiry and prepared-buffer freshness, decodes the actual payment calldata, and applies manifest/token/fee/deadline policy before sending.
- Permit signatures are checked for the expected signer and undergo post-sign permit-state checks before the final payment is built.
- The transaction decoder accepts a closed set of selectors, requires canonical ABI re-encoding, rejects unknown selectors and unsupported authorization-list transactions, and fails closed on malformed or unexpected values.
- The review package compares the decoded transaction with an expected intent and then applies policy rules.

No additional confirmed defect identified. The `payERC20WithBuffer` path is explicitly excluded from the generic decoder and relies on the existing preview/calldata assertion path; that exception should remain covered by dedicated tests whenever buffer-payment code changes.

### 3. Seller sweep signing and session binding

**Inspected:** `apps/web/src/lib/sweep.ts`, `apps/web/src/lib/session.ts`

Observed controls:

- The stealth private key is derived locally and its address is checked against the target stealth address before signing.
- Relayed sweep typed data is decoded and checked against the exact order fields before signature creation.
- Quote expiry, fee recipient, and fee cap are rechecked around asynchronous signing steps.
- The session identity/revision guard is checked after asynchronous boundaries and immediately before handoff.
- The derived secret is zeroized in a `finally` block; it is also explicitly wiped before handing signed material to the relayer.
- Direct sweeps serialize the unsigned transaction, parse those exact serialized fields for review, simulate the call, sign the serialized transaction digest, calculate the expected raw-transaction hash, and persist the attempt before RPC handoff.

No additional confirmed defect identified in these paths.

### 4. Relayer admission and signed-order verification

**Inspected:** `apps/relayer/src/service.ts`, `apps/relayer/src/validate.ts`, `apps/relayer/src/quoteToken.ts`

Observed controls:

- Sweep requests are resolved against configured chains and token allowlists.
- The quote HMAC is verified against the submitted chain, token, owner, destination, amount, and fee recipient.
- The fee is checked against the quoted minimum and published cap; expiry and deadline bounds are enforced.
- The relayer reconstructs the EIP-712 sweep typed data and recovers the signer; the recovered address must equal the order owner.
- Owner/network/destination abuse budgets, policy checks, breaker state, and per-chain serialization are applied before broadcast.

No additional confirmed defect identified. The external policy hook is optional: the service defaults to `allowAllPolicy` when no `PolicyGate` is injected. The normal `main.ts` entry point does not inject one. This does **not** bypass the relayer's cryptographic signature, configured-token, quote, fee, or deadline checks; it means operators must not assume a separate custom allow/deny policy is active unless they explicitly wire one in. Confirm this is intentional for the intended deployment.

### 5. Hot-key and quote-secret wiring

**Inspected:** `apps/relayer/src/main.ts`, `apps/relayer/src/runtime.ts`, `apps/relayer/src/secrets.ts`

Observed controls:

- The hot key and quote HMAC secret are loaded through the shared secret loader with explicit byte-length constraints.
- The quote secret is rejected if it equals or begins with the hot key.
- A previous quote secret is accepted only as a rotation/verification key.
- The hot-key address is derived and passed into configuration validation.
- Chain clients are built from the configured hot key; chain IDs and signed deployment manifests/on-chain deployment identity are checked before serving.

Residual risk: the current local-account signing path necessarily keeps hot-key material in the relayer process and viem account object. This is a key-management architecture choice, not a newly identified defect. Production operators should isolate the process, restrict secret-file permissions, and consider a dedicated signing service/HSM if the threat model requires stronger key isolation.

### 6. Relayer raw-transaction handoff and reconciliation

**Inspected:** `apps/relayer/src/chain.ts`, `apps/relayer/src/service.ts`

Observed controls:

- The relayer simulates the exact sweep call and estimates gas before signing.
- The raw transaction hash is computed before broadcast and journaled through the `onSigned` callback.
- A failure before handoff is distinguished from an unknown broadcast outcome.
- Unknown outcomes retain nonce and budget reservations until reconciliation.
- A chain lane serializes sends; pending and unknown sends are reconciled before another send is admitted.

No additional confirmed defect identified. A dedicated fault-injection pass is still warranted for RPC gateway duplicate-forwarding, process termination at every journal/send boundary, and chain reorgs.

### 7. State journal and process lock

**Inspected:** `apps/relayer/src/stateStore.ts`, `apps/relayer/src/runtime.ts`, `apps/relayer/src/main.ts`

Observed controls:

- The journal stores only the data needed for gas-budget and nonce recovery; it does not persist owner, destination, token, amount, signature, IP, or request ID.
- Writes use a private temporary file, fsync, atomic rename, and directory fsync.
- Corrupt or unreadable state fails startup rather than silently resetting the budget or forgetting an unsettled transaction.
- The lock is acquired before journal use, checked before writes, heartbeated, and released only after shutdown drains the service.
- Documentation correctly states that the lock coordinates one host/shared volume only. Multiple replicas with the same hot key and separate state volumes are unsupported.

No additional confirmed defect identified. **Deployment constraint:** do not run multiple relayer replicas with the same hot key unless they share a correctly fenced coordination/journal mechanism. The current lock is not distributed consensus.

## Recommended actions

1. Fix the outstanding unverified-backup invoice gate and its regression tests before enabling invoice creation.
2. Confirm whether the default `allowAllPolicy` behavior is intended for the standard relayer entry point; explicitly wire a custom policy if deployment requirements depend on it.
3. Keep the relayer single-writer per hot key/state journal. Do not horizontally scale separate instances under the assumption that the local file lock coordinates them.
4. Add fault-injection tests for duplicate RPC forwarding, crashes around signing/broadcast/journal writes, and reorg reconciliation.
5. Consider HSM/KMS-backed signing for production if process-memory hot-key exposure is outside the accepted threat model.

## Scope and disposition

- No production code changes.
- No merges or deployments.
- No secrets or key material accessed or printed.
- No live wallet, RPC, relayer, or contract attack performed.
- No CI run as part of this documentation-only pass.

**Disposition: retain the Pages freeze. PAGES-02-R2 remains a release blocker.**
