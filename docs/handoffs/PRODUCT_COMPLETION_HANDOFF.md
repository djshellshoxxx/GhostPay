# GhostPay product completion ledger

Date: 2026-11-09 (America/Vancouver). Coordinator: this product-completion workstream.

This ledger covers the product brief supplied for this assignment. It distinguishes implemented code,
executed qualification and external acceptance. Percentages are engineering estimates for the bounded
workstreams below, not measured percentages of all possible GhostPay functionality or production readiness.

## Final acceptance snapshot

Qualification completed on **2026-11-10 UTC**. All identified actionable defects in the owned, supported
product scope are fixed, reviewed and published in draft [PR #93](https://github.com/djshellshoxxx/GhostPay/pull/93).
The remaining ownership, translation, device, deployment and Sonar boundaries are recorded below.

The final integrated runtime is qualified at
[`4160c91a202d9ec50d2732bbebd5887ef9f5774f`](https://github.com/djshellshoxxx/GhostPay/commit/4160c91a202d9ec50d2732bbebd5887ef9f5774f),
equivalent to local `9a63824f2a878ee9f09fa01a9f32ea366ed0df6d`, with exact Git tree
`9aafe47d6c003db8fe5cabb102a2a5a90dee8f8a`. Public Git fetch verifies the published tree. The closeout update
to this ledger contains documentation only; the qualified runtime remains pinned to that checkpoint.

[CI run 42723876239](https://github.com/djshellshoxxx/GhostPay/actions/runs/42723876239) completed successfully
with **all 24 jobs passing**. [Hosting kit run 42723875721](https://github.com/djshellshoxxx/GhostPay/actions/runs/42723875721)
also completed successfully, with **both packaging and hosted web qualification passing**.

| Final integrated check | Executed result |
| --- | --- |
| Web coverage pass | **2,303 tests passed, 1 skipped; 163 passing files, 1 skipped file** |
| Separate heavy/noncoverage pass | **1 test passed in 1 file** |
| Coverage thresholds | Statements **93.43%**, branches **89.68%**, functions **95.48%**, lines **96.89%**; all existing thresholds pass |
| Full-profile Playwright | **66 passed, 1 intentional profile skip** |
| Lean-profile Playwright | **57 passed, 2 intentional profile skips** |
| Automated accessibility | **200 recorded axe states per profile, zero violations**; incomplete/manual items remain disclosed |
| Monorepo TypeScript, ESLint and build checks | Pass, including catalog/template safety, production-dependency audit and build/output guards |
| Secret, egress and Actions-pin checks | Pass; no gate or allowlist relaxed |
| Contracts and local integration | Contract tests, coverage, static checks, Slither and extra contract projects pass; relayer and Anvil-backed workspace jobs pass |
| Reproducible lean candidate | Two clean builds compare successfully; existing module/worker/executable-output proof remains enforced |
| Hosting kit | Both jobs pass, including actual packaged web/browser qualification |

The web skip is the optional live Bitcoin regtest fixture. Both registry and policy-evidence Anvil test files
pass (four tests each), including the seven cases unavailable in the local run. Full Playwright skips the
lean-only backup case; lean skips the full-only combined-backup and archive-reimport cases. These are
intentional profile differences, not substituted tests.

Axe still reports `label-content-name-mismatch` and `color-contrast` as incomplete/manual-review items.
The device projects use Chromium emulation; physical devices, native assistive technologies and Safari
were not qualified. Local/browser/Anvil fixtures do not establish public-network acceptance.

## Verified starting source and ownership

- Default branch `main`: `14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d`.
- Open draft stack: #84 `48b6bc20108079bb7fbf89997249734bf9f41646` → #88
  `0a68a57b77a70d3bcf4635ccbc5190d735e71f40` → #89
  `cfc7b0f3325a550df830584e86db4c38bcc9d6b2` → #90
  `5628bc00b05a6dd0d9cd89f04f0385d9119281ac`.
- Dedicated branch: `gpt/ghostpay-product-completion-20261109`, based on #90. The previous runtime
  qualification belongs to #90's `42ae712f5804724b4213bed4e2e0cb129f855abf`, not this branch.
- #91 `b748ecdce06d2dfa911144814161c31a46a09e9b` remains the separate merchant/CLI companion.
  Its active continuation is open [#92](https://github.com/djshellshoxxx/GhostPay/pull/92), observed at
  `1a814ada642dabafdc185651454aff6e993080fa` at startup and
  `5ee84c91ea4a88e543b12829ef89694e54b68d0e` at a subsequent source-boundary check, then
  `3a9ce554ff6ae0231c6a41bbb163fcb5477c9e04` (no longer draft) during closeout; neither branch is merged into this product branch.
  A concurrent local CLI completion branch was observed with changes to CLI, invoice-schema,
  merchant-billing, qr-exchange, ux-vault and shared web keystore/receipt/reconciliation/tag/seller-pairing
  libraries. Those files, package manifests, the root lockfile and Vite config are reserved.
- No nested `AGENTS.md` was present in this checkout. Repository conventions, the source-pinned
  continuation handoffs and the supplied task brief apply.
- Existing contained source branches are not replayed. No main merge is permitted while the wider
  parent's required security gate is failing. Production manifests, contracts, authority models,
  deployment pins, schedules and paid agent workflows remain outside this product assignment.

## Task inventory and completion estimates

All identified defects in the owned, supported product scope are implemented and regression-tested. The final
estimates below remain conservative where human review, separate ownership or environment acceptance is outstanding.
They are planning judgments for this assignment, not a calculated security score or a percentage of production readiness.

| Workstream | Initial → final estimate | Implemented / accountable owner | Remaining acceptance or scope boundary |
| --- | ---: | --- | --- |
| Localization infrastructure and dynamic outcomes | 80% → 95% | Transaction worker: structured outcomes, safe nested descriptors, shell/QR/backup copy, BTC/Solana/TRON/registry statuses, exact references and live scan-privacy disclosures | Native translation approval; inventoried disabled policy copy remains source English |
| Accessibility, help and responsive UI | 80% → 95% | Accessibility worker: contextual help, native picker feedback, RTL styles, QR focus/reveal/motion controls, secret-copy lifetime, idle-language timing | Physical devices, Safari and native assistive-technology review |
| QR, receipt, backup and public exchange | 85% → 95% | Security worker + coordinator: UTF-8 matrices, bounded inputs, repeat uploads, cancellation/app-lock guards, visible staged filenames and original-file explanations | Real cross-device acceptance; generic shared QR encoder belongs to the active CLI lane |
| Supported merchant GUI | 85% → 95% | Coordinator: explicit local-registration help, verified receipt/upload guidance, safe retry and vault-control lifetime | Subscription/webhook/shop/CLI completion remains with #91/#92; fixture-only refunds have no operational GUI authority |
| Security and persistence | 80% → 90% | Security worker + cross-review: strict journal/settings boundaries, transient storage recovery, exact post-broadcast results/codes, chain signing-operation guards | Parent Sonar issue inventory inaccessible; independent audit and production authority remain separate |
| Automated qualification | 80% → 95% | Coordinator: full web coverage/heavy suite, type/lint/catalog gates, full/lean builds, build-proof tests, browser journeys | Hosted exact-source results recorded below; live Bitcoin, physical wallets/devices and public-chain acceptance remain separate |
| Documentation and website quality | 75% → 95% | Documentation worker: local Help/Privacy, favicon, no-script entry, product/merchant guides, attribution, verified HTML build entries and corrected current-guide scope | Static documents are intentionally English; human editorial review remains separate; experimental features are not described as operational |

The language registry already contains all fifteen additional requested languages. Only English,
Spanish, Japanese and Arabic ship catalogs; other choices accurately disclose English fallback.
Adding empty or unreviewed security catalogs is not a translation completion claim. Calendar/timestamp
server selection is not implemented in GhostPay; no such control is invented from another project's brief.

## Reproduced defects and completed fixes

- Tag archive: four new cases fail original behavior and pass the fix: unrelated export form erased by
  file choice, stale preview after idle lock, late decryption after lock, and cancelled chooser losing selection.
  Repeated successful import of the same original file is exercised in the passing component test and a
  new full-profile browser journey.
- Settings: two race regressions fail original behavior and pass the fix: a prior endpoint response
  claiming an edited URL is connected, and an older test overwriting the newer result.
- Seller keystore: a pending file read could decrypt/install keys after app lock. The regression fails
  the old component and passes the operation cancellation fix.
- Security worker: fifteen reproduced failures cover Unicode QR corruption/bounds, fragment clearing,
  unexpected serialized settings fields, transient IndexedDB opens and malformed attempt journals.
- Accessibility worker: seventeen reproduced failures cover secret QR reveal scope, dialog focus, motion
  preference changes, stale copy/clear ownership and language changes extending the idle deadline.
- Cross-review: a held successful unlock left a stale operation-kind marker, allowing app lock to enable a
  duplicate vault operation. A real authenticated-deletion regression failed before the fix and passes now.
- Cross-review: embed notification failure could hide a returned payment result and restore send controls;
  the attempt journal still prevented an immediate duplicate broadcast. Result/context are now stored before
  the isolated notification attempt. Safe RPC and explicit-rejection codes survive the post-submit/approval boundary.
- Chain-view review: edits during signing/network validation could restore stale Solana/TRON signatures or
  hand off through an old endpoint; BTC could attach transaction A's acknowledgement to signed transaction B.
  Generation and abort guards now invalidate those operations, with direct cancellation-before-key-derivation tests.
- Final review: Pay's manual removal button still bypassed the fragment helper when automatic clearing was
  disabled. The double-slash-path regression failed before the caller was fixed and now preserves origin,
  path and query while removing the invoice fragment; 61 focused Pay/fragment tests pass.

Initial setup: Node 24.22.1 / npm 11.9.0; frozen `npm ci --ignore-scripts` and `npm run build:libs` passed.
No dependencies were added. Initial incomplete-snapshot failures are retained as diagnostic history; final
qualification below supersedes them. No required check, translation review, contract or deployment gate was relaxed.

## Implementation and regression map

| Feature / file groups | Meaningful verification added or retained |
| --- | --- |
| `src/lib/{errors,transactionOutcome,pay,payExec,wallet,sweep}.ts`, `views/{Pay,Sweep}.tsx` | Nested locale rendering; twelve distinct presentation states; safe code 4001/RPC diagnostics; exact hash retained after journal, callback or embed-notification failure; signed bytes and approval identity preserved |
| `features/{btc,solana,tron,registry}/` | Locale changes during pending requests; unknown and mismatched acknowledgements; reference A/B isolation; edits during signing or endpoint validation; cancellation before deriving a spend key; BTC disclosure/source parity |
| `lib/scanPrivacy.ts`, `views/{Scan,Settings}.tsx`, scan-privacy i18n tests | Source-English parity across 48 transport/window/source combinations; structured blocked reasons; four mounted locale-change journeys preserving unsaved settings, network calls, workers and checkpoints; reviewed-English fallback retained |
| `components/{ContextHelp,Common,QrFrame,SecretBackup}.tsx`, shell/picker/styles | Hover/focus/touch/Escape help, field descriptions, focus trap/restore, reveal tied to exact data, changed reduced-motion preference, copy request/cleanup ownership, persistent-language failure feedback |
| `components/{TagArchive,BackupPanel,ReceiptPanel,ReconciliationLedger}.tsx`, `views/{SellerKeys,SellerPairing,Settings,CreateInvoice}.tsx` | Same/different/cancelled file retry, successful reimport, app-lock and stale reads, unrelated-form preservation, visible sanitized filenames, old/new RPC response ordering, pending storage controls |
| `lib/{qr,fragment,settings,idbStore,duplicateAttemptJournal}.ts` | Independent jsQR Unicode round trips; malformed/oversized text; same-origin fragment clearing; no extra/toJSON secret persistence; failed/blocked IndexedDB retries; duplicate JSON keys and ambiguous types refused |
| `e2e/{contextual-help,product-backup-retry,static-help}.spec.ts` | Real app help at 375px; QR focus/short-screen scrolling/RTL byte equality; repeated original archive download/import; static documents at 375/768/1440px; no-JavaScript navigation |
| `help.html`, `privacy.html`, `public/{help.css,favicon.svg}`, `scripts/localBuildProfile.mjs` | Real HTML entry emission in both profiles; unreported public HTML remains rejected; only app CSS is removed from standalone documents; strict CSP and local assets preserved |
| README/index and product/merchant/payer/privacy/attribution guides | Current network/asset and scope statements, receipt evidence distinctions, accurate backup minimum, source-backed upstream attribution and working local links |

The twelve outcome names are a presentation model, not evidence that every chain has twelve complete transaction
execution/reconciliation paths. Existing inclusion, finality and reorganization checks retain their own evidence rules.

## Localization coverage and explicit exclusions

- Four shipped catalogs contain **2,048 keys**: **245 additions** over the starting 1,803-key catalog.
  There are **1,932 extracted uses, zero missing English keys and 116 unused keys**. The check reports
  **2,664 warnings**, principally identical English security fallback; warnings are not claimed as reviewed translations.
- The existing 24-language registry already contains all 15 additional requested language choices. Only four
  catalogs ship; other choices accurately disclose English fallback. Review/approval status is unchanged.
- BTC's 21 verification/disclosure strings now have catalog identities and a source-parity test. Legacy exported
  source-English text remains compatible while the UI renders descriptors.
- Scan privacy adds 35 security-classified identities. Existing English disclosure/helper outputs and
  `planScan.reason` remain compatible; Settings/Scan render structured companions with the current translator.
  Stored privacy-set results retain their original counts/level data. A locale change does not restart a scan,
  contact another endpoint, rewrite settings or save another checkpoint.
- Disabled experimental policy is an explicit exclusion. It requires `VITE_GHOSTPAY_EXPERIMENTAL_POLICY=1`,
  has no pinned deployment and was not activated. The inventory found 50 literal/frozen `UserFacingError`
  constructors in `create.ts` (6), `pay.ts` (4), `PolicyCreate.tsx` (2), `withdraw.ts` (2), `send.ts` (17),
  `PolicyReceive.tsx` (9), `chain.ts` (8), `PolicyView.tsx` (1), and `guard.ts` (1), plus its English policy banner
  and remaining compound-status plumbing. This is not represented as fully localized.
- Static Help/Privacy and the no-JavaScript entry are English source documents. Protocol/network names,
  addresses, codes, hashes and signed bytes remain data. Pay's `simulated/default` and `yes/no` values are
  stable ICU-select discriminators for localized clauses, not untranslated display labels.

## Integrated local qualification

Runtime source: local `db4b8eb0cd9ec73ed4bd7bb828fdf2cc6fe173f7`, published as
[`94673c7b73d3667c40b6d4c3b2e5804c8c8ccf42`](https://github.com/djshellshoxxx/GhostPay/commit/94673c7b73d3667c40b6d4c3b2e5804c8c8ccf42).
Both trees are exactly `6c6bc7728a79218b8320a7e4062f85a908c9dfe1`; public Git fetch verified the published tree
and #90 ancestry. Only this ledger remained modified after the runtime checkpoint.

| Check | Result |
| --- | --- |
| Web Vitest with v8 coverage, `--maxWorkers=4` | **2,276 passed, 8 skipped; 160 passing files, 2 skipped files**; exit 0 |
| Heavy/noncoverage pass, `--maxWorkers=2` | **1 passed / 1 file**; exit 0 |
| Coverage | Statements 93.35%, branches 89.56%, functions 95.27%, lines 96.85%; all existing thresholds pass |
| Web TypeScript and ESLint | Both pass on integrated source |
| Catalog check/extraction at this checkpoint | Four catalogs with 2,013 keys; 0 errors; 1,897 used; 0 missing; 116 unused; 2,562 warnings. Final source counts are in Localization coverage above |
| Standard full and lean builds | Both pass typecheck, Vite and postbuild bundle scan; Help, Privacy, CSS and favicon present in both |
| Build-profile and bundle-guard unit tests | **33 profile tests and 42 bundle-guard tests pass**; executable/module-proof guards unchanged |
| Secret scan and Actions pin check | Pass; 89 action references pinned to full SHAs with version comments |
| Source boundary comparison | No package/manifests/lockfile, contracts, workflows, deployment trust pins, Vite config or reserved shared CLI libraries changed |

The 8 local skips are 3 registry Anvil cases, 4 policy-evidence Anvil cases and 1 live Bitcoin regtest case.
Local Anvil/compiler/contract artifacts and the bitcoind fixture were unavailable. Hosted qualification is separate;
fixtures never substitute for public-chain or real-wallet acceptance. The first complete run's 6 failures were
corrected fixture/selector expectations introduced by safer copy/help behavior; the clean rerun above passes.

Local Chromium launch was attempted and failed before page execution with
`process_singleton_posix.cc: socket() failed: Operation not permitted`. Collection or component tests
are not represented as browser execution. Hosted CI is recorded separately for exact published source.

## Qualification history and resolved review findings

At runtime commit `94673c7b73d3667c40b6d4c3b2e5804c8c8ccf42`,
[Hosting kit run 42719803867](https://github.com/djshellshoxxx/GhostPay/actions/runs/42719803867)
passed both packaging and the hosted web qualification job. In
[CI run 42719803687](https://github.com/djshellshoxxx/GhostPay/actions/runs/42719803687), lean browser
execution passed **57 tests, with 2 intentional profile skips**. Full browser execution passed **65 tests,
with 1 failure and 1 intentional profile skip**. The failing keyboard-help journey reached the expected
next button, but a mouse pointer left over the original help kept its tooltip visible. The retained browser
snapshot confirms both facts. The revised test separates keyboard and pointer conditions, retains explicit
tooltip visibility, expansion state and keyboard-focus assertions, and has a unit regression preserving
hover behavior. No tooltip runtime behavior or accessibility gate was weakened.

The same browser audit reported a moderate Settings heading-order violation. Its skipped level is corrected,
with a heading-outline regression. ContextHelp and Settings scan-privacy tests pass **9 tests in 2 files**;
targeted ESLint and full web typecheck pass. Browser collection succeeds, but is not execution evidence.
Native screen-reader review and axe's incomplete rules remain separate from automated passes.

That CI run's web coverage pass completed with **2,282 passed, 1 failed and 1 skipped**. The seven Anvil
cases unavailable locally executed successfully (registry's file contains four passing tests in total,
including its always-available guard case; policy evidence contains four). The live Bitcoin fixture remains
the one skip. The sole failure was the new vault-deletion regression's default one-second polling wait
before real authentication reached the storage boundary. The test now awaits an explicit storage-entry
promise and observes the real authenticated-deletion completion, within the unchanged 30-second test budget.
Real cryptography, compare/delete and busy/app-lock assertions remain. Its completion/key-vault follow-up
passes **29 tests in 2 files**, with targeted ESLint and whole-web TypeScript checks passing.
The separate heavy pass did not run after that failed coverage pass. All other CI jobs, including the
contract test/coverage/static/Slither checks, passed except for the full browser job already described;
the TypeScript aggregate correctly failed with web. The next hosted run must qualify these follow-ups.

Final source review also found the manual Pay fragment-removal caller described above and old guides that
contradicted the current supported UI and authenticated-manifest behavior. The security fix is complete.
Targeted corrections cover 17 current Markdown guides and 6 linked SVG diagrams/animations, with 96 local
links/image targets resolving and all 6 SVGs parsing as XML. They distinguish implemented test views,
configured feeds, authenticated deployment data, absent shipped manifests and unestablished live acceptance.
All 6 changed diagrams were raster-reviewed; one existing overflowing PolicyAccount label was fitted using
the existing small-text class and rerendered. Historical handoffs keep their original evidence.

The runtime follow-ups are published at `18cc88429872da10b694a034bad7a17342d16aee`, equivalent to local
`45f014f64eb67ffbefff46761a036324d338c7be`, with exact tree `2dbd3a684b083c6f959c8492d4ada86fd033814c`.
[Hosting kit 42721926596](https://github.com/djshellshoxxx/GhostPay/actions/runs/42721926596) passes;
[CI 42721926824](https://github.com/djshellshoxxx/GhostPay/actions/runs/42721926824) passes both browser
profiles: **66 full tests / 1 intentional skip** and **57 lean tests / 2 intentional skips**. Each profile
records 200 axe states with zero violations; `label-content-name-mismatch` and `color-contrast` remain
incomplete/manual-review items. The same CI run finishes **successfully**, including **2,286 coverage tests
passed / 1 Bitcoin fixture skipped** in 161 passing files and 1 skipped file, plus **1 separate heavy test**.
Statements 93.35%, branches 89.56%, functions 95.27% and lines 96.85% meet all existing thresholds.
The authenticated-deletion test passes with real cryptography. All 24 CI jobs and both Hosting kit jobs pass.

The final supported-copy gap in Settings/Scan is fixed: `planScan` reasons, privacy disclosures and the
completed privacy-set statement now follow the current locale. A new descriptor API preserves the existing
English helper; 35 security-classified keys retain unreviewed English fallback. Focused verification passes
**61 tests in 7 files, including 17 new cases**, plus whole-web TypeScript and scoped ESLint. The four mounted
journeys cover unsaved Settings values, an already blocked scan, an endpoint failure settling during a
locale change and a completed scan; they assert unchanged request/worker/checkpoint counts and stored data.
Two independent read-only reviews found no concrete security, lifetime or disclosure regression. These
changes and the current-guide corrections are included in the final qualified source above.

Runtime code checkpoint: `ccdb88462000823442628a957cb188eb0145aecc`, corresponding to local
`032270ef6e574b8aca741fa1257279a96d3d2d01`, with exact tree `20a7593bcdd0f3d182fe1ee89436b77d94e7a402`.
This includes the current-guide corrections and scan-privacy follow-up. Qualification commit `4160c91`
adds the accompanying ledger checkpoint only. Final integrated hosted results are recorded above.

## External gates

1. PR #84 [Sonar check `128302927200`](https://github.com/djshellshoxxx/GhostPay/runs/128302927200): D Security Rating on New Code, required A. A fresh check-runs
   read showed 31 successful checks, one Sonar failure and one skipped review. The issue inventory API
   returned HTTP 403 with CloudFront `Request blocked`; twelve annotations do not establish the causal
   rule/severity/location. No finding is invented or suppressed.
2. Human review of non-English translations, physical-device/Safari acceptance and public-network
   qualification remain external. Test fixtures do not authorize production deployment or funded payments.
3. Recovery authority decisions, trusted deployment/asset pins, internal-pool ceremony artifacts and
   scheme-2 lifecycle acceptance are separate gates; the experimental flow remains disabled.
4. The reserved `packages/qr-exchange/src/generate.ts` uses the same pinned byte encoder pattern found
   in the web QR helper. Its active CLI owner must assess Unicode behavior before claiming that package
   supports arbitrary Unicode end to end. The unchanged raw `qr.addData(text, 'Byte')` path was rechecked
   at #92's `3a9ce554ff6ae0231c6a41bbb163fcb5477c9e04`. Existing canonical ASCII exchange formats are a distinct scope.

## Publication and consolidation

The integrated product work is published in draft [PR #93](https://github.com/djshellshoxxx/GhostPay/pull/93),
based on #90. The following remote commits have trees identical to their locally reviewed snapshots:

| Remote commit | Completed implementation scope |
| --- | --- |
| `7a2e5607426e9baf8a313cd92baa756d89e3b6ac` | Starting source, ownership and acceptance ledger |
| `313629aae2a9c95f32c1b07fd25fcb3bba2438db` | Structured EVM payment/sweep outcomes, live render-time messages, receipt upload reset and all shared catalogs |
| `fe3a90bc291e60db0e99e372b3cd61e12051302f` | UTF-8 QR encoding, fragment clearing, allowlisted preferences, retryable IndexedDB opens and strict attempt journal parsing |
| `3fdd1e47042cd460efcf95b12094a96d8a8f2950` | Accessible help, localized shell/QR/picker, QR reveal/focus/motion boundaries and secret-copy lifetime handling |
| `5064e70d6a1c07abbf84ac4af583b2adf1f32461` | Repeated archive/key imports, app-lock invalidation, RPC response identity and file-specific help |
| `6c98b3a6aa52d9203b9bc97f01ff0afca3519463` | Local Help/Privacy pages, favicon, source-backed product/merchant/attribution guides and corrected navigation |
| `3e77d31ee503caf3e4d3ee7f6fba006d8568362b` | Static-page browser cases at mobile/tablet/desktop widths and no-JavaScript navigation |
| `8a48b1c26334b418fd062a7f0c69294c82a199bd` | Preserve returned payment results, hashes and safe codes across notification and journal failure |
| `4502ccc4c25edbb81fc47e74a4ddf84adf09a943` | Visible staged filenames, vault operation-kind reset, and local source/attribution navigation |
| `2fdc31f9c884a530bedd0fe3db8974cb8ecc17a6` | Verify that an unreviewed clipboard translation uses approved English fallback |
| `a55258b213fd635809fc6cf55985a47bd0a89f8c` | Live BTC/Solana/TRON/registry outcomes, exact reference identity, and cancellation of stale signing operations |
| `0cb1e6b8f6e43849e87bdf12085dc281f6bfe0a6` | Distinguish form controls from contextual-help buttons in browser selectors |
| `94673c7b73d3667c40b6d4c3b2e5804c8c8ccf42` | Emit standalone Help/Privacy through verified HTML build entries without weakening executable-output guards |
| `bc9f28901ecde16750510f0c2f2ff1c9d4d387bd` | Reuse the hardened fragment helper for Pay's manual Remove link action |
| `1ac4b4fb0a64634e220c00ace0ac0951f86df61a` | Correct Settings heading order and separate keyboard-help assertions from mouse-hover state |
| `18cc88429872da10b694a034bad7a17342d16aee` | Synchronize the vault-lock regression with real authenticated storage entry and deletion completion |
| `c0d62534f3bb4cbc039451f908baa923afc969df` | Correct current guide/diagram claims about manifests, feeds, test views, scan evidence and disabled experimental support |
| `ccdb88462000823442628a957cb188eb0145aecc` | Render scan-privacy disclosures, blocked reasons and completed privacy-set data in the current locale |
| `4160c91a202d9ec50d2732bbebd5887ef9f5774f` | Integrated source/evidence ledger; final fully qualified runtime checkpoint |

Focused evidence for these cycles: transaction/localization 582 tests across 19 files; accessibility/help/QR/
clipboard 115 across 12; security/persistence 86 across 11; archive follow-up 25 across 3; coordinator lock/retry/
RPC regressions 7 across 3. These runs overlap and are **not summed** or substituted for the final full suite.
The integrated web typecheck passed. Five async-test lint issues were corrected; their focused rerun passed.
Seventeen accessibility/clipboard/idle cases and fifteen security/persistence cases reproduced failures on
the starting source, in addition to the seven coordinator race/retry regressions.

Hosted CI exposed a concrete regression on `5064e7`: the new direct GitHub footer link violates the existing
bundle origin policy, so both browser jobs stopped before page execution. The correction routes to the local
source/attribution help section, which has an explicit repository link. No scanner allowlist, security gate
or workflow is weakened. [Failed build evidence](https://github.com/djshellshoxxx/GhostPay/actions/runs/42717252055)
and [browser setup evidence](https://github.com/djshellshoxxx/GhostPay/actions/runs/42717251743) are preserved.

All compatible worker changes, follow-up fixes, tests and current documentation are consolidated in this
dedicated branch. The final runtime and browser qualification are recorded at the top of this ledger.
The final closeout commit only records acceptance evidence here; its publication is visible in PR #93's
commit history. Source branches and the separate #91/#92 CLI lane are preserved. No main merge is attempted
while the parent Sonar gate remains unresolved.
This source is not merged, released, deployed, professionally audited or production-qualified.

## Next acceptance milestone

Obtain PR #84's Sonar issue/hotspot inventory with rule, severity and source location (the ordinary issue
and hotspot API requests returned HTTP 403, CloudFront `Request blocked`). Reproduce and resolve the actual
causal findings without changing the required A security rating. Then review the qualified product branch
with the stack owners, coordinate the reserved generic QR encoder correction with #92, and run the native
translation/device/live-fixture acceptance listed above. No deployment, recovery authority or trusted pin is
created by this handoff.
