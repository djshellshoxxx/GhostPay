# Reuse research: milestone-escrow

Scope: read-only. No clones, no installs, no code copied. Verified = fetched in this session. Unverified = stated as such.
Repo HEAD check: GhostPay HEAD d699e4d. Existing milestone code in repo: none found in *.sol (grep "milestone" hits only docs).
GitHub REST API and `gh` returned 403 for all repos in this session ("not enabled for this session"). SHAs below come from github.com commit pages (fetched), not the API.

## Candidate table

| # | Repo | Licence (verified source) | SHA | Last commit | Stars | Maintained | Reuse-worthy | Deps |
|---|------|---------------------------|-----|-------------|-------|------------|--------------|------|
| 1 | https://github.com/OpenZeppelin/openzeppelin-contracts | MIT. LICENSE (https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/LICENSE): "The MIT License (MIT) Copyright (c) 2016-2026 Zeppelin Group Ltd" | master head 048b0eb7931dec8c519056f8d89b95e18d5c3a8c (Oct 21 2026) | 2026-10-21 | not fetched | yes, active | Access control (`access/`), `ReentrancyGuard`, `Pausable`, `SafeERC20` (`token/ERC20/utils/`), `Nonces`. No escrow/finance folder on master `contracts/utils/` (checked). | none (self-contained Solidity) |
| 2 | https://github.com/kleros/kleros-v2 | MIT. LICENSE (https://raw.githubusercontent.com/kleros/kleros-v2/dev/LICENSE): "MIT License, Copyright (c) 2021 Kleros" | dev HEAD not captured (page shows commit history only) | not captured | 82 | active (5,159 commits) | Arbitration protocol. Only relevant if disputes are added (arbitrable interface). No milestone code seen. | large monorepo (yarn, hardhat) |
| 3 | https://github.com/kleros/escrow-v2 | Not verified. No LICENSE on dev (raw 404), no licence shown on page. | dev HEAD not captured | not captured | 4 | unknown | Kleros Escrow v2 monorepo. Contracts folder has hardhat/foundry config and `src/`, `test/`, `deploy/`; **word "milestone" absent** from page. Possibly Kleros-arbitrated escrow, unverified. | hardhat, wagmi, subgraph |
| 4 | https://github.com/sablier-labs/v2-core | BUSL-1.1 primary (LICENSE-BUSL.md); GPL-3.0-or-later for interfaces/types and some src. Verified via raw LICENSE.md fetch. Note: fetched via /main/LICENSE.md, 200 OK. | not captured | not captured | not captured | yes (Sablier) | Streaming (linear/cliff) = vesting-style payment release, a conceptual match for milestone tranches. Not copyable. | Solidity, ERC-721 |

Reference-only (not in table, licence/data unverified): Fhenix Escrow (hackathon, repo URL not found in search), BuildLink (Chainlink hackathon, no repo URL), LexLocker (lexDAO; raw LICENSE and repo page both 404, licence unverified), Trustless Work (Soroban/Rust, not Solidity). Cyfrin/2024-05-Sablier is an audit report, not code to reuse.

## Licence traps
- Sablier v2-core: BUSL-1.1 has a use restriction and change date. Do not copy. GPL-3.0 files in the same tree are copyleft and also reference-only.
- OZ: MIT, safe to copy with notice retained.
- kleros-v2: MIT for the repo root LICENSE; subfolders may differ. Check per-file SPDX before copying.
- kleros/escrow-v2: no licence found. Treat as all-rights-reserved until confirmed.
- Hackathon repos (Fhenix, BuildLink): no licence, do not copy.

## Recommendation
Decision: **adapt** (OZ primitives) + **reference-only** for everything else. Not a `depend` (no escrow package on OZ master; adding Kleros or Sablier deps brings BUSL/GPL or unverified licences).

Concrete plan:
- Target path: `packages/milestone-escrow/` (new package, Foundry, mirrors `packages/contracts` layout). Not in `packages/contracts` to keep the audit scope small.
- Use OZ (MIT) as dependency via `remappings.txt`: `@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/`, pinned to a tag (not master). Pin the tag at install time, verified by commit SHA.
- API shape (proposed, not existing):
  - `createEscrow(address payer, address payee, IERC20 token, uint256[] milestoneAmounts) -> uint256 id`
  - `fund(uint256 id)` (payer, ERC-20 `safeTransferFrom`)
  - `submitMilestone(uint256 id, uint256 idx, bytes32 evidenceHash)` (payee)
  - `approveMilestone(uint256 id, uint256 idx)` (payer) then `release(uint256 id, uint256 idx)` (nonReentrant, SafeERC20)
  - `dispute(uint256 id, uint256 idx)` hook left as interface only; no Kleros import.
- Security: `ReentrancyGuard`, `Pausable` (admin only), checks-effects-interactions, milestone states in enum, no native ETH path.
- Tests: Foundry unit tests for each state transition, fuzz on amount sums (sum must equal funded), reentrancy test with malicious ERC-20 mock, invariant "released + remaining == funded". Add to `packages/contracts/echidna.yaml`-style fuzzing later.
- Do not copy Sablier code. If streaming is wanted later, design it independently from the public interface description, not from Sablier source.

## Risks
- Supply chain: OZ dep pinned to tag; verify tag signature. Kleros and Sablier not added as deps.
- Abandonment: kleros/escrow-v2 has 4 stars and unclear maintenance. OZ is well maintained.
- Licence: see traps above. BUSL/GPL must not be copied into a permissive package.
- Verification gap: GitHub API blocked for this session, so SHAs and dates for kleros-v2 and sablier are unverified; add_repo or `gh` access would close that gap.
- Unverified: OZ Escrow.sol (old `finance/Escrow.sol` path) not found on master, so it may be removed or moved; do not assume it exists.
