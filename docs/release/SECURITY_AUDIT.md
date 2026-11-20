# Security audit and finding dispositions

## Latest engineering follow-up — 2026-11-20 UTC

The [current handoff](../engineering-handoffs/continuous-20261119/README.md) and [follow-up qualification receipt](../engineering-handoffs/continuous-20261119/FOLLOWUP_QUALIFICATION.json) supersede earlier status below. Eight demonstrated runtime defects are repaired, including the independently verified pure merchant-ledger guard. Existing composite-action discovery is recovered without changing update cadence or action versions. Six fresh generations and explicitly reused independent follow-up reviewers contributed.

Published d74 CI failed only the invoice-replacement browser observation (both profiles) and signer fixture synchronization; those exact failures are retained and their focused repairs independently approved. Original local web coverage was3837passed/1failed/13skipped; hosted d74 web3849passed/1failed/1skipped. Follow-up focused tests, full web typecheck/lint and merchant original coverage pass; full original hosted qualification on the follow-up head remains required. Strict Mythril, required external review and owner-controlled origin/testnet/release acceptance remain unresolved. No deployment, release, main merge, fee activation, source-branch deletion or weakened gate is implied.

## Initial continuation checkpoint — 2026-11-19 (historical)

The export-expiry race was reproduced with real key-export work, fixed at `84f39e41` and independently verified by generation 2. Final result acceptance now samples synchronous session authority. The manifest-generation fix also prevents a stale manifest from authorizing provisional replacement preflight. See [current handoff](../engineering-handoffs/continuous-20261119/README.md) for exact commits and independent evidence.

[Fresh Mythril assessment](../engineering-handoffs/continuous-20261119/generation-4-contract-review/ASSESSMENT.md):10 records,3 Medium/7 Low;241 source hashes verified against unchanged contracts. Seven model constructor tuples fail the real implementation code check; three expiry payloads reject;64 existing native disposition tests and 6 exact-current-artifact/residual probes pass. Strict Mythril still exits1. The older11-record result is historical, and the count reduction is not a repaired vulnerability. Configured hosted Echidna passed on c993.

A failing immutable fee-token view can prevent deployment at a prefunded counterfactual address; another factory cannot recover that original address. Intentional fee-waiver economics and timestamp/inclusion assumptions remain deployment/policy decisions. No fee behavior, contract, analyzer gate or exception mechanism was changed. Required external review and security/release acceptance remain open.

## Historical security evidence

Checkpoint: 2026-11-19. Integration branch: `release/ghostpay-beta-qualification-20261119`; implementation checkpoint `c5a2b09ea5dd7ee19400f29cbaddbe5cd93acc0a`; evidence checkpoint `4eb69699a59da84d17d0baa5dfe8dd6c9baaef9a`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. [Draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) is the review entry point. Local and connector-published commits have identical trees and ordered source parents but different metadata; use [PUBLICATION_MAP.json](PUBLICATION_MAP.json) for their exact mapping.

This is an AI-assisted engineering review with separately assigned source reviewers and regression reproduction. It is **not the independent external audit required by release policy**. No zero-vulnerability or complete anonymity claim is made.

## Reproduced and corrected

| Finding | Provisional severity | Correction and evidence |
| --- | --- | --- |
| Obsolete sweep review retained local signing authority | Low | Compose current review with session authority before derivation, async continuations, signing and handoff. Earlier 11 failing regressions/3 controls became 14 passing cases; current native suites retain the guards |
| Fresh native balance silently changed reviewed amount | Medium | Require exact reviewed-balance equality before fees/signing/journal. Earlier 4 failures/1 control reproduced it; current native confirmation also compares exact unsigned transaction assumptions |
| Stale quote/balance callbacks and errors | Medium | Preserve scope generations, exact endpoints, cancellation and guarded state updates; #272 semantically reconciled with newer privacy controls |
| Locked session escaped component error handling | Low | Session capture moved inside try/finally, with original authority checks retained. Actual suspended-entry failure reproduced and repaired |
| Invalid/decreasing network-authority clocks | Low | Validate all clock samples and permanently revoke invalid grants; original 9 failures/4 controls followed by 106 passing authority cases |
| Wall-clock rollback extended invoice wait | Low | #274 retains a monotonic elapsed-time floor; original suite and independent before/after probes recorded |
| Native fees/net were not separately reviewed | Authorization gap | Preparation is read-only; display exact transaction/fee assumptions; one-use confirmation repeats checks and refuses repricing. New native tests cover this contract rather than being counted as separate vulnerabilities |
| Expired native review continued manifest reads | Low | Guard every manifest request before/after await and preserve stale-review error precedence. Final restored source includes the independently reproduced correction |
| Analyzer clean-looking output hid incomplete execution | Medium, tooling | Reject duplicate JSON, missing telemetry, hidden exceptions, internal timeout and incomplete serialization. 9 failing regressions/2 controls; 54 fresh passing tooling tests after integration |
| Malformed UTF-16 changed multipart QR content | Low, data integrity | Reject lone surrogates before TextEncoder replacement; valid pairs unchanged. Exact upstream regression: 1 failure/4 controls, followed by 17 passing web QR cases |

The final lint repair changes no fee formula or authority branch. Native and ERC-20 branches both assign their fee reserve before use. Test assertions remain; the RPC fixture now validates its request body as a string before JSON parsing.

## Boundaries verified in source

Secret exports require fresh authentication and a new exact-endpoint/chain/address/method grant; an ended scan grant is not reused. Native preparation does not sign or create a broadcast attempt. Confirmation consumes the capability before awaiting, checks live session/context/replacement state, compares exact serialized unsigned bytes and reserves, and retains submitted/uncertain journal outcomes after handoff. Temporary derived-key buffers are disposed where possible.

The native fee-clock callback wraps later manifest/fee requests. SDK RPC initialization retains its own action/session/network guards and is checked before/after creation; it is not internally wrapped by that fee-clock callback. Do not claim every initialization packet has the latter guard. User-selected RPC endpoints are not silently replaced.

## Security checks and open gates

| Area | Current disposition |
| --- | --- |
| Slither | Fresh established Medium/High gate passed: 34 contracts, 64 detectors, zero reported results, exit 0. All 36 compiler inputs match exact source; existing low/informational exclusions and original flags retained. This is not zero findings at every severity |
| Foundry | Fresh 490 tests/34 suites passed with 10,000 fuzz runs and 256 invariant runs/depth 50 retained |
| Echidna | Configured campaign ended with strict runner exit 1. Router was killed with exit 137 at last observed 133,127/300,000 calls; Policy was killed with exit 137 at 245,970/300,000. Sweep completed 300,048 calls: all four safety properties passed and both required canaries falsified. Missing Router/Policy totals make the whole campaign failed. SIGKILL cause is undetermined; memory pressure is an inference. The official pinned binary rejects the attempted heap cap, and its documented CLI/configuration exposes no supported cap. A complete unchanged rerun requires a suitable execution environment |
| Mythril | Eleven historical records remain an unresolved strict gate: 3 Medium, 8 Low. They are not eleven proven exploits. Runner/evidence fixes do not clear them. No native complete candidate pass or approved finding exception is claimed |
| CodeQL | Main's three analysis jobs completed, but current candidate results and finding-level clearance of two historical High reports remain unestablished |
| Sonar | Last current API attempt was denied with HTTP 403; current ratings/alert counts are unknown. Older ratings cannot establish today's state |
| Dependencies | Fresh production audit: zero findings. Full graph: 17 Low entries, zero Moderate/High/Critical. Entries are not 17 independent product exploits. No dependency constraints were relaxed |
| Browser security | Chromium fails before assertions with socket permission denial; managed download returned an invalid archive. XSS/storage/cross-tab/clipboard/camera/mobile/keyboard acceptance remains unqualified |
| GP-PAGES-01 | Shared github.io origin is not isolation. Dedicated origin/account and owner approval remain mandatory |
| External review | Outstanding; agent reviews do not satisfy it |

Scoped reviewers found no remaining introduced Critical or High defect in their reviewed changes. Repository-wide counts remain unknown while hosted findings and external review are incomplete. Preserve every unresolved analyzer record and all failed/incomplete executions; no assertion, threshold, detector policy or finding was suppressed.

See [native review](../handoffs/recovered-native-authority-review-20261119/README.md), [analyzer backport](../handoffs/recovered-mythril-evidence-20261119/README.md), [fresh analyzer evidence](../handoffs/recovered-contract-analyzers-20261119/README.md), and [test record](TEST_RESULTS.md).
