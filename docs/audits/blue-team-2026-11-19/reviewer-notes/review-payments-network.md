> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# GhostPay payment and network source audit — partial checkpoint

## Outcome and coverage

This checkpoint records source inspection, not a completed audit or release approval. The initial lane inventory contains 40 production files and 82 test files. **27 production files are fully read, with complete main/candidate comparisons; 13 production files remain unread in this lane. Three test files are fully read in the candidate (plus two supplemental fix versions); 79 remain unread. No runtime, build, test, browser, network or transaction verification was executed.** Root has separately read jitter.ts main/candidate; the successor should import that record rather than repeat it.

One small candidate-specific wording defect is newly confirmed in this lane (PN-05). The custody lane owns the newly confirmed medium-severity #300 wallet-attempt integration regression; this lane independently confirmed its payment-availability impact. Three main-only medium-severity defects are already fixed in the combined candidate. The known malformed ERC20 simulation classification remains in main and the combined candidate and is fixed in #305. #303 adds a useful parser contract guard, with no production security exploit established.

| Snapshot | Immutable commit |
|---|---|---|
| Frozen main | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Combined candidate #302 | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| ERC20 simulation #305 | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| Amount validation #303 | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| Quick-hide #300 impact cross-check | `137628961463fc5abd8b7927b2efe6b18a0a206a` |

Sibling PR heads are independent snapshots. Absence of a combined-candidate fix from a sibling head is not itself evidence that the final integrated version regressed. All claims below are pinned to the stated source version.

## Review boundary

Core lean EVM routes plus accepted privacy, QR and scan additions; dormant alternative chain features excluded by root clarification.

This lane covers core Pay/Create/Sweep, payment and sweep helpers, wallet authority, receipt binding, manifest/deployment selection, network authorization, and the named scan/private-scan helpers in its initial inventory. Root owns build/CI/runtime and feature/closure assignments. Custody owns AppShell, seller session/state/vault/recovery/settings and related private UI. Package review owns cryptographic, schema and adapter implementations. Supporting CameraImporter, QrFrame/QR, Factory/route and e2e ownership still requires reconciliation with the global import-closure inventory; these were not silently counted in the initial 122-file list.

Instructions read: AGENTS.md, docs/ai/WORKFLOW.md, docs/ai/HANDOFF.md and docs/HANDOFF.md. Historical handoff text was treated as context, not evidence that current code or tests pass. Only local audit outputs were written. No app/test/config edits or Git mutations were made by this lane.

## Findings and disposition

| ID | Severity | Main | Combined candidate | Disposition |
|---|---|---|---|---|
| PN-01 | medium | present | fixed | known-in-candidate; independently source-confirmed |
| PN-02 | medium | present | fixed | known-in-candidate; independently source-confirmed |
| PN-03 | medium | present | fixed | known-in-candidate; independently source-confirmed |
| PN-04 | low | present | present | known GP-WEB-DRYRUN-BOOL-20261120 / PR #305 |
| PN-05 | low | not present under mandatory recipient format | present | new integration wording gap |

### PN-01 — Main receipt polling can associate a receipt with the wrong transaction

**Severity:** medium. **Confidence:** high. **Known/new:** known-in-candidate; independently source-confirmed.

**Applicable scenario.** The configured RPC returns an unrelated or misrouted successful receipt for a requested payment hash while the actual transaction is visible and still pending. Main only checks the optional destination and treats status 1 as success, so a receipt for another payment to the same router can be accepted.

**Impact and limits.** The UI and local export may classify the requested payment as included without a receipt bound to that hash. This is an integrity/error-handling issue at the configured RPC boundary; it does not establish independent chain verification or an attacker-independent payment forgery.

**Source evidence.**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/lib/wallet.ts:485–498`
- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/lib/payExec.ts:135–144`
- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/lib/payExec.ts:339–357`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/wallet.ts:497–508`

**Remediation direction.** Retain the candidate's exact transactionHash validation and strict receipt status validation. Verify the ordinary payment and approval flows exercise those failures through submitTx.

**Existing test evidence.** wallet and payExec test sources remain unread in this lane; do not claim their coverage or execution.

### PN-02 — Main native sweep signs a freshly observed balance rather than the amount displayed for review

**Severity:** medium. **Confidence:** high. **Known/new:** known-in-candidate; independently source-confirmed.

**Applicable scenario.** A seller sees the current native balance and starts a direct sweep. The balance changes before the signing preflight finishes. Main uses the newly read balance to calculate value, without requiring it to equal the balance passed by the view.

**Impact and limits.** The signed native transfer can move a different amount from the amount displayed when the action started. Existing destination checks and fee caps still apply; no theft or arbitrary destination bypass is claimed.

**Source evidence.**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/views/Sweep.tsx:337–338`
- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/views/Sweep.tsx:260–264`
- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/lib/sweep.ts:572–594`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/sweep.ts:695–701`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/sweep.ts:904–945`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/views/Sweep.tsx:611–634`

**Remediation direction.** Keep the candidate's equality check and explicit native fee preparation/confirmation. The single-use review should continue to bind destination, balance, nonce, fees, endpoint, manifest, replacement attempt and context until handoff.

**Existing test evidence.** Fully read sweep.reviewAuthority.test.ts:187–249, covering changed balances before signing, delayed reads, same-nonce replacement, and deposits after the checked snapshot. Native review and Sweep view tests remain unread. No execution.

### PN-03 — Main in-flight sweeps do not invalidate signing when the visible review changes

**Severity:** medium. **Confidence:** high. **Known/new:** known-in-candidate; independently source-confirmed.

**Applicable scenario.** During a slow vault or RPC step, the seller changes the destination or selected sweep context. The destination input remains editable. Main guards the seller session, but its captured action proceeds with the earlier review and the helper receives no live review callback.

**Impact and limits.** Main can sign or hand off the earlier destination/context while the view displays a newer choice. This is a stale-action authorization mismatch; existing transaction validation still applies to the captured fields.

**Source evidence.**

- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/views/Sweep.tsx:138–155`
- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/views/Sweep.tsx:242–264`
- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/views/Sweep.tsx:354–358`
- `c977b5d6723f6822c3b5d86cd6b231712c53c395:apps/web/src/lib/sweep.ts:650–664`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/views/Sweep.tsx:134–163`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/views/Sweep.tsx:420–455`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/sweep.ts:954–980`

**Remediation direction.** Preserve the candidate's scope identity, cancellation signals and assertReviewCurrent checks through key derivation, preflight, signing and pre-handoff. Once handoff starts, retain any returned or uncertain result even if the view subsequently changes.

**Existing test evidence.** Fully read sweep.reviewAuthority.test.ts:96–185, including review revocation before derivation, during RPC/signing, and preservation of outcomes once handoff began. UI-level review-scope tests remain unread. No execution.

### PN-04 — Malformed ERC20 boolean simulation data is reported as a successful dry run

**Severity:** low. **Confidence:** high. **Known/new:** known GP-WEB-DRYRUN-BOOL-20261120 / PR #305.

**Applicable scenario.** A configured node returns nonempty hexadecimal data for a direct ERC20 transfer simulation that is not a canonical ABI boolean. Main and the combined candidate classify any such return other than an exact false word as successful.

**Impact and limits.** The UI loses the unavailable-simulation warning and can misdescribe the preflight. The helper already permits unavailable simulation by policy, so this finding does not establish a new authorization bypass or fund-loss path.

**Source evidence.**

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/txGuard.ts:117–128`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/sweep.ts:774–780`
- `87cf6c603338ad64ec02300fe42b96c3e0a205b9:apps/web/src/lib/txGuard.ts:124–135`

**Remediation direction.** Include #305's canonical boolean classification: legacy empty return remains accepted; canonical true is accepted; canonical false is refused; other nonempty data is unavailable. Preserve the distinction between an unavailable simulation and a confirmed successful simulation.

**Existing test evidence.** txGuard.test.ts fully read in e22 (1–164) and #305 (1–183 via full base and complete diff). Added malformed-bool and generic-call cases reviewed. No execution.

### PN-05 — Receipt import description overstates recipient comparison for minimal receipts

**Severity:** low. **Confidence:** high. **Known/new:** new integration wording gap.

**Applicable scenario.** A payer has prepared a payment and imports a valid signed receipt that intentionally omits its one-time address. The view passes an expected address, but the shared binding function intentionally skips comparison when the receipt lacks that field.

**Impact and limits.** The introduction says a prepared one-time address is checked, although no recipient comparison occurs for this permitted minimal receipt. Signature, invoice digest, chain, asset and amount checks still occur; the success message and export correctly describe a seller attestation rather than independent payment proof.

**Source evidence.**

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/locales/en.json:973`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/views/Pay.tsx:678–687`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:packages/invoice-schema/src/receipts.ts:147–155`
- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/locales/en.json:983–985`

**Remediation direction.** Make the introductory claim conditional on the receipt carrying an address, or display which optional fields were actually compared. Keep the intentional privacy-preserving omission.

**Existing test evidence.** Package worker read the intended minimal-receipt acceptance tests. This lane independently inspected package binding lines139–163, full Pay and full ReceiptPanel; relevant web receipt tests remain unread. No execution.

## Known hardening without a confirmed production security path

### PN-H01 — parseUnits runtime type and precision validation

**Severity:** informational. **Confidence:** high. known PR #303.

A caller violates the TypeScript contract by supplying a non-string amount or invalid precision. The helper can throw instead of returning undefined. Reviewed production callers supply strings and compiled or fixed valid precisions; an externally reachable misuse was not established.

Helper API robustness and error predictability; not a confirmed production security exploit.

- `e22c1748a3de6eb02f5be3abe27d634b238c67c6:apps/web/src/lib/format.ts:16–24`
- `a9e0715573f7247d7a16f9d1d030cf0232708fb2:apps/web/src/lib/format.ts:16–25`

Remediation: Keep #303's typeof and integer-range guard.

Full e22 format.test.ts1–78 and #3031–92 read; added invalid-type/precision tests cover the helper contract. No execution.

## Cross-lane confirmations

### #300 omits wallet prop at real Pay callers, hiding all attempt recovery controls

**Owner:** `browser_custody_review`.

**Severity/confidence:** medium/high. new #300 integration regression; custody lane owns canonical finding.

After a wallet attempt, the journal retains the action until an explicit review/clear. In #300 WalletAttempts hides records and clear controls unless wallet is supplied, but both Pay call sites still omit it, including after connection.

The intended in-app recovery is unreachable and repeat requests for the same invoice remain blocked in the tab. Payment keys are scoped to invoice and chain rather than account, so merely reconnecting does not clear that block. No funds-loss claim.

- `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/components/WalletAttempts.tsx:24–40`
- `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/views/Pay.tsx:1059`
- `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/views/Pay.tsx:1127`
- `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/lib/duplicateAttemptJournal.ts:64–87`
- `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/lib/wallet.ts:285–295`
- `137628961463fc5abd8b7927b2efe6b18a0a206a:apps/web/src/lib/wallet.ts:347–372`

Remediation: Pass the current wallet into real core Pay call sites and exercise the actual view with a retained attempt. Custody owns the detailed test follow-up.

### Candidate idle suspension unmounts CreateInvoice even when unbacked seller keys remain loaded

**Owner:** `browser_custody_review`.

**Disposition:** refuted candidate issue.

Custody full source read: AppShell candidate132–135 selects seller view when suspended; idle lock263 suspends synchronously and clears private scan state266–268. Our CreateInvoice keyed-state analysis therefore does not establish retained visible form data in candidate.

AppShell source owned and read by custody, not included in this lane's own full-read ledger.

### Minimal receipts deliberately omit recipient address

**Owner:** `core_packages_review`.

**Disposition:** intended schema behavior; no primitive/parser issue established.

Package worker confirmed optional recipient and tests. Our full export/import flow review independently found appropriate attestation wording except PN-05.

### jitter.ts main/candidate fully read by root

**Owner:** `root`.

**Disposition:** external lane coverage; do not duplicate.

Root message confirms full main/candidate jitter.ts read; exact root ledger is authoritative. This lane leaves it unread in its own ledger.

## Properties traced in fully reviewed source

- Payment preview/build identity and current wallet/provider/account/chain authority are checked before wallet handoff; unknown outcomes retain an attempt record and any returned hash.
- Candidate receipt polling binds exact transaction hash and accepts only receipt status 0 or 1.
- Candidate native sweep review is opaque, single-use, time-bounded by wall and monotonic clocks, and bound to exact serialized transaction fields and fee reserve.
- Candidate direct/relayed sweep guards recheck current review across asynchronous steps; locally derived secret buffers are wiped in finally blocks.
- Candidate default services require per-operation network grants, exact endpoint authority, cancellation and bounded transport; raw fallback fetch refuses.
- Candidate invoice signer pin snapshots, selection identity and stale-scope checks were traced through the Pay view.
- Candidate ReceiptPanel defaults recipient export off, revalidates invoice/scan ownership facts before signing, and labels receipts as seller attestations.
- Manifest selection and deployment pin paths were read; the removed optional runtime manifest loading helper was not treated as a reachable default flow.

These are bounded source observations, not claims that all transitive code or runtime behavior has been verified. The ledger below identifies what was actually read.

## Coverage ledger

Every full-read row spans the entire file. “Via complete diff” means the other version was fully read and every changed/deleted hunk for this version was inspected. Byte-identical main files inherit that read without redundant reading. Targeted evidence rows do not imply a full-file audit. All full source rows have exact object identity and line ranges in the JSON.

| Commit prefix | Path | Blob | Read lines | Method |
|---|---|---|---|---|
| `e22c1748a3de` | `apps/web/src/lib/pay.ts` | `479341df5a6a5a5f90038520d3934fe2d4fcdea8` | 1–607 | full-source-read (same main blob) |
| `e22c1748a3de` | `apps/web/src/lib/payExec.ts` | `3ce29cb9498df24def6a1137e2c0030b656d771f` | 1–361 | full-source-read (same main blob) |
| `e22c1748a3de` | `apps/web/src/lib/txGuard.ts` | `abba792709126a191cbd589f2023351a7b9e1c66` | 1–208 | full-source-read (same main blob) |
| `87cf6c603338` | `apps/web/src/lib/txGuard.ts` | `c5e7b6ea5ac9525395cb4bc8c63f923db40d2e23` | 1–215 | full-source-read-via-base-plus-complete-diff |
| `e22c1748a3de` | `apps/web/src/lib/wallet.ts` | `800cfa90810b887898d4184ff3f5ccfb2601c971` | 1–519 | full-source-read |
| `c977b5d6723f` | `apps/web/src/lib/wallet.ts` | `fb1d864f3223ce007e35d81c19a308df88657121` | 1–506 | full-source-read-via-candidate-plus-complete-diff |
| `e22c1748a3de` | `apps/web/src/lib/transactionOutcome.ts` | `375636b65ab3f9548dd06cce0dde98a94bf4b447` | 1–115 | full-source-read (same main blob) |
| `e22c1748a3de` | `apps/web/src/lib/format.ts` | `18dad7e4235c922bb7f197312317cc86557a12c2` | 1–73 | full-source-read (same main blob) |
| `e22c1748a3de` | `apps/web/src/lib/invoiceCreate.ts` | `4f1f9c81c07c1068e49942a163421596288f6dba` | 1–176 | full-source-read (same main blob) |
| `e22c1748a3de` | `apps/web/src/lib/manifest.ts` | `a9565d96c42e35b57f62e7235a13aa6729c886b9` | 1–82 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/deployment.ts` | `6cfa79ac859e983f1fdc937abf5904e7ae5b5a6b` | 1–37 | full-source-read (same main blob) |
| `e22c1748a3de` | `apps/web/src/lib/opStackFee.ts` | `2f55a4af5b36ff10f279c66e0b13dcf83e87b1bb` | 1–84 | full-source-read (same main blob) |
| `a9e0715573f7` | `apps/web/src/lib/format.ts` | `9ba8ea7b418eab5cf18e900923572cf3e255aedd` | 1–74 | full-source-read-via-base-plus-complete-diff |
| `e22c1748a3de` | `apps/web/src/lib/defaultServices.ts` | `2487789e2b88f73bceaf5ac5dc464a531e659dcb` | 1–123 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/services.ts` | `fcaf46383e7fb88d2d6042af1b260713c783a432` | 1–35 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/networkSelection.ts` | `cd5803357898b84863f7885c9fb827b28ff2693a` | 1–42 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/networkOperation.ts` | `e0cae13f36927b031b74ab2d98c1233f015a95db` | 1–23 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/invoiceVerification.ts` | `6256d5b234db85f4f7b0dfac40c4d5f55957e4ea` | 1–49 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/invoiceSignerPins.ts` | `9f870bed002dac0b809ab00f82c2b66c032f197c` | 1–218 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/boundedRequest.ts` | `1867f9ad6b8913a135489ab715812851b7258f79` | 1–144 | full-source-read |
| `e22c1748a3de` | `apps/web/src/components/InvoiceSignerVerification.tsx` | `9cb9a8af0d806cb3ac7c33d396113d4e8ecd787a` | 1–121 | full-source-read |
| `e22c1748a3de` | `apps/web/src/components/InvoicePaymentSummary.tsx` | `7d73d645f829d14179a44c952bde2cfb62f5224c` | 1–30 | full-source-read (same main blob) |
| `e22c1748a3de` | `apps/web/src/components/WalletAttempts.tsx` | `70ba12b8ae8d07460266c07f4dbd25e6126bfb80` | 1–34 | full-source-read (same main blob) |
| `e22c1748a3de` | `apps/web/src/views/Pay.tsx` | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` | 1–1524 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/sweep.ts` | `2acd7e6fee3f508ef5b55608c8d90fb7684852dc` | 1–1062 | full-source-read |
| `c977b5d6723f` | `apps/web/src/views/Pay.tsx` | `579cbe531c39c83745e9a188b176b5a479a32a6b` | 1–1409 | full-source-read-via-candidate-plus-complete-diff |
| `e22c1748a3de` | `apps/web/src/views/Sweep.tsx` | `6da18522b825c99b4073fd238174f63a8a2b7b38` | 1–699 | full-source-read |
| `e22c1748a3de` | `apps/web/src/views/CreateInvoice.tsx` | `5d562426908fbffc8b9aecb4c8e4a223a3a174f2` | 1–406 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/networkAuthorization.ts` | `04defade63f86886f12a6299f19f46a2e562b680` | 1–500 | full-source-read |
| `c977b5d6723f` | `apps/web/src/lib/sweep.ts` | `ef73a7ec629cf33da5dba4fa8b3d9f80913bbb1a` | 1–746 | full-source-read-via-candidate-plus-complete-diff |
| `c977b5d6723f` | `apps/web/src/views/Sweep.tsx` | `75ea26cfa62a08cbfe001d6ac02c68c6bc210566` | 1–462 | full-source-read-via-candidate-plus-complete-diff |
| `c977b5d6723f` | `apps/web/src/views/CreateInvoice.tsx` | `cb7cf3244a39c2a3b6894c616f71b562f4bab025` | 1–396 | full-source-read-via-candidate-plus-complete-diff |
| `c977b5d6723f` | `apps/web/src/lib/receipts.ts` | `cf880e0b9ee40a1d30c76a15e08e1c06674d71c1` | 1–119 | full-source-read-via-candidate-plus-complete-diff |
| `c977b5d6723f` | `apps/web/src/components/ReceiptPanel.tsx` | `b81b4868434aae0891c5cd4a664ac48aecf3f947` | 1–328 | full-source-read-via-candidate-plus-complete-diff |
| `e22c1748a3de` | `apps/web/src/lib/receipts.ts` | `a9b42e29afa652c552d17823f3d77b8eeb07cdcd` | 1–132 | full-source-read |
| `e22c1748a3de` | `apps/web/src/components/ReceiptPanel.tsx` | `b6cc91507f78283db57a7bb5f99b28f27711fffc` | 1–335 | full-source-read |
| `e22c1748a3de` | `apps/web/src/lib/txGuard.test.ts` | `c5c6f6488a7ddd52bc175df6b8221ff45b2fd44d` | 1–164 | full-test-source-read (same main blob) |
| `87cf6c603338` | `apps/web/src/lib/txGuard.test.ts` | `1f1749730b2af7483bacdeecc29f2fbda5490de3` | 1–183 | full-test-source-read-via-base-plus-complete-diff |
| `e22c1748a3de` | `apps/web/src/lib/format.test.ts` | `3d6a9f5fade916452bc64fe98a3c9abb64add101` | 1–78 | full-test-source-read (same main blob) |
| `a9e0715573f7` | `apps/web/src/lib/format.test.ts` | `43d5b5c882abdfb392776dd13d772e972f13ab46` | 1–92 | full-test-source-read |
| `e22c1748a3de` | `apps/web/src/lib/sweep.reviewAuthority.test.ts` | `b1e5c22e708da43efa3d61b85d9272ce136a2bdb` | 1–249 | full-test-source-read |
| `137628961463` | `apps/web/src/components/WalletAttempts.tsx` | `a9aef3f940bed8f3e26a45ffd75aedea2f0b5563` | 1–42 | full-source-read |
| `137628961463` | `apps/web/src/lib/duplicateAttemptJournal.ts` | `b8c2ec1915b833a5b78286b9b9caca1c247e827c` | 1–90 | full-source-read (same main blob) |
| `137628961463` | `apps/web/src/views/Pay.tsx` | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` | 1–1524 | identical-blob-to-fully-read-candidate |
| `e22c1748a3de` | `apps/web/locales/en.json` | `f37853282e922f1817b948d5bada66dc84c3ad34` | 971–993, 1439–1451, 1462–1480 | targeted-evidence-only |
| `e22c1748a3de` | `packages/invoice-schema/src/receipts.ts` | `a991e6aa7ac6bb2cea5758a1d79409c513758311` | 139–163 | targeted-evidence-only |
| `c977b5d6723f` | `apps/web/src/lib/manifest.ts` | `9ac0bdf0eb093554c8d7c74440732fca4bfebd22` | 1–127 | full-source-read-via-candidate-plus-complete-diff |
| `c977b5d6723f` | `apps/web/src/lib/defaultServices.ts` | `49158fb4ffec9b1d1eb55bcce21f081dbc9c8d4d` | 1–48 | full-source-read-via-candidate-plus-complete-diff |
| `c977b5d6723f` | `apps/web/src/lib/services.ts` | `283d87dbbd410235d2e5cbbdcd58d941b774e27d` | 1–29 | full-source-read-via-candidate-plus-complete-diff |
| `137628961463` | `apps/web/src/lib/wallet.ts` | `fb1d864f3223ce007e35d81c19a308df88657121` | 282–296, 344–374 | targeted-evidence-only |

There are no remaining main-comparison gaps for the 27 fully read production files. The locale and shared-package rows are targeted cross-lane evidence only. The #300 journal/component reads are additional to the initial 40-file production inventory.

## Existing tests reviewed — not executed

- `apps/web/src/lib/txGuard.test.ts`: transaction guards, dry run outcomes and #305 boolean classification. Versions: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, `87cf6c603338ad64ec02300fe42b96c3e0a205b9`.
- `apps/web/src/lib/format.test.ts`: formatting/parser contract and #303 invalid type/precision behavior. Versions: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, `a9e0715573f7247d7a16f9d1d030cf0232708fb2`.
- `apps/web/src/lib/sweep.reviewAuthority.test.ts`: review revocation and reviewed native balance invariants. Versions: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.

Source review only. Existing test expectations are not runtime evidence and do not establish test pass status.

## Successor handoff

Read remaining production files in full from e22, then compare main with complete diffs or full source. Root has already fully read jitter.ts main/candidate; import root coverage instead of repeating it. Review remaining test source and global union variants. Root assigned successor additional net-transport/scan-source coverage.

Preserve full-read coverage when blobs match; do not infer full coverage from searches, execution or names.

### Remaining production files

All rows below are **unread in this lane** at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. Compare main versions too; same-blob equivalence can eliminate duplicate reads. Root separately completed jitter.ts.

| Path | Lines | Candidate blob |
|---|---:|---|
| `apps/web/src/lib/jitter.ts` | 127 | `9845576adfb522c17db145b1772276f66523180c` |
| `apps/web/src/lib/privateScanLifecycle.ts` | 99 | `4a8b9e954c6f11be7438b0d6b7a14519e4ff3c63` |
| `apps/web/src/lib/privateScanStore.ts` | 365 | `7d0651782bdd49927bf40630035fa8e717ea6afd` |
| `apps/web/src/lib/relayerClient.ts` | 221 | `419e5624c35dde3b5b1c4e94d2a1d09638d7b31f` |
| `apps/web/src/lib/scanClient.ts` | 871 | `3b5fe3c1a8aafa1c270930b567fd06e2086d7b11` |
| `apps/web/src/lib/scanCursorSlot.ts` | 110 | `4997190d33dceca56b2a9ec4f24238fec44ce0dd` |
| `apps/web/src/lib/scanMatches.ts` | 47 | `48da43b4c870fc9d3debaf46b00e19951d012ba5` |
| `apps/web/src/lib/scanPrivacy.ts` | 743 | `4dae49b9eb15d99fb5ecb34e84b76f6ac0a95c59` |
| `apps/web/src/lib/scanSpam.ts` | 213 | `da35b619ad1aa7efa8607e0ab9ce8278b585bd61` |
| `apps/web/src/lib/scanner.worker.ts` | 15 | `59c8bcfb1d3227f8ba04ac9b88e4a6ab2f101092` |
| `apps/web/src/lib/scannerCore.ts` | 167 | `3ad466bae0d7d19187260e0696c0d29fb6a71293` |
| `apps/web/src/lib/workerFactory.ts` | 6 | `292fe169b63d29278cdb739d8168fc868075c5d0` |
| `apps/web/src/views/Scan.tsx` | 1035 | `d92f0f2df98b2452a9285c5d4e4687d4096a0834` |

### Remaining test files

All 79 rows below are **unread test source**, not failed tests and not evidence of missing tests. Review in batches after remaining production source.

| Path | Lines | Candidate blob |
|---|---:|---|
| `apps/web/src/components/InvoicePaymentSummary.test.tsx` | 41 | `ceb237b51e68887f5932b8a87ddf4e71a7719522` |
| `apps/web/src/components/InvoiceSignerVerification.test.tsx` | 143 | `28a040d3b4b2049f97d90c6de10605aa32fd9210` |
| `apps/web/src/components/ReceiptPanel.archive.test.tsx` | 92 | `93dc56732d3fc433d640fb88b04d1f13295beac1` |
| `apps/web/src/components/ReceiptPanel.i18n.test.tsx` | 67 | `ee6c99f0a4dc9d5c3a8d47194f9e6425c24e8d06` |
| `apps/web/src/components/ReceiptPanel.invoice.test.tsx` | 200 | `909b92a8ba967c82af14dfffe0385b34ef4331ad` |
| `apps/web/src/components/ReceiptPanel.profile.test.tsx` | 85 | `ba9b2d6b690c2494cad7c4c3633abff7de6a0d4c` |
| `apps/web/src/components/ReceiptPanel.test.tsx` | 142 | `8f14ca64dfef6668c59d280597dd252adf849bb0` |
| `apps/web/src/components/WalletAttempts.test.tsx` | 18 | `8109cae9dd53a8645ce4c5fcda524b752b95cb6b` |
| `apps/web/src/lib/boundedRequest.browser.test.ts` | 15 | `e7b54d33c2c5b22fc2fba0ff17c02a38862b3e73` |
| `apps/web/src/lib/boundedRequest.test.ts` | 167 | `475a53013815ba732ee5cf85bdbaaa928c97dbb8` |
| `apps/web/src/lib/defaultServices.authorization.test.ts` | 86 | `562e292e392c8e0292af5967c86ea471b5270d91` |
| `apps/web/src/lib/defaultServices.networkGuard.test.ts` | 61 | `39bad79a85423c2d6a2a9358840b4df4bbde5347` |
| `apps/web/src/lib/defaultServices.privacySelection.test.ts` | 72 | `f0b6da1a3eb205f758919e46cb007b775303ca7d` |
| `apps/web/src/lib/defaultServices.test.ts` | 81 | `3cda7fc01a8595a544248b5d48303a667cbd33b9` |
| `apps/web/src/lib/deployment.test.ts` | 48 | `be90aa64969b62e5616161b848ef35e0b12b9804` |
| `apps/web/src/lib/invoiceCreate.test.ts` | 149 | `b852ad654e5d78f79d971accd90810dd7d82f549` |
| `apps/web/src/lib/invoiceSignerPins.test.ts` | 306 | `d0f00af1cc06573870f047967b97087cc086628d` |
| `apps/web/src/lib/invoiceVerification.test.ts` | 54 | `dc43e8c535e862c4e5798d5b757f6335d29c6ce0` |
| `apps/web/src/lib/jitter.test.ts` | 150 | `ff652c1d81720c9e45157479058e6b7b0edcaad2` |
| `apps/web/src/lib/manifest.test.ts` | 116 | `2ac9bc61dbebd721aecab2fedf1eb3e50d501d68` |
| `apps/web/src/lib/networkAuthorization.adapters.test.ts` | 93 | `6a27d3bd41b8508001539a914eabbf0c7f138ae4` |
| `apps/web/src/lib/networkAuthorization.profileConsistency.test.ts` | 44 | `f1a38a5bd5264cede57e98b1c0cb883f8bc335d6` |
| `apps/web/src/lib/networkAuthorization.test.ts` | 482 | `4fda284ea68de5ddbf68b5608d0a06491875153d` |
| `apps/web/src/lib/networkOperation.test.ts` | 64 | `bb02e38582b7b3cdf9bf638be6bd52c2129114a6` |
| `apps/web/src/lib/pay.test.ts` | 611 | `7e27cf90328b7d9421e394edc10515e61157a1d5` |
| `apps/web/src/lib/payExec.acceptance.test.ts` | 171 | `6eafa0466c682977baa69b7c87b91ffd8b79c227` |
| `apps/web/src/lib/payExec.test.ts` | 1025 | `0e9a3abe4e78e4091b19614ef68efb285b5c1254` |
| `apps/web/src/lib/privateScanLifecycle.test.ts` | 190 | `8d8f2e22bdff1be59721a9ce1a7b8ad29eaeb4ad` |
| `apps/web/src/lib/privateScanStore.test.ts` | 304 | `c39c51ef15e04127ea434ed6cbb98791c7eb851d` |
| `apps/web/src/lib/receipts.test.ts` | 149 | `d8770c168ada02cedf50ecaa8bb47060f7199a35` |
| `apps/web/src/lib/relayerClient.test.ts` | 210 | `6cb95e18b26429619d78a5f5ca9e11071dd497ff` |
| `apps/web/src/lib/scanClient.test.ts` | 1995 | `297c6f0cbf22e8e351f42579c05dc4c79bdb6cc5` |
| `apps/web/src/lib/scanCursorSlot.test.ts` | 404 | `3565f11dd4ef6cee70789fa26c9da22e4230a03d` |
| `apps/web/src/lib/scanMatches.test.ts` | 33 | `2973e6da0371537fa5198bc01998f83fc49bdd40` |
| `apps/web/src/lib/scanPrivacy.authorization.test.ts` | 94 | `7cdb7bf627b2624005f1ba8e3d0ee8bc12e6df3c` |
| `apps/web/src/lib/scanPrivacy.bulkEvidence.test.ts` | 24 | `5bb3480d1e52945391c83f2be161e5ddef73fe9a` |
| `apps/web/src/lib/scanPrivacy.clients.test.ts` | 85 | `42bc1709a3c13f624a7ce0865d7a08580938e37a` |
| `apps/web/src/lib/scanPrivacy.i18n.test.ts` | 106 | `931eeb063f1fa6855b95e757472cef69724f5d7d` |
| `apps/web/src/lib/scanPrivacy.scheduler.test.ts` | 164 | `6cb3f232ccffe8c453d1c977d0b80c16a483ff0e` |
| `apps/web/src/lib/scanPrivacy.test.ts` | 520 | `604004028b6b804b1f41f8bb62e2de61e892ea6b` |
| `apps/web/src/lib/scanPrivacy.transport.test.ts` | 68 | `f022052311390d7338e38f0c2a548b731ddd3093` |
| `apps/web/src/lib/scanSpam.partial.test.ts` | 37 | `ceeba44eb5156581c4fa9c65b3104109306bff1e` |
| `apps/web/src/lib/scanSpam.test.ts` | 272 | `762deed547d68f934999994d770369b2ee95c9ad` |
| `apps/web/src/lib/scannerCore.bench.nocov.test.ts` | 54 | `907f5f380fd846c46cd4737deb6aeae8878a2bc4` |
| `apps/web/src/lib/scannerCore.fuzz.test.ts` | 38 | `77ce0bd28772235418d9e241b0da84028068035f` |
| `apps/web/src/lib/scannerCore.spam.nocov.test.ts` | 194 | `671e4041953379c58270388eebb201fcec2dd541` |
| `apps/web/src/lib/scannerCore.test.ts` | 256 | `64d9d0d95a66da023f2968faa7bd97c7dbe66605` |
| `apps/web/src/lib/sweep.boundaryAudit.test.ts` | 215 | `e3813045c7975bcbd4e1201d65869e6962827c25` |
| `apps/web/src/lib/sweep.destinations.privacy.test.ts` | 114 | `8097b83ba5ce627a38ec302fd9f9b1950369ba4b` |
| `apps/web/src/lib/sweep.nativeReview.test.ts` | 336 | `1a57ad6d116171cc64cab5293aa572a45d22daa2` |
| `apps/web/src/lib/sweep.test.ts` | 1124 | `c391e4aca34e7125383e04bb32d26f1c1b55bd4d` |
| `apps/web/src/lib/transactionOutcome.test.ts` | 177 | `90b3f7c9212cedf477e37a70be285dacba302fa4` |
| `apps/web/src/lib/wallet.test.ts` | 383 | `0eef38ea9deb736072515d3240eeabfbd6b5e49b` |
| `apps/web/src/views/CreateInvoice.buffer.test.tsx` | 249 | `5c4269fa33cad4250deba0b955c4a090c0b269bd` |
| `apps/web/src/views/CreateInvoice.i18n.test.tsx` | 51 | `8269636eef8652821346ec8fa375671409561e21` |
| `apps/web/src/views/CreateInvoice.ordering.test.tsx` | 76 | `5cded4b3666f14dc57f1878c245a59d6bed4192a` |
| `apps/web/src/views/CreateInvoice.privacy.test.tsx` | 118 | `e882d1107eb8a88c4583094a1081a82fc7d1f644` |
| `apps/web/src/views/CreateInvoice.register.test.tsx` | 83 | `c0ab7561bb91cc777026c081a9ee39ff54db2e41` |
| `apps/web/src/views/CreateInvoice.supported.test.tsx` | 159 | `17feff9faf1ceb38432b63cd1cf361433827b340` |
| `apps/web/src/views/CreateInvoice.test.tsx` | 281 | `de1c61ddaee5a7e2ef33b41a2c02a6bbfda6569e` |
| `apps/web/src/views/Pay.i18n.test.tsx` | 135 | `b8d80d61869c5c0ec015302a872a63269534d6ad` |
| `apps/web/src/views/Pay.invoiceQr.test.tsx` | 373 | `3eb5ab0072c4cf5c61b7502d68d0e141dfd3b133` |
| `apps/web/src/views/Pay.network.test.tsx` | 81 | `e72ea03feaa07a7e5450ac3eae1bef7c7a097887` |
| `apps/web/src/views/Pay.preflightCompletion.test.tsx` | 151 | `a8375bae63a9648c425d9da9e5dc8dbaa041f8a8` |
| `apps/web/src/views/Pay.signer.test.tsx` | 239 | `06a1750266a87afac186e7b1d8b64f4af689a9de` |
| `apps/web/src/views/Pay.supported.test.tsx` | 170 | `d19f8f7efd6ca0fb5b5d6ef738e1fcf56fb8f83d` |
| `apps/web/src/views/Pay.test.tsx` | 1273 | `199ecddf5d1e6ab7aec4ebd2ba5d01a5908f0b3c` |
| `apps/web/src/views/Scan.autoRescan.test.tsx` | 157 | `1c52101fd63804fa5e80c540923d89a5606afc8e` |
| `apps/web/src/views/Scan.i18n.test.tsx` | 94 | `2892f973dcb48a6076eb38e768bd43082378becb` |
| `apps/web/src/views/Scan.privacy.test.tsx` | 117 | `146a90721ae039959af1ce4cd973c572394721f7` |
| `apps/web/src/views/Scan.privateCheckpoint.test.tsx` | 440 | `a704ec91667f26d087cb732e273873a2b8514560` |
| `apps/web/src/views/Scan.stealthExport.authorization.test.tsx` | 172 | `576a2c5ff4bc13b61181d554c7a59135070d1cb9` |
| `apps/web/src/views/Scan.stealthExport.test.tsx` | 124 | `a386af69cb9c30910df93438cb8d589d16229980` |
| `apps/web/src/views/Scan.test.tsx` | 703 | `c25de17f75fcea631452b769aadede99a305f25f` |
| `apps/web/src/views/ScanPrivacy.i18n.test.tsx` | 216 | `bd5571c580d0fbfb882bf15d0e39c97e1ff60231` |
| `apps/web/src/views/Sweep.nativeReview.test.tsx` | 188 | `e8d5fcb22def002ca90add99e344b4a132835c10` |
| `apps/web/src/views/Sweep.privacy.test.tsx` | 224 | `70d8ba09fbc19a6b2ab2de14d21d73c25cebb6a4` |
| `apps/web/src/views/Sweep.quoteLifecycle.test.tsx` | 424 | `2da1d11b208b413377b41b8416c0909dd0deebfa` |
| `apps/web/src/views/Sweep.test.tsx` | 1070 | `2be1f668375db2c95f6d184514350bc0913b8685` |

### Questions to resolve

- Follow scanClient/scannerCore/Scan dataflow for receipt authenticity, private scan guarantees and cursor/restore authority.
- Review relayerClient response and refusal semantics against known unresolved-attempt policy.
- Read wallet receipt regression tests and Pay/Sweep integration tests for confirmed old defects and new #300 issue.
- Confirm supporting CameraImporter, QrFrame, qr and Factory/route source ownership through root closure; these are not in this initial 122-file manifest.
- Parent/custody owns canonical #300 WalletAttempts finding; avoid duplicate counting.

### Work constraints and checkpoint integrity

No app/test/config edits, no Git mutations, no execution/probes/transactions/reproduction. Only local audit outputs in parent authorized paths.

- No application, test, configuration or Git mutation performed by this lane. Only local audit outputs were written.
- No live network request, transaction, browser interaction, exploit reproduction or test/build execution.
- Workspace reset erased scratch during initial review. Root restored the same immutable repository objects. The functions store preserved the read ledger; identical reviewed blobs were not automatically reread.
- Sibling PR heads are independent snapshots. A fix absent from another sibling head is not by itself an integration regression.
- Production scope is not complete. Unread scan/relayer source and test files must be assigned before any global completion claim.
- Instruction documents were read for workflow; historical handoff text was not treated as proof of current behavior.

The workspace reset was handled by restoring the same immutable objects. Previously recorded full reads survived in the functions store, then were reconstructed into this ledger. Output that was truncated before being visible was not counted; the missing Sweep diff and authority-test content was subsequently reread completely.

