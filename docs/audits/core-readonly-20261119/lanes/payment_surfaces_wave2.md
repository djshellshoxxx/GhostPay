> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay payment surfaces — review wave 2

## Scope and result

This is a read-only static source review of the remaining assigned payment/browser surfaces, registry and experimental policy UI, merchant-ledger, and chain-adapters. It covers immutable blobs reachable from the 20 selected heads in `selected-heads.json`. Application, configuration and test files were not changed; no application or test execution, live probing, exploit construction or remote publication was performed. Findings below are source-level conclusions, not deployed-contract or browser-runtime verification.

This wave confirms two low severity web product/recovery regressions and one low severity accounting defect in an ancillary package whose current consumer is the paused CLI. A fourth item is a conditional preactivation observation in disabled policy UI. No new high or medium severity issue was confirmed by this wave. Earlier payment findings remain in `payment_ui_review.md` and `.json`; this report supplements that generation.

## Coverage and continuation

| Coverage | Blobs | Version-lines |
|---|---:|---:|
| Reviewed production | 89 | 18176 |
| Reviewed tests/helpers | 14 | 2250 |
| Remaining test code | 163 | 37551 |

All production blobs in this wave’s assigned-path inventory are reviewed. The repository-wide audit is still in progress: the remaining test code must be completed by a fresh worker, and root must reconcile all ledgers against all selected heads. Counting lines or listing filenames was never treated as a source read. A reviewed blob was inspected in full, or by a complete diff against another fully read version; byte-identical versions are mapped across heads.

The machine-readable authority is `payment_surfaces_wave2.json`: `files` is an array of `{path, blob, refs, lines, test, status, method?, handoff_owner?}`. `refs` contains full commit SHAs. A `(path, blob)` pair is the unit of review. `status` is `reviewed` or `pending`. Every pending entry has an explicit owner. Do not infer that an entry assigned elsewhere has been reviewed.

### Handoff ownership

| Owner | Pending blobs | Version-lines |
|---|---:|---:|
| fresh payment/tests successor | 149 | 34877 |
| custody lane; coordinate against its ledger | 13 | 2513 |
| root; coordinate against its ledger | 1 | 161 |

Explicitly reserved overlap: custody owns pending `TagArchive*`, `tagArchive*`, `tags*`, and `ReconciliationLedger*` tests; root owns `sweepAttemptJournal.test.ts`. All other pending entries belong to the payment/tests successor. Tag/tagArchive production source was reviewed here; the portable tag-archive codec belongs to custody. Policy-scheme package and main Solidity contracts belong to the protocol lane. Root owns embed helpers and opStackFee.

### Fresh worker instructions

1. Read this report and the JSON ledger, plus the earlier payment ledger, without rereading completed blobs.
2. Continue only pending files assigned to the payment/tests successor. Prioritize payExec/Pay/Sweep review and transaction tests, then policy send/withdrawal/evidence tests, chain-adapter RPC/payment/scan tests, and the remaining QR/component/merchant tests.
3. Read complete bodies or complete diffs to a fully read baseline. Record exact `(path, blob)` progress and all representative refs. Test inventories and test names are not review evidence.
4. Keep the audit static and notes-only. Do not edit app/test/config code, execute tests, create reproductions or publish remotely.
5. Preserve each issue’s exact branch scope and current exposure. Empty policy deployment pins and paused CLI usage are material limits.
6. Save a new bounded handoff before context pressure. Root will arrange a fresh continuation.

## Findings

### PS2-01 — Privacy branches never pass the connected wallet to WalletAttempts

**Severity:** Low. **Category:** Availability / recovery UI regression. **Status:** Confirmed by static call-site tracing.

**Affected scope:** feat/ghostpay-privacy-quick-hide-20261120, snapshot/ghostpay-privacy-8be15289-20261120.

The privacy implementation filters the journal by an optional wallet prop and hides all account/hash/clear controls when it is absent. Every production caller still renders WalletAttempts without that prop. Connecting a wallet therefore cannot reveal those journal rows or their explicit-clear action.

**Impact and limits.** Journal history and recovery controls are unavailable in the affected branches. The duplicate-attempt journal still blocks retries, so unresolved attempts can leave users stuck without the intended recovery action. A transaction hash may still be visible in the current transaction view. No theft, false success or loss of journal protection is established.

**Recommended correction.** Pass the live connected account and chain from every caller, remove the scope immediately on disconnect/account/chain changes, and preserve the separate PrivateHistory reveal and explicit-clear consent.

**Acceptance criteria:**

- Route-level tests for Pay and Registry must exercise the actual caller wiring: disconnected journal stays masked; connecting the matching account/chain makes only its rows eligible for a deliberate reveal; changing identity hides them again.
- An unknown attempt must continue blocking a duplicate request until the explicit clear action is confirmed; privacy controls must not silently clear journal state.

**Source evidence:**

- [apps/web/src/components/WalletAttempts.tsx:10–40](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/components/WalletAttempts.tsx#L10-L40) at `137628961463fc5abd8b7927b2efe6b18a0a206a`; blob `a9aef3f940bed8f3e26a45ffd75aedea2f0b5563`. Optional wallet prop controls visibility and clear controls.
- [apps/web/src/views/Pay.tsx:1059](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.tsx#L1059-L1059) at `137628961463fc5abd8b7927b2efe6b18a0a206a`; blob `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099`. Invoice-load caller omits wallet.
- [apps/web/src/views/Pay.tsx:1127](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.tsx#L1127-L1127) at `137628961463fc5abd8b7927b2efe6b18a0a206a`; blob `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099`. Payment caller omits wallet.
- [apps/web/src/features/registry/RegistryView.tsx:272](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/features/registry/RegistryView.tsx#L272-L272) at `137628961463fc5abd8b7927b2efe6b18a0a206a`; blob `5ca89f54457128b887eb9107fc4eac66ce8c0530`. Registry caller omits wallet.
- [apps/web/src/features/policy/PolicyPay.tsx:129](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/features/policy/PolicyPay.tsx#L129-L129) at `137628961463fc5abd8b7927b2efe6b18a0a206a`; blob `2c29b545732754997b4ac0c3fb93096f125ee511`. Experimental policy caller also omits wallet.
- [apps/web/src/components/WalletAttempts.test.tsx:11–52](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/components/WalletAttempts.test.tsx#L11-L52) at `137628961463fc5abd8b7927b2efe6b18a0a206a`; blob `d7fda34e0967a86ecd591892076d9883903c19cd`. Component tests supply wallet manually and therefore do not cover the missing route integration.

### PS2-02 — Bill print stylesheet hides receipt print content

**Severity:** Low. **Category:** Product correctness; no security impact established. **Status:** Confirmed CSS cascade and import-chain conflict; browser print not executed.

**Affected scope:** All 20 selected heads; identical print.css, app.css and PrintableBill.tsx blobs.

AppShell eagerly imports Pay; Pay imports PrintBillButton; PrintableBill statically imports print.css. Its print-media body descendant rule hides every element with !important and restores visibility only for bill-sheet. The receipt-print visibility rule in app.css lacks !important. ReceiptPanel calls window.print directly for receipt-print content, so that content remains hidden under the globally loaded bill stylesheet, regardless of stylesheet ordering.

**Impact and limits.** Receipt print output has no visible receipt content (blank output is the expected browser result). On-screen receipt data, JSON export and signatures are unaffected by this cascade finding. No browser or printer reproduction was performed.

**Recommended correction.** Use an explicit active print target or a shared print stylesheet that scopes visibility rules to the selected bill or receipt. Ensure only the chosen print target is restored.

**Acceptance criteria:**

- Validate the computed print-media visibility and generated output of both bill and receipt actions in the same application bundle.
- The selected bill/receipt must print; unrelated page content, raw JSON and action controls must remain excluded.

**Source evidence:**

- [apps/web/src/AppShell.tsx:15](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/AppShell.tsx#L15-L15) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `8e2006a8309403f336efda82c1cc6eb6699f04c4`. Eager import of Pay.
- [apps/web/src/views/Pay.tsx:35](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Pay.tsx#L35-L35) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099`. Static import of PrintBillButton.
- [apps/web/src/components/PrintableBill.tsx:8](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/PrintableBill.tsx#L8-L8) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `64ba221722b1c88adb74c6c68960e95e48855c98`. Global static import of print.css.
- [apps/web/src/styles/print.css:4–21](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/styles/print.css#L4-L21) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `5c803193b91431c4dd96f6421ae41b5e92740046`. Important global hidden rule and bill-only visibility exception.
- [apps/web/src/styles/app.css:247–253](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/styles/app.css#L247-L253) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `a1951f57c00346323b6306c3af46867dae6d6262`. Receipt visibility exception is non-important.
- [apps/web/src/components/ReceiptPanel.tsx:301–318](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/ReceiptPanel.tsx#L301-L318) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `b6cc91507f78283db57a7bb5f99b28f27711fffc`. Receipt uses receipt-print and a direct window.print action.
- [apps/web/src/components/PrintableBill.test.tsx:1–111](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/components/PrintableBill.test.tsx#L1-L111) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `4e80b81546f6d10464ef2dd25464036113d0e817`. Existing test body checks bill output/style text and print invocation, not the combined receipt CSS cascade.

### PS2-03 — Merchant export duplicate invoice detection depends on sort adjacency

**Severity:** Low. **Category:** Accounting data integrity in ancillary package. **Status:** Confirmed source-level defect; no web consumer found.

**Affected scope:** All 20 selected heads; export.ts blob 00217cc059a213a9b6dc34f8aca29aed81a109ca.

resolveAll sorts invoices primarily by createdAt and only compares adjacent ids. Duplicate ids at different timestamps can be separated by another invoice after sorting and escape the advertised duplicate-invoice rejection. All export formats and the tax summary consume resolveAll.

**Impact and limits.** Callers can receive repeated invoice identifiers and duplicated totals in exports or summaries. Current repository consumers are in the paused CLI; no apps/web import was found. This is not an established current web payment vulnerability.

**Recommended correction.** Check invoice-id uniqueness with a set or map independently of the output sort, then keep the deterministic date/id ordering.

**Acceptance criteria:**

- Duplicate identifiers must be rejected independent of input order, differing creation dates and intervening records.
- Every exporter and taxSummary must enforce the same uniqueness invariant.

**Source evidence:**

- [packages/merchant-ledger/src/export.ts:118–123](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/merchant-ledger/src/export.ts#L118-L123) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `00217cc059a213a9b6dc34f8aca29aed81a109ca`. Date-first ordering with adjacent-only duplicate check.
- [packages/merchant-ledger/src/export.ts:128–147](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/merchant-ledger/src/export.ts#L128-L147) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `00217cc059a213a9b6dc34f8aca29aed81a109ca`. CSV uses the affected resolver.
- [packages/merchant-ledger/src/export.ts:240–256](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/merchant-ledger/src/export.ts#L240-L256) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `00217cc059a213a9b6dc34f8aca29aed81a109ca`. Tax totals use the same affected resolver.
- [packages/merchant-ledger/src/ledger.test.ts:283–289](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/merchant-ledger/src/ledger.test.ts#L283-L289) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `ee0270fc6fbd7402262c89b33f4213a03bd294e3`. Existing duplicate test covers adjacent equal-date duplicates.
- [packages/cli/src/commands/export.ts:1–11](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/cli/src/commands/export.ts#L1-L11) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `474d8ecc1a03cd1f8db87947ad1f8012c266177b`. Only discovered production importer belongs to the paused CLI.

### PS2-04 — Experimental PolicyPay input edits do not invalidate an in-flight review guard

**Severity:** Low (latent, preactivation). **Category:** Conditional review/consent consistency. **Status:** Source-level observation; production activation blocked.

**Affected scope:** Both PolicyPay variants across selected heads; experimental policy off by default and no pinned deployment.

PolicyPay captures a prepared transaction and a guard bound to session and deployment. After send begins and awaits RPC/other work, the meta-address, token and amount fields remain editable. Their handlers clear rendered reviewed state but do not invalidate the captured guard or prepared object used by the existing send closure. Reviewing again also does not advance a guard revision. The send library checks captured transaction bytes against its captured review, not against the new visible inputs.

**Impact and limits.** If the policy feature is activated with a deployment, an operation already in progress can continue with an older review after the user edits the displayed terms. Wallet confirmation still exists; this is not a proven bypass of wallet approval. No active production exposure is claimed because PINNED_POLICY_DEPLOYMENTS is empty.

**Recommended correction.** Before activation, bind each review/send operation to a live UI revision and invalidate it on input change, replacement review and unmount; alternatively prevent edits throughout the pre-handoff operation. Check the revision immediately before wallet handoff and preserve truthful post-handoff outcomes.

**Acceptance criteria:**

- An edit to recipient/meta-address, token or amount while awaiting authorization/RPC/allowance work must prevent any subsequent wallet request for the superseded review.
- A newer review must not revive an older in-flight operation, and a response from a request already handed to the wallet must still be journaled truthfully.

**Source evidence:**

- [apps/web/src/features/policy/PolicyPay.tsx:43–75](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/PolicyPay.tsx#L43-L75) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `2c29b545732754997b4ac0c3fb93096f125ee511`. Review guard captures only session/deployment and send retains captured review across awaits.
- [apps/web/src/features/policy/PolicyPay.tsx:95–117](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/PolicyPay.tsx#L95-L117) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `2c29b545732754997b4ac0c3fb93096f125ee511`. Payment inputs and Review remain enabled during busy; input handlers only clear React state.
- [apps/web/src/features/policy/send.ts:89–141](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/send.ts#L89-L141) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `04ac08be009c2942b394f35975171325738ce12a`. Downstream checks use the captured guard and review.
- [apps/web/src/features/policy/chain.ts:30–34](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/chain.ts#L30-L34) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `758e19ef20d5f1ad2d3388979fb2d59e9db6578c`. Empty production deployment allowlist limits current reachability.
- [apps/web/src/features/policy/flag.ts:1–13](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/policy/flag.ts#L1-L13) at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; blob `0102c120e4a94724919e6e5ea7e097f04d60e802`. Experimental feature remains off by default.

## Retired hypotheses

- **TagVault plaintext returned after a session switch.** Mounted production AppShell synchronously calls services.vault.lock on subscribeSession events, invalidating the revision before in-flight tag operations can release results. TagArchive also guards its async operations. Custody reviewer confirmed the integration.
- **PolicyView record reuse across ordinary seller replacement.** The ordinary seller replacement flow requires navigating away to SellerKeys, which unmounts PolicyView and drops its local records. No reachable production path for the same-mounted-component hypothesis was demonstrated.
- **Policy action clearing uses key instead of id.** duplicateAttemptJournal.clearAttempt explicitly accepts either an attempt id or an attempt key.

The TagVault conclusion was checked with the custody reviewer against AppShell’s synchronous session subscription lock (integration lines 195–200); TagArchive additionally checks session authority after awaits and before download/commit. The policy record identity hypothesis was retired after tracing route unmount behavior, rather than promoting a component-only scenario as a production defect.

## Existing hardening and inherited findings

- Main transport defaults and non-finite retry option handling differ from integration; integration rpc.ts adds credential/referrer/cache restrictions and a finite retry guard. These are existing hardening deltas, not a newly established production exploit.
- Main jitter uses a wall-clock-only expiry check; latest adds a monotonic floor. No external clock-rollback path was established.
- Main merchant reconciliation could mark a zero-payment invoice paid when tolerance covered the amount; integration fixes the positive-payment invariant. Avoid duplicate reporting against earlier D-2 notes.
- Prior wave payment_ui_review.json contains distinct receipt hash/status, ERC20 simulation, sweep review authority, QR lifecycle and runtime helper findings; keep their branch-specific status rather than collapsing them into this wave.

## What was inspected

The full Pay route and both unique versions were inspected, along with tags/tagArchive/TagArchive, the payment/common component set, all Registry and experimental Policy browser production files, jitter, all merchant-ledger production code and both test variants, and every chain-adapters production blob including ABI tables. Chain-adapter inspection covered preview/calldata identity, permit and sweep typed data, manifest schema/signatures/readback, canonical announcement positions, receipt/transaction/evidence binding, independent-provider comparison, batch cancellation, RPC envelope and retry limits, pricing arithmetic, registry delegation snapshots, and ENS gateway exclusion. No additional active issue was established in those production helpers.

Tests fully read in this wave include jitter variants, merchant-ledger variants, WalletAttempts variants, PrintableBill, PolicyView.scope, walletDiscovery.hardening, walletJournal, RegistryView.route and policy fixture helper variants. The larger transaction, scan and component test backlog remains explicitly pending.

## Exact pending file/blob ledger

The table below is a handoff inventory, not a claim that these bodies have been reviewed. Full ref membership and the completed ledger are in the JSON.

| Path | Blob | Lines | Owner |
|---|---|---:|---|
| `apps/web/src/components/CameraImporter.behavior.test.tsx` | `4c6e955619e147baca36ad0ba8fecc48c806d640` | 142 | fresh payment/tests successor |
| `apps/web/src/components/CameraImporter.i18n.test.tsx` | `5cd833b00369917e7e2caf62f9e1b3bb673623b8` | 137 | fresh payment/tests successor |
| `apps/web/src/components/CameraImporter.lifecycle.test.tsx` | `9e66a8f7cccd7a5e9cd4cec94f79b6ddeb70926e` | 278 | fresh payment/tests successor |
| `apps/web/src/components/CameraImporter.multipart.test.tsx` | `58833ea84270b29d5b21eb5fb10ccb5a9928187b` | 401 | fresh payment/tests successor |
| `apps/web/src/components/CameraImporter.test.tsx` | `9de1420a4ffd86d57aff5500da6db386565efd23` | 158 | fresh payment/tests successor |
| `apps/web/src/components/Common.test.tsx` | `af9c2a77b7d1232b50f8861dd0793c2c0eebc240` | 183 | fresh payment/tests successor |
| `apps/web/src/components/ContextHelp.test.tsx` | `6c282bff7a223286c431c41514351ba6c6d2b2c2` | 145 | fresh payment/tests successor |
| `apps/web/src/components/ErrorBoundary.test.tsx` | `b1bdf393bac0b9fb3e576f3b526d2f78d21b9f76` | 65 | fresh payment/tests successor |
| `apps/web/src/components/InvoicePaymentSummary.test.tsx` | `ceb237b51e68887f5932b8a87ddf4e71a7719522` | 41 | fresh payment/tests successor |
| `apps/web/src/components/MerchantProfilePanel.test.tsx` | `d1376d02bc6ce341c382efed1fe025f9ab549c1d` | 153 | fresh payment/tests successor |
| `apps/web/src/components/MerchantTemplateIssuer.test.tsx` | `c162fb9ca1ba5b71cbc34296172a2339883fc9a1` | 35 | fresh payment/tests successor |
| `apps/web/src/components/PaymentRequestQr.test.tsx` | `167776cdc0703bed151715ff619197649da0d2fe` | 138 | fresh payment/tests successor |
| `apps/web/src/components/QrFrame.i18n.test.tsx` | `31c15bcb5a18296b67942bf93cdc30c32426d2c3` | 42 | fresh payment/tests successor |
| `apps/web/src/components/QrFrame.largeWarning.test.tsx` | `7c8c1cf7150a88a5487a8b0db9496c7287c22af3` | 21 | fresh payment/tests successor |
| `apps/web/src/components/QrFrame.security.test.tsx` | `642a51e40607844f2af9e5d59a3e1a0e752b3c4f` | 106 | fresh payment/tests successor |
| `apps/web/src/components/QrFrame.test.tsx` | `6f84f7e43f15afae4bc1f292a95510ead7bd2123` | 162 | fresh payment/tests successor |
| `apps/web/src/components/QrView.i18n.test.tsx` | `474affeda6d8f7e68a0bd4d4a976350b92a8291f` | 56 | fresh payment/tests successor |
| `apps/web/src/components/QrView.test.tsx` | `8dc103ff3c081a63bc631aa9e532fdf2de2e3bd0` | 21 | fresh payment/tests successor |
| `apps/web/src/components/ReceiptPanel.archive.test.tsx` | `93dc56732d3fc433d640fb88b04d1f13295beac1` | 92 | fresh payment/tests successor |
| `apps/web/src/components/ReceiptPanel.i18n.test.tsx` | `ee6c99f0a4dc9d5c3a8d47194f9e6425c24e8d06` | 67 | fresh payment/tests successor |
| `apps/web/src/components/ReceiptPanel.invoice.test.tsx` | `909b92a8ba967c82af14dfffe0385b34ef4331ad` | 200 | fresh payment/tests successor |
| `apps/web/src/components/ReceiptPanel.profile.test.tsx` | `ba9b2d6b690c2494cad7c4c3633abff7de6a0d4c` | 85 | fresh payment/tests successor |
| `apps/web/src/components/ReceiptPanel.test.tsx` | `1ba3f5cce99b7a13d2b6cb21d728bf152d283353` | 93 | fresh payment/tests successor |
| `apps/web/src/components/ReconciliationLedger.i18n.test.tsx` | `be6fb9d4ffa6db300695d5b25ffc1ffa63de81e6` | 135 | custody lane; coordinate against its ledger |
| `apps/web/src/components/ReconciliationLedger.invoices.test.tsx` | `d3f96ceebe31fa1fde01dc2dfeca427e10df24c7` | 283 | custody lane; coordinate against its ledger |
| `apps/web/src/components/ReconciliationLedger.test.tsx` | `eb5258cc762b0dbc4c7d9191b4fb36888ebda9e0` | 432 | custody lane; coordinate against its ledger |
| `apps/web/src/components/SharedComponents.i18n.test.tsx` | `a48fbe04da171154ba009ce11132e30ffbcaf80f` | 238 | fresh payment/tests successor |
| `apps/web/src/components/TagArchive.atomicity.test.tsx` | `9e51bda4ea0f872622a86f476da996a1a6b74a32` | 246 | custody lane; coordinate against its ledger |
| `apps/web/src/components/TagArchive.history.test.ts` | `5380b9e5103f740c424195ba05effde25a7729e3` | 36 | custody lane; coordinate against its ledger |
| `apps/web/src/components/TagArchive.retry.test.tsx` | `4dc87d93947d5499be1792836642cf4606e6ccde` | 85 | custody lane; coordinate against its ledger |
| `apps/web/src/components/TagArchive.test.tsx` | `01beb3c0c5cf3142ad957a9e1209f15871062082` | 263 | custody lane; coordinate against its ledger |
| `apps/web/src/features/policy/PolicyReceive.regression.test.tsx` | `9c493241a69595b1c1d7d1aa92e7152da7b50397` | 103 | fresh payment/tests successor |
| `apps/web/src/features/policy/PolicyView.guard.test.tsx` | `9ccdadb0fd50fed4112e5abc399c0598ba26f93d` | 402 | fresh payment/tests successor |
| `apps/web/src/features/policy/PolicyView.more.test.tsx` | `2d5df14501a00e9842d2aa055cf7b08e67209693` | 221 | fresh payment/tests successor |
| `apps/web/src/features/policy/PolicyView.test.tsx` | `7cd927c29357adda705d353a33379aea0bc29df2` | 257 | fresh payment/tests successor |
| `apps/web/src/features/policy/create.callback.test.ts` | `0ba405fa0bbc1eb2b19bd8942d251784b4436099` | 21 | fresh payment/tests successor |
| `apps/web/src/features/policy/deploymentEvidence.test.ts` | `378e1ab2a4bacc5a13d20e852e9d5edf853d6da0` | 81 | fresh payment/tests successor |
| `apps/web/src/features/policy/paymentEvidence.anvil.test.ts` | `e25e0f2fc7ebe288978a324ed1893787c666c500` | 187 | fresh payment/tests successor |
| `apps/web/src/features/policy/paymentEvidence.test.ts` | `ab0b5217ce4f4a9982c9cf5f94d4113098222e5a` | 183 | fresh payment/tests successor |
| `apps/web/src/features/policy/policy.logic.test.ts` | `c9084fa2048ee270916a72e288a9800e7f1254fc` | 373 | fresh payment/tests successor |
| `apps/web/src/features/policy/policyTime.test.ts` | `7f3e9133a915985fa4b95ea9b4d16e3f10c3fe15` | 23 | fresh payment/tests successor |
| `apps/web/src/features/policy/send.test.ts` | `2d6e6e6a6afe4f066c4e23027366bf9dd9d57577` | 368 | fresh payment/tests successor |
| `apps/web/src/features/policy/withdrawalJournal.test.ts` | `fb1563393f30ac968a7749a0ec523f6dc0b801eb` | 134 | fresh payment/tests successor |
| `apps/web/src/features/policy/withdrawalState.test.ts` | `e9e20473db96b5fd6a4fdb5d5343b932e61a790d` | 239 | fresh payment/tests successor |
| `apps/web/src/features/registry/RegistryView.export.test.tsx` | `10fc44d00152be737dbf4f3a172624cce0337b1d` | 71 | fresh payment/tests successor |
| `apps/web/src/features/registry/RegistryView.i18n.test.tsx` | `03180167b4e9ae29e8294d1cee73028cb360de46` | 87 | fresh payment/tests successor |
| `apps/web/src/features/registry/RegistryView.test.tsx` | `fb79a7398af4872f6cb129914dfea12b96cb8d6d` | 291 | fresh payment/tests successor |
| `apps/web/src/features/registry/ref/Registry1271Wallet.test.sol` | `051aec1851c392ab9c5040bd34e8137d01ac1d6a` | 34 | fresh payment/tests successor |
| `apps/web/src/features/registry/registry.anvil.test.ts` | `a49f0439dc4ffdec9449df3fee32fc92ba114c8d` | 252 | fresh payment/tests successor |
| `apps/web/src/lib/format.test.ts` | `3d6a9f5fade916452bc64fe98a3c9abb64add101` | 78 | fresh payment/tests successor |
| `apps/web/src/lib/fragment.test.ts` | `d3b8dc4682bee893ead90a8c0b9ce3669d4262d3` | 34 | fresh payment/tests successor |
| `apps/web/src/lib/invoiceCreate.test.ts` | `b852ad654e5d78f79d971accd90810dd7d82f549` | 149 | fresh payment/tests successor |
| `apps/web/src/lib/merchantIdentity.test.ts` | `c26773145f2fdc22ff05871157c34b7021a644f4` | 137 | fresh payment/tests successor |
| `apps/web/src/lib/merchantTemplate.test.ts` | `cfd2b73cdd1497a20e940c62ccbe59210af4f9a3` | 114 | fresh payment/tests successor |
| `apps/web/src/lib/pay.test.ts` | `7e27cf90328b7d9421e394edc10515e61157a1d5` | 611 | fresh payment/tests successor |
| `apps/web/src/lib/payExec.acceptance.test.ts` | `4dded28d0f6c9521b07c07557cf2df589ba4fdba` | 171 | fresh payment/tests successor |
| `apps/web/src/lib/payExec.test.ts` | `3554a2315bfffd0116d2ec2abaaf73f7b0dbc2cd` | 947 | fresh payment/tests successor |
| `apps/web/src/lib/qr.test.ts` | `bb3a921720b5d5ee7394693127d9054699e87f0f` | 69 | fresh payment/tests successor |
| `apps/web/src/lib/qrClassify.fuzz.test.ts` | `198909c9d308d304306e0942ee15a9eb57f160b9` | 113 | fresh payment/tests successor |
| `apps/web/src/lib/qrClassify.test.ts` | `39d4161426183bfc2dd4412ac9be27454dabd095` | 418 | fresh payment/tests successor |
| `apps/web/src/lib/qrContrast.test.ts` | `217cc4d2bbb789767c5d7a769b9ee4929e85fb66` | 18 | fresh payment/tests successor |
| `apps/web/src/lib/qrKinds.test.ts` | `990d723ee8877c6de7f9f604a3e7e183bb6ff358` | 107 | fresh payment/tests successor |
| `apps/web/src/lib/qrMultipart.test.ts` | `4fd6b1e458b8d79a4828254f7b21982bf245a01e` | 41 | fresh payment/tests successor |
| `apps/web/src/lib/qrPayload.test.ts` | `aa45d2174751052a1dc1dfa1069297be75be634a` | 16 | fresh payment/tests successor |
| `apps/web/src/lib/receipts.test.ts` | `70e1c9aed859596389f5b43b93e0d6ff26f58bec` | 135 | fresh payment/tests successor |
| `apps/web/src/lib/sellerPairing.test.ts` | `59c0ff53bd9e4619adc700cd559ea00886ac7359` | 119 | fresh payment/tests successor |
| `apps/web/src/lib/sweep.test.ts` | `f38c5b90985f705a8d4cfac87a897cd6ee394d1b` | 1091 | fresh payment/tests successor |
| `apps/web/src/lib/sweepAttemptJournal.test.ts` | `9bfe12a040b536bd4bc8e9016b80ad70347b767b` | 161 | root; coordinate against its ledger |
| `apps/web/src/lib/tagArchive.fuzz.nocov.test.ts` | `8f899eb8e00a5717dc8d094f1470bf72bc4e14d9` | 36 | custody lane; coordinate against its ledger |
| `apps/web/src/lib/tagArchive.test.ts` | `3f4a4a046f42373a722bcb17130c7bbf459f465d` | 325 | custody lane; coordinate against its ledger |
| `apps/web/src/lib/tagArchive.vectors.test.ts` | `ae49b5a848f8af4b61621b0b2535ff911720f891` | 35 | custody lane; coordinate against its ledger |
| `apps/web/src/lib/tags.test.ts` | `cabeff3806d9ee2a2ed44b4d60679db071e70aec` | 240 | custody lane; coordinate against its ledger |
| `apps/web/src/lib/tagsConcurrency.test.ts` | `1729f7dcc4f9330278a40572c87719babb987268` | 118 | custody lane; coordinate against its ledger |
| `apps/web/src/lib/txGuard.test.ts` | `c5c6f6488a7ddd52bc175df6b8221ff45b2fd44d` | 164 | fresh payment/tests successor |
| `apps/web/src/lib/wallet.test.ts` | `6416192e15102bf6725eac9b945ff45681d021ff` | 272 | fresh payment/tests successor |
| `apps/web/src/views/CreateInvoice.buffer.test.tsx` | `5c4269fa33cad4250deba0b955c4a090c0b269bd` | 249 | fresh payment/tests successor |
| `apps/web/src/views/CreateInvoice.i18n.test.tsx` | `8269636eef8652821346ec8fa375671409561e21` | 51 | fresh payment/tests successor |
| `apps/web/src/views/CreateInvoice.ordering.test.tsx` | `5cded4b3666f14dc57f1878c245a59d6bed4192a` | 76 | fresh payment/tests successor |
| `apps/web/src/views/CreateInvoice.register.test.tsx` | `c0ab7561bb91cc777026c081a9ee39ff54db2e41` | 83 | fresh payment/tests successor |
| `apps/web/src/views/CreateInvoice.supported.test.tsx` | `17feff9faf1ceb38432b63cd1cf361433827b340` | 159 | fresh payment/tests successor |
| `apps/web/src/views/CreateInvoice.test.tsx` | `0d1ca5555de25aeebebccec61232bedbad4e1c18` | 267 | fresh payment/tests successor |
| `apps/web/src/views/Pay.i18n.test.tsx` | `b8d80d61869c5c0ec015302a872a63269534d6ad` | 135 | fresh payment/tests successor |
| `apps/web/src/views/Pay.invoiceQr.test.tsx` | `3eb5ab0072c4cf5c61b7502d68d0e141dfd3b133` | 373 | fresh payment/tests successor |
| `apps/web/src/views/Pay.supported.test.tsx` | `d19f8f7efd6ca0fb5b5d6ef738e1fcf56fb8f83d` | 170 | fresh payment/tests successor |
| `apps/web/src/views/Pay.test.tsx` | `7ef3db702caa56538a7fd4e82e63eafb895debd5` | 1273 | fresh payment/tests successor |
| `apps/web/src/views/Sweep.privacy.test.tsx` | `2334a9bb524127b6cc6165a857f7942e74420c27` | 84 | fresh payment/tests successor |
| `apps/web/src/views/Sweep.test.tsx` | `17049ca012bd5bab662dd450668c64b11e7700dd` | 1012 | fresh payment/tests successor |
| `packages/chain-adapters/src/abi.test.ts` | `f002b418d7a4ded9b4b6f57d3773a68aa0e7373e` | 31 | fresh payment/tests successor |
| `packages/chain-adapters/src/adapter.deep.test.ts` | `6d9e6a729beb5c23823d5e9df9d5b218ac8fd98a` | 119 | fresh payment/tests successor |
| `packages/chain-adapters/src/adapter.test.ts` | `d0daffb7d0dc6f1dae3f3e66121843261c39542a` | 192 | fresh payment/tests successor |
| `packages/chain-adapters/src/config.test.ts` | `13b089af2466865360b6d58806a94d1c5aa66580` | 61 | fresh payment/tests successor |
| `packages/chain-adapters/src/deployments.test.ts` | `8ad8ca9c354435a2acf491bb4372a98e21e08738` | 134 | fresh payment/tests successor |
| `packages/chain-adapters/src/deploymentsVerify.test.ts` | `403eca13495a3d7a850b14c2629ff0b781c4efe3` | 136 | fresh payment/tests successor |
| `packages/chain-adapters/src/eip712.independent.test.ts` | `9470d3c9304a1e969965d36b8fc86e4a8688566c` | 99 | fresh payment/tests successor |
| `packages/chain-adapters/src/fees.test.ts` | `d460da6b0030eb99edac2464399f689ef77f147e` | 163 | fresh payment/tests successor |
| `packages/chain-adapters/src/fixtures.testutil.ts` | `e7fe0201cbbc0f7581baabf25e67a1c951707f6f` | 70 | fresh payment/tests successor |
| `packages/chain-adapters/src/logs.test.ts` | `e10267684a88385ecd9b289f3d85f29546961196` | 466 | fresh payment/tests successor |
| `packages/chain-adapters/src/payments.anvil.test.ts` | `fe6523aa89555b5b0fa4c17109aa931c4aff8a64` | 230 | fresh payment/tests successor |
| `packages/chain-adapters/src/payments.test.ts` | `12fdeeece0a305b75c46baf51098e6e704ed7c86` | 575 | fresh payment/tests successor |
| `packages/chain-adapters/src/permit.test.ts` | `a59fe67b62b7b368e072ad37fb5fa9a818367dfa` | 197 | fresh payment/tests successor |
| `packages/chain-adapters/src/quote.anvil.test.ts` | `b0d274199e3ff7aaab1926e88eafc2437534d617` | 111 | fresh payment/tests successor |
| `packages/chain-adapters/src/quote.guards.test.ts` | `a0b5058d01dcea87a2e20fc3b7f63a4b5cc45f29` | 148 | fresh payment/tests successor |
| `packages/chain-adapters/src/quote.test.ts` | `a6348941fa36533ca408d8a10e059fcd52ed5884` | 207 | fresh payment/tests successor |
| `packages/chain-adapters/src/registry.compat.test.ts` | `ffcc3420bf57ec069bc9ad1995497c0a85da21fb` | 114 | fresh payment/tests successor |
| `packages/chain-adapters/src/registry.test.ts` | `b705e66f46759ee506fa7cea74b4fa84ed59bc02` | 111 | fresh payment/tests successor |
| `packages/chain-adapters/src/registryDelegation.test.ts` | `e80fdc0c4e0a681336552f866d0d0e4dd66dfe24` | 184 | fresh payment/tests successor |
| `packages/chain-adapters/src/registryEns.test.ts` | `890f227fa0a11ec5ab7104444173187cc2de2540` | 88 | fresh payment/tests successor |
| `packages/chain-adapters/src/router.anvil.test.ts` | `bca50477b3cb2768b2aa6729bd3fc22a5f247336` | 159 | fresh payment/tests successor |
| `packages/chain-adapters/src/router.test.ts` | `0e5791a4bfba226e85ef4028469dcda095254951` | 304 | fresh payment/tests successor |
| `packages/chain-adapters/src/rpc.test.ts` | `cbc9b3498b3411b2a8187ece3fc97f928bef6e13` | 489 | fresh payment/tests successor |
| `packages/chain-adapters/src/rpc.testutil.ts` | `fd1f9785ada9a09a9c2a98278b32e52c81d3cfd6` | 30 | fresh payment/tests successor |
| `packages/chain-adapters/src/scanHardening.test.ts` | `d6f41acbfe8cab313bd07fbc9c366e92bd80221e` | 493 | fresh payment/tests successor |
| `packages/chain-adapters/src/scanVerify.test.ts` | `7999c8edb1b36220b06490c773cdda0b37aff695` | 218 | fresh payment/tests successor |
| `packages/chain-adapters/src/sweep.test.ts` | `60526c7f94d0f6851b6f1dd64ec1ef9668b94392` | 212 | fresh payment/tests successor |
| `packages/chain-adapters/src/verify.test.ts` | `44e8a2b27749afd6f44f13f5114288a86c40a15e` | 248 | fresh payment/tests successor |
| `apps/web/src/components/CameraImporter.visibility.test.tsx` | `591becf9ad1f59e143bd3356b9b3a1bcc1ec6d11` | 154 | fresh payment/tests successor |
| `apps/web/src/components/Disclosure.manifest.test.tsx` | `da7fd9a6813dc6b1ddfa1aaa5ec165d199b525e8` | 72 | fresh payment/tests successor |
| `apps/web/src/components/InvoiceSignerVerification.test.tsx` | `28a040d3b4b2049f97d90c6de10605aa32fd9210` | 143 | fresh payment/tests successor |
| `apps/web/src/components/ReceiptPanel.test.tsx` | `8f14ca64dfef6668c59d280597dd252adf849bb0` | 142 | fresh payment/tests successor |
| `apps/web/src/components/TagArchive.test.tsx` | `d5c0ec5f453dbc5d094885c8ad8301a6016631ab` | 279 | custody lane; coordinate against its ledger |
| `apps/web/src/features/policy/PolicyView.network.test.tsx` | `bfcf526291cc81f624b97441cfc186997fa485ed` | 192 | fresh payment/tests successor |
| `apps/web/src/features/policy/pay.selfcheck.test.ts` | `a719bc51a3a4cb227e20ddcdf7ccd0e650f8ab9d` | 56 | fresh payment/tests successor |
| `apps/web/src/features/policy/send.test.ts` | `aa1b08c198e72dc55854551183670d37061984b0` | 440 | fresh payment/tests successor |
| `apps/web/src/features/registry/RegistryView.network.test.tsx` | `f2a879bf1deecde6c8ad94d40a21096dcbe1c04c` | 78 | fresh payment/tests successor |
| `apps/web/src/lib/invoiceSignerPins.test.ts` | `d0f00af1cc06573870f047967b97087cc086628d` | 306 | fresh payment/tests successor |
| `apps/web/src/lib/invoiceVerification.test.ts` | `dc43e8c535e862c4e5798d5b757f6335d29c6ce0` | 54 | fresh payment/tests successor |
| `apps/web/src/lib/merchantIdentity.test.ts` | `957027808890f366f337c375e52b5c081206dae7` | 157 | fresh payment/tests successor |
| `apps/web/src/lib/qrKinds.test.ts` | `e918e36848f4e01322afbdf41cf561b3222cc14a` | 119 | fresh payment/tests successor |
| `apps/web/src/lib/qrMultipart.test.ts` | `45992f537d1f226dd20e57d96a246c6f18419395` | 51 | fresh payment/tests successor |
| `apps/web/src/lib/receipts.test.ts` | `d8770c168ada02cedf50ecaa8bb47060f7199a35` | 149 | fresh payment/tests successor |
| `apps/web/src/lib/sweep.destinations.privacy.test.ts` | `8097b83ba5ce627a38ec302fd9f9b1950369ba4b` | 114 | fresh payment/tests successor |
| `apps/web/src/lib/sweep.nativeReview.test.ts` | `1a57ad6d116171cc64cab5293aa572a45d22daa2` | 336 | fresh payment/tests successor |
| `apps/web/src/lib/sweep.reviewAuthority.test.ts` | `b1e5c22e708da43efa3d61b85d9272ce136a2bdb` | 249 | fresh payment/tests successor |
| `apps/web/src/lib/sweep.test.ts` | `c391e4aca34e7125383e04bb32d26f1c1b55bd4d` | 1124 | fresh payment/tests successor |
| `apps/web/src/views/CreateInvoice.privacy.test.tsx` | `e882d1107eb8a88c4583094a1081a82fc7d1f644` | 118 | fresh payment/tests successor |
| `apps/web/src/views/CreateInvoice.test.tsx` | `de1c61ddaee5a7e2ef33b41a2c02a6bbfda6569e` | 281 | fresh payment/tests successor |
| `apps/web/src/views/Pay.network.test.tsx` | `e72ea03feaa07a7e5450ac3eae1bef7c7a097887` | 81 | fresh payment/tests successor |
| `apps/web/src/views/Pay.preflightCompletion.test.tsx` | `a8375bae63a9648c425d9da9e5dc8dbaa041f8a8` | 151 | fresh payment/tests successor |
| `apps/web/src/views/Pay.signer.test.tsx` | `06a1750266a87afac186e7b1d8b64f4af689a9de` | 239 | fresh payment/tests successor |
| `apps/web/src/views/Sweep.nativeReview.test.tsx` | `e8d5fcb22def002ca90add99e344b4a132835c10` | 188 | fresh payment/tests successor |
| `apps/web/src/views/Sweep.privacy.test.tsx` | `70d8ba09fbc19a6b2ab2de14d21d73c25cebb6a4` | 224 | fresh payment/tests successor |
| `apps/web/src/views/Sweep.quoteLifecycle.test.tsx` | `2da1d11b208b413377b41b8416c0909dd0deebfa` | 424 | fresh payment/tests successor |
| `apps/web/src/views/Sweep.test.tsx` | `2be1f668375db2c95f6d184514350bc0913b8685` | 1070 | fresh payment/tests successor |
| `packages/chain-adapters/src/deployments.test.ts` | `251fdedabf2f2be66ce1a0b48946ee5721fe7691` | 136 | fresh payment/tests successor |
| `packages/chain-adapters/src/payments.bulkCancellation.test.ts` | `e59e3618be5b8ed9b7e4017c6edcf4a9200a511f` | 113 | fresh payment/tests successor |
| `packages/chain-adapters/src/payments.test.ts` | `d14d6209eabff60cc6dbf1a78cb50fbf57b81ca3` | 674 | fresh payment/tests successor |
| `packages/chain-adapters/src/quote.test.ts` | `ab98c68605acba6a7d094e631ab1431ab88e2763` | 211 | fresh payment/tests successor |
| `packages/chain-adapters/src/rpc.test.ts` | `f7bb85cb0296ccae726859842b06c6f76b6974b8` | 502 | fresh payment/tests successor |
| `apps/web/src/lib/payExec.acceptance.test.ts` | `6eafa0466c682977baa69b7c87b91ffd8b79c227` | 171 | fresh payment/tests successor |
| `apps/web/src/lib/payExec.test.ts` | `0e9a3abe4e78e4091b19614ef68efb285b5c1254` | 1025 | fresh payment/tests successor |
| `apps/web/src/lib/qrKinds.test.ts` | `257b634250f033ddec042b67941fec23ffba1323` | 203 | fresh payment/tests successor |
| `apps/web/src/lib/sweep.boundaryAudit.test.ts` | `e3813045c7975bcbd4e1201d65869e6962827c25` | 215 | fresh payment/tests successor |
| `apps/web/src/lib/wallet.test.ts` | `0eef38ea9deb736072515d3240eeabfbd6b5e49b` | 383 | fresh payment/tests successor |
| `apps/web/src/views/Pay.test.tsx` | `199ecddf5d1e6ab7aec4ebd2ba5d01a5908f0b3c` | 1273 | fresh payment/tests successor |
| `packages/chain-adapters/src/deployments.test.ts` | `9a35cce7f79ef3341e73ed2b8aa140653b97756b` | 138 | fresh payment/tests successor |
| `apps/web/src/components/Common.test.tsx` | `67a93df29f2df39dbe2f4489959e5e68835e7457` | 204 | fresh payment/tests successor |
| `apps/web/src/lib/format.test.ts` | `43d5b5c882abdfb392776dd13d772e972f13ab46` | 92 | fresh payment/tests successor |
| `apps/web/src/lib/txGuard.test.ts` | `1f1749730b2af7483bacdeecc29f2fbda5490de3` | 183 | fresh payment/tests successor |
| `apps/web/src/components/Common.test.tsx` | `0d7bbf035fc95e8f79c84b7766b87c7b43eaed37` | 204 | fresh payment/tests successor |
| `apps/web/src/views/Pay.signer.test.tsx` | `c93c871fb4500c1d34bcac28cedfebb2f7ab4088` | 238 | fresh payment/tests successor |
| `apps/web/src/lib/payExec.test.ts` | `4deb9d710209a5a83a8ae9d5dcecf3aac1058748` | 967 | fresh payment/tests successor |
| `apps/web/src/lib/wallet.test.ts` | `d76eae2520f89b14208485a79f8e686117382a55` | 328 | fresh payment/tests successor |
| `apps/web/src/lib/qrKinds.test.ts` | `af5ef89f6fba0cea13b18884df387875f064ad34` | 194 | fresh payment/tests successor |

## Selected heads

| Branch | Commit |
|---|---|
| `main` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| `release/ghostpay-beta-qualification-20261119` | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| `integration/ghostpay-completion-20261120` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| `snapshot/ghostpay-privacy-8be15289-20261120` | `d6819796a9542acc488b896786faffe83b913d9b` |
| `feat/ghostpay-privacy-quick-hide-20261120` | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| `fix/ghostpay-format-validation-20261120` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| `fix/ghostpay-pages-integrity-gate-20261120` | `936d054ed067d89c773310d42e33939c1129bbfa` |
| `automation/20261120T0434Z/bug/erc20-simulation-result` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| `automation/20261120T004531Z/feature/clipboard-guard` | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` |
| `automation/20261120T0115Z/coordinator/clipboard-qualification` | `04910f65dc0268e41519c4b1a44e83264272f0bf` |
| `automation/20261120T0115Z/worker/receipt-hash-validation` | `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` |
| `automation/20261120T0243Z/worker/format-units-validation` | `7523da612ba365451f1d5c2dbc01d0bdeedbe8c7` |
| `automation/20261120T003500Z/coordinator/qr-runtime-qualification` | `ec546311f994fe1db544fe85ff2aa6db428d67d4` |
| `fix/ghostpay-qr-conflict-expiry-20261119-c374725a11b7` | `172695efb41665a4e50d335029e54184bbb5b328` |
| `automation/20261119T2243Z/bug/base64url-runtime-input` | `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64` |
| `automation/20261119T204728Z/bug/qr-kind-failclosed` | `89942105c48df03b9351f777278b6a992e35a95e` |
| `automation/20261119T183817Z/bug/merchant-pin-duplicate-json` | `9fbf3312cb8e65083f604cc0bf0512d59c83f141` |
| `automation/20261119T1640Z/bug/scan-privacy-partial-30d` | `0041514a630398c89693498d9b5e44ef562d9c61` |
| `automation/20261119-c977/bug/build-profile-failclosed` | `25c380f253e3338c0e6b79e8d052cdf8950f9e88` |
| `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard` | `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0` |
