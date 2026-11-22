# R49 targeted security-donor triage — Mythril completeness instrumentation

Checked: 2026-11-22 UTC. Current-main `eb59d93cffed7848c4aac37d0e9650b87239c6da`; owned recovery [#372](https://github.com/djshellshoxxx/GhostPay/pull/372) `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`; historical donor `repair/ghostpay-analyzer-recovered-20261119`, starting SHA `e4d54a682...` (use immutable ref/blob SHAs below rather than mutable branch names).

This is a **source audit and recovery candidate**, not a code merge, test execution, security finding clearance or permission to edit another worker's owned files. The previous R47/R48 uncapped tree analysis found 14 donor-only paths; this round inspected exact contents for three missing paths and exact replacement blobs for two shared paths.

| Path | Donor blob | Main / PR #372 blob | Finding |
|---|---|---|---|
| `scripts/tests/mythril-completeness.test.mjs` | `c3abc1c843b91f20d4497f3c45b48685af3c343e` | absent / absent | Synthetic fixtures test termination telemetry, duplicate/missing report and interrupted/failed execution |
| `packages/contracts/scripts/capture-mythril-evidence.py` | `e0d317c8462e9119a1564106562ca7db5afe92d9` | absent / absent | Passive evidence collector hashes fixed workflow/config/contract inputs; validates strict JSON and telemetry shape |
| `packages/contracts/scripts/mythril-compat.py` | `4604d3055535ac85274c0bf83afdee8e6becbd9a` | `bd78f6b0cecc1f9b43c2a933a44981d38e403521` | Donor includes `MYTHRIL_COMPLETENESS_FILE` output instrumentation absent from current code |
| `packages/contracts/scripts/run-mythril.sh` | `a277ff0061e0d08f9850957f3dd9d96a59ad17ec` | `7ad37efb96f6b5e1f54ffbdfc8a644ef3b03ab4e` | Donor optionally collects telemetry and evidence, current gate warns that JSON hides internal exceptions |
| `.github/workflows/contract-analysis.yml` | `efcb5a9b743002e82df01f2169dbd74b215da461` | `ab4b881de3f586869d1efbaec32799d9082193fd` | Changes are coupled to Mythril driver/wrapper and require separate workflow review |

## Security and reproducibility implications

The donor regression suite constructs a temporary Python module tree and exercises a fake pinned-API Mythril with instrumented `LaserEVM` and `Report` methods. It can detect a missing report or telemetry sidecar in those synthetic conditions, but cannot prove the correctness or exhaustiveness of a real symbolic execution. The current runner requires zero reported Mythril issues but itself warns that a success JSON omits `report.exceptions`. Therefore a hidden internal analyzer failure may not be represented in the gate's existing output. Conversely, donor instrumentation could be tied to a specific Mythril version/private API and regress on upgrades; the complete composition must be reviewed together.

The donor-only `apps/relayer/src/privacy.test.ts` (`68ef282a2a591b3bdcf9bf8c06e27340148975ad`) is also absent from current main and #372, but it targets a historical relayer API; do not blindly import it into the static browser-only Pages beta. Its privacy assertions are candidate follow-up work, subject to ownership/scope review.

**Required next steps:** owner of #372 to compare compatibility wrapper, runner, workflow and test bundle against current pinned Mythril environment; add a minimal regression proving a hidden internal exception fails the gate under the pinned real API or documented equivalent; independently audit the instrumentation and contract finding dispositions; preserve the existing fail-closed nonzero findings behavior. Do not claim this clears the ten existing Mythril findings. Owner notified in [PR #372 comment](https://github.com/djshellshoxxx/GhostPay/pull/372#issuecomment-7086642796).

No owned files were modified. No contract code, private keys, static beta runtime, backend service, security-gate threshold, CI configuration or protected main reference changed.
