# Test results and qualification limits

Checkpoint: 2026-11-19 11:34:36 UTC. Local candidate `73124433c08c8ef6835f11d03709060c6eea7a3f` includes product checkpoint `35978ab796b7c476eb35dd9ed634ca4ff86ff9b9` and a documentation-only main refresh. Results below retain their actual execution source; identical blobs do not convert an earlier run into a fresh full-candidate run.

## Executed scoped product checks

| Check | Actual result | Source/evidence |
| --- | --- | --- |
| Payment export/scanning/authority selection | 8 files; 300 passed, zero skipped | `676093a3...`; [RESULTS.json](../handoffs/final-payment-export-20261119/RESULTS.json) |
| Network clock reproduction | 9 failed, 4 controls passed, 93 deselected | Original clock runtime; same receipt |
| Complete authority suite after clock repair | 106 passed, zero skipped | Included in the 300-case selection; do not add twice |
| Final checkpoint fixture | 20 passed, zero skipped | `ecc30132...`; receiver preserved, no assertion changed |
| Export/scan type-aware lint | 12 changed paths passed | `ecc30132...`; earlier one unbound-method diagnostic retained |
| Network-egress inventory | 6 passed, zero skipped | Final worker source `2006f211...` |
| Sweep lifecycle before semantic merge | 25 failed, 45 passed | Source overlay `6c8e7de5...`; coordinator reproduction receipt |
| Sweep component after entry repair | 71 passed | `89ec593b...`; earlier 69/70 stale-error failure and entry rejection reproduced and repaired |
| Helper review-authority reproduction | 11 failed, 3 controls passed | Regression source `5fedb1be...`, unchanged helper |
| Corrected helper authority | 14 passed, zero skipped | `1d8445b6...`; independently rerun 14 passed |
| Native consent reproduction | 4 failed, 1 control passed; 14 deselected | `0004bc9d...`, unchanged native helper |
| Final helper, existing sweep and destination suites | 131 passed, zero skipped | `3f6fcb84...`; [receipt](../handoffs/sweep-review-authority-20261119/receipt.json) |
| Native independent replay | 5 passed, 14 deliberately deselected | Exact `3f6fcb84...` implementation |
| Session-entry independent replay | 1 passed, 70 deliberately deselected | Source `acdebc5a...` retains exact `89ec593b...` component |
| Jitter original suite | 13 passed, zero skipped | `c60f7cc3...` retaining #274 |
| Independent jitter probes | 34 assertions passed | Two original failures, two corrected checks, 30 malformed-clock/expiry refusals |

Scoped diagnosis uses the original Vitest configuration with coverage disabled only for the selected run. This does not satisfy project coverage and does not change existing thresholds. Counts overlap; no aggregate total is claimed.

## Coordinator checks at this checkpoint

| Required area | Observed result | Limit or next action |
| --- | --- | --- |
| Clean dependencies | PASS: 721 packages installed by clean npm ci | Earlier offline ENOTCACHED attempt was blocked; worker cached-dependency runs remain labeled as such |
| Dependency graph | npm 10.9.8 graph validation passed | npm 11.9.0 reported override/link false-invalid entries; comparison retained. Do not remove overrides to make that version green |
| Workspace libraries | PASS: all 65 workspace library builds completed again from the successful clean installation | `build-libraries-clean.log`, exit 0; no library source changed during this run |
| Full application build/typecheck | PASS on `a17b300a003ff62eb66dd9e3aa40895e21180393`: full web typecheck, full Vite build and 19-file bundle scan | The earlier TS2322 failure is retained; `2844c97d...` adds an EIP-1559 runtime envelope assertion before existing sender-recovery checks. No application behavior or assertion was removed |
| Lean Pages build and artifact | Pending exact candidate | Requires /GhostPay/, integrity and exclusion checks |
| Full workspace typecheck/ESLint | Not yet complete | Scoped lint passes above are not full-workspace passes |
| Full unit/integration/coverage | Not yet complete | Preserve configured coverage thresholds and nocov suites |
| Foundry contracts | PASS: 490 tests, 34 suites, zero failed/skipped | Current local run; pin compiler/config and source receipt. Does not replace Mythril or real-testnet acceptance |
| Production dependency audit | PASS: zero reported vulnerabilities | Audit is a dated dependency snapshot |
| Development dependency audit | 17 Low; zero Moderate/High/Critical | Keep detailed advisory disposition; not production findings |
| Source secret scan | PASS | Separate release-artifact secret inspection still required |
| Pinned GitHub Actions / tx.origin | PASS: 113 pinned uses; no tx.origin in 40 Solidity source files | Source policy checks only |
| Static security selection | PASS: 111 tests, zero skipped | Full Pages tooling plus lean boundary/egress selection; the six new verifier tests are included, not additional |
| Slither | PASS: 34 contracts, 64 detectors, zero results, exit 0 | Original Medium/High gate flags retained; all 36 compiler source inputs match the candidate. This does not close Mythril findings |
| Mythril/Echidna | No fresh complete candidate pass recorded | Historical finding evidence remains open |
| Browser startup | BLOCKED: Chromium socket() EPERM, SIGABRT before tests | Loopback listener itself succeeded; no scenario assertions ran |
| Firefox, WebKit, mobile, keyboard, accessibility | No final-source pass | Must execute in a supported browser environment |
| Reproducibility | Not yet complete | Build twice and compare exact inventory; separate-machine release requirement remains |
| Hosted CI | BLOCKED/unqualified | Queue and cancellation are not passes |

Coordinator logs were generated under `/tmp/ghostpay-evidence-246ff268d20d`. The coordinator must preserve source identities, commands, exit codes and hashes in the final evidence package; uncommitted scratch paths are not release provenance.

## Required real-browser scenarios

All twelve remain **unverified on the final candidate in this environment**: seller generates/backs up keys; verifies downloaded backup; creates invoice; buyer reviews it; buyer pays on a local chain; seller detects; seller confirms; seller creates receipt; seller sweeps native coin; browser closes/reopens; seller restores keys/history; expired/revoked permissions remain invalid. Completion here is **0/12 (0%)**, because browser launch stopped before assertions. Real local-chain success, mocked browser success and public-testnet success must remain distinct.

## Fresh upstream CI snapshot

See [exact-head-check-runs-final.json](exact-head-check-runs-final.json), captured 11:34:36 UTC.

| Source | Checks observed | Qualification |
| --- | --- | --- |
| Main `c977b5d6...` | 3 queued | Not passed |
| #262 `40b64e8f...` | 14 queued, 1 skipped | Not passed |
| #270 `73545f63...` | 8 queued, 1 skipped | Not passed |
| #272 `63ff40d5...` | 11 queued, 1 skipped, 3 cancelled CLI jobs | Not passed |
| #275 `dc821780...` | 10 queued, 1 skipped | Not passed |
| #276 `f39a9dd3...` | 5 queued, 1 skipped | Not passed |
| Local candidate | No published exact-head run | Not passed |

Historical PR #257 had 36 successful checks and 3 publishing-only skips on its own source. It establishes no pass for the new integrated candidate. The cancelled #272 CLI jobs are linked under [run 44510549048](https://github.com/djshellshoxxx/GhostPay/actions/runs/44510549048); preserve their cancellation status rather than treating them as product failures or successes.

## Publication provenance

Implementation commit identities above refer to preserved local development history. The GitHub connector preserves each tree and ordered parent history while normalizing commit metadata. `PUBLICATION_MAP.json` maps implementation commits to their published identities. Fresh publication, artifact and hosted-check records will be appended after final qualification.
