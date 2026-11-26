# Cover lookups for matched router payments — 2026-11-25 UTC

Worker: Claude Code session `newghostpay-ae`, branch `claude/w-match-cover-20261125`. Owner-approved in-session as a new
capability, **off by default**. W3 confirmed it is outside W3/P14 scope.

## Problem

`docs/research/privacy-rpc-call-graph.md` (items 2 and 3): verifying a matched router payment sends the announcement's
block read, `eth_getTransactionReceipt` and `eth_getTransactionByHash` to the scan RPC and to a configured second RPC.
No non-matching announcement gets these, so each provider learns which public announcements matched the seller's keys.

## Change

- `apps/web/src/lib/matchCover.ts`: `createMatchCover(size, viewingKey)` derives a domain-separated HMAC key from the
  viewing key (one-way, memory only, created before the worker zeroizes the key). `plan(ordered, candidates, {covered,
  group})` returns every real claim once **in its original order** (verification order decides which of two claims
  sharing a transfer is credited) plus, for each covered claim, the `size - 1` candidates of the same 1000-block window
  with the lowest keyed score, placed at CSPRNG-uniform positions.
- `scanClient.ts`: optional `matchCover`; the per-page loop runs the planned steps. Decoys go through the real
  `verifyClaimedPayment` (same requests, same client caching, second provider included) with a throwaway evidence set;
  results are discarded. Without `matchCover` the steps are exactly the old loop.
- Setting `matchCover` in the scan-lane store (`scanSpam.ts`, only a literal `true` enables it), a Settings checkbox,
  Scan passes `MATCH_COVER_SIZE` (4) and both screens disclose it.

## Properties and limits

Kept: real verification and its order, evidence crediting, finality, reorg handling, the second-provider comparison.
Hidden from each provider (per page): which of the four lookups is the payment. Deterministic decoys per payment and
window, so a reorg or a later rescan does not let two lookup sets be intersected. Not hidden: that some payment
matched in that window, how many (groups of four), timing, IP address. A thin window gives a smaller group. Cost: four
times the verification requests. This is not anonymity and the texts do not claim it.

## Evidence

`matchCover.test.ts` (unit and seeded property), `scanDisclosure.cover.test.ts` (PRIV-T02 instrumentation over the
real scanner: off = 1 pair, on = 4 pairs with 2 of 8 about the payment, same set on rescan and on the second
provider, none from another window), Settings and Scan view tests. Mutation checks: decoys skipping the second
provider, and random instead of keyed decoys, each fail tests. Existing scan, disclosure and privacy suites pass.
