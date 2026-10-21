# QA: build and release

Date 2026-10-21, HEAD dea46beac2d3cc3d620cce042dcf8a6cc6d2cabe, branch claude/remote-extensions-1, Node v22.22.0, npm 10.9.4, 4 CPUs. Only commands I ran are reported. Findings only; nothing fixed.

## What ran and results

| Step | Command | Result |
|---|---|---|
| Build libs | `npm run build:libs` | pass (32 s) |
| Typecheck | `npm run typecheck` | pass, exit 0, all workspaces |
| Lint | `npm run lint` | pass, exit 0, all workspaces |
| Tests | `npm test` (vitest run --coverage in 12 workspaces) | exit 1: 4 failures, all timeouts under load; see D1 |
| Re-run of failures, isolated | `vitest run` Pay.test.tsx + SellerKeys.test.tsx in apps/web | 30/30 pass (28 s) |
| Re-run differential, 60 s default | `vitest run src/differential.test.ts` in packages/core-crypto | FAIL again (timeout, 103 s) |
| Re-run differential, `--testTimeout=300000` | same | pass (100 s wall, 53 s CPU) |
| Secrets scan | `bash scripts/scan-secrets.sh` | pass, exit 0 |
| Actions pinning | `bash scripts/check-actions-pinned.sh` | pass: 44 `uses:` all SHA-pinned with version comment |
| npm audit | `npm audit`, `npm audit --omit=dev` | 0 vulnerabilities both (registry reachable via proxy) |
| Reproducibility, committed tree | `TMPDIR=<scratch> bash scripts/repro-check.sh --head` | REPRODUCIBLE: tarball 84c8ba73...a33f, sbom 8182e9c6...8425 identical across two clones at different paths (b nested) |
| Reproducibility, working tree | `repro-check.sh --worktree` (KEEP=1) | REPRODUCIBLE, same hashes as --head (no non-docs working-tree changes at the time) |
| verify-release.sh, good input | artifacts from the worktree run, real HEAD sha | PASS x9, exit 0 |
| verify-release.sh, negatives | wrong commit; 3-char commit; no args; appended byte to tarball; manifest commit edited | exit 1 / 2 / 2 / 1 / 1 with expected FAIL lines (tarball hash, manifest tarball hash, unreadable tar, manifest hash, manifest commit) |
| `forge test` in packages/contracts | | NOT RUN: see G1 |

Test counts from the full run (passed): 71, 299, 216, 174, 52, 53 (+7 skipped), 137, 31, 145, 192 (+1 skipped), plus the two failing workspaces: core-crypto 53/54, web 317/320 (the 3 web failures pass in isolation).

`release-build.sh` was not run directly in the shared checkout: it executes `rm -rf packages/*/dist apps/web/dist` (scripts/release-build.sh:42), which would break parallel agents. It ran only inside `repro-check.sh` temp copies (`npm ci` succeeded there; elapsed 5m53s and 4m01s).

## Defects

### D1 (medium, QA/CI robustness): timing-sensitive tests fail under CPU contention; differential test is near its timeout even unloaded
- Evidence: `packages/core-crypto/src/differential.test.ts:37` ("matches on 500 random key sets x 2 payments") needs ~53 s CPU (user time) against `testTimeout: 60_000` in `packages/core-crypto/vitest.config.ts:7`. It failed at the 60 s limit in the full run (load average ~19 on 4 CPUs, other agents running) and in an isolated rerun (load still ~21); passed with the timeout raised to 300 s. It has no headroom on a slower or shared CI runner. Unloaded behavior was not measurable here.
- Web: `src/views/Pay.test.tsx` ("opens a link, shows the review ...": Unable to find heading "Review payment"), `src/views/SellerKeys.test.tsx` (export keystore: `vi.fn()` never called; import keystore: no `role="alert"`) failed in the full run (86 s and 36 s file durations) and pass in isolation. Likely async waits hitting testing-library's default 1 s `waitFor` under load (cause not proven).
- Repro: `npm test` while the machine is loaded (or `nice` plus parallel CPU burners); or `cd packages/core-crypto && npx vitest run src/differential.test.ts`.
- Suggested fix: raise the differential test's per-test timeout or reduce iterations in the default run (full 500 in nightly); set `asyncUtilTimeout` or `waitFor` timeouts higher for the web view tests; cap vitest worker concurrency.

### D2 (low, hygiene): checked-in `packages/contracts/foundry.toml` has `solc = "/home/user/tools/solc"`
- Evidence: line 8, tracked in HEAD (git ls-files; `git show HEAD:...` shows it). `forge test` locally fails: `Error: solc "/home/user/tools/solc" does not exist`. CI works around it with `sed -i 's|^solc = .*|solc_version = "0.8.28"|'` in `.github/actions/setup-forge/action.yml:14`, `nightly.yml:38,57`, `release.yml:59`.
- Impact: any contributor or any new workflow that omits the sed fails; the release workflow's compiler is determined by a regex rewrite, and the manifest records `solc: "not-recorded"`.
- Repro: `cd packages/contracts && forge build` on a machine without that path.
- Suggested fix: commit `solc_version = "0.8.28"` and keep the sandbox override out of the tracked file (profile or env `FOUNDRY_SOLC`); record the real solc version in release-manifest.json.

### D3 (info, release manifest completeness)
- `release-manifest.json` has `"solc": "not-recorded (CI pins 0.8.28 ...)"` and `"tag": null` for non-tag builds (expected). The manifest/SHA256SUMS carry no signature; scripts print a manual checklist (signed tag, attestation), so `verify-release.sh` "RESULT: hash checks passed" proves consistency only (script says so itself).

## Observations (no defect)
- `package.json` `build:libs` builds only core-crypto, invoice-schema, chain-adapters; the web build succeeded in the repro copies, so the remaining libs are consumed from source or are built by `npm run build -w @ghostpay/web`. Not further investigated.
- Repro hashes were equal between `--head` and `--worktree`, consistent with no non-docs working-tree changes; this does not demonstrate that `--worktree` captures uncommitted source edits.
- `verify-release.sh` with no args prints usage to stdout and exits 2 (sed of header).

## Gaps (not run or unverified)
- G1: Solidity/Foundry tests, build, fmt, snapshot, coverage: no solc available offline (`/usr/local/bin/solc` is a solc-select shim needing binaries.soliditylang.org, proxy returns 403; `/home/user/tools/solc` missing). Contracts and Slither jobs untested by me.
- Playwright e2e (apps/web/e2e) not run by this task (see docs/remote/qa/web-e2e.md).
- GitHub Actions workflows (ci.yml, release.yml, nightly.yml) not executed; only the pin checker ran. Attestation, signed tag and `gh attestation verify` untested.
- No tag-build path tested (`VERSION` from `git describe`, `tag` field non-null).
- Reproducibility checked on one machine/toolchain only (same node, tar, gzip); cross-OS/tool-version reproducibility unverified. `npm ci` ran with network.
- Coverage thresholds: no threshold failures appeared in the log output grep; per-package coverage numbers not reviewed.
- Earlier haiku audit reports in docs/remote/audits/ were not consulted.
