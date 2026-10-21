# Spec: hw-signer: Hardware-wallet payer path and signer abstraction
Impact 2/5 | Effort L | Score 0.5 | Build wave 0 | Depends on: none

## Problem
Hardware users go through a browser wallet already (works via injected provider), but there is no explicit guidance, and stealth one-time keys cannot live on a device so sweeps stay software-signed (modules-needed.md rank 12).

## Exists today (verified in repo) vs missing
- docs/remote/modules-needed.md rank 12 (Missing).
- apps/web/src/lib/wallet.ts Eip1193Provider interface.
- apps/web/src/lib/sweep.ts direct sweep signs with derived key in memory.
- Missing: everything described under Design.

## Design
Phase 1 (S): guidance + capability detection text for hardware-backed injected wallets (payer side) incl. blind-signing warning, typed-data hash display for permit. Phase 2 (L, blocked on vendor research): Signer interface {address; signTransaction; signTypedData} implemented by InMemorySigner today; offline-sign export/import (QR/file) for sweeps so the stealth key can sign on an air-gapped machine: export unsigned tx (+ derived key via encrypted package) is NOT acceptable - instead export the derived one-time private key encrypted to an offline signer tool. Not specified beyond interface until reviewed.

## Privacy and security impact
Exporting derived one-time keys is a security-sensitive act; Phase 2 requires security review before build. Phase 1 has no data flows.

## Build ownership
- NEW package: `packages/signer-abstraction` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/signer-abstraction`.
- Public API (exports from `src/index.ts`):
- `interface Signer { address: string; signTransaction(tx): Promise<Hex>; signTypedData(json): Promise<Hex> }`
- `InMemorySigner(secret)`
- `describeSigningRisk(kind): string`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/lib/sweep.ts (accept Signer)
- apps/web/src/views/Pay.tsx (hardware tips)
- Add `@ghostpay/signer-abstraction` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **HWSIG-1** MUST Signer interface introduces no behaviour change for existing sweeps (tests unchanged).
2. **HWSIG-2** MUST No private key crosses the interface; only signatures.
3. **HWSIG-3** MUST Phase 2 gated by explicit security review ticket.
4. **HWSIG-4** SHOULD Typed-data summary shown before any signature request.

## Acceptance tests
1. **T-1** directSweep with InMemorySigner byte-identical output to current implementation on fixtures.
2. **T-2** Signer mock that rejects -> user-facing cancel message.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
