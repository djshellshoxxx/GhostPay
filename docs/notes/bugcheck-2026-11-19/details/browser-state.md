# Browser state and integration findings

Pins: main `c977b5d6723f6822c3b5d86cd6b231712c53c395`; integration `e22c1748a3de6eb02f5be3abe27d634b238c67c6`; privacy `137628961463fc5abd8b7927b2efe6b18a0a206a`.

## GP-BUG-03 — Tags from the previous chain remain after a chain switch

**Priority: P2 / medium. Affected: main, integration and privacy.**

`apps/web/src/views/Scan.tsx` renders an unkeyed `<Tags chainId={chainId} />`. `Tags` stores its displayed list locally, populating it after explicit vault unlock/refresh, without clearing or reloading it when `props.chainId` changes. The component begins at main line 568 and integration line 938. Privacy only adds reveal revocation to the lock handler and retains the defect.

A benign React regression uses the real application/session setup and a local vault stub with one synthetic tag for Base Sepolia. Unlocking the list and selecting Ethereum Sepolia leaves the Base tag visible underneath the new chain selection. The desired assertion that the old tag is absent fails on both pinned main and integration. No RPC or transfer is involved. See [integration output](../evidence/qa-ui.log.txt), [main comparison](../evidence/qa-ui-main.log.txt) and [executed test source](../evidence/bugcheck-ui.test.tsx.txt).

This is a scope/display bug, not evidence of a wrong-chain transfer. Clear the list on chain or seller-session changes, and bind asynchronous list completion to the current scope so a late response cannot restore it. A chain/session generation or keyed list instance can provide the invalidation; explicitly test returning to a previously viewed chain too.

## GP-BUG-04 — Partial settings import erases unrelated unsaved fields

**Priority: P2 / medium. Affected: integration and privacy; main passes this particular comparison.**

Integration `apps/web/src/views/Settings.tsx:69–82` replaces all form fields whenever saved settings change. Its partial-import callback at approximately lines 229–238 updates only selected sections and explicitly promises that other drafts survive. The subsequent effect defeats that promise.

The regression enters an unsaved RPC URL, imports only preferences with a different theme, then checks the RPC input. Integration replaces the draft with the previously saved empty value. The same check passes on main. In the two-test main comparison, only the separate chain-tag test fails. The evidence files above contain both results.

Privacy `Settings.tsx:73–92` adds a shortcut for privacy-only changes, but a changed imported theme fails that shortcut at line 83 and still replaces all fields at lines 84–86. Privacy status is independently source-confirmed, not a third executed UI run. Preserve dirty, unselected fields for a local partial import; handle cross-tab settings revisions and conflicts explicitly rather than treating every settings change as a whole-form reset. See [independent verification](independent-ui-verification.md).

## GP-BUG-02, GP-BUG-05 and GP-BUG-14 — Independently verified integration defects

The [independent source verification](independent-ui-verification.md) supplies the full traces and corrections for:

- **Receipt printing:** shared bill CSS applies `visibility: hidden !important` to all body descendants; the receipt's ordinary visibility rule cannot override it. The eager import path is **AppShell → Pay → PrintableBill → print.css**. This affects all three pins and the lean core. A printed PDF was not produced in this audit.
- **Privacy wallet history:** the new `WalletAttempts` condition requires `props.wallet`, but all four production call sites omit it. History and its clear control remain unreachable even with privacy mode off. Only the privacy branch is affected by this new condition; the underlying journal is preserved.
- **Embed popup title:** `ghostpay-embed-v2.js:138–140` treats the null return of a successful no-opener window as proof of blocking. The symptom is a misleading button title/tooltip. The [HTML Standard](https://html.spec.whatwg.org/multipage/nav-history-apis.html#window-open-steps) specifies the null result. This SDK is excluded from lean Pages. An attempted local browser fixture stopped at browser startup with `socket() failed: Operation not permitted`; no browser result is claimed.

These three source-confirmed findings are distinct from the executed React regressions. Their remediation should preserve existing privacy/print isolation and `noopener,noreferrer` behavior while correcting the integration and feedback.
