# GhostPay scan RPC call graph and disclosure measurements

Status: **research evidence, level T (deterministic mock) plus S (source inspection). Not a privacy certification.**
Source base: `main` at `60824005b89611aea2b16d3355378eebf072eedb`; branch `claude/priv-t02-rpc-disclosure`.
Reproduce: `cd apps/web && npx vitest run src/lib/scanDisclosure.test.ts src/test/rpcDisclosure.test.ts --coverage=false`.
Regenerate the table: `GHOSTPAY_DISCLOSURE_REPORT=/tmp/report.md npx vitest run src/lib/scanDisclosure.test.ts --coverage=false`.

Nothing here was measured against a live provider, a real network, Tor, a proxy or a browser. The synthetic chain, the
synthetic seller and every address and hash in the fixtures are fake. The instrumentation stores parameter classes,
counts and booleans only (`apps/web/src/test/rpcDisclosure.ts`); a test fails if a raw address, hash, token or any 20-byte
hex literal reaches a record or this report.

## What the instrumentation records

One record per observable request: scenario, sequence, relative time, layer, endpoint role, method, retry attempt,
parameter classes (`public-chain-metadata`, `public-block-range`, `contract-specific`, `address-specific`,
`transaction-specific`, `recipient-specific`, `payment-specific`, `unknown`), block span, and booleans for address,
transaction hash, event topic, token identifier, recipient filter, relation to a matched payment, "follows a previous
response", and "position readable from the request". A request can have several classes. Anything the classifier does not
recognise (method, parameter count, object keys, topic shape) is `unknown`; every scenario asserts zero unknown.

It wraps three existing boundaries and changes no request: chain-adapters `RpcTransport` (sees retries and chain-id
re-checks), the `RpcClient` surface (for mock clients) and scan-source `HttpTransport` (indexer). It is test code only: it adds
no production code path and no telemetry. "Related to a matched payment" uses the scenario's ground truth, which an observer does not have.

## Source-pinned operation inventory (13 lifecycle stages)

| # | Stage | RPC operations and recipient | Source | Measured |
|---|---|---|---|---|
| 1 | Scanner setup | `eth_chainId` on the scan endpoint; second RPC opened by the app | `scanPrivacy.ts:634` `openScanClients`, `Scan.tsx:211-223` | yes |
| 2 | Chain identity | `eth_chainId` at connect, after any transport failure, and every 60 s by default | `rpc.ts:206` `createClient`, `rpc.ts:271` `checkChain` | yes (J: one extra after a retry) |
| 3 | Manifest validation | `eth_getCode` of router, relayer (and policy factory), `eth_call` reads, optionally on both providers | `manifest.ts:107`, `verify.ts:170-215`, `rpc.ts:424` `requestWithFallbackCheck` | **no (S only)** |
| 4 | Block-range scanning | `eth_blockNumber`, grid-aligned `eth_getLogs` windows in CSPRNG order | `scanPrivacy.ts:356` `createWindowedScanClient`, `logs.ts` `fetchAnnouncements` | yes |
| 5 | Announcement retrieval | announcer `eth_getLogs`; router lane (one block, caller filter) only for oversized blocks | `logs.ts`, `scanPrivacy.ts` `assertScanFilter` | yes (router lane not exercised) |
| 6 | View-tag matching | none: local in the worker | `scannerCore.ts` (a test forbids network APIs there) | n/a |
| 7 | Balance checking | `eth_getBalance` / `eth_call balanceOf(stealth)` only if `observeBalance` is set; the app never sets it. Sweep reads one balance on user action | `payments.ts:113,202,210`; `sweep.ts:87`, `Sweep.tsx:104` | scan path: absent (K); Sweep: **no (S only)** |
| 8 | Receipt retrieval | `eth_getTransactionReceipt` and `eth_getTransactionByHash` of the matched announcement's transaction | `payments.ts:290-291` `directRouterEvidence` | yes (C, D, I) |
| 9 | Token verification | none extra: Transfer log is read from the receipt; token list is local | `payments.ts` `transferMatches`, `findToken` | yes (no token log query) |
| 10 | Payment confirmation | `eth_blockNumber`, `eth_getBlockByNumber` at the announcement block, twice | `payments.ts` `verifyClaimedPaymentOnClient` | yes |
| 11 | Reorg detection | exact `eth_getBlockByNumber` at the saved anchor, second-provider comparison and rollback confirmation | `logs.ts` anchor check, `scanClient.ts:300-330` | yes (G) |
| 12 | Checkpoint recovery | resume reads the anchor block, then continues from `nextBlock` | `scanClient.ts` `localCheckpointStore`, `scanCursorSlot.ts` | yes (H) |
| 13 | Seller reconciliation | no RPC in `reconciliation*.ts` on main. Late-payment reconciliation is proposed in open PR #635, not measured | `reconciliationLedger.ts`, `reconciliationMatch.ts` | n/a |

Other RPC users outside the scan lifecycle, not measured: `paymentKeyExport.ts:92` issues `eth_getCode` for user
addresses (address-specific); `pay.ts`, `txGuard.ts`, `wallet.ts`, `attemptStatus.ts` are payer-side.

## Measured traffic (mock chain, sanitized)

Columns: calls; address-, transaction- and recipient-specific; calls related to a matched payment; retries; unknown;
calls whose request reveals scan position (conservative: any exact block read away from the head, and any log
window bound that is off the grid, other than an upper bound at the head); failures; calls per endpoint role.

| Scenario | Calls | Addr | Tx | Recip | Match-dep | Retry | Unknown | Position | Failed | Roles |
|---|---|---|---|---|---|---|---|---|---|---|
| A empty scan | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | primary 12 |
| B public announcements only | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | primary 14 |
| N non-matching twin of C | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | primary 14 |
| C one matching payment | 19 | 0 | 2 | 0 | 2 | 0 | 0 | 9 | 0 | primary 19 |
| N3 non-matching twin of D | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 9 | 0 | primary 16 |
| D three matching payments | 31 | 0 | 6 | 0 | 6 | 0 | 0 | 15 | 0 | primary 31 |
| E1 wrong view tag | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | primary 14 |
| E2 unverifiable router claim | 18 | 0 | 2 | 0 | 0 | 0 | 0 | 8 | 0 | primary 18 |
| N2 non-matching twin of E2 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | primary 14 |
| H0 first run (saves checkpoint) | 28 | 0 | 2 | 0 | 2 | 0 | 0 | 15 | 0 | primary 28 |
| H resume from checkpoint | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | primary 8 |
| G fork at checkpoint anchor | 29 | 0 | 2 | 0 | 2 | 0 | 0 | 16 | 0 | primary 29 |
| I two providers agree | 35 | 0 | 4 | 0 | 4 | 0 | 0 | 15 | 0 | primary 20, secondary 15 |
| I two providers disagree | 30 | 0 | 4 | 0 | 4 | 0 | 0 | 10 | 0 | primary 18, secondary 12 |
| K direct (non-router) matching announcement | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | primary 14 |
| J 12k blocks with one retry | 51 | 0 | 2 | 0 | 2 | 1 | 0 | 29 | 1 | primary 51 |
| J0 12k blocks, no retry | 49 | 0 | 2 | 0 | 2 | 0 | 0 | 29 | 0 | primary 49 |

Call counts depend on the fixture and on current scanner internals; the tests pin relations (for example "C minus its
non-matching twin is exactly two transaction-specific requests"), not absolute totals.

## Directly observed (what an endpoint operator receives, in this mock)

1. **No address, recipient filter or token contract is sent during a scan.** Every `eth_getLogs` names only the public
   announcer and the announcement event topic, spans at most one grid window (1000) and is grid-aligned or clamped to the head. Zero
   address-specific and zero recipient-specific requests in all scenarios.
2. **A matched router payment is visible.** It adds exactly one `eth_getTransactionReceipt` and one
   `eth_getTransactionByHash` for the payment's transaction hash, each preceded by a fresh head read. A non-matching twin
   with the same public footprint sends neither (C versus N; D versus N3).
3. **The number of matches is visible.** Three matched payments produce three pairs, issued one at a time (D).
4. **A rejected candidate does not always stay quiet.** A wrong view tag adds nothing (E1 equals the baseline shape). A
   tag-valid router claim whose transaction the provider cannot find still triggers the same two lookups as a real
   payment, so the request shape does not distinguish a payment from a failed claim (E2).
5. **The second provider receives the same payment-specific lookups** as the first, before the two are reconciled (I).
   A disagreeing second provider is detected and contacts no third endpoint.
6. **Fixed windows do not hide scan position.** Every `eth_getLogs` is aligned, but exact `eth_getBlockByNumber` reads
   (checkpoint anchor, page ends, announcement blocks, confirmation reads) are not, in every scenario. On resume the
   first request after the chain-id check is an exact read of the saved anchor block (H).
7. **Reorg recovery repeats payment lookups.** After a fork at the anchor the scanner re-reads the range and asks about the
   same payment again (G). A plain resume does not (H).
8. **Retries repeat the same shape and add one chain-identity re-check**, and add no address, transaction or recipient
   disclosure beyond the same scan without a retry (J versus J0). The 12k-block scan stays bounded.
9. **Direct (non-router) matches send no transaction, address or balance request.** They remain `claimed` (K). The
   stealth-address balance read in `payments.ts` is dead code in the app because `observeBalance` is never set.

## Inference, not observation

These follow from the observations above if an operator logs requests and correlates them. None was tested against a live
provider.

- An operator that logs full requests can learn that a payment to some GhostPay seller was matched, how many, and the
  transaction hashes, from items 2 to 3. Whether it can link those to a person depends on the IP address, which is
  outside this test.
- An operator can estimate where a resumed scan was last stopped from item 6, and that the user is resuming.
- The failure signature (retries, repeated `eth_chainId`) is visible, so an error during a scan is observable (item 8).
- The block-read pattern also differs with the public content of the range (B versus A), which is public data.

Do not read any of the above as anonymity. Fixed-window scanning bounds what the `eth_getLogs` ranges say; it does not
make match-time or position-bearing requests uniform.

## Phase 8: privacy improvement candidates

**Implemented after this analysis (owner-approved, opt-in, off by default): cover lookups for matched router payments.**
With `matchCover` (Settings: "Hide which payments matched among other payments' lookups"), a page with a matched router
payment also verifies the other router payments of the same 1000-block window that a keyed rule selects (about half,
at most 32 per page), through the same `verifyClaimedPayment` path, in chain order, on both providers; their results
are discarded and the real verification is unchanged. Selection is per announcement (an HMAC, keyed from the viewing
key, of its transaction hash and ephemeral key against a fixed share), so it does not depend on page boundaries, a
resume or a reorg: two scans that overlap look up the same cover in the overlap. Cover and covered payments must pass
the checks verification applies before its first request (router caller, positive amount, supported token,
well-formed hashes), so no cover lookup is silent. Measured in `src/lib/scanDisclosure.cover.test.ts`. Remaining
exposure: that a page had a match and roughly how many; the single-payment re-check from the result list; the
checkpoint replay after a failed verification (item 6 above).

The candidates below remain open.

No change was made. The candidates below each touch `scanClient.ts` or `payments.ts`, which have open PRs from other
workers (#625, #635, #653), and each needs a baseline-versus-change run of these same scenarios before it ships.

| Candidate | Baseline (measured) | Risk |
|---|---|---|
| Round exact block reads (anchor, page end, confirmation) to the window grid where hash comparison still holds | 2 to 29 position-revealing requests per scan (conservative count) | Anchor read must stay exact for reorg detection; do not weaken |
| Do not send payment lookups to the second provider until the page agrees | secondary receives the same pair, before its comparison log reads (I, asserted by test) | Weakens independent verification if reordered wrongly |
| Hold verification of tag-valid claims until after the page is final | lookups follow each match immediately (D) | Delays payment confirmation display |

Payment verification must not be traded for fewer requests.

## Not covered

Manifest validation traffic (stage 3), Sweep balance reads, key-export `eth_getCode`, the router lane for oversized
blocks, the indexer HTTP path inside a full scan, PIR, Bitcoin spentness, relayer traffic, timing on a real network, and
any live or proxied measurement (evidence levels L and E).
