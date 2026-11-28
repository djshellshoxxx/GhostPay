# Unique-code main consolidation — 2026-11-19 (Pacific)

## Scope and actual outcome

The owner requested consolidation of branches containing unique code into main. Initial inspected main was `c977b5d6723f6822c3b5d86cd6b231712c53c395`. PR #267 was independently source-reviewed, confirmed green at all 30 check runs, and merged normally as `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Its three hosting source/test changes preserve fractional, epoch and pre-epoch file timestamps and HTTP validator parity.

This candidate combines five independently reviewed, disjoint fixes. Their original commits remain parents; their production/test/handoff blobs are copied exactly. The sole overlapping path is `docs/ai/ACTIVE_WORK.md`; all five dated prefixes, the entire current-main document and this coordinator claim are retained. No source conflict was resolved by choosing one side over another.

| Donor | Unique behavior | Reviewed head |
|---|---|---|
| #279 | Reject lossy malformed Unicode in multipart QR payloads | b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0 |
| #280 | Unknown runtime build profiles narrow to lean | 25c380f253e3338c0e6b79e8d052cdf8950f9e88 |
| #281 | Warn when displayed 30-day scan history is incomplete | 0041514a630398c89693498d9b5e44ef562d9c61 |
| #282 | Reject ambiguous duplicate-member saved signer pins | 9fbf3312cb8e65083f604cc0bf0512d59c83f141 |
| #285 | Reject unknown/inherited QR payload and frame kinds | 89942105c48df03b9351f777278b6a992e35a95e |

Each donor has 36 successful checks and three intentional deployment-only skips at its reviewed head, including original full/lean browser suites, web tests, typecheck/lint, Pages artifact browser execution and CodeQL. Independent source reviewers were `prior_consolidation` (#279–#282) and `release_review` (#267/#285). The combined candidate needs its own hosted result; prior donor passes are not a claim that this combined head already passed. Machine-readable source and check URLs are in `PROVENANCE.json`.

## Evidence qualification

No local test run is claimed: the local executor became unavailable before checkout. Existing hosted results were inspected directly. In #282, the old standalone probe overstates three accepted baseline records: duplicate-signer examples exceed the reader's existing length cap; the shorter duplicate-version case establishes the missing strict parser behavior. This does not invalidate the source correction or current regression suite.

## Preserved work and pending gates

The initial 318-branch census includes extensive overlapping historical integrations. Existing #278 archaeology describes 299 historical refs, including 177 main ancestors, 32 candidate ancestors, 89 related nonancestors and the deployment branch. That old classification is evidence at its recorded refs, not an exhaustive semantic verdict on all current branches.

Broad PR #278 at `417f7c71daf8645e1432f2ec8f070110879b80bd` has green general CI, Pages and browser qualification, but CodeQL check 136021124871 reports two High alerts and strict Mythril job 136002883945 completed with failure. It also changes inactive relayer, non-EVM/future packages and a confidential contract. It is preserved, not merged as a shortcut. Source consolidation does not resolve beta privacy issue #286 or deployment/signing/testnet acceptance gates.

Next isolated recovery candidates include merchant clock validation (#268), monotonic jitter expiry (#274), base64url runtime validation (#289 with the already-reviewed unused-parameter test correction), primitive QR key validation (#290), QR assembler conflict expiry (#294), receipt binding (#298 with the #302 policy fixture correction), and amount input validation (#301/#303 duplicate code). Their original branches remain intact. #293 clipboard and #300 quick-hide require integration/qualification; #305 Boolean-result validation still has pending checks. No failures are waived.

Payments, dependencies, workflows, security thresholds and deployment configuration remain as on main. No deploy, tag, release, branch deletion or force update is part of this consolidation.
