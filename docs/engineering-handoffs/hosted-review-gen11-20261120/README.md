# Independent hosted qualification review — generation 11

## Result

Both published candidates and their current synthetic merge commits have the exact full Git trees expected by the coordinator. The separate quick-hide feature has completed hosted web build and ordinary-browser rendering evidence. The consolidation candidate's hosted workflows remain queued. Neither candidate has complete hosted CI or current CodeQL/Sonar clearance established by this review.

The final status observations span **2026-11-20 03:16:35–03:16:44 UTC** (19 November, 19:16 Pacific). These are source-pinned observations, not a promise that hosted state remains unchanged. This worker performed read-only Git/API/log inspection and documentation verification; no local application tests, lint, typecheck, builds, dependency installation or browser execution occurred.

## Published source binding

| Candidate | Published head | Synthetic merge executed or available | Exact tree shared with local checkpoint |
| --- | --- | --- | --- |
| [Consolidation #302](https://github.com/djshellshoxxx/GhostPay/pull/302) | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` | `45a48dd80336d53448d43962d86673d86e714562` | `2408882ff9adcc8714c3a21b43c4074975f13c23`, also local `be12cd043dbfc2f562368fd0ccc1a2a8c3f7a22f` |
| [Quick-hide #300](https://github.com/djshellshoxxx/GhostPay/pull/300) | `137628961463fc5abd8b7927b2efe6b18a0a206a` | `67a59cc1d6875ce507dd7af0cb60ef6a5aa1666c` | `da95c2f24426fd9dfd01e38472f07f5dc466cbf9`, also local `c8a2d7ca7c6c1caa96256e1cd57ffd7afaafa9d5` |

The remote refs were read independently, both merge objects were fetched into review-owned local refs, and their complete trees and ordered parents were checked. The merge parents are the corresponding observed PR base and head. Both PRs remained open drafts and mergeable; mergeability is not qualification or merge authorization. Main remained `c977b5d6723f6822c3b5d86cd6b231712c53c395`; canonical #278 remained `417f7c71daf8645e1432f2ec8f070110879b80bd`.

Both inspected successful quick-hide job logs explicitly fetch and check out merge `67a59cc1…`. The job/run metadata associates them with head `13762896…`. Their tree equality establishes the exact file inputs; the result is not transferred to the different consolidation tree. [SOURCE.json](SOURCE.json) records all comparisons.

## Completed hosted work on quick-hide

[Hosting kit run 44662861923](https://github.com/djshellshoxxx/GhostPay/actions/runs/44662861923) completed successfully. Both jobs used Node **22.23.4** and npm **10.9.9**. The logs were independently retrieved and their exact decoded UTF-8 bytes preserved under `logs/` with hashes in [LOGS.json](LOGS.json).

| Original job | Evidence from the completed log | Practical boundary |
| --- | --- | --- |
| [qualify-ghostpay-web, job 136045028663](https://github.com/djshellshoxxx/GhostPay/actions/runs/44662861923/job/136045028663) | `npm ci --ignore-scripts`; library-cache miss followed by `npm run build:libs`; original web build including `tsc --noEmit`; bundle scan of 19 files; packaging/verification; Chromium smoke **1 passed, 0 failed, 0 skipped** | The browser test renders demo routes at root/subpath and the GhostPay app under CSP, checking errors and failed requests. It does not press the quick-hide shortcut or exercise wallet/payment/recovery flows. |
| [kit, job 136045029080](https://github.com/djshellshoxxx/GhostPay/actions/runs/44662861923/job/136045029080) | Hosting-kit lint/typecheck passed; original kit tests **296 passed, 0 failed, 6 skipped** out of 302; demo packaging/verification completed | This lint/typecheck is scoped to the portable hosting kit, not full web or workspace lint. Skips remain in the preserved log. |

The six kit skips are i2pd network-namespace availability, Java I2P runtime availability, browser opt-in, missing net-transport build output in that job, missing web dist in that job, and root-only unprivileged-user switching. The separate web-qualification job actually builds and renders the web artifact. These counts must not be added to local unit totals or presented as the complete browser suite.

The browser-test source at the verified feature tree was inspected to establish this scope. It checks rendering, console/page/request errors, HTTP failures and expected content; it contains no keyboard shortcut or payment acceptance action. The original workflow and relevant test source blob IDs are recorded in [VERIFICATION.json](VERIFICATION.json).

## Remaining hosted state

At the final observation:

- **#302:** six workflow runs queued; the head's latest check-run list contains **11 queued and one skipped**. CI, Pages artifact build/browser acceptance, Hosting kit, beta acceptance, integration and CLI qualification have no completed success established here.
- **#300:** Hosting kit succeeded; CI, Pages and beta acceptance remained queued. The head has **23 queued, four successful and one skipped** check runs. The four successful checks are `kit`, `qualify-ghostpay-web`, `changes`, and `secrets-and-egress`; only the two Hosting kit job logs were inspected in detail.
- No failed or cancelled check was returned in these snapshots. Queued work supplies no passing execution evidence.
- Neither head nor synthetic merge returned a check named CodeQL or Sonar. No CodeQL/Sonar clearance, configured-default-setup state or required branch-protection decision is inferred from that absence.
- The combined legacy commit status says `success` for each head solely because Snyk reports **“No manifest changes detected in 1 project.”** That status does not summarize GitHub check runs, establish a new dependency audit, or clear all security requirements.

The skipped Pages job is explicitly restricted by the unchanged workflow to a publishing `workflow_dispatch` on `main` with `deploy=true`. Its skip on these pull requests is expected and is not a passing release gate. PR validation's actual CI, Pages site and artifact-browser jobs remain separate. No workflow, gate or setting was changed by this review.

[STATUS.json](STATUS.json) contains the concise final metadata with source IDs and observation times. The complete API responses are preserved losslessly as `metadata-initial.json.gz` and `metadata-final.json.gz`; the initial connector PR snapshots are `prs-initial.json.gz`. Each requested page allowed 100 records and returned fewer than 100 with a matching total count. Check-run endpoints retain GitHub's default latest-run selection; this is not an inventory of every historical attempt. [VERIFICATION.json](VERIFICATION.json) records file hashes and validation boundaries.

## Successor handoff

Read [HANDOFF.md](HANDOFF.md) before the next qualification pass. Refresh only the current candidate heads and their existing exact-source jobs. If a source head changes, establish new merge/tree equivalence before reusing any result. Inspect actual failing logs before proposing a repair; keep the original assertions and required checks intact.

Full web lint/coverage, full and lean browser suites, Pages acceptance, current security checks and the active issue #286 privacy integration remain separate requirements. The hosted rendering smoke does not complete quick-hide browser shortcut acceptance. Root retains publication/integration ownership. No remote mutation, workflow dispatch/rerun/cancellation, deployment, release or local application execution occurred in this lane.
