# GhostPay consolidation handoff — 2026-10-28

This is the integration owner's note for branch `claude/ghostpay-autonomous-completion-y4sk2h`, which is draft PR #37 into `main`.
It does not grant merge, release, deployment or real-funds authority. Read [RESTART](RESTART.md) and the
[lean scope](LEAN_RELEASE_SCOPE.md) first.

## Source map (verified by ancestry in this session)

| Ref | SHA | Disposition |
|---|---|---|
| `main` | `edb0051eb89bd135c73733d9db14569aa000662d` | Public base. |
| PR #30 `claude/cool-albattani-xopr89` | `7373172db4cf40ce5622e5a92a55b2b086e5e7cb` | 89 commits ahead of main and 0 behind. It is the newest application available on GitHub and contains PR #31. **Fast-forwarded** here. |
| PR #31 `claude/adoring-wozniak-850ue6` | `a2217ea1ccdd29f4e67ebdde9e6606eaa0fde523` | Already in PR #30. |
| PR #36 `claude/portable-hosting-kit` | `cb917c67bf8a621c48ef02e7d70caf5eadb7b4e2` | 41 commits ahead of main and 0 behind. It has no file overlap with PR #30 (only `tools/portable-hosting-kit/**` and `.github/workflows/hosting-kit.yml`). **Merged** as `f44adbb`. |
| Dependabot PRs #32/#33/#34 | — | Not integrated; left for owner review. |
| Older `claude/*`, `work/*`, `backup/*`, `integration/*` branches | — | Ancestors of main or of PR #30, or superseded snapshots. Not touched. |

**Missing source (not recovered, not reconstructed):**
- `fac0fbd54f089f9e7ac074cd46f8c2324f3fef8b`, `405c1680fcd058cd8141e2fbd4c8d28313693d75` and the recovered tree
  `a1478b2cfd2321996b8a436aec6b0b04ffb1845d` are not in this repository.
- No recovery patch or handoff file was supplied to this session.
- The PR #36 handoff records that a private recovered tree (`edb0051 -> 3c0aee8d -> a1478b2c`, 172 files) exists under another integrator, outside GitHub.
- Its overlap with PR #30 is unknown, so any of its changes not in PR #30 remain missing here.
- Supply the patch through a supported channel. It will be classified file by file (present / superseded / missing / conflicting) in a staging directory before any port.

## Changes made in this session

| Commit | Change | Evidence |
|---|---|---|
| `f44adbb` | Merge PR #36 into the PR #30 head. | Typecheck, lint, build, secret scan and action pins all exit 0 on this head. |
| `4309eb8` | Sweep "unknown outcome" lock persisted to a tab-scoped sessionStorage journal (`lib/sweepAttemptJournal.ts`), fail closed. `deploy/nginx` Permissions-Policy `camera=(self)` to match `_headers` (QR camera importer). Kit header test expects the embed-v2 route. | 2 Sweep view tests failed on the old `state.tsx`/`Sweep.tsx` and pass now. The nginx parity test failed on the old confs. Kit `headers.test.mjs` 18/18. |
| `7345904` | Review fixes: lock persisted **before** handoff via `directSweep({ onBeforeHandoff })`, which aborts and sends nothing if the write fails. Tombstone on a failed post-handoff write. Journal keeps only `chainId/owner/nonce/expectedHash/status`. | 2 new view tests failed on `4309eb8` and pass now. Journal tests: 26 cases. `sweep`, `Sweep`, journal and `embedHeaders` suites: 76/76. |

The independent read-only review of `4309eb8` reported H1, H2, M1, M2 and L1–L3:
- H1, H2, M2 and L1 are fixed in `7345904`.
- **Open:**
  - M1: a relayed-sweep submit that errors after the relayer accepted the order records no lock. This gap predates this work.
  - L2: the new safety strings are English only. This matches the open "localize safety strings" item from PR #30.
  - L3 and the recorded limit: the lock is per tab. A new tab starts armed, so the user must check an explorer first.

## Tests actually run (this container, Node 22.22.0, npm 10.9.4)

- `npm ci` → exit 0.
- `npm run typecheck`, `npm run lint`, `npm run build`, `scripts/scan-secrets.sh`, `scripts/check-actions-pinned.sh` → all exit 0 on `f44adbb`.
- `npm test` (all workspaces), started at `f44adbb`:
  - Every non-web workspace passed (counts are in the session log, for example relayer 256 pass / 2 skip and privacy-pipeline 747).
  - **`@ghostpay/confidential-contracts` failed in this environment.** Hardhat cannot download solc (`getaddrinfo ENOTFOUND binaries.soliditylang.org`); this is a network policy limit, not a code result. It is a later-preserved feature, and CI runs it.
  - The web portion of this run is **invalid as evidence**: it overlapped in-progress edits and was stopped.
- Web suite rerun on frozen head `7345904`:
  - `cd apps/web && npx vitest run --coverage --maxWorkers=2` → exit 0: 101 files passed / 1 skipped, 1283 tests passed / 4 skipped.
  - Coverage 91.16 statements / 86.48 branches / 92.78 functions / 95.13 lines (thresholds 90/85/90/90, unchanged).
  - `npx vitest run --config vitest.nocov.config.ts` (archive fuzz) → 1/1.
- CI lint on `2f1c79b` failed on two test-file lint errors I introduced: `no-unsafe-member-access` and `unbound-method`.
  - Fixed in the next commit.
  - `eslint src e2e` (web) and `tsc` are clean locally, and the affected suites pass 38/38.
- Hosting kit at `f44adbb` + headers fix: `npm test` 277 tests, 265 pass, 0 fail, 12 skip (opt-in Docker/Chromium/nginx/tor/i2pd).
- Not run locally: forge/anvil/bitcoind/solana integration (binaries absent; the GitHub Integration workflow runs them) and Playwright e2e.

## Hosting qualification of the consolidated application (`f44adbb`)

A separate worker built `apps/web/dist` in an isolated worktree, using the same commands as CI (`npm ci --ignore-scripts`, `build:libs`, web build).

**Build output**
- 13 files; the bundle scan passed.
- Content digest `sha256:32c25f782c6eb85b07a7697e7c497ab1f1c692b937b42c27f304350e3db38b7a`.
- Kit archive sha256 `74696db7a841976e5918873e47f1238a45a18e15048b88667c838645e07ae237`.

**Kit commands:** `validate`, `package`, `verify --expect-digest`, `wizard --non-interactive`, `profile --with static,nginx,container` and `preview` all exit 0.

**Headers served by the preview server**
- CSP, nosniff, `Referrer-Policy: no-referrer`, X-Frame-Options DENY, COOP and Permissions-Policy are on every path.
- CORP is `same-origin` on assets and `cross-origin` on embed v1/v2.
- Caching: `index` is `no-cache`, `assets` are immutable, and embed scripts are `max-age=3600`.
- `dist/_headers` is byte-identical to `apps/web/public/_headers`, and every dist route is covered.

**Docker (opt-in):** the container test passed, including the preview-vs-container request matrix.

**Chromium**
- The browser test passed only with a workaround: the kit's Playwright 1.64.1 expects `chromium_headless_shell-1248`, while this image ships `-1243`.
- The worker pointed `PLAYWRIGHT_BROWSERS_PATH` at symlinks to the shipped binary. That run of real GhostPay at root and subpath showed no CSP violations or console errors.
- The out-of-the-box run fails on that version mismatch. It is an environment issue, not an app result.

**Skipped, not passed:** real-nginx `nginx -t` and the differential tests (nginx absent), tor/i2pd config checks (absent) and Java I2P.

**Findings**
- The nginx camera policy drift is fixed in `4309eb8`.
- `index.html` `<noscript>` links to `help.html`/`privacy.html`, which are not in dist. This was already known.
- The iframe-embed `frame-ancestors` allowlist is an **owner decision** carried over from PR #36.

The authoritative exact-head evidence is the GitHub `hosting-kit` workflow (`kit`, `qualify-ghostpay-web`) on PR #37.

## Still open / gates

1. Owner review and merge of PR #37. PR #37 supersedes #30 and #36 if accepted; close those only on the owner's decision. No merge authority is assumed.
2. Nightly `reproducibility`: `npm sbom` ESBOMPROBLEMS (`abitype@1.0.8` from `@0xbow/privacy-pools-core-sdk` → `viem@2.22.14` wants `zod ^3`).
   - Re-checked here: `npm sbom -w @ghostpay/web` runs, but it omits the web app's direct deps (viem, react). It is **not** a valid artifact SBOM, so it was not adopted.
   - Still open; the gate is not weakened.
3. Relayed-sweep uncertain-submit lock (M1). It needs a relayer-side idempotency/status contract and is not invented here.
4. Cross-tab sweep lock. It would need localStorage or IndexedDB, which persists the stealth-owner/tx-hash link to disk; that is a privacy decision for the owner.
5. Policy-account send guard: an experimental feature, off by default and outside lean scope.
6. Lean acceptance items that remain owner/external gates (from LEAN_RELEASE_SCOPE):
   - The private review packet.
   - Verified network/registry/contract/trust configuration.
   - An independent review of the exact supported build.
   - Mandatory deeper audits.
   - No production funds, deployment or release without explicit owner, legal, security and network approval.

## Next bounded task

Read the PR #37 CI results on the head commit and fix anything red. Then decide M1 together with the relayer owner (`apps/relayer` status endpoint keyed by order digest).
