# Research: further anonymization options for GhostPay (including chained payments)

**Status:** research only. No code, contract, deployment or configuration was changed for this document. Nothing here is a design decision, a security guarantee or legal advice. Written 2026-10-21 on branch `claude/remote-extensions-1`.

**Evidence labels used throughout**

| Label | Meaning |
|---|---|
| **[P]** | Primary source text read in this session (EIP/ERC/BIP text obtained by cloning the official `ethereum/EIPs`, `ethereum/ERCs` and `bitcoin/bips` repositories on 2026-10-21). |
| **[S]** | Secondary source or search-engine summary retrieved 2026-10-21 (news, law-firm notes, vendor docs, third-party profiles). Not read in full. |
| **[S2]** | A security or legal claim confirmed by at least two independent [S] sources. |
| **[R]** | This repository's own documents or code (as of the commit this file is added to). |
| **[U]** | Unverified: the author's reasoning, or recalled from prior knowledge and not re-retrieved in this session. Treat as a hypothesis. |

Direct HTTP fetches of most project sites (eips.ethereum.org, arxiv.org, docs.privacypools.com, vitalik.eth.limo) were blocked by this session's egress proxy, so many project-doc claims are **[S]** only. Every **[S]** item should be re-checked against the primary page before it is relied on. All URLs: retrieval date 2026-10-21.

---

## 0. Summary for busy readers

1. **Hops alone do not anonymize on a transparent ledger.** Chaining stealth address to stealth address (A -> S1 -> S2 -> ... -> W) produces a public chain of 1-in/1-out transfers with nearly identical amounts. The payer, who knows S1, can follow every hop. Unlinkability needs a **crowd that shares state** (a shielded pool) or a **joint transaction** (CoinJoin/PayJoin). Hops, delays and splitting only help if they feed into such a crowd.
2. **The most useful near-term work is fixing GhostPay's own leaks** (D1 sweep linkage, D8 RPC joins, sweep consolidation, fingerprintable gas-buffer values). These are effort S and come before any pool integration.
3. **Best research candidate for real unlinkability on EVM: an opt-in, client-side "exit via Privacy Pools (0xbow)" sweep path**, with an EIP-7702 sponsored deposit so the stealth address does not need its own gas. GhostPay should **integrate a third-party pool, not run its own pool, coordinator or withdrawal relayer**, and should **charge no fee on any anonymization step** (see the legal section 12).
4. **Bitcoin:** BIP-352 says collaborative transactions (CoinJoin) are not recommended with silent payments (no formal proof) [P]. The best fit is **BIP-77 async PayJoin** as an alternative invoice payment mode (the invoice link already carries interaction data). Post-receipt CoinJoin is user guidance only; GhostPay must not run a coordinator.
5. **Cross-chain bridges and Monero/Zcash round trips are not privacy features GhostPay can offer.** Amount/timing correlation, small liquidity and counterparty knowledge break them; legal exposure is highest here.
6. **Legal risk is a significant project risk, not a footnote.** Running a coordinator or relayer and taking fees on anonymization is the pattern behind the Samourai convictions [S2]; the Tornado Cash developer case is still pending retrial in April 2027 [S2]. Owner must obtain legal advice before any item in sections 5-7 ships.

---

## 1. Current design and what already leaks (baseline)

Sources: [R] `README.md`, `docs/CONTRACTS_SPEC.md`, `docs/MULTICHAIN_SPEC.md`, `docs/threat-model/THREAT_MODEL.md`, `docs/audits/04-independent-design-analysis.md`, `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md`, `docs/user/privacy-limits.md`.

Components relevant here:

- **Scheme 1** ERC-5564 secp256k1 stealth EOAs with 1-byte view tags; canonical announcer `0x5564...5564`; meta-address optionally in ERC-6538.
- **`GhostPayRouter`**: payer -> fee (25 bps) + net -> stealth; `announce(1, stealth, ephemeralPubKey, 57-byte metadata)`; `payERC20WithBuffer` forwards a payer-supplied native gas buffer to the stealth address in the same tx; event `FeeCollected(token, amount)`.
- **`GhostPaySweepRelayer`**: EIP-712 `Sweep` + ERC-2612 permit, relayer pays gas, fee taken in tokens; event `Swept(token indexed, owner indexed, destination indexed, amount, fee)`.
- **Scheme `0x47500002` policy accounts**: counterfactual CREATE2 clones with a fixed destination and timelock; contracts only, not wired (ADR-0014).
- **BIP-352 library** (`packages/btc-silent-payments`): not wired into app/relayer.
- **Feature 6 jitter** (payer-side delay) built; **Feature 5** Tor indexer/PIR not built.

### 1.1 Leakage inventory (numbered for later reference)

| ID | Leak | Who sees it | Source |
|---|---|---|---|
| L1 | Payer address, token, gross/net amount, time | Everyone | [R] privacy-limits |
| L2 | Router use and fixed 57-byte metadata shape: GhostPay payments are enumerable; anonymity set = GhostPay users on that chain | Everyone | [R] D2 |
| L3 | Payer knows the stealth address and can follow it | Payer | [R] D1 |
| L4 | Sweep publicly links stealth -> destination (`Swept` event plus the ERC-20 `Transfer` log) | Everyone | [R] D1, CONTRACTS_SPEC section 2 |
| L5 | Sweeping several stealth addresses to one destination clusters them (common ownership) | Everyone | [U], matches Umbra "collector" heuristic (section 10) |
| L6 | Relayer sees owner, destination, amount, fee, timing, (hashed) IP | Relayer | [R] D8 |
| L7 | RPC sees IP + stealth address on balance/nonce reads before a sweep | RPC provider | [R] D8, `apps/web/src/lib/sweep.ts` |
| L8 | Stable seller meta-address across invoices | Invoice holders, registry readers | [R] D3 |
| L9 | Gas buffer: arrives in the payer's tx (spec-endorsed, see 4.4) but its value is computed (`gasLimit * maxFeePerGas * (1+safety)`) and so is a distinctive, non-round amount that fingerprints the client and quote time | Everyone | [R] CONTRACTS_SPEC section 3; fingerprint point is [U] |
| L10 | Timing: sweep soon after receipt; payment soon after invoice view | Everyone / host | [R] Feature 6 |
| L11 | Amounts are invoice-specific; net is in metadata; gross is reconstructible from `FeeCollected` | Everyone | [R] |
| L12 | Fresh EOA behaviour: a stealth EOA's first tx at nonce 0, a permit signature, then empty account; leftover native dust | Everyone | [U] |
| L13 | Policy account: fixed destination becomes public on first withdrawal | Everyone | [R] D6 |
| L14 | Network: static host, RPC, relayer see IP and timing; no Tor mode in app | Infra operators | [R] D8, Feature 5 |

The threat model already rates D1 (L3/L4) **High** and D8 (L6/L7) **Medium**. Any new "anonymization" feature that does not first fix L4, L5, L7 and L9 adds complexity while leaving the strongest links in place.

---

## 2. What "anonymize" can mean here

Separate the properties; each idea below says which one it addresses.

| Property | Question | GhostPay today |
|---|---|---|
| **Receiver unlinkability (receive side)** | Can an observer tell that two payments went to the same seller? | Partly: stealth addresses break address reuse; broken by L4, L5, L8 |
| **Receiver unlinkability (post-sweep)** | Can the payer or an observer follow funds to the seller's long-term wallet? | No (L3, L4) |
| **Sender privacy** | Does the seller / public learn who paid? | No (L1) |
| **Amount confidentiality** | Is the amount hidden? | No (L1, L11) |
| **Timing unlinkability** | Can arrival and departure be paired by time? | Weak (L10) |
| **Network unlinkability** | Does any operator join IP with addresses? | No (L7, L14) |
| **Usage unobservability** | Can an observer tell GhostPay was used at all? | No (L2) |

---

## 3. Evaluation template

Each idea gets: **Threat addressed**, **Mechanism**, **Fit with GhostPay**, **Effort** (S < 2 weeks client-only; M = new component or third-party integration; L = new contracts/circuits/chain or months), **Security risk**, **Legal risk** (Low/Med/High, factual pointer only), **Maturity**, **Recommendation**.

---

## 4. EVM-native techniques (no new cryptography)

### 4.1 Chained stealth hops (A -> S1 -> S2 -> ... -> W)

- **Threat addressed:** L3/L4 (payer follows funds).
- **Mechanism:** After receipt at S1, the seller sweeps to S2, a fresh stealth address derived from the seller's *own* meta-address (no announcement needed: the seller can derive it locally with a self-chosen ephemeral key), then to S3, and so on.
- **Analysis [U]:** Every hop is a public transfer of the same token for `amount - fee`. Graph following is trivial: one input, one output, amount differs by a predictable fee, close in time. Each hop costs gas and, via the relayer, reveals the next hop to the relayer. Hops only add cost. The `Swept` event even indexes `owner` and `destination`, so the chain is an indexed lookup.
- **Fit:** Trivial to build (reuse sweep with a derived destination).
- **Effort:** S. **Security risk:** Low (more signing of sweeps; D7 still applies). **Legal risk:** Low-Med (looks like layering if marketed as obfuscation). **Maturity:** n/a.
- **Recommendation:** **Do not build or market as privacy.** Keep "sweep to a fresh self-derived address" as the default destination (fixes reuse, D1 guidance), but call it address hygiene, not anonymization.

### 4.2 Amount splitting and denomination

- **Threat addressed:** L11 (unique amounts), and amount matching across a hop or pool.
- **Mechanism:** Split a received amount into standard denominations (for example powers of 10 of the token) and move each to a different fresh address at different times. Payer-side splitting (one invoice paid to several stealth addresses) would need multiple router calls from the same payer in quick succession, which links them anyway; a multi-output router is a contract change and out of scope.
- **Analysis [U]:** Splitting without a crowd creates a recognisable fan-out (1 -> k outputs whose sum equals a known invoice amount). It helps **only** at the entry/exit of a shared pool, where standard denominations make deposits and withdrawals interchangeable. This is the one pool-usage rule that matters most (section 6).
- **Effort:** S (client logic). **Security/legal risk:** Low / Low-Med. **Maturity:** well-known practice.
- **Recommendation:** Implement **only as part of a pool exit (6.x)**. Standalone: no.

### 4.3 Randomized delays

- **Threat addressed:** L10.
- **Mechanism:** Already built for the payer (Feature 6). Extension: schedule sweeps and pool withdrawals with random, user-bounded delays; never pre-sign and hold raw signed transactions (Feature 6 rule).
- **Analysis:** Delay increases the time window an analyst must consider; the gain is proportional to how many other indistinguishable events happen in that window (section 10.2). With a small GhostPay crowd the gain is close to zero. The roadmap's own assessment agrees: "Delaying one transaction is not a proper anonymity set" [R].
- **Effort:** S. **Risk:** Low. **Recommendation:** Add sweep-side jitter as a cheap companion to 6.1; never present as anonymity.

### 4.4 Gas funding leakage and the buffer path

- **Threat addressed:** Funding-gas link (seller funds stealth address from a known wallet), L9, L12.
- **Primary-source fact [P]:** ERC-5564 (status **Final**) Security Considerations: "The wallet that funds the stealth address MUST NOT have any physical connection to the stealth address owner in order to fully leverage the privacy improvements. Thus, the sender may attach a small amount of ETH to each stealth address transaction, thereby sponsoring subsequent transactions of the recipient." GhostPay's `payERC20WithBuffer` is exactly this endorsed pattern; the payer is already linked to the stealth address by the payment, so the buffer adds no new *link*.
- **Residual [U]:** (a) the buffer value is computed to wei precision from live gas data, so it fingerprints GhostPay's client and roughly when the quote was made; (b) unused buffer remains as dust in the stealth address, and sweeping that dust to the same destination later, or topping up from a known wallet, re-links; (c) a seller who "helps" a stuck stealth address by sending ETH from their main wallet creates the exact link the ERC warns about.
- **Mitigations (S):** round buffer to a coarse grid (for example 2 significant figures, rounded up); sweep native dust in the same operation or leave it; UI hard-stop on "fund this stealth address from wallet X" if X is a known destination; prefer the relayer or 7702 path (4.6) for tokens without permit.
- **Recommendation:** **Do now (S).**

### 4.5 Fee-payer / relayer unlinking

- **Threat addressed:** L6 (relayer knowledge), relayer as a common correlator.
- **On-chain view [R]+[U]:** `tx.origin` is the relayer hot key, shared by all users, which is good: the gas payer does not link to the seller. The relayer's `feeTo` is also shared. What links is the sweep content (L4), not the gas payer.
- **Off-chain view:** The relayer sees all fields plus IP. Options: (1) multiple independent relayers, client picks at random; (2) submit to the relayer over Tor or an onion service (section 9.1) or an OHTTP relay (9.4) so the relayer does not learn the IP; (3) RLN-style anonymous rate limiting (5.5) so abuse controls do not need IP logging; (4) keep the "no bodies in logs" policy [R] `apps/relayer/PRIVACY.md`.
- **Limit:** No relayer construction hides on-chain edges. Chaining relayers (relayer A forwards to relayer B) is irrelevant because the chain graph is public.
- **Effort:** S-M. **Legal risk:** Med (operator duties, D10). **Recommendation:** (2) and (1) are cheap wins; do with 8.x.

### 4.6 EIP-7702 implications (sponsored sweeps from stealth EOAs)

- **Primary-source facts [P]** (EIP-7702, status **Final**): a type-4 "set code" tx carries `authorization_list = [[chain_id, address, nonce, y_parity, r, s], ...]`; for each valid tuple the authority's code becomes the delegation indicator `0xef0100 || address`. The tx sender need not be the authority: the EIP lists **sponsorship** ("account X pays for a transaction on behalf of account Y") as a design goal. The authorization is valid if "the chain ID is 0 or the ID of the current chain". Security considerations: the delegate must sign over nonce, value, gas, target and calldata or "a malicious actor [can] take near complete control over a signer's EOA"; initialization can be front-run unless the init calldata is signed by the EOA.
- **Mechanism for GhostPay [U]:** the stealth EOA signs (a) a 7702 authorization delegating to a minimal, audited, GhostPay-independent "sweep-only" delegate, and (b) an EIP-712 sweep intent; a sponsor submits one type-4 tx that sets code and calls the delegate, which moves tokens to the signed destination and pays the sponsor in tokens. This removes the ERC-2612 permit requirement (works for USDT-style tokens) and removes the need for a gas buffer.
- **Privacy effect [U]:** neutral on links (same relayer knowledge as today); **negative on fingerprinting**: the stealth address keeps the delegation code after the sweep, so "EOA delegated to the GhostPay sweep delegate" becomes a public label for every GhostPay stealth address unless a second tx clears it (authorization to `address(0)` resets code [P]). The real value of 7702 here is as an **enabler**: it lets a gasless stealth address deposit into a shielded pool (6.1) in one sponsored tx.
- **Security risks:** chain-id-0 authorizations replay on every chain (must forbid; sign the specific chain id); delegate bugs give full control of every stealth EOA that delegated; persistent delegation outlives the sweep; front-run initialization. Requires a new contract, so CONTRACTS_SPEC change and audit first.
- **Effort:** M-L (contract + audit + client). **Legal risk:** Low-Med (same as relayer). **Maturity:** EIP Final and live on Ethereum mainnet since the Pectra upgrade (May 2025) [U: date recalled, not re-retrieved]; per-L2 support must be checked per chain.
- **Recommendation:** **Research spike after the core audit**, mainly as the gas enabler for 6.1. Consider an existing audited delegate rather than writing one.

### 4.7 ERC-4337 paymasters and bundlers

- **Facts [P]:** ERC-4337 (Final) puts `sender` and `paymaster` fields in public `handleOps` calldata; the bundler EOA is the on-chain `from`. Analytics vendors recommend treating "funding transaction (or paymaster deposit) and later spending as one behavioral episode" [S] (Elliptic).
- **Fit:** ADR-0009 deferred 4337 to scheme `0x47500002`. A paymaster is functionally the same as GhostPay's sweep relayer for privacy: someone else pays gas, the bundler/paymaster sees the operation and the IP. Policy accounts are counterfactual contracts and could be 4337 accounts, but ADR-0014 blocks them.
- **Privacy gain:** none beyond the relayer [U]; adds bundler mempool and paymaster as observers. The account address of a GhostPay-specific 4337 implementation is itself a fingerprint (like L2).
- **Effort:** M-L. **Recommendation:** **Do not pursue for privacy.** Revisit only if 4337 is needed for other reasons; 7702 (4.6) covers the gas use case with fewer parties.

### 4.8 Per-client / per-invoice meta-addresses (D3)

- **Threat addressed:** L8.
- **Mechanism:** derive distinct (spend, view) pairs per client from the same seed; scanning cost grows linearly with the number of viewing keys.
- **Effort:** S-M (core-crypto, scanner). **Risk:** Low. **Recommendation:** already backlog in D3; worth doing before pool work because it is cheap and addresses a real link.

---

## 5. Zero-knowledge options

### 5.1 Privacy Pools (0xbow, association sets)

- **Threat addressed:** post-sweep unlinkability (L3/L4/L5), and optionally sender privacy (6.3).
- **Mechanism:** Deposit into a pool contract; later withdraw to any address with a ZK proof that the withdrawal corresponds to *some* deposit in an **association set** published by an Association Set Provider (ASP), without revealing which. Design paper: Buterin, Illum, Nadler, Schär, Soleimani, "Blockchain Privacy and Regulatory Compliance: Towards a Practical Equilibrium", *Blockchain: Research and Applications* 5 (2024) 100176, doi:10.1016/j.bcra.2023.100176 [S2: Univ. Basel CIF page, Blockworks, Decrypt].
- **Deployment facts [S]:** live on Ethereum mainnet since 2025-03-31 (The Block, Forklog); early caps 0.1-1 ETH later removed (Dealroom); assets reported: ETH, wBTC, USDC, USDT, DAI (Dealroom, single aggregator). **Ragequit**: a public exit without ASP approval, initiated by the original depositor, revealing the commitment (Nethereum docs, Envio, L2BEAT). The ASP can remove a deposit from the approved set at any time, forcing ragequit (Nethereum docs). Reported fees: vetting fee 0.5% on ETH/USDC deposits, 0% on some stablecoins; relayer fee on withdrawal capped (10% max) and self-relay possible (L2BEAT profile) [S, single source for fee figures].
- **Fit [U]:** Very good for an opt-in **exit path**: stealth S1 deposits (needs gas: buffer, or 7702 sponsor 4.6), the seller later withdraws via a pool relayer to a fresh destination; the pool relayer pays gas and is paid from the withdrawal, which **solves gas funding on the exit side** without any GhostPay relayer. Client-side only; no GhostPay contract change if S1 calls the pool directly.
- **Leaks that remain:** deposit from S1 is public, so the payer sees "my payment went into Privacy Pools"; ASP sees deposit metadata (public anyway) and decides inclusion; withdrawal relayer sees recipient and IP; unlinkability depends on the pool's crowd for that asset and on the user not withdrawing the exact invoice amount soon after (section 10); ragequit returns funds to S1 publicly.
- **Security risk:** third-party contracts/circuits (check audits before use); trusted-setup and circuit risk [U]; ASP censorship (funds still recoverable by ragequit).
- **Legal risk:** **Med**. Designed for compliance (association sets / "proof of innocence"), but pools remain "mixing" in the ordinary sense; see section 12 (FinCEN 2023 NPRM, EU AMLR). Lower than running anything ourselves.
- **Maturity:** production on Ethereum mainnet, young (18 months); multi-chain status not verified.
- **Recommendation:** **Top research candidate (rank 4 in roadmap).** Testnet spike, then an opt-in "Private exit" sweep option, no GhostPay fee.

### 5.2 Railgun

- **Mechanism [S]:** shield tokens into a UTXO-style commitment tree; private transfers and unshields with zk-SNARKs; "broadcasters"/relayers over the Waku p2p network for network privacy; **Private Proofs of Innocence (PPOI)**: list providers publish indicators of illicit origin and users prove their shielded funds are not derived from them (L2BEAT, Blockworks, yellow.com mirror of docs). Reported 0.25% shield/unshield fee and a 1-hour "unshield-only to origin" period after shielding (xgram guide, **[U]**, single third-party source). Railgun is a named Kohaku collaborator [S2: Cointelegraph, QuickNode].
- **Fit:** Similar to 5.1 as an exit (S1 shields; seller unshields later to a fresh address) and offers private *transfers* inside the pool, so a seller can hold and pay out without unshielding. SDK is heavier; licence must be checked [U].
- **Legal risk:** Med (same category as 5.1). **Maturity:** multi-year production, multi-chain (per L2BEAT) [S].
- **Recommendation:** **Second pool option**, evaluated in the same spike as 5.1; pick whichever has the larger crowd for the chain/token. Do not integrate both at once.

### 5.3 Aztec

- **Facts [S]:** Aztec's Ignition chain went live Nov 2025 (single blog source); "Alpha" mainnet is live and Aztec's own docs call it early, unaudited software where critical bugs are expected; Alpha V5 claims ~2.5 s client proving (self-reported) (The Defiant, docs.aztec.network).
- **Fit:** A private L2 with native private notes makes stealth addresses unnecessary there; GhostPay would need a different adapter, wallet stack and fee mechanism. Bridging in/out of Aztec is public at the bridge.
- **Effort:** L. **Recommendation:** **Watch only.** Re-evaluate when Aztec leaves alpha and has independent audits.

### 5.4 Tornado-style design history, and "our own pool"

- **History (facts):** Fixed-denomination ZK mixers. Wang et al., "On How Zero-Knowledge Proof Blockchain Mixers Improve, and Worsen User Privacy", WWW '23, doi:10.1145/3543507.3583217 [S2: arXiv 2201.09035, UCL record]: five heuristics linking deposits/withdrawals improve linking probability by ~52% (ETH) / ~109% (BSC); advertised anonymity sets were inaccurate (reduced ~27%/46%); OFAC sanctions cut daily deposits >80%; anonymity-mining incentives attracted address-reusing users. OFAC designation (Aug 2022), Fifth Circuit reversal and delisting: section 12.
- **Own pool?** Building a GhostPay pool would mean: new circuits and verifier contracts (largest audit surface in the project), a tiny anonymity set (only GhostPay users, cf. L2), a custody-like role for an immutable contract, and the precise legal profile of section 12.
- **Recommendation:** **Do not build an own pool.** Integrate an existing one (5.1/5.2) if anything.

### 5.5 Semaphore / RLN

- **Facts [S2]:** Semaphore lets group members signal anonymously with nullifiers; RLN (Rate-Limiting Nullifier) adds Shamir shares so exceeding one signal per epoch reveals the offender's secret and allows slashing a stake; Waku uses RLN-Relay (pse.dev, vac.dev, ethresear.ch).
- **Fit [U]:** Not a payment-privacy tool. Useful for the **relayer**: users could prove "I am a registered GhostPay user and have not exceeded my sponsored-sweep quota this epoch" without IP-based limits, addressing S3-06/S3-07 griefing without IP logging. Registration itself (stake from some address) is a public link and must happen from an unrelated address.
- **Effort:** M-L. **Recommendation:** **Later research**, only after relayer IP is hidden (9.x) and if IP-based limits become the privacy bottleneck.

### 5.6 Range proofs / confidential amounts on EVM

- No native confidential amounts on EVM L1/L2s in scope. Confidential amounts require a pool with its own commitments (5.1/5.2 already hide amounts *inside* the pool) or a different chain (Liquid 6.6, Aztec 5.3). A GhostPay-specific range-proof token would be an own pool (5.4). **Recommendation: no.**

### 5.7 EIP-7503 zero-knowledge wormholes

- **Fact [P]:** EIP-7503 status **Stagnant** in the official repository. Proposal: burn ETH to an unspendable address indistinguishable from a normal transfer, later re-mint with a ZK proof [S]; ethresear.ch discussion argues a trade-off between plausible deniability and security [S].
- **Recommendation:** **Watch only.** If enshrined, it would give stealth-like deposits a crowd of "all fresh-address transfers", which is the only design here that fixes L2 at protocol level.

### 5.8 Proof-of-innocence and compliance trade-offs (5.1, 5.2)

- Association sets / PPOI move the compliance decision to set providers: users gain a way to dissociate from known-bad deposits; the cost is an exclusion or inclusion authority whose lists can be wrong, lagging, or politically driven, and an anonymity set reduced to "approved" deposits [U].
- Late-arriving taint: a deposit approved today can be removed later (5.1 ASP removal [S]); withdrawn funds may still be flagged by exchanges using their own analytics [U].
- For GhostPay, the compliance-friendly variant (ASP/PPOI) is the only one the owner could plausibly defend; a pool without such sets should not be integrated (section 12).

---

## 6. Chained (multi-hop) payments: concrete design sketches and leakage

Notation: `P` payer EOA, `R` GhostPayRouter, `S1` stealth address (scheme 1), `Pool` a third-party shielded pool (Privacy Pools or Railgun), `PR` pool relayer, `GR` GhostPay sweep relayer or 7702 sponsor, `S2..Sk` fresh seller-derived addresses, `W` seller's long-term wallet.

### 6.0 Variant 0: naive chained stealth (rejected)

```
P --R--> S1 --GR sweep--> S2 --GR sweep--> S3 --> W
```

| Observer | Learns |
|---|---|
| Public | Every edge; amounts differ only by fees; `Swept(owner, destination)` indexed per hop |
| Payer | Follows S1 -> ... -> W directly |
| GR | Every hop, IP |

Net gain vs a single sweep to a fresh W: **none**, cost k times higher. See 4.1.

### 6.1 Variant 1: pool-mediated exit (recommended research)

```
            (public)                    (public)                      (hidden link)                (public)
P --R(payERC20[,buffer])--> S1 --(7702-sponsored or buffer-funded) deposit--> Pool ~~~ delay, ASP approval ~~~
     PR withdraw (denomination d1, time t1) --> S2
     PR withdraw (denomination d2, time t2) --> S3      ... later consolidated or used separately -> W?
```

Steps:
1. Payer pays S1 via the router as today (fee collected, announcement made).
2. Seller's client detects the payment. When the user opts for "Private exit", the client builds a deposit from S1 into the pool. Gas comes from the payer's buffer (existing path) or from a 7702 sponsor (4.6) paid in tokens. Deposit amount = full balance.
3. Wait: ASP approval plus a random delay drawn by the client (days, user-bounded).
4. Withdraw in **standard denominations** (4.2) at **separate random times** through **different pool relayers**, each to a fresh address S2, S3, ... that the seller derives locally (never announced, never reused, never previously funded).
5. The seller must not merge S2, S3, ... into W in one transaction; spend them separately or accept that merging re-links them to each other (not to S1).

Leakage analysis:

| Observer | Learns | Does not learn (if crowd is adequate) |
|---|---|---|
| Public | P -> S1 payment and amount; S1 -> Pool deposit; Pool -> S2/S3 withdrawals (amounts, times, relayers) | Which deposit funded S2/S3 |
| Payer | Their payment entered the pool | Where it exited |
| Pool relayer | Withdrawal recipient, amount, IP (unless Tor/OHTTP) | Which deposit |
| ASP | Deposit source S1 and its history (public) | Withdrawal mapping |
| GR / 7702 sponsor | S1 -> Pool deposit intent, IP | Withdrawals |
| GhostPay | Nothing beyond public data (client-side only) | Everything else |

Where it breaks [U]:
- **Amount matching:** depositing 1,234.56 USDC and withdrawing 1,234.56 USDC is matchable. Fix: denominations, partial withdrawals, keep a residue in the pool.
- **Timing:** quick deposit->withdraw pairs in a quiet pool are matchable (Wang et al. heuristics, 5.4).
- **Crowd size:** if the pool has few deposits of that token per day, every heuristic is stronger (10.2).
- **Address hygiene:** withdrawing to an address that later interacts with S1, the payer, W, or a KYC exchange account tied to the seller defeats it.
- **Ragequit/ASP removal:** forces a public return to S1, restoring the link.
- **Fingerprint:** "router payment followed by pool deposit from the same stealth address" is a GhostPay-specific pattern; it marks the deposit as a GhostPay seller exit (cf. L2). That is acceptable only if the pool crowd, not the GhostPay crowd, determines anonymity.

Contract impact: **none** if S1 deposits directly (EOA call). A router function "pay directly into pool for recipient" is **not** recommended: it would make GhostPay contracts part of the pool flow (audit and legal surface).

### 6.2 Variant 2: pool entry before payment (sender privacy)

```
P (has shielded balance) --Pool withdraw via PR--> S1        announcement relayed by a third party
```

- The payer withdraws from their own pool balance directly to S1. The announcement must be sent by an account unrelated to P (for example a relayer or a public announcement service), otherwise the announce tx links P.
- **Gains:** sender privacy (seller and public do not learn P). **Costs:** no router, so **no fee** (same as a direct payment, FEE_SCHEDULE) and none of the router's metadata checks (D4: payer-controlled view tag; seller must verify by balance, S3-02). The seller loses the payer identity, which matters for refunds and disputes.
- **Recommendation:** document as a payer-side option ("you may pay the one-time address from any source"); do not build special support until 6.1 is evaluated.

### 6.3 Variant 3: Bitcoin (silent payment then PayJoin/CoinJoin)

```
P (SP-capable wallet) --> sp output O1 (BIP-352)
Seller: O1 + other own UTXOs --(own CoinJoin wallet or PayJoin as sender)--> fresh outputs
Alternative: invoice offers BIP-77 PayJoin instead of sp1 address
```

See 7.1-7.2. Post-receipt CoinJoin is a seller's own operation on their own UTXOs, outside BIP-352's warning (which concerns building the SP output in a collaborative tx) [P/U].

### 6.4 Variant 4: cross-chain via Monero (rejected as a product feature)

```
EVM S1 --swap/bridge--> BTC --atomic swap (eigenwallet)--> XMR --> ... --> BTC/EVM fresh
```

Each boundary is a public event with amount and time; swap makers see both sides; liquidity is thin so amounts stand out; legal exposure is highest (section 12). See 7.5, 8.1-8.3 and 10. **Not a GhostPay feature.**

---

## 7. Bitcoin-side variants

### 7.1 BIP-352 + CoinJoin

- **Primary facts [P]:** BIP-352 status **Complete**. "it is recommended that the keys of all inputs of a transaction belong to the same entity as there is no formal proof that the protocol is secure in a collaborative setting"; CoinJoin participants would need Blind Diffie-Hellman to avoid revealing whom Alice pays, and "it is currently not recommended to use this protocol for CoinJoins due to a lack of a formal security proof". MuSig/FROST inputs are "theoretically supported" but "not recommend[ed] due to lack of a security proof (except if all participants are trusted or are the same entity)". BIP-375 (Draft) adds PSBT fields with ECDH shares and DLEQ proofs (BIP-374, Draft) so multiple signers can build SP outputs verifiably.
- **Coordinator landscape [S2]:** zkSNACKs stopped the default Wasabi coordinator on 2024-06-01 (nobsbitcoin, blocktrainer); community coordinators continue the WabiSabi protocol and Wasabi 2.0.8 added coordinator selection (nobsbitcoin, LearnBitcoin). Samourai's Whirlpool coordinator went offline with the April 2024 seizure (nobsbitcoin, Cointelegraph research); Ashigaru is a community fork (bitcoinnews.com), current Whirlpool liquidity **[U]**. Wasabi 2.6.0 (May 2025) reportedly removed dependency on centralized infrastructure (single [S]).
- **Fit:** SP payment then seller-side CoinJoin of received outputs in the seller's own CoinJoin-capable wallet. GhostPay's role: guidance and "export to wallet X" only.
- **Effort:** S (docs). **Legal risk:** High for anyone running a coordinator (section 12); Low for documentation. **Recommendation:** **Docs only; never run or bundle a coordinator.** Do not attempt SP-in-CoinJoin until a formal proof exists.

### 7.2 PayJoin (BIP-78 deployed, BIP-77 draft)

- **Facts [P]:** BIP-78 "A Simple Payjoin Proposal" status **Deployed**; BIP-77 "Async Payjoin" status **Draft**, uses Oblivious HTTP (RFC 9458) to a store-and-forward directory so sender and receiver need not be online at once, with the directory unable to read messages and the OHTTP relay hiding client IP from the directory.
- **Mechanism:** the receiver contributes an input to the payer's transaction, breaking the common-input-ownership heuristic and hiding the true payment amount.
- **Fit [U]:** Good for GhostPay's invoice model: the invoice already carries interactive data; a BIP-21 `pj=` endpoint could be included for payers whose wallets support PayJoin. The seller's browser would act as an async receiver. Not combined with SP (with interaction, SP is unnecessary; the receiver picks a fresh address).
- **Risks:** receiver must hold UTXOs to contribute (UTXO probing by malicious senders is a known PayJoin concern [U]); directory/relay operators are services with their own legal posture; wallet support uneven [U].
- **Effort:** M-L (Bitcoin tier is not wired at all yet). **Legal risk:** Low-Med (no pooling of third-party funds). **Recommendation:** **Best Bitcoin option; plan for when the Bitcoin tier is wired** (rank 6).

### 7.3 Taproot / MuSig2

- **Facts [P]:** BIP-327 MuSig2 produces a single BIP-340 key; key-path spends look like single-sig. SP outputs are always Taproot ("putting users in the best eventual anonymity set") [P BIP-352].
- **Fit:** A seller using MuSig2 for joint custody gains spending-policy privacy, not payment unlinkability. **Recommendation:** no specific work; mention in docs.

### 7.4 Lightning and ecash hops

- **Ecash facts [S]:** Cashu (single mint) and Fedimint (federated guardians, threshold blind signatures) give strong unlinkability between issuance and redemption, but are custodial: a mint or guardian quorum can steal, debase or censor; receiver privacy on Lightning in/out is weaker (spark.money research pages; single vendor, treat as one source).
- **Lightning [U]:** BOLT11 invoices reveal the receiver node; blinded paths (BOLT12 offers) improve receiver privacy. Not re-verified this session.
- **Fit:** Different payment rail from GhostPay's on-chain stealth design. Running a mint is custodial money transmission in most readings [U].
- **Recommendation:** **Out of scope.** If ever: accept BOLT12 offers as a separate invoice type; never operate a mint.

### 7.5 Atomic swaps via Monero, Haveno

- **Facts [S]:** COMIT's `xmr-btc-swap` is marked unmaintained; volunteers continue at eigenwallet/core (repository mirror note); COMIT launched mainnet BTC<->XMR swaps in May 2021 (Crowdfund Insider, AMBCrypto). Haveno is a Monero-focused Bisq fork; whether native atomic swaps shipped is **[U]**.
- **Analysis [U]:** swaps are pairwise with a market maker who sees both legs; amounts and timing across chains correlate; liquidity is thin.
- **Recommendation:** **No product integration.** Users may do this on their own; GhostPay should not link to or recommend specific swap venues.

### 7.6 Liquid confidential transactions

- **Facts [S2]:** Liquid hides amounts and asset types by default with Pedersen commitments, range proofs and asset surjection proofs; even functionaries cannot see amounts (docs.liquid.net, Blockstream enterprise docs). Trust: federated peg, reported 11-of-15 functionaries (spark.money, bitcoinfortress; federation size details unconfirmed). Peg-in/peg-out are public on Bitcoin.
- **Fit:** No Liquid adapter exists; would be a new chain family (MULTICHAIN_SPEC Tier 3 equivalent).
- **Recommendation:** **Low priority**; only if users ask for confidential amounts on a Bitcoin-adjacent chain.

---

## 8. Monero / Zcash as hops and bridge pitfalls

### 8.1 Monero

- **Facts [S]:** FCMP++ (full-chain membership proofs, replacing ring signatures) is **not active on mainnet**; an Oct 5, 2026 fork was a stressnet; a non-binding roadmap targets week 16 of 2027 (Bitrue Oct 12 2026, CryptoTicker). Conflicting claims of earlier activation exist and appear wrong.
- **Known weakness [U, recalled]:** empirical decoy/ring analyses (for example Möser et al., PETS 2018) showed early-era ring outputs were often traceable; current ring size 16 is better but not full-chain.
- **As a hop:** see 6.4. MULTICHAIN_SPEC already states "Monero, Zcash: native privacy chains; GhostPay adds nothing. Not planned." [R]. This research agrees.

### 8.2 Zcash

- **Facts [S]:** shielded share of supply reported at 31.0% (Q1 2026) and 26.3% (Q2 2026), Orchard holding ~85-88% of shielded value (Blockworks token holder reports); trackers disagree on exact figures. A critical Orchard circuit soundness bug disclosed 2026-05-29 with a temporary soft-fork disable and re-enable on 2026-06-03 is reported by **one** aggregator source **[U, needs primary confirmation from Zcash Foundation / ECC]**.
- **Known heuristic [U, recalled]:** Kappos et al., "An Empirical Analysis of Anonymity in Zcash" (USENIX Security 2018): most shielded activity was linkable via round-trip transactions (transparent -> shielded -> transparent with the same amount soon after). This is exactly the pattern a "hop through Zcash" produces.
- **Recommendation:** no integration.

### 8.3 Cross-chain bridge unlinking pitfalls

- **Case [S2]:** Bybit hack (2025-02-21, ~$1.4-1.5B): most proceeds moved ETH -> BTC via THORChain; Bybit's CEO said 77% remained traceable shortly after (The Block, Arkham research, Cointelegraph).
- **Why bridges do not unlink [U]:** amounts are preserved minus predictable fees; timing is tight; bridge contracts and indexers pair source and destination by deposit ids or memos; intent solvers and market makers see both legs; destination addresses are often fresh and then interact with known services.
- **Recommendation:** **never describe a bridge or swap as a privacy step** in GhostPay copy.

---

## 9. Network-layer and query privacy

`docs/remote/onion-i2p-research.md` did **not** exist when this was written; if a parallel contributor adds it, it should take precedence for Tor/I2P operational detail.

### 9.1 Tor (RPC, relayer, static host)

- **Threat:** L7, L14 (IP joins).
- **Fit [U]:** the web app cannot open Tor circuits itself; options: (a) users of Tor Browser with an onion-reachable relayer and RPC; (b) a relayer onion service; (c) an embedded Tor client compiled to WASM (Arti) is experimental and should be treated as **[U]**. The blueprint already notes Tor exit/provider correlation and browser fingerprinting remain [R].
- **Effort:** S (relayer onion service + docs) to L (embedded client). **Legal risk:** Low. **Recommendation:** **relayer onion endpoint + docs now** (rank 3).

### 9.2 I2P

- Few or no clearnet outproxies for RPC; would need RPC/relayer endpoints inside I2P. Smaller user base than Tor [U]. **Recommendation:** only if an operator wants to run an I2P eepsite mirror; no app work.

### 9.3 Nym mixnet

- **Facts [S]:** Loopix-based, entry gateway + three mix layers + exit gateway, per-packet routing, continuous-time mixing with exponential delays, client cover traffic; NymVPN offers a 5-hop "anonymous" mode with mixing and cover traffic and a 2-hop WireGuard mode without (nym.com docs, PETS 2026 paper). RPC-over-Nym use cases not confirmed.
- **Fit:** stronger than Tor against a global passive adversary in principle (cover traffic, mixing), at higher latency, which is acceptable for scans and sweeps but not for interactive quoting. Dependency on a token-incentivized network and its SDK.
- **Recommendation:** **Watch / user guidance** (users can run NymVPN anonymous mode); no SDK integration now.

### 9.4 Oblivious HTTP relay for RPC and relayer

- **Facts [P]:** BIP-77 uses OHTTP (RFC 9458) so a relay sees the client IP but not the content and the target sees content but not the IP.
- **Fit [U]:** an OHTTP relay in front of the GhostPay relayer and in front of a user's chosen RPC splits "who" from "what" under a non-collusion assumption, with lower latency than Tor and no client Tor stack. Requires a gateway at the target (the relayer can host one; public RPC providers mostly do not, **[U]**).
- **Effort:** M. **Recommendation:** **Evaluate for the relayer** (rank 5).

### 9.5 Light clients (Helios, Kohaku)

- **Facts [S]:** Helios (a16z) verifies RPC responses locally and compiles to WASM; upstream must serve `eth_getProof`; project says it is experimental and not yet recommended as a wallet's main RPC (a16zcrypto.com, GitHub README via search). Kohaku is an EF-led wallet SDK + Ambire-fork reference wallet with Helios, Railgun and PSE collaborating; planned private send/receive, IP hiding and P2P broadcasting [S2: Cointelegraph, QuickNode].
- **Analysis [U]:** Helios fixes **integrity** (lying RPC, S3-14) but not **query privacy**: the upstream still sees which addresses and slots are requested.
- **Recommendation:** track Kohaku as the likely ecosystem path; adopting its SDK later may deliver light client + Railgun + IP hiding together. Medium-term (rank 7).

### 9.6 View-tag scanning privacy and address-free verification

- **Facts [P]:** ERC-5564 view tags let a scanner skip ~255/256 announcements and reduce the security margin from 128 to 124 bits, affecting "only the privacy and not the secure generation" [P]. Scanning by downloading all announcements in a block range leaks only the range, not the matches [R Feature 5].
- **Leak is at verification, not scanning [R D8]:** per-address `eth_getBalance`/`eth_getTransactionCount` on a matched stealth address tells the RPC "this IP owns S1".
- **Concrete S-effort mitigation [U]:** verify receipts without naming the address: (a) for router payments, fetch the announcement tx receipt by block (already in the range download) and check the token `Transfer` log inside it; (b) for balance checks, request `Transfer` logs for the token contract over the same block range (topic-filtered by event, not by address) and compute balances locally; (c) when a per-address read is unavoidable (nonce before signing), batch it with k decoy addresses drawn from the same announcement range and send through Tor/OHTTP. (b) costs bandwidth proportional to token activity; on busy tokens limit to the blocks where the match occurred.
- **Recommendation:** **Do now** (rank 1, part of the D8 fix).

### 9.7 PIR for scanning

- Already specified as Feature 5 stage 2 (two-server DPF-PIR over fixed pages, non-collusion assumption) [R]. Ethereum.org's privacy roadmap lists PIR for private reads [R reference]. Given that scanning already downloads full ranges, PIR mainly helps the *verification* reads (9.6) and lighter clients; 9.6 achieves most of the benefit at far lower cost [U].
- **Effort:** L. **Recommendation:** keep research-only; revisit after 9.6.

---

## 10. Timing/amount correlation, anonymity sets and analytics heuristics

### 10.1 Heuristics known to break stealth-address schemes

Kovács and Seres, "Anonymity Analysis of the Umbra Stealth Address Scheme on Ethereum" (WWW 2023 companion; arXiv 2308.01703) identified the real recipient of **48.5% / 25.8% / 65.7% / 52.6%** of Umbra transactions on Ethereum mainnet / Polygon / Arbitrum / Optimism, using four behavioural heuristics, three of which are named in search summaries: registrant address reuse, same sender and receiver, and a collector pattern clustering stealth payments [S; percentages from the abstract via two summaries; fourth heuristic **[U]**]. The paper proposes wallet-side countermeasures (not re-read here).

Mapped to GhostPay:

| Heuristic | GhostPay exposure | Mitigation |
|---|---|---|
| Funding-gas link (ERC-5564 security consideration [P]) | Seller tops up S1 from a known wallet | Buffer/relayer/7702 only; UI hard-stop (4.4) |
| Collector / sweep consolidation | Several S_i swept to one destination (L5) | Enforce fresh destination per sweep; warn on reuse; never batch-sweep multiple S_i to one address (D1 fix) |
| Registrant address reuse | ERC-6538 registration from a wallet that also receives sweeps (L8) | Register from an unrelated address or not at all; per-client meta-address (4.8) |
| Same sender and receiver | Seller pays own invoice, or payer = later destination | UI warning when destination equals payer or a known counterparty [U] |
| Amount uniqueness | Invoice-specific amounts; net in metadata (L11) | Denominations at pool exits only (4.2) |
| Timing | Sweep shortly after receipt (L10) | Sweep jitter (4.3), only useful with a crowd |
| Fixed fingerprints | Router (L2), buffer wei precision (L9), 7702 delegate code (4.6), nonce-0 first tx (L12) | Round buffer; avoid persistent delegate; accept router fingerprint (D2) |
| Payer knowledge | Payer follows S1 (L3) | Only a pool exit (6.1) breaks it |
| Off-chain joins | RPC/relayer IP (L6, L7) | 9.1, 9.4, 9.6 |

ZK-mixer heuristics (Wang et al., 5.4) and Bitcoin change/peel-chain heuristics (Kappos et al., "How to Peel a Million", USENIX Security 2022, with Chainalysis-provided ground truth, reported false discovery rate ~0.02 [S, slide deck]) show the same lesson: analytics exploit **user behaviour** (reuse, exact amounts, quick round trips, consolidation) far more than cryptography. Primary Chainalysis methodology documents were not found in this session; claims about specific vendor capabilities are **[U]**.

### 10.2 Anonymity set: a back-of-envelope model [U]

For an outgoing transfer, an analyst's candidate set is the incoming events indistinguishable in **(token, amount bucket, time window, fingerprint class)**. Rough size:

```
|A| ~ (events per day in the crowd for that token) x (window in days) / (number of amount buckets in use)
effective anonymity = 2^H, H = entropy of the analyst's posterior over candidates (<= log2 |A|)
```

Example: a GhostPay-only crowd with 10 USDC payments/day, a 3-day window and ~20 distinguishable amount buckets gives |A| ~ 1.5, i.e. essentially **no anonymity**, before any heuristic. The same sweep into a pool with, say, 500 same-token deposits/day using 5 standard denominations and a 7-day window gives |A| ~ 700 in principle, reduced by heuristics (Wang et al. measured ~27-46% reductions for Tornado-style pools). These numbers are illustrative, not measurements. **Audit gap D-13 (no real-world measurement) applies**: before claiming any improvement, measure on a public testnet and, for pools, from public deposit data.

### 10.3 What GhostPay could show users [U]

A local "crowd estimate" next to the sweep/exit button (count of same-token router payments in the last N days, from the already-downloaded announcement range) would make the limits concrete without overstating privacy.

---

## 11. What does NOT work (honest list)

1. **Chained stealth hops** (6.0): public 1-in/1-out chain; payer follows.
2. **Delays or splitting without a crowd** (4.2, 4.3): fan-outs and delays are recognisable; GhostPay's own crowd is tiny.
3. **ERC-4337 / paymasters / relayers as privacy** (4.5, 4.7): they change who pays gas, not the graph. The blueprint already says "Gas sponsorship is not a ZK mixer" [R].
4. **A ZK proof of authorization/solvency** that still spends S1 -> W in the clear: "A ZK proof does not hide public inputs" [R].
5. **Chaining relayers or off-chain onion routing of sweep requests**: hides nothing that is on-chain.
6. **Bridges, swaps, Monero/Zcash round trips** (8.x): amount/timing correlation and counterparties; Zcash round-trip heuristic; Bybit case.
7. **Our own mixer/pool, coordinator or ecash mint**: tiny anonymity set, largest audit surface, highest legal profile (5.4, 7.1, 7.4, section 12).
8. **SP outputs inside CoinJoin**: BIP-352 itself does not recommend it [P].
9. **Helios alone for query privacy**: integrity yes, privacy no (9.5).
10. **Policy accounts for privacy**: fixed destination becomes public (L13, D6).

---

## 12. Legal and compliance risk notes (factual, sourced; not legal advice)

**Flag: significant project risk.** The owner must obtain legal advice in each relevant jurisdiction before shipping any feature from sections 5-7 or operating any service around them (consistent with ADR-0006, D10, ADR-0015 [R]).

| Event | Facts | Sources (2026-10-21) |
|---|---|---|
| Tornado Cash sanctions | OFAC designated Tornado Cash (Aug 2022) [U: date recalled]; Fifth Circuit (*Van Loon v. Treasury*, Nov 2024) held immutable smart contracts are not "property" under IEEPA; Treasury delisted on 2025-03-21; a Texas district court later ruled Treasury's actions unlawful (date not confirmed) | [S2] Willkie Compliance Concourse (2025-03-25); Venable (Apr 2025); The Hacker News (Mar 2025) |
| Roman Storm (Tornado Cash dev, US) | Aug 2025 jury convicted on conspiracy to operate an unlicensed money transmitting business; hung on money laundering and sanctions conspiracy; prosecutors sought retrial; on 2026-08-25 the court moved the retrial to 2027-04-26; acquittal motion undecided as of late Aug 2026; no sentencing found | [S2] The Block; Cointelegraph; Decrypt; MLex |
| Alexey Pertsev (Tornado Cash dev, NL) | Convicted of money laundering by a Dutch court (May 2024), 64 months; appeal filed; pretrial detention suspended with electronic monitoring (Feb 2025); **2026 appeal status not found** | [S] The Block (several articles); Forklog |
| Samourai Wallet (US) | Founders arrested Apr 2024; pleaded guilty Jul 2025 to conspiracy to operate an unlicensed money transmitter (laundering counts dropped); Rodriguez 5 years (Nov 2025), Hill 4 years; >$6M restitution; prosecutors cited >$2B processed and ~$6M fees | [S2] Decrypt; Bitcoin Magazine; Wikipedia |
| zkSNACKs (Wasabi) | Stopped coordinator 2024-06-01, citing regulatory complexity; not charged | [S2] nobsbitcoin; blocktrainer; LearnBitcoin |
| DOJ policy statement | Aug 2025 (Galeotti, acting Criminal Division head): DOJ will not approve new 18 U.S.C. §1960(b)(1)(C) charges against developers of truly decentralized, non-custodial software absent criminal intent; "going forward"; **not binding**; other charges remain possible | [S2] WilmerHale (2025-09-10); Decrypt; The Block |
| FinCEN mixing NPRM | 2023-10-19 proposal under PATRIOT Act §311 treating international CVC mixing as a primary money laundering concern (recordkeeping/reporting); comments closed 2024-01-22; **final status not found** | [S2] FinCEN PDF; Perkins Coie; Davis Polk |
| EU AMLR | Art. 79: credit/financial institutions and CASPs may not keep anonymous accounts or handle anonymity-enhancing coins; full application in mid-2027 (sources say 1 July 2027; exact date and EBA delegated acts to be checked in the Official Journal) | [S] Cointelegraph; CPO Magazine; Reclaim The Net (advocacy) |

Factual observations for GhostPay (not conclusions of law) [U]:

- The convictions above concern **operators who ran services and/or collected fees** around mixing (Samourai coordinator and fees; Tornado Cash relayer/UI and governance were at issue in the Storm trial [U: trial details not re-read]). GhostPay already plans to operate a relayer and collect a router fee.
- Lower-risk posture if anonymization is ever offered: client-side only, opt-in, **no GhostPay fee on any anonymization step**, no GhostPay-operated pool, coordinator, ASP or withdrawal relayer, compliance-oriented pools (association sets / PPOI) only, clear documentation, and the existing `PolicyGate` hook decision made by the owner.
- EU-facing CASPs may refuse funds that touched pools or privacy coins after mid-2027; users should be told that pool exits can cause off-ramp friction.
- Marketing language matters: describing a feature as "untraceable" or "anonymous" is both inaccurate (section 11) and increases legal exposure.

---

## 13. Comparison table

Privacy gain is a realistic qualitative estimate for a GhostPay seller, assuming correct use. Legal risk refers to GhostPay's own exposure.

| # | Idea | Threat addressed | Realistic privacy gain | Effort | Maturity | Security risk | Legal risk | Recommendation |
|---|---|---|---|---|---|---|---|---|
| 4.1 | Chained stealth hops | L3/L4 | None | S | n/a | Low | Low-Med | Reject (keep fresh destination as hygiene) |
| 4.2 | Splitting / denominations | L11 | Only at pool edges | S | Common | Low | Low-Med | With 6.1 only |
| 4.3 | Sweep jitter | L10 | Low | S | Built (payer) | Low | Low | Cheap companion |
| 4.4 | Buffer rounding, dust and self-funding guard | L9, L12, funding link | Low-Med (removes fingerprints) | S | n/a | Low | Low | **Do now** |
| 4.5 | Relayer unlinking (multi-relayer, onion/OHTTP) | L6 | Med (off-chain) | S-M | Mature tech | Low | Med | Do (with 9.x) |
| 4.6 | EIP-7702 sponsored sweep | Gas funding, permit dependence | Neutral (enabler); adds fingerprint | M-L | Final EIP | Med-High (delegate) | Low-Med | Spike after audit |
| 4.7 | ERC-4337 paymaster | Gas funding | None extra | M-L | Mature | Med | Low-Med | Reject for privacy |
| 4.8 | Per-client meta-address | L8 | Med | S-M | n/a | Low | Low | Do (D3 backlog) |
| 5.1 | Privacy Pools exit | L3/L4/L5 | High if pool crowd large and rules followed | M | Production, young | Med (3rd party) | Med | **Top research candidate** |
| 5.2 | Railgun exit / shielded holding | L3/L4/L5 | High (same caveats) | M-L | Production | Med | Med | Alternative to 5.1 |
| 5.3 | Aztec | All on-chain | High (different chain) | L | Alpha, unaudited | High | Med | Watch |
| 5.4 | Own pool | All | Low (tiny set) | L | n/a | High | High | Reject |
| 5.5 | RLN for relayer limits | L6/L14 (IP-free abuse control) | Low-Med | M-L | Production (Waku) | Med | Low | Later |
| 5.7 | EIP-7503 wormholes | L2 | High if enshrined | n/a | Stagnant | n/a | Med | Watch |
| 6.2 | Pay from pool (sender privacy) | L1 | High for payer | S (docs) | Depends on pool | Low | Med | Document only |
| 7.1 | Post-receipt CoinJoin (BTC) | BTC linkage | Med-High | S (docs) | Coordinators fragmented | Low | High if operated | Docs only |
| 7.2 | BIP-77/78 PayJoin invoices | BTC common-input heuristic, amount | Med | M-L | 78 Deployed, 77 Draft | Med | Low-Med | Plan with BTC tier |
| 7.4 | Lightning / ecash | Rail change | High (custodial) | L | Production | High (custody) | High if mint | Out of scope |
| 7.5 | Monero swaps | Cross-chain | Low-Med (correlation) | L | Small, volunteer | Med | High | Reject |
| 7.6 | Liquid CT | Amounts | Med (small set) | L | Production | Med (federation) | Med | Low priority |
| 8.3 | Bridges | — | None | — | — | — | High | Never call it privacy |
| 9.1 | Tor / onion relayer | L7/L14 | Med | S-M | Mature | Low | Low | **Do (onion relayer + docs)** |
| 9.3 | Nym | L14 vs global adversary | Med-High | M | Production | Low | Low | Watch / user guidance |
| 9.4 | OHTTP relay | L6/L7 | Med (non-collusion) | M | RFC 9458 | Low | Low | Evaluate for relayer |
| 9.5 | Helios / Kohaku | Integrity (S3-14), later IP | Low for privacy | M | Experimental | Low | Low | Track Kohaku |
| 9.6 | Address-free verification | L7 | Med-High (for D8) | S | n/a | Low | Low | **Do now** |
| 9.7 | PIR scanning | L7 | Med | L | Research | Med | Low | Research only |

---

## 14. Ranked roadmap

Ordering principle: fix leaks GhostPay itself creates before adding third-party privacy systems; nothing ships before the core audit, signed releases and the owner's legal review (ADR-0015).

| Rank | Item | Effort | Depends on | Exit criterion |
|---|---|---|---|---|
| 1 | **D1/D8 leak fixes**: enforce fresh self-derived destination per sweep; block multi-stealth -> one destination; address-free receipt verification (9.6); RPC/relayer warnings | S | none | Testnet trace shows no per-address RPC read for scans; consolidation blocked in UI tests |
| 2 | **Fingerprint and funding hygiene** (4.4): round buffer, dust handling, self-funding hard-stop; per-client meta-address (4.8); sweep jitter (4.3) | S-M | 1 | Buffer values on a coarse grid; D3 closed |
| 3 | **Network**: relayer onion service + multi-relayer selection + docs for Tor Browser / NymVPN users (4.5, 9.1, 9.3) | S-M | relayer hosting decision | Relayer reachable over onion; no IP in logs verified |
| 4 | **Privacy Pools exit spike** on a testnet (6.1, 5.1), with denomination and delay rules, crowd estimate (10.3); compare Railgun (5.2) | M | 1-3, legal review | Written leakage measurement (D-13) on testnet; go/no-go ADR |
| 5 | **OHTTP relay** in front of relayer (9.4); evaluate EIP-7702 sponsored deposit/sweep (4.6) as gas enabler for rank 4 | M-L | core audit | ADR + contract spec change for any delegate; audit |
| 6 | **Bitcoin: BIP-77 PayJoin invoice mode** when the Bitcoin tier is wired (7.2); CoinJoin guidance docs (7.1) | M-L | BTC tier integration | Interop test with at least two PayJoin wallets |
| 7 | **Kohaku / Helios** adoption review (9.5) | M | Kohaku SDK maturity | Decision record |
| 8 | **Research only**: PIR (9.7), RLN relayer limits (5.5) | L | 1-3 | Protocol review |
| Watch | Aztec (5.3), EIP-7503 (5.7), Monero FCMP++ (8.1), Zcash Orchard follow-up (8.2), Storm retrial / Pertsev appeal / FinCEN rule / AMLR delegated acts (12) | — | — | Re-check quarterly |
| Rejected | Chained hops as privacy, own pool, coordinator, ecash mint, bridges/swaps as privacy, 4337 for privacy, SP-in-CoinJoin | — | — | — |

---

## 15. Open questions for the owner

1. Is any anonymization feature in scope at all, given section 12? If yes, is "client-side, opt-in, no fee, third-party compliance-oriented pool" acceptable?
2. Should the router fee apply to a payment that is later routed into a pool? (Recommendation: the router fee is charged at payment time as today; no extra fee on exit.)
3. Which chains/tokens would a pool exit target? Pool crowd size per token decides whether rank 4 is worth it.
4. Is a persistent 7702 delegate on stealth EOAs acceptable given the fingerprint (4.6)?

---

## 16. Sources (all retrieved 2026-10-21)

Primary specifications [P] (read from the official repositories; canonical URLs given):

- ERC-5564 Stealth Addresses (Final): https://eips.ethereum.org/EIPS/eip-5564 ; repo text https://github.com/ethereum/ERCs/blob/master/ERCS/erc-5564.md
- ERC-6538 Stealth Meta-Address Registry: https://eips.ethereum.org/EIPS/eip-6538
- ERC-4337 Account Abstraction (Final): https://eips.ethereum.org/EIPS/eip-4337
- EIP-7702 Set Code for EOAs (Final): https://eips.ethereum.org/EIPS/eip-7702
- EIP-7503 Zero-Knowledge Wormholes (Stagnant): https://eips.ethereum.org/EIPS/eip-7503
- BIP-352 Silent Payments (Complete): https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki
- BIP-374 DLEQ proofs (Draft): https://github.com/bitcoin/bips/blob/master/bip-0374.mediawiki
- BIP-375 Sending Silent Payments with PSBTs (Draft): https://github.com/bitcoin/bips/blob/master/bip-0375.mediawiki
- BIP-77 Async Payjoin (Draft): https://github.com/bitcoin/bips/blob/master/bip-0077.md
- BIP-78 A Simple Payjoin Proposal (Deployed): https://github.com/bitcoin/bips/blob/master/bip-0078.mediawiki
- BIP-327 MuSig2: https://github.com/bitcoin/bips/blob/master/bip-0327.mediawiki
- RFC 9458 Oblivious HTTP (referenced by BIP-77): https://www.rfc-editor.org/rfc/rfc9458

Papers [S unless noted]:

- Kovács, Seres, Anonymity Analysis of the Umbra Stealth Address Scheme on Ethereum: https://arxiv.org/abs/2308.01703
- Wang et al., On How Zero-Knowledge Proof Blockchain Mixers Improve, and Worsen User Privacy (WWW '23): https://arxiv.org/abs/2201.09035 ; https://eprint.iacr.org/2023/341
- Buterin et al., Blockchain Privacy and Regulatory Compliance: Towards a Practical Equilibrium: https://cif.unibas.ch/en/news/details/blockchain-privacy-and-regulatory-compliance-towards-a-practical-equilibrium/ ; PDF mirror https://www.newswise.com/pdf_docs/170903654855378_1-s2.0-S2096720923000519-main.pdf
- Kappos et al., How to Peel a Million (USENIX Security 2022), slides: https://SMeiklej.com/files/usenix22-slides.pdf
- Kappos et al., An Empirical Analysis of Anonymity in Zcash (USENIX Security 2018) [U, not retrieved]
- Möser et al., An Empirical Analysis of Traceability in the Monero Blockchain (PETS 2018) [U, not retrieved]
- Nym / Loopix: https://nym.com/docs/network/mixnet-mode/loopix ; PETS 2026: https://www.petsymposium.org/popets/2026/popets-2026-0055.pdf
- RLN: https://pse.dev/blog/rate-limiting-nullifier-rln ; https://vac.dev/rln ; https://ethresear.ch/t/semaphore-rln-rate-limiting-nullifier-for-spam-prevention-in-anonymous-p2p-setting/5009
- EIP-7503 discussion: https://ethereum-magicians.org/t/eip-7503-zero-knowledge-wormholes-private-proof-of-burn-ppob/15456 ; https://ethresear.ch/t/wormholes-and-the-cost-of-plausible-deniability/23728

Project and ecosystem docs [S]:

- Privacy Pools: https://www.theblock.co/post/348959 ; https://forklog.com/en/0xbow-implements-vitalik-buterins-alternative-to-tornado-cash/ ; https://l2beat.com/privacy/projects/privacy-pools ; https://docs.nethereum.com/docs/protocols/guide-privacy-pools ; https://docs.envio.dev/blog/privacy-in-public-case-study ; https://app.dealroom.co/companies/0xbow ; official (not reachable this session): https://docs.privacypools.com/
- Railgun: https://l2beat.com/privacy/projects/railgun ; https://blockworks.co/news/defi-privacy-zero-knowledge-proofs ; https://xgram.io/en/blog/how-to-use-railgun-for-shielded-defi-swaps
- Aztec: https://docs.aztec.network/participate/alpha ; https://thedefiant.io/news/blockchains/aztec-launches-alpha-v5-on-mainnet-with-faster-private-proving
- Fluidkey (comparator: server holds viewing node): https://l2beat.com/privacy/projects/fluidkey ; https://dedaub.com/audits/fluidkey/fluidkey-stealth-account-kit-may-24-2024/
- Kohaku: https://cointelegraph.com/news/ethereum-devs-unveil-kohaku-wallet-privacy-roadmap ; https://blog.quicknode.com/ethereum-kohaku-wallet-privacy-roadmap
- Helios: https://a16zcrypto.com/building-helios-ethereum-light-client/ ; https://github.com/a16z/helios
- ERC-4337 analytics view: https://www.elliptic.co/corpus/gen-2804/need-you-around/crypto-compliance-risks-and-controls-for-account-abstraction-wallets-and-erc-4337-bundlers.html
- Wasabi / zkSNACKs: https://nobsbitcoin.com/zksnacks-to-suspend-its-coinjoin-coordination-service-on-june-1st ; https://www.blocktrainer.de/en/blog/wasabi-wallet-zksnacks-also-discontinues-coinjoin-service ; https://www.nobsbitcoin.com/wasabi-wallet-v2-0-8/
- Whirlpool / Ashigaru: https://nobsbitcoin.com/how-to-recover-samourai-wallet-and-implications-for-different-types-of-users ; https://bitcoinnews.com/adoption/ashigaru-privacy-project-after-samourai ; https://cointelegraph.com/research/samourai-wallet-shutdown-implications-for-other-privacy-self-custody-tools
- Atomic swaps: https://git.hackliberty.org/Git-Mirrors/xmr-btc-swap ; https://www.crowdfundinsider.com/2021/05/176018-monero-xmr-and-bitcoin-btc-trustless-atomic-swaps-now-live-comit-network-reveals/
- Ecash: https://www.spark.money/research/fedimint-federated-ecash ; https://www.spark.money/research/ecash-chaumian-mints-bitcoin
- Liquid: https://docs.liquid.net/docs/liquid-features-and-benefits ; https://enterprise.blockstream.com/docs/amp/intro/what-is-liquid ; https://spark.money/research/liquid-network-federated-sidechain
- Monero FCMP++: https://www.bitrue.com/blog/when-is-next-monero-hard-fork-xmr-testnet-upgrade ; https://cryptoticker.io/en/monero-fcmp-stressnet-fork-october-2026/
- Zcash: https://blockworks.com/api/investor-report/zcash-token-holder-report-q2-2026/pdf ; https://blockworks.com/api/investor-report/zcash-token-holder-report-q1-2026/pdf ; https://tokenomist.ai/research/zcash-shielded-balances-etf-holdings-locked-supply
- Bybit / THORChain: https://www.theblock.co/post/343855/bybit-hackers-half-the-stolen-eth-bitcoin-fbi-confirms-lazarus ; https://info.arkm.com/research/lazarus-bridged-1-3b-of-bybit-eth-to-bitcoin

Legal [S]:

- Tornado Cash delisting: https://complianceconcourse.willkie.com/articles/united-states-removes-economic-sanctions-against-tornado-cash/ ; https://www.venable.com/insights/publications/2025/04/a-legal-whirlwind-settles-treasury-lifts-sanctions ; https://thehackernews.com/2025/03/us-treasury-lifts-tornado-cash.html
- Storm retrial: https://cointelegraph.com/news/roman-storm-retrial-delayed-april-2027 ; https://theblock.co/news/regulation/2026-08-26-tornado-cash-roman-storm-retrial-april-2027-412761 ; https://www.theblock.co/post/392937/roman-storm-tornado-cash-retrial ; https://decrypt.co/376577/roman-storms-tornado-cash-retrial-pushed-to-april-2027
- Pertsev: https://www.theblock.co/post/294906/tornado-cash-alexey-pertsev-appeals-conviction ; https://www.theblock.co/post/339401/tornado-cash-developer-alexey-pertsev-gets-nod-for-conditional-release-from-prison-to-work-on-appeal
- Samourai: https://decrypt.co/347601/developer-bitcoin-app-samourai-sentenced-5-years-prison ; https://decrypt.co/349305/samourai-wallet-cto-william-hill-sentenced-four-years-prison ; https://bitcoinmagazine.com/news/samourai-wallet-co-founder-sentenced ; https://en.wikipedia.org/wiki/Samourai_Wallet
- DOJ statement: https://www.wilmerhale.com/en/sitecore/content/whlaunch/home/research/news-publications/20250910-doj-signals-approach-to-digital-assets-what-it-means-for-developers-and-platforms ; https://decrypt.co/336327/tornado-cash-roman-storm-doj-crypto-charges ; https://www.theblock.co/post/367858
- FinCEN NPRM: https://www.fincen.gov/sites/default/files/federal_register_notices/2023-10-19/FinCEN_311MixingNPRM_FINAL.pdf ; https://perkinscoie.com/insights/update/treasury-proposes-broad-reporting-requirements-cryptocurrency-mixing-transactions
- EU AMLR: https://cointelegraph.com/news/eu-crypto-ban-anonymous-privacy-tokens-2027 ; https://www.cpomagazine.com/data-privacy/eu-looks-to-ban-privacy-coins-and-anonymous-crypto-accounts-by-2027/

Repository [R]: `README.md`, `docs/MASTER_BLUEPRINT.md`, `docs/CONTRACTS_SPEC.md`, `docs/MULTICHAIN_SPEC.md`, `docs/threat-model/THREAT_MODEL.md`, `docs/audits/04-independent-design-analysis.md`, `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md`, `docs/user/privacy-limits.md`, `docs/adr/ADR-LOG.md`.
