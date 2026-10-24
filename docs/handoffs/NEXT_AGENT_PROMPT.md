# Next agent prompt (GhostPay)

Paste the block below into the next session.

```
You are the integration lead for djshellshoxxx/GhostPay ONLY. A sibling session owns djshellshoxxx/p2p-offramp; do not touch it.

Baseline (verify with git, do not trust this text blindly):
- Work branch: claude/adoring-wozniak-850ue6, draft PR #27 -> main. Head at handoff: see `git ls-remote origin claude/adoring-wozniak-850ue6`
  (last code commit b3d6e39; docs-only commits after it). CI + Integration were all green on 9822122.
- Ancestry: main dbee678 < work/local-reconstruction bd320d5 < PR26 06f1426 < work/ghostpay-pr26-qa 77e7d7b < this branch.
- 68ea4b7 (reported older local checkpoint) is NOT on the remote; nothing was recovered from it.
- PR #27 has no review yet. Merge only after a substantive review of the exact head with required checks green.
  Do not merge feat/custodial-ledger-foundation. No force push, releases, deployments, real funds.

Read first: docs/handoffs/SESSION_STATUS.md (ledger, exact commands, limits), docs/HANDOFF-2026-10-24-PR26-CAS.md,
docs/WORK-PLAN-2026-10-24.md, docs/specs/README.md.

Do NOT redo (done and tested on this branch):
- Scan fails closed when a configured second RPC cannot be opened.
- Spec 13 client: 60 s TTL, eth_estimateGas sweep simulation (fail closed), send-time gas recheck within safety margin.
- Spec 04 payer pre-flight (classifyPayerPermit).
- BTC per-block integrity (header.ts, Esplora txid/Merkle/PoW/linkage, shim headers, live regtest step).
- test-vectors/tags.json + consumer test. Tag CAS / archive partial-restore fixes (from 2751517).

Remaining, in dependency order:
1. Get PR #27 reviewed; address findings; merge when exact head is reviewed and green.
2. Archive fuzz test (tagArchive.test.ts, 150 cases, 120 s): diagnosed — 13.9 s without coverage, >120 s under v8
   coverage (block coverage deoptimises scrypt). Ask the owner whether to run it in a non-coverage vitest project;
   never raise the deadline, cut cases, lower KDF cost or skip it. The 1M-log scanner fuzz (180 s) also exceeds its
   limit on slow containers even without coverage; GitHub CI passes both.
3. BTC beyond foundation: best-chain selection (chain work, retarget per network), header sync/persistence
   (spec 12 ScanState), witness binding via wtxid commitment. Do not describe current checks as SPV.
4. Spec 13 remaining: invoice bufferPolicy (new schema version + ADR), fiat estimate once spec 03 feeds are populated
   with verified addresses (FEEDS is empty), permit+buffer contract path only after CONTRACTS_SPEC + audit.
5. Spec 04 relayer side (sweep fallback ladder, grief reserve, failure counter).
6. Spec 05 announcer spam lanes/budget (cursor semantics are the hard part; current per-run budget + resumable
   limitReached already avoids silent drops).
7. TRON Nile/Shasta positive genesis pinning: needs a fetched, sourced block-0 id (trongrid was 403 from the
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
