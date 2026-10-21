# Reuse research: solana-prior-art (stealth announcer, fee-payer relayers, test harness)

Scope: research only. No clone, no install, no code copied into repo. Licence marked verified only where a LICENSE file or licence text was read. SHA and last-commit date NOT obtained for any repo: GitHub API and `gh api` returned 403 ("GitHub access to this repository is not enabled for this session"), and github.com pages show no SHA/date in fetched text. Stars and commit counts come from github.com HTML.

## Repo state (GhostPay)

- `packages/solana-stealth` exists: PoC dual-key ed25519 stealth (SOL + SPL) + Solana ChainAdapter, ADR-0017, `UNLICENSED`, deps `@solana/kit 8.4.0`, `@noble/curves 2.4.0`, `vitest`. Not audited.
- Relayer side: `apps/relayer`, `packages/pool-relayer`, `packages/payer-sponsor`, `packages/relayer-guard` (TS).
- No Solana announcer program found in repo. No fee-payer relayer for Solana found in repo (not checked file-by-file).

## Candidates

| # | Repo | Licence (verified how) | SHA / last commit | Stars / commits (page) | Maintained? | Worth reusing | Deps |
|---|------|------------------------|-------------------|------------------------|-------------|---------------|------|
| 1 | https://github.com/LiteSVM/litesvm | Apache-2.0. Verified: `https://raw.githubusercontent.com/LiteSVM/litesvm/master/LICENSE` = "Apache License, Version 2.0" | not obtained | 647 / 291 | Yes, active per Solana docs (solana.com/docs/tools/litesvm) | Use as-is as test dependency; no code copy needed | Rust crate `litesvm`; TS/JS and Python bindings (per docs) |
| 2 | https://github.com/solana-foundation/kora | MIT per GitHub page licence badge. NOT file-verified: raw `LICENSE` 404 on `main` and `master` | not obtained | 202 / 640 | Yes, Solana Foundation org, docs at solana.com/docs/tools/kora | Design only: signer backends (local key, Turnkey, Privy, Vault), validation rules, multi-signer | Rust (`kora-cli` on crates.io, `kora-lib`), TS SDK |
| 3 | https://github.com/anza-xyz/octane | UNVERIFIED. Page and raw LICENSE returned 404 (master and main) on every fetch, despite search hit | not obtained | unknown | UNVERIFIED (repo may have moved, search pointed to it via forum post saying old solana-labs path) | Reference only until fetch works: gasless SPL-token fee model, `docs/recipes.md`, `docs/CLI.md` (seen in search snippets only) | Rust service |
| 4 | https://github.com/emarkees/sdk (`@wraith-protocol/sdk`) | MIT. Verified: `https://raw.githubusercontent.com/emarkees/sdk/develop/LICENSE` = "MIT License" (main branch LICENSE 404; default branch unclear) | not obtained | 0 / 49 (develop) | Unknown. 0 stars, low signal | Solana ed25519 stealth module (`chains/solana`) as a second reference for key derivation vs `packages/solana-stealth`. Read before any reuse | npm `@wraith-protocol/sdk`, TS |

Also seen, not assessed further (no licence verified, low signal):
- https://github.com/doomymike/solana-stealth: DKSAP sending flow, 0 stars, 52 commits. Licence: no licence named on page; a file named `LISCENCE` (misspelled) exists but not readable. Treat as `none` (no copy).
- Metapass/octane (fork of jordaaash/octane): 1 star, 70 commits, no licence named on page. Its README calls the code untested alpha (from search snippet). Not a candidate.
- shredr_fun: Pinocchio hackathon project on gitea, not GitHub. Not assessed.

Announcer gap: no Solana port of ERC-5564 announcer found. EVM references (`namesys-eth/stealth-address-sdk`, Stealthpay on hackquest) are EVM only, not copyable as Solana code. Licences for those not checked (not needed).

## Recommendation

Module decision: **depend** (test harness only). Everything else **reference-only** or **none**.

- Test harness: `depend` on LiteSVM (Apache-2.0, verified). Add as devDependency to `packages/solana-stealth` (pin exact version after `npm view litesvm version`; not run here). Target tests: `packages/solana-stealth/test/litesvm/*.test.ts`. API shape: load program `.so` into LiteSVM, send SOL and SPL transfers, assert announcer-free stealth derivation on-chain.
- Fee-payer relayer: `reference-only` on Kora (MIT per page, file unverified). Running a Rust Kora service is a second runtime; GhostPay relayer is TS. Borrow the signer-backend and validation design into `packages/relayer-guard` checks. Do not vendor. Re-check Kora LICENSE file before any copy.
- Octane: `reference-only` until the repo is fetchable and its LICENSE is read. Do not copy.
- Stealth announcer: `reference-only` on `emarkees/sdk` for ed25519 Solana derivation vectors. Compare against `packages/solana-stealth`; keep ours. No Solana announcer code to reuse exists in verified form. Any announcer program would be new work.
- `doomymike/solana-stealth`: `none` (no licence).

## Verification still needed (blocking copy decisions)

1. Octane: LICENSE file + SHA (fetch failed on all paths).
2. Kora: LICENSE file text (raw 404 on main and master).
3. SHAs and last-commit dates for all four (API 403; need `add_repo` read access or a working fetch).
4. Wraith: confirm default branch and that `chains/solana` source matches the LICENSE claim.

## Risks

- Supply chain: LiteSVM is a native Rust crate with bindings; pin exact versions and verify npm package provenance before `npm install`. Do not install in research phase.
- Abandonment: low-star repos (Wraith 0, doomymike 0, Metapass 1) could vanish. Do not depend on any of them.
- Licence traps: Kora licence is from a badge, not a file. Octane licence unknown. Wraith/doomymike forks may differ from upstream. Copyleft: none found among verified repos, but unverified ones are reference-only by default.
- Crypto: stealth derivation code is security-critical. Any ported ed25519 stealth code needs audit and must not replace `packages/solana-stealth` without vectors (`test-vectors/solana-stealth.json`).
- Fee-payer design: Octane and Kora both co-sign as fee payer. GhostPay must enforce its own fee-payer policy in `packages/relayer-guard`; do not rely on upstream defaults.
