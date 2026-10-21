# Chain-analysis attacks on stealth-address systems, mapped to GhostPay

Branch `claude/remote-extensions-1`, written 2026-10-21. Research only: findings, no fixes claimed, no code changed. Retrieval date for every URL: 2026-10-21.

## 0. Evidence labels and source reachability

| Label | Meaning |
|---|---|
| [P] | Primary text read in full or in the relevant section this session (fetched from GitHub raw). |
| [S] | Paper abstract/claim seen only through a web-search summary; full text not read. Numbers are quoted from the summary and must be re-checked against the paper. |
| [U] | Recalled from prior knowledge or reasoned; not retrieved. A hypothesis. |
| [C] | GhostPay code verified at file:line this session. |

Reachability (curl/WebFetch from this env): REACHABLE only `raw.githubusercontent.com` (ethereum/ERCs, bitcoin/bips, ScopeLift/umbra-protocol). UNREACHABLE (connection failed / ENOTFOUND): arxiv.org (abs, pdf, export, html), eprint.iacr.org, dl.acm.org, researchgate.net, deepai.org, liner.com, eips.ethereum.org, ethresear.ch, docs.umbra.cash, docs.fluidkey.com. github.com/api.github.com HTML/API: 403 via curl. GitHub repo search found no code for the Umbra analysis. Consequence: the key empirical paper below is [S] only; Fluidkey and chain-analytics-vendor material could not be read at all.

Primary documents actually read:
- ERC-5564 Stealth Addresses: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md [P]
- ERC-6538 Stealth Meta-Address Registry: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-6538.md [P]
- BIP-352 Silent Payments: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki [P]
- Umbra README (privacy section): https://raw.githubusercontent.com/ScopeLift/umbra-protocol/master/README.md [P]

## 1. What the primary specs themselves admit

1. ERC-5564 "Recipients' transaction costs": "The funding of the stealth address wallet represents a known issue that might breach privacy. The wallet that funds the stealth address MUST NOT have any physical connection to the stealth address owner"; suggested remedy: sender attaches a little ETH to each stealth transaction. [P] (This is the origin of GhostPay's `payERC20WithBuffer`.)
2. ERC-5564 Security Considerations contains no discussion of withdrawal linkage, timing, amounts or registry linkage; only DoS and funding. [P]
3. ERC-6538 registry maps `registrant => schemeId => stealthMetaAddress` and emits `StealthMetaAddressSet(registrant indexed, ...)` (lines ~43, ~72). A registered meta-address is publicly bound to an EOA by construction. [P]
4. Umbra README: privacy is only "impossible for any outside observers ... to know who the sender paid by looking at the receiving address"; "poor hygiene by the receiver ... sending the funds directly to a publicly known address" removes the benefit; anonymity set is practically narrowed by ENS usage; "Umbra is not a mixer". [P]
5. BIP-352: labelled addresses share `B_scan`, so "an outside observer can easily deduce that each published pair is owned by the same entity ... labels are not meant as a way ... to manage separate identities"; CoinJoin-style inputs are excluded from shared-secret derivation. [P] (Bitcoin side, relevant to `packages/btc-silent-payments`, not wired into the app per README.)

## 2. Measured results in the literature

### 2.1 Kovács and Seres, "Anonymity Analysis of the Umbra Stealth Address Scheme on Ethereum" (arXiv 2308.01703; ACM DOI 10.1145/3589335.3651963)
URL: https://arxiv.org/abs/2308.01703 (UNREACHABLE; abstract-level facts via search summary) [S].
- Recovered the real recipient for 48.5% (Ethereum mainnet), 25.8% (Polygon), 65.7% (Arbitrum), 52.6% (Optimism) of Umbra transactions [S].
- Four heuristics. Seen by name/description in summaries [S]: (a) registry address reuse: withdrawal address equals an address previously registered in the stealth key registry (top performer); (b) same sender and receiver (funds returned to the sender); (c) collector pattern: many stealth addresses sweep to one address. The fourth heuristic was not identified in the retrieved summaries [unverified; the exact definitions and per-heuristic percentages must come from the PDF]. Authors frame them as user-behaviour flaws, with "easily implementable countermeasures" [S].
- Secondary mention: a Medium post describes funding a stealth address and returning funds to the original sending address [S, not verified against the paper].

### 2.2 General Ethereum address-linking work (used by analytics firms) [S/U]
- Béres, Seres, Benczúr, Quintyne-Collins, "Blockchain is Watching You: Profiling and Deanonymizing Ethereum Users", arXiv 2005.14051, https://arxiv.org/pdf/2005.14051: Tornado-Cash-style mixer deanonymization using gas price, deposit/withdraw timing, and address-reuse heuristics (existence confirmed by search result; details [U]).
- Tutela (Wang et al.), arXiv 2201.06811, https://arxiv.org/pdf/2201.06811: open-source tool applying heuristics to Tornado Cash and Ethereum (existence confirmed by search result; details [U]).
- "Clustering Deposit and Withdrawal Activity in Tornado Cash: A Cross-Chain Analysis", arXiv 2510.09433, https://arxiv.org/html/2510.09433v1 (search result only; not read) [S].
- Victor, "Address Clustering Heuristics for Ethereum" (Financial Crypto 2020): deposit-address reuse, airdrop multi-participation, self-authorisation heuristics [U, not retrieved; no URL verified].
- Bitcoin analogue: Möser et al., Monero traceability studies; common-input-ownership and change heuristics underpin BIP-352 design [U].

These supply the heuristic families the task asked for (funding, consolidation, timing, amount, gas price, reuse, relayer). Their measured effect on stealth systems specifically is established only by 2.1.

### 2.3 Not obtainable
Chainalysis/TRM/Arkham/Nansen/Etherscan labelling methodology, Fluidkey's own privacy docs and any Fluidkey-specific analysis: no primary source reachable. Do not infer vendor capabilities from this document.

## 3. Attack-to-GhostPay map

GhostPay facts used [C]: router announces via ERC-5564 with exact 57-byte metadata `viewTag|selector|token|net` (`packages/contracts/src/GhostPayRouter.sol:47`, check at `:227`); single router address = enumerable fingerprint; payer is `tx.from` of the payment; no ERC-6538 publish (`apps/web/src/views/SellerKeys.tsx:160`); sweep takes a free-text destination and only rejects self/GhostPay contracts (`apps/web/src/lib/sweep.ts:44-52`); sweep UI warns "Anyone can link the two addresses" (`Sweep.tsx:129`); optional native gas buffer `calculateBuffer` = 100000 gas * maxFeePerGas * 1.2 rounded up (`pay.ts:165,183`, `fees.ts:102-114`); relayed sweep fee = max(110% gas cost, 0.5% amount), cap 3% (`About.tsx:25`); relayer sees owner, destination, token, amount, timing (`Settings.tsx:84`); jitter helper for announcement delay (`lib/jitter.ts`, CSPRNG).

| # | Attack / heuristic | Source | How it hits GhostPay | Status in code | Mitigation idea |
|---|---|---|---|---|---|
| A1 | Sweep destination = known/registry/ENS/exchange address (reuse) | 2.1 (a), Umbra README | Sweep.tsx takes any destination; only a generic warning (Sweep.tsx:129). No check against destination history, ENS reverse name, or seller's own payer-visible address | OPEN (documented as D1 in THREAT_MODEL.md) | Warn/block when destination has prior tx history, an ENS reverse record, or was ever a payer in GhostPay; offer "derive fresh destination" |
| A2 | Payer follows stealth address to destination (payer knows S1) | Umbra README; THREAT_MODEL D1 | Payer is the one party who always knows S; sweep tx is public | Inherent; not mitigated by gasless sweep | Exit via shared-state pool or CoinJoin-like step; delay plus amount split |
| A3 | Collector / consolidation: many stealth addresses sweep to one destination | 2.1 (c), BIP-352 labels note | Merchant with N invoices sweeping to one wallet joins all N | OPEN; UI sweeps one target at a time but destination is typed by the user | Rotate destinations per batch; per-sweep fresh destination suggestion; warn on destination reuse across sweeps (local history) |
| A4 | Funding heuristic: stealth address gas funded from a wallet linked to owner | ERC-5564 Security Considerations | If seller tops up a stealth address from their main wallet, link is total | Mitigated by buffer (payer funds) or relayer (fee in token) | Keep both; warn if direct sweep requires manual gas top-up; never suggest top-up from known wallet |
| A5 | Buffer value fingerprint / payer-funded link | [U] | Buffer is a deterministic function of payer's RPC gas price (fees.ts:112), so the leftover dust after sweep and its exact wei value tie payment to a payer-computed number; leftover also remains as a residual balance that can be consolidated | Partially real: value is client-specific, not random | Round buffer to a coarse grid or add bounded random noise; sweep dust or document dust |
| A6 | Relayer metadata join (IP, owner, destination, amount, timing) | THREAT_MODEL D8 | Single relayer operator sees full sweep tuple | OPEN | Multiple relayers, Tor/OHTTP transport, client-side random jitter on request, relayer log minimisation |
| A7 | Relayer fee-amount fingerprint | [U] | Fee is formulaic (110% gas or 0.5% amount) so `amount-fee` reveals the source amount to any observer who can invert it, linking payment net amount (public in metadata) to sweep output | Real by construction: metadata publishes `net` (metadata.ts: 57-byte field) and sweep output = amount minus formula fee | Round amounts, split sweeps, or fee-in-native from buffer so output is not a function of `net` |
| A8 | Amount correlation (payment net amount equals sweep amount) | Tornado heuristics 2.2 [S/U] | Invoice amounts are often round; metadata publishes exact net on every payment | Real | Partial sweeps to differing amounts; split destinations; delay |
| A9 | Timing correlation (payment time vs sweep time) | 2.2 [S/U] | Sweep soon after payment is trivially linked; jitter helper exists for announcement only | Partially mitigated (jitter lib; unclear that it is applied to sweeps) | Randomised sweep delay with long tail; batch window; warn if sweep within N blocks |
| A10 | Gas-price / priority-fee fingerprint of the sweeper | 2.2 (gas-price heuristic, Béres et al.) [S] | Direct sweep from browser wallet uses the wallet's default fee; relayer uses legacy `gasPrice` and +20% gas headroom (`apps/relayer/src/chain.ts:98`), a constant signature across all relayed sweeps (anonymity set = relayer's users, which is fine) but payer-funded buffer sized at +20% safety may mirror user wallet defaults | Low-moderate | Use wallet-default fees; avoid distinctive gas limits; relayer should not expose per-user fee choices |
| A11 | Single-router anonymity set / contract fingerprint | THREAT_MODEL D2; Umbra README (ENS narrows set) | Every GhostPay announce goes through one router with a fixed 57-byte metadata layout; observers can enumerate all GhostPay payments cheaply (Announcement filter by router) | Accepted | Cannot hide; mitigate with pool exit and not publishing registry entries |
| A12 | Registry linkage (ERC-6538 publish binds meta-address to EOA) | ERC-6538 [P]; 2.1 (a) | GhostPay does not publish (SellerKeys.tsx:160) | OK today | Keep default off; warn on any future ENS/registry integration |
| A13 | Payer-side linkage: payer's own wallet history reveals merchant | [U] | Payer `tx.from` is public and routed through GhostPay router; if invoice merchant identity is known to payer's observers, payer-merchant link exists at the payment level (stealth only hides recipient) | Inherent | Out of scope for stealth; note in docs |
| A14 | Return-to-sender / same sender-receiver | 2.1 (b) | A refund or self-test where destination equals original payer address | OPEN (no check) | Reject or warn when destination equals any `tx.from` observed for payments into that stealth address |
| A15 | BIP-352 label sharing and transaction-shape heuristics | BIP-352 [P] | `packages/btc-silent-payments` supports labels; labels all share `B_scan` | Library only; not in app | If wired, warn that labels are not identities; avoid change-to-self label patterns that look like common-input patterns |
| A16 | Scanner/RPC side channel: provider sees which address balances you query | THREAT_MODEL D8 | Scan and sweep use user's RPC | OPEN | Local node, light-client, PIR-style RPC [U] |

## 4. Ranked ideas (impact on real linkage first)

1. Destination hygiene engine (A1, A3, A14): local checks on the sweep destination: previous on-chain activity (via the user's RPC), ENS reverse record, equality to payer `tx.from`, reuse across prior sweeps from local history. Highest measured impact (2.1 reports address reuse as the top heuristic) and effort S, no protocol change.
2. Shared-state exit path (A2, A7, A8, A9): optional sweep into an external pool / CoinJoin-like service instead of a direct address; GhostPay integrates, does not operate. Largest privacy gain, effort L, legal review required.
3. Amount decorrelation (A7, A8): partial sweeps into varying amounts, fee paid from the native buffer rather than as a token-formula cut, so the output is not an invertible function of `net`. Effort M.
4. Sweep timing policy (A9): long-tail randomised delay applied to sweeps (extend `lib/jitter.ts` use beyond announcements); warn on sweeps within a few blocks of payment. Effort S.
5. Relayer metadata reduction (A6): transport via OHTTP or Tor, multiple independent relayers, no-log default, client fan-out. Effort M.
6. Buffer shaping (A5): coarse rounding or noise on `bufferWei`, and sweep-out of the residual. Effort S.
7. Keep registry off by default, add explicit warning copy if ever added (A12). Effort S.
8. Fingerprint review of gas fields in relayed and direct sweeps (A10). Effort S.

## 5. Comparison table: stealth systems vs attacks (what the cited primary texts say)

| System | Registry linkage | Funding link | Withdrawal/consolidation | Relayer | Spec acknowledges? |
|---|---|---|---|---|---|
| ERC-5564 + ERC-6538 | Registry binds registrant to meta-address by design [P] | Called a "known issue" [P] | Not discussed [P] | Not specified | Funding only |
| Umbra | ENS narrows set [P] | Relayer withdrawals offered [P] | "Poor hygiene" warning [P]; measured failure rates [S] | Meta-tx relayer [P] | Yes, qualitatively |
| BIP-352 | Labels share `B_scan` [P] | N/A (UTXO) | Normal Bitcoin heuristics apply [U] | N/A | Labels only |
| Fluidkey | UNREACHABLE | UNREACHABLE | UNREACHABLE | UNREACHABLE | no data |
| GhostPay | No publish [C] | Buffer or relayer [C] | Free-text destination, warning only [C] | Sees full tuple [C] | THREAT_MODEL D1/D2/D8 |

## 6. Reproduction pointers (for follow-up agents)

- A1/A3/A14: unit-test `checkDestination` (`apps/web/src/lib/sweep.ts:44`) with a destination equal to a known payer or a previously used destination; currently it accepts it (verified by reading code, not by running a test).
- A5: `calculateBuffer` is deterministic for a given (gas, maxFeePerGas, bps) (`packages/chain-adapters/src/fees.ts:102`).
- A7: relayer fee formula in `About.tsx:25` and the metadata `net` field (`GhostPayRouter.sol:47,227`) show output is computable from public data; reproduction would need running the relayer quote code (not run this session).

## 7. Caveats

No heuristic was executed against live chain data. All empirical figures are from one paper known only through a search summary. Claims marked [U] are hypotheses. Haiku audits in docs/remote/audits were not used. Severity of each row is not rated beyond the ranking in section 4; no fix is claimed.
