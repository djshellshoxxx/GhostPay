# F04 implementation milestone 1

This branch implements the first specification slice: an isolated, local
evidence-to-projection adapter and bounded selectors. It adds no route, feature
activation, network client, wallet access, storage backend or export UI. The
module is under `apps/web/src/features/future/merchant-dashboard/` and is not
imported by a production application entry point.

## Contract and trust boundary

`decodeDashboardSnapshot` accepts the versioned `ghostpay.dashboard-input/1`
object, with profile/revision references, invoices and observations. It makes
immutable copies and rejects unknown fields, unsafe numeric values, noncanonical
amounts, duplicate invoice references and oversized collections. This first
adapter accepts canonical `eip155:<positive safe integer>` networks and either
`native` or `erc20:0x<40 lowercase hex digits>` assets. Transaction hashes are
canonical lowercase 32-byte hex. Multi-chain adapters are later work.

Individual monetary values are canonical unsigned decimal strings bounded by
uint256. Invoice expected amounts are positive. Totals use `bigint` and can
exceed one transaction's uint256 range without losing precision. All amounts
remain atomic units; this module performs no fiat conversion or decimal display
rounding.

Imported records cannot include a finality/confirmation status. Without a
separately injected `DashboardEvidenceProvider`, observations remain unverified.
The provider is a trusted in-memory adapter over previously checked evidence;
this module does **not** cryptographically verify a chain, signed invoice or
receipt. A production provider still requires P03 integration and independent
qualification.

The provider receives a frozen canonical event claim and its invoice, never the
first arriving local `evidenceRef`. Canonical event identity is chain,
transaction hash and log/output position. Repeated references cannot pick an
older finality verdict: the provider must use the current canonical event state.
Before a pending/final assessment contributes, the adapter checks its exact
invoice reference, chain, asset, transaction hash, position, atomic amount,
inclusion timestamp, expected invoice amount and expiry, plus a bounded local
proof reference. The provider must derive those bindings from actual evidence,
not echo untrusted input. It performs no I/O through this interface.

Conflicting claims for the same canonical event are excluded, with all affected
invoice rows marked conflicted. Equal duplicate claims count once, while their
local references remain available for inspection. A reference reused for a
different canonical event rejects the snapshot. Unlinked observations are never
matched by amount. Unknown invoice, wrong asset/chain, missing amount and failed
assessment remain explicit issues.

Final contributions received before the signed expiry determine partial, final
and overpaid states. A final contribution at or after expiry is recorded
separately as late; it cannot silently satisfy the on-time total. Pending,
unverified, unknown, reverted and reorged evidence never enters the final total.
Rebuilding after a canonical reorg removes the former contribution and retains
its evidence references. Counts remain separate so a row's overall state does
not erase its mixed evidence history.

The output deliberately separates `finalAtomic`, `pendingAtomic` and
`lateFinalAtomic` instead of presenting the specification sketch's ambiguous
single `observedAtomic` total. Totals are partitioned by both chain and asset.
`recordedFeesAtomic` is `null` because this slice has no fee evidence.
`coverage` is `not-evaluated`: checking selected events establishes no claim
that the merchant's complete payment history has been scanned.

## Lifecycle and bounds

`buildDashboardProjection` captures the expected operation identity and checks
the abort signal, session epoch, profile, revision, operation and injected
deadline before releasing results, after provider work and around host yields.
The default yield occurs every 256 records. A caller can inject a scheduler for
deterministic tests. Provider state and the canonical journal must share the
revision checked by the context.

`selectDashboardRows` performs local case-insensitive substring search over alias
and invoice reference, with optional state/chain/asset filters. It retains only
the requested page and checks the same context before releasing rows. Limits
are 10,000 invoices, 50,000 observations, 100 page rows and 256 search characters;
aliases are bounded to 160 characters. Results are immutable and stable in
invoice-reference order.

There is no global decrypted index to clear in this slice. A future UI must drop
already returned projections on lock and must not display data from revoked
contexts. JavaScript cannot revoke an object already handed to a caller. The
checks here prevent a pending rebuild or later selector call from publishing
data under an obsolete context; they are not a full UI/storage lifecycle.

## Reuse decision

The existing `@ghostpay/merchant-ledger` reconciler operates in fiat minor units
and can automatically match observations by amount. Its exports and existing
browser reconciliation summaries intentionally do not establish chain finality.
Calling that reconciler with token atomic strings would misstate units and
invoice binding. This slice therefore adds a narrow atomic projection in the
owned feature directory. It leaves the existing fiat ledger, accounting export
sanitizers and provider cryptography unchanged. No dependency is added.

Reorg rationale follows Ethereum's primary documentation:

- [JSON-RPC log objects and removed logs](https://ethereum.org/developers/docs/apis/json-rpc/).
- [WebSocket log notifications across reorganizations](https://ethereum.org/developers/tutorials/using-websockets/).

These sources justify demotion and canonical event identity. They are not
evidence that this isolated module has run against a live provider.

## Remaining implementation

P03 evidence-provider composition and scan coverage, P05 encrypted transactional
journal/index integration, real cross-tab refresh, UI/localization/accessibility,
column-level export consent and accounting formats remain separate slices.
Provider fixtures test consumer behavior only. Actual browser, physical-device,
wallet, network, migration and recovery acceptance are not claimed.
