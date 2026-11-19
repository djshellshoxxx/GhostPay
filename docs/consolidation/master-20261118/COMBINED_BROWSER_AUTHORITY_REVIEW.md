# Independent combined browser authority review

Product candidate: `521194c0` (full SHA and 24 reviewed snapshots in `combined-browser-authority-blobs.json`).
`47a7e29a` subsequently adds evidence documents without changing these product sources. The review examines the
actual combination of #243 signer authority, #248 durable scanning, #249 privacy hardening, idle suspension,
#251 network authorization and the selected #256 cached-checkpoint revocation correction. It does not infer
integration safety from the prior isolated branch reviews.

## Blocking finding and repair boundary

One blocking composition defect was found: the active common network authority defaulted missing saved v1
selection fields even though the retained browser settings parser rejects them. The production service factory
uses the new authority directly, so preserving the old strict selected-RPC helper did not preserve the guard at
the active boundary. Truncated saved preferences could authorize fresh dispatch in EVM and non-EVM paths.

This was reproduced before the runtime change: 24 malformed-record cases each dispatched once when refusal and
zero dispatch were expected; eight default/deletion controls passed. The isolated repair `55fc93a2` reuses
`readNetworkSelection` on the captured raw snapshot. Its full authorization suite passes 122/122. The reviewer
authored that correction, so the integration coordinator must independently accept it; the uncorrected candidate
is not approved. The tracked `NETWORK_SELECTION_REPAIR_2026-11-19.md`, JSON receipt and raw RED/GREEN logs contain
the commands, source blobs, results and hashes.

No further blocking source finding was identified in the integration areas examined below. This is an incremental
source review, not complete browser/runtime qualification or a blanket audit of all feature branches. The final
BTC reconciliation and non-EVM caller cross-review are a separate lane, and later product edits need comparison.

## Network/service composition and privacy

Production services reject raw generic fetch and require an opaque grant issued by the current authority for EVM
RPC construction. The WeakMap ownership check binds chain, category and exact endpoint; copying another grant's
shape is insufficient. Dispatch rereads the saved policy snapshot, checks the current session/revision/signal and
action-specific method restrictions, and forces credentials/referrer/cache/redirect protections. Explicit scope
changes revoke active streams, while raw storage rereads protect dispatch before a delayed storage event arrives.

The common transport bounds both headers-to-body lifetime and body bytes, sanitizes foreign errors and abort
reasons, refuses redirects/changed final URLs, and discards late responses. Relayer requests retain the one narrow
legacy-padding retry and bounded response handling. RNG failure is a refusal rather than an unannounced padding
downgrade. Public error-code extraction is a finite protocol allowlist; unresolved submission outcomes do not
become proof that nothing was broadcast.

Settings retains the strict status reader for invalid/unacknowledged selections and compare-and-swap checks
against the stored form revision. Pending connectivity checks have per-chain controllers. Endpoint-retention
choices are committed only after the whole form validates. AppShell rechecks the persisted revision before
saving, clears cached clients and session-only endpoints on cross-tab settings changes, and issues action grants
instead of treating endpoint configuration alone as authority. The strict-parser repair above completes the
missing common-boundary enforcement.

## Signer and payment authority

The combined Pay source preserves the #243 verification scope, immediate hiding of stale parsed/trust results,
actual storage-snapshot check for the selected signer, session guard and final wallet guard. Network revision and
operation signals are composed with those checks rather than replacing them. Revocation stops scheduled work and
requires the explicit review action before renewing preflight authority. Preparation and send still bind the
current invoice, context, built transaction, wallet, settings and session; post-broadcast state is retained.

The latest signer tail changes the status notice to avoid a duplicate alert and adds the paired accessibility/
idle regressions. It does not remove cryptographic verification. The retained #218 pinned-signer regressions stay
present with the specific missing-signature error classification. The earlier detailed independent receipt is
`pr243-combined-independent-review.md`; its pre-251 result is not treated as approval of this later combination.

The separately recovered #211 asset group is not part of this candidate. Root review of that authored group found
and then behaviorally confirmed the PolicyPay passive-effect records race. Its final branch `6762b6f4` uses a
layout effect to publish committed authority before pending wallet continuations; the same real send/wallet
regression changes from one failure/one pass to two passes. That correction and the asset group require the
coordinator's independent acceptance, including composition with PolicyPay's new action-authorized RPC call.

## Idle custody and recovery

The combined session implementation distinguishes possession of a retained sole key copy from permission to use
it. Suspension increments the revision before asynchronous custody checks, wipes tracked asynchronous copies,
and makes ordinary secret, signature and scan access fail. The narrow encrypted-backup guard remains available
for recovery; Spec 18 raw/payment-key authorization still begins with the ordinary active-session guard and does
not inherit that exception.

AppShell's lease checks both wall and monotonic time, detects rollback/sleep, observes sensitive boundaries
synchronously, and runs input checks in capture phase. Timer and custody-answer revisions prevent an old lock
from acting on newly installed keys. New UI activity after suspension renews cleanup timing without restoring
session authority. Atomic session replacement, partial-box cleanup and the live unload custody check remain.

The #256 cached checkpoint change also checks active session authority before returning a cached v4 slot and
rechecks the holder after borrowing the viewing key. It wipes the copy on every exit. The v4 helper remains a
compatibility surface; the durable v5 journal keeps its own scoped encrypted storage. There is no HKDF or stealth
primitive change in that cache correction.

## Durable scans and reconciliation

Scan composes the current seller/session/configuration guards with network revision, selected endpoint grants,
abort signals and the pre-dispatch scan guard. Private RPC and indexer construction use the selected authorized
path; a failed required private path does not fall back. The #249 arithmetic window budget remains before window
allocation, with bounded split work and cancellation checks around awaited work.

The durable v5 vault binds chain, seller identity, router/announcer, finality, scan mode and configuration into a
secret-derived slot and authenticated ciphertext. Random tombstones plus compare-and-swap exclude stale writers
and avoid deletion/recreation ABA behavior. Key-vault deletion retains journal invalidation, and tied-vault checks
surround storage access. Scope/session guards are checked before and after cryptographic/storage awaits.

Stored observations are reloaded as claimed evidence, not current verified receipts. Replay is bounded, verifies
the old blocks before advancing durable progress, and keeps a separate budget so old discoveries cannot consume
every new-range allowance. Missing or unprovable historical data fails without replacing the saved journal.
Completed safe cursors and all discoveries are saved atomically; finality anchors, disagreement handling and
partial router-only coverage remain explicit. Revocation stops worker and network work and prevents stale commits.

## Qualification and preserved gates

The reviewed candidate does not change the compared workflow files, root dependency manifest/lockfile, web
Vitest configuration or core-crypto sources from `af9355ae`. Separate scanner/CSP and historical feature reviews
remain necessary for their respective deltas. The existing strict Mythril findings are not cleared by this review
or by path-filtered absence. No security threshold or scanner exception was introduced by the two authored fixes.

No full combined build, browser run, typecheck/lint or coverage run was executed by this reviewer. The exact
combined candidate still needs hosted qualification after the two independently reviewed repairs are integrated.
Do not sum the targeted RED/GREEN cases or repeated OS matrix runs as distinct product tests.

Sources: pinned local Git objects, `combined-browser-authority-blobs.json`, the named source/validation receipts,
[PR #243](https://github.com/djshellshoxxx/GhostPay/pull/243), [PR #248](https://github.com/djshellshoxxx/GhostPay/pull/248),
[PR #249](https://github.com/djshellshoxxx/GhostPay/pull/249), and [PR #251](https://github.com/djshellshoxxx/GhostPay/pull/251).
