# Combined beta integration matrix — 2026-11-12

This is a **planning artifact**, not a merge or test qualification. Source: combined draft #121 head `ca358acfa8f48d4deff9b770214bcba797b6b1f0`, targeting integration #98 at `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7`. Preserve existing owners, branch history and independent reviews.

## Already incorporated into combined #121 (per its description)

- #119 core fixes and child work #102–#111
- #118 relayer journal and operational recovery
- #117 QR/device exchange (including #113)
- #114 real-chain lifecycle acceptance and scan/reconciliation F1/F2 corrections

These are included in the combined *draft*, not in `main`. Its description reports local synthetic-chain tests, not full production qualification.

## Incoming independent drafts: file overlap and order

| PR | Exact source head observed | Files | Overlap with #121 changed-file inventory | Integration gate |
|---|---|---|---|---|
| #122 | `72dde82d9d898f5ed0c3c2b6901870c557a5012a` | `packages/net-transport/src/core.test.ts`, `onion.ts` | Check base version and upstream behavior before cherry-pick | Security review; canonical onion parsing tests; full CI |
| #123 | `7cdc6b32ecafd73636136c852542fddd42213848` | `packages/merchant-billing/src/schedule.test.ts` | No overlap indicated by #121 file list | Characterization tests, no claimed RED baseline; full CI |
| #124 | `afaf7ce62d2bad7ecfc558d96b8dd6fb772cc790` | `packages/merchant-billing/src/csv.test.ts` | No overlap indicated by #121 file list | CSV injection safety tests, exact-head CI |
| #125 | `a6e74591e134b31de3e0efc84448eb97cdc3b012` | `packages/cli/src/args.test.ts`, `args.ts` | No overlap indicated by #121 file list | Verify test-first RED then corrective GREEN on exact head |
| #126 | `d77956901d95c3eeb8c5c1d67ae7d1647bd069aa` | `packages/ux-schedule/src/scheduled.test.ts`, `scheduled.ts` | No overlap indicated by #121 file list | Verify clock-boundary correction and exact-head CI |
| #127 | `cf3a8b23a1994b39d2cf77b72d8c61c0a903ae4a` | `packages/ux-guide/src/profiles.test.ts`, `profiles.ts` | No overlap indicated by #121 file list | Last reported lint failure; verify latest lint candidate with fresh CI |

**Important:** “No overlap indicated” means the paths were absent from the #121 PR's changed-file list, not proof that a merge or runtime interaction is conflict-free. #122 needs an explicit baseline comparison. Each source PR remains draft and owned separately.

## Owner-safe integration procedure

1. Confirm the latest exact head and check conclusions for #121 and each incoming PR. Never infer green from a previous head or from a RED test-only baseline.
2. Request independent review for code-affecting changes; verify expected failure before correction when claimed. Verify unchanged security/privacy/financial policy.
3. On a new integration branch derived from the **current** accepted #121 head, integrate one approved source PR at a time. Record original SHA, merge/cherry-pick SHA, conflicts and test results. Do not edit the source PR branches.
4. For each port, retain all original regression tests. Recheck CLI, network transport, billing, and UX package boundaries; run full workspace typecheck, lint and tests.
5. Run local-chain library, CLI and browser beta acceptance plus relayer, CLI OS and hosting workflows on the final exact SHA. Record failures, environmental skips and pending jobs separately.
6. Reconcile SonarCloud security gate, independent security/cryptographic review, privacy evidence, signed provenance and owner release approvals. Do not merge to main, deploy, claim production readiness or use real funds before authorization.

## Unresolved core-beta qualification gaps (source tracker)

- CLI chain 31337 intentionally unsupported; local acceptance uses a script-owned 84532 chain for live reads.
- Physical wallets/devices and public testnet not qualified; browser real-chain tests do not cover ERC-20 approve/permit, relayer sweep, backup/restore or reorg.
- Historical SonarCloud security rating D versus required A reported in handoff; exact-head findings/closure not established.
- Independent security/crypto audit, signed release artifacts and final approvals outstanding.

This document is not evidence of successful CI, an independent audit, or a release decision.
