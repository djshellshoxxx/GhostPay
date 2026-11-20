# Recovered unique-code consolidation

## Scope

The owner requested consolidation into main. Hosting PR #267 is merged at `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. PR #306 combines five other reviewed branches at `885b9569e6fc99e43bf01d23305494275e10120e`.

This second candidate recovers **13 isolated contributions in 31 production/test files**, through 13 atomic commits. Source head before this evidence commit: `e9d9331d2a04cb721610b1a25e157ed08eed64d7`. All selected blobs are pinned in PROVENANCE.json. Broad donor parents are not attached: selected-file recovery does not mean their full feature set was merged.

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

## Independent review and qualification

Reviewers `release_review` and `latest_fixes_review` inspected module diffs and dependencies; root inspected runtime deltas. Fresh reviewer `combined_verify` independently confirmed all 31 file blobs and modes, all 13 production diffs, exactly 31 source/test changes plus the additive work-log claim, and no unexpected leaf changes. All receipt consumer fixtures, the #289 lint repair, and the #292 byte-equivalent calendar fixture clarification are present. No blocking source issue was found. The same reviewer confirmed #306 preserves all 15 donor blobs, all five donor parents, and complete ownership sections.

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

## Complete current ref census

A fresh listing captured 321 branches / 317 distinct heads. Against main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`: 178 branch refs are ancestry-contained, 142 related nonancestors, and `gh-pages` has unrelated deployment history. BRANCH_CENSUS.json records exact refs and bounded changed-file scope. GitHub's 300-file comparison bound is marked limited. Ancestry describes history, not proof that every historical behavior survived later edits. Nonancestry alone does not establish unique behavior.

The existing #278 archaeology still retains broad UNKNOWN scopes. This pass does not assert exhaustive semantic review of them.

Seven additionally reviewed historical branches are already represented by exact or stronger main code/tests: `chatgpt/ghostpay-historical-consolidation-20261115`, `chatgpt/zero-codex/pages-negative-fiat-regression-20261114`, `chatgpt/zero-codex/pages-tagarchive-blocked-click-20261117`, `codex/ghostpay-cloud-41868394956`, `fix/remediation-b16c7936-5ce634`, `chatgpt/zero-codex/ux-guide-plain-object-20261111`, and `claude/happy-maxwell-onl4x5`.

**Historical classification correction:** `fix/remediation-f95457fd-22ecf9` at `6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a` is rejected/superseded, not a missing fix. It labels every differing payer/chain journal key legacy and blocks legitimate later scopes. Main's policy tests explicitly preserve different-scope payments while refusing same-scope duplication. Do not restore this patch.

## Concrete remaining blockers

1. Broad #278: [CodeQL check 136021124871](https://github.com/djshellshoxxx/GhostPay/runs/136021124871) reports two High alerts; [strict Mythril job 136002883945](https://github.com/djshellshoxxx/GhostPay/actions/runs/44650172375/job/136002883945) completed with failure. Passing [general CI 44650172265](https://github.com/djshellshoxxx/GhostPay/actions/runs/44650172265) does not override them. Broad scope includes relayer/future modules and a confidential contract.
2. Clipboard #293/#297: original #293 has 18 test lint errors and a timer-result regression. #297 repairs those tests but donor-wide failures remain. Later privacy snapshot production code contains additional safeguards; do not replace it with the older helper.
3. Quick-hide #300 depends on snapshot `d6819796a9542acc488b896786faffe83b913d9b` (41 app/test/locale paths). At head `137628961463fc5abd8b7927b2efe6b18a0a206a`, WalletAttempts requires wallet context, while both Pay instances and RegistryView omit it. Journal detail/clear controls remain inaccessible after connection. Pages buyer acceptance fails; web has ten failures. Repair wallet/account/chain lifecycle wiring while preserving uncertain-attempt records and duplicate-send protection.
4. Larger receipt-minimization, selected-signer, custody/recovery, private-scanning/network-authorization and origin/frame feature families share service, lifecycle, UI and translation dependencies. Preserve their branches for coherent integration.
5. Beta privacy issue #286, external review, signing identity, origin/HTTPS, deployment and actual testnet wallet acceptance remain separate release requirements.

## Preservation

No dependency, package version, workflow, security threshold, contract, deployment setting, fee or payment activation is changed. Original branches remain intact. No force update, tag, release, deployment or real-funds operation occurred. Main promotion requires applicable passing checks and a fresh head/ownership recheck.
