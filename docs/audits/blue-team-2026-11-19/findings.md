# Confirmed findings — GhostPay core blue-team source audit

Canonical register. Static source inspection; no tests executed and no application changes applied.

## Disposition at the principal snapshots

| ID | Severity | Frozen main | Combined candidate #302 | Separate branch disposition |
|---|---|---|---|---|
| BROWSER-01 | Medium | Absent | Absent | New, unresolved in quick-hide #300; absent in clipboard-only #297 |
| PN-01 | Medium | Present | Corrected | Intermediate hash-only correction is partial |
| PN-02 | Medium | Present | Corrected | Preserve reviewed balance and exact native review |
| PN-03 | Medium | Present | Corrected | Preserve review-context authority |
| PN-04 | Low | Present | Present | Corrected in independent #305 |
| PN-05 | Low | Absent under mandatory-recipient format | Present | New minimal-receipt description mismatch |
| SN-K01 | Low | Present | Corrected | Preserve cancellation before further dispatch |

The final freshness cut also includes main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Its changes from the initial main are documentation and the static-hosting export profile/tests; the application source implicated by all seven findings is unchanged. The main dispositions below therefore apply to both main pins. The added hosting/branch delta is tracked separately in the final coverage notes.

Severity is qualitative priority, not a calculated CVSS score. All seven findings have high confidence in the cited source behavior; no runtime reproduction is claimed. A correction on one sibling branch is not assumed merged into another. Main is `c977b5d6723f6822c3b5d86cd6b231712c53c395`; candidate is `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. Full branch pins are in the inventory and individual evidence below.

## BROWSER-01 — wallet-attempt recovery controls are unreachable

**Severity:** Medium (P2). **Confidence:** High. **Status:** new and still present in #300; absent from main/#302/#297. No prior issue identifier established.

### Source evidence

| Exact source | Evidence |
|---|---|
| [137628961463: apps/web/src/components/WalletAttempts.tsx, 10–40](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/components/WalletAttempts.tsx#L10-L40) | Optional wallet prop gates visible records and the only rendered clear control; omitted prop always yields an empty visible list. |
| [137628961463: apps/web/src/views/Pay.tsx, 1055–1059](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.tsx#L1055-L1059) | Input branch mounts WalletAttempts with no wallet prop. |
| [137628961463: apps/web/src/views/Pay.tsx, 1124–1127](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.tsx#L1124-L1127) | Review branch mounts WalletAttempts with no wallet prop. |
| [137628961463: apps/web/src/features/registry/RegistryView.tsx, 269–272](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/features/registry/RegistryView.tsx#L269-L272) | Registry route mounts WalletAttempts with no wallet prop. |
| [137628961463: apps/web/src/lib/wallet.ts, 285–295](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/lib/wallet.ts#L285-L295) | Payment attempt identity uses chain plus invoice scope, not the currently selected account. |
| [137628961463: apps/web/src/lib/wallet.ts, 347–372](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/lib/wallet.ts#L347-L372) | beginAttempt executes before the provider submission; the returned hash updates but retains the attempt. |
| [137628961463: apps/web/src/lib/duplicateAttemptJournal.ts, 64–87](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/lib/duplicateAttemptJournal.ts#L64-L87) | An existing same-key record blocks beginAttempt, with no expiry or automatic eviction; explicit clear removes it. |
| [137628961463: apps/web/src/components/WalletAttempts.test.tsx, 11–36](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/components/WalletAttempts.test.tsx#L11-L36) | Connected component test manually supplies wallet; omitted-wallet test intentionally hides clear while preserving duplicate protection, without itself validating route wiring. |

### Reachable flow and practical impact

Core Pay and Registry mount the component without props. Once the tab journal contains an attempt, the component can display its generic warning but treats wallet as undefined regardless of the actual connection. It never renders the record, returned hash, or confirmed-clear button. A subsequent matching action is rejected by beginAttempt before a new provider submission, and the record does not expire automatically.

Users cannot review or clear unresolved attempt records through the core route UI, so retry/recovery for a matching payment or registry action stays blocked while that record remains in the tab journal. Changing a payment account does not change the invoice-scoped duplicate key. This is a recovery/availability regression; no loss of funds is established.

The journal intentionally retains both unknown and submitted records. It has no automatic expiration, and its duplicate check happens before the wallet provider submission. The latest component’s `wallet === undefined` branch is therefore a functional recovery dead end even when the route has a connected wallet. The independent payments review confirmed this exact source flow.

### Remediation and test evidence

Pass the current connected wallet context to WalletAttempts at every core caller. Make the integration contract explicit so omitted wallet wiring cannot silently compile. Use the existing Pay route regression and extend coverage for pre-existing attempt review and confirmed clearing across connected, disconnected, account-change and chain-change states, while retaining privacy gating and duplicate-submission protection.

The reviewed #300 component tests manually inject a wallet for the connected case. A separate omitted-wallet case verifies that clear is hidden and duplicate protection remains. Those component-level assertions do not establish that the real Pay or Registry routes pass the needed context. Tests were read only; no result is claimed from execution.


### Correction from later full test review

An existing [Pay route regression on affected #300, lines 647–663](https://github.com/djshellshoxxx/GhostPay/blob/137628961463fc5abd8b7927b2efe6b18a0a206a/apps/web/src/views/Pay.test.tsx#L647-L663) already exercises rejected submission, duplicate refusal, confirmed clearing and a second wallet request. Its render helper mounts the actual App without replacing WalletAttempts. This assertion should expose the missing prop when run on #300; execution was not verified. Earlier handoff language implying Pay lacks that route regression is superseded. The production finding is unchanged.

## PN-01 — Main receipt polling can associate a receipt with the wrong transaction

**Severity:** medium. **Confidence:** high. **Known/new:** known-in-candidate; independently source-confirmed.

**Applicable scenario.** The configured RPC returns an unrelated or misrouted successful receipt for a requested payment hash while the actual transaction is visible and still pending. Main only checks the optional destination and treats status 1 as success, so a receipt for another payment to the same router can be accepted.

**Impact and limits.** The UI and local export may classify the requested payment as included without a receipt bound to that hash. This is an integrity/error-handling issue at the configured RPC boundary; it does not establish independent chain verification or an attacker-independent payment forgery.

**Source evidence.**

- [c977b5d6723f: apps/web/src/lib/wallet.ts, 485–498](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/wallet.ts#L485-L498)
- [c977b5d6723f: apps/web/src/lib/payExec.ts, 135–144](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/payExec.ts#L135-L144)
- [c977b5d6723f: apps/web/src/lib/payExec.ts, 339–357](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/payExec.ts#L339-L357)
- [e22c1748a3de: apps/web/src/lib/wallet.ts, 497–508](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/wallet.ts#L497-L508)

**Remediation direction.** Retain the candidate's exact transactionHash validation and strict receipt status validation. Verify the ordinary payment and approval flows exercise those failures through submitTx.

**Existing test evidence.** All scoped wallet/payExec test variants were subsequently read. Corrected variants assert wrong-hash/status/type refusal while preserving broadcast identity and duplicate protection. No tests ran.

## PN-02 — Main native sweep signs a freshly observed balance rather than the amount displayed for review

**Severity:** medium. **Confidence:** high. **Known/new:** known-in-candidate; independently source-confirmed.

**Applicable scenario.** A seller sees the current native balance and starts a direct sweep. The balance changes before the signing preflight finishes. Main uses the newly read balance to calculate value, without requiring it to equal the balance passed by the view.

**Impact and limits.** The signed native transfer can move a different amount from the amount displayed when the action started. Existing destination checks and fee caps still apply; no theft or arbitrary destination bypass is claimed.

**Source evidence.**

- [c977b5d6723f: apps/web/src/views/Sweep.tsx, 337–338](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Sweep.tsx#L337-L338)
- [c977b5d6723f: apps/web/src/views/Sweep.tsx, 260–264](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Sweep.tsx#L260-L264)
- [c977b5d6723f: apps/web/src/lib/sweep.ts, 572–594](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sweep.ts#L572-L594)
- [e22c1748a3de: apps/web/src/lib/sweep.ts, 695–701](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sweep.ts#L695-L701)
- [e22c1748a3de: apps/web/src/lib/sweep.ts, 904–945](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sweep.ts#L904-L945)
- [e22c1748a3de: apps/web/src/views/Sweep.tsx, 611–634](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Sweep.tsx#L611-L634)

**Remediation direction.** Keep the candidate's equality check and explicit native fee preparation/confirmation. The single-use review should continue to bind destination, balance, nonce, fees, endpoint, manifest, replacement attempt and context until handoff.

**Existing test evidence.** Fully read sweep.reviewAuthority.test.ts:187–249, covering changed balances before signing, delayed reads, same-nonce replacement, and deposits after the checked snapshot. The consolidated test ledger records later native-review and Sweep view coverage. No execution.

## PN-03 — Main in-flight sweeps do not invalidate signing when the visible review changes

**Severity:** medium. **Confidence:** high. **Known/new:** known-in-candidate; independently source-confirmed.

**Applicable scenario.** During a slow vault or RPC step, the seller changes the destination or selected sweep context. The destination input remains editable. Main guards the seller session, but its captured action proceeds with the earlier review and the helper receives no live review callback.

**Impact and limits.** Main can sign or hand off the earlier destination/context while the view displays a newer choice. This is a stale-action authorization mismatch; existing transaction validation still applies to the captured fields.

**Source evidence.**

- [c977b5d6723f: apps/web/src/views/Sweep.tsx, 138–155](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Sweep.tsx#L138-L155)
- [c977b5d6723f: apps/web/src/views/Sweep.tsx, 242–264](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Sweep.tsx#L242-L264)
- [c977b5d6723f: apps/web/src/views/Sweep.tsx, 354–358](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Sweep.tsx#L354-L358)
- [c977b5d6723f: apps/web/src/lib/sweep.ts, 650–664](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/sweep.ts#L650-L664)
- [e22c1748a3de: apps/web/src/views/Sweep.tsx, 134–163](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Sweep.tsx#L134-L163)
- [e22c1748a3de: apps/web/src/views/Sweep.tsx, 420–455](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Sweep.tsx#L420-L455)
- [e22c1748a3de: apps/web/src/lib/sweep.ts, 954–980](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sweep.ts#L954-L980)

**Remediation direction.** Preserve the candidate's scope identity, cancellation signals and assertReviewCurrent checks through key derivation, preflight, signing and pre-handoff. Once handoff starts, retain any returned or uncertain result even if the view subsequently changes.

**Existing test evidence.** Fully read sweep.reviewAuthority.test.ts:96–185, including review revocation before derivation, during RPC/signing, and preservation of outcomes once handoff began. The consolidated test ledger records later UI review-scope coverage. No execution.

## PN-04 — Malformed ERC20 boolean simulation data is reported as a successful dry run

**Severity:** low. **Confidence:** high. **Known/new:** known GP-WEB-DRYRUN-BOOL-20261120 / PR #305.

**Applicable scenario.** A configured node returns nonempty hexadecimal data for a direct ERC20 transfer simulation that is not a canonical ABI boolean. Main and the combined candidate classify any such return other than an exact false word as successful.

**Impact and limits.** The UI loses the unavailable-simulation warning and can misdescribe the preflight. The helper already permits unavailable simulation by policy, so this finding does not establish a new authorization bypass or fund-loss path.

**Source evidence.**

- [e22c1748a3de: apps/web/src/lib/txGuard.ts, 117–128](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/txGuard.ts#L117-L128)
- [e22c1748a3de: apps/web/src/lib/sweep.ts, 774–780](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sweep.ts#L774-L780)
- [87cf6c603338: apps/web/src/lib/txGuard.ts, 124–135](https://github.com/djshellshoxxx/GhostPay/blob/87cf6c603338ad64ec02300fe42b96c3e0a205b9/apps/web/src/lib/txGuard.ts#L124-L135)

**Remediation direction.** Include #305's canonical boolean classification: legacy empty return remains accepted; canonical true is accepted; canonical false is refused; other nonempty data is unavailable. Preserve the distinction between an unavailable simulation and a confirmed successful simulation.

**Existing test evidence.** txGuard.test.ts fully read in e22 (1–164) and #305 (1–183 via full base and complete diff). Added malformed-bool and generic-call cases reviewed. No execution.

## PN-05 — Receipt import description overstates recipient comparison for minimal receipts

**Severity:** low. **Confidence:** high. **Known/new:** new integration wording gap.

**Applicable scenario.** A payer has prepared a payment and imports a valid signed receipt that intentionally omits its one-time address. The view passes an expected address, but the shared binding function intentionally skips comparison when the receipt lacks that field.

**Impact and limits.** The introduction says a prepared one-time address is checked, although no recipient comparison occurs for this permitted minimal receipt. Signature, invoice digest, chain, asset and amount checks still occur; the success message and export correctly describe a seller attestation rather than independent payment proof.

**Source evidence.**

- [e22c1748a3de: apps/web/locales/en.json, 973](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/locales/en.json#L973)
- [e22c1748a3de: apps/web/src/views/Pay.tsx, 678–687](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Pay.tsx#L678-L687)
- [e22c1748a3de: packages/invoice-schema/src/receipts.ts, 147–155](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/invoice-schema/src/receipts.ts#L147-L155)
- [e22c1748a3de: apps/web/locales/en.json, 983–985](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/locales/en.json#L983-L985)

The same overclaim appears in [help.receiptFile, English line 2062](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/locales/en.json#L2062), rendered by [Pay.tsx:1256](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Pay.tsx#L1256). The final complete English-resource review independently confirmed this second instance; it is the same finding.

**Remediation direction.** Make the introductory and help-text claims conditional on the receipt carrying an address, or display which optional fields were actually compared. Keep the intentional privacy-preserving omission.

**Existing test evidence.** Package worker read the intended minimal-receipt acceptance tests. This lane independently inspected package binding lines139–163, full Pay and full ReceiptPanel; the consolidated test ledger records later web receipt-test coverage. No execution.


## SN-K01 — Main continues dispatching scan RPCs after the user presses Cancel

**Severity:** low. **Confidence:** high. **Disposition:** known-in-candidate; fixed in the combined candidate. Root confirmed this was not already assigned to another canonical finding.

A normal scan can have several announcement windows or provider-limit subdivisions in progress. In frozen main, pressing Cancel aborts the view’s controller and terminates the worker, but the window decorator receives no cancellation signal. If cancellation happens while an optional jitter delay or preceding window request is pending, the continuation can still issue additional `getLogs` requests. The outer scan checks cancellation after the entire adapter fetch returns.

**Impact.** The already selected RPC can receive additional scan-range and timing activity after the user withdraws the action, and the UI may wait for that page work to settle. This is a cancellation/privacy-consent boundary defect. No changed destination, key disclosure, transaction submission or fund-loss path is established. The finding concerns requests that begin after cancellation; it does not claim that bytes already sent can be recalled.

### Source evidence

- [Main Cancel button](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Scan.tsx#L393-L395) aborts the action; [main client construction](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/views/Scan.tsx#L199-L207) does not supply that signal.
- [Main worker teardown](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanClient.ts#L147-L160) is bound to abort, while [the adapter fetch](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanClient.ts#L267-L271) is awaited before cancellation is checked.
- [Main window options](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts#L341-L344) have no signal. [The jitter continuation](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts#L372-L378) proceeds into `inner.getLogs`; [recursive split processing](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts#L400-L420) and [the window loop](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts#L438-L458) have no action-cancellation check.
- [Candidate primary construction](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L442) and [secondary construction](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/views/Scan.tsx#L488) pass signal and current-context guards. [Candidate dispatch](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L455-L467) checks after jitter; [split scheduling](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.ts#L494-L518) checks cancellation. [Candidate scoped RPCs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanClient.ts#L185-L214) guard calls made internally by adapters and discard late results.

**Remediation direction.** Preserve these candidate checks during integration and maintain cancellation at every asynchronous boundary that can schedule another request. Keep the distinction between suppressing later requests and recalling a request already dispatched.

**Existing test-source evidence.** [Scheduler cases](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.scheduler.test.ts#L27-L105) cover pre-aborted work, cancelled head/log responses, provider-limit rejection, and cancellation during jitter. [Caller-cancellation cases](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/scanPrivacy.authorization.test.ts#L21-L93) cover bootstrap refusal, indexer abort propagation, no subsequent windows, and the post-jitter check. These complete files were read; no tests were run.


## Integration priorities

1. Correct #300 wallet-context wiring and qualify its existing real-route clearing/retry test on the integrated commit.
2. Preserve #302 receipt binding, sweep balance/review authority and scan-cancellation corrections. Frozen main still has those defects.
3. Integrate independent #305 simulation-result correction and amend the minimal-receipt description.
4. Track unranked qualification and maintenance items separately in [observations.md](observations.md).

Intermediate wallet variant `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` has hash binding without the later strict status guard; it is only a partial PN-01 correction. No remediation was applied by this audit.
