# Bitcoin spent-output detection and private scanning

## Qualification status

Implementation is committed on `chatgpt/btc-spent-private-scan-20261118`. Final combined qualification is running;
this packet is being prepared for a draft review PR and does not yet assert merge readiness. Runtime source:
`985d5284` (full pin recorded in the final validation report). No main merge, deployment, release, contract,
transaction-construction, recovery or unrelated dependency change is included.

Source inputs: current main `dfc75ef2087fa6463ae59e0818abec01796c578d` and the unchanged implementation of
[PR #219](https://github.com/djshellshoxxx/GhostPay/pull/219), head
`9617e8572f9bc414410bd937b0e7718d0c5bd55c`. Original #219 CI passed at that original head; those passes do not
qualify this continuation. The original commit is preserved in this branch's ancestry.

## Implemented corrections

- Preserve local `getSpends` extraction, source wrappers and the `local | provider | unknown` result contract.
- Derive coinbase identity and consumed outpoints from committed transaction data; reject contradictory provider metadata.
- Track compatible continuous local input coverage in encrypted Bitcoin state; legacy, partial and unwatched historical
  discoveries remain unknown. Unknown results stay visible but cannot be selected for a sweep.
- Preserve the earliest canonical spend proof, reject replayed confirmed outpoints, and remove orphaned evidence on rollback.
- Retain a coverage-tip hash for resumed results, invalidate results after forks or incomplete header refreshes, and clear stale counts.
- Enforce explicit outpoint consent at both worker and main-thread transport boundaries; light-only proof requests have a separate gate.
- Require explicit provider consent before light-mode scanning. Revocation cancels the worker, closes transport and clears results.
- Reject late header/worker results after wallet, source, network, mode or lock changes; validate results against the active request and headers.
- Enforce the 10,000-output limit even when many outputs share a tweak buffer; retain existing block/response/recovery bounds.
- Preserve reviewed-English fallback for security disclosures and the full/lean build boundary.

Every confirmed behavioral defect has a failing regression followed by a fix; the independent reviewer also found
and checked follow-up edge cases. See [the acceptance matrix](ACCEPTANCE_MATRIX.md) for initial status and scope.
The final independent review and validation report will record actual source, commands, counts, coverage and limits.

## Validation already observed (preliminary, not final combined qualification)

- Clean locked installation (`npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`) and all library builds succeeded.
- Esplora suite: 38 passed. Header suite before the final short-header edge: 31 passed.
- Final header invalidation selection: 5 passed; 27 deselected by the targeted filter. A broader concurrent run passed31
  and timed out one existing 60-second header stress test; its timeout was not changed.
- Core package state/scanner selection: 39 passed; web spent/resume/secret selection: 21 passed.
- Independent reruns: package39, web spent/resume/store/secret29, and worker/oracle46 passed with no skips in those selections.
- Whole-web typecheck attempts were terminated by the local executor (exit137); these are not passes.
- System Chromium launch failed before page execution: `socket() failed: Operation not permitted`. Browser specs are authored,
  but local browser acceptance is not claimed. Fresh hosted full/lean CI is required.

## User-visible evidence semantics

| Status | Meaning | Sweep selection |
| --- | --- | --- |
| `local` | Applicable confirmed-block inputs cover the output through the latest tip known to the scan; no optional outpoint query | Available only while the complete checked-header coverage still matches |
| `provider` | Explicitly authorized server report for candidate outpoints | Available subject to existing header/review gates; the report remains unproven |
| `unknown` | Partial range, legacy gap, newly rediscovered unwatched history, or invalidated coverage | Disabled until refreshed |

Local scanning does not detect all mempool spends and cannot establish that a provider supplied the globally best
chain. A broadcast can still be refused. One authorized provider check does not manufacture local historical
coverage. The [Bitcoin guide](../../user/bitcoin-silent-payments.md) explains resumption, fresh local rescans,
provider disclosure and reorganization behavior.

## Integration boundary

PR #238 at `198aa5baff22272453733a0f3dcfcac0e0994eec` contains an overlapping independent
`watchOutput`/`spendStatus` implementation with automatic provider fallback. Future consolidation must explicitly
reconcile its BTC paths with this #219 continuation, preserving the explicit-consent and unknown-state rules.
This branch does not merge general consolidation, PR #235 seller checkpoints, Spec18, other chains, browser-wide
isolation, Mythril or contract work.

Bitcoin remains in the full web profile. The lean GitHub Pages profile deliberately excludes it; lean browser
acceptance must verify absence of the BTC surface/traffic instead of activating a new deployment feature.
Overall GhostPay release readiness and external-node/device acceptance remain separate determinations.
