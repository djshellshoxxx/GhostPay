# Completion source review — generation 8

## Decision and exact scope

No new blocking source issue was found in the 16 non-documentation changes at `2149ad2814d9ae031b23322f87f74842af5dde78`, compared with canonical `417f7c71daf8645e1432f2ec8f070110879b80bd`. This is an independent source review and preservation check. It is not a full test pass, whole-product security certification, release approval or permission to bypass pending gates.

Reviewer: `/root/completion_review_gen8`. Branch: `review/ghostpay-completion-gen8-20261120`. This worker changed only its ownership claim and this review directory. Integration QA retained the exclusive test/build execution window.

The [source verification receipt](source-verification.json) independently records each selected source blob, SHA-256, source ancestry and unchanged control object. It uses the coordinator's corrected manifest at `be12cd043dbfc2f562368fd0ccc1a2a8c3f7a22f`; all product/test files there remain identical to the reviewed freeze.

## Standards

The changes follow `AGENTS.md` and `docs/ai/WORKFLOW.md`: production edits are narrow, regression expectations are added, existing consumer assertions are retained, and the active privacy branches are outside the changed-path set. The validation edits reuse existing typed errors and avoid adding dependencies, settings, storage formats, network operations or translation keys. The Pages edit adds a gate without removing earlier checks. No documented-standard violation or useful style-only refactor was identified.

The receipt guard causes malformed responses to remain verification-incomplete. The associated fixtures now supply the modeled hash instead of weakening the new guard. The seven policy consumer files are byte-identical to their pre-repair versions.

One documentation drift item existed at the reviewed freeze: the coordinator README and manifest still named `53f4253b` and 15 inputs after adding the policy helper. The coordinator corrected that at `be12cd04`. This reviewer independently checked the corrected manifest; no edit to the coordinator's owned documents was made here.

## Spec and correctness

Acceptance sources are the source-pinned completion reports and ownership scopes for cumulative #295/#290, #294, #298, #292, the receipt-status and transaction-field repairs, and generation 7's policy fixture repair. Review included the resulting implementations and adjacent callers, not only earlier review conclusions.

| Area | Independent source conclusion |
| --- | --- |
| Receipt correlation and status | `wallet.ts` checks a primitive, shaped receipt hash and compares it with the submitted hash before accepting state. The existing canonical-quantity parser remains, followed by explicit zero/one status validation. Valid failure/success, null pending receipts, and existing nullable-destination compatibility remain. Other status quantities cannot become a claimed revert. |
| Transaction fields | `parseSeenTx` captures hash and `input ?? data`, requires primitive strings, then normalizes the captured values. Valid case normalization, nullish fallback and empty data are retained. Other sender/destination/value/chain checks remain. This does not promise general accessor/prototype isolation or authentication of an untrustworthy RPC. |
| Post-broadcast outcome | The unchanged `submitTx` retains the wallet hash before verification and wraps later failures in `PostBroadcastError`. New consumer regressions require the submitted journal entry and refusal of a second send. No runtime journal or payment-authority behavior was replaced. |
| QR classification | Primitive-string checks precede own-property checks and indexed access. Existing mappings and secret/bearer precedence are unchanged. The added controls enumerate all declared mappings and eight flag combinations, plus malformed runtime keys. |
| QR idle expiry | `Assembler.add` now refreshes the timer after rejecting an already-held conflicting fragment. Accepted duplicate refresh, exact-deadline acceptance, session mismatch rejection, integrity reset, and completed-transfer behavior remain. |
| Pages artifact promotion | The builder invokes the existing verifier with the staged site, checksum manifest and exact source commit before either final `mv`. `set -euo pipefail` prevents promotion on verifier failure. Regression source executes the real promotion block and asserts no published site/evidence for each rejected fixture. This is integrity/source binding, not external manifest authentication or an atomic filesystem guarantee. |
| Security fixture clarity and custody tests | The two string-construction edits preserve their known malformed fixture bytes and original rejection expectations; no validation suppression is added. The new Sweep boundary test file changes no production custody code. Successful fresh CodeQL analysis and execution remain separate requirements. |
| Policy fixture | `walletMirror` now returns the same primitive hash already returned by its transaction lookup and `MockWallet.eth_sendTransaction`: `0x` followed by 64 `9` characters. This is the only non-documentation change after the prior `53f4253b` freeze. Existing assertions, timeouts and outcomes are preserved. |

## Independent verification performed

The lightweight Git/source checks passed:

- **16/16 input blobs** match the original source commits, frozen candidate, corrected-manifest commit and review checkout.
- All **six selected source commits** are ancestors of the candidate.
- The exact non-documentation delta against canonical contains those 16 paths and no others.
- All **16 protected scopes** match canonical, including workflows, package/lockfile controls, deployment manifests, existing browser/signer repairs, payment/journal/error boundaries and the four contract package trees.
- All **seven policy consumer files** and the shared `MockWallet` remain byte-identical to the prior freeze.
- The coordinator's manifest update introduces no new product/test delta.

No application tests, lint, typecheck, build, browser actions or hosted checks were run by this reviewer. No external service, wallet, network target or release was exercised. Earlier executed results belong to their original workers and exact source pins.

## Qualification limits and successor

The unchanged broad web coverage run at the prior freeze stopped at its 900-second external cap with exit 124, 1,467 observed passing lines and 19 fixture failures. It has no complete suite or aggregate coverage result. Generation 7's 87/87 focused consumer pass clears the repaired fixture scope; it does not convert that interrupted run into a full pass. This review does not combine partial Pay UI executions or transfer any candidate result to the separate quick-hide feature.

Root and integration QA own final lint, development Pages artifact verification and exact-head hosted qualification. Quick-hide remains separately dependent on the actively owned privacy work and needs its own source-specific validation. A fresh successor should read the final published tree mapping and pending results, review any actual new product delta, and repair concrete failures without weakening the original gates. See [HANDOFF.md](HANDOFF.md).

Standards findings: **0 unresolved**. Spec/correctness findings: **0 new blocking source issues**. Full execution and release qualification remain open outside this source-only review.
