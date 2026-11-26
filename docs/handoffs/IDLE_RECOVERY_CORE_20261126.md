# Core idle suspension and signer recovery — 2026-11-26

Status: scoped source port, bounded local qualification and independent AI source
review complete. The coordinator's next step is standalone idle publication and fresh
qualification on the updated #688 parent. The account/privacy continuation remains
separately owned and dependent; no combined privacy acceptance is claimed. Fresh hosted
CI, full/lean browser acceptance and the integration lock remain with the coordinator.
This delegate made no remote write.

## Immutable sources

| Role | Exact commit |
| --- | --- |
| Canonical published F03 base, PR #688 | `39cece11afac78212d9f7331aeb1ab1a5fe8d427` |
| Base tree, identical to local F03 `b159358e` | `529af494cdd8713b2dd0478f3f528260291bd830` |
| Initial claim before edits | `0b3cccfcb6173cbb57431120f5dc9c6a67cba95c` |
| #365 idle/session donor | `45ece45defd2a26cfb7f471ea4654ba4d1d2266e` |
| #544 deterministic boundary/browser donor | `4b077d2b13f956cfcf9bce1726f929cca40c7394` |
| #577 sole-signer recovery donor | `2363943571de84bfd5da0b3f167699f34eb53ce7` |
| Earlier credential-specific idle regression | `7e6089e2e40a2a7daf93961eddef17d3fe8501fd` |
| Main source port | `9816c7c030bd35ec35ec94ff43382ef324fac800` |
| Final runtime source | `0e301a14de8af2eb3085d2bcae73f63332ac2eaf` |
| Reviewed implementation with preserved banner assertions | `14aa1742a7c4f60fbbb851b55581e532e8961e57` |
| Reviewed implementation tree | `0ad292f2b8eeda5b7d2ca3c3df7a343d843742de` |
| Final source with strictly typed test spy | `2936c8e3f91c99b4d86c29f5071f4d0566c938aa` |
| Final qualified source tree | `90ca16eb10eb520dfdaafde6d3648b4bc789090c` |

Branch: `finish/idle-recovery-core-20261126`. These are narrow source ports, not
whole-history merges of mixed donors. All original donor refs remain unchanged.
No claim is made that mixed #365/#372 history or every outstanding branch is complete.

## Scope and reconciliation

The coordinator expressly authorized independently useful shared-core idle/recovery
completion under the current owner clarification. No excluded feature, dependency,
workflow, contract or experimental capability is activated. W4 minimal invoices and
W5's independent verification work remain outside this branch.

- The clock lease survives settings/service rerenders, checks both clocks at lifecycle
  and sensitive-operation boundaries, and rejects stale timer and custody completions.
  Suspension revokes the session revision and wipes tracked async copies synchronously
  before observers run. Observer failures cannot suppress later cancellation observers.
- A proven surviving copy permits disposal. A sole signer or unconfirmed copy stays
  boxed in memory with ordinary authority suspended. Only encrypted save/export and
  exact-match backup verification use `captureSessionBackupGuard`; normal import or
  vault unlock installs fresh active authority. Saving/verifying alone does not unlock.
- Current `verifyCredentialForCurrentSession`, `requireSecretExportAuthorization`,
  full loaded-key identity verification on vault deletion, durable backup-operation
  ownership, verified-copy gates and beforeunload protection are retained. The older
  donor versions that remove or weaken these controls were not copied.
- `captureSessionVersionGuard` remains revision tracking for recovery, not permission.
  `captureActiveSessionVersionGuard` permits empty payer contexts but refuses suspended
  authority. `captureSessionGuard` and private-key borrows still require active keys.
  Tag unlock captures active authority inside its existing `finally`-protected scope,
  so early rejection also wipes the supplied viewing-key bytes.
- AppShell preserves the current wallet disclosure provider/revision, clipboard cleanup
  and copied-backup notice. SellerKeys adds only suspended-state visibility around
  sharing/registry content; its newer operation controllers and recovery forms remain.
- Each of four catalogs retains every base key and changes only ten pinned donor
  values: five new idle/error keys and five directly affected existing policy messages.
  The old signer-loss catalog key remains classified for compatibility but is no longer
  rendered by idle locking. Current unrelated privacy and recovery messages survive.
- The existing clock regression group remains, with deterministic donor cases added.
  The earlier credential-specific idle rejection case and pre-idle signer-only banner
  assertions are retained alongside the newer recovery cases. The 14-case browser
  fixture is byte-identical to #577; its fresh-profile signer recovery block is added
  to the current devnet fixture without replacing newer infrastructure or unrelated
  cases. The donor's 64 generated wake schedules remain in its original ref and were
  not imported or run in this port.

## Shared interfaces

`/root/artifact_review` owns the account/privacy continuation, AppShell's presentation
boundary import/provider mounting, wallet hook consumers, and TagVault access revision
notifications. This worker owns the session/vault APIs, idle/routing hunks and TagVault's
active-capture/try-finally seam. The boundaries were agreed before overlapping edits.

The wallet hook must pin its own revision/controller before calling active session
capture, then reject any synchronous invalidation that the expiry check caused. An
empty session is valid for a new payer action; it must not revive an old UI callback.
The later privacy composition requires its own interface review and fresh qualification.

## Executed qualification

An independent `npm ci --offline --ignore-scripts --no-audit --no-fund` succeeded.
The affected builder compiled its 17 prerequisite libraries, and the existing indirect
web dependency `@ghostpay/relayer-guard` was built separately. No lockfile changed.

| Check | Actual result |
| --- | --- |
| Session idle, AppShell clock and App suites | 3 files, 107 tests passed |
| Existing session, keyVault, credential, SellerKeys and security-key suites | 5 files, 115 tests passed |
| TagVault existing and idle-boundary suites | 2 files, 19 tests passed |
| Total distinct selected unit cases | 241 passed |
| Restored pre-idle banner assertions | Focused case passed again; 16 other App cases unselected in this rerun |
| Web TypeScript | Passed after final runtime/test edits |
| Typed ESLint over every changed TS/TSX file | Passed |
| `node scripts/i18n/check.mjs` | 4 catalogs, 0 errors, 853 draft/fallback warnings |
| Playwright idle fixture collection | 14 tests collected; no execution pass asserted |
| Committed-secret scan and whitespace checks | Passed |

Commands from `apps/web`:

```sh
npx vitest run src/lib/session.idleLock.test.ts src/AppShell.idleClock.test.tsx src/App.test.tsx --coverage.enabled=false
npx vitest run src/lib/session.test.ts src/lib/keyVault.test.ts src/lib/keyVault.secretExport.test.ts src/views/SellerKeys.test.tsx src/i18n/securityKeys.test.ts --coverage.enabled=false
npx vitest run src/lib/tags.idleSession.test.ts src/lib/tags.test.ts --coverage.enabled=false
npx vitest run src/App.test.tsx --coverage.enabled=false -t 'retains an unbacked invoice signer'
npx playwright test e2e/idle-session.spec.ts --project=desktop --list
```

Strict lint initially rejected the donor App test's untyped signer spy for two
`no-unsafe-return` errors. Typing it as `vi.fn<() => void>()` changed no runtime or
test behavior. The exact sole-signer case, web TypeScript and typed ESLint over every
changed TS/TSX path were then rerun and all exited zero; the final processes were
reaped before qualification. This one-line test correction is the only code change
after the reviewed implementation above.

Independent reviewer `/root/help_review` approved implementation `14aa1742`, then
extended source approval to `2936c8e3` and its final qualified tree after checking the
single test-spy typing change. The reviewer verified credential/delete preservation,
the prior wallet/journal/Pay/Sweep/disclosure/camera/request-file blobs, exact donor
locale and browser additions, the earlier credential regression, and restored pre-idle
banner assertions. No production finding remains in this slice. This is AI source
review, not an audit or fresh browser/hosted evidence.

## Remaining gates and limits

No fuzz/mutation/exploit campaign, remote target, live wallet or real funds were used.
The whole unit suite, production full/lean builds, browser execution and the added
devnet restoration case were not run by this delegate; root owns qualification of the
combined candidate. Prior donor evidence is not presented as fresh evidence.

Retained keys still exist in this tab's memory. Someone controlling the tab can use
the existing encrypted recovery path when no earlier credential exists. This preserves
recoverability; it does not introduce new authentication or claim that retention is
equivalent to a wiped vault. The user guide states this limit explicitly.

Root should publish the standalone idle candidate, qualify its exact canonical head
through the current hosted and browser gates, and integrate through the shared lock.
The separate privacy continuation may depend on that candidate; its agreed AppShell/
TagVault/log reconciliation and combined acceptance remain separate work. Original
mixed branches stay preserved until their remaining approved source and archival
portions are dispositioned. Publication must not add mixed donor parent SHAs.

## Canonical request-file update adopted

The coordinator advanced #688 from the original base to
`521a917da4dabe02d5e0075e750c7b4ec10e7d5f`. This worker fetched that exact head and
normally merged it as `de23909f1dd9d005cd836241782b434420b995ab`, tree
`ddb8ca841595cababdc09f9457e463c77ccaf873`. Its three browser fixtures and request-file
qualification handoff were adopted byte-for-byte. They update current Scan/request-file
labels and drive the already-required wallet disclosure interaction; no runtime changed.

The only conflict was `docs/ai/ACTIVE_WORK.md`. Both appended ownership histories were
retained. This worker also corrected its own earlier premature lint summary to point to
the actual strict-lint repair and completed zero-exit rerun. Parent ownership and
qualification records were unchanged. All idle runtime/tests remain the reviewed source
above; the incoming browser fixtures retain the coordinator's prior review and gates.
No new browser execution or combined privacy pass is asserted by this merge.
