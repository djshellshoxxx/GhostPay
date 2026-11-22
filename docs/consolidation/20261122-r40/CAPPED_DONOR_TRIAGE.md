# R40 supplemental uncapped donor analysis — 2026-11-22 UTC

Performed **actual recursive Git-tree comparisons**, not GitHub's 300-changed-file compare summary. Baseline main commit `eb59d93cffed7848c4aac37d0e9650b87239c6da`, main tree `d8aa628cbc531c6969bdf0af621795ceacfc00c3`. Recovery #372 commit `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`, tree `65e5cc6fdb7ab3337951ba0b0b58e87b71df095b`. All four fetched Git-tree objects reported `truncated:false`. A count of same Git blobs is **not** a behavioral/security pass.

| Full donor history | Exact head | Git tree | Paths equal recovery | Donor-only | Same-path differing | Recovery-only |
|---|---|---|---:|---:|---:|---:|
| `repair/ghostpay-native-fee-recovered-20261119` | `cbc96840c3dc4fede90afff55b4dfd94f66784da` | `bec093489267b2a7cd1f756120ccfd4cd2eafb2e` | 4,411 | 11 | 216 | 1,135 |
| `snapshot/ghostpay-privacy-8be15289-20261120` | `d6819796a9542acc488b896786faffe83b913d9b` | `4974a8d303880b1a491ae07881cca9d99d6c4cbb` | 4,864 | 14 | 176 | 722 |

Against main, the first donor has 3,532 identical / 721 donor-only / 385 different / 64 main-only blob paths; the privacy snapshot has 3,519 identical / 1,135 donor-only / 400 different / 62 main-only. The historical `compare` API capped both results at 300 paths. The uncapped tree evidence therefore expands actual recovery assessment without falsely declaring the histories redundant. Both remain **semantically unresolved**; do not count them as finalized or merge them wholesale.

## Source-only paths absent from recovery

The native-fee donor's 11 source-only paths are `apps/relayer/src/hardening.test.ts`, `apps/relayer/src/privacy.test.ts`, `packages/cli/src/global-switches.test.ts`, `packages/cli/src/observation-input.test.ts`, `packages/cli/src/reconcile-stored-only.test.ts`, `packages/cli/src/untrusted-echo.test.ts`, `packages/confidential-contracts/contracts/mocks/ReturnBombStealth.sol`, `packages/relayer-guard/src/limiter.abuse.test.ts`, `scripts/contract-analysis/mythril-disposition-check.mjs`, `scripts/tests/mythril-disposition-check.test.mjs`, `scripts/tests/policy-predeploy.test.mjs`.

Privacy snapshot has these same 11 paths plus `packages/contracts/scripts/capture-mythril-evidence.py`, `scripts/tests/mythril-completeness.test.mjs`, and `scripts/tests/mythril-evidence.test.mjs`. These are relayer/CLI, test/mocks and analyzer evidence tooling, not donor-only Pages UI source files. Do not read this as proof that no unique behavioral fixes remain in the 216/176 differing common paths. [PR #468](https://github.com/djshellshoxxx/GhostPay/pull/468) now separately owns new Mythril artifact summary tooling; avoid duplicating or waiving analyzer findings.

## Concrete source-level safety divergences

Compared three relevant privacy-snapshot browser modules against the exact #372 recovery blobs:

1. `apps/web/src/lib/relayerClient.ts`: donor `419e5624c35dde3b5b1c4e94d2a1d09638d7b31f`, recovery `696ad519fe1e5b2e235b951083a41baceec58d16`. The older donor places `client_queue_full` in the definite prebroadcast refusal list; recovery omits it. The uncertain outcome after queueing must not become an assumed-safe retry through an old-code import.
2. `apps/web/src/lib/paymentKeyExport.ts`: donor `a2d67e2a7373546574c27c327e5a8beecb9a3bbd`, recovery `443e62404c232922a3a5f485275dcc86cfd1c77f`. The donor attaches an account address to the `contractAccount` user-facing error payload; recovery omits that value, reducing incidental sensitive-data exposure.
3. `apps/web/src/lib/clipboardPrivacy.ts`: donor `cfb9e13bb3548d48f65b2578a76d2888553a0b35`, recovery `a9d84e38c348e4c2b238f52cf506263117babc13`. Recovery adds a freshness callback and rejects queued clipboard writes that are no longer current. The donor does not have this check. Preserve the newer stale-session privacy protection.

**Disposition:** two capped GitHub API comparisons now have complete structural tree assessments, but both branches remain unresolved for semantic donor-only behavior/tests and required safety gates. No code port, local runtime test, or CI qualification was attempted. No claim that Mythril or refund/recovery blockers are cleared. Follow-up: inspect specific differing source/test functions in owner-approved scopes, carry uniquely useful safe fixes into isolated PRs, and qualify against exact combined source.

Provenance: [R40 semantic ledger](SEMANTIC_DISPOSITIONS.json), [R40 handoff](HANDOFF.md), [recovery #372](https://github.com/djshellshoxxx/GhostPay/pull/372).
