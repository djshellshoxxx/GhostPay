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

### Port provenance and conflict decisions

- Preserved local checkpoint: `b2fb5f20455ca2823739f7a29ed784ec94e049c2`.
- Preserved published checkpoint: `7e6089e2e40a2a7daf93961eddef17d3fe8501fd`, branch
  `chatgpt/ghostpay-idle-lifecycle-20261119`, complete tree
  `64ae98aa2616d52ee213d040f33c6a8d896fc83b` (exact local/remote equality).
- Qualified port branch: `chatgpt/ghostpay-idle-lifecycle-qualified-20261119`, based on
  #242 `ab4e0da2cfe2a18adac0424896fba0b40fac81a8`.
- `AppShell.tsx`: keep the target's frame/origin behavior; do not import #238's separate
  frame/origin infrastructure. Retained-session navigation protection applies only
  while suspended and skips a confirmed external copy. Ordinary unlocked navigation
  behavior is unchanged from #242.
- `SellerKeys.tsx`: keep the target's absent Spec 18 widgets absent. Suspend its existing
  public-key, archive and registry UI while preserving encrypted recovery and unlock.
- `ACTIVE_WORK.md`: keep every existing #242 claim and append this task's updated claim.
- Session and vault production changes apply only idle revocation and encrypted backup
  guards. The new regression uses #242's existing private-key/payment-key boundaries;
  the unrelated Spec 18 credential API is not imported merely to run its #238 assertion.
- Only four new security-message keys are added to each existing locale and its key list.
  No #238 dependency, frame/origin, recovery, build, workflow or package-tree delta is imported.

The port uses #242's unchanged lockfile (SHA-256
`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`). The earlier
#238 installation and its test results do not qualify this target. Source library
rebuild and combined checks follow the target-specific dependency setup.

### Integration regression: cached checkpoint authority

Independent integration review found that #235's private-checkpoint cache used the
public session snapshot as its authorization token. Suspension intentionally retains
that snapshot, so cached reads/writes/clears avoided the newly guarded key lender.
Two new tests reproduced the problem before correction (**2 failed**, 13 unrelated
tests filtered). One test also models an overdue promise continuation before any
timer or lifecycle event runs.

The correction calls the existing active-session guard before returning the token;
rejection returns `undefined` through the cache's existing invalidation path. It
borrows no secret and changes no HKDF, slot format, migration, storage or scan algorithm.
After correction, `scanCursorSlot.test.ts`, `scanCheckpointPrivacy.test.ts` and the
ported `session.idleLock.test.ts` passed **38/38**, zero failures or skips, in 22.76 seconds
using Node 22.23.4, 896 MiB old-space and one worker on the #242 dependency tree.

- Corrected token blob: `d201b3b7a7bf715b65476be8b7e1d8d1655fcb0e`.
- Regression blob: `319aa95b3463a8fc02974e691a05c4e806735fb7`.
- RED log SHA-256: `c80bbec0dbf30b04b45f8233d8cc37b2190d29f7253d28028c151e50dbccd2a8`.
- GREEN log SHA-256: `a8fc1c89f465a26c7ba701ea1404af8ce6fdecd4167c2ffdca5cbba1f823b6b2`.

The complete source library rebuild passed in 483.834 seconds. Its package/build
inputs are unchanged from #242; application edits were present and explicitly listed
as dirty in the execution record. The copied dependency metadata has 790 entries,
zero version mismatches and no missing applicable external package entries. Absent
optional packages target other operating systems or CPUs. Full combined gates remain
pending and must use the published runtime commit.

### Current main and successor candidate

While this task was validating the port, another workstream merged #242. GitHub
confirms merge commit `e454de6abfefda70d82784fafc1d8949b277c334`, with parents
`58d89b39b27a66454ebf392bcd35d5c68b57b2f8` and
`ab4e0da2cfe2a18adac0424896fba0b40fac81a8`. Its tree is exactly
`eb8fc38c83a67fe3b1b4889ebd9371f5fddbbd17`, the #242 source used for this port.
No source or dependency rebuild is required solely because of that ancestry change.
The original #227 is now reachable from main; the completion fixes in this task are
not yet claimed merged.

Create `integration/ghostpay-idle-session-completion-20261119` from that main and merge
the qualified feature normally, preserving both parents. Open a successor integration
PR against main, rather than updating closed #242 or importing unrelated #238 work.
The previous candidate's green checks do not qualify the new head. The user-required
strict analyzer/security gates remain binding even if repository protection is disabled.

The six-file clock/shell/session/vault run on the port passed **150/150**, zero failures
or skips, in 51.35 seconds (52.126 seconds including the wrapper). It used the original
68 clock cases plus `App`, `AppLean`, shell i18n, session and vault tests. This is
separate from the 38-test checkpoint/privacy/idle run above; full-suite execution and
actual Chromium acceptance remain required.

### Final checkpoint lender correction

The independent integration reviewer identified a second observation inside the
viewing-key lender: expiry could replace the wallet between matching its public ID
and borrowing its viewing key. Two more regressions failed before correction in
2.64 seconds: one observed a callback using the replacement copy; the other observed
an exception where the lender's contract required `undefined` after suspension.

The lender now retains the matched public snapshot, handles borrowing refusal, and
compares the snapshot again before invoking the consumer. A mismatched copy is wiped
by the existing `finally`. No spending or signing key is borrowed, no new secret API
is added, and consumer exceptions still propagate after wiping. The clock/lifecycle
reviewer independently approved the exact final runtime and regression blobs.

- Final token/lender blob: `4997190d33dceca56b2a9ec4f24238fec44ce0dd`.
- Final checkpoint regression blob: `3565f11dd4ef6cee70789fa26c9da22e4230a03d`.
- Final three-file result: **40/40 passed**, zero failures or skips, 13.10 seconds
  (13.913 seconds including the execution wrapper).
- Together with the disjoint six-file run, the focused port checks cover **190 passing
  tests across nine files**. The 40-test run supersedes the earlier 38-test checkpoint
  result; the overlapping counts must not be added together.

These are feature/integration prechecks. The successor's full unit, browser, build,
lint, typecheck, Pages and security gates remain separate qualification requirements.
