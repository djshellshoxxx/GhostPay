# Reuse research: wallet-adapter

Scope: EIP-6963 discovery, EIP-1193 wrappers, WalletConnect/Reown adapters.
Method: read-only. WebSearch/WebFetch on public GitHub API, github.com pages and raw.githubusercontent.com. No clone, no install, no code copied. `gh api` was refused for these repos (session has no GitHub access), so all metadata is from WebFetch.

## Existing code (checked first)

- `apps/web/src/lib/wallet.ts` (295 lines) already implements EIP-6963 discovery (`discoverWallets`, lines ~42-70: listens for `eip6963:announceProvider`, dispatches `eip6963:requestProvider`, 150 ms window, `window.ethereum` labelled fallback). Also `connectWallet`, `sendViaWallet`, `signTypedDataViaWallet`, `verifySubmission`, `pollReceipt`.
- `apps/web/src/test/announcements.ts`, `apps/web/src/test/mockWallet.ts`, `apps/web/src/lib/wallet.test.ts`: existing discovery fixtures and tests.
- `apps/web/package.json`: no wagmi, mipd, WalletConnect or Reown dependency.
- `packages/chain-adapters/package.json`: EVM adapter on `viem` 2.57.7, license UNLICENSED. Not a wallet-connection layer.

Implication: discovery is already hand-rolled. The reuse gain is limited to the store/dedup logic and types.

## Candidate repos

| # | Repo | Licence (verified how) | Commit SHA | Last push / commit | Stars | Maintained? | Reusable files | Deps |
|---|---|---|---|---|---|---|---|---|
| 1 | https://github.com/wevm/mipd | MIT. `LICENSE` raw (https://raw.githubusercontent.com/wevm/mipd/main/LICENSE): "MIT License / Copyright (c) 2023-present weth, LLC". package.json `license: MIT`. | Main HEAD not verified. Commits page (https://github.com/wevm/mipd/commits/main) shows top commit `0fda4481a31a28a4571c10a1d99568c9b4fed226` "chore: update README.md (#17)", Apr 4 2024. CONFLICT: API `pushed_at` 2026-06-02. Treat SHA as unverified. | pushed_at 2026-06-02 (API). Top commit date 2024-04-04 (page). | 123 | Yes, active per pushed_at; latest version 0.0.7 (package.json). Release lookup was 403. | `src/index.ts` (exports `createStore`, `announceProvider`, `requestProviders`, EIP-6963 types), `src/store.ts` (`createStore`: listeners Set, providerDetails array, dedup by `info.uuid`, `subscribe`, `findProvider({rdns})`, `getProviders`, `reset`, `destroy`), `src/utils.ts` (`requestProviders`, not read in full). | Runtime: none. Peer: typescript. Dev only: viem, vitest, rome, vite. Exports: `.`, `./window`, `./package.json`. |
| 2 | https://github.com/wevm/wagmi | MIT (API `license.spdx_id: MIT`). LICENSE file not fetched. | Not verified. | pushed_at 2026-10-21 (API). | 6762 | Yes. | EIP-6963 `rdns` dedup logic (commit f43e074 per search snippet, unverified). Reference only. | Large (wagmi core, viem, tanstack query). Too heavy for a single adapter. |
| 3 | https://github.com/WalletConnect/walletconnect-monorepo | NOT VERIFIED. API `license.spdx_id: NOASSERTION`. Raw LICENSE at `v2.0` branch returned 404 via WebFetch. Do not assume Apache-2.0. | Not verified. | pushed_at 2026-10-21 (API). Default branch `v2.0`. | 1688 | Yes. | `packages/` (sign-client, universal-provider) as reference only. | Heavy. Relay-dependent. |
| 4 | https://github.com/reown-com/appkit | NOT MIT. API `license.spdx_id: NOASSERTION`, `license.name: Other`. Search snippet (Quicknode guide) names a "Reown AppKit Community License" with commercial thresholds and redistribution rules; not confirmed from the repo file (raw and blob LICENSE fetches 404). | Not verified. | pushed_at 2026-10-21 (API). | 5454 | Yes. | None (UI kit). | Requires Reown cloud project ID and proprietary infrastructure. |

Search-only leads, not verified against repo files: `eip1193-types` (sxzz, MIT per npm listing; types only), `eip1193-provider` (pedrouid, MIT per listing, unsupported), `@cedelabs/providers` (licence not shown). No permissive EIP-1193 wrapper was confirmed from a GitHub LICENSE file.

## Recommendation

Decision: **depend** on `mipd` pinned to exact `0.0.7`, with a fallback to **copy** of `src/store.ts` plus types (MIT, keep the copyright and licence notice) if the dependency is not wanted.

Why: MIT, zero runtime dependencies, small surface, provides the rdns-keyed store that the existing `discoverWallets` lacks. Replacing `discoverWallets` internals is a small change.

Do not adopt: WalletConnect monorepo and Reown AppKit (licence unclear or restrictive, relay or cloud dependency, large surface). Use reference only, and only after their LICENSE files are read from the repo.

## Integration plan (GhostPay)

- Target path: `apps/web/src/lib/wallet.ts`, function `discoverWallets` (keep its exported signature `(win, waitMs) => Promise<readonly WalletInfo[]>`). Keep the `window.ethereum` fallback labelling and the untrusted-payload checks already in place.
- Install: `npm install mipd@0.0.7 --save-exact -w apps/web` (do not run in this research step).
- API shape: `createStore()` from mipd, then `store.subscribe(cb)` after the request, map `EIP6963ProviderDetail` to existing `WalletInfo` (`info.uuid`, `info.name`, `info.rdns`, `provider`). Keep the 150 ms wait, then `store.destroy()`.
- Dedup: use `info.rdns` (store already dedups by `info.uuid`). Keep fallback only when no announcement arrives.
- Tests (`apps/web/src/lib/wallet.test.ts`): (a) two announcements with distinct uuid both returned; (b) duplicate uuid collapsed; (c) no announcement falls back to `window.ethereum` with `kind: 'injected'`; (d) malformed announce payload ignored; (e) listener removed after timeout. Reuse `apps/web/src/test/announcements.ts` fixtures.
- Verification: `npm test -w apps/web`, `npm run typecheck -w apps/web`, bundle scan (`apps/web/scripts/scan-bundle.mjs`) to confirm mipd adds no unexpected deps.

## Risks

- Supply chain: single maintainer org (wevm). Pin exact version, lockfile review, check provenance on npm before upgrade. Dev deps are not shipped but still run in CI.
- Abandonment: 0.0.x semver, small surface, but no release lookup succeeded. Re-check release date before adoption. Copy fallback removes the risk.
- Licence traps: mipd MIT is clear. WalletConnect and AppKit are unresolved or custom. Do not copy code from them until LICENSE is read in the repo. Do not copy wagmi code without keeping its MIT notice.
- Unverified: all SHAs except the commit-page reading noted above; wagmi and walletconnect LICENSE files; mipd HEAD commit (conflict noted).
- Behavioural: EIP-6963 is still an ethereum-magicians draft; announcements are untrusted input. Keep validation in `wallet.ts`.

## Sources

- https://github.com/wevm/mipd (API metadata; raw LICENSE; raw src/index.ts; raw package.json; raw src/store.ts)
- https://github.com/wevm/mipd/commits/main
- https://api.github.com/repos/wevm/wagmi
- https://api.github.com/repos/WalletConnect/walletconnect-monorepo
- https://api.github.com/repos/reown-com/appkit
- https://github.com/reown-com/appkit/blob/main/LICENSE (404 via WebFetch)
- https://ethereum-magicians.org/t/eip-6963-multi-injected-provider-discovery/14076
