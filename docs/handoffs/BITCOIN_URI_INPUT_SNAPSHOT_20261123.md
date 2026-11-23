# Bitcoin URI checked-input snapshot — cycle 20261123T0840Z

## Source and ownership

- Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, existing `docs/ai/ACTIVE_WORK.md`, and `SECURITY.md`. The HANDOFF file is a template, not proof of previous execution.
- Latest main at discovery: `8ddb344973e80b8e1eda6821e970ee6a2b808b29` (2026-11-23). Isolated branch: `automation/20261123T0840Z/bug/bitcoin-uri-input-snapshot`.
- Claim commit: `66669280e2afd005f40d01ec8e4701dd0919e4f7`; regression-first commit `bf5d03d2ee36a0905df261e0c024a436149e138c`; production correction `db54b637695d4e8cb80b32a05fb329c1b48a1227`.
- Owned files: `packages/payment-uri/src/bitcoin.ts`, `packages/payment-uri/src/bitcoin.input-snapshot.test.ts`, this handoff and additive `docs/ai/ACTIVE_WORK.md`.
- Coordinator/implementer: one ChatGPT invocation, sequential only. No native independent verifier was available. Do not treat self-check as reviewer approval.
- Repo-wide integration lock: branch `automation/ghostpay-integration-lock` at `082e754f44944ebb4be283f89176b966bf8f7b4f`, `status: released`, generation 12 (owner `claude-keen-volta-8ctx9x`); this cycle did not acquire it. Do not merge based solely on that observation. Reinspect before integration.
- Sources/changed-file scopes inspected: existing #372, #382, #371, #367, #365, #307, #262, #264, #278 and #496/#499. No tested overlap on owned code/new test path; not an exhaustive branch census.

## Finding and repair

`buildBitcoinUri` tested `p.amountSats` but read it again during formatting. An accessor returning 2 satoshis for the four validation reads and an amount above the maximum for the fifth read serialized an out-of-range BIP-21 amount. In a standalone Node 22 reproduction the original code's equivalent emitted `21000000.00000001` after accepting `2n`. `parseBitcoinUri` similarly read `opts.expectedNetwork` three times: a changing getter could pass compatibility on a mainnet address and return `network: 'test'`.

Production fix captures `amountSats` and `expectedNetwork` exactly once, validates those snapshots and uses those same values to construct the output. Existing BIP-21/321 grammar, network rules, error codes, noncustodial behavior, HTTPS/Tor support and dependencies are unchanged.

New regression suite: five Vitest cases covering changed and invalid amount getters, changed and incompatible expected-network getters, and ordinary valid and rejected values. Tests committed **before** the fix, but repository Vitest has not been run locally.

## Evidence and restrictions

- Baseline reproduction executed on Node 22.16.0 with source-equivalent functions: amount serialized as `21000000.00000001` after checking `2n`; network returned `test` for a main-only address. Reads counted 5 and 3 respectively.
- Corrected standalone source-equivalent Node 22 harness: **6 assertions passed**, no repository dependencies or browser environment involved. This does NOT qualify Vitest, ESLint, TypeScript, Pages, wallet or browser acceptance.
- Native `git ls-remote` failed: `Could not resolve host: github.com`. Source and commits were inspected/written through authenticated GitHub connector instead. No bypass or paid API used.
- Required next checks: exact-head hosted `ts-lint`, `ts-typecheck`, `ts-test` payment-uri coverage, full/lean browser, Pages validation, beta acceptance and deployment-disabled behavior. Check individual jobs, not only aggregate status.
- No confirmed exploitable vulnerability, independent security clearance, or release readiness is asserted. Ten existing Mythril findings (3 Medium, 7 Low from earlier evidence) remain open until independently assessed.
- No deployment, release, tag, main/shared merge, contract change, real-funds operation or force-push occurred.

## Continuation

1. Check PR and exact head, CI and all five regression tests. Repair failures with a new isolated child branch rather than rewriting shared history.
2. Obtain genuinely independent verifier/reviewer; verify compatibility with current main and active payment-uri PRs including #496 and #499.
3. Recheck integration-lock generation/owner and deployment triggers; integrate only under valid atomic ownership and required CI/review gates. Otherwise leave draft PR.
4. Keep historical/consolidation ownership claims and security findings intact.
