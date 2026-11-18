# GhostPay future privacy architecture specs — 5a–5l

**Status: FUTURE IMPLEMENTATION REQUIREMENTS — SPECIFICATIONS ONLY (5a–5j, 5l).** These eleven are proposed, owner-requested planning artifacts, NOT implementation authorization, deployment approval, a beta release gate or evidence of a working privacy feature. Existing working code must be reconciled before tasks are scheduled. **Exception, 5k:** 5k is not future-only. It cross-references requirement 3q, which the owner approved and [spec 18](../../specs/18-stealth-keypair-export.md) requires before beta exit; spec 18 is canonical and the feature is counted once, there.

**Non-negotiable product constraints:** zero-install browser-based static app; standard HTTPS and Tor onion publication; no mandatory GhostPay-operated backend, account, RPC, indexer or relayer; all private keys remain user-controlled; transaction construction and sensitive key handling client-side. External wallet/browser/RPC behavior is not fully controllable by web-page JavaScript. No assertion of anonymity or confidential settlement on transparent EVM merely through stealth destinations.

**Supersedes informal labels** 5a–5l from the November 16 privacy discussion; does not alter pre-existing numbered specs 01–18 or the 18 FUTURE ONLY privacy-first proposals. Requirement 3q is approved and canonical in [spec 18](../../specs/18-stealth-keypair-export.md) (integrated from PR #190); 5k refers to it and defines no second feature.

## Prioritized feature requirements

| ID | Spec | Priority | Estimated effort | Type |
|---|---|---|---|---|
| 5a | [No accounts or identifying telemetry](5a.md) | P0 | S-M | Proposed future implementation |
| 5b | [Local encryption and key management](5b.md) | P0 | M | Proposed future implementation |
| 5c | [Fresh EVM stealth destinations and local discovery](5c.md) | P0 | M | Proposed future implementation |
| 5d | [Privacy-preserving RPC and scanning](5d.md) | P0 | L | Proposed future implementation |
| 5e | [Sweep privacy and linkability analysis](5e.md) | P0 | L | Proposed future implementation |
| 5f | [Encrypted invoice and metadata minimization](5f.md) | P0 | M | Proposed future implementation |
| 5g | [HTTPS and Tor hosting with verifiable network boundaries](5g.md) | P0 | M-L | Proposed future implementation |
| 5h | [Optional broadcasting and gas sponsorship without custody](5h.md) | P1 | L | Proposed future implementation |
| 5i | [Buyer-side privacy adapters and payment identity separation](5i.md) | P1 | XL | Proposed future implementation |
| 5j | [Confidential amount and settlement integrations](5j.md) | P3 | XL | Proposed; research first |
| 5k | [Independent stealth-key exports and offline recovery](5k.md) | Spec 18: before beta exit | Spec 18 | Approved requirement 3q; canonical [spec 18](../../specs/18-stealth-keypair-export.md); cross-reference, counted once there |
| 5l | [Reproducible builds and release integrity](5l.md) | P0 | L | Proposed future implementation |

## Implementation sequence and shared acceptance

1. Inventory extant implementation and unmerged branches first; do not replace proven modules. Establish network/secret egress baselines (5a, 5b, 5l).
2. Qualify scheme-1 local derivation, privacy-preserving scan behavior and invoice metadata (5c, 5d, 5f).
3. Add sweep linkability review and HTTPS/Tor build parity (5e, 5g). Independent recovery (5k) is not sequenced here: it is delivered as spec 18, a before-beta-exit requirement, independently of this future sequence.
4. Add optional non-custodial broadcasting and buyer adapter framework after threat models (5h, 5i).
5. Pursue confidential settlement (5j) only after a separate owner-approved protocol decision and independent review.

Common gates: tests fail before fix; bounded malformed input and negative paths; no sensitive material in request traces, URLs or logs; no silently downgraded private-required mode; no claim of full anonymity; static builds must work without publisher backend; independent reproduction; external-wallet/network/device validation marked pending until evidenced. Signed manifests and real-chain acceptance remain distinct launch gates. Existing GhostPay 0.25% router fee is preserved as a product constraint; alternative routes that cannot enforce it must disclose incompatibility and seek a separate owner decision rather than claiming equivalence.

**5a–5j and 5l (11 of 12) are proposed future requirements, not claimed implemented, qualified, merged or activated. 5k is the approved before-beta-exit requirement 3q, canonical in spec 18; it is also not implemented, tested or qualified.**
