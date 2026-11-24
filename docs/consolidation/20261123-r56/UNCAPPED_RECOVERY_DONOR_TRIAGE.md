# R56 uncapped historical donor-tree reconciliation

**Grounded source:** complete Git Trees API `recursive=1`, 2026-11-23 UTC. Every tree returned `truncated=false`; these results do not inherit GitHub Compare's 300-file presentation limit. All comparisons below are **Git blob SHA/path identity**, not functional qualification. Main `eb59d93cffed7848c4aac37d0e9650b87239c6da`; root tree `d8aa628cbc531c6969bdf0af621795ceacfc00c3`.

| Tree | Commit / root tree | Blob entries | Identical paths+blobs versus main | Differing shared blobs | Donor-only blobs | Main-only blobs |
|---|---|---:|---:|---:|---:|---:|
| Main | `eb59d93cffed7848c4aac37d0e9650b87239c6da` / `d8aa628cbc531c6969bdf0af621795ceacfc00c3` | 3,981 | — | — | — | — |
| Historical private-scan-lint | `1b010ec910d04df105fd662cc360629cb0a2f5dd` / `51e666f0d111c35dec061218ff7ace0038d3a61d` | 4,535 | 3,539 | 378 | 618 | 64 |
| Historical privacy snapshot | `d6819796a9542acc488b896786faffe83b913d9b` / `4974a8d303880b1a491ae07881cca9d99d6c4cbb` | 5,054 | 3,519 | 400 | 1,135 | 62 |

Among private-scan-lint donor-only paths, 102 are executable app/test candidates under selected `apps/web/e2e`, `apps/web/src`, `packages` prefixes; 212 app/test files differ in place. The privacy snapshot has 134 similarly counted donor-only app/test paths and 230 changed app/test paths. Counts reflect selected prefixes excluding `.md`, `.json`, and `.log` to focus initial review; other extensions and script paths outside prefixes are separate obligations.

**Cross-donor:** The private-scan-lint tree's 4,535 blobs all have a same-named path in privacy snapshot, and 4,452 blobs have matching SHA. There are **83** private-scan-lint path/blobs different from privacy snapshot and **602** snapshot path/blobs different or absent from private-scan-lint. This substantial exact overlap is not permission to mark either branch superseded: inspect the 83 and 602 differences by function, test and release scope first. Do not blindly copy 1,135 historical files onto main or confuse retained docs/evidence with uniquely useful production behavior.

## Focused payment-key recovery proof recovered from historically capped trees

The privacy snapshot's independent reference-decoder suite is **absent from current main**, but the following four path/blob pairs from the snapshot match **byte for byte** the exact open PR heads of #269 `683f8587b8de45448f14aab0539cb07a5f21bce3`, #278 `417f7c71daf8645e1432f2ec8f070110879b80bd` and #372 `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`:

| Relative path | Exact Git blob SHA |
|---|---|
| `scripts/recovery/stealth-export-recover.mjs` | `c33e64770aa71b2d0751ce6104853725b0f2cbd7` |
| `scripts/recovery/stealth-export-recover.test.mjs` | `f773ce1f8918e22f0fe4eb34729e85b2b506c0d9` |
| `test-vectors/stealth-export.json` | `b7064dde0b9c4d3057bd30c66b15dfc9fa80e45d` |
| `test-vectors/generate-stealth-export.mjs` | `13b33645548f66ba5a690b1b6b6cc09fefdd8429` |

Actual `stealth-export-recover.mjs` imports Node crypto and `@noble` libraries, not GhostPay application code; it supplies independent, noncustodial key recovery and explicit inspect/expected-chain behavior, with passphrases read from stdin/prompt rather than argv. Its corresponding test checks independence and encoded file recovery. This is a useful retained functionality whose snapshot source **does not need to be reimplemented** because qualified owners' open PRs already contain identical blobs. It is **not in protected main**, the existing recovery PR #372 is draft/owner-held, and the Mythril/contract/browser security gates remain outstanding. No fund recovery guarantee or automatic refund is established by this decoder alone.

## Disposition and next executable actions

The two wide historical refs stay **unresolved-review-required**. Their full, uncapped tree comparisons prove file identities but do **not** exhaust semantic uniqueness or verify production suitability. Recover remaining unique scoped code only after owner/PR overlap analysis; prioritize payment-key export, invoice expiration and irreversible-transfer cases, and keep security gates intact. Revisit original R38 59 capped donors by a persistent per-donor exact blob/tree matrix, marking `truncated=false` individually and not inferring all resolved from these two.

This checkpoint changes **no application code, no main ref, no PR owner branch, and no release state**. Preserve immutable ancestor/donor records and do not delete branches simply because their trees largely overlap.
