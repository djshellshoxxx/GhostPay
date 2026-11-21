# Privacy consolidation review — 2026-11-18

## Source boundary and disposition

Starting `main`: `5467c158069c5bab264b6a653ac56e89e13f3e13`.
This is an independent source review of the fetched heads below, with runtime
reproduction only for the two findings explicitly listed under validation.
Historical test counts in PR descriptions and handoffs were not adopted as new
execution evidence. Re-fetch every head and required CI before integration.

| PR and reviewed head | Pages contribution | Disposition and reason |
|---|---|---|
| #211 `a92658b1ef6b95ff0145b2e1933d0047d51289d5` | Private scan-checkpoint slot naming; focus acceptance. Most other changes are policy scheme, BTC/Solana/TRON views, their libraries and CLI. | **PARTIALLY EXTRACT / REPAIR THEN MERGE.** The checkpoint change is a useful lean Pages contribution. Its full-branch handoff requires post-#209 reconciliation, and #222 implements a competing format. Preserve non-Pages changes without enabling their routes. |
| #218 `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e` | Optional fail-closed pinned-signer parsing in shared invoice schema; fixed user-facing error classification. Most changes repair CLI and relayer behavior. | **PARTIALLY EXTRACT / PRESERVE.** Shared invoice validation can be separately qualified; the optional flag does not automatically authenticate existing web callers. Do not make a hosted relayer part of the beta. Sweep, quote and policy findings mentioned in the title are routed to other PRs in its handoff, not all implemented here. |
| #219 `9617e8572f9bc414410bd937b0e7718d0c5bd55c` | BTC local spent-output tracking; outside the active lean EVM route graph. | **PRESERVE; QUALIFY SEPARATELY.** Prefer its explicit provider-query opt-in over #222's automatic fallback when consolidating the BTC implementation. No missing lean Pages prerequisite is satisfied merely by merging this PR. |
| #222 `2bc2098298d90928eb1acafad969f28316bb05fc` | Explicit sweep balance queries, invoice encryption default, receipt minimization, RPC secret hints/session storage, network selection, bulk scan evidence and scan-range padding. Also changes non-Pages chains and hosted relayer. | **REPAIR THEN PARTIALLY EXTRACT.** Confirmed cached-client own-node bypass and plaintext sweep-linkage persistence; incompatible checkpoint/BTC changes; stale threat-model claims. The whole branch is not qualified by the fixes in this review. |

The scope boundary is concrete: `AppLean.tsx` loads `AppShell` with `CORE_ORDER`.
The core routes are Home, Seller keys, Create invoice, Pay, Scan, Sweep, Registry,
Settings and About. Bitcoin, Solana, TRON, policy accounts, archive and embedding
are absent from that route graph. Shared libraries may still be used by both
profiles; a fix must preserve existing consumers without expanding beta scope.

## Required overlap resolutions

### Checkpoint slots: choose one v3 format

#211 adds `apps/web/src/lib/scanCursorSlot.ts` and changes `scanClient.ts` to derive
slot names using HKDF-SHA256 with the viewing key and domain
`GhostPay/scan-checkpoint/v3/slot|chainId|keyId`. Its default key lender checks that
the requested key ID belongs to the loaded session, wipes the borrowed copy, and
invalidates cached slot names when that session changes. It sweeps legacy v1/v2
slots and intentionally rescans instead of trusting their public-key-derived names.

#222 instead derives an HMAC-SHA256 slot under
`GhostPay/scan-checkpoint-slot/v3|chainId|keyId`, migrates legacy v2 data lazily and
uses whichever viewing key is currently loaded without checking the requested key
ID. Both use the prefix `ghostpay.scan.checkpoint.v3.`, but their derived names
are incompatible. A prefix match is not format equivalence.

Recommendation: use #211's session-bound implementation and its regression tests,
while retaining #222's separately reviewed bulk-evidence scan changes. Document
the selected legacy-data policy. If either v3 variant has been used outside these
unmerged branches, explicitly address orphaned slot metadata and rescan behavior.
Do not claim that the two migration implementations preserve each other's state.

### Bitcoin spends: retain consent, worker plumbing and header binding

#219 introduces `providerSpentCheck`, defaults it off, carries the setting through
the scan worker protocol and reports the source of spent-status evidence. It
propagates local `getSpends` through cross-checked and header-anchored sources and
records spends of persisted matches. Its disclosure acknowledges that mempool
spends and blocks predating spend tracking are not covered.

#222 independently adds `watchOutput`/`spendStatus` to its Esplora source, then
automatically calls `isUnspent` when local evidence is unknown. It also calls
`isUnspent` at signing. Replacing #219's scanner/view files with those versions
would restore provider outpoint disclosure without #219's explicit opt-in control.

Recommendation: preserve #219's consent model and associated worker/header tests.
Retain applicable #222 exposure notices, but do not restore automatic fallback.
BTC remains outside this lean release's qualification claim.

### Other shared paths

- #213 and #222 both change `Scan.tsx`, locale catalogs and `securityKeys.ts`.
  Keep export authorization/lifetime guards and privacy disclosures together;
  rerun the critical-message classification after catalog reconciliation.
- #220 and #222 both change `chain-adapters/src/rpc.ts`. Preserve the strongest
  reviewed credential, referrer, caching, response-bound and failure handling.
  The own-node repair here guards the existing transport rather than replacing it.
- #218 and #222 overlap relayer config, logging, server and browser client files.
  Treat those as a distinct preserved security lane; no mandatory service or
  deployment follows from a successful static Pages build.
- #211's handoff requires documentation/locale reconciliation after #209 and
  rechecking its CLI changes against #218. These requirements are not satisfied by
  resolving a textual conflict alone.

## Reproduced findings and current repairs

### GP-PAGES-04-CLOCK: idle lock under clock rollback

At #209 `b5e2ea3e5030b56c79063eb1f91c8a634ee5d740`, AppShell checked only wall
time. Suspended timers plus rollback, or monotonic expiry with a non-expired wall
clock, could bypass the intended idle deadline on resume/first activity.

- RED: `2904aabd10ca78ca780e2060f41caf6cd4b60a34`, **9 failed / 1 passed**.
- Product repair: `20266feedc24aedf3681d931bd3cc313a459d498`.
- Final evidence: `4cf312c293a921e76099525e73e492d813f684f5`.
- GREEN: **52 tests across six shell suites**, scoped ESLint and whole-web tsc.
- The patch uses both clocks, fails closed on rollback and preserves the
  deliberate rule against destroying the only unbacked-up key copy.

See `IDLE_CLOCK_REVIEW_20261118.md` on the idle repair branch. It remains a
separate, reviewable fix suitable for extraction onto main.

### GP-TM14-CACHED-RPC: own-node mode did not constrain cached clients

#222 validates the mode only at client construction. AppShell caches clients by
chain and URL; changing the stored network profile does not invalidate them.
Already-created clients and reconnect retries therefore continued to contact the
third-party provider after acknowledged own-node selection.

- RED: `3877ce481854e9c8dd09742dcd3dfeb3e5b0ed23`, **5 failed / 1 passed**.
- Repair: `f58009f2609db6c0582a44dd8079485c6221480f`.
- GREEN: **13 focused tests**, scoped ESLint and diff check.
- Whole-web tsc remains unqualified: its latest attempt was terminated with 137.
- Every dispatch now checks the effective selection and refuses with a fixed,
  non-retryable error before transport activity. Already-sent requests cannot be recalled.

See `OWN_NODE_GUARD_REVIEW_20261118.md`. This is a repair to #222, not a standalone
main-ready network feature: its base introduces the network-selection APIs.

### GP-TM7-PLAINTEXT-LINKAGE: new persistent address linkage

Source-confirmed in #222: `recordSweepDestination` serializes `DestLedger.toJSON()`
to localStorage after every submitted sweep. Rows contain chain, destination and
source addresses. The underlying `packages/hygiene/src/ledger.ts` explicitly calls
this private linkage and requires encrypted-keystore storage. There is no opt-in
or encryption at the new call sites. The security review agent owns the repair;
this branch does not change the ledger or claim runtime proof of that repair.

## Documentation and qualification limits

The #222 title does not prove TM1–TM15 complete. Its threat-model document still
describes destination warnings as absent and network/scan-source features as
library-only despite the implementation changes. Invoice encryption by default
does not implement per-invoice signer keys. A profile selector does not qualify
Tor or OHTTP. Bulk evidence with a cap does not guarantee unlinkability under all
traffic patterns. Omitting the stealth-address receipt field does not remove the
transaction hash's public-chain linkage.

No live RPC/provider behavior, Tor Browser, OS sleep, transaction broadcast,
whole-branch security qualification or deployment was performed by this reviewer.
No PR was mutated or merged. CI qualification, combined source review and owner
release gates remain distinct from the focused regression results above.
