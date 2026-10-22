# Reuse research: light-indexer

Date of research: 2026-10-21. Read-only research. No clones, no installs, no code copied.

## Current repo state

- `packages/` has no `light-indexer` package. `apps/` has `relayer` and `web` only.
- Nearest existing packages: `packages/pool-relayer` (`@ghostpay/pool-relayer`), `packages/ops-monitor` (`@ghostpay/ops-monitor`), `packages/pool-sdk`, `packages/btc-silent-payments`.
- Grep for `announc|stealth|subgraph|indexer` hits only `external-pools-privacypools`, `tx-review`, `pool-sdk` (no indexer code).

## Candidate table

Verification key: "raw" = LICENSE read from raw.githubusercontent.com. "page" = licence shown on github.com repo page only. "unverified" = not confirmed.

| # | Repo | Licence (verbatim name, source) | Commit SHA (date) | Stars | Maintained? | Worth reusing | Deps |
|---|------|-------------------------------|-------------------|-------|-------------|---------------|------|
| 1 | https://github.com/ScopeLift/umbra-protocol | "MIT License", raw: https://raw.githubusercontent.com/ScopeLift/umbra-protocol/master/LICENSE.txt, "Copyright (c) 2026 ScopeLift" | `d54507271542ef311d8e299a4799692722364a8d` (Oct 19, 2026, master HEAD at research time) | 405 (page) | Yes, active 2026. About 1,234 commits. | `umbra-js/src/classes/StealthKeyRegistry.ts`, `umbra-js/src/classes/Umbra.ts`, `umbra-js/src/classes/KeyPair.ts`, `umbra-js/src/classes/TxHistoryProvider.ts`, `umbra-js/src/utils/`. Scanning/announcement file NOT seen in the visible listing (`umbra-js/src/classes` has 5 files, none named scanner). | TypeScript (ethers-based, `umbra-js/src/ethers.ts`). Contracts in `contracts-core/`, `contracts-periphery/`. |
| 2 | https://github.com/namesys-eth/stealth-address-sdk | "MIT License", raw: https://raw.githubusercontent.com/namesys-eth/stealth-address-sdk/main/LICENSE. Raw file read: "MIT License / Copyright (c) 2024 ScopeLift" (copyright holder as read; odd for a non-ScopeLift repo, verify before relying on it). | `be20fc3aa8fd90606bc0d4e4580003ec50e46d3c` (Apr 4, 2024, main HEAD seen on commits page). 13 commits total. | 1 (page) | Doubtful. Last commit seen Apr 2024, about 2.5 years stale at research date. | `src/lib/stealthClient/`, `src/lib/actions/`, `src/lib/helpers/`, `src/lib/abi/`, `src/utils/crypto`. Declares ERC-5564 and ERC-6538 support (page description). Contents of `src/lib` read only at directory level. | TypeScript, npm `stealth-address-sdk`. |
| 3 | https://github.com/menonsamir/ypir | "MIT license" (page). `LICENSE` raw read: "MIT License / Copyright (c) 2024, Samir Menon". Cargo.toml has NO `license` field. | `a73e550a469605c2fa23945a4d96c20fb2f4a839` (Apr 1, 2025) | 103 (page) | Low-to-moderate. About 50 commits. Last commit Apr 2025, about 18 months stale. | Whole crate as a reference: `pir/` (server/client), `eval/` (benchmarks). Scheme: YPIR (USENIX Security 2024). | Rust. `spiral-rs` git dep pinned to rev `6929441` from `https://github.com/menonsamir/spiral-rs.git`. Also rand 0.8.5, serde, clap 4.5, env_logger. Build notes (from search snippet, unverified on page): Ubuntu and AVX-512 CPU required. |
| 4 | https://github.com/ahenzinger/simplepir | "MIT license" (page). Raw LICENSE not read. | Latest commit date/SHA not shown on page. About 50 commits. | 103 (page) | Stable academic reference. Description: "The reference implementation of SimplePIR and DoublePIR". | `pir/` (core), `eval/`. | C. Base layer that YPIR builds on. |

Not researched in depth (no verified repo found):
- Subgraph / Ponder / Envio templates for ERC-5564 Announcer. Search returned nothing usable. Spec/ABI only: https://ercs.ethereum.org/ERCS/erc-5564 and https://eips.ethereum.org/EIP-5564. Announcer singleton `0x55649E01B5Df198D18D95b5cc5051630cfD45564` (OP Sepolia per search). Event shape differs between EIP draft and deployed contract (per search snippet): verify ABI before writing handlers.
- `umbra-protocol/stealth-address-sdk`: NOT FOUND. The name as stated in the task does not exist in search results. Closest match is `namesys-eth/stealth-address-sdk` (row 2). Treat the task's repo name as unverified/incorrect.
- Tor fetch clients: no verified candidate. Search returned only generic reqwest info (reqwest is dual MIT/Apache-2.0, per search result docs.rs pages, unverified against its LICENSE file). Arti: not found in search, licence unverified.
- SPIRAL reference: menonsamir/spiral-rs (linked from ypir). Licence and SHA unverified.

## Recommendation

Overall: **reference-only**. No copy, no adapt, no depend in this round.

Per candidate:
- Row 1 (ScopeLift umbra-js): **reference-only** for now. Good MIT licence and active. Scanning code location unconfirmed. If a TS stealth-scanner is needed, the clean path is to read `umbra-js/src/classes/Umbra.ts` and rebuild a scanner from the ERC-5564 spec. Revisit `adapt` after confirming scanner functions exist (read the file via raw URL, not yet done).
- Row 2 (namesys-eth SDK): **reference-only**. MIT (verified), but 1 star and stale since Apr 2024. Abandonment risk high. Do not depend on it.
- Row 3 (YPIR): **reference-only**. MIT (verified), useful only if GhostPay needs private reads of the indexer DB. Heavy deps (Ubuntu, AVX-512, git-pinned spiral-rs). Not needed for the first light-indexer milestone.
- Row 4 (SimplePIR): **reference-only**, same reason.

## Integration plan (if the team later adopts umbra-js scanning logic)

Target path: `packages/light-indexer/` (new, `@ghostpay/light-indexer`).

API shape (proposed, not from any repo):
- `scanAnnouncements({ fromBlock, toBlock, viewTagFilter? }) -> Announcement[]`
- `checkStealthOwnership({ announcement, viewingKey, spendingPubKey }) -> { isMine, stealthPrivKeyFn? }`
- Uses view tag (first byte of metadata, per ERC-5564) to skip most announcements cheaply.

Tests:
- Unit: view-tag filtering with fixed vectors from the ERC-5564 spec.
- Golden: copy test vectors only if the source licence (MIT) allows and the attribution header is kept.
- Integration: local anvil fork with Announcer contract deployed; scan a known announcement.

Attribution if any code is adapted: keep the MIT copyright line and licence text in the file header, and add a NOTICE entry naming the source repo and SHA.

## Risks

- Supply chain: row 2 (1 star, stale 2.5 years) and row 3 (stale about 18 months) carry abandonment risk. Pin SHAs if ever depended on.
- Licence traps: ypir Cargo.toml has no `license` field. Use the LICENSE file (MIT), not the manifest. Umbra's LICENSE.txt is MIT, but its `contracts-*` folders may carry separate headers; check per-file SPDX before copying Solidity.
- Name mismatch: the requested repo `umbra-protocol/stealth-address-sdk` does not exist per search. Anyone citing it will be wrong.
- Unverified: announcement scanner in umbra-js, subgraph candidates, Tor clients, spiral-rs licence. None are copyable until verified.
- Event ABI drift: ERC-5564 EIP draft vs deployed Announcer differ (per search). Verify on-chain ABI before indexing.
- Privacy: an indexer that serves scan results can leak viewing-key linkage. Keep the view-tag filter client-side where possible.
