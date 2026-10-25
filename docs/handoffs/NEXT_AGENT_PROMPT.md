# Next agent prompt (GhostPay)

## Scope override — 2026-10-24 UTC

The owner-approved [lean scope](LEAN_RELEASE_SCOPE.md) and [restart instructions](RESTART.md) supersede the historical baseline and priority list below. Read them first. Preserve [SESSION_STATUS](SESSION_STATUS.md) as historical test/provenance evidence, not a current rerun.

Next: verify exact-head EVM configuration and disposition assigned core cases before one invoice → pay → detect/receipt → sweep → key-recovery demo. Generic relayer retry/fallback and optional or multi-chain expansion are NOT the next task.

Detailed reproductions require the owner-supplied private review packet via supported access; no automatic Library access is assumed. This documentation grants no runtime, merge, release, deployment or production-funds authority. Keep all existing acceptance/security gates and preserve deferred work.

## Historical prompt — retained, subordinate to the override


Paste the block below into the next session.

```
You are the integration lead for djshellshoxxx/GhostPay ONLY. A sibling session owns djshellshoxxx/p2p-offramp; do not touch it.

Baseline (verify with git, do not trust this text blindly):
- main = 7ea6c3c (merge of PR #27, owner-approved, all checks green). Start new work on a fresh branch from origin/main.
- 68ea4b7 (reported older local checkpoint) was never on the remote; nothing was recovered from it.
- Do not merge feat/custodial-ledger-foundation. No force push, releases, deployments, real funds.

Read first: docs/handoffs/SESSION_STATUS.md (ledger, exact commands, limits), docs/HANDOFF-2026-10-24-PR26-CAS.md,
docs/WORK-PLAN-2026-10-24.md, docs/specs/README.md.

Do NOT redo (done and tested on this branch):
- Scan fails closed when a configured second RPC cannot be opened.
- Spec 13 client: 60 s TTL, eth_estimateGas sweep simulation (fail closed), send-time gas recheck within safety margin.
- Spec 04 payer pre-flight (classifyPayerPermit).
- BTC per-block integrity (header.ts, Esplora txid/Merkle/PoW/linkage, shim headers, live regtest step).
- test-vectors/tags.json + consumer test. Tag CAS / archive partial-restore fixes (from 2751517).

Remaining, in dependency order:
1. (Done: PR #27 merged; archive fuzz runs in a coverage-off pass.) Note: the 1M-log scanner fuzz (180 s) exceeds its
   limit on slow dev containers even without coverage; GitHub CI passes it. Never raise deadlines or cut cases.
2. Spec 04 relayer side (sweep fallback ladder, grief reserve, failure counter) — smallest next slice.
3. BTC beyond foundation: best-chain selection (chain work, retarget per network), header sync/persistence
   (spec 12 ScanState), witness binding via wtxid commitment. Do not describe current checks as SPV.
4. Spec 13 remaining: invoice bufferPolicy (new schema version + ADR), fiat estimate once spec 03 feeds are populated
   with verified addresses (FEEDS is empty), permit+buffer contract path only after CONTRACTS_SPEC + audit.
5. Spec 05 announcer spam lanes/budget (cursor semantics are the hard part; current per-run budget + resumable
   limitReached already avoids silent drops).
6. TRON Nile/Shasta positive genesis pinning: needs a fetched, sourced block-0 id (trongrid was 403 from the
   container network policy). Do not pin from memory.

First validation commands:
  npm ci && npm run build:libs && npm run typecheck && npm run lint
  (cd apps/web && npx vitest run --coverage --maxWorkers=1)
  GHOSTPAY_CHROMIUM=/opt/pw-browsers/chromium node apps/web/scripts/test-tags-concurrency.mjs
  node --test scripts/regtest/esplora-shim.test.mjs
  npm run ci:scan-secrets && npm run ci:check-actions

Rules: client-side architecture (user-held keys, no app backend; RPCs/relays are external deps). Regression test
before each fix. Keep thresholds 90/85/90/90. Record exact commands and results; separate historical results from
reruns. Update docs/handoffs/SESSION_STATUS.md each milestone, push, read back the remote SHA.
```
