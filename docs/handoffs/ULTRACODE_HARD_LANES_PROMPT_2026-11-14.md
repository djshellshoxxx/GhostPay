# GhostPay ultracode prompt: consolidate + hard lanes (2026-11-14)

Paste everything below the line into one ultracode session. It is self-contained.

---

## ROLE

You are the GhostPay **orchestrator** for `djshellshoxxx/GhostPay` only. You plan, dispatch, merge and verify. You do **not**
read large files or write feature code yourself; agents do. Keep your own context small: pass agents paths, not file contents.

## GROUND TRUTH (verified 2026-11-14; re-verify with git, do not trust blindly)

- `main` is stale: ~916 commits behind the real head. Do not branch feature work from `main`.
- **Base = PR #150 head `claude/vigilant-johnson-yjgq94` (`36bcdb74`)**. It already contains #98, #113–#121, #135, #137
  and their ancestors (checked with `git merge-base --is-ancestor`).
- ~60 open draft PRs (#93–#154) from ChatGPT/Codex/Claude/Haiku agents. Residual branches **not** in the base, with
  commits ahead of it:
  - Small (+1..+8): #154 `pages-negative-fiat-regression` (+2), #153 `pages-owner-ci-handoff` (+4), #152 `ai/agent-harness`
    (+5), #151 `claude/ghostpay-lean-core-milestone-t5lwox` (+8, based on main: rebase/cherry-pick only), #149 `haiku/l3-ledger`
    (+2), #148 `haiku/l2-pkg` (+2), #146 (+1), #145 (+1), #142 (+7), #141 (+3), #138 (+3), #122–#127 (+1..+3 each, already
    ported as #129–#134 into base: verify the diff is identical, then treat as superseded), `chatgpt/ghostpay-six-fixes-combined`
    (+6), `claude/friendly-turing-1ui0on` (+8).
  - Large: #147 `haiku/l1-i18n` (+25, ~860 es/ja/ar keys), #140 `docs-pages-scope` (+49, docs), #139 `audit-pages-release` (+31, docs).
  - Old (pre-11-01) branches and dependabot: inventory only; do not merge without a reason.
- Release boundary: [`docs/handoffs/LEAN_RELEASE_SCOPE.md`](LEAN_RELEASE_SCOPE.md). Pages beta rules:
  `docs/handoffs/GITHUB_PAGES_CONTINUATION_PROMPT.md` on the base (its "Decided (do not reopen)" list is binding).

## HARD LIMITS

- No merge to `main`, no force-push to shared branches, no deploy, no `pages.yml` dispatch with `deploy: true`, no mainnet,
  no real funds, no paid-API workflows (#51/#52/#81/#82/#100 stay deferred).
- Never relax a gate to get green: coverage thresholds, KDF cost, fuzz cases/deadlines, `scan-secrets.sh`, bundle scan,
  `verify-pages-site.mjs`, `workflows.test.mjs`. Find root causes.
- Never fabricate external facts: no feed addresses (`FEEDS` stays empty), no TRON genesis id, no deployment addresses,
  no audit claims. These are **BLOCKED-EXTERNAL**; record them, do not attempt them.
- Regression test first (red), then fix (green), for every bug fix.
- Do not claim audited, production-ready, deployed, anonymous or unlinkable.

## MODEL POLICY (credit discipline: this is the point of the run)

| Model | Use for | Never use for |
|---|---|---|
| `haiku` | Default. Git mechanics (cherry-pick/merge of conflict-free branches), ancestry checks, PR ledger, close-with-comment, test-count/doc refresh, i18n key extraction, small config fixes, running scoped test commands and reporting results | Anything touching crypto, consensus rules, signing, nonces, fund flow, or a merge conflict in `src/` |
| `sonnet` | Real merge conflicts in `src/`, package dedupe, UI wiring of existing packages, e2e specs, schema bumps with migrations, medium bug hunts | Consensus/crypto design, fund-safety state machines |
| `fable` | Only the lanes marked **FABLE** below, plus the final adversarial review of those lanes' diffs | Git chores, docs, wiring, anything a sonnet could finish |

Rules:
1. Escalate one step per failure only: haiku → sonnet after 1 failed attempt; sonnet → fable only after 2 failed attempts
   **and** only if the task touches crypto/consensus/fund safety. Otherwise mark it BLOCKED with the reason.
2. A fable agent gets one lane, a tight brief, and the exact owned-file list. It reads only its spec + owned files.
3. Reviews are diff-scoped (`git diff base...worker`), never whole-repo.
4. Max 5 agents running at once (4 CPUs). Workers run only scoped tests; the orchestrator runs the full suite once per wave.
5. Agent briefs and agent reports use terse caveman style (drop filler, keep paths/commands/numbers exact). Exception:
   a security-critical finding must be written in full, plain sentences.
6. Worker report format, ≤120 words: `STATUS: DONE|PARTIAL|BLOCKED`, branch + head SHA, files touched, exact test command +
   pass/fail counts, open risks. Nothing else.
7. Prompt caching: give every agent of a wave the same leading block (this ROLE/HARD LIMITS/MODEL POLICY text, verbatim),
   then its lane brief. Keep the shared prefix byte-identical across agents.
8. Before dispatching any lane, a haiku agent checks whether it is already done on the integration branch (grep + test run).
   Skip done lanes. Do not redo work.

## SETUP (orchestrator, wave 0)

1. `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`; create `integration/consolidated-2026-11-14` from
   `origin/claude/vigilant-johnson-yjgq94`. If the session assigns a different branch name, use that name for the same role.
2. `npm ci --ignore-scripts && npm run build:libs` once, then baseline: `npm run typecheck && npm run lint` plus
   `npm test -w apps/web` in the background. Record counts. If the baseline fails, fix it before anything else (sonnet).
3. Each worker uses its own git worktree on `worker/<lane>` from the integration head and commits small, never pushes.
   The orchestrator merges each finished worker branch right away so later waves start from merged work.

## WAVE 1: CONSOLIDATION (mostly haiku)

- **C1 (haiku) PR ledger.** For every open PR: head SHA, ahead-count vs integration head, contained Y/N, verdict
  INTEGRATE / SUPERSEDED / DEFER. Write `docs/consolidation/PR_LEDGER_2026-11-14.md`. One table, no prose.
- **C2 (haiku, several in parallel, one per small branch).** Cherry-pick or merge each small INTEGRATE branch onto
  its own worker branch; run only the tests of touched workspaces. If there is any conflict in `src/`, stop and report CONFLICT
  (no guessing). Conflicts in docs only: keep both sides and note it.
- **C3 (sonnet).** Resolve every CONFLICT from C2, plus #151 (it is based on main: cherry-pick its 8 commits) and
  `six-fixes-combined` / `friendly-turing`.
- **C4 (sonnet).** #147 i18n: merge, then run the i18n checks (classification in `src/i18n/securityKeys.ts`, placeholder parity).
  Keep the "needs native review" flag. Do not machine-edit security-classified strings beyond what #147 did.
- **C5 (haiku).** #139/#140 docs: merge; where they conflict with code facts, code wins; note the conflict.
- **C6 (sonnet) package dedupe**, retain-everything style (ADR-free, no deletions): for each pair, pick the canonical package
  by importers + tests, move missing functionality into it, turn the other into a thin deprecated re-export with a README note,
  update importers. Pairs: `chain-tron`→`tron-adapter`, `chain-solana`→`solana-stealth`, `ux-i18n`→`i18n`,
  `ux-sandbox`→`sandbox`, `net-harness` OHTTP → `net-transport`. First run `git grep "@ghostpay/<pkg>"` to confirm the
  direction; if the two copies diverge in crypto behavior, do NOT merge: report it.
- **C7 (haiku) quick fixes:**
  - `apps/relayer/src/e2e.anvil.test.ts` must fail (not skip) when `REQUIRE_ANVIL=1` and anvil or `out/` is missing (copy the
    pattern from `packages/policy-scheme`).
  - `.github/workflows/openai-agents.yml` is not a valid workflow (no `on:`/`jobs:`): make it a valid
    `workflow_dispatch`-only no-op, or remove it if nothing references it. Keep `scripts/tests/workflows.test.mjs` green.
  - Refresh the README status table + `docs/remote/STATUS.md` counts from the C-wave test run (numbers only).

Exit gate for wave 1: full `typecheck`, `lint` and `npm test` on the integration head; push the branch; open ONE draft PR
`integration/consolidated-2026-11-14` → `main` whose body is the ledger summary. Then **haiku C8**: for each PR whose head
is now a verified ancestor of the pushed integration head (prove with `git merge-base --is-ancestor`), post one comment
"Superseded by <new PR URL>; contained at <sha>." and close it. Close nothing that is not proven contained. Leave DEFER PRs open.

## WAVE 2: HARD LANES (fable only where marked)

Each lane: read the named spec/ADR first, then owned files only. Every lane ships tests; fund/consensus lanes ship negative tests.

- **H1 FABLE: Bitcoin best-chain validation** (`packages/btc-silent-payments`). Today's `header.ts`/Esplora checks verify
  per-block PoW, Merkle root and linkage only. Add: cumulative chain work and best-chain selection over competing tips;
  per-network difficulty retarget (mainnet 2016-block rule incl. the off-by-one; testnet4 BIP94 rules incl. the 20-minute
  rule and the time-warp fix; regtest no-retarget); median-time-past; header sync with a persisted, resumable header store
  (spec 12 `ScanState`); and witness binding through the coinbase wtxid commitment (BIP141), so witness data can no
  longer be swapped. Vectors: real mainnet/testnet4 retarget boundaries. Do not call it SPV in docs unless all of this holds.
  Owned: `packages/btc-silent-payments/src/{header,esplora,chain*,scanState*}.ts` + tests.
- **H2 FABLE: Relayer sweep failure handling (spec 04 relayer side).** First diff what #118 (restart-safe budget,
  nonce journal, permit failure classes) already landed. Then build: a failure-class-driven fallback ladder
  (permit sweep → approve path → refuse) that never double-spends a nonce or re-broadcasts across a restart; a grief reserve
  in the loss budget; a per-seller/per-token failure counter wired to the circuit breaker so user-attributable reverts don't
  trip it (S3-06). No generic auto-retry. Owned: `apps/relayer/src/{service,budget,nonce*,sweep*}.ts`, `packages/relayer-guard/src`.
  Must keep the anvil e2e passing with `REQUIRE_ANVIL=1`.
- **H3 FABLE: Scheme-2 policy accounts end to end (experimental flag, ADR-0014 + ADR-0027 gates).** Scanner support for
  scheme id `0x47500002` next to scheme 1; payer path via `GhostPayPolicyRouter` calldata from `packages/policy-scheme`;
  withdraw/recovery flow; all behind a default-off experimental setting and never on any manifest-less build. No ABI change.
  Write the EIP-7702 client path as a design note only (no code). Owned: `packages/policy-scheme/src`, new
  `apps/web/src/features/policy/*`; the route line in `App.tsx` goes in a separate tiny commit. UI polish after the logic
  lands is **sonnet** (H3b), not fable.
- **H4 FABLE: Private scanning stage 1** (spec 10). Wire `packages/pir-two-server` into the web scan as an opt-in
  source behind the existing `scan-source` abstraction: two non-colluding servers, results cross-checked against the
  normal path in tests, fail closed on disagreement, honest disclosure text (privacy is conditional on non-collusion). No
  hosted PIR server is configured; tests use the in-repo local servers. Owned: `packages/pir-two-server/src`,
  `packages/scan-source/src`, `apps/web/src/lib/scan*` (coordinate: `Scan.tsx` is shared with H6, so H4 merges first).
- **H5 sonnet (escalate to fable only per rule 1): forge coverage failure.**
  `test/audit/Sweep.audit.t.sol:test_crossRelayerAndCrossChainReplayRejected` reverts `InvalidSignature()` only under
  `forge coverage --ir-minimum`. Find the root cause (likely cached domain separator / `block.chainid` / `address(this)`
  assumptions under the coverage build). Fix the test harness if the contract is correct; if the contract is wrong, STOP and
  report it in full sentences (no contract change without review). `contracts-coverage` must go green.
- **H6 sonnet: reconciliation timing (ADR-0026 open item 8).** First-seen time comes from the block timestamp, not from
  the save time; restored/imported payments keep their original time. Add a reconciliation schema version bump with a
  migration and a downgrade-refusal test. Owned: `apps/web/src/lib/reconciliation*`, `packages/cli/src/reconcile*`.
- **H7 sonnet: invoice `bufferPolicy` (spec 13, client only).** New invoice schema version with `maxWei/minWei`, ADR,
  strict parser, vectors, and the old-version parse kept. No contract change (the permit+buffer contract path stays deferred).
- **H8 sonnet: real-chain browser gaps** from `docs/beta/CORE_BETA_COMPLETION_TRACKER.md`: browser reconciliation on the
  anvil devnet, interrupted-session recovery across a full browser restart, and the CLI 31337 gap. Use the existing
  `scripts/beta/browser-devnet.sh` harness. Chromium: `/opt/pw-browsers/chromium`; pass `--trace off`.
- **H9 haiku: i18n extraction** for screens still on English literals (invoice, pay, scan, seller keys, sweep, registry,
  BTC). One haiku per view group, keys only + `en` values; never touch security-classified strings without classifying them.

Dispatch order (≤5 concurrent): H1, H2, H3, H4, H5 first; H6–H9 fill slots as they free. H6 waits for H4's `Scan.tsx` merge.

## WAVE 3: REVIEW + CLOSE

- **R1 FABLE, one agent per lane H1–H4:** adversarial, diff-scoped review (`git diff <pre-lane>...<lane-merge>`). Find
  exploitable defects only, each with a failing test that proves it. Report ≤10 findings, security-critical ones in full sentences.
- **R2 sonnet:** fix the confirmed R1 findings (red → green). Re-review by the same R1 agent only if a fix touches
  consensus/crypto/fund code.
- **R3 haiku:** final full run (`npm run build:libs && npm run typecheck && npm run lint && npm test`, `forge test`,
  `forge coverage --ir-minimum`, `npm run ci:scan-secrets`, `npm run ci:check-actions`, Pages tooling tests); update
  `docs/handoffs/SESSION_STATUS.md` with exact commands and counts, separating reruns from history; push; read back the remote SHA.

## FINAL REPORT (orchestrator → user, plain language, ≤300 words)

Integration PR link; lanes DONE / PARTIAL / BLOCKED with one line each; PRs closed as superseded (count + list link);
test counts before/after; agent count per model (haiku/sonnet/fable) and which escalations happened; BLOCKED-EXTERNAL list
(feeds, TRON genesis, deployments, custody, trusted setup, professional audit, native-speaker review, devices, SonarCloud,
GP-PAGES-01 custom-domain decision).
