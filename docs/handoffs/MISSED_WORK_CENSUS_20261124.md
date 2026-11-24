# Missed-work coverage and failure matrix — 2026-11-24 UTC

Worker `/root/missed_work_census`; coordinator `/root`. Source-pinned recovery snapshot; no release or merge approval.

The live census returned 343 open PRs in four pages (100/100/100/43). PR heads, bodies and associated workflows were inspected, then exact failure logs were read. These are observed receipts, not qualification of a later head/composition. The initial main snapshot was `f76904301cff0b24d65ea4e31cbf37d470db4d95`; the final remote recheck was `706188000c38b3dde5a3a362370a530870aa7587`. #569/#373/#583 heads remained unchanged.

## Coverage

| Task | Exact existing PR/head | Remaining requirement | Owner/status |
| --- | --- | --- | --- |
| Ledger CSV | [#555](https://github.com/djshellshoxxx/GhostPay/pull/555) `3ae56a5e0b3df9ce57e9bbf2a44c82b56e432033` | Five inspected gates passed. Current-main composition and integration still required. | Existing #522/#555 owner |
| Manifest readback | [#531](https://github.com/djshellshoxxx/GhostPay/pull/531) `e9e9d60dacb6458796f3e1b5d704f1afdca62ae0` | Existing root-manifest/mapping/CLI work; general CI was queued. | Existing #531 owner |
| Clipboard beyond Create link | [#580](https://github.com/djshellshoxxx/GhostPay/pull/580) `b634e816a403ac6b07a6685bac575ca683a17cb5` | Existing helper covers 25 further actions; Pages/Beta/Hosting/CLI passed. Composition remains. | Existing #580/#553 owner |
| QR workflows | [#581](https://github.com/djshellshoxxx/GhostPay/pull/581) `41a598b8433e10a95598c72c2a23027e63010024` | Existing QR source and coverage; Pages/Beta/Hosting/CLI passed. General CI queued. | Existing #581 owner; QR production paths excluded from this worker |
| Mobile qualification | [#588](https://github.com/djshellshoxxx/GhostPay/pull/588) `46150f4ce0a34da0e23dda36642ba9463ff1e4a1` | Four Memo-selector failures/profile repaired locally. 24/24 supported cases pass per profile; six virtual-camera cases/profile still need full Chromium. | This worker; completed child 6ea8140c468b2f1ad0036737a2e13f8cad8d30cb |
| Responsive Pages | [#583](https://github.com/djshellshoxxx/GhostPay/pull/583) `c1980912f87f0293b7a15f2419505a6719c5f3a8` | Existing viewport/zoom/RPC work; preserve owner CSS. Its checkVisibility predicate may resolve #569 after reproduction. | Existing #583 owner |
| Live-document masking | [#569](https://github.com/djshellshoxxx/GhostPay/pull/569) `c30283d28ec15f0c4fddb8a80d1c5f60ee590401` | Seven renderer signal 11 exits plus one Home 320px input overflow assertion. Separate causes before changing source. | This worker; isolated investigation child |
| Account/vault privacy | [#571](https://github.com/djshellshoxxx/GhostPay/pull/571) `63f40efac175e5ee49563326dbef930aafb14235` | Wrong-chain notice mismatch and obsolete Tor save-message assertion. | Coordinator owns wrong-chain continuation and #436 reuse |
| Tor/RPC compatibility | [#578](https://github.com/djshellshoxxx/GhostPay/pull/578) `20733b6a8ebc6a2598d5baff2eed62d58a0a7675` | Pages/Beta pass; actual Tor Browser/onion acceptance remains tracked under #363. | Existing #578/#363 work |
| Dashboard totals | [#579](https://github.com/djshellshoxxx/GhostPay/pull/579) `6366767fb632ab3a01603497b49f12714ab796bb` | Existing exact arithmetic. Historical scan records are not independently verified revenue. | Existing #564/#579 owner |
| Offline payer session | [#590](https://github.com/djshellshoxxx/GhostPay/pull/590) `f01c69d277c39c76fd3077103c43cc38f7f9c736` | Pages/Beta/Hosting/CLI passed. Reconcile with newer #591 parent and qualify composition. | Existing #590/#591 owners |
| Encrypted interrupted draft | [#591](https://github.com/djshellshoxxx/GhostPay/pull/591) `49862e2d3b4832f1f52714f5bc1bc551af2fe54f` | Pages/Beta/Hosting/CLI passed; general CI queued. #590 used earlier parent revision. | Existing #591 owner |
| GhostStore catalogue/cart | [#550](https://github.com/djshellshoxxx/GhostPay/pull/550) `974fe2ce363e6d7644e3d4f080a98d6f37b68e35` | Offline catalogue/cart exists; no Pages entry import. Production auth/storefront/checkout/fulfilment not supplied. | Existing catalogue owner; production F08 gap remains distinct |
| GhostStore provider qualification | [#556](https://github.com/djshellshoxxx/GhostPay/pull/556) `08faa16e1a03fe8c87f97f02257363750b52c920` | Existing 41-test offline/provider fixture does not complete production auth adapter/storefront. | Existing fixture owner; broader F08 continuation not established |
| Minimal invoice sharing | [#585](https://github.com/djshellshoxxx/GhostPay/pull/585) `b82be893d3d360064222fafcce8cef2033cd23a5` | Unsupported exact query option blocked compilation. Local correction now has22 tests and full/lean browser1/1 passes. | Recovery agent child 54696ccf6d50990cb4482f55189688fd31098fcd |
| Receipt/timestamp retention | [#587](https://github.com/djshellshoxxx/GhostPay/pull/587) `19a11f90db0bcf84c94a0b883a310e103ce8878a` | Existing source; Tor expects obsolete save-message copy. Reuse existing #436. | Coordinator coordinates Tor repair |
| Multi-tab isolation | [#541](https://github.com/djshellshoxxx/GhostPay/pull/541) `f5bc0d6c71260e11fc89b28c42c65446e31d335f` | Two policy-prompt/wallet-lock browser cases pass full/lean; broader invoice/account/ledger scenarios not all covered. | Existing narrow owner; map broader remaining scenarios |
| EVM destination reuse | [#584](https://github.com/djshellshoxxx/GhostPay/pull/584) `17c5a2ee3828d0132cfdf21e4c966ca7550d07f2` | Preserve existing source while payment-safety continuation assesses combined behavior. | Existing #584 owner |
| Local destination reuse | [#586](https://github.com/djshellshoxxx/GhostPay/pull/586) `f024ce3e0eab91df40bfd5a75aee2a56d9158e5a` | Existing local-chain source; EVM-only evidence does not qualify every chain. | Existing #586 owner |
| External-wallet preview | [#589](https://github.com/djshellshoxxx/GhostPay/pull/589) `697cb7314c323b574bfbb1f102244265046dd93a` | Reload warning mismatch distinct from native crashes/layout and unknown-outcome alert mismatch. | Recovery agent owns six retry-warning fixture corrections; native failures separate |
| Fiat feeds | [#592](https://github.com/djshellshoxxx/GhostPay/pull/592) `e9025d72f1408ec48e6d1ca29a5361a55175ec31` | Windows CLI rekey timeout: 567 passed, 2 skipped; no causal fiat-code defect established. | Package qualification agent; retain timeout until evidence resolves it |
| Reconciliation restore/rescan | [#575](https://github.com/djshellshoxxx/GhostPay/pull/575) `5a225f6cdaeeaf9c6dad8d8a11f3f437fff83727` | Pages restore/rescan assertion expects No linked observation; actual persisted evidence needs reproduction. | Package qualification agent |

Fee edge-case #514 is already merged as `e0cb4681e453af77bb10be45ba61b4d19579f41b`; do not reimplement its negative near-tie savings correction. Broader fee UI remains in existing #504 work.

## Original failed receipts

| PR | Exact job | Finding | Next requirement |
| --- | --- | --- | --- |
| #585 | [138255157612](https://github.com/djshellshoxxx/GhostPay/actions/runs/45338185328/job/138255157612) | apps/web/src/views/CreateInvoice.ordering.test.tsx:78 passes `exact` in Testing Library ByRoleOptions, which rejects that option. This prevents the web build and related Pages/Hosting/Beta gates. | Correct the role query without weakening exact name matching; run source typecheck and affected test. |
| #589 | [138253002105](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337514963/job/138253002105) | Two devnet journeys after reload cannot find 'A previous wallet attempt for this action already exists in this tab.' | Inspect actual retained journal and current scoped disclosure before changing expectation; preserve zero-duplicate-send assertions. |
| #589 | [138253001755](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337515114/job/138253001755) | Firefox has renderer crashes, a 320px layout failure, and an expected-alert mismatch where the UI reports unknown wallet outcome. | Separate deterministic behavior/layout defects from crashes. Do not mark the entire run flaky. |
| #571 | [138253367612](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337629467/job/138253367612) | devnet-journey wrong-chain scenario cannot find 'The wallet network changed. Reconnect and review again.' | Verify account-switch privacy cleanup and payment refusal, then reconcile correct current notice. |
| #571 | [138253368048](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337629571/job/138253368048) | scripts/tor/browser-acceptance.mjs:81 waits for old exact scan-settings save text. | Reconcile existing dedicated localization correction PR #436. Do not duplicate its implementation. |
| #587 | [138251886114](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337165063/job/138251886114) | Same old exact Tor scan-settings save-text expectation as #571. | Reconcile PR #436 via owner integration. |
| #569 | [138251329944](https://github.com/djshellshoxxx/GhostPay/actions/runs/45336997113/job/138251329944) | Firefox full run has eight failed tests: seven renderer-crash failures and a Home 100% 320px viewport-control overflow assertion. | Reproduce the layout assertion independently; do not treat all failures as environment failures. |
| #575 | [138247553517](https://github.com/djshellshoxxx/GhostPay/actions/runs/45335829578/job/138247553517) | Pages restored-profile/rescan journey cannot find 'No linked observation.' in the ledger section. | Inspect current expected reconciliation state from source and fixture, retain recovery and deduplication assertions. |
| #592 | [138252548191](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337380251/job/138252548191) | CLI backup-command rekey case exceeded 60000ms; 567 other tests passed, two skipped. | Check resource/transient evidence and source overlap before narrow Windows retry; no fiat change justified by this failure alone. |

The #569 full job reported 132 passed, 2 skipped, 8 failed. Seven content processes exited with signal 11; the eighth failure reported a Home-100percent-320px INPUT at left 33/right 959, with document-width/scroll assertions passing. These are separate failures.

## Completed mobile child

Final head `6ea8140c468b2f1ad0036737a2e13f8cad8d30cb`; tested implementation `7d112a5678496d851e8ec22d6603fbb4dec971cf`, tree `f8c2a602c5a7f8f420cb957ae5d6aa1161821fa6`. Only the Memo paragraph selector/exact complete text assertion changed. Real file chooser, denied-camera fallback, review-before-open, backup and wallet safeguards remain. Lean/full 24/24 across four real Chromium/WebKit device descriptors passed. Libraries/web build, typecheck, focused typed lint and secret scan passed. Six virtual-camera cases/profile remain excluded only from local CLI selections and require full Chromium; no committed skip/config weakening. See `docs/handoffs/MOBILE_588_MEMO_ASSERTION_20261124.md` on the mobile child.

## Firefox source findings and limits

No document-wide MutationObserver exists in #569 privacyMode or SensitiveContent; privacyMode.tsx is byte-identical to parent #373 `b660b2d8f3f84ddf72f684d13913f643f33f2eee`. The two production observers watch only details open changes in QR/file import. Script-termination warnings also follow passed tests, so revoke in stderr does not establish an observer loop. Seven actual renderer signal 11 exits still require diagnosis.

Full Home includes the collapsed MerchantProfilePanel through mainPrelude. Its input is a candidate for the stale rectangle. Existing responsive #583 uses checkVisibility(), while #569 uses getClientRects().length. This remains a lead until native reproduction. Preserve #583 CSS, native versions, all axe rules and privacy/payment source ownership.

#569 uses exact Playwright 1.65.1 and Firefox 159 / build 1572. Earlier smoke on mobile #588 Playwright 1.64.1 / Firefox 157 / build 1555 is not #569 qualification. Correct runtime and locked dependencies were installed before #569 tests.

No remote comments, branch updates, merges, deployments or releases were performed by this worker. Coordinator review and exact-composition qualification remain separate.

## Concurrent continuations rechecked during this work

A refreshed live GitHub read found these successors. Preserve their owners;
local evidence on a duplicate branch does not become evidence on a different SHA.

| Continuation | Exact live head | Coordination and remaining gate |
| --- | --- | --- |
| [#598 account privacy](https://github.com/djshellshoxxx/GhostPay/pull/598) | `86450d8d459ccf4a6925742d082e1c7ad0905e75` | Existing production feedback fix adopted by coordinator; finish actual Anvil/Tor qualification rather than create a competing fix. |
| [#599 reconciliation](https://github.com/djshellshoxxx/GhostPay/pull/599) | `0c7f680d0791668a68c3a92d7d4ba44087dcf2b8` | Existing fixture corrections adopted by package worker; actual Pages/Anvil replay remains separate from its 72 unit tests. |
| [#600 minimal invoice](https://github.com/djshellshoxxx/GhostPay/pull/600) | `c8f892f2aaa4423450689a4d7f91dff24230ed8b` | Retained code continuation of #585. Removes unsupported exact option while retaining exact string-name semantics. |
| [#603 duplicate evidence](https://github.com/djshellshoxxx/GhostPay/pull/603) | `2d612e37f3f71b785129f447c14731cbef9143c7` | Confirmed closed as duplicate of #600. Its full/lean browser evidence is preserved on its own branch and is not a run on #600. |
| [#601 fee timing/asset validation](https://github.com/djshellshoxxx/GhostPay/pull/601) | `02d9b7149ad715a7c2c9229f5297f0aa0834c415` | Existing combined continuation of timing/preview owners; do not duplicate. PR reports source reconciliation with main 7061880. |
| [#602 recurring M4 qualification](https://github.com/djshellshoxxx/GhostPay/pull/602) | `8d8fe2f0986bc5796dae2081ef34602c6a9db703` | Existing test-only child of #456, 129 F10 tests reported; production module remains dormant. |
| [#568 accepted-late-reorg qualification](https://github.com/djshellshoxxx/GhostPay/pull/568) | `c6817a2e46a684cc29450fc0bc18d48fc6e9f500` | [Core CI 45333644284](https://github.com/djshellshoxxx/GhostPay/actions/runs/45333644284) now independently rechecked completed/success; coordinator reports all five workflow groups green on this exact head. |

The #569 layout child now has implementation commit `c79a8103`: replace the
rectangle-count visibility predicate with the existing #583 checkVisibility
predicate. Native diagnostic evidence reproduces the closed input's exact
left 33/right 959 rectangle under tracing, with checkVisibility false; opening
it gives left 33/right 287. A visible 500px negative control is still detected.
The original full and lean reflow cases now each pass 1/1, with 18 default axe audits per profile and zero violations/skips. Remaining renderer crashes match the primary upstream Playwright #44135/#43967 issue; stable 1.65.1 remains affected, while the fix is on the 1.66 development line. No engine/rule workaround was introduced. The complete native gate remains blocked; see PR569_FIREFOX_REFLOW_20261124.md.

## Final coordination update

These later source observations supersede earlier pending-status entries while
preserving their original failed receipts. PR #597/#604/#605/#606/#607 metadata
were read live; the coordinator supplied the later completed qualification
receipts below. No result transfers to a different source tree automatically.

| Work | Final existing continuation | Evidence / disposition |
| --- | --- | --- |
| Mobile #588 | [#597](https://github.com/djshellshoxxx/GhostPay/pull/597), `a929b178a6626a9912f5d081b8a3e8c6847374ae` | Published tree equals local mobile handoff `7a582426fdafa8cedd7a81109f922c9a12fcb2a5`; full/lean 24/24. Original virtual-camera limitation remains explicit. |
| Offline #590/#591 | [#604](https://github.com/djshellshoxxx/GhostPay/pull/604), `2f2c282e4e88e32fb54648864bb9ed51c8307880` | Existing stack completion reports 234 unit/catalog and 12 map tests plus original full 9/lean 9 browser cases. Production TypeScript remains the #590 source; hosted gates remain distinct. |
| QR #581 | [#605](https://github.com/djshellshoxxx/GhostPay/pull/605), `73f521bad57c24e44fe5c69fbdeecd1d2da2fec1` | Existing bounded dense-code decoder completion reports 258 package tests and original invoice-image scenario in both profiles. Preserve its separate full-camera qualification limit and owner. |
| Ledger #522/#555 | [#607](https://github.com/djshellshoxxx/GhostPay/pull/607), `78193fca9477c297a62937e4cdd032fdb15772c4` | Current-main composition preserves the exact #555 merchant-ledger package and original repair. Reports 31 package tests; no duplicate implementation needed. |
| Wallet preview #589 | [#606](https://github.com/djshellshoxxx/GhostPay/pull/606), `f941ac01fd9464fc881266dcc2d2e1e530d5f15b` | Recovery worker completed 93 units, original native Firefox full 1/lean 1, Beta/Anvil 3 and Pages/Anvil 16. Whole-suite native crash gate is still separate. |
| Retention #587 | [#609](https://github.com/djshellshoxxx/GhostPay/pull/609), `00078ed6a2561e948fae50593ab9eb36d5f47be9` | Coordinator reused exact #436 script; 55 hosting tests passed with one Docker skip, plus two real static-browser origins. |
| Fiat #592 CLI receipt | [Run 45337380251](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337380251), attempt 2 | Coordinator reports terminal SUCCESS. No code or timeout changed; retain attempt 1 as the original failure rather than misclassifying fiat source. |
| Reconciliation #599 | Qualification branch commit `8e0bbe97b84817472b1322a95bbc58cf77d7cd57` | Package worker completed the original 16/16 Pages/Anvil scenarios; #599 remains the code continuation. |
| #565/#568 evidence | Qualification handoff commit `bc3360e14e10dd014f52dce0a23f3712d2196c0b` | Final green evidence is preserved by the package/coordinator branch; #568 core CI success independently checked above. |
| Encrypted notice on #598 | Coordinator source `b2d222772fec857b69eb626afe3b8f58c0b8dfbd` | Coordinator reports 40 units and original Anvil 3/3 passed; lean static-hosting check was the final check before publication. Preserve that owner, with no competing change here. |

The #569 ordinary reflow continuation is complete locally in both profiles;
its source-pinned handoff and normal qualification receipts are versioned next
to this matrix. No engine-crash reproducer or workaround is part of the child.
