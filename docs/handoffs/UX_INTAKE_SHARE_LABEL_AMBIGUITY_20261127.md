# Bug repair: share-target payment label ambiguity — 2026-11-27 UTC

Scope: existing shared payment-link parser only. Owner stop-work directive and shared-core privacy clarification remain binding. No archived feature, dependency, contract, wallet interaction, network request, release or deployment change.

## Evidence and ownership

- Base main: `3c9fc0ab518b8a308716dc87cc860424118718eb`.
- All 155 open PR changed-file inventories checked at discovery; no overlap for `packages/ux-intake/src/deeplink.ts` or new regression path. Previous explicit-port repair #424 is merged; preserved. Main rechecked unchanged before claim. The separate generation-67 integration lease was held by another worker; no lease acquired.
- Ownership claim: `73aabd7ae7976d2e237f32adff8365e3de82a340`.
- Regression-first commit: `56590bf636e6a33a5281f61ec6e895b115d6a6cd`.
- Minimal repair: `67d56a1973079e30288827854b8bf59d5046551b`.

## Failure and repair

The parser's distinct-payload map key is derived from safe display text and invoice fragment. Payment URI labels are intentionally excluded from safe display. Distinct valid payment requests with unequal labels (including absent vs present) therefore collide, and the later candidate overwrites the earlier one instead of returning the documented `ambiguous-share` error. The repair uses a local tuple key of safe display, invoice fragment when present, and decoded payment label when present. It does not alter the public display text, error codes, candidate caps, host policy, or original handling of other payload types. No claim of end-to-end Pages reachability or changed payment authorization is made.

## Actual bounded verification

GitHub DNS resolution failed for native checkout. The following complete TypeScript files were copied into an isolated local directory and matched against Git blob hashes from the pinned source:

| Module | Original Git blob SHA |
| --- | --- |
| deeplink.ts | 1c6134dd449cf7d94305e6135dfc3ab7eedb57be |
| payload.ts | 346b89759b44e2861c3e0279c6135ffbbdc062ba |
| address.ts | a26dce85aa5a87b83a388e8fde09912dff88e551 |
| text.ts | bd5877060168acc83d11f1cb9b6fa7b2ebf40e07 |
| result.ts | 74a6a294caef828e72f5b48e2a1a86491b23f677 |

Command: `tsc --strict --target ES2022 --module commonjs --lib ES2022,DOM,DOM.Iterable --outDir baseline *.ts` (TypeScript 5.8.3); repeat to repaired directory after fix. Both compilations passed. Node v22.16.0 assertion harness executed real compiled modules with synthetic inputs; baseline **13/20** passed (seven expected label ambiguity failures), repaired **20/20** passed. Controls include order reversals, title/text, multiple tokens, HTTPS share route, same decoded labels, absent labels, different amounts/assets/chains/destinations/fragments, warning and display secrecy, repeated addresses, host and duplicate-param rejection. Repaired local source blob `0fed56340d3a759bdaad68399784d62b6027a596` matches returned GitHub blob.

The committed Vitest regression mirrors the assertion harness but was not run with the native repository Vitest runner. No repository build, browser suite or independent review was executed in this round.

## Integration gates

Leave draft until fresh exact-head hosted CI, applicable native browser verification, independent review, refreshed ownership and main composition checks, and legitimate integration-lease ownership all pass. Never override the active P14 integration owner. No auto-merge, force-push or release.


## Hosted rerun and current-main qualification checkpoint — 2026-11-27 UTC

- Previously qualified head `5b75ee82ecabc1c82434e0030a7417e0454e1b17`: all five hosted workflows passed, including 27/27 primary CI jobs after the failed full-browser setup was rerun unchanged ([CI 45939871734](https://github.com/djshellshoxxx/GhostPay/actions/runs/45939871734)). Full and lean E2E jobs both succeeded. Independent native package review remains pinned to that head; no new local test execution is claimed.
- Incorporated main `0415d887878ee318bbfca57b3678c332598a32a3` (12 commits ahead of original merge base). Reverse comparison lists no overlap outside additive ownership metadata; main's production parser blob matches the original base. Preserve both parents, the full main registry and exact previously tested production/test blobs. No production change in this reconciliation.
- Open inventory: 156 PRs in partitioned search; 12 competing recent file inventories explicitly refreshed with no owned parser/test/handoff overlap. Exhaustive refresh exceeded connector limits; do not treat subset as final ownership clearance. Generation 67 explicitly released at lock commit `3643783a70c104d68f18f6e34b2e3e8695920d43`; not acquired here.
- Remain draft pending new exact-head CI, independent final composition review and refreshed ownership/legitimate integration lease. The separate pre-existing checksum warning loss remains tracked in comment 7210544377; do not change this repair to address it. All ten exclusions remain binding.
