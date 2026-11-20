# Devnet wallet disclosure acceptance repair

## Result and source

The inherited devnet acceptance drivers now explicitly review each expected wallet disclosure. The three-file correction passed independent source review, the original full web typecheck and lint, and static collection under all four original configurations described below. **Corrected hosted browser acceptance remains required.** No local browser pass is claimed.

- Branch: `fix/ghostpay-devnet-wallet-consent-20261120-r2`.
- Base: [PR #327](https://github.com/djshellshoxxx/GhostPay/pull/327), `9608ec996fb159f11b84b9baec0b48033a48a6a5`, preserving #326 and required-v1.1.
- Ownership claim: `2b8881de8be22998407d91505357771d755b680d`.
- Reviewed and qualified local source: `420df3b55be2a4207950f312d2b0bd5b899602e2`.
- Qualified tree: `c47596d02196c1d2cb38040a2f52fe24bd4d3081`.
- Source review: the coordinator separately inspected the complete implementing worker's patch and approved this exact source, without a blocker. The complete independent review is archived losslessly.

## Observed failure and diagnosis

The [Pages acceptance job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44785154719/job/136457928140) on #326 completed browser installation and the artifact build, then reported **6 passed, 5 failed and 5 not run**. Each failure waits for `Prepare payment` immediately after Connect in `e2e/devnet/ui.ts`. The [beta job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44785154517/job/136457926770) passed its library and CLI stages, then failed all three browser cases. Two have the same missing-Prepare timeout; the third waits for a wrong-chain message after Connect.

Both jobs tested synthetic merge `adbcec37c3f589e9b1a0cc6ee419193ce90d355e`. GitHub's commit metadata confirms parents required-v1.1 `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9` and #326 `a34ce43e296e302e3e65ed077ea8ac892c5189a1`, with tree `b277d0b71b0b6d9242d2d36cdfcadc3b1296f5d3`, exactly #326's tree. These are actual hosted failures, retained as such.

The failure location matches an omitted user interaction. `Pay.onConnect` supplies the existing disclosure gate to `connectWallet`; that function awaits the `eth_requestAccounts` disclosure before contacting the wallet. The existing component regression requires zero provider calls until approval. Mocked core/flow journeys already use `approveWalletDisclosure`, which requires the exact named dialog and method before clicking Continue to wallet. The devnet helper and both dedicated devnet specs omitted these decisions.

The stale devnet driver, disclosure controller, helper, dedicated specs and workflows are source-identical in the required-v1.1 base, #326 and #327. #326's wallet-file changes only annotate TypeScript callback types; its proof-preview changes do not remove this disclosure requirement. This establishes inherited source, **not an executed failure on the exact base**: the hosted reviewer found no exact-base run/check counterpart. No actual error-context contents or screenshots were available. Complete artifact lists returned only the Pages site archive and beta acceptance log; the runner's temporary result paths printed in the logs were not retained as artifacts.

## Correction and preserved behavior

Only `e2e/devnet/ui.ts`, `e2e/devnet-journey.spec.ts` and `e2e/pages-devnet.spec.ts` change: 24 insertions and four replaced import/comment lines.

- Account access receives explicit `eth_requestAccounts` approval before preparation, including manual reconnect paths.
- A wrong-chain connection receives a separate `wallet_switchEthereumChain` decision after account access.
- Successful sends and wallet rejection cases explicitly approve the named `eth_sendTransaction` disclosure. Duplicate-attempt and silently changed-network cases also reach this disclosure: `sendViaWallet` awaits it before rechecking account/chain and calling `beginAttempt`. Their original refusal and no-duplicate assertions remain.
- Expired-invoice and failed-dry-run cases reject earlier in `sendPayment`. They receive no transaction approval and gain explicit no-dialog assertions.

No helper approves an unexpected or future prompt. All original chain, balance, nonce, wallet journal, raw-transaction, receipt, scan, restart, duplicate and refusal assertions remain. A supplementary literal diff check retained all 427 preexisting assertion lines in order and found two added no-dialog assertions; this mechanical check is not test execution. There are 17 explicit method-specific decisions added across the drivers. Runtime, dependencies, workflows, timeout/retry/skip policies and product behavior remain unchanged.

## Executed local qualification

| Check | Result | Duration |
| --- | --- | --- |
| Original full web TypeScript, after prerequisite correction | Passed, exit 0 | 23.924 s |
| Original full web typed ESLint over `src` and `e2e` | Passed, exit 0 | 58.531 s |
| Original committed-secret scan | Passed, exit 0 | 0.320 s |
| Source diff whitespace check | Passed, exit 0 | 0.012 s |
| Dedicated `playwright.devnet.config.ts --list` | 3 cases in one file collected, exit 0 | 2.047 s |
| Dedicated `playwright.pages-devnet.config.ts --list` | 16 cases in one file collected, exit 0 | 1.963 s |
| Default full configuration `--list` | 136 cases in 31 files collected, exit 0 | 4.355 s |
| Default lean configuration `--list` | 126 cases in 29 files collected, exit 0 | 1.925 s |

The dedicated configurations collect the changed devnet specs; the default configurations exclude them. The default full and lean collections overlap. **Collection counts are not executed test passes.** Dedicated config imports used an explicitly synthetic scratch JSON with chain ID, a public generator-point key and uncreated deployment/output paths. Its sole purpose was to satisfy import-time config checks for `--list`. No setup hook, server, browser, anvil, RPC or transaction ran; the synthetic output paths remained absent. Default collection used its existing authored local manifest fixture.

The first original TypeScript run failed with missing `@ghostpay/relayer-guard` declarations imported by existing web tests through `apps/relayer`; lint had not run. Its exact log and failed exit are preserved. The selected installation omitted that test-only workspace link. The package's own prior-built output and unchanged source were present, so the exact lock-declared local symlink was restored. The separately labeled correction run above then passed with unchanged source, commands, assertions and configuration. This was a dependency-closure repair, not a compiler suppression or source patch.

## Dependency provenance

The retained worktree's root dependencies had previously been removed. Another worktree's tool versions differed, so those were not reused. Read-only cache and space checks found the eligible exact-lock tarballs available and estimated about 324 MB of filesystem use with about 1.23 GB free. The coordinator then authorized one bounded offline extraction:

```sh
npm ci --workspace @ghostpay/web --workspace @ghostpay/core-crypto --include-workspace-root --offline --ignore-scripts --no-audit --no-fund
```

It passed in 7.438 s using the existing cache, with unchanged manifests/lockfile and about 893 MB free afterward. No network fallback or installation script ran. All 307 installed nonlink entries matched locked version, resolved URL and integrity metadata. Installed versions include TypeScript 5.9.3, ESLint 10.15.0, typescript-eslint 8.73.0, Playwright 1.65.1, viem 2.57.19, Vite 8.3.8 and Vitest 5.1.0. Local Node was 24.22.3 and npm 11.19.1; hosted gates retain their original configuration.

The 19 production workspace links and later test-only relayer-guard link resolve to this worktree. Each package's source inputs are unchanged from its previously recorded build checkpoint `662e9cc8d3f25d17994e95c1aad9219ceae00f79`. Their existing output hashes are recorded. No new library build or production build is claimed.

## Evidence and next gate

[EVIDENCE.json](EVIDENCE.json) records exact source/tree identities, commands, environments, timestamps, exit codes, collection metadata, original hosted and local failures, independent review and artifact SHA-256 hashes. Every original artifact is archived under `outputs/` as gzip/base64 with its original name, byte count and hash; decoding and decompression were round-trip verified against the original bytes.

The coordinator owns publication. Preserve the frozen #326/#327 heads and publish this test-only correction as a separately reviewable successor. Require the actual Pages and beta browser gates on the new published tree, along with the other applicable hosted checks, before promotion. The original failed jobs are not relabeled, no main merge or deployment is claimed, and neither this source review nor local collection qualifies the broader privacy stack for release.
