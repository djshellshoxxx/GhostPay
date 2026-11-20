# ERC-20 simulation return-value guard — 2026-11-20 UTC

## Source-pinned task checkpoint
- Cycle: `20261120T0434Z`; one root coordinator, distinct sequential inspection/implementation/audit phases. No independent native verifier was available; no independent approval is claimed.
- Repository: `djshellshoxxx/GhostPay`, static Pages beta, default `main` observed at `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Isolated branch: `automation/20261120T0434Z/bug/erc20-simulation-result`.
- Ownership claim: `c71d703fdc778624989d7c6fdf3c69b84e69d491`; test-first commit: `1d58fbf9444b82cbd2662069175f5b52059e3f09`; production correction: `510e615b31d4d40d6936a2ee4c37461d35a47a4a`.
- Source: `apps/web/src/lib/txGuard.ts` original blob `abba792709126a191cbd589f2023351a7b9e1c66`; fixed blob `c5e7b6ea5ac9525395cb4bc8c63f923db40d2e23`. Test: `apps/web/src/lib/txGuard.test.ts` new blob `1f1749730b2af7483bacdeecc29f2fbda5490de3`.
- No shared integration tracking change; a separate coordinator owns integration metadata generation 6 at ref SHA `2b4f3327fdcda482e919c0c68595e32f345d0dba`, owner `20261120-required-privacy-0a7bc3583588-root`.

## Finding and correction
- ID: GP-WEB-DRYRUN-BOOL-20261120. Priority P2 correctness / warning accuracy; exploitability not established.
- In `simulateCall(rpc, call, expectBool=true)`, the original implementation checked for a 32-byte ABI `false` word but classified every other valid even-length hex string, including a one-byte `0x01`, a short `0x1234`, or a 32-byte integer `2`, as `ok`.
- The corrected classifier returns `unavailable` for nonempty data unless it is exactly one 32-byte ABI boolean word: `0` throws the same fixed `UserFacingError` as before, `1` is `ok`, all other values are `unavailable`. Legacy empty `0x` remains `ok` as required by existing tests. Non-boolean calls remain unchanged.
- This change does not alter signed transaction construction, payment policies, contracts or wallet behavior. An unavailable simulation is advisory and **not** a hard authorization refusal, so this is **not** claimed to prevent malicious provider responses or fund loss.

## Executed checks and limits
1. Before the fix, a Node 22 isolated copy of the original source-classification logic accepted **5/5** noncanonical Boolean cases as `ok`. This was a source-logic reproduction, not repository Vitest or an exact-package execution.
2. After the fix, the matching isolated logic passed **9/9** cases: 5 noncanonical responses reported `unavailable`, canonical `true` and legacy empty returned `ok`, canonical `false` threw, and generic nonboolean response behavior stayed `ok`.
3. Isolated strict TypeScript 5.8.3 typecheck of the extracted classification logic passed. **Full repository lint, build, Vitest, browser checks, contract security analysis and exact-head hosted CI are not asserted passed for this branch.**
4. Live candidate review: PR #301 and newer PR #303 carry the exact same `apps/web/src/lib/format.ts` content blob `9ba8ea7b418eab5cf18e900923572cf3e255aedd`; avoid duplicating their amount guard. PR #302 and #303 are active and still draft. No branch was deleted.
5. Existing PR #278 head `417f7c71daf8645e1432f2ec8f070110879b80bd` has successful core CI jobs, including full/lean browser jobs, from run https://github.com/djshellshoxxx/GhostPay/actions/runs/44650172265 (separate candidate, not this fix). Its contract-analysis run https://github.com/djshellshoxxx/GhostPay/actions/runs/44650172375 has Echidna success but strict Mythril failure (exit 1, artifact ID `14594649695`); the findings and external security acceptance remain unresolved, with no waiver.
6. Git network access from the local Node/container environment failed DNS resolution. GitHub connector reads and authorized writes succeeded. Caveman guidance was not present among available installed skills. No parallel worker or independent audit was claimed.

## Scope and next tasks
- Present this branch as **draft**, subject to exact-head GitHub Actions, repository Vitest, lint/build, independent code review and current-main reconciliation. Check the latest integration lock before any shared action.
- If tests fail, repair on this isolated branch with a regression-first amendment; do not force-push shared heads.
- The external privacy coordinator owns issue #286 and PR #293; do not modify those paths or start a competing consolidation PR.
- Preserve Mythril finding dispositions and external beta gates. No merge, deployment, release, production settings, real-funds operation or gate waiver occurred.
