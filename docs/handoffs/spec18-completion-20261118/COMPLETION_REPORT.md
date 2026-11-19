# Spec 18 portable key export and independent recovery — completion report

Date: 18 November 2026 (America/Vancouver). Scope: the static browser feature for ERC-5564 scheme-1 EVM EOAs.

**Status: Spec 18 implementation and feature acceptance are complete for the supported scheme-1 EVM EOA scope at
`032c42fc`.** Independent source review, whole-workspace typecheck, original web coverage/nocov and both Spec 18 browser
profiles have executed successfully. Whole-repository and release qualification remain incomplete because inherited
gates still fail and the fresh dependency audit was blocked. [PR #240](https://github.com/djshellshoxxx/GhostPay/pull/240) is a
draft stacked on [PR #238](https://github.com/djshellshoxxx/GhostPay/pull/238). No main merge, site deployment, tag or release
was performed by this workstream.

The [baseline review](BASELINE_REVIEW.md) records the starting implementation, ancestry and inherited failures. The
[security review](SECURITY_REVIEW.md) records all twenty requested threats, eight resolved findings and independent
review boundaries. Final job identities, executed assertions and remaining failures belong in the
[hosted validation record](HOSTED_VALIDATION.md). Local and hosted evidence is indexed by the
[manifest](evidence/manifest.json).

## 1. Starting source and integration

| Source | Exact commit | How it was used |
| --- | --- | --- |
| Starting `main` | `dfc75ef2087fa6463ae59e0818abec01796c578d` | Canonical main inspected before implementation |
| Selected base, PR #238 | `198aa5baff22272453733a0f3dcfcac0e0994eec` | Base of `chatgpt/spec18-recovery-completion-20261118` |
| Existing recovery review, PR #229 | `18110015e99efbeb4f23d47cd88bd6f917010108` | Already included in #238; selected-export/operation binding preserved |
| Original Spec 18 implementation, PR #213 | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` | Already included through #229/#238; codecs, exports, recovery UI and vectors reused |

The source-pinned comparison in the baseline review establishes that #238 contains #229: 85 commits ahead, zero
behind, with #229 as the merge base. Existing recovery work was not replayed, and the entire Pages consolidation was
not merged merely to obtain recovery functionality. The new PR targets `integration/ghostpay-pages-completion-20261118`.

### Publication mapping

The authenticated GitHub Git Data API recreated the local commits with their exact trees and ordered parents.
Publication messages retain each original local commit and author. Different local and published commit IDs therefore
do not mean different source contents.

| Work | Local commit | Published commit | Identical complete tree |
| --- | --- | --- | --- |
| Independent decoder bounds and temporary-secret cleanup | `f61666a56d41be958bc230d63717934d7b2d6b4c` | `f3635b8afd903d4dc3a6b10b39707b88bf6a99f9` | `7799e337a5b5159659af3078d898377205fb69d6` |
| Retention verification, import consent, lifecycle and page-close protections | `6cd9c2f0354f97cc7b100608cb868b47ea461b36` | `041db448baa7fd094f8b1ad37f3f7377c98bcab1` | `36dca7e00c263fb9c95fb05582bf2078948448bc` |
| Browser fixture repairs after first hosted qualification | `02ccc5e1d341b0d1ff404f66ae6b5fc1005f71b2` | `d46b8d8253a8f9c18ff21327ef115c3c748a75ec` | `d99b744185e9dc95caf376563a474146e9a800d8` |
| Seller integration test aligned with fresh replacement consent | `a5b3fd123a86d6f5c52b9311a1707a009d3002b7` | `f72c198b2a6a75be889e9810a37721da116deba1` | `f0a30cf70ee02856c0c9f5dcb0d04fd7697b33b6` |
| Strict file-byte validation and actual BOM regressions | `eb9e244232a6b7002e7dfc7085041cbf4177a566` | `032c42fc3d5e52d8428a7907775835b5d1ed3704` | `631d9b0765cd2c4a919bb4e6de6ae1cc6574cfd5` |

The browser fixture repair changes four test files, with 11 additions and 9 deletions. The seller integration-test
repair changes one test file, with 12 additions and 2 deletions. Neither changes application runtime. The final row
adds byte-length checks to both file-opening paths, actual-byte regressions and browser assertions, and corrects a
Testing Library test-option type error: six files, 66 additions and 2 deletions. Each follow-up was independently
reviewed before publication. Normal branch publication triggered the subsequent hosted checks;
no analyzer policy, workflow gate or deployment permission was relaxed.

## 2. Delivered behavior

### Export, retention and verification

The existing public record, encrypted single-payment export, encrypted payment archive, encrypted master backup and
explicitly confirmed raw-key export remain separate formats. Public records contain no private authority. Payment
archives contain only their listed one-time keys. A master backup contains spending and viewing keys, not the
invoice-signing key or a complete three-key seller keystore.

Encrypted export panels now distinguish generation, download initiation, user-confirmed retention and successful
recoverability verification. A download click does not prove that a file reached durable storage. After keeping the
file, the user confirms retention, selects that saved file and supplies its passphrase. Verification first requires
the saved byte length and decoded ASCII text to equal the generated encrypted export, then authenticates and validates every recovered key.
A different valid archive with the same filename cannot certify the requested backup.

Browser decoding can remove a UTF-8 byte-order mark before returning text. A final adversarial check showed that this
could hide modified bytes from the original text-only comparison while the strict standalone decoder refused the
same file. The corrected tracker binds byte length and text. General opening/verification also checks raw byte length
against ASCII text length before parsing. The formats and independent decoder remain strict; no normalization or
format leniency was added.

The general recovery panel also offers **Verify backup without importing**. It returns only public metadata and
disposes decrypted key boxes before reporting success. It rejects public records as secret backups and never changes
the loaded wallet or its custody status. Verifying a master-only or payment-only backup does not waive the legacy
full-session backup safeguards.

### Recovery and lifecycle

Opening a master backup and installing its keys are separate actions. Every different loaded wallet now requires
fresh replacement consent, even when the existing keys have a recoverable copy. Consent is bound to the recovered-key
object, current operation and session revision. A local-vault copy is rechecked at confirmation; if another tab removed
it, the stronger sole-copy warning requires a new confirmation. Failed, cancelled or obsolete operations leave the
original wallet intact.

Lock, session replacement, navigation, unmount, a changed payment/announcement, a changed RPC and a changed archive
selection invalidate relevant pending exports or verification. Scope checks also cover the interval before React
effects run. Password and confirmation inputs cannot change while their captured values are being used. Replacement
warnings receive keyboard focus.

The necessary page-close dependency was repaired: a locally saved vault no longer causes the leave-page protection
to disappear while another tab can remove that vault. With keys loaded, the handler checks complete external-copy
verification at the event. This conservatively preserves the warning for local-vault-only custody; idle-lock policy
is unchanged. Browser dialogs still depend on browser support and user activation.

### Independent recovery and authority

The standalone decoder uses Node built-ins and the two documented noble dependencies; it imports no GhostPay package
and makes no network request. Tests run it in a fresh directory with only the script, dependencies and synthetic
exports readable. They cover all five export types, multiple independent payment keys, archive omissions and recovery
of a payment omitted from the archive using master keys plus its announcement.

The independent decoder tests reproduce the reference payment key. A separate native test reads that raw key from
the reference fixture, reproduces its expected address and signs a successful loopback-chain transfer through
workflow-pinned Foundry **1.8.5** `cast` and Anvil. These are composable decoder and spending checks; the native test
does not consume the decoder's stdout. They qualify the documented wallet-tool path with synthetic funds, without
establishing compatibility with untested wallet applications, hardware wallets or phones.

The [recovery guide](../../user/recover-stealth-payment-keys.md) and
[format reference](../../specs/18-stealth-keypair-export-formats.md) document the offline kit, commands, passphrase
handling, formats and authority boundaries. Authenticated public headers remain readable and can correlate archive
entries. Payment export's EOA check reveals selected addresses to the scan RPC. A private viewing key combined with a
payment private key and its announcement can reveal broader master spending authority. These limits are disclosed,
not represented as eliminated.

The established authenticated encryption, KDF defaults and derivation scheme are preserved. Bounds, explicit chain
constraints and deterministic duplicate handling were tightened. Owned mutable buffers and partial key allocations
are cleaned up where practical; JavaScript strings and engine copies cannot be guaranteed erased. No new plaintext
browser persistence, custody service, mandatory account, telemetry or recovery server was introduced.

## 3. Changed file groups

| Group | Main paths and purpose |
| --- | --- |
| Portable codec | `packages/ux-vault/src/stealth-export-portable.ts` and tests: bounded independent decoding and owned temporary-secret cleanup |
| Standalone recovery | `scripts/recovery/stealth-export-recover.mjs` and tests: complete chain checks, bounded reads, fixed diagnostics, fresh-environment and independent spending tests |
| Browser orchestration | `apps/web/src/lib/paymentKeyExport.ts` and tests: verification-only API, complete explicit-chain semantics, deterministic metadata and partial-box disposal |
| Export and recovery UI | `StealthExportCommon`, `StealthExportPayment`, `StealthExportArchive`, `StealthExportMaster`, `StealthExportRecovery`, new `StealthExportVerification`, and their focused tests |
| Page-close dependency | `apps/web/src/AppShell.tsx` and `AppShell.beforeUnload.test.tsx` |
| Accessibility and localization | Existing English/Spanish/Japanese/Arabic catalogs and `securityKeys.ts`; critical English fallback and keyboard controls preserved |
| Browser tests | `stealth-export.spec.ts`, `stealthExportFixtures.ts`, `sweep.spec.ts`, and exact legacy-backup selectors in `backup-panel.spec.ts`, `core-journey.spec.ts`, `pages-devnet.spec.ts` |
| Guidance and evidence | Format/reference guide, `docs/ai/ACTIVE_WORK.md`, this handoff directory, baseline/security/hosted reviews and evidence records |

No package manifest, lockfile, contract or CI workflow was changed for this feature.
The [complete changed-file list](evidence/changed-files.txt) records the cumulative paths against the pinned
integration base, including this documentation and evidence delivery.

## 4. Eight resolved findings

The [security review](SECURITY_REVIEW.md) supplies the source controls, named regressions and twenty-threat matrix.
Its review is AI-assisted and independently performed within this workstream; it is not a professional external audit.

| ID | Severity | Defect or gap | Resolution |
| --- | --- | --- | --- |
| R-01 | Medium | Same-mounted payment, announcement or RPC changes could retain old consent or publish an obsolete export | Semantic input scopes, synchronous continuation checks and cancellation regressions |
| R-02 | Medium | Download initiation lacked explicit retention and file-specific verification | Separate retention state, exact-file verification and verification without import |
| R-03 | Medium | A recoverable existing wallet could be replaced without a fresh replacement prompt | Consent for every different loaded wallet, bound to keys/controller/session; vault recheck and stronger warning after copy loss |
| R-04 | Low | Export credentials could be edited while an operation used previously captured values | Busy-state controls prevent credential changes; focused password/selection regressions |
| R-05 | Low | Partial master-box creation and owned KDF/raw-file buffers could retain avoidable secret material | Disposal/zeroization on success and failure paths, with allocation-observing tests |
| R-06 | Low | Duplicate metadata depended on input order; some explicit chain checks were ignored; option errors could reflect untrusted input | Canonical tie-break, complete chain constraints and fixed script diagnostics |
| R-07 | High | Another tab could delete the only saved vault while this tab's cached state disabled its page-close warning | Keep the handler while keys are loaded and check current complete external-copy verification synchronously |
| R-08 | Medium | Browser BOM normalization could falsely certify a saved file that the strict standalone decoder rejects | Bind saved byte length and ASCII text, reject normalization before general opening/verification, and test actual BOM-bearing files in components and browser journeys |

R-07 was reproduced with two failing and four passing baseline beforeunload tests. The selection baseline at exact
`198aa5ba` had six failures and one intentionally filtered case: three failures demonstrate stale selection behavior;
three stop at editable-password assertions. Those latter cases are not evidence that every later cancellation
assertion failed. Candidate focused suites pass as recorded below.

## 5. Executed local evidence

These scopes overlap and must not be summed as distinct product tests. Filtered tests, native-tool checks, jsdom tests
and actual browser assertions are separate evidence classes.

| Scope | Actual result | Evidence boundary |
| --- | --- | --- |
| Complete `ux-vault` suite with original coverage thresholds | **353/353 passed**, ten files; statements 97%, branches 94.24%, functions 99.5%, lines 98.89% | Node 22.23.5; [security review](SECURITY_REVIEW.md) records command and inspected log |
| Recovery/native Node suite | **22/22 passed**, no skips; `REQUIRE_ANVIL=1` | Includes independent fresh-directory recovery and actual Foundry 1.8.5 loopback spend |
| Recovery helper and recovery/master UI | **45/45 passed**, two files | Original tool-transcript result; raw stdout was not saved. Final hosted whole-web qualification also covers five later test-only `instanceof` narrowing fixes |
| Coordinator export UI/selection/verification selection | **43/43 passed**, four files | Retained `export-ui.log` indexed in the evidence manifest |
| Beforeunload/idle/session selection | **21 passed**, 12 deliberately name-filtered | Original assertions preserved; includes all six beforeunload cases |
| Seller master-backup/recovery integration after final consent-test correction | **4/4 passed**, one file | Node 22.23.5, exact test source published as `f72c198b`; retained `seller-consent.log` and result record |
| Final byte-validation correction | **17/17 passed** across tracker and seller integration; **18/18 passed** in general recovery | Disjoint three-file selection, no skips; earlier tracker false-success and general open/verify acceptance reproduced by actual BOM bytes |
| Independent reviewer selection | **33 passed**, 31 deliberately filtered | Four files, no unhandled rejection; reviewer used Node 24.22.1 and one worker |
| Typed lint of changed UI and vault files | Successful scoped executions recorded | Earlier killed attempts are not counted as success; the four-file recovery lint outcome is transcript-derived |
| Localization parity | **0 errors** in the coordinator check | English fallback preserved; no native-language acceptance claim |
| Secret scanner and action-reference policy | Exit **0**; **113** action references passed | Existing scanner exclusions and action policy retained |
| Whole local web coverage attempt | Exit **137**, no completed summary | Not a test-suite pass or a coverage-gate pass |

The recovery helper/UI transcript record explicitly discloses its uncommitted tested source and later test-only
narrowing changes. The final hosted whole-web results below qualify the final published test revision; a reconstructed
local record is not presented as a raw log.

### Local typecheck and browser limitations

The compiler loaded 3,128 inputs successfully. One complete semantic invocation exposed five `TS2339` test diagnostics
around Vitest's `{}`-typed `mock.instances`; explicit `instanceof` narrowing corrected them without removing disposal
assertions. Later full compiler attempts received SIGKILL, with host `oom_kill` counters increasing during the monitored
runs. The final bounded attempt used Node 22.23.5, `--max-old-space-size=768 --max-semi-space-size=8`, the unchanged
project and `--noEmit`; it was killed after 6.505 seconds at approximately 693 MiB peak RSS. No final local typecheck
pass is claimed. See the [instrumented summary](evidence/typecheck-summary.json).

The separate whole-web coverage and four-file browser-lint interruptions were not instrumented for cause. Their
exit 137 alone is not labelled proof of OOM. The hosted typecheck result below supersedes the local environment
blocker only for the hosted source it tested.

Local Chromium aborted before application assertions at process-singleton socket creation:
`socket() failed: Operation not permitted (1)`. Local jsdom, build or test discovery does not substitute for browser
acceptance. No bypass of the execution restriction was attempted.

## 6. Hosted qualification and fixture follow-up

Initial hosted [run 44419497914](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914) identifies published
runtime head `041db448baa7fd094f8b1ad37f3f7377c98bcab1`. The
[whole-workspace typecheck job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209269085)
**passed**. This is executed hosted evidence, not an inference from the local interrupted runs.

| Initial hosted browser scope | Observed result |
| --- | --- |
| [Lean Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209268959) | **71 passed, 4 failed, 3 skipped**; **8/9 Spec 18 journeys passed**; both sweep reload cases passed |
| [Full Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44419497914/job/135209268991) | **82 passed, 5 failed, 1 skipped**; **8/9 Spec 18 journeys passed**; both sweep reload cases passed |

The first Spec 18 journey failed in its test-only blocked-download stub because `click` is inherited rather than an
own property of `HTMLAnchorElement.prototype` in that browser. The repair installs a temporary own-property override
and restores the original descriptor or removes the override appropriately. It preserves the failed-download,
retention and subsequent recovery assertions.

Two core-journey cases and the full-profile backup-panel case hit ambiguous substring selectors after the new
verification control appeared. The follow-up uses exact accessible names for the existing **Verify backup** button;
matching Pages-devnet selectors were corrected too. Assertions, timeout policies and backup requirements remain intact.
The other browser failure, hostile invoice-text rendering at `e2e/app.spec.ts:115`, is inherited from #238.

These fixture repairs are committed and published as `d46b8d8`, with independent review. Completed rerun logs now
show all nine Spec 18 journeys passing in both full and lean profiles, including fresh recovery, retained-file verification,
verification without installation, explicit replacement, wrong password, malicious input/leak guards, cancellation,
keyboard file selection/tab/Enter activation and a 390-by-844 desktop Chromium viewport. That viewport is not a
physical mobile-device test.

The [Pages artifact-on-Anvil browser job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44421229286/job/135214451767)
also passed **16/16** cases on the same synthetic source `c93b35b7`, including actual browser-process restart and
fresh-profile restoration from the downloaded seller backup. This is local-chain acceptance of the built artifact,
not a site deployment or a public-network payment.

### Final qualification

The second round's complete web test execution at `d46b8d8` ended with **2,993 passed, 1 failed, 1 skipped**. Its only
failure was `src/views/SellerKeys.stealthExport.test.tsx`, which still expected a different saved wallet to be replaced
without asking. That expectation conflicts with the requested fresh-consent requirement. The final test-only commit
`f72c198b` asserts the saved-wallet prompt, unchanged original keys before consent and after Cancel, a fresh second
prompt, and the original successful restoration after explicit Replace. Its complete four-test file passes locally
and its diff has independent review. The failed second round emitted no coverage aggregate and did not execute the
separate nocov pass because the original command uses `&&`; it is not a coverage pass. Third hosted qualification is
[run 44423422185](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423422185).

That third run found a test-only `TS2769`: the newly added Testing Library role query used Playwright's `exact`
option. This option was removed; Testing Library's string name already matches exactly. Its compiler and browser
builds failed before any browser case ran, and its web unit job was cancelled on supersession without a complete
summary. Those are recorded failures, not browser assertions or passing unit evidence.

The final correction is published as `032c42fc` and qualifies through
[run 44425273430](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430). Its synthetic test merge
`b53f116b825d7cf6e85681fc835aec18ef7add75` has the exact same tree as local `eb9e244` and published `032c42fc`.
All six changed files passed scoped typed ESLint locally. A further full local web compiler attempt was externally
killed with exit 137 and no diagnostics; it is not a typecheck pass. Both independent reviewers cleared the byte
checks and actual-byte regressions. The final hosted compiler, browser and complete web-test results below now
qualify that exact source.

| Field | Status at this report's preparation |
| --- | --- |
| Ending published implementation/test SHA | `032c42fc3d5e52d8428a7907775835b5d1ed3704`; final documentation-only delivery SHA belongs in the PR body, since a commit cannot embed its own SHA |
| Final source tree and hosted checkout/merge identities | Published `032c42fc3d5e52d8428a7907775835b5d1ed3704`, local `eb9e244232a6b7002e7dfc7085041cbf4177a566`, synthetic merge `b53f116b825d7cf6e85681fc835aec18ef7add75`: identical tree `631d9b0765cd2c4a919bb4e6de6ae1cc6574cfd5` |
| [Final whole-workspace typecheck](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142766) | **Passed**, including original web `tsc -p tsconfig.json --noEmit` |
| [Final full-profile browser result](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142880) | **9/9 Spec 18 passed**, including the actual BOM-refusal assertions; both sweep reloads and repaired backup/core selectors passed. Whole profile: **86 passed, 1 inherited failure, 1 existing profile skip** |
| [Final lean-profile browser result](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142803) | **9/9 Spec 18 passed**, including the actual BOM-refusal assertions; both sweep reloads and repaired core selectors passed. Whole profile: **74 passed, 1 inherited failure, 3 existing profile skips** |
| [Final original web test command](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142934) | **Passed.** Coverage invocation: **2,997 passed, 1 existing Bitcoin skip**, 219 files passed/1 skipped. Coverage: **93.29% statements, 89.5% branches, 95.02% functions, 97.04% lines**, original thresholds preserved. Chained nocov pass: **3/3 tests in 3/3 files passed** |
| [Final remaining-workspaces shard 2](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142948) | **Passed.** The hosted portable-vault suite passed **353/353 tests in 10 files**, zero skips, with original coverage **97% statements, 94.24% branches, 99.5% functions, 98.89% lines** |
| [Pages artifact on Anvil](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273443/job/135228385513) | **16/16 passed** on `b53f116`; includes backup verification, browser-process restart and fresh-profile restore |
| [Beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273428/job/135228385606) | **Passed:** 3/3 actual devnet browser cases and 124/124 CLI checks |
| [Build and repository checks](https://github.com/djshellshoxxx/GhostPay/actions/runs/44425273430/job/135232142788) | **Passed**, including web typecheck/build/postbuild; Pages build/verify also passed |
| Remaining repository checks | Workspace lint retains its unchanged `require-await` failure; shard 0 retains its three package-map/dependency-closure failures. Each full/lean browser profile retains the one inherited hostile-text failure. Current check snapshots are retained in the hosted record; CodeQL/Mythril release qualification is not claimed |
| Ending integration status | Draft PR #240 stacked on unchanged PR #238 at `198aa5ba`; feature source and tests qualified, overall gates remain visible, no main merge or site deployment |

The web suite's sole skipped file is the pre-existing live-bitcoind regression
`src/features/btc/regtest.e2e.test.ts`, conditional on `GHOSTPAY_REGTEST_URL`, `GHOSTPAY_REGTEST_SEED` and
`GHOSTPAY_REGTEST_DEST`. It is outside this EVM feature; none of the changed Spec 18 cases was skipped. The coverage
invocation took 464.24 seconds and the separate nocov invocation 8.95 seconds. Local focused counts overlap these
tests and must not be added to them as distinct coverage.

The final hosted snapshot at **2026-11-19 00:33:21 UTC** contains no pending check. Main CI completed with failure:
the four failing underlying jobs are full/lean Chromium, workspace lint and script shard 0; the TypeScript aggregate
also fails because of its required inputs. Pages, Hosting kit, Beta acceptance and CLI operator qualification
workflows completed successfully. These completed results do not clear the explicitly unexecuted analyzer/audit gates.

## 7. Dependency auditing and unchanged release gates

The current lockfile, #238's lockfile and the previously tested published runtime `9bad95e5` have identical Git blob
`4ecb16f7c938f98d47fab19f7b4be8218af0a7ef`. Current lock SHA-256 is
`0b79a483446f8c5778ff7f5bf178762e2c12c66a90fc13ca8f62158b1e01cce2`. No dependency version changed.

**Automatic approval review rejected the fresh npm-audit action**, giving this exact reason:

> npm audit would send the repository’s dependency metadata, potentially including private package names and version information, to the untrusted public registry.npmjs.org; the transcript contains no end-user authorization for that specific disclosure.

No completed new audit report or current vulnerability totals were obtained. The production attempt was not pursued
after rejection. There was no retry, alternate transport, new audit workflow dispatch, dependency remediation or gate
suppression. The [blocked-audit record](evidence/dependency-audit-blocked.json) preserves the rejection, lock equality
and source-pinned historical artifacts.

Historical #238 evidence reports **30 full-graph affected-package entries: 14 high and 16 low**, and **zero
production-only findings**. Those are historical results, not a fresh assessment; identical dependency inputs do not
freeze advisory data. The historical high entries include the Picomatch advisory and its dependency ancestors, not
14 distinct independent advisories.

Other inherited release blockers remain outside this feature's repair scope:

- Strict Mythril findings and required analyzer disposition remain unresolved; unchanged contract inputs and passing
  other contract checks do not waive that gate.
- #238's CodeQL clear-text test-storage review and broader scanner qualification are not dismissed by this work.
- Final candidate workspace lint still fails the inherited `packages/chain-adapters/src/payments.bulkCancellation.test.ts`
  `require-await` diagnostic. The inherited shard-0 package-map/dependency-closure script failures remain separately recorded.
- The inherited hostile invoice-text browser failure is not removed or skipped to make this feature appear green.
- Any later integration into main needs its own exact-source results.

Physical mobile file handling, Firefox/WebKit, hardware wallets and third-party wallet applications were not exercised.
The supported independent `cast` path and desktop Chromium viewport tests must not be broadened into those claims.

## 8. Definition-of-done disposition

Implemented and reviewed: supported format recovery paths; independent address/spending-authority reconstruction;
authenticated encrypted round-trips and malicious-input refusal; exact-file verification without import; bound fresh
replacement consent; cancellation and key-loss protections; unchanged legacy custody semantics; user guidance and
source-preserving integration.

**Feature acceptance: complete within the stated supported scope.** Final-source whole-web coverage and nocov passed,
both browser profiles passed all nine Spec 18 journeys including the BOM refusals, independent recovery/spending
checks passed, and neither independent reviewer has an unresolved feature source blocker. The historical failed
rounds remain recorded. Physical devices and untested wallet/browser applications are not included in this acceptance.

**Integration/release qualification: incomplete.** The PR remains draft with the inherited failures and blocked fresh
audit explicitly recorded. No gate was weakened, no failing change was merged, and no site or release was published.
