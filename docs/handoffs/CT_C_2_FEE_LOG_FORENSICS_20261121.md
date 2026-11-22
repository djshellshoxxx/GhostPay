# CT-C-2 synthetic event-byte forensics — isolated diagnostic

- Issue: https://github.com/djshellshoxxx/GhostPay/issues/414
- Worker: single forensic coordinator; no independent verifier yet.
- Base: main `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Branch: `audit/ct-c-2-fee-event-forensics-20261121`.
- Owned paths: new `packages/confidential-contracts/test/fee-log.forensics.test.ts` and this handoff file only. Existing `router.test.ts`, source contracts, CI workflows, and shared integration metadata remain untouched.
- Acceptance: create a repeatable synthetic-only forensic test that records precise fee-needle locations per log, identifies event ABI parameters and handle containment, retains original CT-C-2 broad assertion unchanged, and does not infer a real disclosure from a byte collision.
- Current uncertainty: original failing Actions job recorded only `log 0xe3a9105a3a932253A70F126eb1E3b589C643dD24 packed 19135`, no raw receipt/ABI field. Rerun passed. No deterministic leak reproduced.
- Scope: diagnostic-only; never decrypt real transaction data; no contract changes, broad assertion weakening, deployment, merge, or release.
- Verification requirement: execute `npx hardhat test test/fee-log.forensics.test.ts` in `packages/confidential-contracts`, then original CT-C-2 and package typecheck. Native execution is unavailable in the current GitHub-only environment; any CI result must be obtained and recorded separately. Independent privacy review required before accepting a definitive cause.
