# Branch consolidation and source provenance

## Latest engineering follow-up — 2026-11-20 UTC

The [current handoff](../engineering-handoffs/continuous-20261119/README.md) and [follow-up qualification receipt](../engineering-handoffs/continuous-20261119/FOLLOWUP_QUALIFICATION.json) supersede earlier status below. Eight demonstrated runtime defects are repaired, including the independently verified pure merchant-ledger guard. Existing composite-action discovery is recovered without changing update cadence or action versions. Six fresh generations and explicitly reused independent follow-up reviewers contributed.

Published d74 CI failed only the invoice-replacement browser observation (both profiles) and signer fixture synchronization; those exact failures are retained and their focused repairs independently approved. Original local web coverage was3837passed/1failed/13skipped; hosted d74 web3849passed/1failed/1skipped. Follow-up focused tests, full web typecheck/lint and merchant original coverage pass; full original hosted qualification on the follow-up head remains required. Strict Mythril, required external review and owner-controlled origin/testnet/release acceptance remain unresolved. No deployment, release, main merge, fee activation, source-branch deletion or weakened gate is implied.

## Initial continuation checkpoint — 2026-11-19 (historical)

[Complete current mechanical census](../engineering-handoffs/continuous-20261119/archaeology/REPORT.md):299 branches,282 PRs, with full compressed changed/test-path inventory retained. Five missing runtime fixes (#280,#281,#282,#285,#289) were behaviorally reproduced and integrated; only the two missing lease-tool files were extracted from#261. Already represented, superseded, unsafe wholesale and future scopes are classified explicitly. This is not 299 fresh semantic audits; null classifications remain UNKNOWN. No source branches or PRs were deleted/closed. See the [current handoff and exact publication mapping](../engineering-handoffs/continuous-20261119/README.md).

## Historical consolidation checkpoint

Checkpoint: 2026-11-19. Integration branch: `release/ghostpay-beta-qualification-20261119`; implementation checkpoint `c5a2b09ea5dd7ee19400f29cbaddbe5cd93acc0a`; evidence checkpoint `4eb69699a59da84d17d0baa5dfe8dd6c9baaef9a`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. [Draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) is the review entry point. Local and connector-published commits have identical trees and ordered source parents but different metadata; use [PUBLICATION_MAP.json](PUBLICATION_MAP.json) for their exact mapping.

## Selection and preservation

The baseline is PR #270 `73545f63112910d46002718354ab5e99f8652e1f`, retaining the newer #262 implementation at `c7e09bc7...`, canonical-array/scanner repairs and the current merchant profile. Older broad consolidations are not checked out over stronger current authorization code. Existing branches and PRs remain intact; this lane has merged no PR into main, closed no source PR and deleted no historical branch.

[branch-disposition-ledger.json](branch-disposition-ledger.json) preserves the original 287-head inventory. The [timestamped census delta](../handoffs/branch-census-delta-20261119/DELTA.json) inventories **292 unique live branches** at its recorded observation: **284 unchanged, 3 advanced, 5 new, 0 missing**. The eight changed/new heads remain `needs_review` in that historical snapshot. Labels are reused only for unchanged exact heads. This is mechanical inventory plus specifically identified source reviews, not 292 fresh semantic or security audits. Later integrations below do not rewrite the earlier observation.

Original dispositions were 201 integrated (177 main, 24 candidate), 44 actionable, 19 superseded, 16 equivalent, 5 deferred and 2 incompatible. Their dates, sources and limitations remain in the ledger. New recovery branch publications can increase the live branch count after the census.

| Source | Current disposition and retained value |
| --- | --- |
| #238 / #240 | Recovery/privacy/Pages history retained through later source; distinguish downloaded bytes from verified backups |
| #262 / #270 | Selected application baseline. Latest #262 head `40b64e8f...` added main/docs/evidence without new product inputs at inspection |
| #264 | Valuable history preserved; relevant recovery/privacy behavior represented by newer source. No blanket checkout |
| #269 | Original ancestry and fresh authenticated, endpoint/address/method-bound payment export authority retained; private scan cancellation/checkpoint fixes included |
| #272 | Semantic integration preserves current network grants, destination reuse ledger, session checks and post-handoff journal while adding balance/quote lifecycle safeguards |
| #274 | Original ancestry retained; monotonic invoice expiry prevents rollback from extending the wait state |
| #256 | Session requirements represented by stronger later recovery-aware authority code; original branch retained |
| #271 | Six relevant adapter blobs already equivalent; current RPC privacy protections retained. Unique TRON tests remain deferred with its release scope |
| #255 | Eight exact analyzer/test files selectively recovered from `ea47fa75...`; current workflow changes only five lines. Strict issue/failure/completeness rejection remains. Deployment/policy/exception work is preserved separately |
| #275 | Original ancestry merged; real-Anvil leaf-binding negative fixture repaired without enabling policy accounts |
| #276 / #277 | Original ancestry retained; independent Pages verifier plus byte identity, UTF-8 and observed filesystem-change hardening |
| #279 | Original five-commit ancestry retained through `b5fc0991...`; malformed multipart Unicode rejects before lossy encoding. Fresh regression, package coverage and independent review recorded |
| Native fee review | Recovered exact 14-feature-file identities, then freshly tested. Integrated preparation/confirmation, manifest expiry, replacement and final-signing safeguards |
| Final lint repair | Six narrow fixes after the original complete lint found six errors. Five fixture changes and one dead initializer removal; assertions/rules unchanged; 367 tests/full type/full lint passed |

## Recovery and review

The prior executor lost its temporary filesystem. Published checkpoint `7b4c1554...` was restored exactly. The later native source was reconstructed against recorded Git blob hashes and freshly tested; missing historical raw logs are not presented as recovered. Original remote PR objects supplied the other recovered integrations. New source and evidence are published incrementally with exact tree comparisons.

- [Native recovery and fresh tests](../handoffs/native-sweep-fee-review-20261119/README.md).
- [Independent native authority review](../handoffs/recovered-native-authority-review-20261119/README.md).
- [Strict analyzer backport](../handoffs/recovered-mythril-evidence-20261119/README.md).
- [QR qualification](../handoffs/qr-surrogate-review-20261119/QUALIFICATION.md).
- [Lint repair qualification](../handoffs/final-web-lint-repair-20261119/QUALIFICATION.md).

The integration lease is **released**, at control commit `6408563f55081ee941c2036086c025ebf63d2c96`, generation 3, released 2026-11-19 11:41:48 UTC. Re-read it before promotion. Never merge the control branch into application source. Main was observed unprotected; that does not waive this task's required reviews or checks.
