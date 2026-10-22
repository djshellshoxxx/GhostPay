# GhostPay implementation specs

Created 2026-10-21 on branch `claude/remote-extensions-3`. Inputs: `docs/remote/research.md` (DOC-1..DOC-19), `docs/remote/gap-analysis.md`, MULTICHAIN_SPEC, CONTRACTS_SPEC, POST_LAUNCH roadmap, ADR-LOG. Facts the research could not verify stay **UNVERIFIED** inside each spec (examples: scheme-1 on-curve wording, BNB/Avalanche announcer, DAI/USDT permit variants, OZ internals, ERC-7562, BIP-352 ecosystem claims, Chainlink feed addresses). Contract-changing items must edit CONTRACTS_SPEC first (ADR-0014).

Effort: S < 1 d, M days, L >= 1 wk, XL multi-week + audit. Order is priority order.

| # | Spec | Pri | Effort | Covers |
|---|---|---|---|---|
| 01 | [manifest-readback](01-manifest-readback.md) | P0 | M | gap #1, ADR-0015 gate |
| 02 | [scanner-robustness-and-payment-verification](02-scanner-robustness-and-payment-verification.md) | P0 | M | DOC-1, DOC-5 mitigation, gap #2, #7 |
| 03 | [fiat-price-feeds](03-fiat-price-feeds.md) | P0 (A) / P2 (B) | S+M | ADR-0012, gap #3, #7, #14 |
| 04 | [permit-griefing-fallback](04-permit-griefing-fallback.md) | P1 | S-M | DOC-6, DOC-7, DOC-9 |
| 05 | [announcer-spam-anonymity-set](05-announcer-spam-anonymity-set.md) | P1 | M | DOC-2, research 1.2 |
| 06 | [erc6538-registry](06-erc6538-registry.md) | P1 | S+M | DOC-3, DOC-4, gap #4 |
| 07 | [relayer-metrics-observability](07-relayer-metrics-observability.md) | P1 | S | gap #10 |
| 08 | [feature4-archive-key-rotation](08-feature4-archive-key-rotation.md) | P1 | M | gap #8 |
| 09 | [chain-token-deployment-matrix-and-pins](09-chain-token-deployment-matrix-and-pins.md) | P1 | M | DOC-3,5,7,14,19 |
| 10 | [feature5-stage1-private-scanning](10-feature5-stage1-private-scanning.md) | P2 | M | gap #9 |
| 11 | [bip352-wallet-hardening](11-bip352-wallet-hardening.md) | P2 | M | DOC-10..12 |
| 12 | [bip352-light-client-scanning](12-bip352-light-client-scanning.md) | P2-P3 | M-L | DOC-13, 14, gap #15 |
| 13 | [gas-buffer-v2](13-gas-buffer-v2.md) | P3 | M (+L contract) | Feature 1 gaps |
| 14 | [embed-merchant-profile](14-embed-merchant-profile.md) | P3 | M | Feature 2 gaps |
| 15 | [eip7702-aa-policy-account-path](15-eip7702-aa-policy-account-path.md) | P3 | S (ADRs) / L+ | DOC-8, 15, 16, 17 |
| 16 | [policy-account-recovery](16-policy-account-recovery.md) | P3 | L | DOC-18 |
| 17 | [milestone-escrow](17-milestone-escrow.md) | P4 | XL | Feature 3 |

Not covered (owner-gated, see gap-analysis s3): deployments, release keys, hosting, licence/legal, external audit. Plan: [../remote/plans/implementation-plan.md](../remote/plans/implementation-plan.md).
