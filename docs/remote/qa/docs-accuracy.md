# Docs accuracy QA

Branch `claude/remote-extensions-1`, 2026-10-21. Scope: README.md, package/app READMEs, docs/operators/*, docs/remote/STATUS.md, DEVIATIONS vs code. Findings only; no doc or source was edited. Environment note: other agents ran heavy jobs concurrently (forge, vitest), so timing-sensitive results are load-affected.

## What ran (real results)

| Command | Result |
|---|---|
| `npm run typecheck` (root, all workspaces) | exit clean, no errors |
| `npm run lint` (root) | clean |
| `npm run build --workspace @ghostpay/web` | pass; bundle scan "7 files, no eval/new Function/innerHTML use, no unexpected origins, no source maps, no manifests" |
| `npm run test:e2e --workspace @ghostpay/web` | 15 passed (1.4 min), chromium preinstalled |
| `npm run ci:scan-secrets` / `ci:check-actions` | OK / OK (44 `uses:` pinned) |
| `npm test` per workspace (vitest) | invoice-schema 174, chain-adapters 216, btc-silent-payments 299, relayer-guard 137, secret-box 31, tx-review 145, address-safety 71, ops-monitor 52: all pass; coverage rows equal STATUS.md for invoice-schema, chain-adapters, btc, relayer-guard, tx-review, address-safety, ops-monitor, policy-scheme |
| core-crypto | 1 failed / 53 passed in the concurrent run (`differential.test.ts` 500-key case, load timeout, as STATUS.md already notes); not re-run alone |
| apps/web `npm test` | first full run 4 failed / 316 passed (keystore x1, Pay x1, SellerKeys x2). Re-run of the 3 files: keystore + SellerKeys pass, Pay fails once (`Unable to find role="heading" and name "Review payment"`, 3.1 s); Pay alone x2: 24/24 pass. Load flake, see D9 |
| `forge fmt --check` | pass |
| `forge build --sizes` | compiles; only lint warnings `environment-read-across-mutation` in `test/audit/` |
| `bash scripts/check-natspec.sh` | OK for all listed contracts |
| `forge test` (default profile) | 23 suites, 377 passed, 0 failed, 0 skipped; 321 s and 356 s on two runs |
| `forge snapshot --check` (as CI) | rc 0 |
| `forge coverage --ir-minimum ... --match-test test_crossRelayerAndCrossChainReplayRejected` | `[FAIL: InvalidSignature()]`: STATUS.md failure reproduced |
| `bash scripts/pre-deploy-check.sh router` | no env: `FAIL FEE_RECIPIENT unset or zero`, "nothing was broadcast"; with `FEE_RECIPIENT` + `ALLOWED_CHAIN_IDS=1`: all checks passed; bad arg: usage, rc 2 |
| `scripts/verify-release.sh` on a synthetic tarball + SHA256SUMS | good file: "RESULT: hash checks passed"; one appended byte: "RESULT: FAILED" |
| Relayer startup with `relayer.config.example.json` + throwaway key/secret, empty `DEPLOYMENTS_DIR` | `fatal: config chains[0].sweepRelayer: no manifest and no sweepRelayer configured` (matches runbook "refuses the chain without a manifest") |
| `node scripts/links.mjs` (my link/path check over README, operators, package READMEs, INDEX, STATUS) | no broken relative links; 2 path hits are package-relative (`scripts/gen-abi.sh`, `scripts/pre-deploy-check.sh`), valid |
| `REQUIRE_ANVIL=1 ANVIL_BIN=... vitest src/anvil.test.ts` in policy-scheme | 1 failed ("REQUIRE_ANVIL=1 but anvil or contract artifacts are missing"): guard works, artifacts missing here |

Verified claims (code/data): README fee numbers (`FEE_BPS=25`, <400 base units no fee: `GhostPayRouter.sol:32,216`, `fees.ts:36-41`; sponsor 110 %/50 bps min/300 bps cap: `fees.ts:14-20`); enabled chains Sepolia/Base Sepolia only (`chains.ts:34-35`, rest `enabled: false`); policy router entry points exist; 43 audit PoC tests (`test/audit` function count = 43); 274 = 231 + 43 consistent; BIP-352 "28 sending + 29 receiving" (counted from `send_and_receive_test_vectors.json`: 28 cases, 28 sending, 29 receiving); echidna.yaml `testLimit: 300000`, mutation-report numbers (582/565/573/577/99.3 %) consistent between README and `mutation-results-local.md`; CI structure (jobs, matrix, `sed -i` solc in `.github/actions/setup-forge/action.yml:14`, nightly cron `17 3 * * *`, 100 000 fuzz runs, slither 0.11.6); `@ghostpay/*` wiring claim (web: chain-adapters/core-crypto/invoice-schema; relayer: chain-adapters); relayer env vars and routes match `config.ts`/`main.ts`/`server.ts`; 16 KiB body cap (`server.ts:12`); 1800 s deadline max (`config.ts:19`).

## Defects

### D1 (Medium) Relayer runbook `/healthz` statuses are wrong
`docs/operators/relayer-runbook.md:76` lists `ok`, `degraded` ("some chain open or half-open"), `unhealthy` ("no chain can serve"), `shutting_down`. Code `apps/relayer/src/service.ts:73,175-178`: type is `'ok' | 'degraded' | 'shutting_down'`; `degraded` only when EVERY chain breaker is `open`; `unhealthy` does not exist; a half-open or single open breaker reports `ok`. `server.ts:235` returns 200 only for `ok`. Operators alerting on "anything other than ok" will miss a single open chain. Repro: read the lines above. Corrected text: "`ok` (at least one chain breaker not open, including half_open), `degraded` (every chain breaker open; HTTP 503), `shutting_down` (503). A single open or half-open chain still reports `ok`; read the per-chain `breaker` field."

### D2 (High, doc vs code) S3-05 "fix in the working tree" is not in the relayer
`relayer-runbook.md:76,90` say the half-open latch fix (probe timeout) "is in the working tree" and that `healthz` earlier reported `ok`. `apps/relayer/src/breaker.ts:41-47,52-65`: `allow()` returns false in `half_open` and nothing times the probe out or re-opens; only `packages/relayer-guard/src/breaker.ts:31,209-213` has `probeTimeoutMs`, and relayer-guard is not imported by `apps/relayer` (`grep @ghostpay/relayer-guard apps/relayer/src` empty). So the relayer still has S3-05 and `/healthz` still says `ok` while stuck. Also `apps/relayer/README.md:21` ("503 when every chain's breaker is open") agrees with the code, contradicting the runbook. Suggested text: "Fix exists only in `packages/relayer-guard` (not wired). In `apps/relayer` S3-05 is still open; restart if `half_open` persists."

### D3 (Medium) `/metrics`, alert webhook described as "in progress"; absent
`relayer-runbook.md:80` describes `ghostpay_relayer_*` metrics and an alert webhook. `grep -in metrics apps/relayer/src/*.ts` and `apps/relayer/README.md`: no hits. Suggested text: "Not implemented. Alert externally on `/healthz` and logs."

### D4 (Low) STATUS.md says the test counts "Nothing skipped unless listed" but policy-scheme 60 is 53 passed + 7 skipped
`docs/remote/STATUS.md:3,15`: observed `Tests 53 passed | 7 skipped (60)`, `Test Files 4 passed | 1 skipped`. README `packages/policy-scheme/README.md:36` also says "60 passed" (then notes anvil tests skip). Same for relayer (`STATUS.md:21` 193): observed 192 passed + 1 skipped with coverage 98.36 / 96.28 / 99.33 / 98.93 (STATUS: 98.99 / 96.9 / 99.33 / 99.69, which presumably includes the anvil e2e). Corrected: "policy-scheme 60 (53 + 7 skipped without anvil/forge artifacts)"; "relayer 193 only with anvil + artifacts; 192 + 1 skipped otherwise, coverage lower."

### D5 (Medium) Relayer anvil e2e cannot run from a normal `forge build` here; docs imply it can
`apps/relayer/README.md:113` / root README: "run `forge build` first". `e2e.anvil.test.ts:12-16` requires `packages/contracts/out/PermitToken.sol/PermitToken.json`. In this checkout `packages/contracts/out` has `GhostPaySweepRelayer.sol` but no `PermitToken.sol`, and `ANVIL_BIN=/root/.local/bin/anvil vitest run src/e2e.anvil.test.ts` gives `1 skipped`. Also the default `ANVIL` path is `/home/user/tools/foundry/anvil` (`:12`), a sandbox path. STATUS.md:41 claim "relayer anvil test ran here with ANVIL_BIN set" is unverified by me (could not reproduce; maybe needs a full `forge build` into default `out`; I did not touch it). Repro: command above. Suggested text: "requires `forge build` of the whole package including `test/` helpers (`PermitToken`)". Cross-check: CI claim of `REQUIRE_ANVIL=1` still unenforced for relayer (README acknowledges at lines 74 and `apps/relayer/README.md:113`; `ci.yml:127` comment).

### D6 (Low) STATUS.md: forge runtime and e2e status stale
`STATUS.md:28` "~46 s": two runs here took 321 s and 356 s (load from other agents, 1206 s CPU). Report as "~46 s unloaded (unverified)". `STATUS.md:40` "Playwright `test:e2e`: not run locally": it passes locally, 15 tests (above). Update.

### D7 (Low) docs/INDEX.md stale numbers and gaps
`docs/INDEX.md:81` "contracts 368 forge tests pass" (STATUS: 377, verified 377); `:181` contracts README "latest local run 274 tests pass" (377). Not in INDEX (files exist): `remote/privacy-specs/*` (13 files), `remote/qa/integration.md`, `remote/qa/web-e2e.md`, `remote/research/*` (9), `remote/stress/*` (4), `remote/usability/features.md` (likely in-flight work by other agents; recheck at the end).

### D8 (Low) README "being added"/"other contributors" language is stale
`README.md:18` ("fixes are being applied by other contributors while this README is written"), `:39` ("scripts ... being added"), `:74` ("Not verified by me ... every command in this section"). The scripts and workflows exist and run (`scan-secrets`, `check-actions`, `verify-release` verified above; `release:build`/`release:repro` NOT run here, unverified). Replace with dated statements; the `:74` paragraph should say which commands were verified (typecheck, lint, test, web build, e2e, scan-secrets, check-actions, forge fmt/test/snapshot/natspec).

### D9 (Medium, reliability) Timing-sensitive tests flake under load; docs partially acknowledge
Under concurrent load: core-crypto `differential.test.ts` timeout (documented in STATUS), apps/web `keystore.test.ts "uses the production cost by default"`, `SellerKeys.test.tsx` export/import, `Pay.test.tsx` (default findBy timeout) failed in the full run; STATUS.md reports apps/web 320 passing and does not mention these. Repro: run `npm test -w apps/web` while a `forge test` runs; then re-run `npx vitest run src/lib/keystore.test.ts src/views/Pay.test.tsx src/views/SellerKeys.test.tsx`. Suggested: add to "Failures and flakiness" in STATUS.md; the README's "`npm test` succeeds" claim holds only on an unloaded machine.

### D10 (Info) Environment: `foundry.toml` sandbox path not present here
`packages/contracts/foundry.toml:8` `solc = "/home/user/tools/solc"` does not exist in this container (`Error: solc "/home/user/tools/solc" does not exist`), and `/usr/local/bin/solc` is a `solc-select` shim needing network. README/deployment-runbook correctly tell users to replace it, but the README names the path as "sandbox-specific" without saying it may be absent. Worked around with `FOUNDRY_SOLC=/tmp/claude-0/tools/solc/solc` (0.8.28); no file edited.

## Gaps (not run; unverified)

- `npm run release:build`, `release:repro`, `repro-check.sh --worktree`, release-and-verify.md "local dry run" (need network `npm ci`; heavy).
- Deployment-runbook `forge script Deploy.s.sol` / `cast` read-back commands (no announcer on local anvil; not deployed). Only `pre-deploy-check.sh` ran.
- `loadDeployment` one-liner (runbook line ~149): export exists (`typeof function`); no `deployments/84532.json` to feed it.
- Echidna, gambit, Slither runs, `forge coverage` whole-package (only the failing test reproduced).
- relayer-runbook claims on systemd unit/Dockerfile contents, `PRIVACY.md`; docs/user/* prose; per-package DEVIATIONS.md contents beyond file existence (all 12 exist); spec-vs-code in DEVIATIONS not audited line by line.
- README "Firefox/Safari", "real wallet" statements: not testable here.
