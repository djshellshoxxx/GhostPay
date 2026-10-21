# Audit 4: Independent design-level security analysis (lead's own)

**Scope:** whole-system design, not line-by-line code. Written independently of the spec-based reviews (audits 02/03) and the completeness audit (01); overlaps are deliberate cross-checks. Evidence levels: **[verified]** = I read the code or ran it; **[reasoned]** = follows from the design, not tested.
**Date:** 2026-10-21. No external audit has been performed. Nothing here is a guarantee.

## D1. The sweep destroys the privacy the product sells (High, design) [reasoned + verified UI text]
The payer knows the stealth address they paid. Anyone, including the payer, can watch that address on a block explorer. When the seller sweeps to a wallet `W` the link `payer -> stealth -> W` becomes public, and `W`'s other inbound transfers reveal other customers' payments and the seller's balance. This is exactly the relationship stealth addresses were meant to hide. The Sweep view shows a generic "Linkability" notice [verified `apps/web/src/views/Sweep.tsx:128`] but does not say that the *payer* can follow the funds, and does not detect destination reuse.
Fixes: (1) rewrite the notice to name the payer-follows-funds risk; (2) before signing, query the destination (`eth_getTransactionCount`, balance) and warn loudly if it has history or equals a previously used destination; (3) recommend a fresh destination per sweep (HD-derived), batching/timing guidance; (4) in documentation, state that unlinkability after sweep needs a separate privacy mechanism (Feature 5 / pool research), and that the policy account's fixed destination makes the link permanent (see D6).

## D2. Single-router anonymity set and fingerprint (Medium, design) [reasoned]
All fee-paying payments go through one router address per chain with a constant 25 bps split. Analysts can enumerate GhostPay payments and group by fee recipient. The anonymity set is "GhostPay payments", not "all transfers". This is inherent to an enforceable fee and is already disclosed in the specs; it should be in the user-facing privacy page, not only the blueprint.

## D3. Seller meta-address is a stable public identifier (Medium, design) [reasoned]
Every invoice carries the same meta-address. Anyone holding two invoice links can prove both belong to one seller; ERC-6538 registration makes it public. Per-invoice or per-client meta-address derivation (same wallet seed, distinct spend/view pairs) would break this at the cost of scanning each viewing key. Recommend: offer "per-client meta-address" mode; document the limitation until built.

## D4. Payer-controlled view tag: undetectable payments (Medium) [reasoned]
The router cannot verify that the view tag or ephemeral key correspond to the recipient (CONTRACTS_SPEC). A malicious or buggy payer can pay a stealth address while publishing a wrong view tag, so the seller's tag-filtered scan never finds it; the payer may later claim the invoice was paid. Mitigations: (1) scanner "deep scan" mode that tests every announcement for the router's `caller` ignoring the tag (cost: one extra ECDH per announcement); (2) an invoice-specific payment proof the payer can show (the stealth address, derivable only with the seller's view key, so the seller can verify a claimed tx hash in one step); (3) UI copy.

## D5. Immutable fee recipient vs token blacklists and non-payable recipients (Medium, operational) [reasoned]
If the fee recipient is blacklisted by a stablecoin issuer (USDC/USDT blacklist), every payment in that token through that router reverts, bricking the checkout for that asset. If the recipient is a contract that rejects ETH, `payNative` reverts for everyone. Immutability is a deliberate trust trade-off (FEE_SCHEDULE principle 3). Operational requirements: recipient must be an EOA or a multisig that accepts ETH and is unlikely to be blacklisted; keep a documented migration procedure (deploy new router, publish new manifest, UI warns on old); monitor for revert-rate spikes.

## D6. Policy account: stolen-key resistance is bounded (Medium, design) [reasoned, matches contracts agent's finding]
A thief with the owner key cannot redirect funds immediately, but can keep proposing destination changes forever and a legitimate owner has no recovery or guardian path; the legitimate owner's only defence is cancel-within-window. Also the destination becomes publicly linked to the account after the first withdrawal (D1). Do not market it as theft-proof. Needs a guardian/recovery ADR before mainnet enablement.

## D7. Frontend compromise is total compromise (Critical-class residual, inherent) [reasoned]
A malicious bundle can: derive stealth addresses for attacker keys, sign sweeps silently (stealth keys live in the browser, there is no wallet confirmation on the sweep path), swap the deployment manifest (signatures are not verified, flagged by the web agent [verified `apps/web/DEVIATIONS.md`]), and strip invoice protections. Mitigations in place: no third-party scripts, CSP, bundle scan, preview-equals-calldata for payer wallet transactions. Missing: signed releases and a verification procedure users can actually follow (SHA256SUMS, IPFS CID, reproducible build proof), manifest signature verified against a key obtained out of band, an optional "export stealth key to hardware wallet / offline signer" path for sweeps. This is why hosting must come after the release-signing work.

## D8. RPC and relayer metadata joins (Medium) [reasoned + verified call sites]
Balance and nonce reads for a stealth address [verified `apps/web/src/lib/sweep.ts:56,171`] tell the RPC provider "this IP cares about this stealth address". The relayer sees owner, destination, amount and timing together. Together with D1 this is the strongest correlation point in the system. Recommend: Tor/own-node guidance on the Sweep screen, default to a user-selected RPC with a clear "default is a public provider that sees your IP" warning, relayer retention caps already documented in `apps/relayer/PRIVACY.md`.

## D9. Revenue-path integrity (Low-Medium) [reasoned]
Fees accrue to one recipient on each chain. Compromise of that key loses the revenue stream, not user funds. Deploy with a hardware-backed multisig. Fees on direct payments, forks and the Bitcoin tier are not enforceable (FEE_SCHEDULE, MULTICHAIN_SPEC). Gas-sponsorship economics: the relayer fronts gas against a signed token fee; token price risk is nil for USD stablecoins only, so v1 correctly restricts to those; a gas spike between quote and inclusion can make a sweep unprofitable. Quote expiry and gas caps exist [verified in relayer spec/config].

## D10. Compliance and operator exposure (Business risk, not code) 
Operating a relayer and collecting fees on a privacy tool may carry money-transmitter, sanctions and AML obligations. The code ships a `PolicyGate` hook with allow-all default. The owner should obtain legal advice before enabling mainnet, and decide on a screening provider. Not a code defect; blocks launch.

## D11. Things I looked at and consider sound by design
- Non-custodial router with exact balance-delta checks and reentrancy locks [verified by reading `GhostPayRouter.sol` and `GhostPaySweepRelayer.sol`; Slither run: 3 results, all by design: signature-authenticated `transferFrom`, and a bucket-index comparison].
- Sweep authorisation binds destination, fee, feeTo, amount, nonce, deadline, chain and contract; a front-running relayer cannot redirect funds, and a front-runner that submits first still pays the signed fee to the signed `feeTo`.
- Permit handled in try/catch so a front-run permit cannot block a sweep.
- No on-chain invoice id (ADR-0003) and no admin keys in contracts.

## Findings to carry into the fix phase
| ID | Sev | Action |
|---|---|---|
| D1 | High | Rewrite sweep notice; destination-history check; fresh-destination guidance; doc page |
| D4 | Medium | Deep-scan mode + payment-claim verification + copy |
| D5 | Medium | Operator runbook entry; fee-recipient requirements in deployment README; monitoring note |
| D6 | Medium | Mark policy account experimental in UI/docs; recovery ADR before enablement |
| D7 | High | Release signing + verification doc; manifest signature verification; hosting gated on this |
| D8 | Medium | RPC warning copy on Sweep and Scan screens |
| D3 | Medium | Document now; per-client meta-address as backlog |
