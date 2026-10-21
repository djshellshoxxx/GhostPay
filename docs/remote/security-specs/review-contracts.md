# Review: CONTRACTS_SPEC.md + DEVIATIONS.md vs packages/contracts/src

Date: 2026-10-21. Branch: claude/remote-extensions-1. Read-only review; no repo file edited.
Scope: docs/CONTRACTS_SPEC.md (CS), packages/contracts/DEVIATIONS.md (DV), packages/contracts/README.md (RM), docs/FEE_SCHEDULE.md (FS), vs src/*.sol and src/interfaces/*.sol.
Haiku audit reports in docs/remote/audits/ treated as unverified; not relied on.

Counts: HIGH 2, MEDIUM 9, LOW 14. Total 25.

## Findings

### F1 HIGH. Scheme-2 router missing from spec; DV and RM claim it does not exist
- Location: CS:61-70 (section 4 has no router); DV:140-141 ("existing router can announce for A_acct unchanged"); RM "Audit follow-ups" M-02 ("router announces scheme id 1 only ... until a router variant exists").
- Evidence: GhostPayRouter.sol:38 `SCHEME_ID = 1` hardcoded, used at :80,:106,:128,:146. Announcing A_acct through it emits scheme 1, contrary to CS:68 `schemeId = 0x47500002`. GhostPayPolicyRouter.sol:46 `SCHEME_ID = 0x47500002`, :80-90 constructor, :240-241 `NotPolicyAccount` binding. DV:171-202 (R1-R9) describes it; spec does not.
- Failure: integrator uses scheme-1 router for policy account payments; scanner for scheme 2 never sees the announcement; funds sit at A_acct unannounced.
- Fix: add CS section 4.x "GhostPayPolicyRouter (scheme 0x47500002)": constructor `(IERC5564Announcer, address feeRecipient, PolicyAccountFactory factory)`, `PolicyRef{owner, policyHash}` requirement `stealth == FACTORY.predictAddress(owner, policyHash)`, `NotPolicyAccount(expected)`, `FactoryHasNoCode`, check order (policy binding first). Replace DV:140-141 with "Scheme-1 router cannot announce scheme 0x47500002; use GhostPayPolicyRouter." Update RM M-02 to reflect the router exists.

### F2 HIGH. Spec signatures and window model contradict code
- Location: CS:67 (`requestWithdraw(token, amount, deadline, nonce, limitLeafHash, sig)`; "per-token cap per rolling window").
- Evidence: IPolicyAccount.sol:27-33 and :150 `requestWithdraw(Withdraw w, LimitProof lp, bytes sig) returns (bytes32 id)`; PolicyAccount.sol:140. Window is two fixed buckets, not rolling: PolicyAccount.sol:342-360; DV P2 admits "conservative" behaviour.
- Failure: client built from spec ABI calls non-existent selector; implementers read "rolling" and build a sliding log with different cap timing.
- Fix: CS:67 state the struct/`LimitProof` signature and "two fixed buckets of windowSeconds, accounted at executeWithdraw; current+previous bucket <= limit". Remove "rolling".

### F3 MEDIUM. Limits merkle scheme is normative only in DV
- Location: CS:63-65 (`perTokenLimitsRoot` undefined).
- Evidence: leaf `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))` PolicyAccount.sol:158-159; sorted-pair OZ `MerkleProof` :162; `limitsRoot==0` = no limits :157; `limit==max` = unlimited, window ignored :167-170; `token==0` native. Only DV P1 and PolicyAccount.sol:34-42 define these.
- Failure: two clients produce different roots/leaves; policyHash mismatch means funds sent to a different counterfactual account.
- Fix: normative paragraph in CS section 4 with leaf formula, hash, sorting, native sentinel, unlimited sentinel, and test vector requirement.

### F4 MEDIUM. Ephemeral key rule is format-only; spec says "compressed point"
- Location: CS:5 ("33-byte compressed point, first byte 0x02 or 0x03"); GhostPayRouter.sol:220-223 (length and prefix only); GhostPayPolicyRouter.sol:266-269.
- Evidence: no curve check. ERC-5564 (fetched 2026-10-21, https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-5564.md) types `ephemeralPubKey` as `bytes` with no encoding specified.
- Failure: payer sends off-curve or wrong-key bytes; recipient scanner cannot derive the stealth key; funds stuck with no on-chain recourse. Threat not listed in spec.
- Fix: state the on-chain check is format-only; payer client must validate the key; add a threat row and a test requirement (client-side vectors). Consider a documented residual-risk statement.

### F5 MEDIUM. Announcer trust: spec says canonical, constructor accepts any
- Location: CS:3 ("Standard ERC-5564 announcer ... used as deployed"); GhostPayRouter.sol:62-63; GhostPayPolicyRouter.sol:80-84.
- Evidence: only `address(announcer) != 0` checked; no code check, no codehash. Deploy-time pinning exists only in scripts (DV A4).
- Failure: wrong announcer deployed, every payment emits announcements nobody scans; or a malicious announcer receives calldata with payer metadata.
- Fix: CS to say the contract trusts its constructor argument; the canonical address and codehash pin are a deployment requirement (cite Deploy script rule). Test requirement: deploy script rejects non-canonical announcer without ALLOW_CUSTOM_ANNOUNCER.

### F6 MEDIUM. Scheme id 0x47500002 has no declaration per ERC-5564
- Location: CS:61, CS:68; GhostPayPolicyRouter.sol:44-46; PolicyAccount.sol:16.
- Evidence: ERC-5564 (fetched 2026-10-21, same URL as F4) states each proposing ERC "MUST declare the mapping from the schemeId to its specification"; no central registry; ids may be arbitrary.
- Failure: scanners from other ERC-5564 users decode scheme 0x47500002 differently or collide later.
- Fix: CS to declare the scheme specification in-spec (the derivation, `policyHash`, what the scanner computes), and to state it is a private scheme id, not an ERC-5564 registered one. Name the scheme-2 derivation vectors (see F19).

### F7 MEDIUM. Delay range differs between factory and account, spec silent
- Location: CS:66 (`deploy(owner, destination, delay, limitsRoot)`, no range).
- Evidence: PolicyAccountFactory.sol:31 `MIN_DELAY = 1 hours`, :99-100 `InvalidDelay` / `DelayTooShort`; PolicyAccount.sol:122 accepts `1 .. MAX_DELAY`. DV A3 documents, CS not updated. DV P8 and A3 say foreign deployers may use shorter delays.
- Failure: clients assume 1 s delays are valid on official factory; or assume 1 h minimum applies to all accounts (it does not).
- Fix: CS section 4 to state: factory accepts `[1 hour, 30 days]`; account accepts `[1 s, 30 days]`; only official factory accounts are guaranteed to meet the minimum.

### F8 MEDIUM. Unenforceable MUST: "Trees MUST contain each token once"
- Location: DV P1 (lines 71-74); PolicyAccount.sol:41-42 "should still contain each token at most once".
- Evidence: duplicate leaves cannot be rejected on chain (merkle proof checks membership only). Under A2 the owner signs the leaf, so key holder picks the permissive one; with `limit==max` the window is never consumed (PolicyAccount.sol:196).
- Failure: a permissive duplicate leaf bypasses the cap entirely. Requirement is untestable on-chain.
- Fix: CS to state it as a client/policy-author requirement with a verifiable check (client builds tree, asserts uniqueness before publishing `policyHash`). Mark as untestable on-chain.

### F9 MEDIUM. Payer-chosen stealth address not bound to announcement (scheme 1) and threat not in spec
- Location: CS:14-33 (no threat text on stealth correctness); GhostPayRouter.sol:212 (only `!= 0/this/FEE_RECIPIENT`); RM "Known limitations" (direct payment; router cannot verify stealth derivation).
- Evidence: the router cannot verify stealth derives from ephemeral key and meta-address. Funds to a wrong address are unrecoverable (RM: no rescue).
- Failure: client bug or malicious payer routes funds to an address nobody controls; no on-chain detection.
- Fix: add CS threat row "stealth correctness is off-chain; misrouted funds are unrecoverable"; add test requirement that the client derivation matches a vector set.

### F10 MEDIUM. Owner and destination validation gaps in PolicyAccount, spec silent
- Location: CS:63-67 ("owner" is "stealth EOA"); PolicyAccount.sol:119 (`owner_` only checked for zero); DV P8 (owner == destination allowed).
- Evidence: owner is only verified via ECDSA (EOA-style). A contract `owner_` cannot produce a valid ECDSA signature, so its account is permanently locked. `owner == destination` is allowed (P8).
- Failure: a deployment with a contract owner locks funds; owner==destination silently defeats the policy.
- Fix: CS to say `owner` must be an EOA controlled by the signing key (validated off-chain); state `owner == destination` is permitted and is a client-side reject.

### F11 MEDIUM. Normative spec text in section 1 contradicts code and DV
- Location: CS:27 ("`net > 0`" check); CS:24 (FeeCollected); CS:32 (native fee "both must succeed", ERC-20 fee "skipped if fee == 0" only); CS:18 and CS:31 (bare permit call).
- Evidence: net>0 is dead code, GhostPayRouter.sol:217-218 (DV 3). FeeCollected and native fee call skipped when fee==0: GhostPayRouter.sol:121, :184 (DV 2). Permit inside try/catch: GhostPayRouter.sol:102-104 (DV 1).
- Failure: auditor tests the normative spec literally and flags "missing native fee call" or "missing net>0 revert" as bugs; indexers assume one FeeCollected per payment.
- Fix: amend CS section 1 to match DV 1, 2, 3, or mark DV as the normative override in CS.

### F12 LOW. Stale DV: stipend question resolved in FS
- Location: DV:47-49.
- Evidence: docs/FEE_SCHEDULE.md:27 correction (2026-10-21): implementation forwards all gas, no stipend, deliberate for Safe compatibility. DV says the stipend question is open.
- Fix: DV:47-49 replace with "Resolved: FS:27 correction; plain call, all gas."

### F13 LOW. Stale DV: solc path
- Location: DV:39 says `solc = "/home/user/tools/solc"`.
- Evidence: packages/contracts/foundry.toml:8 `solc = "/tmp/claude-0/tools/solc/solc"`.
- Fix: DV:39 match foundry.toml or state the sandbox path is environment-specific.

### F14 LOW. Privacy threat missing
- Location: CS (no privacy section); GhostPayRouter.sol:226-236 (net amount and token in plaintext metadata); :125,:188 (FeeCollected reveals fee, hence gross ~ fee*400).
- Evidence: RM "Metadata amount is public by design" (not in spec).
- Fix: add CS threat row: amount, token and gross-band are public; not a confidentiality property.

### F15 LOW. Sweep allowance spender unnamed
- Location: CS:47 ("allowance already granted").
- Evidence: GhostPaySweepRelayer.sol:130-133 `safeTransferFrom` with msg.sender = relayer; allowance must name the relayer address.
- Fix: CS:47 "allowance granted to the relayer address (`address(this)`)".

### F16 LOW. Sweep nonce namespace and owner==destination reverts not in spec
- Location: CS:48, CS:53.
- Evidence: nonce bitmap is per owner across all tokens (GhostPaySweepRelayer.sol:111-114). owner==destination or feeTo reverts `UnexpectedBalanceDelta` (DV 9, GhostPaySweepRelayer.sol:139-143).
- Fix: CS:48 state nonce space is per owner, shared across tokens; CS:53 list the self-address reverts.

### F17 LOW. Sweep PermitSig.deadline unsigned, spec silent
- Location: CS:43, CS:53; DV:56-57.
- Evidence: GhostPaySweepRelayer.sol:46-58; permit deadline not in Sweep digest (:94-108).
- Fix: CS state the permit deadline is not covered by the sweep signature; failure is swallowed by try/catch.

### F18 LOW. Fund-lock cases only in RM and DV
- Location: CS:72-80 test list has no lock-in tests; PolicyAccount.sol:157-164 (no-leaf token lock); :214-220 (fee-on-transfer/rebasing tokens cannot be withdrawn).
- Evidence: RM L-05 documents, CS silent.
- Fix: CS section 4 "Accepted lock-in" paragraph; add test requirement: token without leaf under non-zero root is not withdrawable.

### F19 LOW. Untestable or dangling spec items
- CS:3 "the resulting address verified before use" (by whom; no test named).
- CS:32 "Router must hold zero token balance afterwards (checked by invariant tests, not at runtime)"; DV:51-52 says only after calls.
- CS:71 "fork-style test" (DV:43 says local compile, no fork). Rename.
- CS:4 "scheme-2 derivation vectors" referenced by DV:139 but absent from CS.
- CS:71 "Event ABI test against the canonical announcer" and "Gas snapshot": no pass criteria.
- Fix: give each an owner, a test name, and an acceptance criterion.

### F20 LOW. Buffer formula uses undefined safetyBps
- Location: CS:59 `bufferWei = ceil(gasLimit * maxFeePerGas * (10_000 + safetyBps) / 10_000)`.
- Fix: define safetyBps bounds and default; state that the contract only checks `msg.value <= maxBufferWei` (GhostPayRouter.sol:143).

### F21 LOW. Token-permit claims cite no source
- Location: CS:55 (USDC v2.2 permit; DAI-style unsupported; USDT no permit).
- Status: UNVERIFIED. Not checked against Circle or token source in this review.
- Fix: cite primary token source with retrieval date, or mark as client-side assumption.

### F22 LOW. Factory constructor does not check fee token code
- Location: PolicyAccountFactory.sol:75-85.
- Evidence: non-zero fee with no-code FEE_TOKEN is accepted; every `deploy` then reverts (`safeTransferFrom` on no-code). DV P16 says scripts check, contract does not.
- Fix: CS state scripts enforce it; or add `FeeTokenHasNoCode` in constructor when flatFee != 0.

### F23 LOW. Permit variant ordering not as DV 5 describes
- Location: GhostPayPolicyRouter.sol:120-133 (permit try-call runs before `_validate` stealth/gross/minNet/ephemeral checks); DV 5 gives one order.
- Fix: DV 5 add "permit variants: policy binding, zero token, deadline, then permit, then section 1 order."

### F24 LOW. Policy hash does not bind chain or factory; pinning in DV only
- Location: CS:63-65; DV:138-139, R6 (DV:194).
- Fix: CS to require meta-address manifests pin (chainId, factory, implementation codehash).

### F25 LOW. ERC-6538 "used as deployed" overstated
- Location: CS:3.
- Evidence: grep of packages/contracts/src finds no reference to ERC-6538 registry (0x6538E6bf...). ERC-6538 (fetched 2026-10-21, https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-6538.md) is off-chain registry, singleton per chain, deployed via CREATE2 with deterministic deployer 0x4e59b448....
- Fix: CS:3 "ERC-6538 registry is used off-chain by clients; contracts do not reference it."

## Verification notes (2026-10-21)
- ERC-5564 (https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-5564.md): announcer 0x55649E01B5Df198D18D95b5cc5051630cfD45564 via CREATE2 and deterministic deployer 0x4e59b44847b379578588920ca78fbf26c0b4956c; announce(uint256,address,bytes,bytes); scheme 1 = SECP256k1 with view tags, first metadata byte must be the view tag; ephemeralPubKey format unspecified; scheme mapping declared per ERC, no registry. Confirmed matches code (GhostPayRouter.sol:80).
- ERC-6538 (https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-6538.md): registry 0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538; CREATE2 via deterministic deployer; singleton per chain.
- ERC-2612 (https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-2612.md): permit(owner, spender, value, deadline, v, r, s); nonces replay protection; ecrecover returns zero for malformed signatures (OZ ECDSA reverts instead, consistent with code).
- EIP-2929 2600 cold access and 2300 stipend interaction: UNVERIFIED primary. eips.ethereum.org unreachable from sandbox (DNS ENOTFOUND, 2026-10-21). Secondary only: https://help.safe.global/articles/4904453247-why-cant-i-transfer-eth-from-a-contract-into-a-safe. DV P14 relies on this.
- USDC v2.2 / DAI / USDT permit claims (CS:55): UNVERIFIED (F21).
- docs/remote/audits/*: unverified claims, not relied on. Security audit file states GhostPayPolicyRouter.sol was excluded; this review covers it.

## Not checked
- Test bodies not read; coverage claims (CS:71-72) only checked for existence of mocks (packages/contracts/test/mocks) and invariant handlers.
- Slither/forge not run (read-only).
