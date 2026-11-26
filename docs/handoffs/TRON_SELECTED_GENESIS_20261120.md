# TRON-4 / GP-BUG-15: selected-network identity guard

Date: 2026-11-20. Status: isolated draft, not merged or released.
Repository: `djshellshoxxx/GhostPay`.
Starting `main` (immutable): `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
Main source blobs: `apps/web/src/features/tron/rpc.ts` = `d7c04cbad5e1f2815aa6c5094806c0a50753ff23`; `TronView.tsx` = `90872e1a235eaac9355405d1cdc37bfb5b24a752`.
Audit origin: PR #312, `docs/notes/bugcheck-2026-11-19/FINDINGS.md` (GP-BUG-15) and `details/multichain-views.md` (TRON-4).

## Finding and safety scope

The existing TRON node guard only refused known mainnet genesis. Nile could be selected while an RPC returned Shasta or an arbitrary private-chain genesis, and scanning/signing/broadcast would continue under a misleading network label. TRON remains an optional, testnet-only full-profile component; this finding does **not** establish a current lean Pages exploit.

## Changes, with source ancestry

1. Test-first commit `b2bfac0d9f57d1ac72ea2a3cc8db5cc0cbfb883b`: `rpc.network.test.ts` covers Nile/Shasta success and cross-network/unknown rejection, local-vs-public testnet, disabled mainnet, and invalid runtime network IDs. On pre-fix API, the typed two-argument call does not compile (test-first negative contract); this is not a locally executed RED test.
2. Source commit `cd8e2d01bedf332fc32d874fa5b8cebde2e29d66`: require selected network in `checkNetwork`; verify exact pinned genesis for Nile/Shasta; local mode rejects recognized public testnet genesis; mainnet and unknown selections fail closed. Existing i18n key `tron.error.chainMismatch` is reused.
3. View commit `2c30b89e455d1c0ceb174d9c9e76b9c842f4c2b7`: pass selected `netId` to `checkNetwork` before all Scan / Review / Sign / Broadcast RPC paths.
4. UI regression commit `b45f564530c3a1f3b191dd034772fdcb394c0160`: a Nile selection must not scan a Shasta node; a valid Nile selection retains mocked scan functionality.

This branch changes only the TRON web wrapper and its new unit/browser-component tests, plus this handoff. No contract, custody, dependency, fee, hosting, deployment or mainnet flag modification.

## Ownership and overlapping integration candidates

The five checked integration refs `integration/ghostpay-main-recovered-fixes-20261120`, `integration/ghostpay-completion-20261120`, `integration/ghostpay-tron-range-20261120-r2`, `work/ghostpay-required-v1-candidate-20261120`, and `work/ghostpay-required-v11-candidate-20261120` all contain the identical pre-fix `rpc.ts` blob `d7c04cba...`. TRON adapter cancellation PR #321 and stacked completeness PR #329 are distinct package-layer fixes; do not duplicate or flatten their source ancestry without reviewing final overlap.

## Qualification / next worker

- No local repository install or Vitest/TypeScript/browser execution was possible in this connector-only run (container GitHub DNS resolution failed). Do **not** represent added regression files as passing.
- Run exact-head `pnpm --filter @ghostpay/web test` or the repository's documented web Vitest invocation (verify script names before use); confirm browser, typecheck, lint, security and required mainline CI gates. Check for additional direct `checkNetwork` callers before promoting the API change.
- Confirm genesis pins from the repository's existing primary source notes; test absent and malformed block-0 RPC responses, and abort/switch behavior.
- Review branch diff independently, reconcile with PR #321/#329 and any newer active TRON work, then merge only after draft/approval gates and exact-head checks pass.
- Record actual CI run URLs/results. Never claim independent RPC trust, refund/fund-recovery guarantees, mainnet activation or deployment.

This is a correction to network identity labeling and prevents the browser from proceeding with the wrong selected public testnet. It does not authenticate an RPC node against a malicious provider capable of fabricating genesis data.
