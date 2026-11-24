# Required privacy implementation checkpoint

**Eight required features are implemented with focused acceptance evidence. Local metadata retention is partially implemented. Neither v1.0 nor v1.1 is release-qualified.**

Scope is exactly [issue #286](https://github.com/djshellshoxxx/GhostPay/issues/286) and [issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287). Future privacy issues #283, #284 and #288 were not implemented in this work.

## Current source and provenance

| Item | Immutable source |
| --- | --- |
| Published restoration baseline | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| Nine specifications committed before this implementation cycle | `bbcf71b79d4efd00892948faa833cb7d8f471406` |
| Standalone v1.0 application/fixture freeze | `bb9a97a1a85558ba8d1dbd0191d851d97d439fad` |
| Standalone v1.0 tree | `cec9007ddd32f6269c158b3f49e6a9a32b873d61` |
| Combined v1.0 + v1.1 application/fixture freeze | `17c14695548c1e5d8f661ca551cf9c9ecc538d14` |
| Combined application tree | `5ab360e2a972a0c3169e346fe60e44a66476769c` |
| Generation 4 execution evidence checkpoint | `474d6e06ec2497b90071785039809e6925cfdd95` |

The working review branches are `work/ghostpay-required-v1-candidate-20261120` and `work/ghostpay-required-v11-candidate-20261120`. Later documentation-only commits do not change these application contents. The cumulative candidate preserves the standalone v1 parent by ancestry. The standalone v1 runtime does not import the new v1.1 module families.

For those canonical predecessor branches, production code remains identical to the earlier standalone-v1 runtime freeze `573901ee1c66624e57143526571a3fd76f52f264` and combined runtime freeze `85dd647cfd439a18e4885ab5ff9a9bf3a3bbad5c`, respectively. Their only later application-path changes are the three baseline-proven clipboard caller test fixtures described below. Each execution result retains the actual commit on which it ran.

The separate branch `feature/ghostpay-retention-completion-20261120` starts at canonical v1.1 head `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9` and adds the bounded proof-preview adapter at runtime `e075ab049210e7d6788dd4e7f71d196d2bffef8a`. Its [source-pinned handoff](evidence/retention-proof-preview-20261120.md) records later fixture/prerequisite repairs, focused execution, original gate attempts and independent review. The earlier canonical freeze/gate history is retained as history, not substituted for this follow-up's results.

The initial unpublished pre-restoration work was lost during workspace cleanup after disk exhaustion. Its historical 482-test result does not qualify this source. This checkpoint is based on the restored published baseline and retained current-cycle commits/logs.

## Current global masking qualification

PR #569 extends the #373 candidate to remove hidden document values, revoke local-wallet
reveals and bind completed receipt presentation to its originating account in privacy mode.
The historical results below apply to their recorded revisions. Track the integrated
full/lean browser and unit results in [PR #569](https://github.com/djshellshoxxx/GhostPay/pull/569).

## Feature status

| Release / specification | Implemented behavior and latest follow-through | Status and evidence |
| --- | --- | --- |
| v1.0 [Masking](v1-01-masking.md) | Existing hidden/inert/accessibility boundaries, temporary reveal and one-way quick hide retained. Storage-event and stale-settings-edit fallbacks now preserve current masking when stored privacy preferences are missing, corrupt or inaccessible. Presentation-only settings edits preserve prepared payment authority; real execution changes still revoke it. | Implemented. Fresh second and third generations. [Generation 2](evidence/masking-gen2.md): 66/66 in eight files. [Generation 3](evidence/masking-gen3.md): six behavioral RED cases, then 40/40 in four files. |
| v1.0 [Clipboard](v1-02-clipboard.md) | Optional digest-owned cleanup retained. Queued copies now check current intent, view/reveal lifetime and mount state immediately before native dispatch, including after waiting for an earlier clear. Hide/unmount cannot authorize an undispatched stale copy. Later verification repaired inherited caller fixtures without changing production behavior. | Implemented. [Generation 2](evidence/clipboard-gen2.md): three behavioral RED cases, then 77/77 in seven files. [Generation 3](evidence/clipboard-gen3.md): 95/95 in nine files. [Generation 4](evidence/clipboard-gen4.md): 137/137 in 13 files. Native clipboard/permission/OS-history limits remain. |
| v1.0 [Wallet and lock](v1-03-wallet-lock.md) | Revocable wallet authority covers Pay, Registry and Policy; competing connects, account/chain/disconnect events, lock, session replacement and unmount invalidate stale continuations. Policy reads recheck scope. Pay captures wallet scope before RPC acquisition and binds read authority to both wallet and network cancellation. | Implemented. [Generation 2](evidence/wallet-gen2.md) and [generation 3](evidence/wallet-gen3.md). Generation 3: six behavioral RED cases; 17 lifecycle and 271 related original cases passed in separate selections. Known hashes and uncertain attempts remain recorded. |
| v1.0 [Private history](v1-04-history.md) | Independent unlocked temporary history reveal retained. Four missing current-wallet props were repaired across Pay, Registry and Policy, restoring account/chain filtering and explicitly confirmed clearing without erasing unresolved journals. | Implemented. [Generation 2](evidence/history-gen2.md): actual caller failures reproduced; 84/84 in five complete files. |
| v1.0 [Safe outputs](v1-05-outputs.md) | Policy and encrypted tag exports use neutral filenames. Selected-address text was removed from malformed-policy and contract-code-refusal errors while preserving the actual refusal, key wipe and export contents. Current titles, errors and download callers were inventoried. | Implemented. [Generation 2](evidence/outputs-gen2.md): two behavioral RED cases, then 107/107 in eight complete files. |
| v1.1 [Local address reuse](v11-01-address-reuse.md) | Bounded 256-entry local Pay observations, current-wallet lifecycle, warning UI and retry/same-invoice/intended-repeat distinctions. Only known returned payment hashes or payment-stage post-broadcast errors create observations; approvals, preparation and unknown outcomes do not. | Implemented within the browser EVM scope. [Generation 2](evidence/address-gen2.md): 39 cases in four files; the unchanged classifier has separate predecessor evidence. Observations concern intended destinations, not independently verified transfers. |
| v1.1 [Invoice minimization](v11-02-invoice-minimization.md) | Shared unsigned-data transformation in CreateInvoice and MerchantTemplateIssuer omits optional memo and uses neutral `Item` descriptions where the schema requires text. Required financial, signing and verification fields stay intact. Mode/input changes invalidate stale displayed links, QR/copy actions and pending generation. | Implemented in both browser issuers. [Generation 1](evidence/invoice-gen1.md) and [generation 2](evidence/invoice-gen2.md); merchant follow-through 47/47 in six files. Existing signed invoices and shared links remain unchanged. |
| v1.1 [Wallet disclosure](v11-03-wallet-disclosure.md) | Bounded immutable previews and explicit per-request decisions for account access, chain switching, typed-data signing and transaction sending, through all three production callers. Accessible modal, focus/background handling, cancellation, expiry and privacy revocation are wired. Wallet chain and signed domain chain are presented separately. | Implemented for the four supported methods. [Generation 2](evidence/disclosure-gen2.md): 249/249 in 18 complete files. Actual UI fixtures explicitly approve the particular request; no blanket auto-approval helper. Built-browser/real-extension acceptance remains open. |
| v1.1 [Retention](v11-04-retention.md) | Bounded callback registry, default-off preferences, 5/15/60-minute active-app policies, preview/confirm/cancel controls and single-use revision-bound plans. Completed screen-result adapters cover both invoice issuers. A separate proof preference closes only the deliberately shown included-payment QR/text while preserving live receipt exports and original payment records. Listener/disposal/capacity and confirmation races were repaired. | **Partial.** [Generation 2](evidence/retention-gen2.md): five RED cases, then 21/21 in four files. [Generation 3](evidence/retention-gen3.md): three RED cases, then 29/29 in six files. [Proof-preview follow-up](evidence/retention-proof-preview-20261120.md): controlled RED, then 139/139 in nine complete files; a later overlapping 86-case proof/Pay fixture rerun also passed. Browser assertions were authored/collected, not executed. Persistent transaction/invoice and terminal-record cleanup remain unimplemented. |

These counts overlap across files, features and generations. They must not be added into a unique overall test total. A third implementation generation is not specification milestone M3: M3 still requires complete original qualification.

## Combined verification and independent review

Generation 3 reconciled the released feature work, repaired partial/reentrant provider subscription handling and a retention-confirmation timing race, and preserved explicit consent across actual callers. Its two complete-file selections passed 138 and 68 cases; those are separate overlapping selections, not 206 unique cases. Details are in [integration generation 3](evidence/integration-gen3.md).

Generation 4 merged the final standalone-v1 wallet repair into the v1.1 candidate, preserved the required disclosure decisions and retained the existing browser reconnect fixture. On exact source `85dd647c`, **301/301 tests passed in 14 complete files, zero skips, exit 0**. This was a bounded selection with coverage disabled, not the complete coverage command. The same source passed committed-secret and full feature-range whitespace checks. See [integration generation 4](evidence/integration-gen4.md).

The [independent source-review record](evidence/independent-gen4.md) distinguishes static findings, separately executed regressions and later repairs. A fresh final scope reviewer and a separate v1.1 subreviewer agreed that the supportable claim is eight implemented features with focused acceptance plus partial retention. They found no additional material scope/specification mismatch in the bounded review. Agent review does not replace the required external review or original release gates.

### Original canonical qualification history and current gates

On the canonical predecessor freezes, complete original typecheck, typed lint, coverage/nocov, build/CSP/bundle, built-browser and hosted gates remain open. The coordinator records original-command attempts and exact exits in [coordinator qualification](evidence/coordinator-qualification/README.md). Resource-killed processes and incomplete test selections are never marked passing. Coverage processing and worker counts may be reduced to fit available resources; assertions, include/exclude sets and 90/85/90/90 thresholds remain unchanged.

For the separate proof-preview follow-up, the original full web typecheck and typed lint both passed at `b9fd13815d6b3ece0f081dd14c5f3009ca13e12e`, after independently reviewed prerequisite repairs. Its 78-case affected-file selection also passed and overlaps four cases in the earlier 139-case feature/shared selection. Those source-pinned results do not convert the following historical failures into passes or close the follow-up's complete coverage/nocov, build/CSP/bundle, built-browser, hosted or release gates.

The original standalone-v1 `.nocov` pass completed all four files/four cases at `573901ee` with exit 0. Full coverage attempts were killed; a native shard demonstrated feasibility, while the first larger batch completed 512 cases and failed one inherited clipboard fixture. The sequence stopped there; the remaining batches and final merge were not run. Fresh clipboard generations reproduced the original fixture failures on the published baseline, repaired readable clipboard modeling and asynchronous assertions, and passed the focused selections above. This does not convert the interrupted/failed original coverage run into a pass.

On final combined application/fixture source `17c14695`, the original Playwright web-server build was killed with exit 137 before the selected masking/history, clipboard and disclosure browser tests could run. Playwright returned 1 after 3.64 seconds. No browser-acceptance or final build/CSP/bundle pass is claimed.

Earlier bounded diagnostics found unsupported Testing Library role-query options and four scoped lint diagnostics. Those were repaired without weakening assertions or rules; a predecessor 41-file typed-lint selection passed. That earlier success is not a final full-candidate type/lint pass. Browser fixtures are authored but have no successful built-browser acceptance on these application freezes.

Existing unrelated security, release, deployment and owner-controlled conditions in [RELEASE_BLOCKERS](../release/RELEASE_BLOCKERS.md) remain in force. This checkpoint does not waive them or establish a release-ready artifact.

## Retention: remaining required work

Issue #287 item 4 is still incomplete. The [eligibility census](evidence/retention-gen2-census.md) shows that current persistent collections combine user records with recovery authority, duplicate prevention, trust decisions, reorg/tombstone evidence or a potentially sole stored copy. The implemented registry intentionally receives disposal callbacks rather than vault/database/journal deletion handles.

A further persistent adapter needs a real eligible field and a positive proof that deleting it cannot remove those protected responsibilities. Its preview and confirmation must bind to the exact current record revision inside the appropriate storage transaction. Age, a status label, a returned hash or a receipt signature alone is not an eligibility proof. No sensitive collection should be created merely to demonstrate cleanup. Merchant screen-result cleanup and the independently retained payment-proof QR/text projection are now implemented; neither establishes persistent retention completion. Proof cleanup receives only a presentation-state callback, rechecks current identity/category and eligibility, and preserves payment authority, copy/download and all journals.

## Boundaries that remain explicit

- Masking conceals visible and accessible presentation while retaining mounted DOM, drafts and recovery data. It does not erase memory or prevent same-origin script access.
- Clipboard cleanup is best effort. Native writes already dispatched, external races, denied permissions and operating-system clipboard history are outside its guarantee.
- Wallet providers without event hooks rely on the existing account/chain rechecks. Controlled RPC and jsdom evidence does not establish real-extension or HTTP-wire behavior.
- Local reuse history observes a known-hash payment's intended destination. It proves neither actual settlement nor global address freshness; the pre-existing Sweep ledger is not newly bounded by this feature.
- Disclosure previews cover supported request structures; they do not decode all arbitrary calldata effects or every typed-data schema.
- Invoice minimization is implemented in the browser issuers. CLI, SDK and billing behavior is not claimed by these browser checks.
- Export payloads, intentional invoice fragments/QR content and necessary transaction references retain their functions. Neutral surrounding filenames and error text do not mean every output is devoid of application data.
- Catalog entries and critical-key classification are present in en/es/ja/ar. New Spanish, Japanese and Arabic entries are English draft fallbacks, not reviewed translations.

## Modularity, reuse and scope control

The features separate policy helpers from UI/effects and reuse existing custody, session, signing, network authorization and privacy primitives. The diff outside documentation/tasks stays within `apps/web`. No package/lockfile, contract, protocol, fee, workflow or hosted-service change was introduced.

[GitHub reuse research](REUSE.md) assessed pinned, licensed source from viem, KeeWeb, idb-keyval and Cloudflare Kumo, plus the relevant wallet/clipboard standards and invoice format constraints. Existing pinned viem utilities and repository modules were reused. External implementations with incompatible platform, plaintext-lifetime, dependency or deletion semantics were not copied. **No external repository code was copied and no new dependency was added.**

## Handoffs and publication

Each feature has a source-pinned handoff and a fresh successor review. Masking, wallet lifetime and retention continued through third implementation generations; clipboard verification and combined composition reached generation 4. Internal worker assignments were delivered directly to the assigned agents. Earlier feature handoff next steps that are now integrated are superseded by this checkpoint and generation 4 evidence.

The remaining sequence is complete original qualification, positively justified persistent retention, reviewed non-English copy and actual browser/wallet acceptance, followed by the repository's existing release gates. The preceding canonical review branches and their evidence are preserved in the accompanying verified git bundle; the separate proof-preview follow-up has its own source-pinned handoff. Main and the other coordinator's shared integration lock remain unchanged.

Automatic approval review rejected the earlier attempted GitHub specification-branch push because authorization to export the internal specifications/task/ownership details and repository trust were not established. No alternative publishing route was used. Publishing the concrete v1.0/v1.1 review branches and opening draft PRs requires the user's final approval; it does not authorize merging main, deployment or release.
