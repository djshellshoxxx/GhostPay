# Browser acceptance continuation: exact-source diagnosis and repair

## Outcome

PR #336's disclosure correction advanced the devnet journeys, but the observed
published tree still fails Pages, Beta acceptance, full browser, lean browser and
web tests. This successor repairs the confirmed stale acceptance assumptions and
one independently reproduced focus-restoration defect. It does **not** claim a
passing browser run or release qualification.

The final locally qualified product/test source is
`5923fcbb13b73a6973f7dd21cf38daa573248ea5`, tree
`2e61abb2a3ed37379bd16ecc90306d2d765e2ed3`, on the new isolated branch
`fix/ghostpay-browser-acceptance-20261120-r3`. It descends directly from the
published #336 head, preserving every predecessor and every original failed run.
The coordinator owns independent review, publication, integration and hosted gates.

Independent reviewer `/root/r3_feature_completion` approved that exact source and
tree with zero findings; the coordinator also inspected the complete runtime/test
diff. The source-only review and its blob-identity record are retained in
[independent-browser-r3-review.md](independent-browser-r3-review.md) and
[independent-browser-r3-review.json](independent-browser-r3-review.json). The reviewer
did not rerun tests or claim browser acceptance.

Local outcomes at that final source: 92 tests passed across seven complete
DOM/wallet files, six inventory tests passed, original full web typecheck passed,
and original full web lint passed. No skips were introduced. The earlier failing
regressions, initial passing focus probe, and one authored-test type error remain
in the lossless evidence. Counts from repeated selections overlap.

## Source identities actually executed

Checkout identities below come from each job's `git log -1 --format=%H`, not a
runner-image commit, branch label, or PR summary. GitHub commit objects establish
the merge parents and tree identities. All retained failed jobs for a source agree
on its checkout. PR #336 remained open at the same head/base in the final snapshot
at 2026-11-20 23:23:06 UTC.

| PR | Published source | Actual synthetic checkout | Checked tree |
| --- | --- | --- | --- |
| [#326](https://github.com/djshellshoxxx/GhostPay/pull/326) | `a34ce43e296e302e3e65ed077ea8ac892c5189a1` | `adbcec37c3f589e9b1a0cc6ee419193ce90d355e` | `b277d0b71b0b6d9242d2d36cdfcadc3b1296f5d3` |
| [#327](https://github.com/djshellshoxxx/GhostPay/pull/327) | `9608ec996fb159f11b84b9baec0b48033a48a6a5` | `741f1e72697666a6e7cf2ab59f78a1276b5cd364` | `f57733261e325c80ef54d7d12c93deb7feee4d4b` |
| [#336](https://github.com/djshellshoxxx/GhostPay/pull/336) | `410353a23631234aa888e46f38df22291c699a26` | `de0abd3f33f5f147a506743f87919230ad038197` | `a506f54f1cd2c7ee5bbc007299e4a82a78d62a87` |

Each checked merge tree equals its corresponding PR head tree. #326's merge
parents are required-v1.1 `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9` and #326;
#327's are #326 and #327; #336's are #327 and #336. The local worktree initially
held `6ed3731bbc01a237d4a1c02c187c21f4c1419cc5`, tree-identical to public #336;
this successor was created from the actual public commit, not that local alias.

The ownership check inspected all 113 open PRs, current main's ownership register,
and all changed paths in newer PRs #337–342. None owns the acceptance/focus paths
changed here. Main was observed at `bfebea0acf213a113d2740366fd592042661ca67` and
was not changed by this lane. Additive ownership claims preceded source edits.

## Original hosted results and concrete failures

The initial snapshot was taken at approximately 23:09 UTC; #336 lean finished
during this investigation. These are original jobs, not retries.

| Gate | #326 | #327 | #336 |
| --- | --- | --- | --- |
| Pages artifact on Anvil | 6 passed, 5 failed, 5 not run | 6 passed, 5 failed, 5 not run | 10 passed, 1 failed, 5 not run |
| Beta browser journey | 3 failed | 3 failed | 1 passed, 2 failed |
| CI browser full | 131 passed, 3 failed, 2 skipped | 131 passed, 3 failed, 2 skipped | 131 passed, 3 failed, 2 skipped |
| CI browser lean | 118 passed, 3 failed, 5 skipped | 118 passed, 3 failed, 5 skipped | 118 passed, 3 failed, 5 skipped |
| CI web tests | 4190 passed, 2 failed, 1 skipped | 4202 passed, 1 failed, 1 skipped | 4202 passed, 1 failed, 1 skipped |
| CI rest-0 script phase | 413 passed, 1 failed | 413 passed, 1 failed | Still in progress in final snapshot |

The retained Beta logs show the library/CLI stages completing before the failed
browser stage. Those stages do not make the combined Beta workflow successful.

### #336 Pages and Beta: journal visibility after reload

The prior disclosure correction now reaches and verifies real Anvil payments.
The remaining failure is the immediate post-reload expectation that the journal
region contains the transaction hash before the payer reconnects. The actual UI
instead says to connect the relevant account and chain before revealing attempts.
This matches `WalletAttempts`' existing account/chain filtering; persistence is
separate from presentation authority.

The failed Pages assertion is at `pages-devnet.spec.ts:412`; Beta fails the same
assumption at `devnet-journey.spec.ts:140` and `:271`, including the still-pending
payment. The original #326/#327 failures instead stop at the earlier missing
wallet disclosure decisions. Complete original logs retain that distinction.

- [Pages job 136527106205](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158452/job/136527106205)
- [Beta job 136527105979](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158557/job/136527105979)

### #336 full and lean: three inherited failures

1. `app.spec.ts:232` expects the Home button after two Tab presses. The existing
   header privacy switch now sits between the skip link and navigation.
2. `flows.spec.ts:172` expects a changed-account alert from the final authority
   reread. Its fixture also emits `accountsChanged`, invoking the separate view
   invalidation path before the expected reread error can be displayed.
3. `wallet-disclosure.spec.ts:67` expects quick hide to return focus to the visible
   privacy switch. The original browser assertion reports an inactive switch.
   The mounted reproduction below establishes a sufficient failure cause; the
   browser log itself does not identify its active element.

All three failures occur on both exact executed parent trees as well. They were
not introduced by the three-file #336 consent-driver patch.

- [Full job 136570703059](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703059)
- [Lean job 136570703083](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703083)

### Web and inventory prerequisites

The sole #327/#336 web failure mounts `WalletAttempts` without a wallet scope but
expects the account-specific clear button. It is the same intentional presentation
boundary as the devnet failure. #326 additionally records a failed Continue-button
query in `Pay.signer.test.tsx`; that case passed in the later observed #327/#336
jobs. This lane makes no claim that the earlier failure was independently repaired.

Both parent rest-0 jobs fail the source-inventory reference count: Pay has seven
`getRpc` references, while the documented snapshot records six. Review of
`6fb8c2be` → `74dccc41` locates the added reference in `refreshContext`'s existing
dependency array (`app.getRpc`). The number of actual calls remains three, their
payment-preflight authority remains explicit, and all 37 inventoried surfaces
remain unchanged. This successor updates that single documented count; it does
not alter the detector, assertions, authority records or application network calls.

- [#336 web job 136570703109](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703109)
- [#327 rest-0 job 136523645495](https://github.com/djshellshoxxx/GhostPay/actions/runs/44788918244/job/136523645495)
- [#326 rest-0 job 136501615949](https://github.com/djshellshoxxx/GhostPay/actions/runs/44785154515/job/136501615949)

## Bounded correction

The sole production source change is `components/WalletDisclosure.tsx`. Cleanup
still gives a replacement dialog focus ownership and restores an available opener.
It now rejects document roots and disabled openers, verifies that attempted focus
actually reached the opener, and otherwise uses the existing privacy-control
fallback. No disclosure approval, provider call, transaction, storage or masking
behavior changes.

The initial mounted focused-caller/inert-ordering probe passed all seven cases;
that result was retained rather than described as a reproduction. A second
test-only source reproduced a lost-focus caller leaving focus on body (one failure,
seven controls passing). The expanded tests-only source `38290781` reproduced
three failures: body, documentElement, and a real initiating button disabled while
the disclosure is open. Seven controls still passed, including valid-opener
restoration. The claim and coordinator approval preceded the runtime repair.

These tests exercise actual mounted disclosure and privacy components with the
real wallet entry points. They preserve zero provider calls on cancellation,
inaccessible private controls after quick hide, a fallback outside hidden/inert
ancestors, and normal focus restoration. The header control is rendered outside
the sensitive view boundary; the passing ordering probe checks that fallback is
not attempted while its background remains inert. No generic privacy-focus helper
or additional production path was changed.

Acceptance changes preserve the existing user decisions and safety checks:

- Devnet tests assert that disconnected reloads conceal the hash while retaining
  it in the tab journal. The original visible-hash assertions now run after the
  existing explicit account disclosure reconnects the same wallet, and during
  subsequent preflight. All duplicate, nonce, balance and chain assertions remain.
- The locale test verifies the generic disconnected warning and hidden account/
  clear control, then supplies the matching scope before its original assertions.
- Keyboard traversal includes and asserts the existing privacy switch before
  continuing to the original Home/focus checks.
- The recheck fixture changes its account silently during `net_version`, letting
  the existing final account reread detect it. The separate event-emitting
  `changeAccount()` fixture remains unchanged for lifecycle tests.

A mechanical assertion multiset check confirms no original assertion line was
lost from the two devnet suites, app keyboard file or locale file. All workflow
and test configuration bytes remain unchanged. This check supports source review;
it does not substitute for execution.

## Local verification and provenance

All commands use the assigned worktree's existing installation. Node is
24.22.3 and npm 11.19.1. The recorded exact-lock toolchain includes Playwright
1.65.1, Vitest 5.1.0, Vite 8.3.8, viem 2.57.19, TypeScript 5.9.3, ESLint 10.15.0
and typescript-eslint 8.73.0. Hosted workflows use their original Node configuration;
these local results do not replace those executions.

All 307 installed nonlink metadata entries match the lockfile (287 external
entries plus 20 workspace metadata records). The 19 prior compiled workspace
closures retain matching source inputs and exact dist hashes; the test-only
relayer-guard link resolves inside this same worktree. No dependencies were
installed, copied from another candidate, or substituted.

| Verification | Source | Actual result |
| --- | --- | --- |
| Original locale file before correction | `5370f257` | 15 passed, 1 failed |
| Original inventory test before correction | `5370f257` | 5 passed, 1 failed |
| Initial focused-caller disclosure probe | `d584bdb7` | 7 passed; not a reproduction |
| Lost-focus disclosure reproduction | `9c1b3208` | 7 passed, 1 failed |
| Root/disabled target reproduction | `38290781` | 7 passed, 3 failed |
| Complete seven-file DOM/wallet selection | `5923fcbb` | 92 passed, zero skips, 16.205 seconds |
| Original inventory file | `5923fcbb` | 6 passed, zero skips |
| `npm run typecheck -w @ghostpay/web` | `5923fcbb` | Exit 0, 19.127 seconds |
| `npm run lint -w @ghostpay/web` | `5923fcbb` | Exit 0, 53.239 seconds |
| Dedicated devnet static discovery | `86ae4067` | 3 cases in one file |
| Dedicated Pages static discovery | `86ae4067` | 16 cases in one file |
| Default full static discovery | `86ae4067` | 136 cases in 31 files |
| Default lean static discovery | `86ae4067` | 126 cases in 29 files |

Discovery inputs are byte-identical at final source `5923fcbb`; the only later
source edit removed six unsupported Testing Library `exact` options. Literal
accessible-name matching and every assertion remain. The initial full typecheck
at `86ae4067` failed on those authored options; that output is retained, as is its
passing lint and the earlier overlapping focused selection.

The original committed-secret scanner, Actions pin checker and complete successor
whitespace check also passed after the evidence was staged. Their command/exit
receipts and raw logs are included with the execution evidence.

Static discovery used the original configurations and the previously recorded
synthetic public state file solely to satisfy import-time checks. Its uncreated
deployment/build output paths remain absent. No browser, web server, anvil, socket,
RPC request or transaction was started locally, and none is represented as passed.

## Applicable gates still required

The original workflows remain intact: Pages acceptance runs
`BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh`; Beta runs
`bash scripts/beta/acceptance.sh --skip-build`; CI runs the original full/lean
`npm run test:e2e --workspace @ghostpay/web` matrix, web coverage/nocov command,
rest-0 scripts, remaining package groups and required aggregate jobs. Snapshot
metadata and `workflow-gates.txt` retain their names, commands and dependencies.

At the final #336 observation, rest-0 was still in progress, multiple package
groups and the contracts aggregate remained queued, and the final TypeScript
aggregate was not yet instantiated. Four Pages publication-only jobs were
conditionally skipped; those are not deployment or release passes. The workflow
run/status APIs and job APIs are non-atomic observations and are retained as read.

The successor has independent source approval and still requires its own complete
hosted Pages, Beta, full/lean browser, coverage and other applicable checks before
integration. Local DOM repair establishes the focus defect and correction; only
the unchanged hosted browser assertion can establish that this also resolves the
observed browser failure. New main/integration merges require fresh combined-tree
qualification. No existing branch was rewritten, no original failure was retried
away, and no deployment or release action occurred.

## Evidence format

`EVIDENCE.json` identifies source pins, local runs, hosted job identities and each
artifact. `outputs/*.artifact.json` use `ghostpay-lossless-artifact/1`: base64 of
deterministic gzip, original byte count and SHA-256. Decoding must reproduce the
recorded original bytes and digest. The wrappers include all 17 complete original
failed-job logs, raw metadata, parent checkout objects, initial and final local
logs, dependency provenance, assertion/configuration checks and exact patches.
`failure-excerpts.json` is a navigation aid; the full logs remain authoritative.
