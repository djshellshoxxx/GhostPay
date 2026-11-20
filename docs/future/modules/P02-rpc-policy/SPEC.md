# P02 — User-selected RPC policy and consent enforcement

> **Specification only.** Documentation and branch creation authorized on 2026-11-19. Implementation, merge, activation, deployment and release are outside this task. Default disabled. No executed-test or qualification claim.

| Field | Value |
|---|---|
| Module | `P02` / `rpc-policy` |
| Branch | `future/p02-rpc-policy` |
| Baseline commit | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| Source tree | `2634456ffa35681e799f71b72bb907f946a77618` |
| Hard dependencies | None |
| Optional integrations | [P01](https://github.com/djshellshoxxx/GhostPay/blob/future/p01-tor-onion-hosting/docs/future/modules/P01-tor-onion-hosting/SPEC.md) |
| Shared contracts | [COMMON.md](../COMMON.md); [inventory](../README.md) |

All API sketches are proposed, not current exports. Common types are `OperationContext` (operationId/sessionEpoch/signal/deadlineMs), `ModuleResult<T>`, `CapabilityDescriptorV1`, and opaque nonserializable `SecretHandle`. Use bigint internally and bounded decimal strings in JSON.

## 1. Objective and provenance

Give users explicit control over app-owned RPC destinations, purposes and fallback behavior. Each request must be permitted by the current provider policy before network bytes leave the browser. An exposure dashboard describes endpoint observations without generating investigative requests of its own.

Sources: [issue #283 Track A](https://github.com/djshellshoxxx/GhostPay/issues/283), [issue #284 P02](https://github.com/djshellshoxxx/GhostPay/issues/284), and [architecture 5d](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/5d.md). P01 supplies optional hosting capabilities; it cannot attest that browser traffic uses Tor.

## 2. Existing implementation and residual delta

- [Network settings](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/net-transport/src/settings.ts) exports `validateNetworkSettings`, `validateRpcMode`, and `PROFILE_AVAILABILITY`; preserve environment/testnet restrictions.
- [Browser transport](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/net-transport/src/browser.ts) exports `createFetchTransport`, `transportToFetch` and onion validation. The Node-capable root entry must not enter web bundles.
- [Scan policy](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/scanPrivacy.ts) exports `privatePathForbidsDirect`, `planScan`, `openScanClients` and disclosure builders; retain fail-closed scanning.
- [Services](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/services.ts) injects `fetchFn`, `createRpc` and manifest loading. Audit [default wiring](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/defaultServices.ts) when integrating.

The delta is purpose-scoped consent across all app-owned RPC consumers, policy-revision invalidation, and a reusable exposure/result contract. Existing endpoint validation does not establish that every consumer obeys the policy.

## 3. Scope, ownership and dependencies

Own a browser-safe policy wrapper beside existing transport/settings modules and focused settings UI integration. Exclude provider discovery, wallet-extension networking, consensus, hosted proxies, service entitlements and settlement. F15/F18 consume this provider; P02 must not import those consumers.

Consumers supply purpose and minimal public request descriptions through injected ports. Private keys, viewing keys, invoice plaintext, contact aliases and bearer links are never valid RPC metadata. Necessary public transaction fields are disclosed. Quorum adds observers even while improving integrity.

## 4. Proposed data and API

```ts
type RpcPurpose = 'head' | 'public-logs' | 'payment-evidence'
  | 'fee-estimate' | 'simulate' | 'broadcast';
interface RpcPolicyV1 {
  version: 1; revision: string; chainId: string;
  endpoints: readonly { id: string; url: string;
    purposes: readonly RpcPurpose[] }[];
  requirePrivatePath: boolean;
  fallback: 'none' | 'ask-again';
}
interface RpcPolicyPort {
  inspect(policy: RpcPolicyV1, purpose: RpcPurpose,
    request: unknown): ModuleResult<Disclosure>;
  request<T>(consent: ConsentHandle, method: string,
    params: readonly unknown[], ctx: OperationContext):
      Promise<ModuleResult<T>>;
  capability(): CapabilityDescriptorV1;
}
```

`ConsentHandle` is opaque and memory-scoped, binding policy revision, endpoint identity, chain, purpose, disclosure digest and operation. It is not an account token. A reviewed method/field allowlist rejects unknown JSON-RPC methods. Decode quantities exactly and reject duplicate or conflicting response IDs.

## 5. Behavior and lifecycle

1. Edit settings locally; connectivity checks make no request before consent.
2. Build a static preview: provider host, chain, method, exposed public fields and routing limitations.
3. Confirm purpose scope and verify chain/configuration through the approved endpoint.
4. Before dispatch, recheck operation, session epoch, policy revision and endpoint binding.
5. Execute bounded transport, validate response envelopes and return only typed results.
6. Timeout/refusal remains unavailable. Alternate providers require a new preview and consent.
7. Lock, policy change or seller replacement cancels pending reads and rejects late state installation.

Already sent requests cannot be recalled. Never fall back automatically to wallet RPC, public defaults, another chain or diagnostics. Wallet-extension traffic lies outside this wrapper. Reorg-sensitive consumers receive block identities and invalidate stale evidence; P02 never equates responses with settlement. Sleep/wake rechecks deadlines and policy.

## 6. Proposed limits and failures

Allow four endpoints per chain and 32 total entries. URLs are limited to 2,048 bytes and policy JSON to 64 KiB. Reject embedded credentials and unconsented cross-origin redirects. Operator API-key storage needs a separate explicit secret-storage design and must not enter exports by default.

Ordinary reads: 20-second deadline, 1 MiB response cap, four in flight and no automatic retries. Reviewed public-log reads may use an 8 MiB streaming cap. Batches contain at most 50 validated reads; signing/broadcast calls are never silently batched. These are proposed budgets requiring benchmarks.

Errors include `POLICY_CHANGED`, `CONSENT_REQUIRED`, `ENDPOINT_UNAVAILABLE`, `PRIVATE_PATH_UNAVAILABLE`, `RESPONSE_TOO_LARGE`, `CANCELLED`, and `UNSUPPORTED_METHOD`. Diagnostics never echo credential-bearing URLs or full request bodies.

## 7. Privacy and trust matrix

| Observer / failure | Exposure | Required treatment |
|---|---|---|
| Selected RPC | Route identity, methods, addresses, hashes | Preview/minimize; no tracking identifier |
| Quorum providers | Queries shared across observers | Explain integrity and exposure separately |
| Wallet extension | Independent provider traffic | Disclose lack of control; no hidden fallback |
| Redirecting endpoint | Disclosure to another host | Refuse without separate consent |
| Local storage reader | Provider preferences/history | Consumer-encrypted sensitive settings; no history by default |
| Stale/lying RPC | False state or chain | Validate types; consumer deployment/finality checks |

## 8. Pricing policy

RPC selection, own-node settings and fail-closed policy remain free local functions. External provider charges are disclosed when known; P02 does not infer subscription prices or charge for endpoint selection. Optional service quotes belong to consumers/FEE01. Unknown prices remain unknown. No fee recipient or protocol fee changes here.

## 9. Acceptance cases

- **P02-A01:** Disallowed purposes/methods refuse before fetch or wallet-provider interaction.
- **P02-A02:** Timeout emits no second-endpoint request; fallback needs fresh consent.
- **P02-A03:** Policy edits during chain checks invalidate old consent.
- **P02-A04:** Unsupported required-private routing refuses without a direct substitute.
- **P02-A05:** Streaming responses cancel at the cap without Content-Length.
- **P02-A06:** Chain mismatch, malformed IDs and conflicting results never enter state.
- **P02-A07:** Exposure rendering generates no requests and displays no secret fields.
- **P02-A08:** Lock/cancel/reload cannot replay consent; unacknowledged broadcasts remain uncertain.
- **P02-A09:** Quorum/wallet/Tor labels describe actual observers and unattested routes.

## 10. Implementation slices and future verification

Slice 1 inventories consumers and purpose types. Slice 2 adds consent/revision enforcement around validated transport. Slice 3 integrates scanning and payment reads without expanding chains. Slice 4 checks the full egress inventory and independently reviews refusals/leakage.

Confirmed scripts for later implementation, **not run here**:

```bash
npm run test -w @ghostpay/net-transport
npm run typecheck -w @ghostpay/net-transport
npm run lint -w @ghostpay/net-transport
npm run test -w @ghostpay/chain-adapters
npm run test -w @ghostpay/web
npm run build -w @ghostpay/web
```

## 11. Migration, rollback and decisions

Preview imported preferences without widening purpose/fallback scope or probing endpoints. Unknown versions refuse; rollback preserves originals and requires fresh consent. Disabling this adapter must not silently enable direct fetch. Decide credential storage, method budgets and browser routing support before implementation. Qualification records exact source, actual engines and request traces, with unavailable external gates explicit.
