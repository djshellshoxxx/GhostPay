# Required privacy masking and private history — issue #286

This is the existing Generation 5 worker's new, separately authorized feature task. It is not another archaeology generation or a claim that the remaining branch census is complete.

The [issue](https://github.com/djshellshoxxx/GhostPay/issues/286), fetched through `github_fetch_issue`, explicitly makes five privacy UX behaviors beta requirements. This lane implements items **1, global sensitive-data masking**, and **4, private transaction history**. Root coordinates the other requirements, independent review, integration and publication. No release qualification is inferred from this source checkpoint.

## Pinned audit

The implementation branch starts at `417f7c71daf8645e1432f2ec8f070110879b80bd`. Its product source equals freeze `2b7c015e28aa23f63ba39486ae7345983ce9ff97`; their differences are documentation. A fresh read-only `git ls-remote origin refs/heads/main` returned `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Exact baseline trees and relevant blobs are in [AUDIT_PINS.json](AUDIT_PINS.json).

| Requirement | Existing behavior at the candidate | Demonstrated gap |
| --- | --- | --- |
| Global mask | The shell has guarded seller sessions, idle suspension, explicit secret-backup reveals and encrypted invoice support. Settings has no global mask preference or control. | Invoice forms and sensitive route content remain visible and accessible. The first two regressions fail because the control is absent and a requested stored privacy preference does not mask the invoice input. |
| Reconciliation history | The ledger already has an authenticated encrypted vault, explicit unlock, seller/chain scope checks, guarded asynchronous reads and reset on session changes. | After unlock, saved transactions, invoices, receipts and legacy migration content become visible without a separate privacy-mode reveal. The third original regression reaches real encrypted history and observes the transaction hash accessible. |
| Wallet attempt history | Existing tab-scoped safety records preserve uncertain/submitted attempts and prevent repeating an action until explicit clearance. | The component renders all recorded accounts and hashes even with no current connected wallet. Three additional regressions demonstrate disconnected, cross-account/chain and ungated-reveal exposure; the existing explicit-clear control still passes. |
| Explicit tag lock | The Scan view's manual tag lock closes tag keys and hides its list. | It does not revoke a previously granted global visual reveal. A real TagVault probe demonstrates the remaining visible grant while seller identity and encrypted records are intact. |
| Context replacement | A first implementation resets temporary reveal by route. | Independent review demonstrates encrypted invoice A to B on the same Pay route inheriting reveal. The promoted regression fails before the context-bound fix. |
| Visual preference updates | Existing execution authority intentionally binds the full raw execution-settings record. | Saving a new visual preference through that record invalidates a connected payment's active preflight grant. The promoted real-NetworkAuthority regression also checks that a legacy partial record remains byte-for-byte unchanged. |

The initial three regressions were committed before implementation at `22c9bcad`. Wallet-history regressions were committed at `d11ee12e`. The same-route invoice and Settings probes were supplied independently by `qa_review_gen3` and promoted at `52d4feea`; only the Settings reveal-control lookup was scoped to the header because the final Settings page also has an accessible control. No exposure assertion was removed.

## Architecture and ownership

| Path | Responsibility and preservation rule |
| --- | --- |
| `apps/web/src/lib/privacyMode.tsx` | In-memory, 30-second visual reveal leases. Both wall and monotonic clocks bound a lease; rollback/invalid clocks fail closed. Session, app-lock, hidden-document and pagehide events revoke it. No history storage or network API. |
| `apps/web/src/components/SensitiveContent.tsx` | Native `hidden`, `inert` and accessibility hiding retain mounted workflow state. Hiding clears document and input selections and moves focus out of hidden content to the always-visible privacy switch. This is not DOM or memory erasure. |
| `apps/web/src/components/PrivacyControls.tsx` | A labelled switch and deliberate temporary reveal/hide actions. A failed persistence attempt is reported using the existing neutral storage warning. The switch remains outside every sensitive boundary. |
| `apps/web/src/AppShell.tsx` | Covers sensitive routes, optional main prelude and the external live region. Home/About contain public help/release content. Settings supplies its own boundary. Reveal scope follows an opaque stable identity for route, invoice fragment, sweep target, seller session and suspension. It does not key or unmount the workflow. Mounts the clipboard owner's synchronization leaf. |
| `apps/web/src/components/PrivateHistory.tsx` | A second temporary gate requires current unlocked authority and deliberate history reveal in privacy mode. A renewed global reveal does not renew an old history lease. |
| `apps/web/src/components/ReconciliationLedger.tsx` | Retains the existing encrypted-vault unlock and scope checks. Saved history, invoice/receipt archives and legacy migration content sit behind the additional visual gate. Explicit lock remains available and revokes temporary reveal. No new database or lookup. |
| `apps/web/src/components/WalletAttempts.tsx` | Retains the entire safety journal and neutral unresolved-request warning. Details are filtered to a supplied current wallet's account and chain. Disconnected/mismatched details and clear buttons are not rendered. Privacy-mode details require separate reveal; wallet identity changes invalidate it. Root owns Pay/Registry call sites and provider-event revocation. |
| `apps/web/src/views/Scan.tsx` | Only the user's explicit **Lock tags** action adds reveal revocation. Temporary invoice/receipt vault closures are not treated as global locks. |
| `apps/web/src/lib/executionSettings.ts` | Excludes only the two new display/clipboard preference fields from execution-setting comparison. Every other enumerable own field remains compared, including future fields; RPC maps and signer arrays retain reference checks. Root owns Pay/Registry consumption. |

`qa_bug_gen1` owns `Settings.tsx`, the settings model/storage API, clipboard helper/Common, the clipboard controls and guarded secret-backup cleanup. Root owns shared catalogs and their source-English security classification. Those changes are imported as explicit dependencies; this lane does not independently alter their semantics.

## Preserved boundaries

- Masking retains actual mounted drafts and seller-session identity, including a possible sole copy. Existing cryptographic lock, recovery authorization and encrypted backup protections continue to operate independently.
- The reconciliation regression compares exact encrypted records before and after reveal/hide and asserts no network call. The tag-lock regression compares the complete encrypted store snapshot, preserves seller identity and recovers the saved tag after unlock.
- Wallet attempt hiding does not remove, expire, rewrite or automatically clear a safety record. The original explicit-clear confirmation and duplicate-attempt refusal remain checked.
- Existing legacy plaintext migration records and the existing tab safety journal are not converted into a new plaintext history database. Their storage formats and safety behavior are preserved. Visual hiding does not imply that preexisting plaintext records have become encrypted.
- Visual preference persistence uses `ghostpay.uiPrivacy.v1`, containing only the two nonsecret preferences. A privacy-only update leaves the raw execution-settings bytes unchanged; full settings saves, execution-setting changes and external execution-storage conflicts keep their original conservative invalidation. A real authority probe verifies the unchanged partial legacy record and held grant, and cross-tab controls verify both private-only preservation and execution-setting revocation.
- No contract, fee, hosting, dependency, workflow, release-gate or optional privacy 5a–5l activation is part of this lane.

## Qualification boundaries

The receipts distinguish baseline failures, intermediate source, final source, actual passes and unexecuted browser assertions. Initial original-config checks passed 160 shell/reconciliation/custody tests and 85 CSP/bundle/egress security checks. Later independent probes drove additional source repairs, so those earlier results are not substituted for final integrated qualification.

Two browser scenarios exercise display/accessibility exclusion, keyboard focus, retained seller identity/drafts, encrypted history, explicit unlock/reveal and no new history lookup. The first local browser attempt built and started its preview, but both scenarios failed at browser launch because the configured Playwright executable was absent; zero scenario assertions ran. Browser screenshots, accessibility, integrated account lifecycle, the prepared-payment flow and final release gates must be evaluated on the final combined candidate. This audit does not mark issue #286 complete.

WalletAttempts ownership was handed to root after its source commit `d7eb3c8c` and the original four component checks passed. Root's additional returned-outcome fallback is required when a wallet returns a hash but journal persistence subsequently fails. It must retain the hash in memory behind the same account/chain history gate while preserving the unknown journal record and duplicate protection. That follow-up and the Pay/Registry provider lifecycle are separate integration inputs; this lane does not silently equate the earlier journal-only component with that completed behavior.
