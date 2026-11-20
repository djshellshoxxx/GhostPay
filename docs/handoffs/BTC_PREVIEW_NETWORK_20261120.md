# GhostPay cycle 20261120T2036Z — Bitcoin silent-payment sweep preview network validation

## Source-pinned work and disposition

- Repository: `djshellshoxxx/GhostPay`, static Pages beta focus; Bitcoin spend library remains optional/full-profile. No production browser or funds-loss exploit asserted.
- Start: 2026-11-20 around 20:36 UTC; end: 2026-11-20 around 20:40 UTC.
- Coordinator: one ChatGPT execution, separate sequential consolidation/source-audit/test-authoring/implementation phases, no delegated native workers and no independent verifier. No Caveman runtime claimed.
- Base and latest observed main: `aa3df1cb37274fae73af0ca957183c15c51b62d3`. Isolated branch `automation/20261120T2036Z/bug/btc-preview-network`.
- Claim first: `4ac8a51577f6148d38c830388c03228e245b01da` in `docs/ai/ACTIVE_WORK.md`.
- Regression first: `498a72ed5dfb4b68f7557cf1ddfd34ea6cbf3d91`; regression blob `8ffcf80a6a37178fe36ada08340e58fb43926a17`.
- Product correction: `0860e8fb518fd9f357e4ec9c5482ae823f0eb2ba`; corrected `spend.ts` blob `4bd08c0b56f7321e0ea06941e4f48e0659f66273`, baseline blob `60697bc4a3b2c8518f822786027049ee6d770e53`.
- Source: `packages/btc-silent-payments/src/spend.ts`, `previewSweep`; test: `packages/btc-silent-payments/src/spend.preview.network.test.ts`.
- Exact prior finding: audit [#312](https://github.com/djshellshoxxx/GhostPay/pull/312), GP-BUG-17 / BTC-SPEND-API-1; full source/evidence in `docs/notes/bugcheck-2026-11-19/details/bitcoin-spend.md` on `audit/bugcheck-core-latest-20261120`.

## Behavior, test plan, and regression evidence

- Before: `previewSweep` classified `sp1` / `tsp1` by prefix, estimated an output, and accepted a valid wrong-network destination. The signer path already decodes using the requested network.
- After: invoke the existing strict `decodeSilentPaymentAddress(address, network)` before computing a silent destination preview. The original signing path, amount validation, P2TR vsize/fee logic, regular addresses and network choices are unchanged.
- New tests: valid testnet destination rejected on mainnet, valid mainnet destination rejected on testnet (both expect `NETWORK_MISMATCH`); matching-network previews retain 111-vB/111-sat fee on one 100000-sat input at 1 sat/vB; malformed `sp1` prefix is rejected.
- Tests authored first, but **the new tests were not executed in the original repository**. Prior #312 audit records an actual wrong-network public-data preview/strict-decoder mismatch on baseline. It is not claimed that this cycle reproduced the old failure by running Vitest.
- Run next: `npm ci --ignore-scripts`, `npm --workspace @ghostpay/btc-silent-payments test -- --run spend.preview.network.test.ts` (adjust Vitest arguments to package runner), `npm --workspace @ghostpay/btc-silent-payments run typecheck`, `npm --workspace @ghostpay/btc-silent-payments run lint`, `npm --workspace @ghostpay/btc-silent-payments run build`; run repository release-applicable checks. Preserve RED-on-test-only evidence if feasible without modifying the frozen branch.
- Local runtime: `git ls-remote` could not resolve `github.com`; repository checkout/dependency installation/test execution unavailable from the local shell. GitHub-connected writes and source re-reads succeeded.

## Integration and security boundaries

- Bounded active-PR inventory reviewed including #278, #307, #312, #321, #330, #332, #334, #335, #337; no exact `GP-BUG-17`/ `previewSweep` PR search hits. Broad candidates may overlap this file; verify every target head/diff before integration, preserve donor work, and keep publication branches intact.
- Durable metadata branch `automation/ghostpay-integration-lock`: status `released`, generation `8`, owner `20261120-consolidation-994a0d214fb9-root`, metadata file blob `677c8da348e285d71d3140e84e197660f077e1a9`. Not acquired or modified. No integration into main or shared branch.
- `SECURITY.md` calls the project pre-audit and requires private disclosure of vulnerabilities. This is an existing low-impact API validation mismatch, not a new privately exploitable finding.
- `.github/workflows/pages.yml` confirms pull requests are validation-only and publishing requires explicit `workflow_dispatch` on main with `deploy=true`; `release.yml` acts only on pushed version tags; no tag or deployment performed.
- No paid API, Codex, force-push, branch deletion, contract/relayer/CLI edit, wallet operation, production setting change, real-funds transaction, gate weakening or new dependencies.

## Next exact-source handoff

1. Inspect this branch exact HEAD and GitHub Actions runs/jobs after draft PR publication; do not inherit CI status from main or earlier PRs.
2. Independently execute and review the committed regression. Resolve failures in an exclusively owned follow-up branch if needed; no self-approval.
3. Recheck broader #307/#278 overlap and the integration lease. Under all repository, deployment and external-security gates, reconcile this one-line correction without losing other work. Do not merge this isolated branch while tests/independent verification are missing.
4. Preserve unresolved mandatory Pages privacy issue #286 and active #307/#333/#335 work. Do not use this optional-library correction to qualify the full beta.
