# GhostPay handoff pack: Haiku wave and Opus milestone prompt

Date: 2026-10-30 UTC. Prepared from branch `claude/sharp-bohr-uigfgh` at `edb0051eb89bd135c73733d9db14569aa000662d` (equal to `origin/main`). Recheck the live ref before acting.

This document is documentation only. It grants no release, deploy, merge, push, or production-funds authority.

Contents:
1. Current state (verified from repo)
2. Part A: prompt for Haiku workers
3. Part B: handoff record Haiku must fill in
4. Part C: prompt for the next advanced model (Opus) for milestone M1

---

## 1. Current state

- Latest code work: PR #27 merged (`7ea6c3c`, head `a4ab45f`). It added: fail-closed secondary RPC in Scan; gas buffer v2 client (60 s TTL, sweep `eth_estimateGas` simulation, send-time recheck, permit pre-flight); BTC header/PoW/Merkle verification; tag vectors; archive fuzz moved to a coverage-off pass.
- Latest docs work: PRs #28 and #29 (`a6a2a1c`, `edb0051`). Owner-approved lean scope: `docs/handoffs/LEAN_RELEASE_SCOPE.md`, `docs/handoffs/RESTART.md`. Supersedes the older priority list in `docs/handoffs/NEXT_AGENT_PROMPT.md`.
- Lean scope milestone: one EVM path only. Local/test invoice → pay → detect/receipt → sweep → encrypted backup / fresh-profile restore. Multi-chain (BTC, Solana, TRON), relayer retry/fallback, and optional features are deferred.
- No deployments. `deployments/` has `31337.json` (local anvil) plus schema/README. No Sepolia/Base Sepolia manifests (audit gap G-01). Without a manifest the web app disables Pay.
- Known correctness gap on the core path (audit W-09, `docs/audits/03-security-review-client-relayer.md` ~line 94): `apps/web/src/views/Scan.tsx:147-152` and `:198` show amounts from announcement metadata for non-router matches. `apps/web/src/lib/scanClient.ts:125` and `packages/chain-adapters/src/adapter.ts:225` do not verify against a transfer. Fix is Opus work (see Part C).
- Fiat pricing path is dead: `FEEDS` empty (G-03). `CreateInvoice` still allows unpayable fiat invoices.
- Test status: last clean full-web coverage run was on `9822122`, with two time-limit failures (archive fuzz under coverage; scanner 1M-log fuzz on this slower container). Both are green on GitHub CI. Do not raise deadlines or cut cases.
- Relayer has an anvil e2e test: `apps/relayer/src/e2e.anvil.test.ts`.
- Operator runbooks already exist in `docs/operators/` (incl. `testnet-runbook.md`, `chain-enablement-checklist.md`). Verify before rewriting. `docs/user/` has 13 guides. `apps/web/README.md` exists.
- Tooling: Node >= 22, `npm ci --ignore-scripts`, `npm run build:libs` before typecheck/test. Foundry may be absent; check before use. Browser: `/opt/pw-browsers/chromium`.

---

## Part A: Prompt for Haiku workers

Paste this into each Haiku worker. One worker per task. Keep the scope to the task.

```
You are a Haiku worker on djshellshoxxx/GhostPay. Branch: claude/sharp-bohr-uigfgh. Base: edb0051.

READ FIRST (do not skip):
- docs/handoffs/HAIKU-WAVE-2026-10-30.md (sections 1 and A)
- docs/handoffs/LEAN_RELEASE_SCOPE.md
- docs/handoffs/RESTART.md
- AGENTS/CLAUDE instructions in repo root if present

HARD RULES
1. Scope: only the task you are given. Do not touch other tasks' files.
2. Never edit fund-safety, key, crypto, scanner-matching, finality/reorg, sweep, nonce, relayer, or contract logic. That is Opus work. If the task seems to need it, STOP and report.
3. Never weaken: KDF profiles, coverage thresholds (90/85/90/90), fuzz case counts, timeouts, expiry, or security gates. Never skip or delete a failing test to get green.
4. Never deploy, publish a manifest, use keys or RPC secrets, send transactions, or touch production funds.
5. Never claim audited, production-ready, deployed, anonymous, or real-money safe.
6. Never add model names to commits, PRs, or code comments.
7. Do not use the owner's private review packet or any path outside the repo. Ask the coordinator if needed.
8. Pattern-match existing code style, naming, and comment density. Read the surrounding file before editing.
9. Regression test first for any behaviour change. Show it fail before the fix and pass after.
10. Commit small, local only. Do NOT push or open a PR unless the coordinator has confirmed in writing.

VERIFY BEFORE REPORTING
- Run the exact commands for your task. Record command, exit code, and pass/fail counts.
- Keep historical results separate from reruns. A doc-only change is not a test pass.
- Skipped gate = say so. Blocked = say so with the error.

REPORT (under 150 words, or the template in section B):
- Task ID, commit SHA(s), files changed
- Commands run + results
- Anything skipped, blocked, or needing Opus/owner
```

### Task queue (assign one per worker)

**H1. Baseline verification on exact head** (1 worker)
- Run: `npm ci --ignore-scripts`; `npm run build:libs`; `npm run typecheck`; `npm run lint`; `npm run ci:scan-secrets`; `npm run ci:check-actions`.
- Run focused web tests only: `cd apps/web && npx vitest run src/lib/pay.test.ts src/lib/payExec src/lib/sweep.test.ts src/lib/receipts.test.ts src/lib/keystore.test.ts src/lib/keyVault.test.ts src/lib/walletJournal.test.ts src/lib/duplicateAttemptJournal.test.ts src/views/Pay src/views/Scan.test.tsx src/views/Sweep.test.tsx`
- Do NOT run full coverage (too slow here, and the fuzz times out on this container).
- Output: a table of commands and results. Do not edit any code.
- Acceptance: report only; no commits.

**H2. Core-path test gap matrix** (1 worker, read-only)
- Build a table for the lean milestone: invoice create/sign/open; pay preview and consent; cancellation; detect/reconcile; finality/reorg; sweep (direct and relayer); nonce/outcome; encrypted backup; fresh-profile restore with source retained; lock; stale session.
- For each row: existing tests (file:line), gaps, and a risk tag (fund-safety / UX / docs).
- Write to `docs/handoffs/CORE_TEST_GAP_MATRIX-2026-10-30.md`. Doc only.
- Acceptance: every row cites real file paths. No invented test names.

**H3. Reproduce W-09 (amount shown without transfer check)** (1 worker)
- Write a focused reproduction test in a NEW file `apps/web/src/lib/scanClient.w09.repro.test.ts` (or nearest existing pattern). It must show a non-router announcement is shown as "received" with an amount.
- Do NOT fix production code.
- Do NOT commit a red test. Leave the file uncommitted in the working tree and report the exact failing assertion, or mark with `it.fails` if that pattern exists in the repo (check first).
- Acceptance: test output pasted in report; production code unchanged.

**H4. Fiat option off until feeds exist (G-03)** (1 worker)
- In `apps/web/src/views/CreateInvoice.tsx`, hide or disable the "Fiat price" option (not just a warning). Make it a single flagged constant, e.g. `FIAT_PRICING_ENABLED = false`, with a comment pointing to G-03.
- Update `CreateInvoice.test.tsx`: fiat is not selectable; existing crypto-price tests still pass.
- Escalate if removing fiat breaks an existing spec/invariant: report instead of forcing.
- Acceptance: focused tests pass; diff < 80 lines.

**H5. Doc hygiene (G-08, G-31, G-32)** (1 worker)
- Fix stale claims in root `README.md` status section and package map where the code disagrees (verify each against the code first). Annotate stale code samples in `docs/` rather than rewriting specs.
- Check `apps/web/README.md`, `.env.example`, `THIRD_PARTY.md` for accuracy. Fix only factual errors.
- Do NOT claim anything new is verified.
- Acceptance: each change cites the code file that proves it.

**H6. Forge compile check (G-12)** (1 worker, only if forge is installed)
- Run `forge build` in `packages/contracts`. If `Sweep.audit.t.sol:24` (`pure` → `view`) or similar fails, make the minimal fix in the test file only. Do not change contracts.
- If forge is not installed, report "blocked: no forge" and stop.
- Acceptance: build output pasted; no contract source changed.

### Escalation rule (any worker)

Stop and report to the coordinator if any of these come up:
- Change needed in `Scan`/`scanClient` matching, `chain-adapters` router/sweep builders, `relayer` sweep path, key derivation, KDF, backup/restore crypto, or finality/reorg logic.
- A test fails and the cause is not obvious. Capture the output; do not "fix" the test.
- Need for a manifest, RPC secret, deploy, or push.

---

## Part B: Handoff record (each worker fills this in)

```
## Haiku wave report — <task ID>
- Branch / base SHA:
- Commit(s) SHA + files changed:
- Commands run (exact) and exit codes:
- Test counts (pass/fail/skip) — rerun vs historical:
- Gates NOT run and why:
- Blocked / needs Opus or owner:
- Evidence files (paths):
- Next unreviewed area:
```

The coordinator collects these into `docs/handoffs/SESSION_STATUS.md` after the wave. Do not overwrite earlier entries.

---

## Part C: Prompt for the advanced model (Opus) — milestone M1

Paste this into an Opus session when the Haiku wave is done.

```
You are the integration lead for djshellshoxxx/GhostPay ONLY. Branch: claude/sharp-bohr-uigfgh (or a new branch from origin/main if the old one is merged; never stack on merged history).

MILESTONE M1 (lean scope, docs/handoffs/LEAN_RELEASE_SCOPE.md): one EVM path, local/test only.
invoice create+sign+open → preview+consent → pay → detect + reconcile + receipt → sweep (direct) → encrypted backup → fresh-profile restore with source retained. Lock and stale-session fail closed. Finality/reorg and unknown outcomes stay honest.

Out of scope for M1: BTC/Solana/TRON, generic relayer retry/fallback, fiat, escrow, policy account, tag archive expansion, new features. Do not expand scope.

READ FIRST: LEAN_RELEASE_SCOPE.md, RESTART.md, HAIKU-WAVE-2026-10-30.md (incl. Haiku reports in SESSION_STATUS), CORE_TEST_GAP_MATRIX (if produced), docs/audits/03-security-review-client-relayer.md (W-09, W-14, A-04), docs/audits/01-completeness-audit.md (G-01..G-05), docs/specs/13-gas-buffer-v2.md, docs/specs/04-permit-griefing-fallback.md.

RULES
- Reproduce each assigned failure before fixing. Regression test first; show it fail, then pass.
- Smallest authorized fix. No refactors beyond the fix.
- Keep thresholds 90/85/90/90, KDF profiles, fuzz counts, deadlines.
- Client-side architecture: user-held keys, no app backend. RPC/relays are external deps.
- No deploy to live networks, no real funds, no mainnet manifests, no release.
- Record for each milestone: exact SHA, files/functions changed, commands + results, skipped gates, unresolved cases, next area. Separate historical results from reruns.
- Push only with owner approval. Draft PR per repo instructions after push.

TASKS, IN ORDER
1. W-09 receipt truth (blocker for honest receipts). In `Scan.tsx` / `scanClient.ts` / `chain-adapters/src/adapter.ts`: show amount as "received" only when viaRouter AND the transfer is confirmed (balanceOf or Transfer log at the one-time address), with confirmation depth. Non-router matches labelled "unverified announcement". De-duplicate by (stealthAddress, ephemeralPublicKey). Use H3's repro as the first failing test.
2. G-05 manifest read-back: validate FEE_RECIPIENT/ANNOUNCER/FEE_BPS/codehash on-chain at load; fail closed. Local anvil first.
3. Local anvil deployment path (G-01 prep, NOT a live deploy): script to deploy Deploy.s.sol to anvil; write a candidate manifest for 31337 (exists: deployments/31337.json; verify it matches). Add SmokeSepolia-style script for later, do not run on Sepolia without owner go-ahead.
4. Web end-to-end on anvil (G-02 subset): create invoice → pay with a test wallet adapter → scan → direct sweep → backup → restore into fresh profile. Use the relayer anvil e2e file as a pattern. Record tx hashes and log in docs/handoffs/evidence/.
5. Sweep outcome and nonce checks on the direct path; unknown outcome shown honestly. Relayer fallback ladder is NOT in M1.
6. Review restore/lock/stale-session behaviour against the core-path matrix; add tests for gaps Haiku listed.

OWNER DECISIONS NEEDED (ask via report, do not guess):
- Throwaway fee recipient address for any testnet manifest.
- Whether a Sepolia/Base Sepolia deploy is authorized (G-01). Default: NO; anvil only.
- Whether the owner-supplied private review packet is available to this executor (RESTART.md step 3).

DEFINITION OF DONE (M1)
- Each step has a passing regression test on exact head, plus the broad check run once (typecheck, lint, focused suites). Full coverage run only on an uncontended machine; record any timeouts, do not hide them.
- Demo log with tx hashes on anvil, backup file round-trip, fresh-profile restore.
- Updated SESSION_STATUS and RESTART.md.
- Independent review of exact build still required before any claim beyond local/test.
```

---

## Part D: Exact next actions for the coordinator

1. Dispatch Haiku tasks H1–H6 in parallel (max 4 at once; the container has 4 CPUs). H1 runs first if the others need a clean install.
2. Collect Part B reports into `docs/handoffs/SESSION_STATUS.md`.
3. Confirm with the owner: push/draft-PR authority for this branch; fee-recipient and deploy decisions (Part C owner list).
4. Start Part C on Opus when H3 repro exists.
