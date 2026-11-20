# Executed tests and qualification limits

Checkpoint: 2026-11-19 UTC. Latest verified main: [c977b5d6723f6822c3b5d86cd6b231712c53c395](https://github.com/djshellshoxxx/GhostPay/commit/c977b5d6723f6822c3b5d86cd6b231712c53c395).
Branch: codex/ghostpay-consolidation-records-20261119 ([PR #273](https://github.com/djshellshoxxx/GhostPay/pull/273)). Initial baseline: 14ded337a10c140d7a9f9a9238ec038587d925bb.

Read [HANDOFF](HANDOFF.md), [FEATURE_MATRIX](FEATURE_MATRIX.md), [SECURITY_AUDIT](SECURITY_AUDIT.md) and [REMAINING_WORK](REMAINING_WORK.md) together. Verification below is source-bound; no release or feature-complete declaration is made.

## Source identities and environment

Local original-config checks used Node 24.22.3. Hosted workflows use their configured Node 22 and remain mandatory. A fresh exact-lock selected-web npm ci completed with 305 packages after initial runtime interruptions; no lock/manifests were changed. Libraries were rebuilt, including the test-only relayer-guard workspace.

Initial adapter publication 146e52481733fec5fc95580eb9d2d41a01a05df0 and local 8df4846138f67d2efbc29c0a9fa980a10a9d3103 have identical tree 28b3f3e73aa1bd94082cc936aa84a92dd03615f4. Final pre-main Sweep source a67d09750f13ae2cfee3a0ad7bdc3ccb6c28b4f0 has tree 7bbf2ad52cf6746a7198fdc00c5f934abeb51fd8; an isolated index reconstructed that complete tree from the tested files. Current combined #271/#272 heads preserve every feature source/test blob but add separately qualified main #257. Combined-head hosted gates are not replaced by local pre-merge evidence.

## Executed checks

Counts in different rows can overlap. Native harness assertions, author evidence, original suites and browser tests are not interchangeable.

| Check | Exact source / scope | Actual result |
|---|---|---|
| Chain adapters original suite and coverage | #271 initial tree 28b3f3e | 552 passed, 22 existing skips. Statements 97.35%, branches 96.48%, functions 99.01%, lines 98.93%; original thresholds unchanged. Native Anvil/solc/artifact skips remain. |
| TRON original suite and coverage | Same source | 104 passed, zero skips. Statements 96.98%, branches 93.36%, functions 98.92%, lines 99.08%. |
| Four formerly failing TRON browser-component files | chainViews.i18n, TronView.lock, TronView, chain.hardening | 67 passed, zero skipped; includes first/middle/last omitted-height privacy regressions. This is component testing, not a launched-browser suite. |
| Independent actual-source TRON harnesses | Same reviewed adapter/scanner modules | 7 RPC + 9 scanner tests passed, including 120 complete and 120 deleted ranges, native/TRC20 positive paths, cancellation, final short page and later-page failure. |
| Adapter scoped type-aware ESLint | Nine changed source/test paths | Passed, exit 0. |
| Adapter full web TypeScript, lean Vite and postbuild scan | Tree 28b3f3e; 1536 MiB V8 heap | Passed; 17 emitted files scanned, bundled deployment source verified, no dynamic code/unexpected origins/maps/loose deployment JSON. Prior 768 MiB OOM is superseded by this success. |
| Initial Sweep regression against unchanged #252 | 34 quote/relayed lifecycle cases | RED: 28 failed / 6 controls passed. |
| Direct/re-sign extension against previous 9e4ec2da | Final 70 lifecycle cases | RED: 30 failed / 40 controls passed. |
| Final Sweep component selection | a67d0975 / tree 7bbf2ad5 | GREEN: 70 lifecycle + 17 privacy + 55 existing Sweep = 142 passed, zero skipped. |
| Final Sweep scoped type-aware lint, secret scan and whitespace | Same exact source | Passed. Independent reviewer approved runtime blob 2b832d371229385a2a1228e16320aceb9a64ee59 and test blob 41baa63e14fad5ea0dcf54c202b2ef3b0faa5476. |
| Final Sweep full TypeScript, lean Vite and postbuild scan | Same complete pre-main tree; 1536 MiB | Passed, exit 0; 17 emitted files. Resolves prior 768 MiB OOM and 1536 MiB process-kill attempts. |
| Strict JSON original focused file | #265 c591b54078febcf24cba01b29bc173b2fac1f9cb | 11/11 passed; baseline 10 passed/1 failed. Package typecheck and full package lint passed. |
| Independent JSON adversarial harness | Same exact source | 34,618 assertions passed, including 10,000 dense-array parity cases, holes/decorations/symbols/inherited holes. This does not qualify all later descriptor changes in #270. |
| Merchant clock original focused file | #268 ddfc8cfafa44b09103ced821f160c1d37fdfe552 | 8/8 passed; baseline 7 passed/1 failed. Package typecheck/lint passed. Native harness 5/5, including 500 signed-profile mutations; baseline 2 passed/3 failed. |
| Hosting kit original suite | #267 c3a693e87053fbe91219f8edfe159a5ec0a37a34 | 284 passed, 15 conditional skips, zero failures. Focused 11/11; baseline 9 passed/2 failed. Independent filesystem probe covered 160 timestamp cases plus index. |
| Jitter original repository test file | #274 a4c6f945adef0438bfd0b347fb7c11057e3973ce | Independent 13/13 passed, zero skips; same committed tests on baseline runtime 11 passed/2 failed. Scoped lint killed 137 before diagnostics, not a pass or attributed source failure. |
| Policy fixture recovery | #275 dc821780e05483d1b35062a74b07be7ed9ca2f1c; parent73545f63 | Independent exact-hunk review, syntax-only validation, whitespace and three-file byte readback pass. No package-test/typecheck/lint/Anvil pass: setup killed137, then ENOSPC228; native binaries absent. |
| Paused relayer lane reproduction | #218/#262/#264 identical lane source | Exact-source Node execution returned ran:true, value:stale-ticket-executed, heldClients:1, exit 0. Low internal invariant only; no public exploit established. |
| Secret and action-pin scans | Adapter source / unchanged shared workflow inputs | Secret scan passed; 111 action references pinned; git diff --check passed. |
| Production dependency audit | Unchanged main/#271/#272 package lock | npm audit --omit=dev --json exited 0; 0 known vulnerabilities in all severity categories, 286 production dependencies in metadata. Different broad dependency train not covered. |
| Branch/PR/claim verification | Original census and current-main resolutions | JSON/count checks, unique source identities, every original disposition, ancestry comparisons and independent additive-claim reconstruction passed. |

## Reproduction commands

From a clean exact source checkout, use the repository's unchanged package configuration and required native artifacts. Commands shown here describe executed scopes; a command's presence is not a passing result.

    npm ci --workspace @ghostpay/web --ignore-scripts --no-audit --no-fund
    node scripts/build-workspaces.mjs --workspace @ghostpay/web
    npm test --workspace @ghostpay/chain-adapters
    npm test --workspace @ghostpay/tron-adapter
    NODE_OPTIONS=--max-old-space-size=1536 GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build --workspace @ghostpay/web
    bash scripts/scan-secrets.sh
    bash scripts/check-actions-pinned.sh
    npm audit --omit=dev --json

Focused adapter web run, from apps/web:

    NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/vitest run src/features/chainViews.i18n.test.tsx src/features/tron/TronView.lock.test.tsx src/features/tron/TronView.test.tsx src/features/tron/chain.hardening.test.ts --maxWorkers=1

Sweep focused tests use the original config and one worker: src/views/Sweep.quoteLifecycle.test.tsx, src/views/Sweep.privacy.test.tsx and src/views/Sweep.test.tsx. The source-pinned agent handoff contains their precise execution commands and RED/GREEN artifacts.

## Additional inspected evidence from the active #270 coordinator

The [73545f63 execution receipt](https://github.com/djshellshoxxx/GhostPay/blob/73545f63112910d46002718354ab5e99f8652e1f/docs/consolidation/followthrough-20261119/EXECUTION_EVIDENCE.md) was fetched and reviewed, not rerun by this team. Refreshed JSON plus retained #268 merchant source passes32/32 and original invoice TypeScript; lint and production-build attempts were killed. Historical fefcd57 scanner source passes21/21 and the unchanged one-million-log corpus in65.62seconds with the original180second deadline; those scanner/config blobs remain identical after refresh.

A DIFFERENT completed historical full invoice-schema run on fefcd57 reported855passed/3failed,858total,13of14files,exit1,852.72seconds. The three existing passphrase cases exceeded unchanged60000ms deadlines; no final coverage report or qualified thresholds resulted. Raw-logSHA256:e2a6819cc3d49c5250277801a41aeceb188c88fac9851302346501e58f398d05. This completed failure is separate from this team's interrupted optional run below and is not final73545f63 qualification. Ultimate resource/performance attribution remains unresolved.

## Failed, interrupted and unavailable checks

- Initial installation hit disk exhaustion; later partial installs/native tests were killed or SIGBUS. They were discarded. The successful fresh install and original suites above replace those attempts; partial installations are never counted as verified.
- Optional full invoice-schema coverage was interrupted with SIGINT/exit 130 after prolonged execution. The partial passphrase-test log contained three roughly 60-second timeouts (tampering authenticated fields, authenticated malformed plaintext and Unicode normalization). Those KDF/test sources were unchanged by the clock fix; attribution is unresolved. No final full-suite/coverage pass is claimed and no timeout/threshold was weakened.
- Chromium launch preflight, using installed Chromium and Playwright, aborted SIGABRT before a page/context opened: process-singleton socket creation was denied (Operation not permitted). No Sweep browser test or build was run by that preflight. Do not bypass the platform restriction with unsupported flags.
- A later shared-runtime restart removed /tmp checkouts/dependencies and interrupted further lint/dependency preparation. Source-pinned reports and remote branches survive. Completed test outcomes are distinguished from lost/incomplete processes.
- Broad #264 at bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a: TS2305 from removed stripComments import, 35 web lint diagnostics and one native policy fixture INVALID_PROOF failure. #270 already repairs 21 lint diagnostics and the obsolete import. Remaining scan lint/rejection repairs are owned by sources carried in #269; the policy fixture is a separate exact-hunk recovery. Runtime proof checks are correct and unchanged.
- No fresh comprehensive fuzz/property qualification across invoice/QR parsing, address/network identifiers, backup import and cryptographic serialization is established. The executed JSON/TRON harnesses are bounded evidence, not a substitute for that user-requested final gate.
- #264 also has failing full E2E, Pages, beta, hosting, CodeQL and Mythril gates. Failure attribution must use each exact job/source, not assume one test repair fixes every job.

## Hosted snapshot near 11:05 UTC

| PR / head | Reported check runs | Qualification |
|---|---|---|
| #257 / 4f14d6f1 | 36 success, 3 intentional deployment skips; Snyk success | Verified immediately before merge. |
| #252 / 40856224 | 36 success, 3 intentional deployment skips; Snyk success | Source qualified before new main claim conflict; carried in #272. |
| #271 / 429a4de8 | 10 queued, 1 running, 1 skip | Combined head not green. |
| #272 / 63ff40d5 | 11 queued, 3 cancelled, 1 skip | Combined head not green; inspect latest attempts/cancellation before retry. |
| #262 / c7e09bc7 | 12 queued, 1 running, 1 skip | New broad head not green. |
| #269 / 683f8587 | 7 queued, 1 success, 1 skip | Active continuation not green. |
| #270 / fefcd57f | 9 queued, 1 success, 1 skip | Active continuation not green. |
| #273 / b05a71f2 | 3 queued | Pre-recovery documentation claim, not final-head evidence. |
| #274 / a4c6f945 | 3 queued | Independent focused tests do not close hosted gates. |

Check matrices can expand after a queued changes job. Counts are snapshots, not permanent requirements or proof of omitted jobs. Fresh current-head checks, legacy statuses, reviews and target reconciliation remain mandatory. No complete latest-main full-suite, native cross-chain, browser/device or release qualification is asserted.

## Superseded workflow cancellations inspected

A later exact-source workflow read shows #272's cancelled CI/CLI/Pages/beta attempts have replacement runs on the same63ff40d5 source. Replacement CI44510549246 and CLI44510549322 are pending; Pages44510549223 and beta44510549587 are queued. The old CLI cancellations are historical, not an application failure. No duplicate rerun was launched; these replacement gates must still complete successfully.

## Final source-bound results — 11:41 UTC

| Check/source | Actual result | Qualification boundary |
|---|---|---|
| #277 final8cbae85c, Node24.22.3, original built-in command,128MiB | Implementation17pass/0fail/0skip; independent17/0/0; both syntax checks and diff check pass | Four-file source/tree readback exact; no hosted CI, package lint, application/browser or real-artifact pass inferred |
| Original #276 plus two race regressions | 6pass/2fail/0skip | Both hooks reached the actual unsafe acceptance paths |
| Pre-encoding repair067882fa plus final suite | Independent15pass/2fail/0skip | Both static directory/manifest aliases reproduced; staged implementer REDs15/1 and16/1 also retained |
| #264 Mythril artifact14516957113 | Exact source/report hashes verified;10 findings:7Low/3Medium; strict exit1 | Five successful analyzer result objects are not a passing strict gate or proof of complete symbolic exploration |
| Later #262 evidence packet | Complete historical unit diagnostic3584pass/33fail/13skip; repaired-file replay96pass/1fail; later coverage replay interrupted before aggregate | External source-bound results, not execution by this team; source identities and narrower final type/build passes remain separately recorded in the final receipt |
| Main and current candidate CI | No additional fully complete GREEN candidate observed | Pending checks are not passes; cancelled/superseded attempts remain explicit |

The [11:31–11:34 inventory](20261119-eligibility-snapshot-1134.md) retains148 check runs and55 workflow runs. A later11:41:37 refresh records #27111queued/1success/1skip; #27211queued/3historical CLI cancellations/1skip; #273 claim head4552f55d6queued; #27510queued/1skip; #2774queued/1skip; #2675queued. A subsequent documentation-only containing commit has its own new checks; these are fixed observations, not live status.

#272 Hosting run44510549243 (#368) is cancelled, while44510548951 (#367) is queued with the identical head63ff40d5, base8f563764 and pull_request event. Both were created at10:58:28Z; the queued attempt was updated later. CI/CLI/Pages/Beta have higher-number same-head replacements, but this Hosting pair must not be described that way. No blind rerun was requested while an equivalent attempt remained queued.

The executor restarted twice and lost temporary installs. Disk availability later fell to75MiB; only a verified disposable62MiB policy checkout was removed, retaining its already-published source pins and external evidence. Exact-lock policy setup remained blocked by prior SIGKILL/ENOSPC; no policy unit/type/lint/native pass was manufactured. Browser process-socket restrictions and unavailable native tools remain. These constraints prevented fresh broad qualification; they do not make unfinished tests or features complete.
