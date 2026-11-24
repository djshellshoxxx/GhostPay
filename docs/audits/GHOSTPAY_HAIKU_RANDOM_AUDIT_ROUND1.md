# GhostPay random code audit, round 1 (read-only)

Baseline: `a89a2e94`. Experimental, unaudited. No source edits, no commits, no deploys.

## Method

- Enumerated `git ls-files`, dropped `docs/`, `*.md`, `*.json`, lockfiles, images, `.d.ts/.d.mts`, `.html/.css`, fixtures dirs, `.gitignore`/`.dockerignore`, `.prettierrc`, `allowed_signers`, and vendored `lib/`. Result: 2081 files.
- First draw (seed 20261115, over the pre-vendor-filter list of 2544) hit `packages/contracts/lib/openzeppelin-contracts/.../SignerRSA.sol` (vendored), `apps/web/locales/pseudo/.gitignore` (config). Both discarded. Re-filtered and re-sampled. Only the second draw is used.
- Seed: `20261115`. Call: `random.Random(20261115).sample(sorted(files), 10)`.
- Candidate list: `/tmp/claude-0/-home-user-GhostPay/0f9ab586-4bc3-5e3d-9fd2-fb36ed8e1358/scratchpad/final_candidates.txt`. Sample: `/tmp/claude-0/-home-user-GhostPay/0f9ab586-4bc3-5e3d-9fd2-fb36ed8e1358/scratchpad/sample.txt`.

### Selected files (round 1, final draw)

1. `packages/payer-hiding-contracts/src/GhostPayVerifyingPaymaster.sol` (208 lines)
2. `apps/web/scripts/scan-bundle.mjs` (197)
3. `scripts/devnet/write-state.mjs` (40)
4. `packages/chain-solana/src/rfc8032.test.ts` (59)
5. `packages/pool-prover/vitest.config.ts` (25)
6. `packages/cli/src/invoice-parity.test.ts` (76)
7. `packages/ux-presets/src/validate.test.ts` (182)
8. `packages/confidential-amounts/src/registry.ts` (45)
9. `integrations/prestashop/ghostpay/views/templates/hook/index.php` (3)
10. `apps/web/src/features/policy/PolicyReceive.tsx` (305, read full)

All ten read in full. Cross-checks noted inline.

## Findings

### F1. Source-scan comment stripper hides same-line code (false negative)
- **File:** `apps/web/scripts/scan-bundle.mjs:168-170`, `scanBundle()` src loop.
- **Problem:** line 168 strips `//.*$` from each source line before regex checks. That also deletes code after any `//` inside a string literal on the same line, e.g. `"https://..."`. Code after it is never checked for `innerHTML =`, `outerHTML =`, `eval(`, `dangerouslySetInnerHTML`.
- **Repro:** replay the exact regex chain in node on `const u = "https://ok.example"; el.innerHTML = userInput;`. Result: not detected. Control `el.innerHTML = userInput;` is detected. Done in scratchpad `scan-probe.mjs`.
- **Expected:** src scan flags `innerHTML` assignment on any line.
- **Actual:** missed when a URL literal precedes it on the same line.
- **Mitigation:** the dist-bundle scan (lines 112, 75-78) still counts `.innerHTML =` in built JS, and ESLint forbids these in `apps/web`. So impact is reduced, not a live XSS path found.
- **Severity:** Low. **Confidence:** High (verified by replay).
- **Class:** Confirmed defect (scanner).
- **Fix:** strip comments with a tokenizer, or only strip `//` when not inside a string. Simplest: run the checks on the unstripped text and drop only lines that are fully comments.

### F2. Host scanner skips non-literal origins
- **File:** `apps/web/scripts/scan-bundle.mjs:81-86`, `scanHosts()`.
- **Problem:** only literal `https?://host` / `wss?://host` tokens are checked. `if (m[1] === undefined) continue;` also skips bare scheme strings. Concatenated origins (`'https:' + '//x.test'`) or `'h' + 'ttps://'` pass.
- **Repro:** reasoning from regex; not executed against a real bundle.
- **Severity:** Low (build-gate heuristic, not a security boundary). **Confidence:** Medium.
- **Class:** Potential vulnerability (defense-in-depth bypass).
- **Fix:** treat the scanner as a tripwire only in docs, or additionally enforce a CSP `connect-src` allowlist test in e2e.

### F3. `_headers` and CSP checks are substring presence checks only
- **File:** `apps/web/scripts/scan-bundle.mjs:147-150`, `:136-139`.
- **Problem:** `h.includes(need)` proves a string exists, not that the directive is the effective one for `/*` or that `default-src` is not overridden elsewhere in the file. Likewise `/script-src[^;"]*'unsafe-(?:inline|eval)'/` is the only unsafe check.
- **Severity:** Low. **Confidence:** Medium.
- **Class:** Potential vulnerability (weak gate).
- **Fix:** parse `_headers` by path block and assert the CSP per block.

### F4. Stale snapshot in withdrawal action finalizer
- **File:** `apps/web/src/features/policy/PolicyReceive.tsx:99-111`, `send()`; `:109` `refreshAttempts(tok, snapshot)`.
- **Problem:** `snapshot` is the render-time React state. `fresh()` (called inside `prepare`) calls `setSnapshot(next)` and `refreshAttempts(tok, next)`, but the `finally` in `send()` still uses the closure's old `snapshot`. Attempt scopes for requests created during this action (`execute:<id>`, `cancel:withdraw:<id>`) are built from the old snapshot, so the UI attempt list can omit them until the next Check.
- **Repro:** code reading. Withdraw → Check → execute path is not run. The journal itself (`withdrawalJournal.ts:54-58`) still guards duplicates by scope, so funds-safety is not affected here.
- **Expected:** attempt list refreshed from the freshest snapshot.
- **Actual:** stale-scoped listing; UI-only.
- **Severity:** Low. **Confidence:** Medium.
- **Class:** Probable defect (UI state).
- **Suggested fix:** have `fresh()` return the new snapshot and pass it into `refreshAttempts` in `finally`, or read it from a ref.

### F5. Date rendering can throw on out-of-range chain timestamps
- **File:** `apps/web/src/features/policy/PolicyReceive.tsx:206` (`plan.plan.executeAfter`) and `:220` (`pending.executeAfter`).
- **Problem:** `new Date(Number(x) * 1000).toISOString()` throws `RangeError` for values beyond ±8.64e15 ms. A huge or sentinel `executeAfter` from chain data would throw during render. Not checked whether the policy contracts can produce such a value. No ErrorBoundary guard is visible at this call site.
- **Severity:** Low. **Confidence:** Low (not verified against contract values).
- **Class:** Potential defect.
- **Fix:** guard with a range check or `Intl`/`toLocaleString` and show "not scheduled" for out-of-range values.

### F6. Empty start block scans from genesis without a warning
- **File:** `apps/web/src/features/policy/PolicyReceive.tsx:266`.
- **Problem:** `fromBlock` empty gives `nextBlock: 0n`. The first scan then starts at block 0. Button label is "Scan" with no warning. Cost, not safety.
- **Severity:** Low. **Confidence:** High.
- **Class:** Probable defect (UX / cost).
- **Fix:** require a start block, or default to a deployment block.

### F7. Paymaster does not reject `validAfter > validUntil`
- **File:** `packages/payer-hiding-contracts/src/GhostPayVerifyingPaymaster.sol:119-121`, `:136-137`.
- **Problem:** only `validUntil == 0` is rejected (`NoExpiry`). A signed op with `validAfter > validUntil` packs into `validationData` as an always-invalid window. Signer-controlled, so not a drain. It is a missing sanity check and wastes bundler gas.
- **Repro:** reasoning from the packing at lines 136-137 and EntryPoint window semantics. Not run (no forge in this read-only pass).
- **Severity:** Low. **Confidence:** Medium-High.
- **Class:** Missing functionality / validation gap.
- **Fix:** `if (validAfter > validUntil) revert BadPaymasterData();` (or a new error), plus a Foundry test.

### F8. Paymaster gas caps: documented, verified present
- **File:** `GhostPayVerifyingPaymaster.sol:123-127`.
- **Checked:** `fees & uint128.max` and `fees >> 128` are correct under Solidity precedence (`&` and `>>` bind tighter than `>`). `preVerificationGas` cap checked. Signature covers `gasFees`, `accountGasLimits`, `preVerificationGas`, `paymasterAndData` gas fields, `chainid`, `address(this)`. `postOp` reverts and EntryPoint only calls it with non-empty context. Matches the doc.
- **Class:** False positive (investigated, no defect found). Severity: none.

### F9. Devnet state writer: hardcoded metadata, unverified accounts
- **File:** `scripts/devnet/write-state.mjs:6`, `:26-28`, `:30-37`.
- **Problem:** `chainId: 31337` is hardcoded and not compared with the RPC. USDC/DAI decimals are hardcoded (6/18) and not read from the token. USDT is picked by `one('DevPlainStablecoin')` with no symbol check. The `accounts` index map is asserted to follow anvil's default listing but nothing verifies it.
- **Mitigation:** `one()` requires exactly one CREATE per name, and `tokenBySymbol` fails loudly on mismatch. Devnet only.
- **Severity:** Low. **Confidence:** High.
- **Class:** Probable defect (devnet tooling) / documentation discrepancy.
- **Fix:** query `chainId` and token `decimals()`/`symbol()` over `rpc` before writing.

### F10. Test name promises disabled-chain coverage that is not asserted
- **File:** `packages/cli/src/invoice-parity.test.ts:69-75`.
- **Problem:** test title "identifies supported versus disabled chains", but only the supported case (84532) is asserted. No disabled-chain assertion exists.
- **Severity:** Low. **Confidence:** High.
- **Class:** Probable defect (test does not exercise advertised behavior).
- **Fix:** add a disabled-chain case with an expected `supportedForPayment: false`.

### F11. Pool-prover vitest config has dead code
- **File:** `packages/pool-prover/vitest.config.ts:4` (`r` helper unused), `:8-10` (empty `alias`), `:21` (`worker.ts` excluded from coverage).
- **Problem:** unused helper and empty alias block. Excluded `worker.ts` is not verified to exist in `src/`. Harmless but suggests config drift.
- **Severity:** Informational. **Confidence:** High.
- **Class:** Documentation discrepancy / cleanup.

### F12. Confidential-amounts `getBackend` has no production guard for the simulated backend
- **File:** `packages/confidential-amounts/src/registry.ts:34-37` (`ctm-cleartext`), `:39-43` (spike-gated ids, `default`).
- **Problem:** `ctm-cleartext` (simulated ledger) is selectable with no environment or build-profile check. Only callers in the repo are tests (`misc.test.ts`). Caller-named by design (CT-PAY-1), so this is a footgun, not a live bug.
- **Checked:** spike-gated `ct2-fhenix` / `ct3-inco` throw `BACKEND_UNAVAILABLE`. Lazy imports keep `@zama-fhe` out of the core entry. Default branch is unreachable for typed input.
- **Severity:** Low (no production caller found). **Confidence:** Medium.
- **Class:** Potential vulnerability (footgun) / missing guard.
- **Fix:** gate `ctm-cleartext` behind an explicit test-only flag or build profile.

### F13. Scanner literal check on `.test`-only path
- **File:** `apps/web/scripts/scan-bundle.mjs:166-167`.
- **Problem:** src scan skips any path matching `/\.test\.|\/test\//`. A non-test file placed under a `test/` directory is excluded from the `dangerouslySetInnerHTML`/`eval` source checks.
- **Severity:** Low. **Confidence:** High.
- **Class:** Potential vulnerability (scanner exclusion gap).
- **Fix:** exclude only `*.test.*` and files under `src/**/__tests__` or the existing testutil pattern.

## Clean files (no finding)

- `packages/chain-solana/src/rfc8032.test.ts`: none found. RFC 8032 7.1 vectors checked against an independent `@noble/curves` path, `signExpanded` prefix check matches `sign.ts:22` (`INVALID_SCALAR`). Test assertions match behavior.
- `packages/ux-presets/src/validate.test.ts`: none found. Checked the NFD test at line 35 uses U+0301 (decomposed, as the name says). Line 56 `é` is U+00E9 and rejected by the ASCII address shape, consistent.
- `integrations/prestashop/ghostpay/views/templates/hook/index.php`: none found. 3-line redirect stub with `exit`.

## Method notes and limits

- No tests, forge, or build were run (read-only pass). Paymaster findings are from reading code, not from forge tests.
- Verified by execution only: F1 (node replay of the regex chain).
- `ChainGuard.sol` and `policy/withdraw.ts` were consulted only where needed, not audited in full.
- Withdraw amount path checked: `withdraw.ts:129` enforces `0 < amount <= plan.max` before signing, so the 78-digit regex in `PolicyReceive.tsx:130` is not a funds issue.
- Journal key concern checked: `sendPolicyAction` (`withdrawalJournal.ts:54`) and `refreshAttempts` (`PolicyReceive.tsx:85`) build the same logical key, because `walletAttemptKey` (`apps/web/src/lib/wallet.ts:292-295`) excludes the call for logical actions. False positive, not reported as a defect.

## Summary counts

- Confirmed defect: 1 (F1, scanner)
- Probable defect: 4 (F4, F6, F10, F9)
- Potential vulnerability: 4 (F2, F3, F12, F13)
- Missing validation / functionality: 1 (F7)
- Potential defect: 1 (F5)
- Documentation / cleanup: 1 (F11)
- False positive: 1 (F8)
- Clean: 3 files
