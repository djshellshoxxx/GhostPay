# GhostPay cycle report and evidence index

20 November 2026 (Pacific). Coordinator: 9a4ab6c3d117-root.
This evidence extends docs/ai/ACTIVE_WORK.md and preserves existing owners.

Main: aec179910c39081d820396409ff3139ff2264132.
PR #307: 5a745d4b5fba69b66a9779f88aefc63c253a4f27.
No shared target or lease changed, no PR merged, and no release or deployment ran.

## Delivered and verified

| Work | Actual result | Evidence |
| --- | --- | --- |
| Sweep journal correction | Existing strict parser validates saved state. Invalid records retain original bytes and unavailable error. 70 tests in four files pass; independent approval. | [Qualification](JOURNAL_QUALIFICATION.md), [review](JOURNAL_REVIEW.md) |
| Export interoperability | Actual application bytes feed the standalone decoder, then its recovered key signs an offline challenge. One case passes at production KDF; two independent reviews. | [Draft #346](https://github.com/djshellshoxxx/GhostPay/pull/346), stacked on #269 |
| Hygiene lint repair | Seven test-only findings corrected; 149 original tests, coverage, lint and typecheck pass. Original build reused with unchanged-input proof. | [Draft #347](https://github.com/djshellshoxxx/GhostPay/pull/347), [report](HYGIENE_LINT_REPAIR.md) |
| Existing #338 Bitcoin fix | Exact donor blobs reused; 563 package tests, coverage, compiler, lint and build pass; independently reviewed. | [Qualification](SECURITY_BTC_QUALIFICATION.md) |
| Existing #341 ledger | 154 original tests, coverage, compiler, lint and build pass; differing dependencies rebuilt from its own source. | [Qualification](LEDGER_QUALIFICATION.md) |
| Existing #328 vault fix | Existing draft reopened, source unchanged. Preserved 285-case qualification inspected, not rerun; fix absent from both targets. | [PR #328](https://github.com/djshellshoxxx/GhostPay/pull/328), [queue](QUEUE_REVIEW.md) |

Hygiene selections overlap. The four focused Bitcoin cases belong to its 563-case
suite. Do not add these source-specific selections into a unique-test total.

## Integration and publication

At 2026-11-21 00:18:09 UTC, lock c196151daf8233f96045fd205b2d899c9e8cc97d remained
held by 994a0d214fb9-root-r3, generation 11, with expiry 00:16:57.174 UTC. The
repository helper rejects takeover of a held record even after expiry.

Main adds #329/#334 after #307's incorporated main ancestor. #325 is retained.
#331's actual merge into the older Sweep branch is absent from both targets;
preserve its #333 → #335 → #344 follow-on ancestry. #333's aggregate failure
is not a separate compiler defect. [Exact queue review](QUEUE_REVIEW.md).

Shell Git publication lacked credentials. The authenticated GitHub connection
published identical blobs and complete trees with new commit metadata. #346 and
#347 were fetched back and their trees matched reviewed local checkpoints.
[Publication mapping](PUBLICATION.json) distinguishes execution IDs from remote
commit IDs. Original local history is preserved for reconstructing those IDs.

## Recovery inventory and feature status

The frozen census covers all 410 branches and 111 then-open PRs. Later #345 and
this cycle's new PRs are additions, not part of that historical denominator.

| Classification | main | #307 |
| --- | ---: | ---: |
| Ancestor/equal |189|199|
| Documentation/nonapplication |79|79|
| Changed application blobs retained |7|12|
| Application differences requiring semantic review |133|118|
| Coordination metadata |1|1|
| Unrelated publication history |1|1|

Mechanical inventory is complete for that snapshot. Semantic review remains
bounded; these are branch classifications, not unique missing-feature counts.
An overall completion percentage is not reliably estimable.
[Full census and duplication decisions](BRANCH_REVIEW.md).

Signed invoice files are already retained in #307: 15 of 20 paths match exactly;
the other five retain all 60 relevant catalog values and 15 security-key entries.
#310's current donor CI and six request-file browser cases per profile pass.
Those are donor results, not a new #307 browser pass. F04 (#322) now has passing
donor CI but remains an unmounted module. F05 (#323) and F10 (#324) remain partial
modules, with failed workspace-map and dependency-closure gates. Their compiler,
lint, web tests and browser jobs passed. Map regeneration alone does not satisfy
explicit dependency review. [Feature ownership and handoffs](MERCHANT_FEATURE_REVIEW.md).

## Privacy qualification

Issue #286 has five mandatory v1.0 requirements; #287 has four v1.1 requirements
and must not delay v1.0. The privacy stack has eight bounded implementations with
focused evidence plus partial retention. This is not an 8/9 release-completion
score. Its module families remain absent from #307.

#336 now has failed CI, Pages and Beta acceptance at its exact tree. Full web
unit results: 4,202 passed, 1 failed, 1 skipped; full browser 131/3/2, lean 118/3/5.
Failures include wallet-context journal fixtures, a stale getRpc inventory,
navigation/quick-hide focus and changed-wallet alert expectations. Successful
site builds, compiler and lint do not replace browser acceptance. The journal
remains stored when its details are hidden; fixtures must establish the correct
wallet context while preserving hash, duplicate-refusal and no-send assertions.
[Requirements, exact failed jobs and complete logs](PRIVACY_RELEASE_REVIEW.md).

## Financial safety and recovery

| Requirement | Verified scope and remaining boundary |
| --- | --- |
| Automatic refunds | NOT IMPLEMENTED in inspected Pages paths. Expiry blocks new authorization, not a prior transfer. Eligibility, initiation, authorization, execution, confirmation and interruption recovery are not a completed refund lifecycle. Gas-buffer policy explicitly uses refund none. |
| Duplicate protection | PARTIAL as a universal guarantee. Wallet/Sweep attempts retain uncertainty and support same-tab reload, but SessionStorage does not establish independent-tab or browser-session durability. |
| Replacement/finality | Specific same-nonce Sweep reconciliation exists. Arbitrary payer-wallet replacement discovery and universal final-settlement assurance remain PARTIAL/UNVERIFIED. |
| Seller master backup | Existing encrypted export/import and validation are present. Keys, payment discovery and transaction journals are separate recovery requirements. |
| Per-payment recovery | Existing source is on #240/#269, with selected export/decoder/guide paths absent from #307. #346 establishes one synthetic EVM EOA's fresh-export-to-offline-signature interoperability; browser download, wallet UI import and actual spend remain UNVERIFIED by that test. |
| Optional BTC/TRON | Mainnet remains disabled. In-memory keys and component-local outgoing state need separate backup/restart acceptance. Generated receive sharing can precede verified backup retention. |
| Evidence/reuse packages | #339/#341 improve bounded evidence and local testnet reuse; they do not independently establish canonical headers/finality or install a #307 browser consumer. |

[Payment assessment](PAYMENT_SAFETY.md) and [independent recovery review](SECURITY_RECOVERY_REVIEW.md)
retain exact source links and limits. No key theft, unauthorized payment or
production loss was demonstrated. Priorities identify engineering/acceptance gaps,
not observed incidents. No custody, unattended signing, publisher refund authority
or new fee recipient was introduced.

## Failed, blocked and unexecuted checks

Root's 70-test selection passed after serial execution. Broader root builds, typed
lint and full-web compiler did not qualify: recorded failures include exit 137
and a confirmed V8 heap exhaustion at 256 MiB. Exit137 alone does not establish
its cause. An initial incomplete cache was replaced with a verified matching
installation; all attempts and dependency provenance remain preserved.

The recovery test's first SIGKILL remains a failure. Unchanged source passed with
a lower heap without reducing production KDF cost. Hygiene's original seven lint
findings and initial heap exhaustion remain beside the corrected pass. No assertion,
threshold, timeout, security gate or skip was weakened.

New #346/#347 hosted checks were queued at the recorded refresh. Applicable hosted
and newly composed-source gates remain required. Native Firefox/WebKit, physical
mobile, external-wallet UI, actual recovered-key spend, live Tor/provider and
whole-candidate release qualification are not established by this cycle.

## Next actions under existing ownership

1. Resolve the held integration record through its protocol, preserve current
   main and the #328/#331 follow-ons, then qualify the actual composed source.
2. Integrate #347 into authoritative #339 after final-head CI; use combined
   #339/#341 evidence before composing with the separately owned privacy caller.
3. Keep #346 on #269's recovery stack. Join actual browser download, standalone
   decoding and controlled spend before a broader recovery claim.
4. Finish #336's fixture/inventory and separate focus/cancellation acceptance.
   Keep standalone v1.0 independent from unfinished v1.1 persistent retention.
5. Existing F04/F05/F10 owners should resolve evidence/journal, dependency-review
   and reservation/recovery contracts before mounting or activating modules.
6. Continue source/ownership-based semantic recovery; preserve the already
   rejected legacy policy donor that incorrectly blocks distinct payments.

Linked lane reports preserve exact owner branches/SHAs and original next commands.
These are handoffs, not promises of background execution or permission to bypass
held ownership or failed gates.

## Completed follow-on cycle

- [Privacy fixture draft #348](https://github.com/djshellshoxxx/GhostPay/pull/348)
  changes two lines on #336: matching wallet context for the existing locale
  fixture and the reviewed getRpc reference count. All 20 selected component
  cases and six inventory checks pass, with independent source review. The three
  acquisition calls remain unchanged. Anvil/Forge are unavailable locally;
  browser journeys, focus/cancellation fixes and broad qualification remain open.
  [Complete evidence](PRIVACY_FIXTURE_REPAIR.md).
- The first combined #339/#347/#341 package tree passes all 161 tests across
  seven files, original coverage, typecheck, lint and build, with independent
  coordinator review. Both reused #341 blobs are exact and all other package
  files retain #347. The [isolated qualification ref](https://github.com/djshellshoxxx/GhostPay/tree/0e19ccc7d52b0d160fb756089e6a843a1d2831d7)
  preserves this composition without a duplicate feature PR. [Report](HYGIENE_COMPOSITION_REVIEW.md).
- Existing #345's corrected optional PolicyPay source passes 50 tests across
  three complete files and independent source review. This is jsdom/MockWallet
  evidence, not native-browser acceptance. Narrow typed lint exhausted a 512 MiB
  heap; the single 768 MiB retry was killed before findings. Full qualification
  remains blocked; neither invocation is called a pass. [Evidence](POLICY_QUALIFICATION.md).

These workers completed their assigned scopes. No continuing background worker
or automated future cycle is implied by this report.

## Original execution history

EXECUTION_HISTORY.bundle preserves 15 local task heads and their original
execution/review commits. Its SHA-256 and prerequisite commits are recorded in
[the history index](EXECUTION_HISTORY.json). The bundle passed git bundle verify.
It predates this final index/publication commit to avoid self-reference. In a
clone containing the listed prerequisites, git bundle verify followed by git
bundle list-heads inspects it without changing a branch. This preserves original
authorship and provenance despite API-generated publication commit metadata.
