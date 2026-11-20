# Browser views and current feature audit

Status: **complete for the assigned production-source scope**. All 99 unique path/blob versions across 63 paths were read. The coverage file maps those reviews to 504 path/ref instances across eight pinned refs. This is source-review completion, not an all-clear statement about the repository or deployed software.

## Scope, pins and method

This review covers the browser entry points, every production file under `apps/web/src/views` and `apps/web/src/features`, and the registry reference contract carried with that feature. It does not extend into future-feature packages. Libraries, shared components, translations/styles, backend services and underlying chain/cryptographic packages have other review owners. Cross-boundary source excerpts were inspected where necessary to substantiate findings below.

| Ref label | Pinned commit |
| --- | --- |
| main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| release | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| consolidation | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| privacy-snapshot | `d6819796a9542acc488b896786faffe83b913d9b` |
| quick-hide | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| clipboard | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` |
| format | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| erc20-simulation | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |

In this report, **baseline group** means main and erc20-simulation, which share the relevant view/feature blobs. **Updated group** means the other six refs. AppShell additionally has unique privacy-snapshot and quick-hide changes, which were read independently. Current line references below refer to consolidation unless otherwise stated; the coverage map records byte-identical variants on the other refs. The erc20-simulation branch must not be assumed to contain the newer lifecycle/privacy work simply because it is among recent branches.

`web-views-coverage.json` contains one record per unique path/blob, including its representative ref/commit and every equivalent source ref. Reviewed means the complete source was read directly or the complete already-read baseline and the complete variant diff were read. Searches and hash comparisons were used for navigation and identity accounting, not as substitutes for reading.

| Area | Paths | Unique versions read |
| --- | ---: | ---: |
| Entry points and application state | 6 | 11 |
| Core views | 9 | 18 |
| Bitcoin feature | 17 | 27 |
| Policy feature | 17 | 22 |
| Registry feature and reference contract | 2 | 3 |
| Solana feature | 6 | 9 |
| TRON feature | 6 | 9 |
| **Total** | **63** | **99** |

No production source was changed, and no endpoints were probed, transactions submitted, exploits constructed or tests executed. Relevant existing test source was inspected as noted below. Findings distinguish observed source behavior from runtime validation and identify the prerequisites and limits of each conclusion.

## Findings and disposition

| ID | Severity | Baseline group | Updated group | Disposition |
| --- | --- | --- | --- | --- |
| WV-01 | Low | Present | Present | Wallet connection lifecycle gap; final severity narrowed by independent quality review |
| WV-02 | Low | Not present in the required-field format | Present | UI corroboration of `ZC-CRYPTO-01`; count only once |
| WV-03 | Medium | Present | Addressed in source | Idle-lock authority retention; already prepared release fix |
| WV-04 | Medium | Present | Addressed in source | Stale sweep context; already prepared release fix |
| WV-05 | Low | Present | Present | TRON test-network label/identity mismatch |
| WV-06 / MC-03 | Low | Present | Partially addressed | Native TRON/BTC/Solana improvements; TRON token receipt disclosure remains |

The five independent view finding families comprise two unchanged issues, two corrected baseline release gaps and one partially corrected privacy issue. The coordinator correction incorporates the independently confirmed TRON token path from MC-03 and narrows WV-01 to Low for its established non-transactional effect. WV-02 is a sixth entry only to preserve cross-layer evidence; it duplicates the schema report's primary finding. No critical/high-severity issue was established in this assigned source scope. That statement does not grade the other audit domains.

### WV-01: Wallet connection continues app-issued provider requests after the initiating operation becomes stale

**Final severity:** low, consent/lifecycle. **Confidence:** high for source behavior. **Affected refs:** all eight. The original Medium proposal was reduced after independent review: the helper can continue account/chain requests, but does not sign or submit a transaction and principal callers reject stale results.

**Evidence.** `apps/web/src/views/Pay.tsx` captures a session/version and flow guard in `onConnect`, but calls `connectWallet(w, chainId)` without passing that guard and checks currentness only after the helper resolves: main lines 697–717; current lines 805–825, invocation at 812. `apps/web/src/lib/wallet.ts` lines 231–247 continues through account, chain and optional chain-switch requests after awaited provider responses without a currentness/cancellation argument. The library reviewer verified the unchanged helper behavior on all eight refs. The view rejects a stale final result, but subsequent app-issued provider actions can already have occurred.

The same pattern appears in `apps/web/src/features/registry/RegistryView.tsx`, main lines 130–145 and current lines 145–160: revoking the publication-consent checkbox invalidates result adoption but does not stop this helper's continuation. `apps/web/src/features/policy/PolicyView.tsx`, main line 43/current line 45, also calls the helper. Policy money-moving operations remain independently gated by the intentionally empty deployment pin set.

**Prerequisites and impact.** A connection has been initiated and a provider response remains outstanding while the user locks, leaves the view or revokes the initiating operation. When that response returns, GhostPay can issue further connection/chain-selection requests under stale application consent. This does not claim that GhostPay can cancel an already-open external wallet prompt, and it does not establish an unauthorized transfer.

**Remediation.** Give `connectWallet` an initiating-operation guard; assert it before each new provider request and after each awaited response. Retain the existing guard before adopting the result. Keep external-wallet limitations distinct from the app's obligation to stop issuing new requests.

**Safe regression guidance.** With an in-memory fake provider, hold the initial account response, invalidate the operation, resolve the held response, and verify that no later application provider request or result adoption occurs. Cover navigation, session lock, selected chain changes and registry-consent revocation. This regression was not executed in this audit.

**Known-status note.** The library review cross-references this integrated view issue. No fix was identified in the selected refs; it should not be counted again merely because several callers share the helper.

### WV-02: Receipt guidance promises a prepared-recipient check that optional-field binding can skip

**Severity:** low, assurance precision. **Confidence:** high. **Affected refs:** updated group. **Primary finding:** `ZC-CRYPTO-01` in `crypto-schema-review.md`; this entry is duplicate UI corroboration.

**Evidence.** Current `apps/web/src/views/Pay.tsx` lines 678–688 supplies an expected `stealthAddress` whenever the page has a current prepared payment. Current `packages/invoice-schema/src/receipts.ts` lines 24–25 make the receipt field optional; line 155 compares it only if the receipt also contains the field. The receipt blob is `a991e6aa7ac6bb2cea5758a1d79409c513758311`. The successful UI at current `Pay.tsx` lines 1279–1282 does not distinguish omission. The explicit overstatement is in the introductory guidance at `apps/web/locales/en.json` line 973, which says the prepared one-time address is checked; the success bodies themselves accurately enumerate their narrower digest/chain/asset/amount checks. A correctly seller-signed receipt omitting that optional address can therefore receive the same success state although that comparison was skipped. The baseline receipt blob requires the field.

**Prerequisites and impact.** An otherwise valid seller-signed receipt omits its optional recipient while the page has a prepared recipient. The result overstates the checks performed. The UI separately says that a seller-key attestation does not independently prove payment; this materially limits impact and is why this is not reported as payment proof forgery or established loss of funds.

**Remediation.** When the caller supplies an expected recipient, either require the receipt to carry the matching value or make the binding result and UI explicitly identify an unchecked recipient. Preserve support for intentional minimal receipts without promising checks that were skipped.

**Safe regression guidance.** Use signed local fixture receipts with absent and mismatched recipients and verify that the displayed assurance corresponds to the checks performed. The schema reviewer inspected the deliberate optional-field test; accepting the format is intentional, while this finding concerns the UI assurance.

### WV-03: Baseline idle lock retains signing authority when preserving an unbacked key session

**Severity:** medium. **Confidence:** high. **Affected refs:** main and erc20-simulation. **Updated status:** addressed in the other six refs.

**Evidence.** Main `apps/web/src/AppShell.tsx` lines 145–168 starts the idle-lock flow. Lines 157–163 return early when loaded keys cannot safely be discarded and the signer is not lost. This preserves the sole copy, but the surviving session's signing authority is not suspended. Other views receive an app-lock notification, which clears sensitive form state, but ordinary session authority remains available after this custody-preserving return.

Current `AppShell.tsx` lines 257–272 calls `suspendSession()` synchronously at line 263, before the custody lookup, clears operational state and invokes the guarded recovery decision. The updated implementation restricts the retained session to the seller recovery route. These changes address the authority-retention gap while preserving custody; this audit does not treat permitted encrypted recovery export as a separate vulnerability.

**Prerequisites and impact.** An unbacked or not-yet-verified key session remains loaded at idle timeout, and someone subsequently uses the same unlocked browser. Ordinary actions can continue with the baseline retained session despite expiry of the idle-lock interval. No remote-access prerequisite is assumed.

**Remediation.** Integrate the already prepared synchronous suspension behavior into the actual release. Preserve the sole copy of keys while revoking ordinary authority, including pending operations, before asynchronous custody checks.

**Safe regression guidance.** For an in-memory session without a verified backup, expire the idle lease and verify that ordinary invoice/sweep/signing operations remain unavailable while the documented encrypted recovery route remains available. Also cover failed custody reads and stale replies belonging to a replaced session.

**Known-status note.** This is a release-integration gap relative to the existing custody/idle work, not a novel claim that custody preservation is itself wrong. Main's code identifies the related G2-05/GP-PAGES-02 work, and the selected updated branches carry the suspension fix.

### WV-04: Baseline sweep initiation is not invalidated by edits to its reviewed context

**Severity:** medium. **Confidence:** high. **Affected refs:** main and erc20-simulation. **Updated status:** addressed in the other six refs.

**Evidence.** Main `apps/web/src/views/Sweep.tsx` lines 138–157 captures only the session/authorization epoch. Destination and mode remain editable at lines 354–388; edits do not increment that epoch. Pending quote/direct/relayed closures retain their original destination and target at lines 176–209 and 242–264. The baseline handoff callbacks, lines 202–205 and 263, persist the attempt without rechecking current form context.

The downstream baseline `apps/web/src/lib/sweep.ts` confirms the gap: `relayedSweep` lines 172–263 checks the session and quote, but has no caller review guard; `directSweep` lines 562–664 checks the session before signing and handoff, but likewise cannot observe view edits. Its exact-transaction review compares bytes with the original captured input, so it does not detect that the displayed destination/mode has since changed. The original session need not change for this to occur.

Current `Sweep.tsx` lines 134–161 scopes balance/quote state and invalidates actions on destination/mode/provider changes. Lines 421–458 recheck `assertReviewCurrent`, pass it into the helper and assert it again before durable handoff. Current `lib/sweep.ts` lines 290–291 and 956–957 combines the session guard with the supplied review guard. The current native flow also uses a one-use expiring fee-review capability.

**Prerequisites and impact.** The user has initiated a sweep, then changes a relevant field while vault authorization or a provider read is still pending. The baseline can continue signing and submitting the previously captured context after the form shows a different one. This is a stale user-consent/context issue, not a claim that a remote party can choose a new unsigned destination or bypass cryptographic transaction review.

**Remediation.** Integrate the existing context invalidation and guard chain. Invalidation should stop new pre-handoff work; a form edit after an actual handoff must retain the attempt's durable outcome evidence because it cannot unsend a transaction.

**Existing regression source.** The full current `apps/web/src/views/Sweep.quoteLifecycle.test.tsx` was read. It covers recipient/balance/provider/mode/selection changes during vault/RPC work, refusal at the handoff callback and retention of submitted/unknown evidence after handoff. This is evidence of prepared regression coverage; tests were not run in this audit.

### WV-05: TRON's selected test network is not checked against the connected node

**Severity:** low, testnet-only network/consent assurance. **Confidence:** high. **Affected refs:** all eight.

**Evidence.** `apps/web/src/features/tron/rpc.ts` lines 38–43 obtains genesis and refuses only the mainnet value; it does not accept a selected-network argument. `apps/web/src/features/tron/TronView.tsx`, main lines 103–112/current lines 109–118, calls this check without the selected network. Current line 110 grants network authority for the selected `net.id`, but line 117 merely performs the mainnet-refusal check. The authority label therefore does not authenticate the node's chain.

The review label is derived from `wallet.net.label` in `apps/web/src/features/tron/sweep.ts`, main line 80/current line 107. `features/tron/network.ts` lines 20–21 already carries distinct Nile and Shasta genesis constants, and lines 24–26 gives each selection a different label. A node can honestly be Nile, Shasta or a local chain different from that label and still pass `checkNetwork`.

**Prerequisites and impact.** A user selects one test network but supplies an endpoint for a different non-mainnet chain. Scan results, signing preparation and broadcast can concern another test chain while the review identifies the selected one. The existing mainnet-genesis refusal remains intact. This finding does not establish a production/mainnet fund-loss path or an authenticated identity guarantee against a dishonest node.

**Remediation.** Pass the selected network into the connection check, require the corresponding known genesis for Nile/Shasta, define an explicit local-chain identity policy, and bind that verified identity to the operation and review.

**Existing test source and safe regression guidance.** The full current `features/tron/chain.hardening.test.ts` was read. Its genesis test explicitly accepts both Nile and Shasta through the same network-agnostic function. Add local fake-client coverage ensuring each known genesis only satisfies its own selected network. Define and test how local mode treats known public genesis values. This would detect honest misconfiguration; a genesis-only check should not be advertised as full protection against a lying node.

**Known-status note.** The source documents a prior correction to the mainnet genesis constant; WV-05 is a separate selected-test-network binding gap. No fix for it appears in the eight selected refs. Coordinate with the multichain review to avoid duplicate counting.

### WV-06: Baseline non-EVM scans disclose matched payments through follow-up requests

**Severity:** low, privacy in experimental testnet flows. **Confidence:** high. **Baseline native/BTC/Solana issue:** main and erc20-simulation. **Updated status:** those named paths are addressed in the other six refs through local scanning and explicit disclosure choices; TRON token receipt lookups remain match-conditioned on every ref (MC-03).

**Evidence.** After local key matching, the baseline makes these remote requests:

| Main source | Follow-up request |
| --- | --- |
| `apps/web/src/features/solana/scan.ts`, lines 70–85, call at 76 | Balance of every matching one-time address |
| `apps/web/src/features/tron/scan.ts`, lines 63–81, calls at 70 and 81 | Balance of every matching native address, plus the funding transaction memo when funded |
| `apps/web/src/features/btc/scan.ts`, lines 183–188, call at 184 | Unspent-status query for every locally matched candidate outpoint |

A remote provider can observe which records matched the user's local keys and group them by request session. This is narrower than key disclosure. Baseline source comments acknowledge some reads, but Bitcoin's user-facing verification limits/mode descriptions (`features/btc/verification.ts`, lines 18–19 and 38–40) describe provider spentness and IP/range exposure without identifying the matching-output disclosure.

Current Solana and native TRON browser scanners remove the named balance/memo calls and defer the selected-address reads until sweep review: `features/solana/sweep.ts` lines 43–48 and `features/tron/sweep.ts` lines 46–60. Current Bitcoin defaults `providerSpentCheck` off and tracks spends locally; `features/btc/scan.ts` lines 61–66 documents the optional disclosure and line 228 gates the provider call. Light oracle mode requires provider-check authorization at lines 114–115. `features/btc/BtcView.tsx` lines 740–748 displays the exposure notice and checkbox, including the forced disclosure in explicitly selected light mode. Unknown/incomplete local spend coverage is withheld from spending authority.

**Prerequisites and impact.** The user scans against a provider able to observe the request session. That provider learns matching one-time addresses/outpoints it would not learn from block-range scanning alone. Experimental/testnet restrictions limit financial exposure, but do not eliminate this privacy linkage.

**Remediation.** Integrate the existing local-spend/explicit-review changes and keep the provider-disclosure text accurate. Optional provider checks and light mode should convey their privacy tradeoff before use.

**Safe regression guidance.** Use synthetic block fixtures with matching and nonmatching records to verify that default scan-time traffic is independent of the match set. Separately verify that only an explicitly authorized selected-address review or provider-check mode causes wallet-specific requests. Current TRON hardening test source already asserts no balance/memo request during scanning and one selected-address read at review. No runtime claim is made here.

**Known-status correction.** The named native TRON/BTC/Solana paths are prepared privacy repairs. However, `packages/tron-adapter/src/scan.ts:124–125,157–158` still requests token receipts only after local matching, before the current browser discards those token candidates. This unchanged package path is MC-03 and leaves the combined privacy finding partially repaired in the updated group. Count the overlapping baseline disclosure once. Separately, default EVM match-specific evidence reads remain a documented tradeoff (ZC-CHAIN-O01), so no all-chain anonymity claim follows. The updated explicit Bitcoin provider-query mode is not an unresolved vulnerability merely because it makes disclosed, user-chosen requests.

## Completed control review and limits

The entry points and core views were read for custody, lock lifetime, authorization, confirmation integrity and privacy. Updated flows add synchronous idle suspension, scope/version guards around asynchronous work, revocable network authorization and guarded recovery. `CreateInvoice` ties work to the session and validates numeric/size bounds. `SellerKeys` retains backup/import/export step-up checks and distinguishes download from a verified recoverable backup. `Settings` validates provider profiles and guards stale saves. `Pay` rechecks the invoice, session, wallet, prepared transaction, expiry and fee-buffer context before handoff. `Scan` scopes encrypted persistence and stale-result adoption. These observations describe the source reviewed and do not replace the other reviewers' library validation.

All policy source and variants were read, including deployment/payment evidence, withdrawal state and journal recovery. The app's trusted policy deployment map is deliberately empty, and test-only injected profiles are not production import authority. Canonical block/code/account evidence and exact payment/withdrawal facts are checked before that feature's actions. Intentional demonstration and deployment gates were not classified as fund-loss vulnerabilities.

Registry publication requires affirmative consent and custody readiness and uses guarded transaction review and submission verification; WV-01 isolates the earlier connection continuation. The reference ERC6538 source was read as a reference artifact, without deployment or live interaction.

Solana and TRON keep explicit sign/broadcast stages, invalidate pending signing state on form changes, clear software wallet material on lock/unmount and retain ambiguous submission as an uncertain outcome. Their testnet scope and documented ephemeral-wallet model matter to the conclusions. The network identity exception is WV-05.

The Bitcoin review includes the complete view, header cache/synchronization, Esplora parser, oracle selection and bridge, scan worker/protocol/client, encrypted scan store, signing review and verification disclosures. Source controls include bounded requests/ranges, header-bound transaction and witness checks, checked cache restoration, worker capability limits, encrypted metadata separated from secrets, explicit oracle/provider privacy choices and refusal to treat incomplete local spend coverage as spending authority. The published distinction between server-provided header-chain evidence and full consensus validation remains material; this audit does not claim independent live-chain verification.

The production coverage excludes test-file exhaustiveness. Two directly relevant complete test files were additionally read: consolidation `apps/web/src/views/Sweep.quoteLifecycle.test.tsx` and `apps/web/src/features/tron/chain.hardening.test.ts`. Other test references or excerpts were navigational support, and are not represented as complete test-suite review or successful execution.

## Handoff

No owned production versions remain unread. The shared inventory's 17 additional `web-views` versions under `apps/web/src/i18n` and `apps/web/src/styles` belong to the root reviewer and are intentionally absent from this coverage file. Shared libraries/components and underlying chain packages retain their separate owners. Consolidation should preserve the exact baseline/updated distinction above, deduplicate WV-02 with `ZC-CRYPTO-01`, coordinate WV-01 with the browser-library notes and coordinate WV-05 with the multichain notes.
