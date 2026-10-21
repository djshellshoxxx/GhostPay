# Spec: wallet-connect: WalletConnect (opt-in) for mobile wallets
Impact 4/5 | Effort L | Score 1 | Build wave 1 | Depends on: mode-guard

## Problem
No mobile wallet path: only EIP-6963 and window.ethereum (wallet.ts:45; DEVIATIONS item 7; troubleshooting row "WalletConnect is not built").

## Exists today (verified in repo) vs missing
- apps/web/src/lib/wallet.ts:45-72 discoverWallets; 140-190 connectWallet/sendViaWallet/signTypedData share Eip1193Provider.
- Missing: everything described under Design.

## Design
Adapter producing an Eip1193Provider-compatible object from a WalletConnect v2 session so the existing wallet.ts review/verification flow is reused unchanged (including verifySubmission via user RPC, which is what catches a lying wallet). Opt-in toggle with a disclosure: the WalletConnect relay (default vendor-hosted; self-hosted relay URL configurable) sees pairing metadata, IP and encrypted traffic timing. Pairing URI shown as QR/link locally. Dependency pinned and CSP connect-src already allows wss.

## Privacy and security impact
Introduces a third-party relay: default OFF, loud disclosure, self-host option. Project id (if the relay requires one) is a user-supplied setting, never baked in. Session data not persisted beyond the tab by default.

## Build ownership
- NEW package: `packages/wallet-connect-adapter` (TypeScript, ESM, no UI, no DOM except where noted, no network unless stated; own README.md, DEVIATIONS.md, vitest tests, coverage thresholds like sibling packages). Name `@ghostpay/wallet-connect-adapter`.
- Public API (exports from `src/index.ts`):
- `createWcProvider(opts: {relayUrl?; projectId; chainId; storage: SessionOnly}): Promise<Eip1193Provider & {uri: string}>`
- `allowedMethods: readonly ["eth_chainId","eth_accounts","eth_sendTransaction","eth_signTypedData_v4","wallet_switchEthereumChain"]`
- `close()`
- The package may import only: other `@ghostpay/*` packages named in Depends on, `@noble/*` already in the lockfile. New third-party dependencies need a THIRD_PARTY.md entry before merge.

## UI wiring (apps/web; keep minimal, serialise in the single wiring session)
- apps/web/src/views/Pay.tsx wallet list (extra entry)
- apps/web/src/views/Settings.tsx (relay URL, project id, opt-in)
- apps/web/src/lib/defaultServices.ts
- Add `@ghostpay/wallet-connect-adapter` to `apps/web/package.json` dependencies. Shared hot files (`state.tsx`, `App.tsx`, `lib/services.ts`, `lib/defaultServices.ts`, `lib/settings.ts`) are touched by several specs: wire them one spec at a time in the order in README.md.

## Requirements
1. **WALLE-1** MUST Only the listed methods are requested/forwarded.
2. **WALLE-2** MUST Adapter output passes the existing wallet.ts chain-id and submission checks unchanged.
3. **WALLE-3** MUST Off by default; first use shows the relay disclosure and requires a click.
4. **WALLE-4** MUST No project id or relay URL is hard-coded.
5. **WALLE-5** MUST Dependency added only after bundle-scan allowlist review.
6. **WALLE-6** SHOULD Deep-link button for mobile browsers.

## Acceptance tests
1. **T-1** Provider.request("eth_sign",...) rejects (method not allowed).
2. **T-2** Mock relay: connectWallet() works through the adapter and sendViaWallet returns hash.
3. **T-3** Chain mismatch in session -> same WalletCallError as injected path.
4. **T-4** Network spy: no connection before opt-in.
Plus: package coverage thresholds 90/85/90/90 (as apps/web), `npm run typecheck`, `npm run lint`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) still clean, no new network host in the e2e network log.
