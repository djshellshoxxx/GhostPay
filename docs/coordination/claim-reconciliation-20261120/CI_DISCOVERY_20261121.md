# Reconciliation suite discovery in CI

## Finding and bounded correction

Published #358 at `508531da5665e3649d3f925673a2d8eb9347a2a1` added the canonical suite at `scripts/coordination/reconcile-claims.test.mjs`. The existing CI `rest-0` shard selects only:

```sh
node --test scripts/testnet/*.test.mjs scripts/regtest/*.test.mjs scripts/tests/*.test.mjs scripts/agent/*.test.mjs
```

That command did not discover the new suite. The original independently passing 13-case local result remains valid, but a green run of the original #358 workflow would not by itself execute those cases.

The new `scripts/tests/reconcile-claims.test.mjs` contains a single import of the canonical suite. Node registers the same thirteen tests through this entry point. The assertions, implementation, workflow, dependency configuration and application runtime remain unchanged. The canonical file is outside the existing CI glob, so the glob selects the dispatcher once rather than selecting both files.

Before editing, the worker checked the freshly fetched remote-tracking refs and ownership documents for the exact new path and explicit directory/glob claims. No dispatcher or matching claim was present. The additive task claim records the scan scope and the three owned paths.

## Actual verification

Executed in the isolated successor checkout using **Node v24.22.3**, with no package installation:

| Check | Result |
| --- | --- |
| Import the original module before creating the dispatcher | 13 passed, 0 failed, 0 skipped; exit 0 |
| Run the dispatcher with the Node test runner | 13 passed, 0 failed, 0 skipped; exit 0 |
| Expand the exact existing CI glob with Bash | 29 selected files; dispatcher appears exactly once; canonical file is not selected directly |
| Verify original source and evidence identities | Canonical implementation/test, workflow, snapshot and existing report files remain exact to the parent |
| Source syntax, staged whitespace and repository secret scan | Passed; the complete delta is the dispatcher, this addendum and the additive ownership claim |

Commands from the repository root:

```sh
node --input-type=module -e "await import('./scripts/coordination/reconcile-claims.test.mjs')"
node --test scripts/tests/reconcile-claims.test.mjs
printf '%s\n' scripts/testnet/*.test.mjs scripts/regtest/*.test.mjs scripts/tests/*.test.mjs scripts/agent/*.test.mjs
```

The discovery check additionally asserted that the command in `.github/workflows/ci.yml` exactly matched the four patterns above, every expanded path existed, the new dispatcher was absent from the parent tree, and the canonical file was not independently selected. The original 28-file CI selection gains exactly this one dispatcher.

The full 29-file selection and the full product pipeline were not rerun locally for this two-line dispatcher. CI's Node 22 execution on the published successor remains a separate gate; the Node 24 focused results are not a substitute for it.

## Preserved source identities

Parent commit: `508531da5665e3649d3f925673a2d8eb9347a2a1`. Parent tree: `8ec4d555d364792ac998682f8e5f7f895f8468e0`.

| Unchanged file | SHA-256 |
| --- | --- |
| Canonical reconciler | `8a22ffa7121e9baf3616e581bb716b78eb393bf801e751b7988f09bcd5041291` |
| Canonical thirteen-case suite | `07244246a1ac1cfb67fcd73fde6f7c20f8e3e2d4b7906d32d63eb6266f5d07dc` |
| `.github/workflows/ci.yml` | `478cdd93052a650126f2d0adc79bcc1b1d2258412c4a17e3f4bbfaec889014e5` |
| Frozen `SNAPSHOT.json` | `56663c301cea0d7c9723a5eb1a825341f4dd3d44057075a710ec651a96c0106e` |

The existing 425-branch/125-PR snapshot, generated-report hash and historical CI observations are unchanged. This addendum records the discovery correction separately.

## Related CI observation

Read-only review completed at **8:37 p.m. Pacific on November 20, 2026** (`2026-11-21T04:37:16Z`). All three PR heads still matched the source pins below. GitHub checked out synthetic merge commits; each synthetic commit's complete tree was verified equal to its named PR head.

| PR and head | Actual CI checkout | Observed result |
| --- | --- | --- |
| #350 `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8` | `46762f6668c96675b0dcf237619a3b61f87fc104` | [Core CI 44845144737](https://github.com/djshellshoxxx/GhostPay/actions/runs/44845144737): all 24 jobs passed. Five PR workflows successful; 36 successful check runs, 3 conditional Pages skips; Snyk status successful. |
| #344 `a88157b53d1e0925350d5c8db047eabb4365f4e9` | `e9b1e3eb40f9e29ac78bf7bc65628d221354c155` | [Core CI 44836839436](https://github.com/djshellshoxxx/GhostPay/actions/runs/44836839436): all 24 jobs passed. Five PR workflows successful; 30 successful check runs, 3 conditional Pages skips; Snyk status successful. |
| Original #358 `508531da5665e3649d3f925673a2d8eb9347a2a1` | `f2acada71c3e7f0feecaad403c3a5f93ea244576` | [Core CI 44860643568](https://github.com/djshellshoxxx/GhostPay/actions/runs/44860643568) incomplete; no failing check observed. CodeQL and Snyk successful. The discovered suite gap described above still applied to this original source. |

The #350 web job ran the original coverage and nocov commands: 2,820 coverage tests passed with one skip, then 3/3 nocov tests passed. The #344 web job reported 3,184 coverage tests passed with one skip, then 3/3 nocov tests passed. In both jobs the skipped web case was `src/features/btc/regtest.e2e.test.ts`. Both core pipelines' full and lean browser jobs passed. Pages build and artifact-on-Anvil jobs passed; the publishing-only release gate, deployment and post-deployment smoke jobs were skipped.

These results belong to their recorded sources. A later combined integration candidate requires its own qualification. This worker made no remote changes, dispatched no workflows and performed no deployment.
