# GhostPay future privacy architecture specs — 5a–5l

**Status: FUTURE IMPLEMENTATION REQUIREMENTS — SPECIFICATIONS ONLY.** These are owner-requested planning artifacts, NOT implementation authorization, deployment approval, a beta release gate or evidence of a working privacy feature. Existing working code must be reconciled before tasks are scheduled.

**Non-negotiable product constraints:** zero-install browser-based static app; standard HTTPS and Tor onion publication; no mandatory GhostPay-operated backend, account, RPC, indexer or relayer; all private keys remain user-controlled; transaction construction and sensitive key handling client-side. External wallet/browser/RPC behavior is not fully controllable by web-page JavaScript. No assertion of anonymity or confidential settlement on transparent EVM merely through stealth destinations.

**Supersedes informal labels** 5a–5l from the November 16 privacy discussion; does not alter pre-existing numbered specs 01–17 or the 18 FUTURE ONLY privacy-first proposals. See also the separate proposed requirement 3q in PR #190.

## Prioritized feature requirements

| ID | Spec | Priority | Estimated effort | Type |
|---|---|---|---|---|
| 5a | [No accounts or identifying telemetry](5a.md) | P0 | S-M | Future implementation |
| 5b | [Local encryption and key management](5b.md) | P0 | M | Future implementation |
| 5c | [Fresh EVM stealth destinations and local discovery](5c.md) | P0 | M | Future implementation |
| 5d | [Privacy-preserving RPC and scanning](5d.md) | P0 | L | Future implementation |
| 5e | [Sweep privacy and linkability analysis](5e.md) | P0 | L | Future implementation |
| 5f | [Encrypted invoice and metadata minimization](5f.md) | P0 | M | Future implementation |
| 5g | [HTTPS and Tor hosting with verifiable network boundaries](5g.md) | P0 | M-L | Future implementation |
| 5h | [Optional broadcasting and gas sponsorship without custody](5h.md) | P1 | L | Future implementation |
| 5i | [Buyer-side privacy adapters and payment identity separation](5i.md) | P1 | XL | Future implementation |
| 5j | [Confidential amount and settlement integrations](5j.md) | P3 | XL | Research first |
| 5k | [Independent stealth-key exports and offline recovery](5k.md) | P0 | M | Future implementation |
| 5l | [Reproducible builds and release integrity](5l.md) | P0 | L | Future implementation |

## Implementation sequence and shared acceptance

1. Inventory extant implementation and unmerged branches first; do not replace proven modules. Establish network/secret egress baselines (5a, 5b, 5l).
2. Qualify scheme-1 local derivation, privacy-preserving scan behavior and invoice metadata (5c, 5d, 5f).
3. Add sweep linkability review, HTTPS/Tor build parity and independent recovery (5e, 5g, 5k).
4. Add optional non-custodial broadcasting and buyer adapter framework after threat models (5h, 5i).
5. Pursue confidential settlement (5j) only after a separate owner-approved protocol decision and independent review.

Common gates: tests fail before fix; bounded malformed input and negative paths; no sensitive material in request traces, URLs or logs; no silently downgraded private-required mode; no claim of full anonymity; static builds must work without publisher backend; independent reproduction; external-wallet/network/device validation marked pending until evidenced. Signed manifests and real-chain acceptance remain distinct launch gates. Existing GhostPay 0.25% router fee is preserved as a product constraint; alternative routes that cannot enforce it must disclose incompatibility and seek a separate owner decision rather than claiming equivalence.

**All 12 specs are future requirements, not claimed implemented, qualified, merged or activated.**
