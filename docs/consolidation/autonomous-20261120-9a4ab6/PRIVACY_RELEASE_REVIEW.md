# Required privacy release review

## Result

The existing privacy stack contains the required implementation work; it is not
incorporated into the frozen #307 candidate. Preserve that stack and its owners.
The latest corrective PR **#336 now has completed failed hosted gates**, so its
older “pending acceptance” description is no longer the current qualification
state. This review adds evidence only; no product, test or gate changed.

Issue [#286](https://github.com/djshellshoxxx/GhostPay/issues/286) defines five
mandatory **v1.0** privacy requirements. Issue
[#287](https://github.com/djshellshoxxx/GhostPay/issues/287) defines four mandatory
**v1.1** requirements and explicitly says they must not delay v1.0. Neither issue
is closed. The existing standalone v1.0 candidate must remain separable from the
v1.1 additions; incomplete persistent retention is a v1.1 blocker, not a new v1.0
requirement.

## Immutable scope and ownership

| Role | Source |
| --- | --- |
| Current-cycle audit base | `ab622aa0f59dd2b70d48308123c2bb9fee91893c` |
| Frozen main | `aec179910c39081d820396409ff3139ff2264132` |
| Frozen authoritative candidate, #307 | `5a745d4b5fba69b66a9779f88aefc63c253a4f27` |
| Required-v1.1 parent | `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9` |
| Proof-preview retention, #326 | `a34ce43e296e302e3e65ed077ea8ac892c5189a1` |
| Focus reconciliation, #327 | `9608ec996fb159f11b84b9baec0b48033a48a6a5` |
| Wallet-disclosure browser-driver repair, #336 | `410353a23631234aa888e46f38df22291c699a26` |
| #336 complete tree | `a506f54f1cd2c7ee5bbc007299e4a82a78d62a87` |
| Actual hosted checkout for all six inspected failed jobs | `de0abd3f33f5f147a506743f87919230ad038197` |

The hosted checkout's GitHub commit object has **exactly the #336 tree**. Its
parents are #327 and #336. The failed results below therefore apply to the actual
#336 source, not an unverified merge composition. #326 is an ancestor of #327,
and #327 of #336; #336 is an ancestor of neither frozen main nor #307.

Worker: `/root/privacy_release_review`; isolated branch:
`audit/ghostpay-privacy-release-20261120-9a4ab6`. The claim preceded report writes.
A bounded ownership check of the frozen 111-PR path inventory found zero owners
of this new `PRIVACY_RELEASE_*` evidence prefix. Existing source owners are not
reassigned. The held integration lease, all shared branches and the source PRs
remain untouched. This snapshot extends `ACTIVE_WORK.md` rather than replacing it.

## Nine-requirement implementation matrix

“Implemented in source” describes the bounded existing implementation and its
preserved focused evidence. It does not mean the complete acceptance criteria or
an integrated release candidate passed. Paths below are relative to `apps/web/src`
at #336 unless a different source is named. Exact mode/blob content and SHA-256
comparisons for 71 relevant runtime, test and evidence paths are retained in
`PRIVACY_RELEASE_SOURCE.json`.

| Requirement | Inspected existing privacy implementation | Frozen #307 relationship and qualification limit |
| --- | --- | --- |
| **v1.0 — global masking** | `lib/privacyMode.tsx` provides 30-second, scope/revision-bound temporary reveal, visibility and session/lock revocation. `SensitiveContent` uses hidden/inert/accessibility boundaries without unmounting recovery state. `AppShell` wraps sensitive views/status; Settings has its own controls. | These module families and provider wiring are absent from #307. **Missing integration.** Existing narrow secret controls do not establish the global requirement. Current hosted navigation/quick-hide focus assertions fail; accessibility acceptance is incomplete. |
| **v1.0 — clipboard protection** | `lib/clipboardPrivacy.ts` retains a digest, tracks copy/cleanup generations, rechecks before dispatch, compares current contents before clearing and leaves denied reads untouched. Settings offers off/30-second/1-minute/5-minute choices; `ClipboardPrivacySync` revokes old policy work. Common and secret-backup callers preserve lifecycle authority. | #307's common copy button directly calls the clipboard and lacks the new configurable helper/settings. **Missing broader integration; existing backup-specific behavior is not global completion.** Native read/write races and OS clipboard history remain outside the guarantee. |
| **v1.0 — wallet, account and lock privacy** | `useWalletPrivacy` binds view authority to wallet/session/lock lifetimes, aborts stale continuations and revokes temporary display. Pay, Registry and Policy use it; the wallet helper retains account/chain rechecks. Idle source preserves sole-copy material while removing ordinary authority. | #307 has underlying locking, signing/review and backup-preservation controls, but lacks this hook and latest UI/idle continuation. **Partial relative to the required release behavior.** Preserve #331/#333 ownership when composing; do not replace protected-state retention with indiscriminate deletion. |
| **v1.0 — private transaction history** | `PrivateHistory` requires unlocked authority plus a separate temporary reveal. `WalletAttempts` filters by the current wallet account/chain; ReconciliationLedger uses the encrypted-vault boundary. The journal remains stored when its details are hidden. | #307 lacks `PrivateHistory`; its WalletAttempts has no current-wallet prop/filter. **Missing required presentation integration.** New hosted failures expose fixtures that expect details/clear controls without current wallet context; they do not establish lost journal records. |
| **v1.0 — safe exports and notifications** | Fixed names cover policy/tag and payment recovery exports; `tagArchive.ts` returns `ghostpay-tags.gpa` while retaining the encrypted payload timestamp. Policy/export refusal descriptors omit selected-address values. Existing output review inventories fixed titles, neutral root errors and no production Notification API producer. | #307 already has neutral names on several ordinary exports, but its tag filename still contains a date and it lacks the per-payment export branch. **Partial / missing later source.** Intended export bodies, encrypted invoice fragments and recovery references remain functional; this is not arbitrary data erasure. |
| **v1.1 — local address reuse** | `LocalAddressReuseLedger` is bounded to 256 in-memory observations; scope changes clear it. Pay records only known-hash payment outcomes and separates same-payment, deliberate repeat, reused, unavailable and limited-history states. No remote lookup is added by the policy. | This Pay ledger/hook/UI is absent from #307. **Missing integration.** It observes intended destinations, not settlement or global address freshness. The distinct Sweep `DestLedger` and #341 testnet support must not be counted as this same feature or as current #307 browser wiring. |
| **v1.1 — invoice minimization** | `invoiceMetadata.ts` transforms unsigned descriptive fields: omit memo, replace required descriptions with neutral `Item`, retain quantity/amount fields, then use normal schema/signing. Both CreateInvoice and MerchantTemplateIssuer expose the mode and invalidate stale outputs on policy/input changes. | The helper/mode is absent from #307. **Missing integration.** Existing signed profiles/invoices and shared links are not rewritten; the feature is limited to these browser issuers, not every CLI/SDK output. |
| **v1.1 — wallet disclosure** | Immutable bounded previews cover account access, chain switch, transaction send and typed-data signing. The dialog shows known account/chain/target/value/request details, distinguishes typed-data domain chain, and requires individual decisions. Scope/expiry/privacy cancellation is wired through the three production callers. | The dedicated controller/provider is absent from #307, which still has ordinary payment/Sweep review. **Missing four-method disclosure integration.** #336 preserves exact-method browser approval and refusal assertions, but current built-browser focus/lifecycle acceptance fails. The app cannot control extension behavior or decode arbitrary contract effects. |
| **v1.1 — local retention** | The bounded registry receives only presentation cleanup callbacks. Default-off invoice/proof policies support 5/15/60-minute active-app expiry and revision-bound preview/confirmation. Invoice issuer previews and deliberately shown **included** proof QR/text are covered. #327 reconciles missed preference events on focus. | **PARTIAL even on the privacy stack**, and these controls are absent from #307. Persistent transaction/invoice metadata and terminal-record cleanup remain unimplemented. A hidden preview does not delete its source record, pending transaction, journal, backup, trust or reorg evidence. |

The existing [source checkpoint](https://github.com/djshellshoxxx/GhostPay/blob/410353a23631234aa888e46f38df22291c699a26/docs/privacy-release/STATUS.md)
reports **eight requirements with implemented source and focused evidence, plus
partial retention**. The selected source reads support that bounded
implementation description. It is not an 8/9 release-completion claim: all nine
need their appropriate integration and acceptance, and current hosted failures
remain. A whole-project completion percentage cannot be derived from this matrix
or the branch census.

## Current hosted qualification — failures replace stale pending status

The metadata snapshot time is in `PRIVACY_RELEASE_REMOTE.json`. Reads are not
atomic. No job was started, rerun, cancelled or edited by this review. #326 and
#327 retain failed CI, Pages and Beta acceptance. #336's three relevant workflows
are now also completed with failure.

| #336 gate and job | Actual result at the identical source tree | Immediate failure boundary |
| --- | --- | --- |
| [Pages site build](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158452/job/136527105628) | **Passed** fresh library build, Pages tooling/build/site checks and source scan | Site construction succeeded; that is separate from browser acceptance. |
| [Pages browser](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158452/job/136527106205) | **10 passed, 1 failed, 5 not run** | At `pages-devnet.spec.ts:412`, expected saved hash is not visible after reload. UI displays the current-wallet connection requirement. Setup, Chromium and build succeeded. |
| [Beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158557/job/136527105979) | Library/CLI stages passed, CLI **124/124**; browser **1 passed, 2 failed** | At `devnet-journey.spec.ts:140` and `:271`, the same post-reload hash expectation precedes the required wallet-scoped reveal. |
| [Full browser](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703059) | **131 passed, 3 failed, 2 skipped** | Navigation focus, the changed-wallet alert expectation, and focus restoration after quick hide fail. |
| [Lean browser](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703083) | **118 passed, 3 failed, 5 skipped** | Same three failure names. The same cases across profiles are not unique additive tests. |
| [Full web unit command](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703109) | **4,202 passed, 1 failed, 1 skipped**; 301 passing files, one failed, one skipped | `SharedComponents.i18n.test.tsx`'s WalletAttempts case expects the clear control while rendering without current wallet context. No full web pass is claimed. |
| [Rest-0 scripts](https://github.com/djshellshoxxx/GhostPay/actions/runs/44805158399/job/136570703240) | Its final Node suite: **413 passed, 1 failed, 0 skipped** | `network-egress-inventory.test.mjs:175` detects a stale documented reference count (`getRpc` references 7 versus 6). The whole rest-0 job fails; earlier package successes do not override it. |

The full and lean browser failures occur at `e2e/app.spec.ts:232`,
`e2e/flows.spec.ts:172` and `e2e/wallet-disclosure.spec.ts:67`. The first and third
are focus assertions. The middle case expects an alert after account-change
refusal; its failed alert check does not by itself establish whether a send
occurred. Retain the downstream no-send/no-journal assertions and investigate the
current cancellation/rendering contract before choosing a correction.

The hosted CI metadata also records successful full typecheck, typed lint, build,
lean-candidate, source/egress and contract jobs. Its failed `typescript` job is an
aggregate dependent result, not a separate compiler failure. Conditional Pages
release/deploy/smoke skips are not waivers of browser acceptance and no deployment
ran. Security gates remain in force; this bounded review does not assert complete
security qualification.

The observed journal failures are consistent with the inspected account/chain
visibility guard in `WalletAttempts.tsx`. They are **not evidence of erased
transaction history**. A correction must establish the intended wallet context
and deliberate reveal, while independently retaining stored hash, duplicate
refusal and chain-outcome assertions. Do not restore unconditional history
visibility merely to satisfy an older test expectation.

## Retention and recovery boundaries to preserve

The existing [retention census](https://github.com/djshellshoxxx/GhostPay/blob/410353a23631234aa888e46f38df22291c699a26/docs/privacy-release/evidence/retention-gen2-census.md)
explains why persistent cleanup is not completed: current stores also carry
recovery authority, duplicate prevention, trust decisions, reorg/tombstone evidence
or a potentially sole copy. The inspected callback registry has no durable storage
adapter or arbitrary deletion capability. Future persistent cleanup needs a
specific eligible nonessential field and revision-bound confirmation within its
storage transaction. Age, a receipt status or a returned hash is insufficient.

Masking retains DOM/memory and mounted workflows. Clipboard comparison cannot be
atomic against an external application, and operating-system clipboard history
is outside browser control. Local reuse observations prove neither finality nor
anonymity. Disclosure is a local explanation/approval boundary, not a guarantee
about an extension's later display or network behavior. New non-English catalog
entries remain source-English drafts according to existing evidence; native
language review is not established here.

## Exact next actions under existing ownership

1. **Existing #336 acceptance owner:** reconcile the three journal fixtures with
   the existing current-wallet visibility contract; inspect the two focus
   failures and the account-change cancellation/alert mismatch. Preserve every
   payment, stored-hash, duplicate, refusal and no-send assertion. The existing
   PR remains the test-driver authority; source review must precede any broader
   runtime correction.
2. **Existing privacy/network inventory owner:** inspect the added `getRpc`
   reference and its dispatch authority before updating the documented egress
   snapshot. The guard is detecting a real source/snapshot mismatch; do not
   suppress it or change an expected count without review.
3. **Existing required-v1.0 owner:** qualify the separately preserved branch
   `work/ghostpay-required-v1-candidate-20261120` (frozen local ref
   `74dccc419bf5c82b21875d205ed5a97d0c4e69b6`). Re-read its live head before action.
   Keep v1.1 retention and disclosure additions out of its release dependency.
4. **Existing v1.1/retention owner:** keep persistent retention explicitly partial;
   select a positively justified nonessential field only after the protected
   record census is reconciled. #339/#341 package evidence is separate from
   browser caller and final composition qualification.
5. **Integration lease holder:** compose the qualified privacy source with current
   main, #307 and existing recovery/idle stacks only after exact source/ownership
   reconciliation. Run applicable combined-source gates; no donor pass qualifies
   a newly merged tree automatically.

Original verification commands for the corrected owned stack, after its normal
source-built prerequisites are ready (listed, **not executed here**):

```sh
npm exec -w @ghostpay/web -- vitest run src/components/SharedComponents.i18n.test.tsx --maxWorkers=1 --coverage.enabled=false
node --test scripts/tests/network-egress-inventory.test.mjs
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run test -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run test:e2e -w @ghostpay/web
BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh
bash scripts/beta/acceptance.sh --skip-build
```

The focused command is for the identified fixture; it is not a substitute for
full coverage/nocov or browser acceptance. Retain the workflow's actual profile
and prerequisite settings when running hosted equivalents.

## Evidence integrity and review limits

`PRIVACY_RELEASE_REMOTE.json` contains fetched issues, exact PR metadata, workflow
and job states, the verified hosted commit/tree, and a per-log byte/hash index.
`PRIVACY_RELEASE_HOSTED_LOGS.json.gz` losslessly preserves all six complete decoded
job logs returned by GitHub: **1,099,637 UTF-8 bytes**. Every decoded log's SHA-256
and byte count was checked after decompression, and all six record the same
checked-out commit. The archive itself has compressed/uncompressed hashes.
`PRIVACY_RELEASE_SOURCE.json` preserves path hashes, ancestry and the report-prefix
ownership check. No tests, builds, browser sessions, payment requests or security
probes were executed by this worker. Existing results are read evidence at their
specified sources, never new passes for #307 or this documentation branch. The inspected Playwright
configuration uses Chromium, including device emulation; it does not establish
Firefox/WebKit, a physical mobile device, real wallet-extension or live Tor
acceptance. Those environments remain unverified by this review.
