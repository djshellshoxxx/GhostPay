# Research: protocol, network and UX privacy options for GhostPay

Date: 2026-10-21 (all retrieval dates below are 2026-10-21). Branch `claude/remote-extensions-1`. Findings and ideas only; nothing here is implemented or claimed as a fix.

Evidence tags: [R] read in this repo (file:line); [P] primary source fetched this run (URL); [C] computed by me this run; [U] unverified (recalled, or the primary source was unreachable). Anything not tagged [R]/[P]/[C] is [U].

## 0. Reachability (what I could and could not read)

Reachable: `raw.githubusercontent.com` (ethereum/ERCs, ethereum/EIPs, flashbots/*, Uniswap/UniswapX, nymtech/nym, katzenpost/katzenpost, hoprnet/hoprnet, ietf-wg-ohai, ietf-wg-privacypass), registry.npmjs.org, pypi.org, pkg.go.dev.
Unreachable (proxy `connect_rejected` or DNS fail): arxiv.org, export.arxiv.org, eprint.iacr.org, ia.cr, eips.ethereum.org, docs.flashbots.net, collective.flashbots.net, writings.flashbots.net, usenix.org, petsymposium.org, ndss-symposium.org, dl.acm.org, link.springer.com, doi.org, semantic scholar / crossref / openalex APIs, web.archive.org, ethresear.ch, ethereum-magicians.org, vitalik.eth.limo, hackmd.io, nym.com, research.nymtech.net, katzenpost.network, docs.hoprnet.org, docs.cow.fi, docs.uniswap.org, docs.across.to, rfc-editor.org, datatracker.ietf.org, w3.org. api.github.com returned 403.
Consequence: academic papers (Loopix, Sphinx, Kovacs-Seres Umbra analysis, Wang et al. mixer heuristics, MEV-Share and SUAVE design posts, CoW/Across docs) could NOT be read. Statements about them are [U] and named by title only. The Flashbots docs source (`flashbots/docs` on GitHub, Docusaurus .mdx) and the spec repos were read instead, which are primary for those projects.

## 1. GhostPay baseline relevant to this topic (verified in code)

| Fact | Evidence |
|---|---|
| Sweep contract authorises by EIP-712 signature only; it never reads `msg.sender`. Anyone can submit a signed sweep. | `packages/contracts/src/GhostPaySweepRelayer.sol:109` (`ECDSA.recover(digest, sweepSig) != s.owner`); grep for `msg.sender` in that file returns no code use [R] |
| Sweep signature is `ECDSA.recover` (EOA keys only; no ERC-1271 path). | same file :109 [R] |
| `Swept(token, owner, destination, amount, fee)` is emitted per sweep, so owner, destination and amount are public regardless of who submits. | `GhostPaySweepRelayer.sol` `_execute` end; `IGhostPaySweepRelayer.sol:48` [R] |
| Relayer sends one tx per sweep, immediately after simulation, from one hot key, legacy `gasPrice`, gas limit = estimate +20%. No batching, no hold queue, no private endpoint. | `apps/relayer/src/service.ts:331-365`; `apps/relayer/src/chain.ts:73,98,139-148` [R] |
| `feeTo` defaults to the hot key address. | `apps/relayer/src/config.ts:197` [R] |
| Relayer has exactly one `rpcUrl` per chain, https/wss only. No separate submit endpoint. | `apps/relayer/src/config.ts:200-209` [R] |
| Timing jitter exists only on the payer side (`DelayScheduler`, `randomDelayMs`); `Sweep.tsx` and `relayerClient.ts` have no delay logic. | `apps/web/src/lib/jitter.ts`; `apps/web/src/views/Pay.tsx:9,45`; no `jitter`/`Delay` hit in `apps/web/src/views/Sweep.tsx` [R] |
| Enabled chains are Sepolia and Base Sepolia only. | `packages/chain-adapters/src/config/chains.ts:34-35` (per `docs/remote/privacy-specs/network-privacy.md` header) [R by reference] |

Already specified elsewhere (not repeated): Tor/I2P/Nym/OHTTP transport profiles and PIR scanning (`docs/remote/privacy-specs/network-privacy.md`, `docs/remote/onion-i2p-research.md`), chained stealth, pools, 7702 and 4337 first-pass notes (`docs/remote/anonymization-research.md` sections 4, 9, 10). This document adds: verified primary-source facts, mixnet/cover-traffic, batching, intent/solver, private order flow, relayer design comparison, measurement, and a ranking.

## 2. Primary-source findings per technology

### 2.1 Mixnets and cover traffic

- Nym: `mixnode` "shuffles Sphinx packets together"; entry/exit gateways; exit gateway has an IP packet router and network requester to reach the internet; `nym-socks5-client` is a local SOCKS5 proxy. [P] https://raw.githubusercontent.com/nymtech/nym/develop/README.md
- Katzenpost: mix nodes "mix many messages together and cryptographically transform them"; "shuffling or added latency" create uncertainty; Pigeonhole storage layer over Sphinx round-trips; repo tree lists `sphinx/`, `wire/` (PQ Noise), `http-proxy-client`/`http-proxy-server` (HTTP-over-mixnet, so a service can be reached inside the mixnet with no exit), and `loops/` ("Decoy-loop packet-loss heat map types"). [P] https://raw.githubusercontent.com/katzenpost/katzenpost/main/README.md
- HOPR: libp2p-based privacy messaging protocol with relay nodes paid by token incentives (`hopr-lib`, `hoprd`). [P] https://raw.githubusercontent.com/hoprnet/hoprnet/master/README.md. Cover-traffic design not readable here [U].
- Loopix (Piotrowska et al.) is the usual reference for Poisson-delay mixes plus loop/drop cover traffic; Nym and Katzenpost descend from it. Paper unreachable (arxiv 1703.00536 `connect_rejected`) [U].
- Fit logic [C/analysis]: sweeps are not latency sensitive (deadline is signed; relayer quote is stateless), so mixnet latency is nearly free for the sweep path. It is NOT free for `eth_getLogs` scanning or wallet RPC. A mixnet hides the sender IP from the relayer; it does not hide the request content from the relayer nor the on-chain `Swept` event.
- Cover traffic for GhostPay: constant-rate dummy requests only hide WHEN a user is active. Cheap, safe variants: (a) fixed-schedule scan polling independent of invoice activity (already NP-S-3 in `network-privacy.md`), (b) dummy `/v1/quote` calls with decoy tuples. (b) is weak: a real sweep must carry the same tuple as its quote (`docs/remote/security-specs` PO-COR-3 per network-privacy.md), so the relayer can still pair them; decoys only widen the quote set. Not recommended on its own.

### 2.2 Batching and timing decorrelation

- On-chain edge facts: batching N sweeps in one tx does not change what is public: each `Swept` event still names owner, destination, amount [R]. It removes per-sweep gas-payer variation (already one hot key) and coarsens timing from "tx" to "block/tx-position". It saves intrinsic gas.
- Contract compatibility [R]: because the sweep entry points ignore `msg.sender`, a generic multicall (for example Multicall3 `aggregate3` with `allowFailure`) can batch sweeps with no contract change. I did not run this; [U] on exact Multicall3 address/availability on Sepolia/Base Sepolia.
- Timing model [C]. If payments arrive as a Poisson process of L per day and each sweep is delayed by D ~ Uniform(0, W days), an observer who sees a sweep at time t has expected candidate set 1 + L*W (the true payment plus other arrivals in the last W). With fixed delay the set collapses to 1. Table (expected candidate payments, same token, ignoring amount and other heuristics):

| L (payments/day, same token) | W=0.1 d | W=1 d | W=3 d | W=7 d |
|---|---|---|---|---|
| 2 | 1.2 | 3 | 7 | 15 |
| 10 | 2.0 | 11 | 31 | 71 |
| 100 | 11 | 101 | 301 | 701 |
| 1000 | 101 | 1001 | 3001 | 7001 |

  Caveats: amounts and other fingerprints (exact fiat-quoted amounts, `FeeCollected`, router announcer topic) usually shrink this by orders of magnitude; the crowd is only GhostPay users of that token on that chain; it is an upper bound. Matches the repo's own finding that "Delaying one transaction is not a proper anonymity set" (quoted in `anonymization-research.md` 4.3).
- Honest limit: a hold-queue in the relayer means the relayer holds a signed order for up to W, which increases the window for the owner's nonce/permit to be invalidated (7702 spec warns relayers can be griefed by invalidating authorisations, `eip7702.md:564-569`; same class applies to a front-run permit/nonce [R] contract comments).

### 2.3 Private mempools and order flow

- Flashbots Protect: transactions "hidden from the public mempool"; RPC `rpc.flashbots.net/fast` (mainnet) and `rpc-sepolia.flashbots.net` (Sepolia); no failed-tx inclusion; fast mode multiplexes to all registered builders and "Full transaction information is also shared with searchers in TEEs"; "When you send your transaction to a builder, you trust them not to frontrun your transaction or disclose it"; priority fee 0 is rejected; Tor onion endpoint `protectfbnoqyfgo3t5ouw3c7odp55qqoxnfdd7u24nzz5pkbclbzzyd.onion`; privacy notice "does not track user information (i.e. IP, location, etc.)" (a claim, unverifiable). [P] https://raw.githubusercontent.com/flashbots/docs/main/docs/flashbots-protect/quick-start.mdx and .../overview.mdx
- MEV-Share bundles carry `privacy.hints` ("If no hints are specified, no data is shared") and `privacy.builders` allowlist; refunds via `refundConfig`. MEV-Share only accepts backruns today (docs intro). [P] https://raw.githubusercontent.com/flashbots/mev-share/main/specs/bundles/v0.1.md ; https://raw.githubusercontent.com/flashbots/mev-share-node/main/README.md ; https://raw.githubusercontent.com/flashbots/docs/main/docs/flashbots-mev-share/introduction.mdx
- SUAVE: spec repo states "The SUAVE protocol is still in alpha state, and the code is the most up-to-date protocol spec"; testnets Rigil/Toliman; confidential data store, MEVM, kettles; Andromeda track uses SGX. [P] https://raw.githubusercontent.com/flashbots/suave-specs/main/README.md
- Relevance: a sweep is a plain token transfer with no extractable MEV, so refunds and hints add nothing. The only benefit of private submission is that the sweep is not visible in the public mempool before inclusion (leak N9 in `network-privacy.md`) and the relayer's RPC provider need not see the raw tx early. Cost: trust a builder/Protect operator instead; Base Sepolia coverage unknown [U] (sequencer-based L2s generally have no public mempool [U]).
- Protocol watch items: EIP-7732 ePBS status Last Call (`eip7732.md:7`), introduces in-protocol builders; EIP-7805 FOCIL status Draft, inclusion lists built "according to their subjective view of the mempool" (`eip7805.md`), so privately submitted txs are not covered by ILs. [P] https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-7732.md , .../eip-7805.md. Neutral for GhostPay today.

### 2.4 Stealth + account abstraction

- ERC-5564 (Final): announcer + metadata whose first byte is the view tag; view tags give ~6x scan speedup. [P] https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md (:118, :233). ERC-6538 registry (Final).
- EIP-7702 (Final): type `0x04` set-code tx, authorization tuple `[chain_id, address, nonce, y_parity, r, s]`, delegation indicator `0xef0100||address`; lists Batching, Sponsorship, Privilege de-escalation as goals; warns sponsored relayers can be made to spend gas without reimbursement; front-run initialisation requires ecrecover-checked init. [P] https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-7702.md (:14-20, :520-530, :564-569). Privacy implication: delegation is visible as account code (`eth_getCode` returns the indicator) [U on RPC behaviour; follows from spec text], so a GhostPay-specific delegate labels every stealth address that used it; a widely used generic delegate makes the label a crowd.
- ERC-4337 (status Final in the fetched copy, `erc4337.md:7`, `requires: 712, 7702`): lists "Privacy-preserving applications" as a use case (:35) but defines no privacy mechanism; paymaster and bundler see the UserOperation; `sender` and `paymasterAndData` are in public calldata. ERC-7562 (Review) validation rules and reputation; ERC-7677 (Review) paymaster web-service API; EIP-7701 is Withdrawn and EIP-7873 Stagnant. [P] raw GitHub ERCs/EIPs, status lines read from front matter.
- ERC-7739 (Draft): defensive rehash for ERC-1271 to stop cross-account signature replay when one EOA owns several smart accounts. Relevant only if a smart-account sweep path with 1271 is added; current relayer is EOA-only [R]. ERC-7579 (Draft), ERC-7710 and ERC-7715 (Draft) are modular-account and delegation standards; no privacy mechanism found in their abstracts.
- Verdict [analysis]: 7702 is a gas/permit enabler, 4337 adds observers; neither unlinks. Matches `anonymization-research.md` 4.6-4.7; I re-verified the spec statements they rest on.

### 2.5 Intent / solver systems

- ERC-7683 (Draft): solver-facing interface; resolver contract translates opaque order payloads into a common representation read via `eth_call`; supports "escrow-first, fill-first using resource locks, or auction-based" (`erc7683.md:14-30`). ERC-7521 (Draft): generalised intents via an entry point (`handleIntents`) any searcher can solve. [P] raw ERCs.
- UniswapX: swapper signs orders; fillers execute; reactors pull inputs "using permit2 `permitWitnessTransferFrom` with the order as witness" (`uniswapx.md:20`); reactors include Dutch, Exclusive Dutch, Priority; mainnet addresses listed. [P] https://raw.githubusercontent.com/Uniswap/UniswapX/main/README.md
- Mechanism fit [analysis]: a stealth EOA can sign a Permit2 witness order (gasless; no ETH buffer) whose output recipient is a fresh address, possibly on another chain. The on-chain graph then reads stealth -> filler and filler -> recipient; the link between them exists only in the filler's off-chain book plus amount/time correlation. Privacy therefore depends on the filler pooling many users and on output amounts not being unique; with few users it is a plain trusted relay. Cross-chain variant also addresses leak M8 (same meta-address across chains) from `metadata-hardening.md`.
- Not verified: whether UniswapX or any ERC-7683 filler network is live on Sepolia/Base Sepolia (docs sites unreachable) [U]. CoW Protocol batch auctions (uniform clearing price, batching) could not be read (`docs.cow.fi` blocked; `cowprotocol/docs` README is only a build stub) [U].

### 2.6 Meta-transaction relayer designs (comparison)

| Design | Who signs what | Gas payer | Token without permit | Unlinks? | Evidence |
|---|---|---|---|---|---|
| Current: EIP-712 `Sweep` + ERC-2612 permit, relayer contract | owner signs order; permit signature | relayer hot key; fee in token to `feeTo` | no (permit only; DAI-style unsupported) | no (event names owner/destination) | `GhostPaySweepRelayer.sol:22-30,109` [R] |
| ERC-2771 trusted forwarder (Final) | signer signs request; forwarder appends 20-byte signer to calldata | forwarder submitter | needs recipient contract to trust forwarder | no | https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-2771.md :41,52-53 [P] |
| EIP-7702 sponsored delegate | owner signs authorization + intent | sponsor | yes (delegate calls `transfer`) | no; adds code-label fingerprint | `eip7702.md` [P] |
| ERC-4337 account + paymaster | userOp signature | bundler/paymaster | yes (paymaster pays gas, tokens via account) | no; adds mempool + paymaster observers | `erc4337.md` [P] |
| Intent filler (7683/UniswapX style) | order signature (Permit2 witness) | filler | yes (Permit2) | partial, only via filler pooling | `uniswapx.md:20` [P] |

### 2.7 Network request privacy (IETF, repo-reachable)

- Oblivious HTTP draft (ietf-wg-ohai): padding "can help reduce the effectiveness of traffic analysis" (`ohttp.md:1135`), timing delays also mentioned (:1158). Relay sees client IP, gateway sees request; non-collusion required. [P] https://raw.githubusercontent.com/ietf-wg-ohai/oblivious-http/main/draft-ietf-ohai-ohttp.md. Final RFC number not re-verified [U].
- Privacy Pass architecture draft: defines unlinkability between issuance and redemption and "redemption anonymity set" (`ppa.md:335-352`); notes deployment choices can shrink the anonymity set (:565). [P] https://raw.githubusercontent.com/ietf-wg-privacypass/base-drafts/main/draft-ietf-privacypass-architecture.md. Applicable as anonymous relayer rate-limit credentials instead of IP-keyed limits (relayer currently keys limits by client IP, per `docs/remote/modules-needed.md` rank 2) [R by reference].

### 2.8 Anonymity-set measurement tools

- Prior art (all [U], unreachable): Kovacs and Seres, Umbra anonymity analysis (arXiv 2308.01703): behavioural heuristics identified roughly half of recipients on Ethereum (figures in `anonymization-research.md` 10.1 come from summaries); Wang et al. on Tornado-style pools.
- What can be built locally without those papers: the metric in section 3 below and a heuristic harness over the app's own announcements. Router announcements are enumerable by one topic (leak M2 in `metadata-hardening.md`), so any outside analyst can compute the same numbers; shipping the tool to users only equalises knowledge.

## 3. Ranked ideas

Scoring: Fit = value for GhostPay's actual leaks (H/M/L); Effort S/M/L; Risk = privacy-claim or security risk of adding it; Maturity = of the underlying standard/tool. Ranking weighs honest privacy gain per effort; none of these gives anonymity by itself.

| Rank | Idea | Fit | Effort | Risk | Maturity | Why |
|---|---|---|---|---|---|---|
| 1 | Sweep-side timing decorrelation: client sweep delay (reuse `jitter.ts`) plus optional relayer hold window with random release | H | S | Low (stale nonce/permit while held; user must see "not anonymity") | High (local code exists) | Closes the verified gap that only payers jitter; model in 2.2 shows value scales with crowd. Never pre-sign and hold raw txs on the client (repo rule). |
| 2 | Anonymity-set measurement harness and in-app "crowd estimate" | H | S-M | Low (risk is overstating; show 1/sum(p^2) and caveats) | n/a (own code) | Required before any privacy claim (`anonymization-research.md` D-13). Definitions in section 4. |
| 3 | Mixnet or OHTTP/Tor transport for the sweep and quote path only (latency-tolerant), with in-mixnet service option (Katzenpost HTTP proxy) | M-H | M | Med (exit node sees plaintext; Nym web SDK experimental [U]) | Med | Sweep is the one request that joins IP to owner+destination+amount. Aligns with `network-privacy.md` profiles; this adds the argument for mixnet specifically. |
| 4 | Multiple independent relayers with client random choice and per-request circuits; Privacy Pass style anonymous rate-limit tokens | M | M | Med (operator duty, abuse) | Med (IETF drafts) | Removes single relayer as global correlator and IP-keyed limiting. |
| 5 | Private submission endpoint for relayer (Flashbots Protect Sepolia/onion; configurable `submitUrl`) | L-M | S | Low-Med (trust builder; no mainnet yet; Base Sepolia unknown) | High on Ethereum, [U] on L2s | Only hides pre-inclusion visibility; no MEV to protect. Cheap config. |
| 6 | Batched sweeps via generic multicall with `allowFailure` | L-M | S-M | Med (partial failure accounting, fee budget) | High | No contract change (sweep ignores `msg.sender`). Gas saving and timing coarsening; does not hide events. Only useful together with rank 1. |
| 7 | EIP-7702 sponsored sweep with a generic, widely-used delegate | M (UX) | M-L | High (delegate bugs, persistent code label, chain-id-0 replay, griefing `eip7702.md:564`) | Final spec | Enabler for non-permit tokens and no-ETH-buffer; privacy-neutral at best. Needs contract + audit. |
| 8 | Intent/solver exit (Permit2 witness order or 7683 resolver) to fresh address/chain | M (cross-chain UX, M8) | L | High (filler trust, amount linkage, availability on testnets [U]) | 7683 Draft; UniswapX live on mainnet | Only privacy-positive with pooled filler inventory and standard amount buckets. Research spike. |
| 9 | Relayer fingerprint hygiene (type-2 tx, rounded gas limit, per-chain fee recipient rotation) | L | S | Low | n/a | Relayer is already identified by contract call; marginal. Keep for completeness. |
| 10 | ERC-4337 paymaster/bundler path | L | M-L | Med | Final | Adds observers (bundler, paymaster, mempool); no unlinking. Do not pursue for privacy. |
| 11 | MEV-Share hints/refunds, SUAVE | L | M-L | Med | MEV-Share live; SUAVE alpha ("code is the most up-to-date spec") | No MEV in sweeps; SUAVE too immature. Reject for now. |
| 12 | Cover-traffic dummy quotes | L | S | Low | n/a | Pairing by tuple defeats it (2.1). Only fixed-schedule scan polling is worthwhile. |

## 4. Comparison table (technique vs leak)

Leak ids from `anonymization-research.md` / `network-privacy.md` / `metadata-hardening.md`. Y = materially reduces, P = partially, N = no, ? = unverified.

| Technique | Relayer sees IP | RPC/ISP sees IP | Public mempool visibility (N9) | Timing link (L10) | On-chain owner->dest edge (L4/L5) | Fingerprint added | Needs contract change |
|---|---|---|---|---|---|---|---|
| Sweep delay/hold window | N | N | N | P (crowd-bound, table 2.2) | N | none | no |
| Mixnet/OHTTP/Tor transport | Y | Y (to chosen hop) | N | N | N | none | no |
| Multiple relayers | P | N | N | N | N | none | no |
| Private submit (Protect) | N | P | Y | N | N | trust in builder | no |
| Batched sweeps | N | N | N | P | N | batch contract call pattern | no (multicall) |
| EIP-7702 sponsored | N | N | N | N | N | delegate code label | yes (delegate) |
| ERC-4337 paymaster | N | N | P (alt mempool) | N | N | account bytecode, bundler | yes |
| Intent/solver exit | N (solver sees) | N | P | N | P if pooled | solver address | yes/external |
| Pool exit (see AR 6.1) | N | N | N | Y (crowd) | Y | pool label | yes |
| Anonymity-set measurement | n/a | n/a | n/a | measures L10 | measures L4/L5 | none | no |

## 5. Anonymity-set metric definitions (for rank 2)

For a sweep s, let candidates be payments p in the same (chain, token) with arrival time in [t_s - W, t_s]. Give each a probability w_p from the analyst model (start uniform; then reweight by amount match, announcer metadata match, destination reuse). Effective set size = 1 / sum_p w_p^2 (collision entropy based), or 2^H with Shannon H. Report both with the heuristic list used. Uniform model gives the table in 2.2 [C]. Do not publish a single "anonymity score"; publish the set size per heuristic and the date range.

## 6. Findings (severity, evidence, reproduction, suggested fix)

All are gaps relative to privacy goals, not exploitable vulnerabilities. Nothing was run against a network.

- F1, Low-Med (privacy): no sweep-side timing decorrelation. Evidence: `apps/web/src/views/Sweep.tsx` and `apps/web/src/lib/relayerClient.ts` have no delay; jitter used only in `Pay.tsx:9,45`; relayer sends immediately `apps/relayer/src/service.ts:331-365`. Reproduction: `grep -n -i 'jitter\|randomDelay' apps/web/src/views/Sweep.tsx apps/web/src/lib/relayerClient.ts apps/relayer/src/service.ts` returns nothing. Suggested fix: rank 1.
- F2, Low (privacy): relayer submits all sweeps over the same public RPC with a single hot key, legacy gas price, +20% headroom, `feeTo` equal to the hot key by default. Evidence: `chain.ts:73,98,139`, `config.ts:197`. Reproduction: read lines cited. Suggested fix: ranks 5 and 9; low benefit.
- F3, Info: no support for a separate submission endpoint. Evidence: single `rpcUrl` per chain `config.ts:200-209`. Suggested fix: optional `submitUrl` (rank 5).
- F4, Info (claim hygiene): sweeps are batchable at the contract level because auth ignores `msg.sender`; the same property means any third party can front-run submit a seen signed sweep (fee still goes to signed `feeTo`, so the original relayer loses the fee but funds are safe). Evidence: `GhostPaySweepRelayer.sol:109` and no `msg.sender` use; `feeTo` is inside the signed struct (`SWEEP_TYPEHASH` :35-37). Reproduction: static read. Not exploited here. Suggested fix: none required; relevant to the hold-window design in rank 1 (a held request visible to others could be raced if it leaks).
- F5, Info: audit-report claims about these topics in `docs/remote/audits/` were not re-verified in this task (out of scope).

## 7. Open items and unverified

- Could not read: Loopix, Sphinx, Kovacs-Seres, Wang et al., MEV-Share design post, SUAVE posts, CoW docs, Across docs, RFC 9458/9576 final text. Re-check from a host with access.
- Availability of Multicall3, Permit2, UniswapX or any 7683 filler, Flashbots-style private RPC on Sepolia/Base Sepolia: only Flashbots Sepolia RPC is documented in fetched text; others unverified.
- Nym web SDK maturity and per-request exit rotation: carried from `onion-i2p-research.md`, not re-verified here.
- Nothing was built or run beyond arithmetic in section 2.2 (`python3 -I`, expected value 1+L*W, trivial).
