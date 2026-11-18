# Dependabot PR review — 2026-11-18

Initial read-only review of four PRs missing from the earlier connector inventory, followed by the completed #236 repair described below. The original source comparison is pinned to main `dfc75ef2087fa6463ae59e0818abec01796c578d`. These PRs all existed before the initial execution brief, so the initial inventory was 32 PRs, not 28.

## Disposition

| PR | Exact original head | Changed files | Original reviewed check snapshot | Recommendation / subsequent action |
|---|---|---:|---|---|
| #210 | `4d19655a2e5d93ad9378803cd4163245168aca24` | 68 | 23 failure, 11 success, 3 skipped, 1 neutral | Preserve; the dependency integration repair is now locally validated in draft #236, targeting #210. Require successful hosted and combined-head checks before integration. |
| #207 | `199ab7ef1e80e6368fdc17c09b94c87a62871861` | 5 | 1 failure, 27 success, 2 skipped, 1 neutral | Source update acceptable; preserve until the failed Mythril gate is resolved. Do not merge red. |
| #87 | `bbc8ff3ba6c8e3786ccea9bd5c2679d0527bc6aa` | 69 | 24 failure, 10 success, 3 skipped, 1 neutral | Preserve; requires a coordinated major-version migration. Do not merge. |
| #49 | `6bffb63d1638253e677511672ffd32c24ac8f2f6` | 1 | 21 success, 1 skipped, 1 neutral | Close as superseded after coordinator verifies the lock entry. |

At the original retrieval, all checks in this table were completed and tied to these exact heads. This is historical evidence, not the final live check inventory; the coordinator must refresh state before any action. CodeQL was neutral for all four because three main-branch configurations were absent from the PR analysis; neutral does not establish a clean code-scanning comparison.

## Original #210: mixed viem versions fail the shared library build

This changes 67 workspace manifests and the root lockfile, with no runtime source, workflow, or gate changes. Nine package updates are proposed: viem 2.57.13→2.57.19; Vitest and coverage-v8 5.0.5→5.1.0; Prettier 3.9.10→3.10.1; Zama SDK 3.7.1→3.7.2; Playwright 1.64.1→1.65.1; user-event 14.6.8→14.6.10; plugin-react 6.1.2→6.3.0; Vite 8.3.5→8.3.8. These target versions are not already adopted on reviewed main. The two Vitest components are bumped together.

The root `@0xbow/privacy-pools-core-sdk` viem override remains 2.57.13. The lockfile retains root `node_modules/viem` 2.57.13 while placing 2.57.19 under `packages/confidential-amounts/node_modules/viem`. The Zama SDK resolves its viem types through the root copy. Passing package-local clients into its adapter fails TypeScript structural compatibility.

Confirmed hosted evidence: [ts-typecheck job 134649934566](https://github.com/djshellshoxxx/GhostPay/actions/runs/44257870877/job/134649934566) installs successfully, then fails `npm run build:libs` in `packages/confidential-amounts/src/backends/zama-sdk.ts` at the `publicClient` and `walletClient` properties, lines 100–101, with TS2322. The diagnostic identifies the two viem module paths. Therefore the failing test jobs cannot be interpreted as tests of the upgraded application that ran to completion.

The initial review required deliberate dependency/override alignment, normal lock regeneration and fresh build/type/test qualification without casts or weakened gates. That bounded dependency repair was subsequently completed and independently reviewed in #236. The original failed checks remain valid historical evidence; they do not describe an unrepaired local viem boundary. Hosted and browser qualification remain separate requirements.

## #236: completed viem alignment and coverage-provider repair

[Draft PR #236](https://github.com/djshellshoxxx/GhostPay/pull/236) targets #210. It preserves the full #210 dependency candidate and adds two separately attributable repairs. The root manifest, root lockfile, task claim and dedicated handoff are the only four changed files relative to #210. Application code, workspace package manifests, contracts, workflows, tests and coverage settings are unchanged.

### Source pins and repaired behavior

| Evidence | Exact pin |
|---|---|
| Original #210 base | `4d19655a2e5d93ad9378803cd4163245168aca24` |
| Existing viem override alignment | `0597852aeede368b0b8819be0c4cd68c9b1a6081` |
| Separate coverage placement repair; final tested dependency source | `8b98e68effa2da42dd612c7db456b63dbdf990a2` |
| Final local head including documentation | `16e03955b26450ac1c7cfed2e030cde99eb727e6` |
| Published #236 head | `defdaa308a2d05ab407af7e42f8dc457cf52d103` |
| Published/local full tree, independently matched by the coordinator | `dcdc3e7f3df8dcf4f0a5ee57d79a939264e78d02` |
| Tested root manifest / lock blobs | `12156705352eb7ddfaaab7b3190e60feefbb9f92` / `875e90c613d4bdc1ca53c564944b1a734b3ffd31` |

The first commit changes the existing 0xbow-specific viem override from 2.57.13 to 2.57.19. A clean original-head installation reproduced the two Zama TS2322 errors locally. After the repair, confidential-amounts, Zama and the 0xbow SDK all resolve the same root viem 2.57.19 file, and the complete library build passes. Zama 3.7.2 declares viem `>=2`; the 0xbow SDK itself declares 2.22.14, which the project already overrode to 2.57.13. This retains the existing override policy and aligns its patch version with the workspace clients; it does not claim that upstream 0xbow declares 2.57.19.

The first repaired candidate then exposed a separate coverage startup failure: root Vitest 5.1.0 could not import `@vitest/coverage-v8`, whose 67 copies were all workspace-local in the original #210 lock. Both original affected-package test commands exited 1 before executing tests. The second commit adds an exact root development dependency on the already-used coverage-v8 5.1.0, placing it beside Vitest. The original coverage-enabled commands then execute and pass. The inherited placement diagnosis comes from exact lock inspection; the executed coverage RED is on `0597852a`. Two later original-head diagnostic reinstalls were killed with exit 137 and supplied no baseline coverage-test result; no termination cause is certified.

### Normal lock regeneration and bounded deduplication

Both repairs were generated normally with pinned npm 11.21.2: a targeted `npm update viem --package-lock-only`, followed by `npm install --save-dev --save-exact --package-lock-only @vitest/coverage-v8@5.1.0`, with scripts/audit/funding disabled for regeneration and bounded resource flags. The [source-pinned handoff](https://github.com/djshellshoxxx/GhostPay/blob/defdaa308a2d05ab407af7e42f8dc457cf52d103/docs/handoffs/GHOSTPAY_VIEM_ALIGNMENT_20261118.md) records the complete commands. Earlier generated attempts that left stale resolutions or changed unrelated overrides were discarded. No force/legacy-peer install, broad audit fix, dependency-record transplant or suppression is retained.

| Delta | Added records | Removed records | Retained records changed |
|---|---:|---:|---|
| Viem repair vs original #210 | 0 | 132 | Root viem 2.57.13→2.57.19; root ox 0.14.59→0.14.65; web lock metadata `vite: ^8.3.8`→`8.3.8`, matching its already-exact workspace manifest. |
| Coverage repair vs viem commit | 3 | 201 | Root lock metadata gains the exact development dependency. |

The viem removal set contains 24 copies each of viem, ox, `@noble/curves` and `@noble/ciphers`, plus 36 `@noble/hashes` copies. Independent review found 127 retained equivalents with identical metadata; five pool-circuits entries differ only by the former `dev: true` placement flag. The coverage removal set contains 67 copies each of coverage-v8, istanbul-lib-coverage and istanbul-lib-report; every removed record has a retained equivalent with identical metadata. The three root additions already existed identically in workspace locations.

Combined: **333 duplicate records removed, three equivalent root records added, four retained records changed**. No new unique package/version/tarball/integrity tuple is introduced; only old viem 2.57.13 and ox 0.14.59 tuples disappear. All **30 OS/CPU/libc-constrained records** remain unchanged, as do unrelated versions, integrity values and security overrides. The coordinator independently recomputed the combined delta; the privacy reviewer independently checked both constituent deltas and installed module resolution.

### Previously executed validation and actual limits

Validation used Node 24.22.1 and npm 11.9.0 for clean installation and execution. The later documentation commit leaves both tested manifest/lock blobs unchanged.

| Source | Command / gate | Actual result |
|---|---|---|
| Original #210 | Bounded `npm ci --ignore-scripts --no-audit --no-fund --maxsockets=2 --prefer-offline` | Exit 0; 1,051 packages installed. Earlier killed/interrupted attempts are not success evidence. |
| Original #210 | `npm run build --workspace @ghostpay/confidential-amounts` | Exit 2; both Zama/viem TS2322 errors reproduced. |
| `0597852a` | `NODE_OPTIONS=--max-old-space-size=1536 npm run build:libs` | Exit 0; 77 workspace build invocations. The subsequent coverage-only commit changes no library source or runtime dependency record. |
| Final `8b98e68e` | Clean bounded `npm ci` with the same flags | Exit 0; 721 packages installed. |
| Final `8b98e68e` | `npm test --workspace @ghostpay/confidential-amounts -- --maxWorkers=1` | Exit 0; 88 passed, no skips. Coverage: 99.38% statements, 95.18% branches, 100% functions, 99.76% lines. |
| Final `8b98e68e` | `npm test --workspace @ghostpay/external-pools-privacypools -- --maxWorkers=1` | Exit 0; 73 passed, four existing artifact-dependent skips. Coverage: 98.11% statements, 91.46% branches, 98.85% functions, 99.77% lines. |
| Final `8b98e68e` | `npm run test:dependency-tooling` | Exit 0; 5/5 existing Mocha/solc integration checks passed. |
| Final `8b98e68e` | `npm run typecheck --workspace @ghostpay/confidential-amounts --workspace @ghostpay/external-pools-privacypools` | Exit 0 for both packages. |
| Final `8b98e68e` | Corresponding two-package `npm run lint` | Exit 0. |
| Final `8b98e68e` | `NODE_OPTIONS=--max-old-space-size=1536 npm run build --workspace @ghostpay/web` | Exit 0; whole-web TypeScript, Vite production build and unchanged postbuild bundle scan passed; 19 files validated. |
| Original #210 and final `8b98e68e` | `npm audit --omit=dev --audit-level=high --json` | Zero production findings; successful audits. |
| Original #210 and final `8b98e68e` | `npm audit --audit-level=high --json` | Exit 1; unchanged 30 affected dependency entries: 14 high and 16 low. |

The privacy reviewer independently reran the final Zama SDK/glue selection: **17/17 passed**, overlapping the author's 161 passing SDK/package tests. Coverage was disabled only for this additional narrow reviewer selection; the author's original full package commands retain their coverage thresholds and pass. The reviewer independently repeated production and full audits with the same zero/30 results, then checked the final documentation and unchanged source blobs. No blocking source/lock finding was identified.

The four skipped Privacy Pools cases require external circuit/contract artifacts and Anvil for the full integration. They were not forced to pass. The suites exercise real offline SDK derivations and load Zama's real node/web/cleartext entry points, but no live relayer, public-chain, real-funds or browser execution is claimed. The web build retains nonfatal diagnostics for build-time `help.css` resolution, PIR `node:http` externalization, a large chunk and an ineffective dynamic import; the successful build is not a browser qualification result.

**Material security caveat:** #236 does not remediate [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). The full audit remains red with 30 entries; its 14 high entries are propagated records, not 14 distinct advisories. Production-only zero findings must not be described as an all-dependency security pass. See [PICOMATCH_AUDIT.md](PICOMATCH_AUDIT.md) for the unreleased upstream-fix blocker.

**Integration constraint:** #236 repairs #210's existing workspace viem 2.57.19 and Vitest/coverage 5.1.0 pins. Do not cherry-pick only these root changes onto unchanged main. Original #210's red checks remain historical evidence; local repair success does not replace required hosted checks on the repaired and combined head. This review asserts no new hosted-CI success, merge, deployment or complete beta qualification.

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

The coordinator's cached `npm-audit-main.json` was produced by `npm audit --omit=dev --audit-level=high --json` and reports zero advisories in the production scope. It does not certify the dev dependency graph. The originally retrieved npm-ci logs include dev dependencies and report 30 advisories for #210 (16 low, 14 high) and 18 high for #87. These are historical install summaries, not fresh full-audit results or proof that all listed issues are newly introduced by either PR. The CI production audit is located after the shared build, which those original jobs failed to complete. The initial read-only review performed no installations or source changes; the subsequent #236 repair, clean installs and fresh audits are recorded above. No broad npm audit fix, gate weakening, merge or deployment is claimed.

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
