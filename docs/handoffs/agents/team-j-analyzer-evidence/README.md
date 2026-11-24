# Native analyzer evidence — 2026-11-16

These are local executions against contract/harness/config source `365a1c38770ba02826d7e039dbeef44e5a966323`.
The corrected Echidna report gate is `5d1e6499ec9781963d7eb2230a4d968ef2a21b7a`. The manifest records exact
source/tool/artifact SHA256 digests. Gzip files preserve unmodified raw bytes; `*.final-report.txt` files are
unmodified final-report excerpts from the completed native Router/Sweep runs. No fuzz corpus or tool binary is stored.

| Gate | Actual outcome |
|---|---|
| Configured Slither 0.11.6 | Exit 0, 34 contracts, 64 detectors, zero results under the configured filters/exclusions. |
| Echidna Router / Sweep | Complete 300,021 / 300,063 calls; eight real properties unviolated and six canaries reached. Each native process exits 1 for its expected failing canaries. |
| Echidna Policy | Extended run killed137 at257,048/300,000 after all five canaries were observed; no final inventory. Sole isolated retry killed by SIGKILL after16.28seconds, before the watchdog fired, at last reported1,526calls. No passing campaign. |
| Mythril 0.24.8 | Router, PolicyRouter and Factory killed137 without complete reports. SweepRelayer reported one LowSWC116 expiry check; direct PolicyAccount continuation reported two. Full gate is not qualified. |

The original extended Echidna wrapper rejected native `passing` statuses and also encountered a tail parse error
because its source file was edited while that shell was still running (overall exit2). This is retained in the raw
artifact. It is not a clean wrapper execution. The corrected gate replay accepts only the completed Router/Sweep
reports and rejects the killed Policy report/status. A replay is parser validation, not a new native campaign.

The sole Policy retry used a frozen launcher, unchanged300,000-test configuration, fresh empty corpus, 900-second
wall budget and a one-second sampled process-tree RSS guard at1024MiB. Its native exit was SIGKILL, with sampled
peak802,368KiB and child maximum RSS812,540KiB. The guard did not cause termination; its exact cause was not
established. The official binary disables most GHC RTS options, so an attempted RTS heap cap could not be used.

Mythril's legacy compiler-list host returned503 here. The preserved launcher changes only py-solc-x's compiler
download host to official `binaries.soliditylang.org`; all analyzer settings and packages remain pinned. Both
Mythril invocations use solc0.8.28, Cancun, optimizer200, transaction count3 and900-second analyzer timeouts.
The first five-contract wrapper had an outer1200-second budget; the two-contract continuation bounded each process
at960seconds. No finding exclusion was added. See the parent handoff for the expiry-finding source disposition.

The evidence establishes executed scopes and failures, not an external audit or release qualification.
