# Dependabot PR review — 2026-11-18

Read-only review of four PRs missing from the earlier connector inventory. Source comparison is pinned to main `dfc75ef2087fa6463ae59e0818abec01796c578d`. These PRs all existed before the initial execution brief, so the initial inventory was 32 PRs, not 28.

## Disposition

| PR | Exact head | Changed files | Latest retrieved check results | Recommendation |
|---|---|---:|---|---|
| #210 | `4d19655a2e5d93ad9378803cd4163245168aca24` | 68 | 23 failure, 11 success, 3 skipped, 1 neutral | Preserve; fix dependency integration and requalify. Do not merge. |
| #207 | `199ab7ef1e80e6368fdc17c09b94c87a62871861` | 5 | 1 failure, 27 success, 2 skipped, 1 neutral | Source update acceptable; preserve until the failed Mythril gate is resolved. Do not merge red. |
| #87 | `bbc8ff3ba6c8e3786ccea9bd5c2679d0527bc6aa` | 69 | 24 failure, 10 success, 3 skipped, 1 neutral | Preserve; requires a coordinated major-version migration. Do not merge. |
| #49 | `6bffb63d1638253e677511672ffd32c24ac8f2f6` | 1 | 21 success, 1 skipped, 1 neutral | Close as superseded after coordinator verifies the lock entry. |

All retrieved checks are completed and tied to the exact heads above. The coordinator must refresh state before any action. CodeQL is neutral for all four because three main-branch configurations are absent from the PR analysis; neutral does not establish a clean code-scanning comparison.

## #210: mixed viem versions fail the shared library build

This changes 67 workspace manifests and the root lockfile, with no runtime source, workflow, or gate changes. Nine package updates are proposed: viem 2.57.13→2.57.19; Vitest and coverage-v8 5.0.5→5.1.0; Prettier 3.9.10→3.10.1; Zama SDK 3.7.1→3.7.2; Playwright 1.64.1→1.65.1; user-event 14.6.8→14.6.10; plugin-react 6.1.2→6.3.0; Vite 8.3.5→8.3.8. These target versions are not already adopted on reviewed main. The two Vitest components are bumped together.

The root `@0xbow/privacy-pools-core-sdk` viem override remains 2.57.13. The lockfile retains root `node_modules/viem` 2.57.13 while placing 2.57.19 under `packages/confidential-amounts/node_modules/viem`. The Zama SDK resolves its viem types through the root copy. Passing package-local clients into its adapter fails TypeScript structural compatibility.

Confirmed hosted evidence: [ts-typecheck job 134649934566](https://github.com/djshellshoxxx/GhostPay/actions/runs/44257870877/job/134649934566) installs successfully, then fails `npm run build:libs` in `packages/confidential-amounts/src/backends/zama-sdk.ts` at the `publicClient` and `walletClient` properties, lines 100–101, with TS2322. The diagnostic identifies the two viem module paths. Therefore the failing test jobs cannot be interpreted as tests of the upgraded application that ran to completion.

Required follow-up: align the viem dependency/override graph and SDK type boundary deliberately, regenerate the lock normally, validate the production dependency tree, then build/typecheck and rerun the affected SDK, unit, and browser suites. Do not hide the mismatch with type casts or relax gates. No repair was attempted in this review.

## #87: major toolchain migration is incomplete

This changes 68 workspace manifests and the lockfile only. It updates TypeScript 5.9.3→7.0.2, Node types predominantly 22.20.5→26.6.6, jsdom 30.1.3→31.0.1, scure base/bip32/bip39 to 2.4.0, Hardhat 2.29.2→3.22.0, Hardhat ethers 3.1.3→4.2.2, network helpers 1.1.2→3.0.12, chai matchers 2.1.2→3.0.0, and Chai 4.5.0→6.3.0. It makes no corresponding source/configuration migration.

Two independently retrieved hosted jobs establish the first blocker: [ts-typecheck 134650170554](https://github.com/djshellshoxxx/GhostPay/actions/runs/44258519283/job/134650170554) and [confidential-contracts test job 134650170774](https://github.com/djshellshoxxx/GhostPay/actions/runs/44258519283/job/134650170774). Both install successfully and fail while building `@ghostpay/net-harness`, before their intended downstream work: `src/socks5Server.ts(287,16)` TS2345, `string | NonSharedBuffer` is not assignable to `Buffer<ArrayBufferLike>`. The unchanged code passes the socket data event directly to the Buffer-only queue.

A separate source-proven compatibility problem remains behind that early failure: retained `@fhevm/hardhat-plugin` 0.4.2 requires Hardhat `^2.0.0` and hardhat-ethers `^3.1.3`. The new lock has only Hardhat 3.22.0, retains a root hardhat-ethers 3.1.3 with peer `hardhat:^2.28.0`, and adds workspace hardhat-ethers 4.2.2. The unchanged Hardhat configuration still imports the existing plugin and Hardhat 2 subtask/task-name interfaces. The confidential tests have not reached execution, so this review does not claim a freshly reproduced Hardhat runtime error; the incompatible peer requirements are already sufficient to withhold approval.

Required follow-up: split or coordinate TypeScript/Node type migration and the Hardhat/fhEVM migration, keep supported plugin peer ranges consistent, update the actual source/configuration as needed, and obtain complete fresh tests. Preserve the PR rather than treat its outstanding version updates as superseded.

## #207: narrow pinned-action update, gate remains red

The exact diff contains five SHA-pin replacements: actions/setup-python v6.3.0→v7.1.0 in three workflows, and peter-evans/create-pull-request v7→v8.1.3 in two workflows. No permissions, triggers, runner labels, token expressions, path allowlists, draft settings, or branch-deletion behavior change.

The [pinned setup-python README](https://github.com/actions/setup-python/blob/6d4fd22b20465ccc0f7354476588e8df7c9ca0e0/README.md) describes v7 as an internal ESM migration; v6 already used Node 24. The [pinned create-pull-request upgrade guide](https://github.com/peter-evans/create-pull-request/blob/3ffccacd46053766916f087ce41d627c0b8cf2d1/docs/updating.md) identifies its v8 runtime change to Node 24 and minimum runner 2.327.1. The touched jobs use GitHub-hosted Ubuntu runners. Independent privacy-worker review also found no blocking issue in this bounded source diff; neither reviewer audited every bundled upstream implementation line.

However, [Mythril job 134636865183](https://github.com/djshellshoxxx/GhostPay/actions/runs/44255738590/job/134636865183) failed on the exact head. The narrow update does not justify bypassing that gate. Preserve until the actual required checks are successful under the owner's established policy.

## #49: sole update already present

The only changed file is `package-lock.json`. The merge-base-to-head diff changes only `packages["node_modules/follow-redirects"]` from 1.16.1 to 1.16.2, specifically its version, registry tarball URL, and integrity. The complete resulting package entry, including all other metadata, is identical to reviewed main's entry. Its SHA-512 integrity is `sha512-/kVP2U8z596Ia0gwFrwyIeo74ta5aVmSeU1FfAUMAmcEP5EP7zydmag3SLiN64NaRKef3lxsq7i/g7ltJQDGow==`.

This establishes semantic supersession of the full PR diff, not byte identity of the entire historical lockfile. Closing with that evidence is appropriate; merging the old lock branch adds no needed dependency update.

## Security-scan scope

The initial main and reviewed current main have the identical lockfile blob `8ce2a5bb315cd84f45d3351131de0914337224ae`. Static checks of both npm PRs found only dependency-section manifest edits, no same-version integrity changes, and no changed tarball URLs outside HTTPS registry.npmjs.org. These checks establish the inspected diff scope; they are not a complete upstream package audit.

The coordinator's cached `npm-audit-main.json` was produced by `npm audit --omit=dev --audit-level=high --json` and reports zero advisories in the production scope. It does not certify the dev dependency graph. The retrieved npm-ci logs include dev dependencies and report 30 advisories for #210 (16 low, 14 high) and 18 high for #87. These are historical install summaries, not fresh full-audit results or proof that all listed issues are newly introduced by either PR. The CI production audit is located after the shared build, which these jobs fail to complete. No npm audit fix, dependency install, source edit, push, merge, or deployment was performed here.

## Inventory timestamps

- #210: created `2026-11-18T07:18:32Z`, exact head `4d19655a2e5d93ad9378803cd4163245168aca24`.
- #207: created `2026-11-18T07:01:58Z`, exact head `199ab7ef1e80e6368fdc17c09b94c87a62871861`.
- #87: created `2026-11-09T03:19:40Z`, exact head `bbc8ff3ba6c8e3786ccea9bd5c2679d0527bc6aa`.
- #49: created `2026-11-03T18:48:13Z`, exact head `6bffb63d1638253e677511672ffd32c24ac8f2f6`.

## Exact changed-file inventory

### Common file list: all 68 files in #210

#87 changes these same 68 files plus `packages/confidential-contracts/package.json`, for 69 total. This set relationship was asserted programmatically against the Git merge-base diffs.

```text
apps/relayer/package.json
apps/web/package.json
package-lock.json
packages/address-safety/package.json
packages/amount-blur/package.json
packages/btc-family/package.json
packages/btc-payjoin/package.json
packages/btc-silent-payments/package.json
packages/chain-adapters/package.json
packages/chain-evm-extra/package.json
packages/chain-solana/package.json
packages/chain-tron/package.json
packages/cli/package.json
packages/confidential-amounts/package.json
packages/core-crypto/package.json
packages/donation/package.json
packages/external-pools-privacypools/package.json
packages/external-pools-railgun/package.json
packages/external-pools/package.json
packages/hops/package.json
packages/hygiene/package.json
packages/i18n/package.json
packages/invoice-schema/package.json
packages/merchant-billing/package.json
packages/merchant-hooks/package.json
packages/merchant-ledger/package.json
packages/merchant-multisig/package.json
packages/metadata-hardening/package.json
packages/net-harness/package.json
packages/net-transport/package.json
packages/ops-monitor/package.json
packages/payer-sponsor/package.json
packages/payment-uri/package.json
packages/pir-two-server/package.json
packages/plugin-api/package.json
packages/policy-scheme/package.json
packages/pool-circuits/package.json
packages/pool-prover/package.json
packages/pool-relayer/package.json
packages/pool-sdk/package.json
packages/privacy-pipeline/package.json
packages/privacy-profiles/package.json
packages/qr-exchange/package.json
packages/relayer-guard/package.json
packages/sandbox/package.json
packages/scan-source/package.json
packages/sdk/package.json
packages/secret-box/package.json
packages/solana-stealth/package.json
packages/tron-adapter/package.json
packages/tx-review/package.json
packages/ux-connect/package.json
packages/ux-core/package.json
packages/ux-export/package.json
packages/ux-fees/package.json
packages/ux-fiat/package.json
packages/ux-flow/package.json
packages/ux-guide/package.json
packages/ux-i18n/package.json
packages/ux-intake/package.json
packages/ux-links/package.json
packages/ux-notify/package.json
packages/ux-presets/package.json
packages/ux-privacy/package.json
packages/ux-receipts/package.json
packages/ux-sandbox/package.json
packages/ux-schedule/package.json
packages/ux-vault/package.json
```

### #207: all five files

```text
.github/workflows/ci.yml
.github/workflows/contract-analysis.yml
.github/workflows/ghostpay-codex-cloud.yml
.github/workflows/ghostpay-parallel-review.yml
.github/workflows/nightly.yml
```

### #49: only file

```text
package-lock.json
```

## Coordinator follow-up

PR #49 was closed after the independent entry-equivalence check above and a separate coordinator check. The branch was retained. A subsequent fresh dev-inclusive `npm audit --audit-level=high --json` on unchanged main dependency source returned exit1:30 affected dependency entries (14high,16low), with the high chain originating in the picomatch advisory GHSA-fc5q-39xc-vjpf. This differs in scope from the production-only zero-advisory result. See NPM_AUDIT_ALL_MAIN.json and the execution report for the separate narrow-repair outcome.
