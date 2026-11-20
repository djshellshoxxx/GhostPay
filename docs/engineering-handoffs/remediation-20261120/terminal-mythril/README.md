# Terminal evidence: cancelled d74 Mythril campaign

The actual job [135980874961](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709093/job/135980874961) ended **cancelled**, not passed. The complete partial evidence artifact was recovered and verified against GitHub's archive digest. The retained report is not truncated, and all recorded per-target stdout/stderr/completeness hashes match.

- Source and checkout: `d74af79ebabdc8cead843361c3497b46d8c421f9`.
- Artifact: [14590221998](https://github.com/djshellshoxxx/GhostPay/actions/runs/44643709093/artifacts/14590221998), 40,348 bytes, SHA256 `fcd3ca3ec7d216ae4abe3e401e9d9f9c1d1c2e3d888803028165e51acd9f8a9a`.
- Four target records are complete; `PolicyAccountFactory` has no completed record. Overall `completed` is false and terminal runner exit is null.
- Router and PolicyRouter report zero issues. SweepRelayer reports one Low SWC116 record; PolicyAccount reports two Low SWC116 records. These three source locations/PCs correspond to C1–C3 of the existing generation-4 finding assessment. This follow-up does not replay new symbolic traces, dismiss findings, or infer a full campaign count from partial results.
- Mythril is 0.24.8; solc is 0.8.28; optimizer is enabled with 200 runs; EVM is Cancun; transaction depth is three and per-target execution budget is 900 seconds. The artifact records actual executable hashes and selected compiler identity.
- Contract/analysis inputs did not change from d74 to canonical `417f7c71`; this does not make the cancelled run an exact417 qualification.

The log establishes cancellation but not its initiating mechanism. A new canonical [Contract analysis run44650172375](https://github.com/djshellshoxxx/GhostPay/actions/runs/44650172375) was queued at observation. Finish the current exact-source analysis and apply the existing strict gate. Neither the earlier completed ten-record report nor this three-record partial report is a clean final result.

`RECEIPT.json` separates partial findings, missing work, exact configuration and source identity. `d74-mythril-cancelled.zip` retains the original downloaded artifact. Compressed job logs are decoded public GitHub log text with a normalized final newline; their file hashes describe retained bytes. `pr292-pages-build.log.gz` records the completed814-tree payments-disabled Pages build and new gate, not later combined source or deployment.
