# Audits round 3

Method: AI-assisted review by this swarm's sub-agents (opus for contracts and new-code, sonnet for the rest), plus re-running prior PoCs. This is NOT an independent professional audit and gives no guarantee of security. Per-area evidence with file:line and PoCs is in `docs/remote/audit-parts/{contracts,ts-libs,apps,new-code}.md`; PoCs live outside the repo (/tmp) and are not committed. Prior findings in docs/audits/* were re-checked, not trusted: see "Prior findings" below.

Severity is the auditor's own rating; fix status reflects code on this branch, verified by the full test run in qa-report.md.

## New findings
| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| N-01 (contracts) | Medium | GhostPayPolicyRouter | policyHash in plaintext calldata links all scheme-2 payments to one seller | FIXED (per-payment bytes32 salt, 50881e4) + tests; deploy-time leak documented |
| M-03 (prior, reconfirmed) | Medium | PolicyAccountFactory | fee token refusing transfer blocks deployment | FIXED (FeeWaived, regression test); spec deviation documented |
| M-01 (prior, reconfirmed) | Medium | Router | fee/amount edge | OPEN, deferred: fix breaks pinned fee+net==gross invariant; needs owner decision |
| N-02..N-05 (contracts) | Info/PLAUSIBLE | Policy contracts | withdrawal expiry, deploy front-run (gas only), native/ERC-20 alias limit, scheme-id anonymity | OPEN/documented; expiry would change pinned Withdraw typehash |
| TS-01 | Medium | btc scanner | outpoint/amount spoof by key sharing | FIXED (duplicateKey flag) + test |
| TS-02 | Medium | btc oracle | oracle txid/vout/amount unverified | MITIGATED (verifier hook, verified flag); no concrete verifier shipped |
| TS-03 | Low-Med | adapters/web | reorg ignored, tip depth shown as final | FIXED (confirmations/final/onReorg + UI) |
| TS-04 | Low | BlindBit client | no body cap/timeout, http, tip trust | FIXED |
| TS-05 | Low | policy-scheme | decodePolicyPaymentCalldata checks only binding | OPEN |
| TS-06 | Low | scanner | reorg during truncated scan | OPEN (partly addressed by finality flag; not separately tested) |
| TS-07 | Low | pay | price staleness window from seller invoice | FIXED lib (heartbeat cap) and web readPrice requires heartbeat |
| Relayer N-01 | Medium | relayer | throwaway signed sweeps fill queue | FIXED (pre-check outside lane, per-client cap); see NC-04/05 |
| Web N-04 | Medium | web | hashchange keeps old built invoice | FIXED |
| Relayer N-02,N-03,N-06,N-07,N-08 / Web N-02 | Low | apps | fee recheck, 500 on bad target, error shape, no code check, trust-proxy host | FIXED (N-08 partial: no trusted-proxy allowlist) |
| Relayer N-05 | Low | relayer | viem retry/post-timeout double submit | OPEN |
| NC-01 | Medium | adapters verify.ts | Transfer logs from primary RPC only | FIXED (two-provider getLogsAgreed) |
| NC-02 | Medium | adapters verify.ts | one Transfer verifies N announcements | FIXED (per-scan consumed set; not persisted across scans) |
| NC-03 | Low-Med | btc adapter | oracle key replay at other heights | FIXED/MITIGATED (seenKeys, duplicateKey, unverified without verifier) |
| NC-04/05 | Low | relayer | cap collapses to few IPs/IPv6 /64, check-then-await race, global pre-check starvation | FIXED (/64 grouping, atomic reserve, per-chain per-client pre-check). Residual: >=4 colluding clients can still fill the queue |
| NC-06 | Low | factory | blacklisted caller gets FeeWaived | ACCEPTED, low impact (one free deploy); documented |
| NC-07 | Low | policy router | zero owner no longer rejected on-chain | MITIGATED client-side (policy-scheme refuses); on-chain funds to a zero-owner account can freeze |
| NC-08 | Low | web | readback never wired | FIXED (7aee906) |

Refuted by the audit: CREATE2 salt collision, gas-starvation waiver abuse, ERC-6538 ABI mismatch, X-Forwarded-For spoofing.

## Prior findings (docs/audits/02, 03)
Re-verified by agents: contracts M-02, L-01, L-04, L-06, I-02 fixed in code; L-02, L-03, L-05 inherent/by design; apps S3-xx all still CONFIRMED except S3-04 and S3-17 (partly fixed by CI/release workflow), S3-06 PLAUSIBLE. Poc-01..11 re-run for apps; some were checked only by tail output (see apps.md). Details per ID in audit-parts.

## Not covered
Mythril and mutation testing (swarm 2); Slither re-run; Echidna on final contracts; formal verification; economic/MEV analysis; infrastructure and deployment review; dependency CVE review beyond lockfile state; third-party professional audit (still required before mainnet).
