# 17 Feature 3 GhostMilestones escrow (design brief)

Priority P4 (separate product scope) | Effort XL | Owner: contracts + web | Deps: separate ADR for custody, external audit, legal review, 09, 04
Sources: Roadmap Feature 3 (3A/3B), not built.

## 1. Design brief
Per-stage minimal escrow clones with state machine `Created -> Funded -> WorkSubmitted -> Released | Refunded | Disputed -> Resolved`. EIP-712 `StageAction(chainId, escrow, stageNonce, action, amount, destination, deadline, stateHash)` signed by buyer/seller; nonce consumed on transition; time-lock release only after dispute window; no admin, no delegatecall, SafeERC20, token allowlist, nonReentrant. Dispute resolution: mutual signature or pre-agreed arbiter address fixed at creation (committed in stage terms, arbiter can only choose release or refund). Manifest: Roadmap `MilestoneManifest`, encrypted with AES-256-GCM (as spec 08 formats), bearer-link warning, mandatory backup test before first deposit. No shared project id/salt on-chain; independent stealth meta context per stage.
## 2. Threats / tests
Per Roadmap 3B: replay across stage/chain, reentrancy, stuck funds from token controls, correlation via factory/timing, RPC desync (chain authoritative). Tests: exhaustive transition table, fuzz, invariants (funds only to buyer or seller destination; escrow balance == funded - paid), reorg scenarios.
## 3. Gate
Do not start before 01-09 done and a custody/legal decision; deliver a formal state enumeration and separate audit before enabling funds.
