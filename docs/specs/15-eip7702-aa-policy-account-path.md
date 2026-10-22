# 15 EIP-7702 / ERC-4337 / ERC-7579 policy-account path

Priority P3 (decision + ADRs now, build only after 16) | Effort S for ADRs (2 d), L-XL for any build | Owner: contracts design + docs | Deps: 16, ADR-0014 gate, external audit
Sources: research s2, s4, DOC-8, DOC-15..DOC-17; CONTRACTS_SPEC s4; ADR-0009, ADR-0014. Statuses from the research (retrieved 2026-10-21): 4337 Final, 7702 Final, 7579 Draft; ERC-7562 rules and bundler behaviour **UNVERIFIED**.

## 1. Decisions to record (ADR-0017..0019)
ADR-0017: PolicyAccount is **not** ERC-4337/7579. Rationale: no generic `execute`/delegatecall (CS preamble); signature-based `requestWithdraw` is already relayable by anyone without bundler/paymaster/EntryPoint trust; 7579 risks (delegatecall, hooks, uninstall griefing, self-call bypass) are features the account excludes. Revisit trigger: 7579 leaves Draft with a completed security section, or wallet interop demand with data.
ADR-0018: 7702 vs clone-per-stealth. Decision (proposed): keep clone design for policy enforcement. A 7702-delegated stealth EOA lets a key thief re-delegate (new authorisation) and bypass policy; chain-id-0 authorisations replay across chains; delegates can be called by anyone mid-tx; storage collisions on re-delegation.
ADR-0019: 7702 **convenience** sweep path (optional, separate from policy): stealth key signs an authorisation delegating to a fixed audited `SweepDelegate` for a single-tx batch (permit/approve + transfer to destination + fee) with the owner paying no gas via a sponsor.
## 2. Interface sketch for ADR-0019 (design only)
```solidity
contract SweepDelegate {            // no storage; ERC-7201 namespaced if any is ever added
  function sweep(address token, address destination, uint256 amount, address feeTo, uint256 fee, bytes calldata ownerSig) external; // ownerSig = EIP-712 over (this-chain, authority address, params, nonce); verify via ecrecover == address(this) (authenticated init per EIP-7702 guidance)
}
```
Rules: authorisation `chainId` must be nonzero and equal current (client refuses chain-id-0; UI never signs it); delegate immutable and address pinned in manifest; no `tx.origin`; after sweep, UI offers to **clear delegation** (authorise to zero address) to shrink attack surface; sponsor quote prices owner-front-run risk (simulation + grief reserve, spec 04/07); nonce bitmap as in SweepRelayer. Privacy: sponsor/bundler sees stealth address (linkage point; DOC-17) so same caveat as relayer; if a 4337 path ever added, document paymaster linkage and note paymasters need staking/reputation (stake not slashed per ERC text; 7562 details UNVERIFIED).
## 3. Threats
Key thief re-delegates (policy not provided by this path; stated); delegate bug = near-total control (minimal code, audit); replay across chains (nonzero chainId + EIP-712 domain); relayer reimbursement loss (spec 04); `msg.sender==tx.origin` assumptions anywhere (CI grep); transient storage cleanup if ever used.
## 4. Tests (if built)
Foundry with `vm.signDelegation`/`attachDelegation` cheatcodes (availability in pinned Foundry 1.8.5 **UNVERIFIED**); fuzz authorisation params; invariant: delegate holds no funds; chain-id-0 rejection; re-delegation test showing policy NOT enforced.
## 5. Acceptance
- [ ] ADR-0017/18 merged (docs only). - [ ] ADR-0019 only after a funded decision. - [ ] No build before 16 and audit.
