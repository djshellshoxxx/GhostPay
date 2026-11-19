# Independent Bitcoin spentness review

Review date: 19 November 2026 UTC (18 November Pacific). Reviewer: `btc_review`, a
separate assistant worker from the implementation owners. This is an AI-assisted
engineering source review, not an external professional audit.

## Disposition and source pins

**No unresolved feature-specific source blocker was identified in the reviewed
paths after the corrections below.** The independent selections executed here
passed 119 tests across 12 files, with no skipped tests within those selections.
Combined-head qualification, coverage gates and hosted Chromium acceptance remain
the coordinator's separate checks; this review does not claim those checks passed.

The latest additional source review applies to local `1977a50010e2d72476e0de67168b4f46715aab9c`,
published equivalent `981cc2f4395d2d76c499a5cd46387daaaa3a6b1f`, tree
`af61e24cb588fbf082915deac110c10cca008e70`. The reviewer independently confirmed the provider-label
finding and its minimal correction, with no blocker. The 45-test passing-after execution belongs to the
coordinator and is not added to the 119 independently executed tests above.

The latest accepted-main compatibility review also found no blocker: main `e454de6a` to
`a36f48da526b818a5940a7a0ed2ae7303ef17056` changes only `docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md`
and `docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md` (231 insertions). The complete apps/packages trees are
unchanged. Advertised merge `d46949b99709b5dae2b4edc3d8c4bb2d2ed50cac`, tree
`82d54202a4d1b71c88fc05d04ebb40ad720c26f3`, has parents `a36f48da` and `981cc2f4` and preserves all
38 reviewed feature-file hashes. No tests were executed as part of this read-only compatibility check.

Initial completed implementation and authored browser-test head reviewed:
`985d5284397894841eacd2b944e212f1339bbc87`. The runtime UI changes end at
`91d3a51707b9c515990c31a89505c3bf9a443aa6`; the following commit adds browser tests.
The packet-only commit `69be50ee78ccb813ab326d83dfa8c1c1280bb764` does not change
those implementations.

The initial baseline was `878f3be7` on
`chatgpt/btc-spent-private-scan-20261118`, whose runtime is merge
`e27ce7f60fb0e21788f09df0f188b3b3490bcad2` of main
`dfc75ef2087fa6463ae59e0818abec01796c578d` and unchanged PR #219
`9617e8572f9bc414410bd937b0e7718d0c5bd55c`.

Scope: Bitcoin block-input spentness, optional provider disclosure, worker request
and result boundaries, encrypted Bitcoin scan metadata, historical recovery,
reorganizations, stale asynchronous work and the corresponding disclosures. This
does not review contracts, other chains, transaction construction, general seller
checkpoints, recovery guarantees or overall GhostPay release readiness.

## Findings and resolution

The findings were sent to the relevant owners before their fixes. Source pins
identify the committed correction, while the following sections distinguish
independently executed tests from source inspection and owner-run evidence.

| ID | Finding and concrete mechanism | Final resolution and source |
| --- | --- | --- |
| BTC-R01 | `scanForPayments` labelled results `local` merely because `getSpends` existed, including partial ranges and restored matches with unscanned historical gaps. The UI checked discovery height without requiring sufficient spentness evidence. | Resolved. Optional `ScanState.spendsFromHeight` records continuous input coverage; missing history or a range below the latest known tip remains unknown. Unknown discoveries cannot be selected. Package state `1f254527`, web scanner `1f115e97`, UI `91d3a517`. |
| BTC-R02 | Esplora parsing trusted the uncommitted JSON `is_coinbase` annotation. Marking a normal spending transaction as coinbase leaves its txid/witness commitment unchanged while suppressing its spends. | Resolved. Coinbase identity and consumed outpoints derive from the reserialized transaction, with contradictory annotations rejected. `apps/web/src/features/btc/esplora.ts` at `531b62a1`; the retained regression for a forged flag is in `esplora.test.ts`. |
| BTC-R03 | The main-thread source bridge accepted outspend requests without the scan owner's consent, and the client accepted a provider-labelled result without authorization. Matched transaction hex/proof requests also reveal interest and need a light-mode consent boundary. | Resolved. Bridge policy defaults to deny, checks outspend and matched-proof authorization independently, and closes on cancellation. Light scans fail before traffic without explicit consent. Returned evidence is bound to the active request and checked headers. Worker files at `97df65f2`; explicit, revocable UI controls at `91d3a517`. |
| BTC-R04 | Reorganization invalidation retained the old local verdict and orphan-sensitive spent count for surviving earlier discoveries. A checked-chain extension could also leave old local selections available. | Resolved. Affected results become unknown, orphan-sensitive counts clear, and local selection requires complete current header coverage. `headers.ts` at `50a259f0`, strengthened by `451772f9`; UI at `91d3a517`. |
| BTC-R05 | A second spend report for an outpoint within one scan overwrote its first canonical spend. Reorganizing only the later report removed valid earlier evidence and could revive the output. | Resolved. The scanner deduplicates spend callbacks for watched/matched outpoints, state retains the first observed spend, and confirmed outpoint replay at a later height is rejected. `packages/btc-silent-payments/src/scan/{scanner,state}.ts` at `1f254527`. |
| BTC-R06 | Recovery of an old matched block can reveal another output absent from saved matches. Its intervening spend was never watched, so a global input-coverage marker alone cannot make the newly discovered historical output locally unspent. | Resolved. Historical evidence requires a saved confirmed outpoint with matching creation height/hash; otherwise the returned status is unknown. `apps/web/src/features/btc/scan.ts` at `1f115e97`. |
| BTC-R07 | Forgetting headers and reloading only a prefix could leave an old local result with an unchecked spending suffix, even when the payment itself was below the new checked tip. | Resolved. Local evidence is downgraded when the scan endpoint differs from the checked tip, including a shorter header chain. Discoveries remain visible without being falsely labelled orphaned. `headers.ts` at `451772f9`, UI exact-tip checks at `91d3a517`. |
| BTC-R08 | The client rejected a provider label without consent but accepted local/unknown labels with consent. A malformed completion after an authorized outspend query could make the UI falsely deny that disclosure. | Resolved at `1977a500` / published `981cc2f4`. A symmetric status/consent predicate rejects both directions of mismatch. Two regressions prove the authorized request happened before the forged completion, then require rejection, tweak wiping and worker teardown. No unauthorized query or Esplora-only worker forgery is inferred. |

### Additional cases closed during implementation review

- **Saved coverage needs a tip hash in returned evidence.** The state owner found
  that a resume already at the tip could return only historical discovery blocks,
  leaving no hash anchor for the previously scanned suffix. A same-height fork
  could then evade later result invalidation. `scan.ts` now retains the checked
  endpoint hash for local results, sorted and without an extra network request.
  The regression and fix are in `1f115e97` and were included in the independent
  web-core selection.
- **Spent siblings must be loaded before historical recovery.** Independent
  review caught a temporary optimization that loaded saved spends only for
  already-seen outputs. At resume-at-tip, that set was empty before recovery and
  no later state callback ran. Rereading the block for unspent A also rediscovered
  spent B, falsely returning B. The owner retained a regression that failed with
  two outputs instead of A alone, restored the bounded initial spent set, and
  committed the corrected implementation in `1f115e97`.
- **Aborted requests and invalid indices must not disclose outpoints.** Root's
  `531b62a1` adds a pre-dispatch abort check and uint32 output-index validation.
  These changes and their regressions were source-reviewed; their Esplora test
  executions belong to the coordinator's evidence, not the independent test
  count below.
- **Late header work must not mutate a new session.** The UI owner added operation
  ownership checks after header loading and synchronization and before saving.
  The final header-ownership regression was independently rerun at `91d3a517`.

### Independently executed baseline reproduction

A direct Node ESM reproduction called `recordScannedBlock` for discovery at height
100, a spend at 102, and a second report for the same outpoint at 103, then
`reconcileScanState` with only block 103 replaced. The observed recorded spend moved
from 102 to 103 and became absent after reconciliation (`resumeHeight: 103`), while
block 102 remained canonical. This demonstrated BTC-R05 against the baseline built
package. The retained owner regression and final independent package rerun are
the reproducible suite evidence for the correction.

## Independent verification actually executed

Environment for these selections: Node `v24.22.3`, npm `11.9.0`, Vitest `5.0.5`.
Every command used `--maxWorkers=1`. This is a targeted source-review selection,
not a whole-web, coverage, build, browser or final combined-head qualification.
Selected files were stable at the source pins below while other owners completed
adjacent work in the shared task branch.

| Selection | Reviewed source anchor | Result | Raw log in task scratch |
| --- | --- | --- | --- |
| Worker transport, scan client and oracle boundaries | `97df65f27ec118485dc8b32560a21854636f9920` | 46 passed; 4 files; 71.67 s | `independent-worker-review.log` |
| Package scan state and scanner | `1f254527e374338f1f1a949cc4b52213c2076c0c` | 39 passed; 2 files; 23.33 s | `independent-state-review.log` |
| Web spentness, resume, encrypted store and secret handling | `1f115e972d7c67e02953a0e4db62ef80434f72f5` | 29 passed; 4 files; 45.35 s | `independent-scan-review.log` |
| Final UI consent and stale-header ownership | `91d3a51707b9c515990c31a89505c3bf9a443aa6` | 5 passed; 2 files; 30.85 s | `independent-ui-review.log` |

Raw logs were produced in `/workspace/scratch/c20ffc46347e/` and supplied to the
coordinator for the qualification packet. Each selected run reports zero skipped
tests. The exact commands were:

From `apps/web`:

```sh
npm exec -- vitest run src/features/btc/scanWorker.test.ts src/features/btc/scanWorkerSource.test.ts src/features/btc/oracleWorker.test.ts src/features/btc/oracleBridge.test.ts --maxWorkers=1
```

From `packages/btc-silent-payments`:

```sh
npm exec -- vitest run src/scan/state.test.ts src/scan/scanner.test.ts --maxWorkers=1
```

From `apps/web`:

```sh
npm exec -- vitest run src/features/btc/scan.spends.test.ts src/features/btc/scan.resume.test.ts src/features/btc/scanStore.test.ts src/features/btc/scan-secrets.hardening.test.ts --maxWorkers=1
npm exec -- vitest run src/features/btc/BtcView.spentConsent.test.tsx src/features/btc/BtcView.headerOwnership.test.tsx --maxWorkers=1
```

## Security and privacy properties reviewed

- **Block completeness and identity.** Esplora validates transaction-count,
  txid-Merkle and witness commitments against the checked block header, with
  response-byte and block-weight limits. Spend extraction now uses transaction
  inputs rather than the server's coinbase annotation. These checks bind the
  input list being scanned; they do not validate all prior-output scripts or
  establish full Bitcoin consensus.
- **Consent and stale work.** Full local scans do not automatically fall back to
  outspend queries. Light mode requires an unchecked-by-default explicit consent
  control, and the bridge separately enforces its captured policy. Revocation,
  lock and source/network/mode changes cancel work and reject late results.
  Already dispatched requests cannot be recalled. Proof requests are restricted
  to explicitly authorized light scans.
- **Result ownership.** Worker results are checked against the requested start,
  permitted endpoint, current header hashes, unique outpoints and bounded
  historical-recovery page metadata. Invalid and stale transferred tweak buffers
  are wiped. UI selection and signing/broadcast gates recheck applicable live
  header coverage.
- **Persistence and rollback.** Existing authenticated encrypted Bitcoin state
  remains scoped to wallet/network/source policy and protected by compare-and-swap,
  generation and forget guards. It stores discovery/spend metadata, not private
  spend tweaks. Completed blocks advance the cursor; rollback clears orphaned
  spend evidence and clamps/removes continuous coverage. Legacy records remain
  loadable without inventing missing coverage. Historical tweaks are re-derived.
- **Bounded work.** The web layer caps fresh advancement and historical recovery
  at 500 blocks each per call and caps restored/current matches at 10,000. The
  spend-deduplication set grows only with watched or matched outpoints, rather
  than all block inputs. Existing per-block spend, response, worker-request and
  source-cache bounds remain. A performance benchmark is not part of this review.

## Documentation and integration limits

Documentation review covered `docs/user/bitcoin-silent-payments.md`,
`docs/specs/12-bip352-light-client-scanning.md` and the relevant Bitcoin sections of
`apps/web/DEVIATIONS.md`, updated in
`6f5134de3443e36845fc9f150060d6a083aea86c`, plus the final security-copy changes in
`91d3a517`. The corrections distinguish scan-time local evidence, an unproven
provider report and unknown history. They explain explicit light consent,
revocation, encrypted continuity, legacy refresh and reorganization behavior.
Older contradictory claims that spentness was wholly provider-trusted or Bitcoin
scan state was not persisted were corrected. English fallback for changed security
copy remains explicit; this review is not native-language translation review.

PR #238 was compared only at
`198aa5baff22272453733a0f3dcfcac0e0994eec`. Its independent
`watchOutput`/`spendStatus` design automatically falls back to provider queries and
does not preserve PR #219's explicit `providerSpentCheck`/`spentStatus` contract.
Future integration must reconcile these overlapping Bitcoin paths explicitly.
The comparison checkout's active uncommitted work was not used as pinned evidence.

The new browser specs at `985d5284` were source-reviewed, including full-profile
no-outpoint traffic by default, revocation, encrypted legacy restart and the lean
profile's intentional exclusion of Bitcoin. They were not run by this reviewer.
The coordinator reported local Chromium failing before page execution because
the environment refused `socket()`; fresh hosted full/lean CI is still required.
Mocked regtest checks do not establish external-node/proxy compatibility,
physical-device acceptance or globally best-chain visibility. Mempool spends can
remain locally invisible, and a provider's unspent response remains unproven.

This closes the independent source review of the stated feature scope. It does
not authorize a merge or deployment, replace the remaining qualification gates,
or clear unrelated GhostPay release blockers.

## Integration review of current main

On 19 November 2026 UTC, the reviewer independently inspected the incoming main
changes and the completed integration in the separate `GhostPay-integration`
worktree. **No feature-specific integration blocker was identified.** The exact
reviewed source is:

| Item | Pin |
| --- | --- |
| Integration merge | `3f4811afbfbdd5fa2fd2fbdd9afdac86f976668a` |
| Integration tree | `0074dde6081e45188c45feb39503c64243ef99b8` |
| First parent: reviewed Bitcoin continuation | `fe9582626be39d1b52bed6ec84645c4d2acdf28f` |
| Second parent: updated main | `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` |

Updated main includes the browser-network isolation and beta-log retention merges.
The only merge conflict was `docs/ai/ACTIVE_WORK.md`; the coordinator retained both
claim sections. Bitcoin runtime/package files, Bitcoin browser tests, locale
catalogs and security keys have no changes between the reviewed first parent and
the integration merge. The feature diff against the new main remains limited to
Bitcoin implementation/tests, Bitcoin disclosures and the qualification packet,
plus the work-tracking entry. It does not modify the incoming shared transport,
Solana/TRON adapters, release helper, CI, dependency lockfile or build profiles.

### Compatibility trace

- `apps/web/src/lib/release.ts` now constrains the entry-script hash read used by
  `apps/web/src/views/Home.tsx`: same-origin HTTP(S), no redirects or credentials,
  and bounded response bytes and time. It does not replace global fetch or mutate
  the injected service used by Bitcoin.
- `apps/web/src/lib/defaultServices.ts` still supplies its direct browser-fetch
  adapter. `BtcView.tsx` passes that service to Esplora and the scan worker client;
  `scanWorkerSource.ts` and `oracleBridge.ts` retain their own selected-origin,
  method/path, disclosure-consent, cancellation and result-ownership guards.
- Incoming `packages/net-transport/src/fetchTransport.ts` changes apply through
  the EVM `apps/web/src/lib/scanPrivacy.ts` path. Neither that transport nor the
  POST-only `fetchAdapter.ts` replaces Bitcoin's GET source bridge. The incoming
  Solana/TRON adapter changes do not modify Bitcoin dispatch.
- Vite profiles, Playwright configuration and full/lean app entry points are
  unchanged by this feature relative to the new main. Bitcoin remains in the
  full profile; lean acceptance checks its intentional absence. The incoming
  beta-log workflow change only retains hidden acceptance-log files.

### Inherited inventory and verification limits

The inherited `docs/privacy/network-egress-inventory.json` and
`docs/privacy/browser-network-isolation.md` explicitly describe the earlier
`dfc75ef2087fa6463ae59e0818abec01796c578d` baseline. Their `btc-match-proof`
authorization description says queries are automatic within a started scan or
spend validation. That historical description must not be presented as the new
Bitcoin consent contract. The updated Bitcoin user guide and this review describe
the current explicit, revocable outpoint/proof authorization. Preserving the
pinned historical inventory is not a runtime integration defect. No new production
network dispatcher file is introduced by this feature.

**No additional tests were executed for this integration review.** The 119 passing
tests above remain the actual independent selections at their recorded source
anchors; they are not relabelled as combined-head runs. Final combined builds,
typecheck, lint, coverage and hosted full/lean Chromium qualification remain the
coordinator's evidence. This integration addendum changes documentation only.

## Independent packet accuracy check

The same independent reviewer subsequently checked the draft qualification packet without changing files or
executing acceptance tests. Remote Git objects for published implementation
`ef08170a83d86d194b8ce4186299e791027e461e` and hosted merge
`278b1d5afcbc5056fd096ea52e34feaaeedfdb4e` both independently resolved to tree
`0074dde6081e45188c45feb39503c64243ef99b8`. All 38 changed implementation/test-file hashes and all 89 Bitcoin
package hashes matched the pinned source and current files. Four embedded independent logs and the final
local package coverage/lint/typecheck logs matched their retained hashes and originals.

The reviewer confirmed the reported Pages tooling, egress, catalog and translation-key counts, and the final
local 566-pass/1-timeout/0-skip package result. Two stale draft statements were corrected: the local Node22 run
had finished, and the Pages build/browser jobs used different Node22 patch versions. This was an evidence
accuracy check, not another acceptance-test run or a claim that pending CI had passed.

## Review of the final typing correction

Hosted ESLint identified ten unsafe-member/argument diagnostics in the later `validateResult` callbacks.
The final correction at local `10c3993d4d7a215c57b936ee2b1967741d247675` (published equivalent
`4a878e302beac5cca52d20e17cdd756f3fbebb0d`) adds only three parameter type annotations, matching the earlier
validated-array callbacks. The reviewer independently compared the exact diff and confirmed that header/range,
consent, uniqueness and rejection predicates are unchanged. No feature-specific blocker was found.

An independent TypeScript 5.9.3 ES2022/ESNext transpilation under Node 24.22.3 reproduced the implementer's
Node 22.23.5 result: both emitted files are 10,176 bytes and share SHA-256
`7d6dd13f1bd0e28209ad0667695045a3a6373d98810a5f9a20caeec572e4d853`.
The reviewer ran no additional tests for this source-only check. The implementer's separate evidence records
the ten-error lint reproduction, 28-file lint pass and 29 unchanged worker regressions passing after the fix;
those executions are not added to the independent 119-test count.

## Compatibility with the next accepted main

Main subsequently advanced from `58d89b39b27a66454ebf392bcd35d5c68b57b2f8` to
`e454de6abfefda70d82784fafc1d8949b277c334` through accepted PR #242. GitHub's advertised PR #244 merge is
`d169af429f2c3be6536118b280f849016292c85d`, tree `143c2be8d3a75ed1f68ed0b3d47bd8becee49d30`, with parents
`e454de6abfefda70d82784fafc1d8949b277c334` and feature head `2364284a2717a22b895fcb7badeb2e7ae6bb0e48`.
The coordinator fetched and checked that object independently. Its tree differs from the feature branch's
`bd740c1913057a42b5b0a6cabb46a4cddef3dc9f`; no equality with the earlier combined tree is claimed.

The reviewer inspected the 22-file changed-path delta and relevant shared runtime patches. The only overlap
with this feature's 63 changed files is
`docs/ai/ACTIVE_WORK.md`; no Bitcoin runtime, package, worker, dependency or test configuration changed.
The coordinator separately verified all 38 feature implementation/test hashes against the advertised merge.

- `AppShell.tsx` retains `notifyAppLock('idle')` and the existing cleanup lifecycle while adding dual-clock and
  clock-rollback checks. Bitcoin's subscriber still cancels the worker, clears consent/results and wipes the wallet.
- General `scanClient.ts` changes migrate the separate seller checkpoint to session-bound version 4 and purge
  the exact old localStorage prefixes. Bitcoin's encrypted `GhostPay/BTC/scan-state/v1` scope and header
  IndexedDB storage are disjoint; no general checkpoint code was adopted by this feature.
- Invoice changes add optional `requirePinnedSigner` behavior and additive error types. Existing default
  behavior remains compatible with the Bitcoin feature.

**No feature-specific integration blocker was identified.** This was a source review, with no new test
executions. The advertised merge is an integration candidate; an executing workflow's actual checkout must
still be established from its own logs before assigning test results to that tree.

## Attribution of the local header stress timeout

A separate read-only reviewer traced the failed 100,005-header test through its complete six-file repository
import path. The coordinator independently verified all six source blobs and seven dependency/configuration
blobs across original PR #219, initial main, the corrected local and published runtime, and the advertised
latest-main merge. Every compared blob is identical. The test does not import the modified scanner, state,
header-sync, worker or web modules. Exact identities are retained in
[the local package report](evidence/btc-node22-final-report.json).

The 163.402-second test callback includes fixture mining, initial chain validation, serialization and reload
validation; it does not measure `fromJSON()` alone. No spentness-feature work was added to that path. The
timeout remains a real failed local gate: source equality establishes neither a historical baseline runtime
nor a specific environmental cause. No deadline was changed and no additional stress test was run for this review.

## Parallel implementation overlap

A final read-only census found draft [PR #254](https://github.com/djshellshoxxx/GhostPay/pull/254), branch
`chatgpt/btc-spentness-private-scan-20261118`, at `8c1d87a2587281c32a5f1326a4f36cfada4384bc`, tree
`9721a1fe7bfbfcac65dad577c651c9b5284386cb`. It independently continues original PR #219. It is an alternative
candidate for the same feature: 36 of this branch's 63 files overlap, including all 13 changed Bitcoin runtime
files. The branches diverge after main `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`.

The reviewer compared the relevant interface slices, not the entire alternative implementation:

- PR #254 keeps `getSpends`, `providerSpentCheck` and `local | provider | unknown`, but stores per-match
  `spentCheckedThrough: { height, blockHash }` in version-1 state. This branch stores continuous
  `spendsFromHeight` coverage at state level. A future integration must explicitly reconcile coverage and
  migration rules; sharing a version number alone does not establish semantic compatibility.
- PR #254 passes two positional authorization booleans into the worker source bridge. This branch uses a
  consent-options object and additionally binds returned results to the request, headers, ranges, unique
  outpoints and historical page limits. Selecting whole files from either branch could discard safeguards.

No automatic merge or changes to PR #254 were performed. Its own PR description also identifies #244 and
#238 as alternatives requiring deliberate reconciliation. Existing PR #238 at
`198aa5baff22272453733a0f3dcfcac0e0994eec` remains a separate overlap with different `watchOutput` and
`spendStatus` interfaces and automatic provider fallback.

Other inspected workstreams do not directly replace Bitcoin runtime: PR #248 at
`139c5cb8e086ec4b13d08e10409dfb0765b53bcf` overlaps locale/security-key files and the ownership registry;
PR #247 at `6c11242abca5a3f20d933266c723d71b2e75d39b` overlaps only that registry. PR #243 at
`276aed60f19671cc6fa551be616b61041cb45b50` targets PR #238's integration branch and therefore inherits its broader
Bitcoin conflict even though its own changes overlap only locale/security-key files and the registry. These
pins identify the observed census; they are not source qualification or a security review of those PRs.

## Prior typing-correction evidence accuracy check

The reviewer independently checked the subsequent complete Bitcoin web selection: 242 passed, one existing
live-regtest skip and exit 0 at local `d593fde4bf49b28a99112579ea6c6c8d36270324` / published
`2364284a2717a22b895fcb7badeb2e7ae6bb0e48`. The 118 source/configuration records, 16 workspace entrypoint
pairs, raw log, canonical manifest digest and Vitest report digest all matched their recorded values. The
reviewer also independently confirmed the advertised merge's parents/tree, all 38 feature hashes and the
13-file timeout attribution across five revisions.

Two ambiguous historical labels were corrected: the README now explicitly identifies the older tree used
by its earlier qualification table, and `source-pins.json` records the post-integration typing-only change.
The bounded shared-runtime review scope was clarified as well. No substantive evidence inconsistency or
feature-specific source blocker remained in that check. It ran no additional tests and does not qualify the
whole-web attempt and fresh hosted workflows, which were pending at the time of that check. The later
SIGKILL outcome and subsequent provider-label correction are recorded separately above and in VALIDATION.md.

## Provider-label correction and packet accuracy check

The reviewer bound the final R08 verdict to `1977a50010e2d72476e0de67168b4f46715aab9c`, checked the
two committed files against the worktree, and verified client SHA-256
`7b7cdb4bb5b380d7b3d0aa800355f654fc781deccf3afb2262a2ece1d7c21b18` and test SHA-256
`232c4994bf5eaf91ea5d8f65f28c3cbfb8eadb5b8fba831b6cb145780bbe3d42`.
Empty, partial, resumed and light-mode successes with consent all retain `provider`; provider failure rejects.
The symmetric check therefore preserves legitimate result contracts. A separate consent snapshot was not
needed for this demonstrated defect: the current UI supplies a fresh parameter object and cancels on policy
changes rather than mutating it.

The reviewer inspected the two failing-before cases, 45-test passing-after report and lint evidence without
claiming a separate execution. The new tests establish real authorized bridge traffic before each forged
label, followed by rejection, transferred-tweak wiping, worker termination and handler detachment.
**No feature-specific blocker remained in the committed correction.**

A bounded packet check independently reproduced the interrupted whole-web counts from raw completion lines:
29 of 201 files, 929 passed assertions, two failed assertions, and 37 raw skipped entries partitioned into
12 intentional native-tool skips and 25 unexecuted QR tests. The separate no-coverage JSON confirms three
passes. All ten referenced whole-web artifact hashes/byte counts match. The 64-row file map exactly matches
all changed feature/packet paths, with no missing or extra file. Historical wording and the two modified
upstream documentation files were clarified; no remaining concrete accuracy issue was found in that review.
The new complete-Bitcoin run and hosted checks were still pending and were not assigned a result by this review.

After the new Bitcoin-directory run finished, the reviewer verified its 244 passed / 0 failed / 1 existing
live-bitcoind skip against the saved Vitest report at local `1977a500` / published `981cc2f4`. All 118
source/configuration hashes match that commit and the worktree; before/after manifests are byte-identical.
All 16 workspace runtime/declaration output pairs and six saved artifact hashes/byte counts match. The embedded
raw log equals the saved file. No additional tests were run, and no broader typecheck, coverage or browser
completion was inferred from this evidence verification.

## Current-source validation evidence review

The reviewer independently checked the subsequent web typecheck and whole-workspace lint records at
`1977a500` / `981cc2f4`. The typecheck exited 0 without diagnostics. Lint started all 67 workspace scripts,
with five `Killed` lines and five lifecycle code-137 failures; the wrapper records `signal: null`.
The packet correctly preserves this as an unsuccessful gate, leaves its cause unverified, and does not
infer success from the absence of ESLint rule errors. Source manifests and saved log/result hashes match.

The current supplemental workflows were also checked against their raw logs and metadata. All three CLI
platforms, Pages build/browser, Integration, Beta, Hosting web and Hosting kit confirm actual checkout
`d46949b99709b5dae2b4edc3d8c4bb2d2ed50cac`. Counts, tool versions, explicit skips, artifact sizes and
GitHub-reported digests match the records in VALIDATION.md and the per-workflow evidence files. Repeated
platform executions and compatibility tests are not added into unique Bitcoin test totals.

The Pages evidence distinguishes the uploaded 16-file DEMO artifact from the browser job's separately built
development/testnet manifest and local-Anvil site. Installed Chromium version evidence is not presented as
a separately printed runtime version. Integration's actual test-runtime line confirms Node 22.23.4 and
npm 10.9.9; its nine Bitcoin steps are existing compatibility coverage, not execution of the new browser
spentness/reload cases. Artifact digests were checked against the upload logs and GitHub API snapshots;
the reviewers did not claim an independent download and hash of those archives.

No concrete report-accuracy issue remained in these additions. These were evidence checks without new test
executions. Current core Bitcoin/web coverage, workspace gates and full/lean Chromium were still pending
and were not assigned passing results by these reviews.
