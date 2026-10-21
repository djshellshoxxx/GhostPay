# Spec: net-status: Status and health page
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none

## Problem
Failures (no RPC, wrong chain id, relayer down, wrong device clock, blocked storage) surface late and cryptically; invoice expiry depends on the device clock.

## Exists today (verified in repo) vs missing
- apps/web/src/views/Settings.tsx:47-60 per-chain RPC "Test" (chain id check only).
- apps/relayer/src/server.ts:24-33,233 serves GET /healthz and /v1/info.
- apps/web/src/lib/release.ts release-hash widget (Home.tsx:20-60).
- apps/web/src/lib/settings.ts storage-failure tolerance (saveSettings returns false).
- Missing: everything described under Design.

## Design
Check runner: independent checks return {id, status: ok|warn|fail|skipped, detail}. Checks: RPC reachable + chain id; latest block age (stale RPC); clock skew vs latest block timestamp (warn >120 s); relayer /healthz and /v1/info (only if relayerUrl set); manifest loaded per chain; storage available (localStorage, IndexedDB); wallet detected; worker support; secure context. Every network check goes only to endpoints the user configured, user-initiated (button) and never automatic on load. Results are held in memory.

## Privacy and security impact
No third-party endpoints (no "is the internet up" ping to a vendor). Relayer probe reveals IP to the relayer the user already chose; show that in the button label. No result persisted.

## Build ownership
- NEW package: `packages/net-status` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/net-status`.
- Public API (exports from `src/index.ts`):
- `runChecks(env: CheckEnv, which?: CheckId[]): Promise<CheckResult[]>`
- `type CheckEnv = {rpc(chainId): Promise<RpcLike|undefined>; fetchFn; nowMs; storage probes; wallets: () => Promise<number>}`
- `clockSkewSec(localNowMs: number, blockTimestampSec: number): number`
- `CHECK_IDS`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Status.tsx (new)
- apps/web/src/state.tsx + App.tsx (ViewId 'status', nav entry)
- apps/web/src/views/Settings.tsx (link to Status after Test)
- Add `@ghostpay/net-status` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **NETST-1** MUST No check runs without a user action.
2. **NETST-2** MUST Each check has a timeout (default 8 s) and cannot throw out of runChecks.
3. **NETST-3** MUST Relayer checks are skipped when relayerUrl is empty.
4. **NETST-4** MUST Clock skew uses the RPC block timestamp, never a third-party time server.
5. **NETST-5** SHOULD Copyable plain-text report with no URLs (hosts replaced by "RPC for <chain name>").
6. **NETST-6** SHOULD Pair each fail with a ux-errors Guidance if installed.

## Acceptance tests
1. **T-1** Mock RPC with chainId mismatch -> fail "different chain".
2. **T-2** Block timestamp 10 min behind local clock -> warn with skew≈600.
3. **T-3** relayerUrl="" -> relayer check skipped, zero fetch calls (spy).
4. **T-4** Report string contains no "http" substring.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
