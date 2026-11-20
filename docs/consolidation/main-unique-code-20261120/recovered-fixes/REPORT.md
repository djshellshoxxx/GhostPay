# Recovered unique-code consolidation

## Scope

The owner requested consolidation into main. Hosting PR #267 is merged at `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. PR #306 combines five other reviewed branches at `885b9569e6fc99e43bf01d23305494275e10120e`.

This second candidate recovers **16 isolated contributions in 38 source/test files**, through 16 atomic recovery commits. Source head before final evidence publication: `2836cd5f648c39ad683f09a382d7025887c1f101`. There are 37 exact reviewed donor blobs and one six-line adaptation of the current Pages builder. Source identities and the complete adaptation are pinned in [PROVENANCE.json](./PROVENANCE.json). Broad donor parents are not attached: selected-file recovery does not mean their full feature set was merged.

## Modules

| Module | Change | Original PRs | Recovery commit |
|---|---|---|---|
| camera | cancel pending QR imports when the page becomes hidden | #258 | 1a4b5fe265aedb587341a2fc7e4ddca3ba77366c |
| json | preserve canonical JSON array invariants | #265, #270, #278 | 74210f9b957a68bb1567219039b094ac90ce7118 |
| scanner | skip explicitly unsupported announcement schemes | #270, #278 | ac293b6e5dfac59df739077568e1bb03c5363816 |
| calendar | reject impossible deployment calendar dates | #271, #292 | 2e61af277030d76f765b320b9f3e0e81e1a6cddd |
| rpc | bound retries and suppress ambient RPC credentials | #271, #278 | 1bf1ac709a1147395d2f47dcdc5eab6a5ffc517b |
| merchant_clock | reject invalid merchant verification clocks | #268 | 8730f6e09e0077e081c930adec122b7335bd0851 |
| jitter | preserve invoice expiry across clock rollback | #274 | 9105f160c06cb3532ef346196a02a988100c6dc6 |
| base64 | reject non-string base64url inputs with qualified regression tests | #289, #278 | 31c34319aeaa9dbc211b8ccc6bdf65fc3e755ea2 |
| qr_keys | reject non-primitive QR keys and preserve warning coverage | #290, #295, #302 | 7d2212d3c099aefaef3915c85f0fb0929a441fe1 |
| assembler | preserve QR idle deadline after rejected conflicts | #294 | 3f135bc46b46d232ddea3258c1b19a27c3ded346 |
| receipts | bind wallet receipts to submitted hashes and align consumer fixtures | #298, #302 | 54d224c78d4af7a84d6cfaaf2e2380990c93eeb7 |
| format | validate runtime amount text and precision | #301, #303 | 8644147aee370381806bb394931534a9fd553d4f |
| boolean | validate canonical ERC-20 simulation Boolean results | #305 | e9d9331d2a04cb721610b1a25e157ed08eed64d7 |
| integration_lock | recover strict cooperative integration locking | #261, #278 | 33262b9218fabbb066fd85cd4f6a5c368e9c23b9 |
| pages_integrity | verify staged Pages artifact bytes before output promotion | #278, #292 | a9806219fedd2365a7339b3e1fe0fd8f5828230f |
| quote_decimals | retain quote price decimal boundary regression coverage | #278 | 2836cd5f648c39ad683f09a382d7025887c1f101 |

## Independent review and qualification

Reviewers `release_review` and `latest_fixes_review` inspected module diffs and dependencies; root inspected runtime deltas. For the original thirteen modules, fresh reviewer `combined_verify` independently confirmed all 31 file blobs and modes, all 13 production diffs, exactly 31 source/test changes plus the additive work-log claim, and no unexpected leaf changes. All receipt consumer fixtures, the #289 lint repair, and the #292 byte-equivalent calendar fixture clarification are present. No blocking source issue was found. The same reviewer confirmed #306 preserves all 15 donor blobs, all five donor parents, and complete ownership sections.

**Combined-head hosted CI is still required. No local test run is claimed: the local executor became unavailable. Pending, skipped, failed and cancelled checks are not passes.**

Donor evidence and limits:

- #258 camera: 33 successful checks / 3 intentional deployment skips, CodeQL successful.
- #268 merchant clock: 36 successful checks / 3 intentional skips; old branch has documentation conflicts.
- #278 final general CI passed, including original web/package suites, full/lean browser suites, lint/typecheck and Pages. Its CodeQL and Mythril failures remain unresolved and are not waived.
- #289 original test failed lint due to an unused callback parameter. This candidate uses its already-reviewed corrected final #278 test.
- #294 actual QR coverage ran 239 tests in seven files, including 13 assembler tests, successfully. Its donor-wide web/E2E failures are outside those two QR files. Scoped success does not qualify this new combination.
- #298 omitted a shared policy receipt hash and failed 20 policy tests. This candidate includes #302's repaired fixture plus primitive transaction/status guards; all affected consumer fixtures move together.
- #301/#303 amount source/tests are identical: one contribution. Their pending full checks are not called passed.
- #305 Boolean simulation has source review but pending donor full CI and a cancelled Windows check. It remains unqualified until this candidate passes.

Additional operational recovery evidence:

- Cooperative integration locking: the exact helper and its ten tests passed in #278 general CI run 44650172265, job 136010894548. The existing CI discovers these tests without workflow changes. A held lease cannot be acquired merely because its expiry has passed.
- Pages verification: the exact verifier and seventeen tests passed in #278 Pages job 136002805694, run 44650172281 (112 Pages tooling tests total). The seven later promotion-gate cases from #292 cover a positive build and six rejected artifacts; that donor recorded 24 verifier/promotion tests passing. This candidate adds only the verifier invocation to the current builder; the broader donor origin/CSP/frame changes are not imported. Verification checks integrity against the build's supplied manifest and source commit, not authenticity of an externally supplied manifest.
- Quote decimal boundaries: the recovered test adds negative and excessive price-decimal assertions. The production quote implementation is byte-identical between main and the donor.
- Root verified all 38 final blobs/modes against the recovery manifest and found no unexpected source changes. The builder retains executable mode 100755; removing the inserted six lines reproduces its original bytes exactly. Independent reviewer `combined_verify` approved the final seven-path extension at source commit `2836cd5f648c39ad683f09a382d7025887c1f101` / tree `30702edc2dc30150c28f76b84268654835a74285`: exactly the claimed seven paths plus additive ownership text, all original 31 blobs preserved, all six additional exact donor blobs verified, no omitted dependency, and no blocking integration finding. The actual builder suffix and its integration tests are coherent. This is static review, not a test execution.

## Current qualification queue

At the 2026-11-20 06:38 UTC observation, #306 still had eleven queued checks, two in progress and one intentionally skipped release-only check. Its core CI run [44685958289](https://github.com/djshellshoxxx/GhostPay/actions/runs/44685958289) had unassigned initial jobs with no steps executed. Ubuntu CLI and JavaScript/TypeScript CodeQL had begun; this is partial progress, not qualification. Current #307 source checks were also pending/queued, and final evidence publication will establish its final qualification SHA.

The queue affects main and multiple operating systems. An older #305 changes job waited from 04:41:03 UTC until 06:34:10 UTC before receiving a runner, then passed in six seconds. No accessible metadata establishes a billing, permission or quota cause. Existing per-PR concurrency cancels superseded runs, so final source/evidence will be frozen and existing checks allowed to progress. No rerun, cancellation, gate change or runner-setting change is used as a substitute for successful checks.

Required order: #306 passes its combined checks, a fresh ownership/head check permits its merge, then #307 is retargeted to main and all applicable checks (including CodeQL on the correct base/head) must pass before promotion. Donor successes and the source review below do not override this requirement.

## Complete current ref census

A fresh listing captured 321 branches / 317 distinct heads. Against main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`: 178 branch refs are ancestry-contained, 142 related nonancestors, and `gh-pages` has unrelated deployment history. [BRANCH_CENSUS.json](../BRANCH_CENSUS.json) records exact refs and bounded changed-file scope. GitHub's 300-file comparison bound is marked limited. Ancestry describes history, not proof that every historical behavior survived later edits. Nonancestry alone does not establish unique behavior.

An additional exact-blob comparison examined 120 distinct nonancestor code heads using full, untruncated trees. Nine have every compared code file already identical to main; nineteen have every compared code file identical to this candidate (these counts overlap). Thirty-six comparisons were limited by the 300-file changed-path ceiling. [BLOB_DISPOSITIONS.json](../BLOB_DISPOSITIONS.json) records per-head scope, equality counts and the small scopes' exact paths. Equality of a bounded set is not a finding that a large branch is fully represented.

The existing #278 archaeology still retains broad UNKNOWN scopes. This pass does not assert exhaustive semantic review of them.

Seven additionally reviewed historical branches are already represented by exact or stronger main code/tests: `chatgpt/ghostpay-historical-consolidation-20261115`, `chatgpt/zero-codex/pages-negative-fiat-regression-20261114`, `chatgpt/zero-codex/pages-tagarchive-blocked-click-20261117`, `codex/ghostpay-cloud-41868394956`, `fix/remediation-b16c7936-5ce634`, `chatgpt/zero-codex/ux-guide-plain-object-20261111`, and `claude/happy-maxwell-onl4x5`.

**Historical classification correction:** `fix/remediation-f95457fd-22ecf9` at `6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a` is rejected/superseded, not a missing fix. It labels every differing payer/chain journal key legacy and blocks legitimate later scopes. Main's policy tests explicitly preserve different-scope payments while refusing same-scope duplication. Do not restore this patch.

## Concrete remaining blockers

1. Broad #278: [CodeQL check 136021124871](https://github.com/djshellshoxxx/GhostPay/runs/136021124871) reports two High alerts; [strict Mythril job 136002883945](https://github.com/djshellshoxxx/GhostPay/actions/runs/44650172375/job/136002883945) completed with failure. Passing [general CI 44650172265](https://github.com/djshellshoxxx/GhostPay/actions/runs/44650172265) does not override them. Broad scope includes relayer/future modules and a confidential contract.
2. Clipboard #293/#297: original #293 has 18 test lint errors and a timer-result regression. #297 repairs those tests but donor-wide failures remain. Later privacy snapshot production code contains additional safeguards; do not replace it with the older helper.
3. Quick-hide #300 depends on snapshot `d6819796a9542acc488b896786faffe83b913d9b` (41 app/test/locale paths). At head `137628961463fc5abd8b7927b2efe6b18a0a206a`, WalletAttempts requires wallet context, while both Pay instances and RegistryView omit it. Journal detail/clear controls remain inaccessible after connection. Pages buyer acceptance fails; web has ten failures. Repair wallet/account/chain lifecycle wiring while preserving uncertain-attempt records and duplicate-send protection.
4. Larger receipt-minimization, selected-signer, custody/recovery, private-scanning/network-authorization and origin/frame feature families share service, lifecycle, UI and translation dependencies. Preserve their branches for coherent integration.
5. Beta privacy issue #286, external review, signing identity, origin/HTTPS, deployment and actual testnet wallet acceptance remain separate release requirements.

## Coordination correction

During this task, an expired but still-held cooperative lease was advanced before the existing helper's strict no-takeover rule was inspected. That advance was not a valid acquisition under the helper's protocol. This task then released its replacement lease with current owner, token and expected-head checks at `93b50a03fea1f22ff9dc403099ce1eb09635299c`, preserving the prior history. This task claims no current integration lease. Future promotion must first inspect current ownership and acquire only when the protocol allows; expiry alone never permits takeover. No other coordinator's source branch or files were changed.

## Preservation

No dependency, package version, workflow, security threshold, contract, deployment setting, fee or payment activation is changed. Original branches remain intact. No force update, tag, release, deployment or real-funds operation occurred. Main promotion requires applicable passing checks and a fresh head/ownership recheck.
