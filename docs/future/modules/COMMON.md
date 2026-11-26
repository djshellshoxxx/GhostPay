# Shared contract for GhostPay future modules

**Status: owner-requested specifications, 2026-11-19.** These are proposed implementation contracts, not implemented or qualified functionality. All module specs inherit this document. Conflicting older proposals require explicit reconciliation.

Source commit: c977b5d6723f6822c3b5d86cd6b231712c53c395. Root tree: 2634456ffa35681e799f71b72bb907f946a77618. See the [catalog](README.md), [machine-readable map](modules.json), and [source map](SOURCES.md).

## 1. Responsibilities and dependency direction

F01–F18 own product workflows and presentation. P01–P19 own reusable privacy providers or research boundaries. T01/T02 own multi-transaction workflows. FEE01 owns pricing, consent and accounting. Products consume providers; they never fork provider cryptography, vault formats, transport policy or fee arithmetic.

Hard dependencies in modules.json mean the specified capability needs that provider contract. They do not claim that a provider is implemented or currently enabled. Optional integrations are capability-negotiated ports, never unconditional imports, startup prerequisites or hidden requests. The composition root injects providers; optional cross-references must not create import cycles. Providers never import consumer UI. Disabling an optional provider leaves unrelated local functionality usable.

Every spec identifies reusable source and its remaining future delta. A package's existence is not end-to-end qualification. Preserve current tests, formats, chain guards and documented deviations until a reviewed change supplies replacement evidence. Each public format or algorithm has one owner. Shared changes go through the provider lane. Contract fakes establish consumer behavior only; real integration still needs qualification.

## 2. Product and authorization boundaries

- Preserve a static, zero-install browser client and user-controlled keys: no mandatory publisher server, account, telemetry, RPC, indexer, relayer or gateway.
- P19 is an optional operator service. It cannot become necessary for client-only operation, independent recovery, direct spending or withdrawal.
- Spending, viewing, invoice-authentication, device-sync and service-authorization roles remain separate. Scan-only grants cannot spend. No guardian recovery.
- Independent stealth-key export remains [canonical spec 18 / requirement 3q](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md). Architecture 5k is its alias, not an additional future module. New workflows consume its recovery contract without deferring its beta priority.
- [Issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287) remains independently deliverable v1.1 scope. Broader future specs cannot postpone its four requirements.
- Preserve current router fees. New prices, recipients, schedules, enforcement contracts and paid releases require owner decisions. An unresolved paid configuration means unavailable, never a guessed recipient or implicit free authorization.
- Future capabilities default off and remain outside the lean Pages artifact until separately qualified. Existing enabled baseline protections retain their current defaults.

## 3. Proposed API vocabulary

These are design contracts, not existing exports. Adapt established equivalent interfaces rather than creating another framework. Shared type ownership belongs in the narrowest appropriate package after review.

~~~ts
type ModuleId = string; // decoder restricts values to modules.json
type DecimalUnits = string; // unsigned canonical decimal integer, no exponent
type Digest = string; // validated algorithm-tagged digest of canonical bytes
type RecordRef = string; // opaque local reference, never a secret/raw transaction
type ModuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly retryable: boolean };

interface AssetRefV1 {
  readonly schema: 'ghostpay.asset-ref/v1';
  readonly network: string; // family and chain/genesis identity
  readonly asset: string; // native marker or validated token identifier
  readonly decimals: number; // display metadata, not arithmetic input
}
interface OperationContext {
  readonly operationId: string;
  readonly sessionEpoch: number;
  readonly signal: AbortSignal;
  readonly deadlineMs: number; // injected clock, rechecked after suspension
}
interface CapabilityDescriptorV1 {
  readonly schema: 'ghostpay.capability/v1';
  readonly moduleId: ModuleId;
  readonly implementationVersion: string;
  readonly evidence: 'unavailable' | 'fixture-only' | 'testnet' | 'qualified';
  readonly chainsAndAssets: readonly AssetRefV1[];
  readonly requires: readonly ModuleId[];
  readonly optionalPorts: readonly ModuleId[];
  readonly limits: Readonly<Record<string, number>>;
  readonly reveals: readonly string[];
  readonly qualificationRef?: string;
}
declare const secretHandleBrand: unique symbol;
interface SecretHandle {
  readonly [secretHandleBrand]: true; // provider-issued in-memory capability
}
~~~

Per-module sketches inherit these rules even when abbreviated. Amounts use bigint internally and DecimalUnits in JSON, with explicit zero/minimum/maximum rules. Symbols are labels, never asset identity. Timestamps specify UTC and units; durations use distinct fields. Public summaries exclude private aliases, seeds, scalar keys, decrypted notes, private witnesses, raw signed transactions and persistent tracking identifiers.

Use existing scoped providers, SecretBox and session guards. SecretHandle is nonserializable and is not a database key that allows arbitrary secret retrieval. Consumers request narrow operations; raw key bytes cannot escape provider callbacks or enter component state. JavaScript cannot guarantee perfect zeroization or protect a user from a compromised browser/origin.

Every async completion checks epoch and abort signal before persistence, display, signing or external effects. Account, network, key, policy, provider, quote and destination changes invalidate relevant reviews and grants. Timers, workers, subscriptions and object URLs have disposal paths.

## 4. Untrusted formats and local data

Treat imported files, links, QR, provider/wallet messages and persistence as untrusted. Decode supported versions before use. Reject malformed encodings, duplicate keys, ambiguous integers, invalid chain identifiers, unknown algorithms and oversized content. Use approved authentication/encryption primitives and role/schema/identity/network/revision bindings. A checksum is not a signature; an embedded signer is not independently trusted; ciphertext is not payment evidence.

Proposed budgets for new envelopes: 1 MiB encoded input, 1,000 records per batch, nesting depth 8 and 4 KiB per free-text field. Modules may specify stricter or justified specialized limits. These are targets for benchmarking, not claims about current behavior. Existing lower bounds remain in force. Proof artifacts and archives require separately documented streamed budgets.

Use module/identity/network storage namespaces. Recoverability-changing writes are atomic or journaled. Restore validates a staged snapshot before reviewed commit. Older formats remain readable through explicit migration or fail non-destructively. Retention cannot automatically destroy sole-copy keys, pending intents, unspent notes, or recovery and unknown-settlement evidence.

A transaction hash, announcement, local row, gateway assertion or imported receipt is not final payment proof. Preserve unverified, pending, unknown, reorged, conflicted, reverted and verified outcomes. Provider failure never implies not paid or permission to resend.

## 5. Execution lifecycle

Prepare, review, authorize, submit and reconcile separately. Bind consent to the canonical operation digest, network, asset, amounts, destinations, call targets/data, maximum gas and fee lines. Recheck immediately before signing. A privacy toggle is not spend authorization.

Journal non-secret intent before possible effects. After crash, reload or ambiguous submission, reconcile before retry; timeout alone cannot justify another spend. Use compare-and-swap/leases for local concurrency plus chain nonce/nullifier evidence. Client locks alone cannot stop multi-device spending. Replacement transactions need separately bounded authorization.

Locking or closing the browser stops future unattended signing. Unsigned legs pause. Cancellation stops unsent work; signed/submitted/confirmed transactions retain actual state. Recovery must remain possible without any optional service.

## 6. Network policy and privacy claims

List every recipient, trigger, payload class, consent rule and failure behavior. Network access goes through injected approved providers. No ambient fetch, hidden SDK download, remote font, automatic price lookup, error upload or analytics. Separate app-owned requests from browser/extension traffic outside app control.

Private-required requests fail closed. Redirect, endpoint failover, public mempool fallback and protocol substitution require distinct consent. A page cannot establish SOCKS routing or attest Tor use. Onion-compatible packaging and execution through actual Tor are different evidence.

Leakage tables cover browser/origin, host, wallet, RPC/indexer, service operator, public-chain observer and recipient. Describe addresses, public amounts, timing, gas sources, contracts, fees, sizes and route correlation. Metadata minimization, fresh keys, splitting, delays and intermediary hops do not create confidential settlement. Maximum is an editable configuration whose actual properties need evidence, never an anonymity score.

No seed, spending/viewing secret or private witness goes to a remote prover. Protocol committees, trusted setup, bridges, access controls, asset custody by contracts and upgrade authorities must be disclosed. User control of keys is distinct from contract custody of assets.

## 7. Shared fee ownership

FEE01 owns composition, overlap/bundle rules, rounding, caps and consent. P17 consumes accepted quotes for private settlement. P19 can gate its own optional service, not copied clients or public contracts.

Separate protocol fees, feature add-ons, independent provider fees, gas and conversion costs. Never sum different assets without an explicit rate, timestamp and rounding policy. Bind charges to a versioned approved schedule and recipient commitment. Keep private details out of URLs/logs. Free local controls remain available without unrelated purchases.

No new price or recipient is selected by these specs. Paid modules stay unavailable until pricing/enforcement approval. Itemize partial execution, reorg, refunds and already-spent gas. Client arithmetic is not on-chain enforcement; verify the approved enforcement boundary.

## 8. Acceptance and actual command availability

Every spec supplies unique acceptance IDs: success, malformed input, wrong chain/identity, stale completion, lock/cancel/reload, unavailable providers, unknown settlement, leakage and recovery. Use synthetic fixtures and local defensive tests.

Qualification covers unit/property tests, format vectors, consumer contract tests, browser journeys, network traces, recovery drills and exact-source integration. Research additionally needs independent vectors, protocol/circuit review and reproducible artifacts. Fakes and compilation cannot replace actual wallet/protocol acceptance.

These commands exist at the source pin. They are future implementation checks, not runtime tests executed by this documentation task:

~~~bash
npm ci --ignore-scripts
npm run build:libs
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run test -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
npm run ci:scan-secrets
npm run ci:check-actions
npm run ci:check-tx-origin
~~~

Run affected provider checks first, expanding for real integration risks. The current browser project configuration establishes Chromium tests and mobile viewport emulation. Firefox, WebKit, actual Tor and physical-device qualification remain separate planned acceptance.

Require keyboard completion, accessible names, focus restoration, safe status announcements, 200% zoom and narrow layouts. Reuse localization catalogs. Typed errors exclude raw provider messages and private values.

## 9. Integration, migration and handoff

1. Refresh source, branch heads, active claims and APIs before coding; compare the proposed delta with current work.
2. Review provider contracts, append branch ownership and implement one testable slice. Shared changes stay with the provider owner.
3. Keep future flags off; verify no new routes, SDKs or egress enter the lean artifact.
4. Qualify real consumer/provider integration and record exact source/artifact/environment. Pending external evidence stays pending.
5. Rehearse migration after verified backup. Disabling creation preserves inspection, export, reconciliation and recovery of existing records/funds.
6. Resolve owner decisions and release gates before activation. Publishing these specs does not authorize automation to implement or deploy them.

Handoffs record base/head, ownership, changed contracts, actual checks, skips, risks, migrations and the next bounded task. This branch set changes documentation only; main, deployment settings, release gates and active implementation lanes remain separate.
