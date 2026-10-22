# 16 Policy-account recovery / guardian design

Priority P3 | Effort L (design 5 d, build + audit weeks) | Owner: contracts design | Deps: ADR-0014 gate, 15
Sources: research DOC-18; ADR-0014 (no recovery, M-02, M-03, D1, D6); CONTRACTS_SPEC s4; DEV ("key theft delayed, not prevented").

## 1. Requirements
Lost owner key must not lock funds forever; stolen owner key must remain contestable; no admin (ADR-0006). Candidate designs to evaluate in an ADR (no commitment):
A. **Guardian set committed in `policyHash`**: `policyHash = keccak256(destination, delay, limitsRoot, guardiansRoot, threshold)`; guardians (EOAs or contracts via ERC-1271) can `cancel` pending withdrawals and `proposeDestination` only with owner OR guardian-threshold + `2*delay` timelock; cannot withdraw to themselves (destination fixed unless timelocked change). Changes meta-address format (new scheme version, new vectors).
B. **Dead-man recovery**: destination key itself may trigger `recover(newOwner)` after long inactivity `T_rec` (>= 30 d), cancellable by owner signature; withdraw destination unchanged.
C. **7579-style module** - out (spec 15 ADR-0017).
Evaluation criteria: preserves "no admin", bounded griefing (guardian cannot freeze funds indefinitely: cancellations rate-limited or expire), privacy (guardian addresses hidden until used, committed by root), cost, UX (setup burden).
## 2. Required outputs
Threat model (collusion thresholds, guardian key loss, griefing by cancel loops), state machine diagram, EIP-712 types, scanner changes, test plan (fuzz: guardian cannot redirect; invariant: only destination receives funds), upgraded `docs/user` copy. Also fix M-03 (factory fee-token freeze) by pull-based fee or fee-token fallback in same revision.
## 3. Acceptance
- [ ] ADR choosing A, B or neither. - [ ] If building: CONTRACTS_SPEC s4 edited first, then code, tests, external audit before any enablement.
