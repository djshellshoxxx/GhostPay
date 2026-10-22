# 02 Scanner robustness and expected-payment verification

Priority P0 | Effort M (4-6 d) | Owner: web scanner + chain-adapters | Deps: 01 (for trusted announcer/router addresses)
Sources: research DOC-1, ERC-5564 pitfalls 1.2 (1,3,5); gap-analysis s2 item 2, item 7; audit S3-02, G-04; ADR-0013 item 1.

## 1. Problem
Direct (non-router) payers can emit announcements with a wrong view tag, wrong amount, invalid ephemeral point, or for tokens never sent. Router checks length and prefix only, so an off-curve key passes on-chain. The scanner must never crash, stall, or display unverified amounts, and must still find real payments whose tag was wrong.

## 2. Design
Classification of every log (pure function in `scannerCore.ts`):
```ts
type ScanVerdict = 'match_verified' | 'match_unverified' | 'not_mine' | 'malformed';
interface DetectedPayment { txHash; logIndex; blockNumber; stealth: Address; viaRouter: boolean; amount?: bigint; token?: Address; verdict: ScanVerdict; finality: 'pending'|'final'; invoiceRef?: string }
```
Rules:
1. Parse failure, key length != 33, bad prefix, point not on curve (noble `Point.fromBytes` throws) -> `malformed`, counted in stats, never thrown.
2. View-tag mismatch -> `not_mine` normally. For active invoices (local record with expected stealth address, token, amount, expiry) run the **expected-payment fallback**: derive stealth address from invoice nonce/ephemeral and check `Transfer(to=stealth)` logs (or `balanceOf` at a finalised block) irrespective of tag. A hit yields `match_verified` with note `tag_mismatch`.
3. Amount shown only if verified: for router logs, decode metadata (57 bytes) and cross-check with `Transfer` log in the same tx; for non-router logs require a `Transfer` log or `balanceOf` delta; otherwise `match_unverified` ("claimed, not confirmed").
4. Duplicates keyed by (chainId, txHash, logIndex); reorg: re-fetch last `finalityDepth` blocks each pass (per-chain default in config), `pending` until depth reached.
5. Work bounds: max N=5000 logs per page, per-pass CPU budget, worker cancel; per-announcer spam counters feed spec 05.
6. Reconcile with the invoice by nonce/amount/token; report underpay/overpay/double-pay (ADR-0003 allows double pay).
7. Wire `requestWithFallbackCheck` at checkpoints: compare log count/hash over a block window across two providers; mismatch -> banner, no silent trust.

## 3. Threats
Crash/stall via crafted points or metadata (rule 1); false amounts (rule 3); censorship by a single RPC (rule 7); resource exhaustion (rule 5); forged `Transfer` events from a malicious token (token allowlist, ADR-0011, applies to verification; non-allowlisted tokens shown as unverified).

## 4. Tests
Table-driven fixtures: off-curve key, 32/34-byte key, prefix 04, truncated metadata, wrong tag with real transfer, right tag with no transfer, duplicate log, reorg replacing a block, 100k spam logs under time budget. Property test: scanner never throws for arbitrary bytes. Differential: verdicts for valid scheme-1 vectors equal `core-crypto` results.

## 5. Acceptance
- [ ] Fuzz of 1M random logs: zero throws. - [ ] Wrong-tag real payment is found when an invoice exists. - [ ] No amount rendered without `match_verified`. - [ ] SPEC_REVIEW C5 wording matches behaviour.
UNVERIFIED: ERC-5564 explicit on-curve text (DOC-5); behaviour relies on local validation regardless.
