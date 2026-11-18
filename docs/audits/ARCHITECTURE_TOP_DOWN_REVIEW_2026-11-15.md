# GhostPay top-down architecture security review — 2026-11-15

## Scope and method

This is a source-level, top-down review of the GhostPay candidate at the fourth-pass audit base. It traces the principal trust boundaries and authority flows from application startup through seller custody, payer authorization, deployment identity, contract execution, relayer operation, and release qualification.

Reviewed entry points and representative paths:

- `apps/web/src/main.tsx`, `App.tsx`, `AppShell.tsx`, `lib/defaultServices.ts`, `lib/manifest.ts`
- `lib/session.ts`, `views/SellerKeys.tsx`, `lib/keyVault.ts`
- `lib/payExec.ts`, `lib/txGuard.ts`, and the router/sweep contract interfaces and implementations
- `apps/relayer/src/main.ts`, `runtime.ts`, `config.ts`, `service.ts`, `policy.ts`, and `server.ts`
- `apps/web/vite.config.ts`, `scripts/release-build.sh`, `.github/workflows/ci.yml`, and `.github/workflows/release.yml`
- Current threat model, README, and completion-gate documentation

This is not a complete audit of every workspace in the monorepo. The repository contains many optional, experimental, and independently gated packages. The review prioritizes the ordinary EVM web payment/sweep path and the relayer. Bitcoin, Solana, Tron, policy accounts, merchant/CLI integrations, pools, and other optional packages need separate component-specific review.

## Executive result

**One previously reported high-severity custody/availability defect remains confirmed at this source snapshot.** The invoice-creation gate treats an unverified keystore download as a backup, while the idle-lock path correctly treats the same download as unproven. This permits a seller to create invoices before demonstrating that the backup can actually be recovered. If the only browser copy is then lost, funds sent to the seller's stealth addresses may be permanently inaccessible.

The broader architecture has several good fail-closed controls: no deployment manifest means no ordinary payment; the default web path uses bundled manifests and pinned signatures; payment flows cross-check deployment data against chain state; relayer manifests are signature-checked and read back; sweep orders bind destination, amount, fee and nonce; and the release workflow does not publish a host automatically.

No second, independently exploitable cross-component defect was confirmed in the paths sampled for this pass. This is a source-review result, not a claim that the system is safe or launch-ready.

## Architecture and trust-boundary map

### 1. Web startup and feature exposure

`main.tsx` constructs the default services and mounts the app. The app's feature list includes ordinary EVM flows plus separate BTC, Solana, Tron, registry, and optional policy views. Build-profile logic is intentionally narrow-only: a lean build or lean shell cannot be widened by a component asking for the full profile.

Security consequence: the product is not one homogeneous execution path. Each chain adapter and optional feature has its own key handling, RPC exposure, transaction builder, and evidence rules. Passing the EVM flow does not qualify the other chain integrations.

### 2. Seller custody and local persistence

Seller spending/viewing/signing secrets are kept in the session holder and are not placed in web storage by the session module. Encrypted vault storage is a separate IndexedDB path. The app's idle-lock path distinguishes a verified/recoverable copy from a download that has not been reopened and checked.

The inconsistency is at the UI authorization boundary: `setCustody` computes `backedUp` as true for any `external !== 'none'`, including `external: 'unverified'`; `BackupGate` releases its children when `backup.backedUp` is true. The idle-lock path, by contrast, calls `loadedKeysRecoverable()` and keeps the keys loaded when the download is unverified. These two components therefore assign different security meaning to the same custody state.

### 3. Payer authorization and payment destination

The ordinary payment flow loads the deployment manifest from the bundle, not from a runtime origin fetch. The manifest is checked against release public keys, and sensitive flows call the chain read-back gate. The transaction guard decodes supported router calls and compares their destination, token, amount, fee, deadline, metadata and ephemeral key with the reviewed intent.

The router has immutable configuration and no owner, pause, proxy, or upgrade path. ERC-20 payment paths use exact balance-delta checks and reentrancy protection; native payment paths forward value and revert on failed transfers. The sweep contract verifies EIP-712 signatures, binds all transfer fields, consumes a per-owner nonce before external calls, and checks exact balance deltas.

These controls depend on the frontend bundle itself being authentic and on the user's browser, wallet and RPC behaving within the documented trust assumptions. A compromised frontend can still steal keys or request malicious actions. The README correctly says there is no qualified deployment or production release.

### 4. Relayer authority and operational state

The relayer's entry point loads secrets and strict configuration before listening. Configured deployment manifests require a valid signature from configured release keys; chain clients verify manifest fields against the live chain before serving. The service simulates sweeps, enforces token/deadline/fee limits, reserves loss and daily budgets, and serializes sends through per-chain lanes. The file journal uses a process lock and fencing for writes.

The policy hook is optional. If an operator expects a sanctions/compliance or other allow/deny policy, that expectation is not satisfied merely by running the standard entry point: the policy must be explicitly injected. The default policy allows all. This is an operator/business control, not a cryptographic bypass of the signed sweep order.

The relayer's CORS origin list is not authentication. The service must continue to rely on signed orders, quote tokens, rate limits, and server-side validation rather than treating browser-origin restrictions as a security boundary.

### 5. Build, release, and deployment trust

The web build compiles manifests and release public keys into the hashed bundle. With no release keys configured, the default loader rejects manifests and disables ordinary payment. The release workflow verifies a signed tag against a trust root read from the default branch, runs verification before the protected build environment, produces checksums/SBOM/provenance, and creates a draft release only. Static publication remains disabled.

This is the correct fail-closed posture for an unqualified product, but it also means a production trust root, real deployment manifests, independently verified contract deployments, external artifact verification, and owner-approved hosting are still prerequisites. CI success alone cannot provide those external trust anchors.

## Findings

### TDA-01 — High — Unverified keystore download releases invoice-creation gate

**Status:** Confirmed; previously reported as PAGES-02-R2. Still present at the reviewed source snapshot.

**Evidence:**

1. `apps/web/src/lib/session.ts`
   - `markKeystoreDownloaded` sets `external: 'unverified'` after the download helper is invoked.
   - `setCustody` calculates `backedUp = external !== 'none' || vaultStored`.
   - The public `verified` property is separately calculated as `external === 'verified' || vaultStored`.
   - Thus an unverified download yields `backedUp === true` and `verified === false`.

2. `apps/web/src/views/SellerKeys.tsx`
   - `BackupGate` returns its children when `backup.backedUp` is true; it does not require `backup.verified`.
   - This gate protects invoice creation in `apps/web/src/AppShell.tsx`.

3. `apps/web/src/AppShell.tsx`
   - The idle-lock flow independently checks `loadedKeysRecoverable()`.
   - It intentionally keeps the keys loaded when the downloaded file has not been verified, confirming that the application itself does not consider the download proven recoverable.

**Impact:** A seller can create and share invoices after a download attempt even if the file was blocked, lost, corrupted, or never saved. If the browser profile is then lost, payments to stealth addresses derived from those keys may be unrecoverable. This is primarily a permanent-funds-availability/custody failure, not evidence of remote key exfiltration.

**Recommended correction:**

- Gate invoice creation on `backup.verified === true || backup.waived === true`, not `backedUp`.
- Keep the explicit typed waiver path.
- Preserve the `signerOnly` / payments-only exception for imported spending/viewing keys where the separate signing key is the only unsaved material.
- Add regressions proving: unverified download blocks invoice creation; exact-key verification unlocks it; vault-backed verified state unlocks it; typed waiver unlocks it; signer-only payment behavior remains unchanged.
- Ensure the idle-lock and invoice gate use the same canonical recoverability predicate, or explicitly document why their predicates differ.

### TDA-02 — Medium operational risk — Ephemeral relayer state is blocked only when NODE_ENV is exactly production

**Status:** Configuration-hardening observation; not confirmed as an exploitable defect.

**Evidence:** `apps/relayer/src/config.ts` requires an explicit state choice. For `{ "ephemeral": true }`, it rejects only when `ctx.env['NODE_ENV'] === 'production'`. The relayer README/config comments describe ephemeral state as development-only.

**Impact:** An operator who explicitly selects ephemeral state but forgets to set `NODE_ENV=production` can start with in-memory budget and unsettled-transaction state. A restart forgets the daily budget and unresolved-send journal. This is an operator misconfiguration path, not an unauthenticated remote toggle.

**Recommendation:** Prefer a positive development-mode opt-in for ephemeral state, or require a separate explicit unsafe flag and startup warning. Add tests for missing, development, test, and production environment values. Keep the persistent file journal mandatory for all deployment examples and service templates.

### TDA-03 — Medium owner/operations risk — Relayer policy defaults to allow-all

**Status:** Confirmed configuration behavior; previously noted in the fourth-pass review. Not a bypass of the EIP-712 sweep authorization.

**Evidence:** `apps/relayer/src/policy.ts` exports `allowAllPolicy`. `apps/relayer/src/runtime.ts` passes a policy only when `RuntimeDeps.policy` is supplied. The service's policy hook is therefore not an active deny-list/sanctions control unless the operator explicitly wires one.

**Impact:** An operator may incorrectly assume that a compliance or allow/deny policy is active when the standard entry point has not injected one. Cryptographic signature checks, token configuration, quote validation, and on-chain order constraints remain separate controls.

**Recommendation:** Make the deployment mode explicit: either require a policy implementation when policy enforcement is part of the operating model, or print a clear startup warning and expose the effective policy mode in a non-sensitive health/info field. Add an integration test proving the production composition actually injects the intended policy.

## Important controls observed

- Ordinary web payments fail closed when no signed bundled deployment manifest is available.
- Sensitive web flows have a separate chain read-back step; the same untrusted manifest is not intended to be the sole trust source.
- Supported payment calldata is independently decoded and compared with the reviewed intent before wallet submission.
- Sweep signatures bind token, owner, destination, fee recipient, amount, fee, deadline, nonce, chain and contract domain.
- Relayer chain configuration checks manifest signatures and on-chain deployment identity before service startup.
- Relayer state writes are fenced by a process lock; the service serializes per-chain sends and tracks uncertain broadcasts.
- Release tags are checked against the default-branch trust root; publication is draft-only and hosting remains disabled.
- The repository documentation clearly states that it is pre-audit and not for real funds.

## Limits and next acceptance work

- Source review only. No live browser, real wallet, public RPC, deployed contract, public testnet, or deployed relayer was exercised.
- No Foundry, browser, full CI, dependency audit, fuzzing, Slither, or external audit was run as part of this pass.
- The full repository includes numerous optional packages and chain integrations not exhaustively reviewed here.
- The mainnet/testnet deployment, release-signing trust root, host integrity, real-wallet/device compatibility, and professional independent audit remain external gates.
- Do not interpret the positive controls above as proof that the contracts, cryptography, release pipeline, or every optional package are safe.

## Disposition

Keep the freeze. Do not merge, deploy, publish, enable mainnet, or use real funds on the basis of this review. Fix TDA-01 with a test-first code change and obtain exact-head CI before treating the custody gate as closed. Resolve TDA-02 and TDA-03 as explicit operator decisions before any relayer deployment.
