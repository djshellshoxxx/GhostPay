# GhostPay Threat Model (baseline v1)

Complements the matrices in MASTER_BLUEPRINT.md section 3 and DEVELOPER_SPECIFICATION Section 3. This file adds the observer table and the revenue-path threats introduced by FEE_SCHEDULE.md.

## Observer table: who learns what

| Observer | Learns | Does not learn |
|---|---|---|
| Public chain analyst | Payer address, token, gross/net amounts, fee flow to `FEE_RECIPIENT`, router use, announcement (stealth address, ephemeral key, view tag), timing, sweep source/destination if swept in the clear | Seller identity from the stealth address alone, invoice contents |
| Static host / CDN | Client IP, user agent, which app assets were fetched, timing | The URL fragment, keys, invoice contents |
| RPC provider | Client IP, queried block ranges and addresses, submitted transactions | Viewing/spending keys (never sent), invoice contents |
| Relayer operator | IP (hashed), owner stealth address, destination, token, amount, fee, timing; can censor | Keys |
| Wallet provider | Transaction requests, chain, addresses connected | Keys of the stealth wallet |
| Anyone holding the invoice link | Entire invoice (bearer link) | Seller keys |
| Fee recipient (project owner) | Aggregate fees on-chain only | Payer or seller identity beyond public chain data |

## Revenue-path threats (new)

| Threat | Mitigation | Residual |
|---|---|---|
| Fee recipient key compromise (attacker redirects nothing, but receives all future fees; owner loses revenue) | Recipient is a multisig/hardware address; immutable per deployment; monitoring | Replacing it requires a redeploy |
| Router abused as a laundering/mixing front | Fee path is public; no custody; compliance gating belongs to hosted frontend/relayer (ADR-0006) | Owner carries operator obligations |
| Malicious frontend swaps recipient/fee | Preview-equals-calldata check, release hash verification, manifest signature, user wallet review | Compromised release remains full compromise |
| Relayer quote tampering | Fee, feeTo, destination inside the stealth key's EIP-712 signature | Relayer can refuse service |
| Relayer drain via griefing | Simulation before send, per-owner and per-IP quotas, daily budget, gas cap, circuit breaker | Sustained spam degrades availability |
| Client-side fee stripped by a fork | Not preventable; contract-level fee only on routed payments | Disclosed in FEE_SCHEDULE.md |

## Assumptions
Browser, OS, and wallet of the user are not compromised; noble and viem releases are authentic and correct; the canonical announcer is deployed at the stated address; token contracts behave per the allowlist.
