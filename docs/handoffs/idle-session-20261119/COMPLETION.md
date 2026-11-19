# Sleep-aware session security completion

## Source and scope

- Main observed at start: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
- PR #227: `613667be4eeb132c7d21ccd06c627f9a7144d85b`, already an ancestor of the integration candidate.
- Integration base: PR #238, `198aa5baff22272453733a0f3dcfcac0e0994eec`.
- Feature branch: `chatgpt/ghostpay-idle-lifecycle-20261119`.
- This task owns sleep-aware inactivity, idle session revocation, lifecycle regression coverage and their consolidation.
- No production deployment or release is authorized. Main merge requires all applicable gates.

## Initial completion matrix

| Requirement | Initial evidence | Remaining work |
| --- | --- | --- |
| Dual-clock expiry and rollback | PR #227 source and 10 clock cases are present by ancestry | Re-execute and extend invalid-observation coverage |
| Expired activity cannot re-arm | `arm()` unconditionally resets the clock and `locked` after checking expiry | RED regression and reject expired activity |
| Session-bound timer callbacks | Effect has no generation/active guard and does not subscribe to replacement | RED regression for queued/retired callback and unlock/replacement |
| Clock snapshots remain valid | Activity samples each clock twice; the second sample can poison its baseline | Single validated observation per activity; invalid/negative/overflow regressions |
| Immediate protected-operation revocation | Recoverability is awaited while session access and revision remain unchanged | Suspend normal key borrowing and invalidate pending operation generation synchronously |
| Sole-copy recovery | Existing code keeps sole-copy keys loaded | Preserve retained keys for encrypted backup/verification only; require normal reload to resume protected use |
| Real-browser lifecycle | Existing evidence is jsdom only | Deterministic Chromium lifecycle cases in both profiles; distinguish simulated from actual sleep |
| Consolidation | #227 already included in #238 | Integrate verified delta, validate combined candidate, preserve unrelated source |
| Main qualification | #238 has failed CI/security gates | Recheck exact candidate; no merge while required gates fail |

## Initial integration gate snapshot

Independent read-only review of #238 found failed web-unit, full/lean browser, lint, script-test,
aggregate TypeScript, Mythril and CodeQL alert checks. Workspace typecheck/build and Pages artifact
checks passed on their own source. These are observations of the starting candidate, not results
of this completion work. Exact commands, source identities, findings, independent review and final
consolidation outcome will be recorded here after execution.

## Feature checkpoint before the qualified-target port

The final clock/lifecycle suite passed **68/68**, with zero failures or skips, against
AppShell blob `5aefc993c048b1f33d13e75b17c30405f39ab7c3` and test blob
`db2b68ac4d6f7fbe41965c9ac2e7a77f95f30e84`. The final session-revocation suite passed
**16/16** against session blob `89e07663e3534eeada13d7af8aef64301b131f7e`.
Independent clock/lifecycle and vault/session source reviews found no remaining
feature-specific source blocker. This does not establish browser or combined acceptance.

The coordinator's combined ten-file run passed nine files and 145 tests before the
idle-clock worker received `SIGKILL` (38 tests unfinished). The isolated final clock
run then passed in 22.80 seconds with Node 22.23.4, 896 MiB old-space, one worker and
coverage disabled. Its log SHA-256 is
`7076e040cbf4ed22523eb79857ddfc7eb155130afd1fd21c61ff29068015ebe0`.
The kill cause is unproven. Three local TypeScript attempts and the first browser
startup also exited 137 without a TypeScript source diagnostic; the browser did not
launch and executed zero application assertions.

The source library build, locale checks, secret scan, pinned-action check and tx.origin
check passed on this checkpoint's working tree. These results must not be substituted
for execution on the final integration target. The dependency installation attempt
was killed; local dependencies came from an exact-lockfile-matching cached checkout,
and all library outputs were subsequently rebuilt from source.

## Integration target change

During execution, PR #242 appeared at
`ab4e0da2cfe2a18adac0424896fba0b40fac81a8` on
`integration/ghostpay-qualified-fixes-20261118`. It contains current main
`58d89b39b27a66454ebf392bcd35d5c68b57b2f8`, #227 and the separately reviewed invoice,
checkpoint and beta-log fixes. Its relevant hosted unit, browser, typecheck, lint,
Pages and CodeQL checks passed. #242 and #238 are divergent candidates; #242 explicitly
keeps #238's broader recovery work separate.

The chosen target is now #242. Preserve this #238-based feature checkpoint for
provenance, then port only the idle-session delta onto #242. Do not merge the entire
#238 ancestry into the narrower candidate. Preserve #242's existing transport,
invoice and checkpoint fixes, tailor shared-file context to APIs that exist there,
and execute and independently review the actual combined result before any main merge.
