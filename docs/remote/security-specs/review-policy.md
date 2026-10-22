# Security spec review: policy-guarded stealth account (scheme 0x47500002)

Scope: `docs/CONTRACTS_SPEC.md` section 4 (and section 5 where it covers scheme 2), `packages/policy-scheme/DEVIATIONS.md`, and `GhostPayPolicyRouter` docs (`packages/contracts/src/GhostPayPolicyRouter.sol`, `interfaces/IGhostPayPolicyRouter.sol`). Code read for contradiction checks: `PolicyAccount.sol`, `PolicyAccountFactory.sol`, `packages/policy-scheme/src/{router,policy,types,limits,derive}.ts`, `packages/policy-scheme/src/abi/policyRouter.ts`.

Date of review: 2026-10-21. Branch `claude/remote-extensions-1`. Local evidence only; no code was run.
External sources: none fetched. Standards named in the spec (ERC-5564, ERC-6538, EIP-712, EIP-1167, EIP-2612, CREATE2) are not re-checked here, so claims about them are UNVERIFIED.
Existing haiku audit reports in `docs/remote/audits/` were treated as unverified and not relied on. `docs/audits/02-security-review-contracts.md` is cited as a repo document, not as verified fact.

Severity: H = spec is false or unsafe as written; M = ambiguous, missing or untestable in a way that changes implementation; L = wording, stale or cross-reference.

## Verified OK (no finding)

- Commit `2058a57` exists (`git log`). Router ABI args in `packages/policy-scheme/src/router.ts` match `GhostPayPolicyRouter` signatures for all four methods.
- `SCHEME_ID = 0x47500002` (types.ts:10) matches `GhostPayPolicyRouter.sol:46`.
- `MIN_DELAY = 1h` and `MAX_DELAY = 30d` (types.ts:11-14) match `PolicyAccountFactory.sol:30,33`.
- Router fee `floor(gross*25/10000)` and gross bound `MAX_UINT256/25` (router.ts:13) match `GhostPayPolicyRouter.sol:262` and NatSpec at :33-34.
- Meta-address length in DEVIATIONS S1 (33+33+32 bytes = 196 hex digits) is arithmetically consistent.
- Policy-router invariant tests exist (`packages/contracts/test/GhostPayPolicyRouter.invariant.t.sol:248-290`), and `PolicyAccount*.t.sol` and `PolicyAccountFactory.t.sol` exist. Spec section 5 omits them (see F-12).
- Anvil vector order (implementation deployed before factory, `anvil.test.ts:127`) is consistent with DEVIATIONS S5 (`CREATE(deployer, 0/1)`). Not re-run.

## Findings

### F-01 H: "stolen key cannot redirect funds" is false under the code's own design
- Location: `docs/CONTRACTS_SPEC.md:63` (Goal); `:67` (destination change).
- Evidence: `PolicyAccount.proposeDestination` (`PolicyAccount.sol:238-263`) and `executeDestinationChange` (`:266-278`, callable by anyone) let a holder of the owner key redirect all future withdrawals after `2*delay`. The only defence is `cancelDestination` (`:281-290`), which needs the same owner key. A thief holding a copy of the key can propose, wait, and execute. `docs/adr/ADR-LOG.md:73` says a stolen key "can contest destination changes forever". `docs/threat-model/THREAT_MODEL.md:292` (D6) says "Do not market as theft-proof". The spec goal contradicts both.
- Failure scenario: key stolen at t0. Thief calls `proposeDestination(attacker)` at t0. At t0+2*delay anyone calls `executeDestinationChange`. Funds then go to the attacker. Only an owner who notices and cancels inside `2*delay` prevents this.
- Proposed text (replace line 63 goal sentence): "Goal: bound the loss from a stolen owner key. Funds can leave only to `destination`, or to a new destination after a `2 x delay` timelock that the owner can cancel while it holds the key. A stolen key with monitoring by the honest owner cannot redirect funds; a stolen key without monitoring can. No recovery path exists (ADR-0014)."

### F-02 H: privacy claim about `policyHash` is false; on-chain linkage is public
- Location: `docs/CONTRACTS_SPEC.md:65` ("does not reveal the destination"); `GhostPayPolicyRouter.sol:95,112` (`PolicyRef` in calldata); `PolicyAccountFactory.sol:93,101,143-149`; `PolicyAccount.sol:72-82` (public `owner`, `delay`, `destination`, `limitsRoot`, `policyHash`).
- Evidence:
  1. `deploy(owner, destination, delay, limitsRoot)` takes all values in plaintext calldata, so owner, destination and delay are public at deploy time, before any withdrawal.
  2. Public getters expose the same fields from storage at any time, so DEVIATIONS/ADR-LOG's "linked after first withdrawal" (ADR-LOG:73 D1) understates the exposure.
  3. Every scheme-2 payment carries `PolicyRef(owner, policyHash)` in calldata. `policyHash` is constant for a payee, so all payments to one meta-address are linkable by an observer who has the meta-address. This needs no viewing key.
  4. For `limitsRoot == 0`, `policyHash = keccak256(destination, delay, 0)`. An observer who has a candidate destination list (exchange deposit addresses, known EOAs) and a delay set can test offline.
- Proposed text (replace line 65 parenthesis): "The policy hash does not hide the destination against an observer who holds a candidate destination and delay: it is an unsalted keccak. It is also a stable per-payee identifier in router calldata. Scheme 2 is therefore NOT unlinkable across payments. Destination, delay, owner and limits root are public at `deploy` and in public storage. Scheme 2 must not be marketed as private."
- Also: either add a per-policy random salt into `policyHash` (requires factory/router change, out of scope for spec text), or record this as an accepted limitation in section 4 and in the threat model.

### F-03 H: pending withdrawals are not bound to a destination
- Location: `PolicyAccount.sol:54` (`WITHDRAW_TYPEHASH` has no destination field), `:140-187` (request), `:190-196,198` (execute reads current `destination`); `CONTRACTS_SPEC.md:67` (silent).
- Evidence: `requestWithdraw` signs `(token, amount, deadline, nonce, limitLeafHash)`. Destination is read at execution time. `executeWithdraw` has no expiry (only `Pending`/`executeAfter`). A destination change effective at `t1+2*delay` applies to requests made earlier that are still unexecuted.
- Failure scenario: owner requests withdrawal W to D1 at t0 and does not execute it. Thief (key holder) proposes D2 at t1 and waits to `t1+2*delay`, then executes the change. Anyone then executes W, and funds go to D2. The owner's signed intent was D1.
- Proposed text (add to section 4): "`Withdraw` MUST bind the destination in force at request time, `destination` in the typed data. `executeWithdraw` MUST revert if `destination` differs from the bound value. Alternatively, a request MUST NOT be executable once a destination change has become effective after it was requested. Both options must be covered by a test (see F-12)."
- Fix in code is out of scope for the spec review; flagged for the contracts owner.

### F-04 H: known open findings and missing limitations are absent from section 4
- Location: `CONTRACTS_SPEC.md:69` (limitations list); `PolicyAccountFactory.sol:105-115` (fee pulled before clone); `GhostPayPolicyRouter.sol:156,176` (value sent to undeployed addresses).
- Evidence: `docs/audits/02-security-review-contracts.md:22,43` records M-03: fee-token failure in `deploy` freezes funds already sent to not-yet-deployed accounts. The code is unchanged (`PolicyAccountFactory.sol:111` still reverts on a failing fee token). ADR-LOG:73 also lists "no guardian or recovery path, so a lost key locks funds". Section 4 lists none of these.
- Proposed text (add to limitations): "(a) Lost owner key: funds are locked (no recovery path). (b) Fee-token failure in `deploy` (M-03) can block deployment of an account that already holds funds; funds at a counterfactual address are at risk until deployed. (c) Destination is public at `deploy` and in storage (F-02). (d) Opt-in: wallets must not treat scheme 2 as default."

### F-05 H: meta-address and deployment manifest are an unspecified trust root
- Location: `CONTRACTS_SPEC.md:65` (policyHash "is part of" the meta-address); `packages/policy-scheme/DEVIATIONS.md:5-7` (S1: format not ratified; chain, factory and implementation absent; "payer takes them from the pinned deployment manifest"); `GhostPayPolicyRouter.sol:24-27` (router binds to factory, not to the payee).
- Evidence: the router accepts any `(owner, policyHash)` whose predicted address equals `stealth`. A payer that takes the router, factory or policyHash from an unauthenticated source can be sent to an attacker's policy with `destination = attacker`. The contract cannot detect this. Section 4 specifies neither meta-address format nor how it is authenticated, and does not require manifest integrity.
- Failure scenario: attacker substitutes the meta-address (malicious directory, altered QR) with `policyHash = H(attacker, delay, 0)`. The payer's router check passes because `stealth = FACTORY.predictAddress(owner, H)` holds. Funds reach an account whose only destination is the attacker. This is a valid policy account, so no on-chain check fails.
- Proposed text (add to section 4): "The scheme-2 meta-address format is normative and is defined here or in a ratified document (DEVIATIONS S1 is not sufficient). A payer MUST obtain the meta-address over an authenticated channel bound to the payee's keys, MUST take router, factory and implementation addresses from a signed deployment manifest, and MUST verify `destination`, `delay` and `limitsRoot` against the payee's signed policy before paying. The router guarantees only the factory-address binding; it does not guarantee payee identity."

### F-06 M: GhostPayPolicyRouter has no normative spec in section 4
- Location: `CONTRACTS_SPEC.md:10` (only `GhostPayRouter` constructor); `GhostPayPolicyRouter.sol:80` (3-arg constructor with `factory`); `IGhostPayPolicyRouter.sol:63-67` (`FactoryHasNoCode`, `NotPolicyAccount`); `GhostPayPolicyRouter.sol:129-130` (permit owner = `msg.sender`).
- Evidence: the router's entry points, `SCHEME_ID`, `NATIVE`, `FACTORY`, the constructor's factory argument, the two extra errors, and the permit owner rule are not in section 4. Section 4 says only "scheme id `0x47500002`". The router NatSpec says it is "CONTRACTS_SPEC section 4", which does not define it.
- Proposed text: add subsection "4.1 `GhostPayPolicyRouter`" listing the constructor `(IERC5564Announcer announcer, address feeRecipient, PolicyAccountFactory factory)`, `PolicyRef`, the rule `stealth == FACTORY.predictAddress(owner, policyHash)`, the error list with `FactoryHasNoCode` and `NotPolicyAccount(expected)`, and that the permit owner is `msg.sender` (the payer), not `policy.owner`.

### F-07 M: `deploy` is described as checking `policyHash`; it derives it
- Location: `CONTRACTS_SPEC.md:66` ("`deploy(...)` checks `policyHash`").
- Evidence: `PolicyAccountFactory.sol:101` computes `policyHashOf(destination, delay, limitsRoot)` and never compares it to any supplied value. There is no supplied `policyHash` argument.
- Proposed text: "`deploy(owner, destination, delay, limitsRoot)` derives `policyHash` with `policyHashOf`, computes the CREATE2 salt, reverts with `AlreadyDeployed` if code exists, pulls `flatFee`, clones, and calls `initialize`."

### F-08 M: delay bounds are absent from section 4 and differ by layer
- Location: `CONTRACTS_SPEC.md:66-67` (no bounds); `PolicyAccountFactory.sol:30,33,99-100` (`MIN_DELAY = 1h`, `MAX_DELAY = 30d`); `PolicyAccount.sol:122` (accepts `1 s .. 30 d`).
- Evidence: the reaction window for F-01 is `2*delay`. With the factory minimum it is 2 h; with the account minimum it is 2 s. Section 4 does not say which applies to accounts reachable through the router. A clone created outside the factory is not bound by the factory minimum (see F-13).
- Proposed text: "Valid `delay` for factory-deployed accounts is `[1 h, 30 d]`. Accounts with `delay < 1 h` are not GhostPay scheme-2 accounts and MUST NOT be paid. The owner's reaction window is `2*delay >= 2 h`."

### F-09 M: "rolling window" is wrong; the cap is absent when the root is zero; leaf and proof encoding are not specified
- Location: `CONTRACTS_SPEC.md:67` ("per-token cap per rolling window"; `requestWithdraw(token, amount, deadline, nonce, limitLeafHash, sig)`); `PolicyAccount.sol:34-42` (two fixed buckets, conservative up to two windows); `:140` (real signature has `Withdraw`, `LimitProof`, `sig`); `:155-171` (no cap when `limitsRoot == 0`); `:196` and `:341-360` (cap booked at execution, not request); `:158-159` (leaf formula); `:345` (`WindowMismatch`).
- Evidence: the spec's signature omits `LimitProof {limit, windowSeconds, proof}`. The NatSpec at `PolicyAccount.sol:16-19` says "within a per-token rolling-window cap" without the zero-root exception. The leaf formula `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))` is not in the spec. Cap is enforced at execution, not at request. A second leaf of the same token with a different window reverts with `WindowMismatch` (not documented).
- Proposed text: replace the rolling-window phrase with "per-token cap enforced with two fixed buckets of `windowSeconds`: `previous + current <= limit` at every booking. No cap applies when `limitsRoot == 0`. Leaf: `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`. Caps are checked at `executeWithdraw`, so a request above remaining capacity stays Pending and can be executed later. Each token MUST appear at most once in a tree (enforced by the builder, not by the contract)." Also give the exact `requestWithdraw` signature.

### F-10 M: untestable or underspecified derivation
- Location: `CONTRACTS_SPEC.md:63` ("reuses scheme-1 maths to obtain `A_owner`"); `:68` ("same ephemeral key/view tag derivation as scheme 1"); `packages/policy-scheme/DEVIATIONS.md:8-10` (S2: scanner re-implements the view-side step).
- Evidence: the formula for `A_owner` (which point, which hash input) is not in this document. Section 5 requires no differential test for the scanner's local re-implementation, which DEVIATIONS S2 says exists. Scheme-1 derivation is not in this file, so the reference is not testable here.
- Proposed text: write the formula inline (`h = keccak256(S)`, `P_owner = P_spend + h*G`, `A_owner = address(P_owner)`, `S = v*R` with `v` the view key, `R` the ephemeral point), state the scheme-1 document it inherits from, and add to section 5: "scanner local derivation is differentially tested against core-crypto `checkAnnouncement` and against published vectors for `A_owner` and `A_acct`."

### F-11 M: native-asset identifier contradicts across the router and the account
- Location: `GhostPayPolicyRouter.sol:49,148` (native metadata and `FeeCollected` use `0xEeee...`); `PolicyAccount.sol:199` (`token == address(0)` means native); `packages/policy-scheme/src/limits.ts:7,130` (zero address = native); `CONTRACTS_SPEC.md:29` (`0xEeee` in metadata); section 4 silent.
- Evidence: a wallet that announces native payments with `0xEeee` and derives native limit leaves with `address(0)` cannot match a native withdrawal in `requestWithdraw` without a mapping rule. Nothing in section 4 defines it.
- Proposed text: "Native asset in announcement metadata is `0xEeee...`. Native asset in `Withdraw.token`, limit leaves and `Request.token` is `address(0)`. A limit leaf for native MUST use `address(0)`, and a metadata native payment MUST NOT be assumed to match a leaf without this mapping."

### F-12 M: section 5 omits all scheme-2 tests and the invariants they need
- Location: `CONTRACTS_SPEC.md:71-73`; existing tests `packages/contracts/test/PolicyAccount.t.sol`, `PolicyAccount.invariant.t.sol`, `PolicyAccountFactory.t.sol`, `GhostPayPolicyRouter.invariant.t.sol:248-290`.
- Evidence: section 5 lists only scheme-1 invariants. Nothing requires: destination-only outflow for `PolicyAccount`, single use of `Request.id` and nonces, `2*delay` timing of `executeDestinationChange`, that router payments go only to factory-predicted addresses, that a clone not created by the factory cannot be used for the router, and the F-03 binding. Mock tokens listed (line 73) omit a native-receiving account and an undeployed-account funding case.
- Proposed text: add to section 5: "Scheme 2 invariants: (i) outflows only to `destination`; (ii) `executeDestinationChange` cannot apply before `2*delay`; (iii) each nonce and request id is single-use; (iv) for every router payment `stealth == predictAddress`; (v) a withdrawal request cannot execute to a destination other than the one bound at request time (F-03). Include an undeployed-account test (fund, then deploy, then withdraw)."

### F-13 M: `PolicyAccount.initialize` is not gated by the factory
- Location: `PolicyAccount.sol:21-24` (NatSpec: "only the deployer that derived this very address"); `:125` (`Clones.predictDeterministicAddress(_IMPLEMENTATION, salt, msg.sender)`).
- Evidence: the check uses `msg.sender`, so any party that creates a clone of the implementation and calls `initialize` from its own address can set arbitrary `owner`, `destination` and `delay = 1 s` at its own address. The factory is not a required authority. Safety for the router depends on the factory-predicted check (`GhostPayPolicyRouter.sol:240`), and on the scanner doing the same. Section 4 does not state this dependency.
- Proposed text: add: "A `PolicyAccount` clone not created by `PolicyAccountFactory` is not a GhostPay account. Payers and scanners MUST accept an account only if its address equals `PolicyAccountFactory.predictAddress(owner, policyHash)` for the pinned factory."

### F-14 M: liveness and griefing vectors are missing
- Location: `PolicyAccount.sol:249` (`ProposalPending` blocks new proposals until cancel); `:228-235` (cancel any time while `Pending`, no delay bound); `:341-360` (cap booked at execution); `:209` (native transfer to reverting destination reverts execution).
- Evidence: a holder of the stolen key can (a) keep proposals pending or re-propose after each cancel, (b) use the window cap to delay owner withdrawals, (c) rely on a destination that reverts for native to block native withdrawals. Section 4 is silent on all three.
- Proposed text: add a "Liveness" paragraph listing these, plus "cancel is permitted at any time before execution (no deadline on cancel)" and "a native withdrawal to a reverting destination keeps the request Pending; it is retried after destination change."

### F-15 L: stale or self-referential claims
- Location: `CONTRACTS_SPEC.md:61` ("built after the core audit"); `docs/adr/ADR-LOG.md:73` (router "hard-codes scheme id 1 so nothing announces scheme 0x47500002"); `GhostPayPolicyRouter.sol:19` (cites "CONTRACTS_SPEC section 4, audit 02 finding M-02", which section 4 does not mention).
- Evidence: `GhostPayPolicyRouter.sol:46,105` now announces `0x47500002`, per commit `2058a57`. ADR-LOG:73 describes the state before that commit.
- Proposed text: replace "built after the core audit" with "status: experimental, see ADR-0014". Update ADR-LOG:73 to "resolved by `2058a57`; M-03 and key-loss remain open". Add to section 4: "M-02 resolved by `GhostPayPolicyRouter`; M-03 open (F-04)."

### F-16 L: undefined identifiers and terms
- Location: `packages/policy-scheme/DEVIATIONS.md:12` ("P1", "P8"); `packages/policy-scheme/src/limits.ts:98`, `calldata.ts:28` (same IDs); `CONTRACTS_SPEC.md:66,69` ("F-SECURE"); `:55` and `:38` ("F-SPONSOR", "Feature-1" in section 2/3, referenced here); `:3` ("no owner").
- Evidence: P1 and P8 are not defined in any file read. "No owner" in line 3 conflicts in wording with `PolicyAccount.owner` (`PolicyAccount.sol:72`), which is the stealth signer, not an administrator.
- Proposed text: define P1 and P8 inline or link the list; in line 3 write "no admin, no upgrade authority" instead of "no owner"; define F-SECURE.

### F-17 L: off-chain strictness is presented as a guarantee
- Location: `packages/policy-scheme/DEVIATIONS.md:11-13` (S3: "stricter than the contract").
- Evidence: the tree builder, `encodeDeployAccount` and `buildWithdrawTypedData` checks are off-chain. A caller that bypasses them loses no on-chain protection; the contract accepts what the builder refuses (e.g. `owner == destination`, `PolicyAccount.sol:119-121` does not reject it).
- Proposed text: "Off-chain validators are UX checks, not a security boundary. The on-chain contract is authoritative. Any input the builder refuses and the contract accepts is still a valid account and MUST be treated as such by scanners."

### F-18 L: section 4 is silent on the bound on cancel and on request expiry
- Location: `CONTRACTS_SPEC.md:67` ("`cancel(id, sig)` by owner"); `PolicyAccount.sol:228-235`, `:190-196`.
- Evidence: cancel has no deadline and works after `executeAfter`. Requests have no expiry. Spec does not say so.
- Proposed text: state both, and state that F-03 depends on this.

## Summary counts

- H: 5 (F-01 to F-05)
- M: 9 (F-06 to F-14)
- L: 4 (F-15 to F-18)
- Total: 18

## Open questions for the spec owner

1. Is destination binding (F-03) to be fixed in contracts, or is the window-based mitigation accepted in writing?
2. Is per-payee linkability via `policyHash` (F-02) acceptable for scheme 2, or does it block the scheme?
3. Who pays the flat fee for a router payment to an undeployed account (router path does not deploy)?
