# Generation 1 QA handoff — manifest freshness and browser acceptance

## Source

- Base: `c993bb2340942c85dbf10303b61f69a91c4944e0` (PR #278 head supplied by the coordinator).
- Claim: `762e753b`; worker `/root/qa_bug_gen1`; branch `fix/ghostpay-continuous-qa-20261119`.
- Product and fixture repair: `95f28a0411a01dc1d4d44c836e258ab214a07bbe`.
- Recovery scan follow-up: `45a5dcf7f3a37a44e252db6f2b902aeb02981206`, tree `6a84a3269b18a0ed0904a983af95c3b91241a607`.
- Seven changed web files are pinned in `source-pins.json`. This handoff is an additional documentation commit; it does not change that tested source.

## Changes and evidence

| Hosted failure | Diagnosis and repair | Assertions retained or added |
| --- | --- | --- |
| Invoice replacement saw three completed `eth_chainId` calls instead of two | `useManifest` exposed its previous same-chain value after Pay temporarily cleared the parsed invoice. A fresh load then replaced that value and started another preflight. Manifest results now belong to the current chain/service load generation and remain unavailable until that generation resolves. | The browser assertion remains exactly two chain checks. New component and full Pay/AppShell regressions cover same-chain re-entry, service replacement, ignored late results, revocation of a held renewed grant, and exactly one new grant after the replacement manifest resolves. |
| Replacement RPC never displayed `7 USDC` | The route returned short quantities for ERC-20 `balanceOf`, although an `eth_call` return must be an ABI word. Both old and replacement balance responses now use encoded `uint256` values. | Existing stale `5 USDC` suppression, explicit-click requirement, exact balance request counts, no background provider contact, and no transaction submission assertions are unchanged. |
| Pending privacy-profile message was absent | The test expected obsolete wording and adapter errors. The production action authority now refuses invalid/pending profiles and public endpoints in own-node mode before constructing an RPC client. | Exact current pending and refusal messages are checked. Saved own-node mode and acknowledgement state are also asserted. Provider counts remain zero, then one, stay one through both refusals, and reach two only after explicit repair. |
| Idle-lock test expected payment details to remain mounted | Retaining an unverified sole key copy preserves backup custody while suspending ordinary authority. The old payment list and export form correctly disappear. | The no-download/no-success checks remain. The test checks cleared export controls, disabled scan/create navigation, retained backup controls, verification without resumption, explicit wipe/import of the verified backup, and a new scan before successful export. The positive control explicitly disables restored-checkpoint resume, preserving the exact one-announcement/one-payment assertion. |

No assertion count, existing timeout, coverage threshold, workflow, network policy, fee, deployment, or feature-profile gate was weakened. The separate security worker owns the final async export-handoff fix; this branch does not edit `StealthExportCommon.tsx`, session, Scan, or Sweep production code.

## Verification

| Check | Observed result |
| --- | --- |
| Final new regressions with original `c993bb` Disclosure implementation temporarily restored | Expected RED: 3 failed, 1 passed. Two assertions observed stale `loaded` state; Pay observed a premature third RPC grant while the current manifest was still pending. The fixed source was restored in `finally` and matched its original bytes. |
| Original-config focused payment/scan suite | PASS: 122 tests in seven files, 62.80 seconds. Includes the new regressions, Pay, supported-invoice checks, fresh payment-export RPC authorization, export UI authorization, and private scan checkpoints. |
| Original-config fixture-support suite after final baseline reproduction | PASS: 138 tests in five files, 19.56 seconds. Includes the same four new regressions plus Settings, default-services authorization, and Sweep, including strict malformed ERC-20 balance rejection. |
| Final source web TypeScript check | PASS, exit 0, after the recovery-helper follow-up. |
| Final seven-file ESLint check | PASS, exit 0, after the recovery-helper follow-up. |
| Playwright specification discovery | PASS: 24 desktop tests in the three repaired specifications; the final recovery specification follow-up also lists its ten tests successfully. Discovery does not run a browser. |

The two selected Vitest suites overlap by four regression tests; their totals must not be added as distinct tests. Original `vite.config.ts`, test timeouts, and coverage settings were used with one worker. These focused runs do not claim the full project coverage gate. Exact commands, statuses, source scope and raw output hashes are in `receipt.json` and the adjacent compressed text receipts.

Node was **22.23.4**, Vitest **5.1.0**, and project Playwright **1.65.1**. The worktree used the coordinator-prepared dependency graph through a temporary `node_modules` symlink. Relative web source imports were from this worktree; `@ghostpay/*` package imports resolved to the coordinator checkout's compiled `dist` files. `runtime-imports.json` records those paths, and `compiled-dependencies.json` records their content-tree observations after execution. This is not a claim that dependencies were rebuilt separately in the QA worktree.

## Browser limitation and successor action

The one local Chromium availability probe failed before any page or scenario ran: system Chromium 156.0.8078.79 aborted after `socket() failed: Operation not permitted (1)`, with SIGABRT/ptrace permission diagnostics. That availability probe used the already installed prior workspace Playwright 1.64.1. It was not a run of this branch's Playwright suite, and no kernel-policy workaround or equivalent repeated launch was attempted. No local browser acceptance pass is asserted.

The coordinator-provided hosted baseline logs associate these four failures with PR head `c993bb`, but their actual checkout was the synthetic merge **`5c1ff468974b20d7160b2cf12776b3b82a69b537`** into main `c977b5d6723f6822c3b5d86cd6b231712c53c395`. The excerpts preserve that distinction: lean had 112 passed, four failed, five skipped; full had 125 passed, four failed, two skipped.

Integrate the two code commits with the separately reviewed security fix, retain the original combined build/typecheck/lint/coverage gates, and run the original full browser suite under both lean and full profiles on the hosted runner. In particular, the added backup-recovery control still requires real-browser execution. This handoff qualifies the scoped source fixes and selected runtime regressions; it does not qualify browser acceptance, a release, deployment, real wallets, or testnet transactions.
