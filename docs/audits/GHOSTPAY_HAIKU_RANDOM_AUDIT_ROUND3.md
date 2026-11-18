# GhostPay random code audit, round 3 (read-only, post-fix regression)

Read-only. No source edits, no commits. Only this file written. Branch `claude/lucid-meitner-apalzc`, HEAD `38cb0bfa` at start. Repo not deployed.

## Seed and method

- Seed: `20261118`.
- Candidate pool A: `git ls-files` under `apps/ packages/ scripts/ .github/workflows/ integrations/ contracts/ tests/` plus `*.sol`. Excluded `lib/`, `node_modules`, `dist`, `build`, `docs/`, `*.md`, `*.json`, lockfiles, images, fonts, `.html`, `.css`, `.d.ts`, `.d.mts`, `.snap`, dotfiles, fixtures. 1952 candidates. Removed the 23 files sampled in rounds 1 and 2 (all 23 matched the candidate list and were removed). Pool = 1929.
- Section A draw: `random.Random(20261118).sample(sorted(pool), 10)`. No trivially-empty file was drawn.
- Section B: `git diff --name-only a89a2e94..HEAD -- apps packages scripts .github`, 31 paths. Non-test source filter (excluded tests, `vitest.config`, `.md`, `.json`, lock, `.snap`, `.d.ts`, `.d.mts`) gave 17 files. Draw: `random.Random(20261118).sample(sorted(17), 4)`. First draw hit `apps/web/scripts/scan-bundle.d.mts` (declaration file), so it was discarded and the draw redone on the list without `.d.mts`. Note: `scan-bundle.mjs` was also a round-1 file, so it is in both sections.
- Each B file: read each changed hunk (`git diff a89a2e94..HEAD -- <file>`) and surrounding function, grepped callers and tests.
- Tools run: vitest (see Verification), `tsc --noEmit`, `node --test`, node probes. `forge` not installed, so Solidity was read only.

### Section A: files (10)

1. `packages/ux-vault/vitest.config.ts` (24)
2. `packages/pool-contracts/test/GhostPayShieldedPool.invariant.t.sol` (293)
3. `packages/ux-flow/src/reconcile.test.ts` (327)
4. `packages/btc-payjoin/src/receiver/checks.ts` (133)
5. `packages/confidential-amounts/src/backends/zama-sdk.ts` (129)
6. `apps/web/src/components/TagArchive.retry.test.tsx` (85)
7. `apps/web/scripts/embed-sri.mjs` (30)
8. `packages/scan-source/src/types.ts` (104)
9. `apps/relayer/src/ops.ts` (430)
10. `packages/btc-silent-payments/src/index.ts` (27)

### Section B: files (4, changed in a89a2e94..HEAD)

1. `packages/i18n/src/ux/readability.ts`
2. `packages/chain-adapters/src/rpc.ts`
3. `apps/web/src/components/QrFrame.tsx`
4. `apps/web/scripts/scan-bundle.mjs`

## Verification run

| Check | Result |
|---|---|
| `apps/web` vitest `TagArchive.retry.test.tsx` | 4/4 pass |
| `packages/i18n` vitest `src/ux/readability` | 2/2 pass |
| `packages/chain-adapters` vitest `src/rpc.test.ts` | 86/86 pass |
| `apps/web` vitest `scanBundle.test.ts` + `QrFrame.largeWarning.test.tsx` | 46/46 pass |
| `node --test scripts/tests/check-tx-origin.test.mjs` | 8/8 pass |
| `packages/btc-silent-payments` `tsc --noEmit` | exit 0 |
| node probe of `stripComments` (scan-bundle.mjs) | 2 sink-hiding cases missed (F1) |
| `scripts/check-tx-origin.sh` on split-token repro | exit 1, detected (prior R2-F1 fixed) |
| `emitEmbedSri` run twice on temp dist | `_headers` block duplicated (F4) |

Probe scripts: `/tmp/claude-0/-home-user-GhostPay/0f9ab586-4bc3-5e3d-9fd2-fb36ed8e1358/scratchpad/r3/probe_strip.mjs`, `/tmp/claude-0/-home-user-GhostPay/0f9ab586-4bc3-5e3d-9fd2-fb36ed8e1358/scratchpad/r3/emb_probe.mjs`.

## Findings

### F1. `stripComments` misses sinks after regex literals (incomplete fix of round-1 F1)
- **File:** `apps/web/scripts/scan-bundle.mjs:95-118` (`stripComments`), `:102-103` (`//` branch), used at `:198`.
- **Function:** `stripComments()` feeding the src scan in `scanBundle()`.
- **Problem:** the string-aware stripper (commit `e77172cf`) handles `"`, `'` and template literals, but not regex literals. A `//` or `/*` inside a regex literal is treated as a comment, and the rest of the line (or up to the next `*/`) is dropped before the sink regexes run.
- **Repro (executed):**
  - `const slash = /\//; el.innerHTML = userInput;` gives `const slash = /\`. Sink missed.
  - `const cls = /[/*]+/; el.innerHTML = userInput; /* done */` gives `const cls = /[`. Sink missed.
  - Control `const u = "https://ok.example"; el.innerHTML = userInput;` is detected. The round-1 URL case is fixed.
- **Expected:** `src/...: innerHTML/outerHTML assignment` reported for both repros.
- **Actual:** not reported. `scanBundle.test.ts` covers only the URL-in-string case (line 94-97), so the gap is untested.
- **Severity:** Low (postbuild tripwire; ESLint also forbids these sinks in `apps/web`).
- **Confidence:** High (executed).
- **Class:** Confirmed defect (incomplete fix).
- **Fix:** track regex-literal context (previous significant token), or run the sink regexes on unstripped text and drop only whole-line comments. Add a test with `/\//` and `/[/*]+/` followed by a sink.

### F2. JSDoc of `scanBundle` now sits above `stripComments`
- **File:** `apps/web/scripts/scan-bundle.mjs:89-94` vs `:120`.
- **Problem:** the new helper was inserted between the existing `/** Scans a built dist directory ... */` block and `export function scanBundle`. The doc now describes `stripComments`, and `scanBundle` has none.
- **Severity:** Low. **Confidence:** High.
- **Class:** Documentation discrepancy.
- **Fix:** move the helper above the existing JSDoc.

### F3. `emitEmbedSri` is not wired into any build step
- **File:** `apps/web/scripts/embed-sri.mjs:2-4` (header claims it publishes the immutable pinned file and SRI), `:10-25`.
- **Function:** `emitEmbedSri()`.
- **Problem:** `apps/web/package.json` has no embed step (only `"postbuild": "node scripts/scan-bundle.mjs"`). Repo-wide grep finds no build, CI or script caller. The only caller is the unit test `apps/web/src/buildScripts.test.ts:12`. A normal `npm run build` therefore does not produce `dist/ghostpay-embed-v1.<sha>.js` or `dist/embed-sri.json`, though the header says merchants should pin that file.
- **Repro:** `grep -rn "embed-sri\|emitEmbedSri" --include=*.json --include=*.yml --include=*.mjs --include=*.sh --include=*.ts .` shows no build caller.
- **Expected:** build (or postbuild) emits the immutable file and SRI record.
- **Actual:** not emitted by the build.
- **Severity:** Medium if merchants follow the release notes; the pinned file does not exist in a normal build.
- **Confidence:** High (wiring); Medium (impact, not checked against release process).
- **Class:** Missing functionality (documented, unwired).
- **Fix:** add to `postbuild` after `scan-bundle`, or document the manual release step that runs it.

### F4. `emitEmbedSri` is not idempotent and silently skips headers
- **File:** `apps/web/scripts/embed-sri.mjs:20-23`.
- **Problem:** each run appends another `# Immutable, content-addressed copy...` block to `dist/_headers`. If `_headers` is absent, the `if (existsSync(headers))` branch is skipped silently, so the immutable file ships without its CORS and CRP headers.
- **Repro (executed):** call `emitEmbedSri(dir)` twice on a temp dir with `_headers`. The marker count is 2.
- **Expected:** one block per emitted file; error or warning when `_headers` is missing.
- **Actual:** duplicate block; silent skip.
- **Severity:** Low. **Confidence:** High.
- **Class:** Probable defect.
- **Fix:** replace the block between markers, or skip the append when the `/${file}` line exists. Throw when `_headers` is missing.

### F5. Late-result test may pass vacuously if the guard were removed (unverified)
- **File:** `apps/web/src/components/TagArchive.retry.test.tsx:57-67` ("drops a late decryption result after an idle lock").
- **Function:** test body, guard in `TagArchive.tsx` `onPreview` (`current(c)` checks around `:292-313`).
- **Problem:** after `resolve(preview)` the test flushes with one `await Promise.resolve()` inside `act`, then asserts that no "Apply import" button exists. With the guard removed, `setStaged` runs after `await historyVaults(c)` and may land after the assertion, so the test could pass even without the guard. Not mutation-tested (no source edits allowed).
- **Severity:** Low. **Confidence:** Low.
- **Class:** Potential defect (test weakness).
- **Fix:** wait for a settled condition (for example, flush several ticks or `waitFor` a terminal state) before asserting absence. Confirm with a temporary mutation in a scratch copy.

### F6. Payjoin in-flight lock is per session instance (unverified race)
- **File:** `packages/btc-payjoin/src/receiver/session.ts:30` (`inflight` per instance), `:52-56`; `packages/btc-payjoin/src/receiver/checks.ts:125` (`seen.has`).
- **Problem:** the outpoint lock lives on each `ReceiverSession`. The shared `ctx.seen` store is written only at `session.ts:56`, after `buildProposal`. Two session instances sharing one `seen` store can both pass `checkOriginal` for the same Original concurrently. No construction site found in `src/`, so exposure depends on how callers build sessions.
- **Severity:** Low to Medium, depending on deployment. **Confidence:** Low (not executed).
- **Class:** Potential vulnerability (race).
- **Fix:** reserve outpoints atomically in the shared store before building; or make `seen.add` a compare-and-set.

### F7. Prior R1-F7 still open: paymaster accepts `validAfter > validUntil`
- **File:** `packages/payer-hiding-contracts/src/GhostPayVerifyingPaymaster.sol:119-121`, `:136-137`.
- **Problem:** only `validUntil == 0` is rejected. Re-checked at HEAD: no `validAfter > validUntil` check exists.
- **Severity:** Low (signer-controlled; wasted bundler gas). **Confidence:** High (source). Not run (no forge).
- **Class:** Missing validation (open from round 1).
- **Fix:** `if (validAfter > validUntil) revert BadPaymasterData();` plus a Foundry test.

### F8. Prior R2-F4 still open: `WrongChain` NatSpec incomplete
- **File:** `packages/pool-contracts/src/interfaces/IGhostPayShieldedPool.sol:133-134`.
- **Problem:** the doc still omits the chain 31337 refusal when mainnet WETH9 has code (`src/lib/PoolConstants.sol`).
- **Severity:** Low. **Confidence:** High.
- **Class:** Documentation discrepancy (open from round 2).
- **Fix:** update the NatSpec.

### F9. Prior R1-F12 still open: `ctm-cleartext` selectable with no production guard
- **File:** `packages/confidential-amounts/src/registry.ts:34-37`.
- **Problem:** the simulated backend is chosen only by requiring `deps.ledger`. No environment or build-profile check. No production caller found.
- **Severity:** Low (footgun). **Confidence:** High.
- **Class:** Potential vulnerability (footgun, open from round 1).
- **Fix:** gate behind a test-only flag or build profile.

## Regression status of prior-round items (spot-checked)

| Item | Status at HEAD | Evidence |
|---|---|---|
| R1-F1 scan-bundle same-line sink (URL literal) | Fixed, tested | `scanBundle.test.ts:94-97` passes |
| R1-F1 scan-bundle same-line sink (regex literal) | Incomplete | F1 above |
| R1-F7 paymaster validAfter>validUntil | Open | F7 |
| R1-F12 ctm-cleartext guard | Open | F9 |
| R2-F1 tx.origin split across lines | Fixed, tested | repro exit 1; `check-tx-origin.test.mjs` 8/8 |
| R2-F2 sponsor receipt timeout not charged | Fixed, tested | `payer-sponsor/src/sponsor/service.ts:536-540` charges worst case and returns `OUTCOME_UNKNOWN` with hash; `workerB.test.ts` covers it |
| R2-F3 zero-value witness accepted | Fixed | `pool-circuits/src/inputs.ts:89-90`, `:144-145` |
| R2-F4 WrongChain doc | Open | F8 |

Not re-checked this round: R1-F4, R1-F5, R1-F6, R1-F9, R1-F10, R1-F11, R1-F13, R2-F5, R2-F6.

## Section B: changed hunks, no defect found

- `packages/i18n/src/ux/readability.ts`: linear scan replaces `/[.!?]+(?:\s|$)/`. Counting rule is equivalent: a terminator run counts when followed by whitespace or end of string. `readability.redos.test.ts` and the 2 readability tests pass. Callers: `glossary.ts`, `compat.test.ts`.
- `packages/chain-adapters/src/rpc.ts`: non-finite `retries` maps to 0. `Infinity` also maps to 0, which matches the comment. `rpc.test.ts:99-100` covers NaN (expects 1 attempt), so reverting the fix would hang or fail that test. Tests pass.
- `apps/web/src/components/QrFrame.tsx`: the new warning inside the full-screen dialog (`:329`) is intentional, since the dialog is `aria-modal`. `QrFrame.largeWarning.test.tsx` uses `within(dialog)` and would fail without the change. The outer warning (`:290`) is pre-existing and not duplicated for AT. Locale key `qrFrame.warning` exists in en, ja, es, ar.

## Section A: clean files

- `packages/ux-vault/vitest.config.ts`: alias targets exist (`src/portable.ts`, `core-crypto`, `invoice-schema`, `chain-adapters`). Coverage excludes `src/index.ts`. Nothing found.
- `GhostPayShieldedPool.invariant.t.sol`: model window check (`size - s < 64`) matches `attackStaleRoot` (`rootAtSize[size-64]`). Attack handlers swallow reverts by design, so the invariant only proves no success, not the reason. Not run (no forge).
- `reconcile.test.ts`: boundary tests (`observedAt` 999 and 1000, `expiresAt` 5000 and 5001) match the stated windows. Read only, not run.
- `payjoin/checks.ts`: fee-rate, prevout authority and mixed-sequence checks are correct. First-match payment output is benign for the receiver. Only F6 (session scope) noted.
- `zama-sdk.ts`: `[UNVERIFIED]` header is accurate. Cleartext runtime guarded to chain 31337. `asBigint` guards decrypt results. No new defect.
- `scan-source/src/types.ts`: type declarations only. `verifiesLogs` is documented as unverified for Helios.
- `apps/relayer/src/ops.ts`: read path is read-only (`FileStateBackend.read()` has no lock or write). Budget and age math match `DailyBudget` as commented. `health` requires HTTP 200 and `status: ok`. `redirect: 'error'` set. No defect found.
- `btc-silent-payments/src/index.ts`: all re-exported modules exist. `tsc --noEmit` exit 0.

## Summary counts (round 3)

- Confirmed defect: 1 (F1)
- Probable defect: 1 (F4)
- Potential vulnerability / defect: 3 (F6, F5, F9)
- Missing functionality: 1 (F3)
- Missing validation (open from R1): 1 (F7)
- Documentation discrepancy: 2 (F2, F8)
- Fixed prior items confirmed: 4 (R2-F1, R2-F2, R2-F3, plus R1-F1 URL case)
- False positive: 0
