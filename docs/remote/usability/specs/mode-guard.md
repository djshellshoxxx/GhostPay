# Spec: mode-guard: Testnet / practice mode and network badge
Impact 3/5 | Effort S | Score 3 | Build wave 0 | Depends on: none

## Problem
Nothing on screen says which network or risk mode you are in (header App.tsx tagline only); when mainnets are enabled a testnet/mainnet mix-up costs real money; new users have no safe way to rehearse.

## Exists today (verified in repo) vs missing
- packages/chain-adapters/src/config/chains.ts:34-35 testnet:true flag; mainnets enabled:false.
- apps/web/src/App.tsx header shows static tagline only.
- apps/web/src/views/Pay.tsx review shows chain name but no mode styling.
- Missing: everything described under Design.

## Design
Derive a Mode ("testnet" | "mainnet") per chain from ChainConfig.testnet. Persistent header badge showing mode, and the Pay/Sweep/Create views show a colour-independent banner ("TESTNET: coins have no value" / "MAINNET: real money"). Mainnet actions require a one-time per-session acknowledgement. Practice mode: generates a clearly marked sample invoice for a testnet and walks through review with the wallet step stubbed to "dry run" (builds and decodes calldata via existing preview but does not call sendViaWallet). Practice invoices carry memo prefix "PRACTICE" and are signed with a throw-away key.

## Privacy and security impact
No data leaves device. Practice key is ephemeral and unrelated to seller keys (never reuse seller signing key for samples).

## Build ownership
- NEW package: `packages/mode-guard` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/mode-guard`.
- Public API (exports from `src/index.ts`):
- `modeOf(chain: {testnet: boolean}): "testnet"|"mainnet"`
- `banner(mode): {text; ariaLabel; tone}`
- `needsAck(mode, session: {acked: Set<number>}, chainId): boolean`
- `practiceInvoice(nowSec): {form: InvoiceForm; signingKey: ephemeral}`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/App.tsx (header badge)
- apps/web/src/views/Pay.tsx, Sweep.tsx, CreateInvoice.tsx (banner component)
- apps/web/src/views/Pay.tsx (dry-run path before sendViaWallet)
- Add `@ghostpay/mode-guard` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **MODEG-1** MUST Badge text distinguishes modes without relying on colour alone.
2. **MODEG-2** MUST Practice mode never calls wallet.sendViaWallet, relayer or any RPC write method (spy test).
3. **MODEG-3** MUST Practice invoice is rejected by a payer on any non-testnet chain.
4. **MODEG-4** MUST Mainnet acknowledgement is per session, in memory only.
5. **MODEG-5** SHOULD Show native symbol value disclaimer on testnets.

## Acceptance tests
1. **T-1** modeOf({testnet:true})=="testnet".
2. **T-2** Practice run: zero calls to eth_sendTransaction/eth_sendRawTransaction.
3. **T-3** needsAck true first time on mainnet chain, false after ack, always false on testnet.
4. **T-4** Axe-style test: banner has role and text, no colour-only cue.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
