# Historical branch validation

Reviewer: `/root/security_audit`, read-only. Baseline: `e454de6abfefda70d82784fafc1d8949b277c334`.
Inventory input: `census.json`, captured `2026-11-19T07:44:23.498770+00:00`.
No fetch, branch mutation, package installation, product edit, deletion or merge was performed.

## Per-ref result

| Ref | Exact head | Ahead of baseline | Disposition | Verified remaining difference |
|---|---|---:|---|---|
| `claude/lucid-meitner-apalzc` | `d6f6617e595bbba7e83a1fcdec585bedb9adaf0f` | 19 | PARTIALLY_RECOVERABLE | Current head is not the old contained `0d2ea8b4` recorded by the existing ledger. Missing calendar-date/nonfinite-retry/TRON-range guards are owned by #250. Missing AST source scanning and positive pool input guards are owned by #257. Other code changes have equal or stronger main equivalents. Preserve its audit/mutation provenance; do not merge the whole old tree. |
| `ghostpay-cloud-recovery-2026-10-26` | `2ec98b23942838c7177d91c46c66c3768b4ca493` | 12 | RETAIN_FOR_REFERENCE | Shared synthetic checkpoint and seller-recovery/payment/browser intent survives in evolved main source and tests. Its tip changes restart documentation only. No independently demonstrated missing product behavior. |
| `ghostpay-local-lean-boundary-20261027` | `020ba327e1a26f6d989d428eee19fb12f63dec82` | 18 | RETAIN_FOR_REFERENCE | Lean entry/public-asset selection survives with stronger module/worker/output evidence checks. Old vendor dependency/SBOM behavior is obsolete. Tip is restart documentation only. |
| `ghostpay-offline-deps-2026-10-27` | `3697f539d3a8e5c5c039fb64f4d2bfc970e7f48c` | 13 | RETAIN_FOR_REFERENCE | Viem 2.22.14 metadata repack is superseded by registry-pinned Viem 2.57.13. Main lock has no `file:` archive dependencies. Do not reintroduce the old archive. |
| `ghostpay-sbom-repro-2026-10-27` | `b5b04b999e84e7598dcb98adbf3c44e340223d05` | 14 | RETAIN_FOR_REFERENCE | Old normalizer/test handles the removed vendored Viem archive. Current normalizer retains deterministic serial/time and checkout-independent root naming. Archive-specific behavior is inapplicable to the current lock. |
| `codex/ghostpay-recovered-lean-checkpoint-20261028` | `371d235c3e5926014c00e027196b6aa567ea1b82` | 19 | RETAIN_FOR_REFERENCE | Union of the prior recovery/lean/SBOM checkpoint lineage. No product implementation file is absent from main. Retain unique historical evidence rather than reapply the synthetic snapshot. |

These references are not ancestry-merged. Functional supersession is not permission to delete their unmerged historical evidence.

## Lucid commit-intent crosswalk

| Original work | Current result |
|---|---|
| `ea1f0b24` and `768b1f4c`: reject zero withdrawals/ragequits and align tests | Recovered, awaiting qualified promotion through #245/#257. #257 preserves zero change on a full positive withdrawal. |
| `e2fef011` and `b098b73a`: real calendar dates, bounded nonfinite retries, bounded price decimals and bounded regression fixture | Date/retry logic and corresponding regressions are in #250 `22af2074a086d9957a18e310ef8572b28d1facd0`. Main already limits price decimals to 30 (old branch allowed 36) and adds expected feed decimals, reference/peg and sequencer checks. |
| `c37604d1`: complete contiguous TRON ranges | Recovered in #250; missing/short/gapped ranges are refused before the scanner can advance. |
| `c0885a7a` then `016fa252`: source scanner comment masking/AST repair | Recovered through #247/#257 `4f14d6f167c788f5ae2d019bc8482027495f3c6c`; keep the AST version, not the intermediate regex/comment-stripper implementation. |
| `016fa252`: maxQueue validation | Main validates positive safe integers once and stores an immutable private bound. Old branch rereads `d.maxQueue` at each admission, so whole-file recovery would weaken current protection. |
| `016fa252`: whole-file split `tx.origin` checking | Main uses the stronger token-aware `check-tx-origin.mjs`, including comment/string handling and three-token splits. Independent current tests passed. Do not restore the older inline shell/comment-strip pass. |
| `38cb0bfa`: ops-monitor require-await fixture correction | `packages/ops-monitor/src/w3.test.ts` blob is identical between current main and the historical head. |
| Remaining post-base commits | Audit, mutation-test evidence and ledger documentation. Useful provenance; their old release/branch status is not authoritative for current main. |

## Verification of the old recovery lineage

The five old recovery refs share checkpoint `71cd067d`; their latest per-branch tip commits change only `docs/handoffs/CODEX_RESTART_2026-10-28.md`.

Recomputed touched-path comparison against the current baseline:

| Ref | Touched paths | Identical blobs | Evolved paths | Absent paths |
|---|---:|---:|---:|---:|
| cloud recovery | 173 | 31 | 138 | 4 |
| local lean boundary | 187 | 31 | 146 | 10 |
| offline dependencies | 178 | 31 | 138 | 9 |
| SBOM reproducibility | 180 | 31 | 139 | 10 |
| recovered lean checkpoint | 188 | 31 | 146 | 11 |

Absent paths are five historical evidence/handoff files (some refs contain only four), five old vendor archive/provenance files, and the vendor-specific `scripts/tests/normalize-sbom.test.mjs`. No current product implementation is missing. Presence alone is not behavioral equivalence, so the following source checks were also performed:

- `SellerKeys.tsx` still clears typed keys/passphrases on lock/session change, resets the file chooser on cancellation, owns completion by operation generation and installed session identity, and refreshes saved-vault state after save refusal. Its recovery, completion and storage regression files remain.
- `payExec.acceptance.test.ts` checks the exact ERC-20 token/destination/amount at the wallet boundary and retains the transaction hash when the wallet broadcasts unexpected data.
- `flows.spec.ts` still uses a real CSP Web Worker and independently validates receipt binding. `sweep.test.ts` retains the pre-signing stale-session refusal and post-handoff unknown/submitted distinction.
- `localBuildProfile.mjs` explicitly names `GhostPay371d235` as the selection/public-copy basis, then adds actual module/worker evidence, executable-asset restrictions and report paths outside shipped output.
- Main `package-lock.json` pins `node_modules/viem` at `2.57.13`; no `resolved` entry starts with `file:`.

Executed on unchanged baseline:

```sh
timeout 45 node --test scripts/tests/check-tx-origin.test.mjs apps/web/scripts/localBuildProfile.test.mjs
```

Result: **43 passed, 0 failed, 0 skipped**, exit 0, duration 10.884 seconds. Log: `/workspace/scratch/4456a7e75d37/historical-retention-checks.log`. The checkout remained clean at `e454de6a`. These are focused source-tool checks, not browser/production-build or historical whole-snapshot qualification.

## Actionable outcome

No additional unowned in-scope product gap was demonstrated in this six-ref review. Safest recovery sequence is #250 and #257 after their applicable checks and expected-head verification, followed by an updated lucid disposition. Preserve the five source-recovery branches as reference; do not resurrect old dependencies, whole-tree copies or obsolete qualification claims.
