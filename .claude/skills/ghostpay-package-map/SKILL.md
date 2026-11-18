---
name: ghostpay-package-map
description: Which GhostPay workspace owns a feature, what it depends on, and what depends on it. Use before searching the tree for "where does X live", before adding a cross-package import, and before estimating a change's reach. Covers all npm workspaces under packages/ and apps/ plus the three Foundry projects.
---

# GhostPay package map

Read [PACKAGE_MAP.md](PACKAGE_MAP.md) first. It is generated from every `package.json` and lists each
workspace's purpose, internal dependencies (Uses), reverse dependencies (Used by) and non-standard scripts.
Only open a package's own README or source after the map has narrowed the search.

## Rules

- The map is generated. Never edit it by hand. After adding a workspace or changing a `description` or an
  internal `@ghostpay/*` dependency, run `node scripts/agent/package-map.mjs`. `node --test scripts/agent/*.test.mjs`
  fails while the committed map is stale.
- Dependencies point one way: `apps/*` consume `packages/*`; packages never import apps. A cycle makes
  `scripts/build-workspaces.mjs` throw.
- Consumers import other workspaces from `dist/` (package `exports`), so a library must be rebuilt before its
  dependents are tested. `ghostpay-affected-checks` does this for you.
- Not every package is shipped. "testnet PoC", "experimental", "research port" and "not wired in" in a description
  mean the code is not used by `apps/web` or `apps/relayer`; check "Used by" before assuming production reach.

## Orientation (stable facts not in package.json)

- Core payment path: `core-crypto` (ERC-5564 scheme 1) -> `invoice-schema` -> `chain-adapters` -> `apps/web`
  and `apps/relayer`; `tx-review`, `address-safety`, `secret-box` guard the web signing and display paths.
- `packages/contracts` (GhostPayRouter, GhostPaySweepRelayer, PolicyAccount*) is the main Foundry project. Its build
  output is also used by `chain-adapters` and `policy-scheme` (ABIs, anvil tests) and by `apps/web` (registry test).
- `pool-*`, `external-pools*`, `confidential-*`, `payer-*`, `ux-*`, `merchant-*`, chain-specific `chain-*`/`btc-*`
  packages are mostly self-contained proofs of concept. `ops-monitor` is not wired in anywhere.
- Normative specs: `docs/CONTRACTS_SPEC.md`, `docs/APP_AND_RELAYER_SPEC.md`, `docs/MULTICHAIN_SPEC.md`;
  decisions in `docs/adr/ADR-LOG.md`. Use Graphify/Serena (if connected) for symbol-level questions.
