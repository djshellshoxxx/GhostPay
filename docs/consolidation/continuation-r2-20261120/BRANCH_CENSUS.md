# GhostPay live branch census — continuation R2

## Frozen inventory

The GitHub branches collection was fully paginated between **2026-11-20 17:49:34 and 17:49:36 UTC**. Four pages contained **100, 100, 100 and 87** entries: **387 real branch refs and 382 distinct heads**. This is a live API inventory, not a remote-tracking inventory containing a symbolic `origin/HEAD` alias. An earlier snapshot in this worker differed only in the integration-lock control head.

Comparisons use main `aa3df1cb37274fae73af0ca957183c15c51b62d3`, combined candidate #307 `2876b7db580e47a880d5951ce9e62941bcf76fdf`, and stacked Sweep candidate #325 `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a`. All source objects were present after the coordinator's fetch. Full local Git trees avoid the GitHub comparison file-count ceiling.

| Classification | Branch refs |
| --- | ---: |
| Ancestors of main | 185 |
| Additional ancestors of #307 | 10 |
| Additional ancestors of #325 | 4 |
| No compared code changes | 64 |
| Nonancestor heads with identical compared code | 15 |
| Related heads requiring semantic disposition | 107 |
| Coordination metadata | 1 |
| Unrelated deployment history | 1 |
| Total | 387 |

The JSON companion records each exact branch head, merge base where applicable, code-difference counts, the comparison filter, and targeted semantic dispositions. Changed files outside code are not evidence of missing functionality. Differing code is also not proof that useful behavior is absent. Ancestry alone does not prove that every old behavior survived.

## Actionable recovery

1. **TRON scan cancellation, PR #321, `87c3bf5a59f4d443c9e5cf81368162554a5315c3`.** Current main/#307/#325 have the same unchanged scanner source. This donor adds missing abort checks after asynchronous reads and before buffered yields, with three deterministic regressions. It is based on current main and has no product overlap with the other two new feature tracks. Its original handoff explicitly states that its new tests were not executed in that invocation; current qualification remains mandatory.
2. **TRON range completeness, PR #271, `429a4de80b9ec53177b17d89d18ce8ec91a08814`.** The current range parser accepts omitted or short ranges. The donor requires the complete contiguous requested range. Recover only that missing guard, the original scanner cases, and the browser fixture/regressions. Current EVM transport privacy options are stronger than the old donor and must remain. This complements #321 through a separate runtime file.
3. **Sleep-aware session locking, PR #256, `e2ebb4902e53e2249c6585a1d72be6e1e416c36c`.** This remains an accepted unfinished feature requiring deliberate reconciliation with newer SellerKeys and session work. It is not a blind merge candidate. Both browser profiles currently fail. The lean job's actual failure is the final invoice-expiry assertion after a two-hour clock jump; the source also adds idle expiry, so the test clocks must be investigated without weakening either authority check.

The range-completeness recovery is assigned to this worker on a fresh branch based on #321. The coordinator owns shared publication and qualification scheduling.

## Existing behavior and active owners

Targeted source review assigned semantic dispositions to 20 priority refs. Current code already retains or strengthens the older dense-array, base64url runtime-input, QR-kind, negative-fiat, blocked-tag-download, Settings wording, Pages artifact integrity, transfer-filter and checkpoint-replay changes. Their differing blobs do not justify replacing the newer implementations.

The historical legacy-payment donor `6b3e689c15ca0a4ca0bc034ef24c3a2a5fb5ea7a` is not ready for recovery: it treats every other payment key for the same payer/chain as legacy, including modern scoped records. Its broad refusal requires a separate journal-version/migration design before adoption.

F03 head `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec` merges current main and adds qualification records to the previously retained feature. F04/F05/F10 now have active isolated draft PRs #322/#323/#324; their current owners and source branches are preserved. This worker does not modify those features, the persistent-retention lane, broad relayer/contract work, or fee policy.

## Actual hosted evidence and limits

- #271: 36 successful checks, three intentional deployment-only skips, one failed beta check. The failed [job 135513340794](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510541529/job/135513340794) stopped during Playwright OS-package installation after Ubuntu mirror connection/resource errors and apt exit 100. No beta assertions ran. That infrastructure failure is retained; it is not relabeled as a passing gate.
- #256: 34 successful checks, three skips, two failed browser jobs. The [lean job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44492212148/job/135504052288) recorded 80 passed, three skipped and one failed test at `core-journey.spec.ts:606`. The full profile was observed failed; this worker has not inferred its precise failure from the lean log.
- #321: current hosted work was still queued/running when inspected. No merge qualification is asserted.

No tests or builds were executed for this inventory. This is a complete branch enumeration and bounded semantic review, not a claim that all historical code has been audited or all branches should merge. Preserve exact heads and re-read current refs and checks before integration.
