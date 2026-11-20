> Review-chunk evidence. The consolidated [coverage](../COVERAGE.md) and [validation](../VALIDATION.md) are authoritative for final completion and executed checks. References to scratch tests identify the original local runs; retained evidence is indexed in [evidence](../evidence/INDEX.md).

# Independent verification of coordinator findings

Reviewer: fresh `root_findings_verification` worker. Review date: 2026-11-19 (America/Los_Angeles).

Pins inspected:

- Main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Integration: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.
- Privacy: `137628961463fc5abd8b7927b2efe6b18a0a206a`.

All four requested conclusions are supported by the source. Two location corrections are required: the global bill stylesheet is reached through **Pay**, not CreateInvoice; and the SDK popup function is at **138–140**, not 147–150. No application source was changed and no tests or browser processes were launched by this reviewer.

## 1. Receipt printing is suppressed by the bill stylesheet — confirmed

**Suggested priority:** P2 / medium functional defect. **Affected:** main, integration and privacy; the relevant stylesheet and PrintableBill blobs are identical across all three.

Exact integration trace:

1. `apps/web/src/AppShell.tsx:15` eagerly imports `Pay`.
2. `apps/web/src/views/Pay.tsx:35` imports `PrintBillButton` from `components/PrintableBill`.
3. `apps/web/src/components/PrintableBill.tsx:8` imports `../styles/print.css` as a global stylesheet.
4. `apps/web/src/styles/print.css:4–7` applies `visibility: hidden !important` to every body descendant under print media, restoring important visibility only for `.bill-sheet` and its descendants.
5. `apps/web/src/styles/app.css:247–252` restores `.receipt-print` and descendants with ordinary, non-important `visibility: visible`; these declarations lose to the important global rule regardless of import ordering or specificity.
6. `apps/web/src/components/ReceiptPanel.tsx:301–327` renders an `article.receipt-print` outside `.bill-sheet`; its print button calls `window.print()` at line 318.

The dependency is eager, so visiting the invoice creation screen is not a prerequisite. `apps/web/vite.config.ts:97` also sets `cssCodeSplit: false`. Receipt printing is therefore suppressed in the app's shared print styles, including the lean shell that imports Pay. This is a **static cascade conclusion**, not a claim that this review produced or inspected a printed PDF.

Correction direction: coordinate explicit print-target state for bills and receipts, or otherwise scope the global bill hiding rule so it does not suppress receipt printing. Verify both print paths and verify that unrelated sensitive UI stays hidden. Do not merely remove the global restriction without checking the other print target.

Shared reviewed blobs: `print.css` `5c803193b91431c4dd96f6421ae41b5e92740046`; `app.css` `a1951f57c00346323b6306c3af46867dae6d6262`; `PrintableBill.tsx` `64ba221722b1c88adb74c6c68960e95e48855c98`.

## 2. Privacy wallet history has no connected-wallet input — confirmed

**Suggested priority:** P2 / medium feature integration defect. **Affected:** privacy pin only; main and integration have the older component without this required display condition.

`apps/web/src/components/WalletAttempts.tsx:24–25` obtains `props.wallet` and produces an empty visible list when it is absent. Lines 31–40 render the connect-to-reveal message instead of history and its explicit clear control in that case. The component does not retrieve a wallet from context or another source.

Every production call site at the privacy pin omits the prop:

- `apps/web/src/views/Pay.tsx:1059` and `:1127`.
- `apps/web/src/features/registry/RegistryView.tsx:272`.
- `apps/web/src/features/policy/PolicyPay.tsx:129`.

Consequently, once a tab-local attempt exists, connecting an account in these views cannot make its history or clear control reachable through this component. The outcome/duplicate journal itself remains retained; no journal deletion or transaction outcome change is claimed. Privacy mode need not be enabled: the wallet condition runs unconditionally. Pay and Registry are core paths, while Policy is the optional full-profile path.

Correction direction: pass the current wallet session/account and chain from each caller, preserving scope invalidation on disconnect/account/network changes and explicit confirmation before clearing. Add a view-level regression; the component tests currently supply `wallet` directly, which does not exercise this missing wiring.

Privacy component blob: `a9aef3f940bed8f3e26a45ffd75aedea2f0b5563`. Main/integration component blob: `70ba12b8ae8d07460266c07f4dbd25e6126bfb80`.

## 3. Embed v2 reports successful no-opener popups as blocked — confirmed

**Suggested priority:** P3 / low UX defect. **Affected:** the v2 public SDK on all three pins; **excluded from the lean Pages artifact**.

`apps/web/public/ghostpay-embed-v2.js:138–140` calls `window.open(url, '_blank', 'popup,noopener,noreferrer')` and treats a falsey result as proof of a popup block, setting the button title to a blocked/retry message. The default click path reaches this function at lines 275–280; the iframe-timeout fallback also calls it.

The [HTML Standard window-open steps](https://html.spec.whatwg.org/multipage/nav-history-apis.html#window-open-steps), retrieved on 2026-11-19, perform the new-window navigation before returning null for a new window with no opener (steps 15 and 17; step 18 also covers this `_blank` use). Thus a null result does not establish blocking for this call. The false claim is specifically a **button title/tooltip**, not a verified failure to open checkout. A duplicate checkout is a possible consequence of obeying the retry advice, not an observed test outcome.

`apps/web/scripts/localBuildProfile.mjs:9,260–265` excludes both embed SDK assets from lean builds. The reviewed SDK blob is identical across the three pins: `0186bb1364fd6de19e1bec241ac9c5b074033bc7`.

Correction direction: retain `noopener,noreferrer`; provide conditional/general popup guidance or an explicit fallback link without classifying this null return as failure. No browser run was attempted here; the coordinator's earlier launch limitation remains unchanged.

## 4. Partial settings import still erases unrelated drafts in privacy — confirmed

**Suggested priority:** P2 / medium unsaved-data loss. **Affected:** integration and privacy. The coordinator's main comparison is unaffected for this specific import scenario; this reviewer did not rerun it.

At the privacy pin, `apps/web/src/views/Settings.tsx:73–92` adds an equality shortcut intended to preserve edits when only privacy preferences change. A preferences import that changes `theme` fails the equality check at line 83. Lines 84–86 then replace all form fields from saved settings, including an unsaved RPC draft that was not selected for import.

The partial-import callback at lines 242–250 explicitly updates only selected sections and promises to preserve other drafts, but cannot prevent the later effect reset. `SettingsExchangeSection` calls `app.updateSettings(next)` at line 329 and `onApplied(next, selection)` at line 335, supplying the saved-settings change that triggers the effect. Integration has the unconditional equivalent reset at lines 69–82.

Therefore the root report should list **privacy as affected too**, with source confirmation on privacy and the coordinator's already-executed regression evidence on integration/main. Preserve unselected dirty fields for local partial imports while handling external settings conflicts explicitly.

## Validation boundary

This independent pass read pinned source, verified relevant exact-blob identity, searched all production WalletAttempts call sites, and checked the primary browser specification. It did not rerun the coordinator's functional tests, open a browser, make a payment, or alter product code. The conclusions above should remain labeled source-confirmed where no runtime check was executed.
