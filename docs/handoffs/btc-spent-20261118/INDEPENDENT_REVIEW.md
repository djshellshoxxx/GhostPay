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

Final implementation and authored browser-test head reviewed:
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

An independent TypeScript5.9.3 ES2022/ESNext transpilation under Node24.22.3 reproduced the implementer's
Node22.23.5 result: both emitted files are10,176 bytes and share SHA-256
`7d6dd13f1bd0e28209ad0667695045a3a6373d98810a5f9a20caeec572e4d853`.
The reviewer ran no additional tests for this source-only check. The implementer's separate evidence records
the ten-error lint reproduction, 28-file lint pass and 29 unchanged worker regressions passing after the fix;
those executions are not added to the independent119-test count.
