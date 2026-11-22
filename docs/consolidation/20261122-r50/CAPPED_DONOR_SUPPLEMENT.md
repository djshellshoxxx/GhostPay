# R50 supplemental uncapped donor comparisons — 2026-11-22 UTC

Target unmerged owned recovery PR [#372](https://github.com/djshellshoxxx/GhostPay/pull/372), exact SHA `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`. Fetched full recursive Git trees via `GET /git/trees/{commit}?recursive=1`, verifying **`truncated:false`** for every tree. GitHub's usual 300-file compare limit was **not** used for these counts.

| Immutable head | Total blobs | Byte-identical to #372 at same path | Shared path, different blob | Donor-only paths |
| --- | ---: | ---: | ---: | ---: |
| #372 `055d33e042c6` | 5,762 | — | — | — |
| `evidence/ghostpay-remediation-20261120` `6fe35de42587e8da06e2590983b584ffde93d40f` | 5,230 | 4,807 | 182 | 241 |
| `repair/ghostpay-final-lint-20261119` `73d7ccda4fd448dec1682082d633c90de9fa0d7a` | 4,669 | 4,444 | 211 | 14 |

**Important:** Donor-only does not imply a unique functional feature; many 241 paths are historical documents or evidence. Both histories remain semantically unresolved.

### Source-level recovery candidates

- `apps/web/src/lib/sweep.boundaryAudit.test.ts` is donor-only to the remediation branch (Git blob `e3813045c7975bcbd4e1201d65869e6962827c25`) and absent from #372 and main. Directly read the test. It covers direct Sweep authorization suspension, silent revocation, network invalidation, delayed expiry and uncertain post-handoff results, checking `DirectSweepOutcomeUnknownError`, the expected hash and `unknown-after-handoff`. **Compare coverage before importing**: the current recovery test suite may already express some cases under another filename. It is not a production-code merge candidate on its own and has not been executed locally.
- `scripts/contract-analysis/mythril-disposition-check.mjs` (donor SHA `c18bd4337dd18f197fe7d3e287b37691f9fea240`) and `scripts/tests/mythril-disposition-check.test.mjs` (SHA `d8d056f09b84ece35f7c768970a637a929f1285c`) are absent from #372 and main. Direct source labels the disposition check **unwired**; it must not be substituted for an actual red Mythril release gate. The helper requires matching findings and source/runtime bytecode pins.
- `scripts/tests/mythril-completeness.test.mjs` (donor SHA `c3abc1c843b91f20d4497f3c45b48685af3c343e`) tests silent failures, hidden exceptions, missing reports and runtime instrumentation with synthetic Mythril fixtures. It is absent from #372 and main. Other donor-only code includes `packages/contracts/scripts/capture-mythril-evidence.py`; native/hosted compatibility is not proven.

Conveyed exact donor and regression findings to [#372 owner](https://github.com/djshellshoxxx/GhostPay/pull/372#issuecomment-7087410567). The owner has the related security and Sweep paths; do not edit them under the consolidation lock. No real-funds tests, contract gate override, merge or completed safety verdict. The ten unresolved Mythril findings and Tor failure remain explicitly outstanding.

### Follow-on

First compare new donor-only test cases with PR #372's actual existing recovery tests and independently qualify any truly missing assertions. For tooling, reconcile the capture wrapper and CI contract-analysis workflow as one atomic, fail-closed change. Run focused synthetic tests, native runner where available, and exact-commit hosted security/browser acceptance before approval. Keep all historical refs and original source evidence.
