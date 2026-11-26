# W5 payment-state safety model (milestone 1)

Derived from accepted requirements only. Production resolver, journal and Pay logic were **not** used to define any
property below; the harness observes the built app as a black box (DOM text, wallet requests, browser storage) and
compares it with the synthetic chain's ground truth. Citations are to `main` `aaa71a112d90fd39f59b40de9f139e9cfdc62d61`.

## Assets, boundary, adversary

- Asset: the payer's funds (no duplicate payment) and the payer's evidence (the wallet-returned transaction hash).
- Trust boundary: the page trusts neither the RPC nor the wallet's eventual reply; the chain is truth only through
  canonical evidence. One browser profile; two top-level tabs of the same origin.
- Adversity modelled (non-malicious faults, synthetic only): wallet reply lost, delayed or erroring after broadcast;
  tab closed or reloaded at any step; RPC unavailable, slow or answering for superseded state; account/chain change
  mid-flight; reorg removing an inclusion. No live wallet, funds, third-party host or unbounded fuzzing.
- Out of scope (accepted limitation, R26): other browsers/profiles/devices, private windows, embedded iframe, cleared
  site data, sibling `*.github.io` origins (R27, open owner decision).

## Accepted requirements used

| ID | Requirement (near-verbatim) | Source |
|---|---|---|
| R3 | "Wallet prompt started, no hash returned — Outcome unknown." / "Hash returned, RPC unavailable — The journal retains the returned hash. Verification is incomplete." | `docs/handoffs/PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md:7-8` |
| R4 | "Reconnecting or reloading never authorizes another payment." | same file `:3` |
| R5 | "Closing the tab first leaves an `unknown` record that still blocks a repeat send." | `docs/engineering/ESSENTIAL_FEATURE_PROGRESS.md:27-29` |
| R12 | "Unknown outcomes must not become 'nothing sent.'" | `docs/user/product-guide.md:97-98` |
| R13 | "A transaction that might exist cannot be reset to an unsubmitted state solely to allow retry." "No blind automatic resend." | `docs/superpowers/specs/2026-11-09-accelerated-beta-design.md:52,68` |
| R14 | Receipt with missing/different hash → "Verification stops"; receipt without comparable transaction → "Unconfirmed". | `PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md:9-10` |
| R15 | "never show an unverified or late payment as confirmed" | `docs/ai/ACTIVE_WORK.md:5` |
| R19 | "at most one wallet request per invoice across tabs and restarts; hash never lost … Pay refuses a second send" | `docs/engineering/ESSENTIAL_FEATURE_MATRIX.md:52-53` |
| R20 | "Pay refuses a second send for a recorded invoice before the wallet is asked." | `ESSENTIAL_FEATURE_PROGRESS.md:23-24` |
| R23 | "A pending payment in IndexedDB must prevent permit, approval and payment wallet requests from a second tab with a stale mirror." | `docs/ai/ACTIVE_WORK.md:46-47` |
| R25 | "A recorded attempt blocks another send for the same action across tabs … until you explicitly clear it"; clear confirm: "Clearing permits another attempt and may cause a duplicate payment … Clear this record?" | `apps/web/locales/en.json:1076,1094` |
| R28 | "A wallet, chain, invoice or deployment change can invalidate the review." | `docs/user/product-guide.md:84-85` |
| R29 | negatives for "changed terms … chain switch and stale asynchronous work" | `accelerated-beta-design.md:49` |
| R36 | "Confirmed reorgs invalidate the affected inclusion and retain its evidence and decision history" | `docs/adr/ADR-0026-local-reconciliation-and-receipt-archive.md:234` |
| R41 | "Transaction matches the preview, matching receipt reports success — Included in the reported block. Finality still depends on the chain." | `PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md:11` |
| R42 | "A distinct invoice must reach its wallet." | `docs/ai/ACTIVE_WORK.md:47` |
| R46/R49 | journal kept "until the user clears the record or site data"; "Retain transaction references" | `docs/threat-model/PRIVACY_THREAT_MODEL.md:110`; `product-guide.md:97` |

## Invariants checked (black-box)

Notation: intent **X** = the paid invoice; **C** = unrelated control invoice. `sends(X)` = wallet requests that can move
funds for X (eth_sendTransaction / signing for X's router call) across both tabs and all reloads. `clears(X)` = user
clear actions on X's record whose confirmation dialog was accepted. `truth(h)` = synthetic chain state of hash `h`.

| Inv | Statement | From |
|---|---|---|
| I1 no false success | A visible "included/confirmed/paid" status for X is allowed only while `truth(h)` is mined, successful and canonical for the hash `h` the wallet returned for X. Checked at every settle point after a reload or explicit status check. A claim is never passed silently: it is judged against the hashes it displays (full or privacy-masked `0x1234…abcd`). A displayed hash the wallet never returned for that intent is foreign evidence and fails; it is never replaced by a different transaction. Only a claim that displays no hash at all is judged against every hash the wallet returned for the intent (at least one must be canonical at that block; the fallback basis is recorded); with no returned hash, or on a tab whose intent is unknown and no known hash qualifies, it fails. An unchanged claim is re-judged at every step: if it is still shown after a fresh render of its tab (open, in-page switch, reload, close/reopen, restart) and no longer holds, that is a violation (I8 when the inclusion was reorged out); while only a chain change or a journal check has happened since, it is the labelled ambiguity A1. | R14, R15, R41 |
| I2 uncertainty ≠ retry | `sends(X) ≤ 1 + clears(X)` at all times, across tabs, reloads, reconnects, account events and RPC faults. Dismissing the clear dialog is not a clear. | R4, R13, R19, R20, R25 |
| I3 unknown stays visible | After a send was handed to the wallet for X, every later load of a journal screen shows **X's own** record until a deliberate clear: a row carrying X's returned hash (full or masked), or, when no hash reached a live document or the document ended within the record window (A5), a hash-less "Outcome unknown" row. Rows are matched by identity, not counted: a row with another intent's hash, or a duplicate of one, cannot stand in for X, and each hash-less row satisfies at most one intent. When several intents could each own a hash-less row, identity is unjudgeable and that is recorded explicitly. A pay action left enabled is a violation only together with a missing record; with X's record visible it is classified explicitly as "pay enabled with record" (R20 only requires refusal before the wallet is asked, which I2 judges). | R3, R5, R12, R20 |
| I4 hash survives | If the wallet returned `h` for X and the page stayed open ≥ the record window, `h` stays retained (visible in the wallet-attempt list or in same-origin storage) after reload, close/reopen and in the other tab, until a deliberate clear. | R3, R19, R46, R49 |
| I5 stale authority | (a) no fund-moving wallet request carries a `from` other than the wallet's current account or targets a chain other than the wallet's current 84532; (b) a status result for a superseded hash, account or intent never produces a success display for another intent. | R28, R29 |
| I6 cross-tab | While X has a recorded attempt from tab A, tab B issues zero wallet requests for X unless tab B's user deliberately clears; after one clear, at most one further request. | R19, R23, R25 |
| I7 control isolation | C reaches the wallet exactly once when paid, regardless of X's state in either tab; C never displays X's hash or status. | R42 |
| I8 reorg | After a reorg removes X's inclusion, a rechecked or reloaded status for X is not "included/confirmed"; `h` remains retained. | R36, R41, R46 |

## Ambiguities recorded (not scored as product defects)

- A1 Payer-side reorg rule unspecified (requirements gap 9): I8's "rechecked status must not stay included" is the
  conservative reading of R15/R41; a stale display *before* any recheck is reported as AMBIGUOUS, not a defect.
- A2 Requirement docs disagree on scope: `PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md:14` still says the payer journal is
  "tab-scoped", contradicting `en.json:1076` and `ESSENTIAL_FEATURE_PROGRESS.md:14-16`. The harness uses the later,
  user-visible cross-tab requirement. Routed to docs owners.
- A3 "One wallet request per invoice" vs ERC-20 approval/permit + payment (gap 5). Milestone 1 uses the native asset so
  the count is unambiguous.
- A4 Wallet rejection (4001) treatment is an open owner decision (R18): a rejected request still counts as a handoff
  for I2; whether the app later permits retry without a clear is reported, not scored.
- A5 Tab closed before the hash record lands (R5) legitimately leaves `unknown` without the hash; I4 applies only when
  the page stayed open for the record window.
- A6 R19 says "at most one wallet request **per invoice**", while R25 scopes the block to "the same action". If a
  second request for X arrives only from a *different wallet account* (each account within its own limit), the
  harness reports A6 instead of I2: whether switching accounts may pay the same invoice again is not settled.

## Explicit classifications (recorded, not scored)

- `payEnabledWithRecord`: checkout for an intent whose own record is visible keeps its send button enabled (R20).
- `I1 judged without a displayed known hash (<basis>)`: the fallback basis used for an inclusion claim.
- `I3 unknown-row identity unjudgeable`: several intents could each own a hash-less row; matched by count only.
- `i3UnqualifiedMatches`: an expected record satisfied only by a hash-less "Outcome unknown" row. This shows a record
  is present, not that it is that intent's record; it is reported as unqualified, never as proof of identity.

Each is listed per run in `results/<run>/SUMMARY.md`; none can turn a missing record or an unsupported claim into a pass.

## Classification of a failing sequence

1. **Harness defect** — reproduces against the harness's own self-test or depends on a mock behaviour that no real
   EIP-1193 wallet / JSON-RPC node exhibits. Fixed in the harness; rerun.
2. **Ambiguous requirement** — violates only an A-item reading.
3. **Product defect** — violates I1–I8, minimized, reproduced twice with the same seed against the pinned bundle.
   Routed to W2 (journal/Pay) or W3 (status/reconciliation) via `HANDOFF.md`; never fixed here.

---

# Milestone 2: seller-side reconciliation

Accepted requirements only (cited at main `e7e98109`; `ADR` = `docs/adr/ADR-0026-local-reconciliation-and-receipt-archive.md`,
`HO` = `docs/handoffs/P1_LATE_CONSOLIDATION_20261124.md`, `UR` = `docs/user/reconciliation-and-receipts.md`,
`RS` = `docs/user/receive-and-scan.md`, `AW` = `docs/ai/ACTIVE_WORK.md`). The seller is a separate browser profile with
two tabs; payments come from the real payer checkout in another profile, and the synthetic chain emits the events
the contract specification defines. In scope as shared core per `docs/ai/STOP_WORK_20261125.md:30,66`: individual
invoice status, payment evidence, reconciliation and truthful pending/confirmed/unknown state. Out of scope (stopped):
merchant dashboard/analytics (F04), device sync (P07), fiat (F13).

## Requirements used

| ID | Requirement (near-verbatim) | Source |
|---|---|---|
| S1 | "Matching is local and proposal-only … only a seller confirmation links anything" | ADR:33-35 |
| S4 | exact window `[createdAt − 5 min, expiresAt)` by canonical block time; a late scan of a pre-expiry block still matches | ADR:48-51,58-59 |
| S7 | confirm repeats matching at write; otherwise "no longer has a single exact invoice match" | ADR:67-71 |
| S9 | "Pending and unverified router observations … cannot establish a paid state. A verified late transfer … can be accepted explicitly after a complete scan and an independent recheck" | ADR:229-233 |
| S10 | a transfer is late when its canonical block timestamp ≥ `expiresAt` | ADR:226-227 |
| S13 | manual links cannot stand in for the late-acceptance action | ADR:247-248 |
| S14 | "Confirmed reorgs invalidate the affected inclusion and retain its evidence and decision history"; `lateAcceptedAt` survives | ADR:234-235; HO:39 |
| S16 | "If any read fails, nothing is written"; only observations whose stored blockHash differs are invalidated | ADR:192-196 |
| S18 | an invoice linked only to an invalidated observation reopens for matching | ADR:203-204 |
| S20 | a reorg seen by only one of two RPCs, or a missing checkpoint block, stops the scan; nothing rolled back | RS:35-36 |
| S23 | a lower agreed tip withholds credit for a payment that lost confirmation depth; a resumed scan restores it once final | ADR:239-240 |
| S27 | "count only distinct verified linked payments … withhold credit through interruptions, preserve seller decisions on invalidation" | AW (#575 acceptance) |
| S30 | "never show an unverified or late payment as confirmed" | AW (#635 acceptance) |
| S31 | proposal state shown only on the invoice it names; unrelated invoices unaffected | HO:44 |
| S32 | linked totals count distinct transaction logs once; only live, final-at-scan observations | UR:35-41 |
| S38/S39 | lock, chain, seller-key or session change clears state; each action re-checks scope; writes are compare-and-swap | ADR:129-142 |

Finality for 84532: `finalityDepth: 100` (`packages/chain-adapters/src/config/chains.ts:42`, configuration, not a
documented requirement; RS:25 says depth is not independent finality verification).

## Seller invariants (black-box)

`X` = invoice paid in the scenario, `C` = unrelated control invoice; "linked/paid" = the invoice card shows
`Linked to a verified observation.`, `Verified late payment accepted by seller.` or an amount `equals` for it.

| Inv | Statement | From |
|---|---|---|
| SI1 no false paid | X shows linked/paid only if its payment is mined, successful, canonical and at least 100 blocks deep at the last scan, or was explicitly accepted late on such evidence. Pending or unverified evidence never shows as linked/paid. | S9, S30, S32 |
| SI2 proposal only | X becomes linked only after a seller confirm or accept-late action recorded by the harness. | S1, S7 |
| SI3 late needs acceptance | A payment with block time ≥ X's expiry never links X through ordinary confirm; only "Accept late payment", after a complete scan. | S9, S10, S13 |
| SI4 reorg | After X's linked inclusion is reorged out and the seller rescans or reloads, X no longer shows linked/paid; an invalidation notice or reopened state is shown; an accepted-late decision time stays visible. | S14, S16, S18 |
| SI5 interruption | An RPC outage or tab reload during a scan never adds credit from the incomplete pass; a failed canonical read writes nothing. | S16, S20, S27 |
| SI6 distinct | The same transaction observed by repeated scans or both seller tabs is counted once (no `above` and no double credit). | S27, S32 |
| SI7 control | C's card never shows X's state or evidence. | S31 |
| SI8 two seller tabs | A confirm in one seller tab is not silently overwritten by a stale action in the other; after a reload both tabs agree. | S39 |

## Ambiguities recorded (M2)

- SA1 Depth 100 is configuration, not a documented requirement; scenarios use it as the app's own rule.
- SA2 Whether a recheck failure's "unverified" marking is persisted is unspecified (HO:48 vs ADR:193).
- SA3 Cross-tab seller refresh (BroadcastChannel) has no documented requirement (requirements report S41); SI8 checks
  only the compare-and-swap guarantee (S39).
- SA4 Docs disagree on whether a cutoff-invalidated record can become valid again (RS:38 vs ADR:199).
- SA5 `docs/user/reconciliation-and-receipts.md` still describes observation-time matching (UR:14-27); the ADR's
  canonical block time is used (ADR:57-63).
- SA6 Between a chain change (reorg, drop) and the seller's next completed scan, the app cannot know of the change, so a
  still-displayed link is stale knowledge, not a false claim. It is recorded as SA6 with the step; right after a
  completed scan in that tab the same display is judged strictly (SI1/SI4).
- SA7 A link withdrawn by a reorg should carry a visible invalidation notice (requirements S29); a withdrawn link
  without one is recorded, not scored, because the notice wording is not fixed by an accepted requirement.

Harness rules specific to M2 (each was a harness defect first, see HANDOFF H8–H10): decisions are taken in place on
the live Scan view, because proposals exist only for live scan results (S3); a named-scenario step marked `must`
that does not take effect is a harness error, so a vacuous scenario cannot pass; the positive control P2 (a single
RPC that keeps serving the pre-reorg fork, outside the trust boundary per RS:25) must make SI4 fire.
