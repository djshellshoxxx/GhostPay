# Final live status after PR #336 publication

Observed 2026-11-20T19:47:05.129Z through 2026-11-20T19:47:08.292Z. All 12 source/base pairs match their pins. Main remains `aa3df1cb37274fae73af0ca957183c15c51b62d3`; the control ref remains `849b20733e6fd396a1ed354b284335019500946b` (the previously verified released generation 8 object). No candidate is ready for promotion.

| PR | Successful checks | Queued | Running | Failed | Conditional skips |
| --- | ---: | ---: | ---: | ---: | ---: |
| [#307](https://github.com/djshellshoxxx/GhostPay/pull/307) | 23 | 11 | 2 | 0 | 3 |
| [#321](https://github.com/djshellshoxxx/GhostPay/pull/321) | 17 | 17 | 0 | 0 | 3 |
| [#325](https://github.com/djshellshoxxx/GhostPay/pull/325) | 11 | 20 | 0 | 0 | 3 |
| [#326](https://github.com/djshellshoxxx/GhostPay/pull/326) | 8 | 20 | 0 | 2 | 4 |
| [#327](https://github.com/djshellshoxxx/GhostPay/pull/327) | 5 | 20 | 0 | 2 | 4 |
| [#328](https://github.com/djshellshoxxx/GhostPay/pull/328) | 14 | 20 | 0 | 0 | 3 |
| [#329](https://github.com/djshellshoxxx/GhostPay/pull/329) | 8 | 20 | 2 | 0 | 1 |
| [#331](https://github.com/djshellshoxxx/GhostPay/pull/331) | 0 | 10 | 1 | 0 | 1 |
| [#333](https://github.com/djshellshoxxx/GhostPay/pull/333) | 0 | 8 | 0 | 0 | 1 |
| [#334](https://github.com/djshellshoxxx/GhostPay/pull/334) | 0 | 12 | 1 | 0 | 1 |
| [#335](https://github.com/djshellshoxxx/GhostPay/pull/335) | 0 | 8 | 0 | 0 | 1 |
| [#336](https://github.com/djshellshoxxx/GhostPay/pull/336) | 0 | 5 | 0 | 0 | 1 |

Every candidate still has pending work, and the final TypeScript/contracts aggregates are absent from all twelve returned lists. These counts represent observed progress, not a complete expected gate inventory. Collection totals were verified; all returned checks, workflows and classic status items are retained in [LIVE_STATUS.json](LIVE_STATUS.json), with repetitive repository/account payloads omitted. No queue reason or absence of branch protection is inferred.

#326 retains the two browser failures explained in the [earlier detailed review](hosted-gate-final-r2.md). #327 has now completed the corresponding jobs with the same failures: [Pages](https://github.com/djshellshoxxx/GhostPay/actions/runs/44788918328/job/136471067457) reports 6 passed, 5 failed and 5 not run; [beta](https://github.com/djshellshoxxx/GhostPay/actions/runs/44788918281/job/136471066552) passes library/CLI stages and fails all three browser cases. The original logs confirm the same missing Prepare payment / wrong-chain message symptoms.

Both #327 jobs checked out `741f1e72697666a6e7cf2ab59f78a1276b5cd364`; GitHub commit metadata verifies its tree exactly equals frozen #327. [PR327_HOSTED_FAILURES.json](PR327_HOSTED_FAILURES.json) preserves full original logs, hashes and counts. This provides actual failure evidence for #336’s immediate base. The earlier claim that no exact required-v1.1 base run was available still applies to that older base; it is a different source.

[Corrective PR #336](https://github.com/djshellshoxxx/GhostPay/pull/336) remains a separate frozen, reviewed candidate with passing original web typecheck/lint and discovery-only local browser collection. Its hosted jobs are pending. The original failed runs remain failed; no corrected acceptance, main merge, release or deployment is claimed.
