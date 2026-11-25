# R16 — Browser self-check CI lint repair (2026-11-21 UTC)

## Source-pinned failure
- Frozen main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Existing parent [PR #402](https://github.com/djshellshoxxx/GhostPay/pull/402) exact head `3c9b96d0a10a976cb2143a8a62bbd4e31fc9f565` (child of #395). Remain on isolated branch `fix/ghostpay-browser-selfchecks-lint-r16-20261121` rather than editing another worker's branch.
- [Hosted CI run 44903445539](https://github.com/djshellshoxxx/GhostPay/actions/runs/44903445539) failed **ts-lint** job `136853147319`: `@typescript-eslint/require-await` at `BrowserChecks.test.tsx` lines 50,52 and `browserChecks.test.ts` lines 64,73. Other jobs including typecheck, unit tests, full/lean E2E, packaging and build passed on parent exact head; aggregate CI **failed**.

## Changes and intended preservation
- `f83739fcf8323d2cbebc2d72a517bf678332ffcc`: branch-local `docs/ai/ACTIVE_WORK.md` ownership claim before edits.
- `a6129f2292390c269f5256ff1287bfccc90553e7`: two React `act(async () => ...)` test callbacks now await `Promise.resolve()` explicitly, retaining async flushing of focus refresh and stale-result completion while satisfying require-await.
- `72cce454da6608eca1da4e26cd4c34908246ab73`: the mocked wrong SHA-256 digest now returns `Promise.resolve(buffer)`; the rejected digest returns `Promise.reject(Error(...))`. Both maintain required `Promise<ArrayBuffer>` contract/rejection behavior, with no secret string leaked to rendered results.
- No production changes, package edits, wallet keys, hosted services, cryptography implementation changes, feature widening or release/deployment modifications.

## Qualification and integration
- Prior failure and test source were inspected via GitHub. Local clone failed `Could not resolve host: github.com`; **no local repository lint, Vitest, browser or build tests were executed**. New exact-head hosted CI and an independent reviewer are required.
- Child PR must integrate into #402, then #402 requalifies on combined head, and #395 on its final head. Do not directly merge a child into main. Shared integration-lock generation 11 remains held by another coordinator; expiry alone is no authority to take it. No release, deployment or real-funds work.
- Continue 479-head R16 branch reconciliation in [POS R16 handoff](https://github.com/djshellshoxxx/GhostPay/blob/482d36ad436f4b27b2d86ff9a2c22daf150000ad/docs/handoffs/POS_PARITY_EXPIRY_R16_20261121.md). New child branch creates an additional Git ref. This handoff is task-specific, not a competing master ledger.
