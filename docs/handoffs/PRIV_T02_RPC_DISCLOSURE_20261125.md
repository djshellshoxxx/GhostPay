# PRIV-T02 RPC disclosure instrumentation handoff (2026-11-25)

- Branch: `claude/priv-t02-rpc-disclosure`; base main `60824005b89611aea2b16d3355378eebf072eedb`. Child branches merged: `claude/priv-t01-indexer-omission`, `claude/priv-t07-light-evidence`, `claude/priv-checkpoint-safety`.
- Added (tests and docs only, no runtime change except an additive `describeScanEvidence` export in `packages/scan-source/src/evidence.ts`): `apps/web/src/test/rpcDisclosure*.ts`, `disclosureChain.ts`, `disclosureHarness.ts`; `apps/web/src/lib/scanDisclosure.test.ts`, `scanPrivacy.indexer.omission.test.ts`, `scanClient.checkpoint.test.ts`; scan-source omission and evidence tests; `docs/research/privacy-rpc-call-graph.md`; evidence update in `docs/research/privacy-evidence-matrix-2026-11-10.md`.
- Run: `cd apps/web && npx vitest run src/test/rpcDisclosure.test.ts src/lib/scanDisclosure.test.ts --coverage=false`. Sanitized table: set `GHOSTPAY_DISCLOSURE_REPORT=/path/report.md`.
- Evidence level T only. No live measurement. No privacy change made.
- Open for owners: F1 to F4 in the matrix update (checkpoint last-writer-wins in `scanClient.ts`, light `'proof'` label, indexer UI caveat, `caughtUp`). Convert the two `test.fails` checkpoint tests after F1 is fixed.
- Exact-head CI results are recorded in the PR, not here.
