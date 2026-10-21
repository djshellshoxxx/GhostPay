# GhostPay Research Notes: Stealth, Permit, Silent Payments, Account Abstraction

Retrieval date for every citation below: **2026-10-21** (R = retrieved that day).

## Method and limits (read first)

- Primary sources only. Fetching used a summarising fetch tool, so quotes are as returned by that tool, not byte-verified against the page. Re-check any quote before using it in a normative doc.
- **Hosts that could not be fetched (DNS failure): `eips.ethereum.org`, `docs.openzeppelin.com`.** The ERC/EIP texts were instead read from the canonical source repositories (`github.com/ethereum/ERCs`, `github.com/ethereum/EIPs`), which are the same documents.
- Not attempted or not reachable, so every claim that depends on them is marked **UNVERIFIED**: ethereum-magicians discussion threads, OpenZeppelin security advisories, ethereum.org pages, token source code for DAI and USDT, EF blog posts.
- Local inputs read first: `docs/MULTICHAIN_SPEC.md`, `docs/CONTRACTS_SPEC.md`, `packages/contracts/DEVIATIONS.md` (called MS, CS, DEV below).

---

## 1. ERC-5564 / ERC-6538 stealth addresses

### 1.1 Status
- ERC-5564 "Stealth Addresses": **Final**, Standards Track ERC, created 2022-08-13. Source: https://github.com/ethereum/ERCs/blob/master/ERCS/erc-5564.md (R 2026-10-21).
- ERC-6538 "Stealth Meta-Address Registry": **Final**, created 2023-01-24, requires ERC-712, ERC-1271, ERC-5564. Singleton per chain; canonical address `0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`. Source: https://github.com/ethereum/ERCs/blob/master/ERCS/erc-6538.md (R 2026-10-21).
- Reference contracts: ScopeLift `stealth-address-erc-contracts` lists announcer `0x55649E01B5Df198D18D95b5cc5051630cfD45564` and registry `0x6538...6538` on Ethereum, Arbitrum, Base, Gnosis, Optimism, Polygon, Scroll plus testnets. Its README security section reads "Coming soon", so **no published audit is referenced**. The licence is inconsistent in the README (CC0 vs MIT). Source: https://github.com/ScopeLift/stealth-address-erc-contracts (R 2026-10-21).
- Not verified: whether canonical addresses exist on BNB Chain, Avalanche (both in MS Tier 1) - **UNVERIFIED**, not in the README list fetched. MS already requires per-chain verification.

### 1.2 Known attacks and pitfalls
1. **View tag leakage.** The tag is the first metadata byte and reveals part of the shared secret. The ERC states "the security margin is reduced from 128 bits to 124 bits" and that this affects privacy, not address generation. The tag exists to cut parsing time "by around 6x". Source: ERC-5564 (URL above, R 2026-10-21). Implication: the tag is a public 8-bit fingerprint; it does not link sender to receiver by itself, but anyone can bucket announcements by tag.
2. **Funding / gas linkage.** "The funding of the stealth address wallet represents a known issue that might breach privacy"; suggested mitigation: attach a small ETH amount to each transfer. Source: ERC-5564 (R 2026-10-21). This is the main practical deanonymisation vector: a sweep that is gas-funded from a doxxed wallet links stealth address to owner.
3. **Announcer spam / DoS.** Senders impose parsing cost on recipients; the ERC says spamming "_can_ be a detriment to the user experience", suggests provider-side deprioritisation, staking or tolls, and notes "no monetary benefit can be obtained" from spam. Source: ERC-5564 (R 2026-10-21). The announcer is permissionless, so anyone can emit events with any `stealthAddress` and any metadata.
4. **Registry metadata is public.** The `stealthMetaAddressOf[registrant][schemeId]` mapping is publicly readable; the ERC security section is brief and does not discuss this trade-off (my inference from the mapping, flagged as inference by the fetch summary). Registering a meta-address ties it to the registrant's public address. Compromise guidance: "the registrant should promptly un-register" (ERC-6538, R 2026-10-21).
5. **Scheme-1 curve-point validation.** The fetched summary of ERC-5564 does **not** state an explicit on-curve validation requirement for the ephemeral key. **UNVERIFIED** against the full text. Locally, CS requires only length 33 and prefix `02`/`03` (router), so an off-curve x-coordinate passes on-chain. Recipients must therefore treat invalid points as "not for me" without throwing (a malformed announcement must never crash or stall a scanner).
6. **No audit of reference contracts** (see 1.1). Announcer/registry behaviour is as deployed, which GhostPay already treats as immutable (CS preamble).
7. **ethereum-magicians discussions** (e.g. thread 12888 cited in ERC-6538 header) were **not fetched**: any "known attack" folklore from those threads is **UNVERIFIED** here.

### Implications for GhostPay
- The router fixes `schemeId = 1` and verifies metadata layout but not the view tag or key validity (CS section 1, DEV "Spec observations"). So a hostile or buggy payer can emit an announcement for the real stealth address with a wrong tag, and the seller's scanner would skip a real payment. The scanner must not rely on the tag alone for invoices it expects: add a fallback that checks balances / `Transfer` logs for invoice-bound stealth addresses.
- The gas-funding risk is exactly what `payERC20WithBuffer` and `GhostPaySweepRelayer` address, but the relayer `feeTo` and the destination are visible on-chain at sweep time; the sweep itself links stealth address to destination (inherent).
- The policy scheme `0x47500002` is non-standard, so existing wallets and scanners will ignore it (CS section 4 says so). The announcer will still accept it.

### Recommended issues (docs only)
- DOC-1: Write a scanner robustness spec: invalid ephemeral points, wrong view tag, duplicate announcements, and spam rate-limits must all be non-fatal; define the "expected payment" fallback check.
- DOC-2: Write a privacy guide for sellers: never fund a stealth address from an identified wallet; prefer buffer or relayer; sweep destination linkage explained.
- DOC-3: Add a per-chain table of verified announcer/registry deployments, with BNB and Avalanche marked UNVERIFIED until checked.
- DOC-4: Record that ScopeLift reference contracts have no published audit and what that means for the "use as deployed" decision (ADR).
- DOC-5: Re-run this research against `eips.ethereum.org` and ethereum-magicians once reachable, specifically for scheme-1 key validation text.

---

## 2. EIP-712 / ERC-2612 permit, EIP-7702

### 2.1 Facts
- ERC-2612: **Final**, created 2020-04-13, requires EIP-20 and EIP-712. Source: https://github.com/ethereum/ERCs/blob/master/ERCS/erc-2612.md (R 2026-10-21).
  - Front-running: "another party can always front run this transaction and call `permit` before the intended party." The signer's outcome is unchanged (approval is set as intended), but a caller whose tx includes `permit` can be made to revert if the permit is not tolerated.
  - `ecrecover` returns the zero address on malformed signatures, so `owner != address(0)` must be checked.
  - Replay: domain separator "should be unique to the contract and chain"; if computed once at deployment rather than rebuilt, there is "a risk of possible replay attacks between chains in the event of a future chain split."
  - Signed permits can be withheld (censored) by a relayer; `deadline` bounds this.
- EIP-712: **Final**. "It does not include replay protection" and applications must behave correctly when they see the same signed message twice. `chainId` is an optional domain field, and agents "should refuse signing" on chain mismatch. Source: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-712.md (R 2026-10-21).
- ERC-6538 notes its domain separator is recomputed if the chain forks (R 2026-10-21, URL in 1.1) - the pattern to copy.
- EIP-7702 "Set Code for EOAs": **Final**, Core, created 2024-05-07. Source: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-7702.md (R 2026-10-21).
  - `msg.sender == tx.origin` no longer implies "topmost frame only"; reentrancy and sandwich guards based on it are affected.
  - Authorisations carry a chain id; `0` makes one valid on every chain.
  - Once an EOA delegates, "that code can be called by anyone at any point in a transaction"; a poor delegate gives an attacker near-total control. Storage collisions between delegates are a migration risk (ERC-7201 roots suggested).
  - "Relayers should be designed with these cases in mind": the authority can invalidate its authorisation or sweep assets so that a relayer's gas is not reimbursed.
  - Since no initcode runs on delegation, initialisation should be authenticated with `ecrecover` against the EOA's key.
- Non-standard tokens (DAI, USDT): that DAI's `permit` uses a different signature (holder, spender, nonce, expiry, allowed) and USDT has no `permit` is **UNVERIFIED** here (token source not fetched). The project's own CS section 2 already states "DAI-style permit NOT supported" and USDT needs the native buffer. Treat that as the project's claim, not as verified.
- OpenZeppelin `ERC20Permit` docs and advisories: **not fetched** (docs.openzeppelin.com unreachable) - **UNVERIFIED**. Any claim about OZ permit front-running guidance must be re-checked.

### Implications for GhostPay
- DEV item 1 and CS section 2 (try/catch around `permit`, then rely on allowance) match the front-running text in ERC-2612. Good. Remaining gap: `try/catch` hides a permit that failed for a real reason (wrong signature) and then the transfer reverts with a generic allowance error; fine for safety, poor for UX.
- DEV notes that `PermitSig.deadline` is not covered by the sweep signature; harmless but should be stated in the threat model.
- Own domains (`GhostPaySweepRelayer`, `GhostPayPolicyAccount`) include chainId and verifyingContract (CS section 2, DEV P3). The ERC-2612 warning about caching a separator is relevant: confirm the implementations rebuild it when `block.chainid` changes (OZ `EIP712` does this; the claim about OZ internals is **UNVERIFIED** here, check the vendored 5.6.1 source).
- EIP-7702 makes a stealth EOA able to delegate code. For a stealth key holder this is both an opportunity (self-sponsored batch sweep, no separate gas) and a risk (a key thief can install a delegate that drains; a chain-id-0 authorisation replays across chains). The relayer-reimbursement warning applies directly to `GhostPaySweepRelayer`: an owner can sweep the tokens away (or revoke allowance) before the relayer's tx lands, wasting relayer gas. The relayer's quote (F-SPONSOR) must price that risk or require simulation.
- The router and relayer must not use `tx.origin` anywhere (not currently specified); document that.

### Recommended issues (docs only)
- DOC-6: Threat-model section "permit griefing" covering try/catch, error surfacing, and the deadline-not-signed note.
- DOC-7: Token compatibility matrix with first-hand source checks for USDC, USDT, DAI, WETH per chain (permit variant, EIP-3009 support), marking each cell verified or not.
- DOC-8: EIP-7702 design note: whether stealth sweep should offer a 7702 path (delegate to a fixed audited sweep contract), chain-id-0 authorisation ban, and relayer griefing/pricing.
- DOC-9: Add "no `tx.origin` use" and "domain separator rebuilt on chainId change" to the contracts review checklist.

---

## 3. BIP-352 Silent Payments

### 3.1 Facts (source: https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki, R 2026-10-21)
- Status **Complete**, Specification, Applications layer, version 1.1.1 per the fetched header. (MS cites bips.dev; the primary text is the bitcoin/bips repo.)
- **Input eligibility:** only P2TR, P2WPKH, P2SH-P2WPKH and P2PKH inputs feed the shared secret. "Inputs with conditional branches or multiple public keys (e.g. CHECKMULTISIG) are excluded." Taproot script-path spends are counted using the output key.
- **Taproot parity:** sender must negate a taproot private key whose public point has odd Y ("check that the private key produces a point with an even Y coordinate and negate the private key if not"). Wallets that skip this derive wrong outputs.
- **Labels:** not identity separation: "labels are not meant as a way for Bob to manage separate identities." Label `m = 0` is reserved for change and "the wallet never hands out the label with m = 0."
- **Dust / scanning cost:** dust handling is not defined. A cryptographic match filtered by wallet policy "must still trigger a rescan with k++". Per-group cap `Kmax = 2323` bounds adversarial work.
- **Versioning:** version 0 appears as `sp1q` on mainnet; incompatible changes "should be a new BIP". Receivers should handle future versions gracefully (per the fetched summary; exact forward-compat rule **UNVERIFIED** in detail).
- **Light clients:** Appendix A is out of scope / open research. Estimated "30 MB per month" for a client scanning every 3 days (July 2024 taproot usage).
- **Reuse:** each payment goes to a unique output; the input hash prevents same inputs yielding the same destinations.
- **Security:** no dedicated section. "No formal proof that the protocol is secure in a collaborative setting", so all inputs should belong to one entity; ANYONECANPAY is unsafe because changing inputs breaks derivation.
- Wallet support and light-client services (BlindBit, Frigate): only secondary sources are cited in MS; I did **not** re-verify them. **UNVERIFIED**.

### Implications for GhostPay
- MS section 3 scope is consistent with the BIP: a web app cannot construct the payment, so invoices carry an `sp1...` address and an instruction. Add that eligible-input types are a payer-side constraint the app cannot check: a payer with only multisig inputs cannot pay at all; the UI must say so.
- Scanner must implement the `k++` rule even for outputs it later discards as dust, and respect `Kmax`. Spend/sweep of dust may cost more in fees than value: define a dust threshold as a wallet policy, not a scanner rule.
- Labels: never expose label 0; do not use labels as per-customer unlinkability (they are linkable by the key holder and observers of the shared scan key). For per-invoice separation use distinct invoice metadata, not labels.
- Address versioning: parser must reject unknown versions it cannot interpret and not treat them as v0.
- The default of keeping the scan key local (MS) means light-client mode needs either a self-hosted oracle or accepts disclosure; label this explicitly.
- Fee: nothing enforceable (MS section 4), unchanged by this research.

### Recommended issues (docs only)
- DOC-10: Silent-payments wallet-pitfall checklist for the adapter spec (eligible inputs, parity, label 0, k++, Kmax, version handling) mapped to the official test vectors.
- DOC-11: Payer UX doc: wallet capability detection and failure messaging when payer inputs are ineligible.
- DOC-12: Dust and sweep policy doc (threshold, batching, fee estimation).
- DOC-13: Light-client privacy doc: what each mode discloses (scan key vs query pattern) and bandwidth estimate from the BIP.
- DOC-14: Re-verify wallet and oracle claims in MS (BlindBit, Frigate, wallet list) from primary repos.

---

## 4. ERC-4337 / ERC-7579 / account abstraction

### 4.1 Facts
- ERC-4337: **Final**, created 2021-09-29, requires ERC-712 and EIP-7702 (per header). Source: https://github.com/ethereum/ERCs/blob/master/ERCS/erc-4337.md (R 2026-10-21).
  - Account `validateUserOp` must check the caller is a trusted `EntryPoint`, return `SIG_VALIDATION_FAILED` for signature mismatch without reverting, and pay `missingAccountFunds`.
  - Bundlers cap verification gas (`MAX_VERIFICATION_GAS` 500000) and drop ops that fail simulation; ops that access another op's sender in the same bundle are excluded.
  - Paymasters: "Maliciously crafted paymasters could pose a risk of a DoS attack"; mitigation by reputation and staking, "this stake is never slashed". The full shared validation/reputation rules are "outside the scope" (ERC-7562, not fetched, **UNVERIFIED**).
  - EIP-7702 accounts: initialisation "can be called multiple times through `EntryPoint`", so allow it once. Transient storage must be cleaned up manually if used for access control.
- ERC-7579: **Draft**, created 2023-12-14. Source: https://github.com/ethereum/ERCs/blob/master/ERCS/erc-7579.md (R 2026-10-21).
  - Module types: validator (1), executor (2), fallback (3), hook (4). Security section says it "Needs more discussion".
  - Listed risks: delegatecall, modules that revert on `onUninstall`, stale state when replacing single-slot modules, weak fallback-handler authorisation, hook DoS, self-call batching bypassing authorisation, reentrancy via `onInstall/onUninstall`.

### Implications for GhostPay
- `PolicyAccount` (CS section 4, DEV P1-P19) is deliberately not a 4337 account: no generic `execute`, no `delegatecall`, signature-based `requestWithdraw` that anyone may relay. That already gives gas-free withdrawal without a bundler and avoids paymaster/reputation rules; the cost is no wallet interoperability. Moving to 4337 would require `validateUserOp` and an EntryPoint trust assumption, conflicting with "no arbitrary external call".
- ERC-7579 is Draft and its security section is explicitly incomplete; its risk list (delegatecall, hooks, self-call bypass, uninstall griefing) is the set of features the policy account excludes. Treat a 7579 adapter (policy as a validator or hook module on a user's existing account) as research, not a build item.
- Stealth plus 4337: a stealth key that signs a UserOp would let a paymaster pay gas, but the bundler/paymaster then see the stealth address and the paymaster operator becomes a linkage point (inference, not a cited claim). Same privacy caveat as relayer sweeps.
- EIP-7702 plus 4337 (the header requires 7702): an alternative to the counterfactual-clone design is delegating the stealth EOA to a policy implementation. This avoids a second address (`A_acct`) but inherits all 7702 risks in section 2 and does not stop a key thief from re-delegating, which defeats the policy purpose ("a stolen stealth key cannot redirect funds", CS section 4). The clone design is stronger on that axis because the owner key is not the account itself.
- Consistent with DEV: "key theft is not prevented, only delayed"; none of 4337/7579/7702 changes that without guardians, which are not implemented.

### Recommended issues (docs only)
- DOC-15: ADR "Why PolicyAccount is not ERC-4337/7579", with the trade-offs above and a revisit trigger (7579 leaving Draft).
- DOC-16: ADR on EIP-7702 vs clone-per-stealth for policy enforcement; include re-delegation by key thief.
- DOC-17: Privacy note on bundler/paymaster linkage if a 4337 sweep path is ever added.
- DOC-18: Recovery/guardian design doc (DEV notes none exists), evaluating 7579-style or social recovery without breaking "no admin".
- DOC-19: Pin-and-version doc for `(chainId, factory, implementation codehash, policyRouter)` across scanners and manifests (DEV P6, R6).

---

## Consolidated UNVERIFIED list
1. Scheme-1 explicit on-curve validation wording in ERC-5564.
2. Announcer/registry deployments on BNB Chain and Avalanche.
3. DAI permit signature variant and USDT lack of permit (token source).
4. OpenZeppelin `ERC20Permit`/`EIP712` behaviour and any OZ advisories.
5. ethereum-magicians threads (5564, 6538, 7579) and any attack reports in them.
6. ERC-7562 validation rules, bundler behaviour in practice.
7. BIP-352 wallet/oracle ecosystem support; forward-compat rule for versions > 0.
8. ethereum.org / EF material (not attempted).
