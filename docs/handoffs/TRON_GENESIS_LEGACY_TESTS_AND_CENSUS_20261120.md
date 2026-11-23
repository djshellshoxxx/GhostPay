# GhostPay continuation: TRON genesis CI repair and incremental branch census

Date: 2026-11-20 UTC. Scope: draft only; no release, deployment, signing, or new chain support.

## Exact source/qualification checkpoint

- Frozen main: `8c75581f0217dbc4ba6d052e54351594274e7b6e` (qualified TRON scanner cancellation via PR #321).
- Parent: PR #340, `f9344a16fdefd1151189d8fd613ef3d1ca6a75c4` (TRON selected-genesis enforcement). Child branch starts at that exact parent; existing implementation, tests and safety rules remain intact.
- Hosted Hosting kit workflow `44825875481`, job `136598215174`, failed because `apps/web/src/features/tron/chain.hardening.test.ts` called `checkNetwork(rpc)` three times after the production API began requiring `checkNetwork(rpc, selectedNetwork)`. TypeScript TS2554 at original lines 25, 28, 40. This is a source/typecheck failure, not a runtime proof of successful network validation.
- Beta acceptance workflow `44825875687`, job `136598215433`, completed 124/124 CLI devnet checks but failed to start the browser Playwright webServer (exit 2). The failing web build is the reproducible TypeScript blocker above; the two failed workflows are not two independent defects.
- Repair commit `aa00ab384debc6a5282ac898e6eb9efc1bc906b6`: tests now supply explicit `'local'` for missing-genesis/mainnet cases and match `'nile'` and `'shasta'` to their respective pinned testnet genesis. These are test-only call-site changes. Production behavior, key material, network authority, and mainnet rejection are unchanged.
- Required next gate: exact child-head full TypeScript build, targeted Vitest and CI/Pages/beta acceptance, manual/independent review of all `checkNetwork` callers. Do not claim tests passing merely because the three known TS2554 calls were corrected.

## Complete increment since the original published branch inventory

- Prior frozen ledger: PR #330 `docs/consolidation/current-census-20261120/CENSUS.json`, 392 names and observed heads against main `aa3df1cb37274fae73af0ca957183c15c51b62d3`. Its earlier full comparison summary: 185 ancestry-redundant, 68 documentation/nonapplication-path diffs, 138 application-path candidates requiring semantic review, 1 unrelated gh-pages history. The prior JSON notes that some moving ref comparisons were not exact-head-pinned.
- Current GitHub branch search was paginated with page size 100 through pages 100/100/100/100/7/0 (terminal null cursor). 407 unique refs, no removals relative to the 392-name baseline. All **15 newly appearing branch names** were resolved to exact commit SHAs and compared to frozen current main `8c75581f`; no new branch was merged by this scan.
- Newly compared exact heads and disposition (ahead/behind vs current main; a code diff does not prove independently unique semantics):

| Branch | Exact head | Ahead / behind | Disposition |
| --- | --- | ---: | --- |
| `automation/ghostpay-20261120-embed-popup-noopener-r1` | `c9e7a21bf635` | 3 / 5 | focused embed SDK fix in #337; retain for CI/review |
| `automation/20261120T1840Z/bug/receipt-archive-identity` | `71632fa389ae` | 5 / 5 | focused #332, overlaps stacked #335; do not double-integrate |
| `automation/20261120T2036Z/bug/btc-preview-network` | `692cac58b1c3` | 4 / 5 | focused #338, assess failing mergeability |
| `automation/20261120T2234Z/bug/sweep-ledger-seven-testnets` | `781376220115` | 71 / 5 | #341 stacked on broad #307; only review incremental four commits |
| `automation/20261120/bug/btc-fee-floor-config` | `9dcd2d88ff32` | 3 / 5 | focused #334, independently tested, hosted CI queued |
| `evidence/ghostpay-continuation-r2-20261120` | `c2b575e945b7` | 68 / 5 | broad integration/evidence descendant, do not bulk merge |
| `evidence/ghostpay-fee-floor-qualification-20261120-r2` | `aeb6cb376865` | 4 / 5 | #334 donor plus documented test evidence; not independent feature |
| `evidence/ghostpay-idle-session-r2-20261120` | `ebc3fea4640e` | 97 / 5 | broad idle-session stacked candidate/evidence, not independent |
| `evidence/ghostpay-vault-rekey-qualification-20261120` | `b9911c7228e9` | 4 / 5 | #328 donor plus qualification evidence; avoid duplicate |
| `fix/ghostpay-backup-preflight-20261120-r2` | `3172a93ceb8f` | 99 / 5 | broad stacked backup candidate, investigate delta only |
| `fix/ghostpay-devnet-wallet-consent-20261120-r2` | `410353a23631` | 454 / 39 | divergent historical candidate; compare truncated at 300 changed paths, no wholesale merge |
| `fix/ghostpay-hygiene-transfer-evidence-20261120` | `d03600ca87c7` | 10 / 5 | focused #339; exact-head CI incomplete |
| `fix/ghostpay-receipt-archive-identity-20261120-r2` | `e31a090501b3` | 103 / 5 | broad stacked receipt candidate; overlaps #332/#335 |
| `fix/ghostpay-tron-genesis-guard-gpbug15-20261120` | `f9344a16fdef` | 5 / 5 | focused #340; child fixes observed compiler regression |
| `integration/ghostpay-idle-session-20261120-r2` | `f5e04a30bd53` | 96 / 5 | broad parent of idle stack; qualify incrementally |

No new branch can be certified redundant solely by a matching path list; these dispositions are triage, not patch-equivalence proofs. Re-run live pagination and exact-head checks before merge. Original 392-source census is preserved separately; it must not be silently relabeled as current 407-source census.

## Next handoff

1. Inspect child PR checks; only after exact-head source tests pass, integrate the test correction into #340 (normal merge preferred for ancestry), then requalify #340 itself against current main.
2. Repair any additional failing old-call tests identified by typecheck; do not change the production network guard to fit old tests.
3. Source review #332/#335 once at their incremental ancestry boundary, and #341 against #307, before integrating either.
4. Preserve sole-copy key recovery, existing privacy consent/retention, and browser-only noncustodial EVM Pages beta. No deployments/releases without complete qualification.
