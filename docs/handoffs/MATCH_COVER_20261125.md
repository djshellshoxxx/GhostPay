# Cover lookups for matched router payments — 2026-11-25 UTC

Worker: Claude Code session `newghostpay-ae`, branch `claude/w-match-cover-20261125` (PR #696). Owner-approved in-session
as a new capability, **off by default**. W3 confirmed it is outside W3/P14 scope.

## Problem

`docs/research/privacy-rpc-call-graph.md` (items 2 and 3): verifying a matched router payment sends the announcement's
block read, `eth_getTransactionReceipt` and `eth_getTransactionByHash` to the scan RPC and to a configured second RPC.
No non-matching announcement gets these, so each provider learns which public announcements matched.

## Design (v2, after independent review)

- `apps/web/src/lib/matchCover.ts`: `createMatchCover(true, viewingKey)` derives a domain-separated HMAC key from the
  viewing key (memory only, created before the worker zeroizes the key, zeroized by `dispose()` when the scan ends).
  `selects(item)` is a per-announcement decision: HMAC of the **transaction hash and ephemeral key** (both survive a
  reorg; block hash and log index do not) under a fixed share (1/2). `plan(ordered, candidates, covered)` keeps every
  real claim once in its original order and merges, **in chain order**, the selected candidates from the windows of
  covered claims (at most 32 per page; past the cap the lowest keyed ranks).
- `scanClient.ts`: optional `matchCover`; cover and covered claims must pass `sendsLookups` (the checks
  `verifyClaimedPayment` applies before its first request: router caller, positive amount, supported token,
  well-formed tx hash, block hash and log index). Decoys run through the real `verifyClaimedPayment` (same requests,
  caching and second provider) with a throwaway evidence set; results are discarded. Off: exactly the old loop.
- Setting `matchCover` in the scan-lane store (literal `true` only), Settings checkbox and disclosure, Scan passes it.

v1 (random per-payment decoys scored on `blockHash:logIndex` from the current page, shuffled) was rejected by the
review: decoys changed on resume, reorg and page splits (the payment was often the only common lookup), the shuffle
leaked order with several payments, and junk-token or malformed candidates sent no requests. v2 fixes all three.

## Limits (disclosed in Settings, Scan and docs/user/privacy-limits.md)

Visible: that a page had a match and roughly how many; timing; IP address. Little or no cover in a sparse window.
Not covered: the single-payment re-check from the result list (late acceptance) and the checkpoint replay after a
failed verification (call-graph item 6). Past 32 selected cover lookups in a page the set may differ between pages.
Cost grows with how busy the window is. Not anonymity.

## Evidence

`matchCover.test.ts` (share, reorg-stable selection, chain-order merge, windows, cap, monotone property, dispose);
`scanDisclosure.cover.test.ts` (PRIV-T02 instrumentation over the real scanner: off = 1 pair; on = the payment plus
exactly the key-selected window payments, never another window or an unsupported-token one; each cover lookup repeats
the block read, receipt and transaction in chain order; identical results with one and two payments; same selection
on rescan and on a resume that sees part of the window; same lookups on the second provider); Settings and Scan view
tests. Mutation checks recorded in the PR.
