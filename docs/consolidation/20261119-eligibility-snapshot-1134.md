# GhostPay eligibility snapshot — 2026-11-19 11:34 UTC

## Result

**No requested PR was immediately eligible or fully complete GREEN during the 11:31:18–11:34:20 UTC observation window.** All ten PRs remain drafts. Every candidate has pending exact-head checks; four also report merge conflicts. This snapshot does not replace the fixed 278/285/287 branch census.

Current main is [`c977b5d6723f6822c3b5d86cd6b231712c53c395`](https://github.com/djshellshoxxx/GhostPay/commit/c977b5d6723f6822c3b5d86cd6b231712c53c395), tree `2634456ffa35681e799f71b72bb907f946a77618`. It has 3 queued; push CI run [44513266929](https://github.com/djshellshoxxx/GhostPay/actions/runs/44513266929) is pending and dynamic analysis [44513266537](https://github.com/djshellshoxxx/GhostPay/actions/runs/44513266537) is queued. Main qualification remains incomplete.

## Exact-head observations

| PR | Exact head | Target | Mergeability | Observed check runs |
| --- | --- | --- | --- | --- |
| [#271](https://github.com/djshellshoxxx/GhostPay/pull/271) | `429a4de80b9ec53177b17d89d18ce8ec91a08814` | main | true / unstable | 1 skipped, 10 queued, 1 success |
| [#272](https://github.com/djshellshoxxx/GhostPay/pull/272) | `63ff40d57af879a3d82166450f63aadb7bf0d5ff` | main | true / unstable | 11 queued, 1 skipped, 3 cancelled |
| [#273](https://github.com/djshellshoxxx/GhostPay/pull/273) | `64e192916d66500db8a47a251b4ab17c4d756906` | main | true / unstable | 7 queued |
| [#274](https://github.com/djshellshoxxx/GhostPay/pull/274) | `a4c6f945adef0438bfd0b347fb7c11057e3973ce` | main | false / dirty | 3 queued |
| [#275](https://github.com/djshellshoxxx/GhostPay/pull/275) | `dc821780e05483d1b35062a74b07be7ed9ca2f1c` | #270 branch | true / unstable | 1 skipped, 10 queued |
| [#265](https://github.com/djshellshoxxx/GhostPay/pull/265) | `c591b54078febcf24cba01b29bc173b2fac1f9cb` | main | false / dirty | 20 queued, 3 skipped, 14 success |
| [#267](https://github.com/djshellshoxxx/GhostPay/pull/267) | `57dff1ad7706959bc78861fa4cf9af58952f4643` | main | true / unstable | 5 queued |
| [#268](https://github.com/djshellshoxxx/GhostPay/pull/268) | `ddfc8cfafa44b09103ced821f160c1d37fdfe552` | main | false / dirty | 3 skipped, 14 success, 20 queued |
| [#270](https://github.com/djshellshoxxx/GhostPay/pull/270) | `73545f63112910d46002718354ab5e99f8652e1f` | #262 branch | true / unstable | 8 queued, 1 skipped |
| [#269](https://github.com/djshellshoxxx/GhostPay/pull/269) | `683f8587b8de45448f14aab0539cb07a5f21bce3` | #262 branch | false / dirty | 1 skipped, 7 queued, 1 success |

The JSON companion includes source URLs, check IDs, workflow run IDs and attempts, and normalized metadata. Every returned check and workflow matches its recorded head. Check and workflow pages were complete within the 100-item page size. All observed workflow attempts are 1. Snyk's legacy commit status is success on each PR; main has no legacy statuses. Formal review histories were not fetched.

- **#271, #272, #273, #267:** mechanically mergeable against main, but combined exact-head CI remains pending.
- **#275 and #270:** mechanically mergeable against their integration bases, but their checks remain pending. They do not currently target main.
- **#265 and #268:** CLI, Hosting, Pages, Beta, and dynamic workflows have successful conclusions, while application CI remains queued and mergeability is dirty. Their raw check counts include 20 queued jobs each.
- **#274:** conflicting, with only its dynamic workflow observed. Three queued checks do not establish that the complete application gate set has been scheduled.
- **#269:** conflicting and pending.

No failure, timed-out, or action-required conclusion was observed among this requested current-head check set. Pending checks, known separate security failures, and unresolved review gates remain material. PR base SHA fields can lag branch movement; the current main SHA above was read independently.

## #272 cancellation ordering

Same-head duplicate runs must be evaluated by workflow identity, event/PR context, run number, and attempt. Update timestamps alone are insufficient.

| Workflow | Cancelled run | Other same-head run | Interpretation |
| --- | --- | --- | --- |
| CI | [44510548982](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510548982), number 1486 | [44510549246](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549246), number 1487, pending | Cancelled older run has a newer replacement. |
| Pages | [44510549016](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549016), number 247 | [44510549223](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549223), number 248, queued | Cancelled older run has a newer replacement. |
| Beta | [44510549015](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549015), number 257 | [44510549587](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549587), number 258, queued | Cancelled older run has a newer replacement. |
| CLI | [44510549048](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549048), number 236 | [44510549322](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549322), number 237, pending | The three cancelled check runs belong to the older CLI matrix. |
| Hosting | [44510549243](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549243), number 368 | [44510548951](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510548951), number 367, queued | **The cancelled run is newer.** The older queued run is not a newer superseding replacement. No completed GREEN result is observed. |

## #267 source preservation

The refreshed head is [`57dff1ad7706959bc78861fa4cf9af58952f4643`](https://github.com/djshellshoxxx/GhostPay/commit/57dff1ad7706959bc78861fa4cf9af58952f4643), tree `09649ff5d549a447fc67957c91dd254e7a53bfbd`.

The complete old-head comparison from `c3a693e87053fbe91219f8edfe159a5ec0a37a34` is **23 commits ahead, zero behind, 19 changed paths**. It incorporates current-main source and audit changes, insertion-only ownership claims, and three reconciliation records. None of these three previously reviewed hosting runtime/test files changes:

- `tools/portable-hosting-kit/src/profiles/static-export.mjs`
- `tools/portable-hosting-kit/test/profiles/differential.test.mjs`
- `tools/portable-hosting-kit/test/profiles/static-export.test.mjs`

The complete current-main `c977b5d6723f6822c3b5d86cd6b231712c53c395` comparison is **six commits ahead, zero behind, 17 paths**. Outside `docs/`, only those original three hosting paths differ. Ownership claims are insertion-only in both comparisons: +139/−0 versus the old head, +39/−0 versus main. The new reconciliation documents are under `docs/consolidation/hosting-timestamp-reconciliation-20261119/`.

This establishes preservation of the reviewed hosting source and tests; it does not establish that the refreshed head has completed CI. No tests were run for this source-only comparison.

## #273 published checkpoint readback

Independently fetched commit [`64e192916d66500db8a47a251b4ab17c4d756906`](https://github.com/djshellshoxxx/GhostPay/commit/64e192916d66500db8a47a251b4ab17c4d756906) points to tree `8923964e4dd7aeab68fc92c722cdd23d0e9a40fa` with ordered parents:

1. `b05a71f2859adef19f51f89d1855535b0bb80b53` — records branch.
2. `c977b5d6723f6822c3b5d86cd6b231712c53c395` — current main.
3. `4ff80733a3b36019e2f12fc21a8448e7666b6049` — recovered #259 documentation source.

The earlier independent review confirmed 34 changed paths versus main: 33 documentation paths and `chain-adapters/TODO-VERIFY.md`. Every other main blob remains unchanged; all 19 recovered nonclaim paths exactly match #259; main continuation text and complete ownership insertions remain preserved. The published tree differs from the approved prepared tree `5c0c807f` only through three added and three removed lines in `docs/consolidation/REMAINING_WORK.md`, correcting queue labels and the 287-branch sentence. No runtime, dependency, workflow, contract, or test-source change was introduced.

## Separate security gates remain blocked

The coordinator retrieved and verified [Mythril artifact 14516957113](https://github.com/djshellshoxxx/GhostPay/actions/runs/44487029107/artifacts/14516957113), run 44487029107, job 135432935301, at exact requested and checked-out source `bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a`. This inventory independently read the parsed metadata:

- ZIP SHA-256: `c6bce07d662aec1fa50b2320e452dbe19ed57ca7e575b9f4560240224f2019b9`.
- Full untruncated report: 254,223 bytes; SHA-256 `475b27ec3adae0ccdc2d7fbcd8c30c4a1b819616f65b80f2863de5d7c307cdcb`.
- Five contract result objects all report `success: true` and `error: null`.
- **Ten findings: seven Low and three Medium.** The strict runner exits 1 on findings. This evidence does not establish an analyzer crash.
- This is distinct from the historical eleven-finding record (eight Low, three Medium). No finding is declared resolved or waived by that count difference.

CodeQL workflow 44487024101 returned no artifacts. Its JavaScript job log shows SARIF upload but does not identify the reported high alert; the attempted browser transport failed at `127.0.0.1:8001`. Empty artifacts do not establish a clean result. Exact alert attribution and strict security qualification remain blocked.

## Review boundary

This was a read-only inventory and source comparison. It did not rerun CI, execute tests, merge, deploy, alter branches, or approve an incomplete gate. Earlier local GREEN results and old-head results remain separate from current-head CI. These observations are time-pinned; later branch or workflow changes require a new addendum.
