**Where the checks ran:** in the agent container, on the integration of every fix cluster: A, B, B2, C, D, E, G and H, each with its review rounds, plus `9a00a7a` and `2fcab7f`. The machine has 4 vCPUs and Node 22.22.0.

- **Build and static checks:** `build:libs`, the all-workspace typecheck and the all-workspace lint pass on that integration.
- **Each fix cluster:** the reviewer ran the area's checks and re-ran the new tests against the base, where they fail. Where a reviewer ran the full web suite with coverage, coverage stayed above the thresholds (for example 91.82/87.22/93.57/95.72 after round CR2, against 90/85/90/90).
- **Known slow tests:** two time-limited web tests, the 1M-log scanner fuzz and the ReconciliationLedger "saturated backup" test, fail under load in this container and pass in CI. Their code is unchanged by the fixes. See `scripts/dev/README.md`.
- **Integration commits:** `9a00a7a` (idle lock and error boundary) and `2fcab7f` (unlock confirmation) add tests that fail before the change.
- **The authority** for the full combined suites (every package, the web suite with coverage, scripts, PHP and kit) is the GitHub CI run on the PR head that contains this report.
- **Failing before the fix:** every fixed finding has a test that fails on the code before the change. The fix commit messages name those tests, and the reviewer re-ran them against the base.
