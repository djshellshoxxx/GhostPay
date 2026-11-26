# Cover lookups for matched router payments — 2026-11-25 UTC

Worker: Claude Code session `newghostpay-ae`, branch `claude/w-match-cover-20261125` (PR #696). Owner-approved in-session
as a new capability, **off by default**. W3 confirmed it is outside W3/P14 scope.

## Problem

`docs/research/privacy-rpc-call-graph.md` (items 2 and 3): verifying a matched router payment sends the announcement's
block read, `eth_getTransactionReceipt` and `eth_getTransactionByHash` to the scan RPC and to a configured second RPC.
No non-matching announcement gets these, so each provider learns which public announcements matched.

## Design (v3, after the second independent review, 2026-11-26)

Continued by Claude Code session `newghostpay-77` after `newghostpay-ae` stopped.

- `apps/web/src/lib/matchCover.ts`: `createMatchCover(true, viewingKey)` derives a domain-separated HMAC key from the
  viewing key (memory only, created before the worker zeroizes the key, zeroized by `dispose()` when the scan ends).
  `selects(item)` is a per-announcement decision: HMAC of the transaction hash, ephemeral key, one-time address and
  metadata under a fixed share (1/2). All four survive a reorg. `plan(real, candidates)` returns every real claim and
  every selected candidate once, all in chain order. No window, trigger or cap.
- `scanClient.ts`: every page plans cover from its router announcements that pass `sendsLookups` (the checks
  `verifyClaimedPayment` applies before its first request), whether or not the page holds a match. Decoys run through
  the same `verifyClaimedPayment` call with a separate per-page evidence set; results are never shown or recorded.
  Only their block and receipt state feed the replay-anchor rule in `persistable`, exactly like real checks (third
  review, 2026-11-26); with cover on, a failed real claim that sends no request no longer moves the anchor. Off:
  exactly the old behaviour. A run held by a budget now also retries failed cover checks, advancing at least to the
  next failing block each resume.
- Setting `matchCover` in the scan-lane store (literal `true` only). Saved lane settings that cannot be read exactly are
  marked `unreadable`: a scan does not start, and Settings says so until they are saved again. A running scan stops
  when the saved cover choice changes or becomes unreadable.

### Why v2 was replaced

v2 looked up cover only in a page with a match, from that page, capped at 32. The second review (AI, read-only, with a
simulation over the real planner) showed that a resumed or automatic re-scan reads a short new range plus the finality
tail, so intersecting the lookups of successive scans often left the payment alone (about 91% of runs at 5 router
payments per 1000 blocks, 19% at 100); that a provider could use its own log answers as a match oracle; that the
global cap could be crowded with supported-token dust; that deduplication could leak order; and that the unreadable
settings and mid-scan change points raised on the PR were not fixed. (v1 had failed an earlier review for decoys that
changed between scans, order leaks and silent decoys.)

## Limits (Settings, Scan disclosure and docs/user/privacy-limits.md)

Aimed at a provider that records requests. Not covered: a provider that alters, withholds or fails its answers; block
reads of payments recorded against saved invoices (after a reorg report or a ledger retry); repeated on-chain copies
(independent decisions); the token named by the similar-transfer estimate; the single-payment re-check from the result
list; balance reads, key export and sweeps through the same RPC; time and IP address. A decoy that fails verification
(such as a smart-wallet payment) gets fewer requests and no second-provider lookup. Only supported-token router
payments serve as cover. Cost: about half of all router payments read, each scan. Not anonymity.

## Evidence

`matchCover.test.ts` (share, reorg stability, content binding, cover without a match, no cap, chain order, split
independence, dispose); `scanDisclosure.cover.test.ts` (PRIV-T02 instrumentation over the real scanner: off = one
pair; on = the payment plus exactly the key-selected payments of the range; a range without a match gets the same cover;
resume overlap; spam; second provider; two payments; viewing-key wipe; the same block reads and saved position after
a failed or pending check of a payment and of the same cover, one replay only, no replay for a request-less claim);
`scanSpam.test.ts`, `Scan.privacy.test.tsx` and
`Settings.test.tsx` (unreadable settings, mid-scan change, wiring on/off). Mutation check: removing the view wiring or
restoring "cover only with a match" fails the new tests.
