# Privacy browser lifecycle repair and continuation evidence

20 November 2026 (Pacific). Coordinator: `539818ee134f-root`.

## Result and source

This bounded successor of [PR #352](https://github.com/djshellshoxxx/GhostPay/pull/352)
repairs wallet-dialog focus restoration and updates two browser expectations to
the existing privacy contract. It preserves #326 / #327 / #336 / #348 / #352,
including the latest journal-reconnection corrections. It is not an independent
main merge. Only four application/test paths change.

| Source | Commit |
| --- | --- |
| Parent #352 | `28f1e4bd0960a0d57ba2636b6456e7c1b3096e94` |
| Ownership claim | `140cb5e2` (full commit in history bundle) |
| Test-only reproduction | `4d8828cd205ad45b095c0a1e01e6c36282da207e` |
| Implementation | `14c52cad022193289a64ba1dc2848b6a55ab822a` |
| Implementation tree | `329ab28554624d7a53bcd6da7d99a5680ef25c40` |

Later documentation commits leave the reviewed application/test blobs unchanged.
**Keep draft:** whole-web compiler, typed lint, native browser and applicable
hosted gates remain incomplete. No workflow, timeout, coverage threshold,
dependency, wallet-consent or payment runtime changed.

## Corrections

### Dialog focus restoration

`WalletDisclosure.tsx` treated any connected, non-hidden, non-inert HTMLElement
as a usable opener. The body, document element, disabled controls and elements
that became nonfocusable could receive a failed focus attempt without fallback.

The correction excludes body/root and disabled controls, attempts other eligible
openers, verifies actual focus, and otherwise focuses the existing neutral privacy
control. The replacement-dialog check remains first, preserving new-dialog focus
ownership. Normal opener restoration and the focus trap are unchanged.

Seven real-presenter regressions cover body, document element, disabled,
nonfocusable, disconnected, hidden and inert openers. Every case also verifies
cancellation and zero provider requests. The valid-opener test remains intact.
Exactly four cases fail on the original runtime; all thirteen presenter cases
pass on the correction. A separate worker reproduced both outcomes.

The older native quick-hide failure is consistent with Pay disabling Send before
asynchronous disclosure captures focus. The exact intermediate native opener
remains a source-supported explanation, not a local browser trace. The existing
quick-hide browser assertion is unchanged and must pass on the new source.

### Browser expectations

`e2e/app.spec.ts` now checks the Privacy mode switch between skip link and Home.
Home remains reached by Tab; Settings navigation and main-focus checks remain.

`e2e/flows.spec.ts` now follows current account invalidation: require reconnection,
conceal the old account, remove final/preparation/send controls, and directly
verify zero `eth_sendTransaction` provider requests. The original zero recorded
sends, absent transaction and absent attempt-journal assertions remain unchanged.
Current Pay intentionally clears stale status/error and refuses an old send
continuation; restoring its old alert would violate that existing lifecycle.

## Actual verification

Runtime: Node 24.22.3, npm 11.19.1, repository Vitest 5.1.0, TypeScript 5.9.3 and
Playwright 1.65.1. Hosted environments and their original gates remain separate.

| Check | Outcome |
| --- | --- |
| Author baseline, original runtime | **4 failed / 9 passed**, exit 1 |
| Presenter / quick-hide / controller files | **51/51 passed**, three complete files, exit 0 |
| Wallet-privacy lifecycle file | **17/17 passed**, complete file, exit 0 |
| Independent baseline | **4 failed / 9 passed**, exit 1, separate clean worktree |
| Independent corrected presenter | **13/13 passed**, exit 0, separate clean worktree |
| Original workspace library build | Passed, exit 0, rebuilt from this source |
| Independent source review | Approved four exact blobs; no blocker |
| Original secret scan; whitespace/scope | Passed |
| Original whole-web TypeScript | **Unqualified:** exit 137, 768 MiB heap cap |
| Original typed lint, four changed paths | **Unqualified:** exit 137, 512 MiB heap cap |
| Chromium launch precondition | **Blocked before assertions:** socket creation denied |

The 51 and 17 selections are disjoint: **68 focused cases**. Baselines and the
independent replay overlap those cases and are not additional unique tests.
No whole-web coverage, complete web build, native-browser or release pass is claimed.

The initial combined four-file command passed 51 cases but its wallet-lifecycle
worker received SIGKILL; the command failed. The successful selections ran
separately at 256 MiB with unchanged source, assertions, configuration and timeouts.
All failed and successful invocations are retained. Exit 137/SIGKILL alone does
not establish the cause. The two initial dependency installs also exited 137.

Final dependencies were reused only after exact repository lock equality and
installed version/resolved/integrity metadata checks. External files were
hardlinked, workspace links remained local, transient caches were isolated, and
all libraries were rebuilt. `dependency-reuse.json` records provenance. The
independent replay additionally compared 2,227 package/build inputs before
reusing 65 compiled package directories. No dependency file changed.

## Prior hosted evidence

The completed [#336 full-browser job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703059)
reported 131 passed, 3 failed, 2 skipped. Hosted checkout
`de0abd3f33f5f147a506743f87919230ad038197` has #336's exact tree
`a506f54f1cd2c7ee5bbc007299e4a82a78d62a87`. All seven implicated runtime/test
paths were compared between #336 and #352 and were unchanged before this repair.
The failures were keyboard traversal, changed-wallet alert expectations and
quick-hide focus. Existing #348 locale/inventory and #352 devnet-journal repairs
are retained. Old-source outcomes do not qualify this new successor.

## Independent scan-warning qualification

`scan_fix_review` verified unchanged [PR #350](https://github.com/djshellshoxxx/GhostPay/pull/350)
at `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8`. All **35 tests** in complete
`scanMatches.test.ts` and `Scan.test.tsx` passed, zero skips. No blocking source
finding: duplicate deliveries of one announcement no longer create a false
shared-address warning; distinct announcements still warn.

[Review](scan-review/PR350_REVIEW.md) and [lossless execution](scan-review/PR350_EXECUTION.json)
preserve its exact dependencies, source hashes, failed build attempt and successful
checks. Review commit: `0daae8df191bb5e67be764d7e10d4b82c8302a3a`. No Scan product
code is copied here. Its hosted CI was still incomplete at final worker read.

## Branch reconciliation and next actions

[BRANCH_RECONCILIATION.json](BRANCH_RECONCILIATION.json) freezes **420** branch
names/heads from the clone, independently confirmed by complete connector
pagination. The 392-name baseline plus 26-name delta gives 418; exactly two newer
names correspond to existing #351 and #352. Zero prior names are missing.
Publishing this branch will increase the count; 420 remains a frozen observation.

PR #343 is a four-row sample. Reuse the existing
[410-head census](https://github.com/djshellshoxxx/GhostPay/blob/3433f7f098b5e61253a102a087dfb7e780dbb730/docs/consolidation/autonomous-20261120-9a4ab6/BRANCH_REVIEW.md),
whose 133 main-relative and 118 #307-relative application-difference candidates
still need semantic review. These are branch counts, not missing-feature counts
or a completion percentage. This cycle does not reclassify them.

Discovery main: `aec179910c39081d820396409ff3139ff2264132`; #307:
`5a745d4b5fba69b66a9779f88aefc63c253a4f27`. Integration record
`c196151daf8233f96045fd205b2d899c9e8cc97d` remains held by
`994a0d214fb9-root-r3`, generation 11. Expiry alone does not release it under
the existing protocol; this worker neither acquires nor overrides it.

Next owner:

1. Refresh parent/successor heads and inspect exact-head compiler, lint and full/lean
   browser results. Preserve existing assertions and the inherited Pages/Beta cases.
2. Integrate this successor through the existing privacy stack after its gates;
   preserve separately qualified #350 and all other active source owners.
3. The actual integration owner must reconcile main, #307 and #328 / #331 / #333 /
   #335 / #344 before shared-target promotion. No donor pass qualifies a new tree.

Original browser commands for a supported environment (not executed here after
the launch precondition failed):

```sh
npm run test:e2e -w @ghostpay/web -- e2e/app.spec.ts e2e/flows.spec.ts e2e/wallet-disclosure.spec.ts --project=desktop --grep 'keyboard: skip link|refuses a changed wallet account|wallet disclosure requires'
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web -- e2e/app.spec.ts e2e/flows.spec.ts e2e/wallet-disclosure.spec.ts --project=desktop --grep 'keyboard: skip link|refuses a changed wallet account|wallet disclosure requires'
```

## Evidence and publication

`EXECUTION.json` records commands and outcomes; `EXECUTION_LOGS.json.gz`
losslessly preserves complete local logs, including failures, under the `logs/`
keys named in those records. Raw `.log` files are generated intermediates and are
not separate Git artifacts. `SOURCE_REVIEW.md` and independent replay JSON identify
reviewed blobs and provenance. `EXECUTION_HISTORY.bundle` preserves local
ownership, test-first, implementation and scan-review commits; its index records
prerequisites/hash. It excludes this final documentation checkpoint to avoid
self-reference and is verified with `git bundle verify`.

Ordinary Git publication lacked credentials. Connector publication may have
different commit metadata; fetched public/local tree equality must be verified.
The bundle preserves original execution history. Main, shared integration, lease,
release and deployment state are outside this isolated publication.
