# README verification, 2026-11-25

Branch: `docs/maintenance-haiku-20261125`, based on `origin/main` c8e131c1.
Scope: root `README.md` and `packages/*/README.md`, `apps/*/README.md` (67 files).
Other tracked READMEs (about 58 more, under `docs/`, `examples/`, `deploy/`, `scripts/`, `integrations/`, `infra/` and similar) are outside the stated scope and were not edited. Their links were checked as well: across all 125 tracked README files (466 links) the only flagged items are the two `chain-solana` false positives described below.

## Method

- Relative Markdown links and `<a href>` / `<img src>` targets: resolved against each file's directory and checked with `fs.existsSync`.
- Heading names compared with each package's `package.json` `name`. Package `description` fields compared with the README opening lines.
- `npm run <script>` invocations extracted from all in-scope READMEs and checked against the root `package.json` scripts, the README's own package `scripts`, or the `-w` target's `scripts`.
- Backticked repository paths (`packages/...`, `scripts/...`, `docs/...`, etc.) checked for existence, relative to the repo root and to the README's directory.
- Cross-package claims ("used by", "not wired in", "imports only") checked against `package.json` dependencies and source imports.
- Overclaim terms (anonymous, audited, production, secure, guarantee, unlinkable) grepped across in-scope READMEs and reviewed in context.

## Links

Relative links in scope: 154. Broken: 0 real links.

The checker reported 2 apparent breaks in `packages/chain-solana/README.md` (`r·V`, `v·R`). These are math expressions such as `[8](r·V)` in a table, not links. No change.

Path mentions (not Markdown links) that do not exist in this tree and were annotated, not removed:

| File | Reference | Note |
|---|---|---|
| `packages/i18n/README.md` | `docs/remote/usability/audit-i18n.md` | annotated "(file not present in this tree)" |
| `packages/ux-connect/README.md` | `docs/remote/usability/audit-ux-connect.md` | annotated |
| `packages/ux-core/README.md` | `docs/remote/usability/audit-ux-core.md` | annotated |
| `packages/ux-fees/README.md` | `docs/remote/usability/audit-ux-fees.md` | annotated |
| `packages/ux-intake/README.md` | `docs/remote/usability/audit-ux-intake.md` | annotated |
| `packages/ux-vault/README.md` | `docs/remote/usability/audit-ux-vault.md` | annotated |

No `audit-*.md` file exists under `docs/remote/usability/`. The `wiring/` and `specs/` files these READMEs also cite do exist.

Paths that were not flagged as errors:

- `packages/contracts/out`, `packages/pool-contracts/out` (Foundry build output, created by `forge build`, not committed).
- `apps/web/src/views/Settings.test.tsx:39` (a line reference, the file exists).
- `packages/chain-tron/README.md` mention of `src/meta.ts` is explicitly `packages/tron-adapter` (`src/meta.ts`), which exists.

## Names fixed

| File | Old | New | Reason |
|---|---|---|---|
| `packages/contracts/README.md` | heading `# @ghostpay/contracts` | `# packages/contracts (Foundry project)` plus a note that it is not an npm workspace | `packages/contracts` has no `package.json`, and no package or import named `@ghostpay/contracts` exists. Other Foundry READMEs already use path headings. |

Checked and correct: every other in-scope README heading matches its `package.json` `name` (for example `@ghostpay/address-safety`, `@ghostpay/relayer`, `@ghostpay/web`). `packages/payer-hiding-contracts` and `packages/pool-contracts` have no `package.json`, as expected for Foundry projects.

Root README package names checked: `merchant-billing`, `merchant-hooks`, `merchant-ledger`, `sdk`, `tron-adapter` exist as workspace directories and `package.json` names (`@ghostpay/...`). Only the root `README.md` line lists them without `@`, which is consistent with the rest of that list.

## Commands verified or removed

Verified against `package.json` scripts (root and workspace):

- Root: `typecheck`, `lint`, `test`, `build`, `build:libs`, `ci:scan-secrets`, `ci:check-actions`, `release:build`, `release:repro`.
- `npm run build --workspace @ghostpay/web` (`postbuild` runs `scripts/scan-bundle.mjs`), `npm run test:e2e --workspace @ghostpay/web`, `npm run dev`, `npm run preview`.
- `packages/confidential-contracts`: `compile`, `test:quick`, `lint:sol`, `abi`.
- `packages/solana-stealth`: `vectors` (runs `gen-vectors.mjs` and `scripts/crosscheck_vectors.py`; needs `python3`).
- `packages/policy-scheme`: `gen-abi`, `gen-vectors`.
- `packages/chain-adapters`: `gen-abi` (script `scripts/gen-abi.sh`).
- `packages/pool-circuits`: `build:circuits`, `check:verifiers`, `gen:vectors` (README uses `scripts/gen-vectors.mjs` path, which exists).
- `packages/cli`: `test:compiled`, `test:cli-build` (root), `typecheck`, `lint`, `test`.
- `packages/btc-payjoin`: `test:e2e`.
- `apps/relayer` via `npm test -w apps/relayer` (path form, valid for npm `-w`).

Fixed:

| File | Before | After | Reason |
|---|---|---|---|
| `packages/pool-contracts/README.md` (fixture note) | `npm run build:circuits` | `npm run build:circuits -w @ghostpay/pool-circuits` | Script lives in the `pool-circuits` workspace, not the root. Bare form from the root does not exist. |
| `README.md` (build section) | `npm run build --workspace @ghostpay/web # also runs the bundle scan (scripts/scan-bundle.mjs)` | `(apps/web/scripts/scan-bundle.mjs, postbuild)` | The script is at `apps/web/scripts/`, not the root `scripts/`. |

Not verified, left in place (script or file names I did not confirm exist):

- `packages/confidential-contracts` `npm run abi` writes `abi/*.json`; the script exists but I did not confirm the output directory.
- `forge` commands in `packages/contracts/README.md` and `packages/pool-circuits` (`forge test`, `forge coverage --ir-minimum`, `forge snapshot --check`). Forge is not installed in this session, so these were not executed. Config checks only: `packages/contracts/foundry.toml` has `[fuzz] runs = 10000` and `[invariant] runs = 256`.
- `slither ... --fail-medium` in `packages/pool-contracts/README.md` (external tool).
- `echidna` / `echidna.yaml` (external tool; `echidna.yaml` and `test/echidna/EchidnaFixture.s.sol` exist).

## Statements I could not verify

| File | Claim | Why |
|---|---|---|
| `README.md` (Contracts section) | `forge test` default "10 000 fuzz runs, invariants 256 x 50" | Fuzz runs (10000) and invariant runs (256) match `foundry.toml`. The invariant depth `50` is not in the config I read; not checked further. |
| `README.md` (Build and test) | Test counts (btc-silent-payments 286 and others, `forge` 377 in 23 suites) | Historical snapshots from 2026-10-21 cited from `docs/remote/STATUS.md`. Not re-run. The README already labels them as snapshots. |
| `README.md` (Status) | PR numbers, CI run IDs, SHAs | Status section left unchanged per instructions. Not checked against GitHub. |
| `README.md` (Package map) | "`deployments/` ... No real manifests yet" | Not checked beyond the directory's existence. |
| `packages/*/README.md` (Status and "not audited" wording) | Experimental and testnet labels | Sampled. Labels found were consistent with "testnet proof of concept / not audited". Not every README was read line by line. |
| `packages/cli/README.md` | Many command and flag descriptions | Not checked; the file is about 1400 lines and each flag would need a source trace. |
| `apps/web/README.md`, `apps/relayer/README.md` | Environment variables, deployment steps | Not checked beyond the script names above. |
| `packages/ops-monitor/README.md` | "Not wired in anywhere; never run against a live network" | Grep found no imports of `@ghostpay/ops-monitor` outside its own package and generated docs. Consistent. |
| `packages/chain-adapters/README.md` | `scripts/gen-abi.sh` | Script exists; the forge/solc steps were not run. |
| `packages/external-pools-privacypools/README.md` | "Privacy Pools SDK 1.5.0, Apache-2.0" | Version matches `package.json`. License not checked. |

## Other fixes made (not names, not commands)

- `README.md` (package map, "Workspace wiring" paragraph): previously said the web app "uses" 7 packages and that `apps/web` "imports only the packages named below". `apps/web/package.json` depends on 15 `@ghostpay/*` packages and its source imports 15 (including `ux-vault`, `policy-scheme`, `tron-adapter`, `solana-stealth`, `payment-uri`, `qr-exchange`, `scan-source`, `net-transport`). The sentence now lists the `package.json` dependencies. The relayer list (`chain-adapters`, `relayer-guard`) was already correct.
- `README.md` ("Build and test", Note about `REQUIRE_ANVIL`): previously said `apps/relayer/src/e2e.anvil.test.ts` does not read `REQUIRE_ANVIL`. It does (line 22: `mustRun = CI === 'true' || REQUIRE_ANVIL === '1'`). Corrected.
- `packages/contracts/README.md` (Layout): "production contracts + interfaces" changed to "contracts + interfaces (not deployed; not audited)". The contracts are not deployed and have no audit.

## Links fixed

None. No broken Markdown link had an unambiguous correct target.

## Engineering defects noticed (not fixed)

1. Workspaces with a `package.json` but no README: `packages/merchant-billing`, `packages/merchant-hooks`, `packages/merchant-ledger`, `packages/sdk`, `packages/tron-adapter`. The root README names several of them and `packages/chain-tron/README.md` points readers to `tron-adapter`. I did not create READMEs because that would mean inventing package descriptions beyond the `package.json` descriptions, which is outside this task.
2. Missing audit documents: `docs/remote/usability/audit-*.md` (six packages cite them). Either the files were not committed or the references are stale.
3. `packages/contracts` has no `package.json`, yet the workspace-style heading caused confusion (fixed above in the README only).
4. `packages/ux-*` READMEs cite specs under `docs/remote/usability/specs/`, which exist, but several audit citations point to documents that do not.
5. `packages/chain-tron/README.md` says `packages/tron-adapter` encodes meta-addresses with `st:trx:0x`. That is a cross-package interoperability note; I did not verify the tag strings in source.
6. Nested READMEs outside scope (for example `docs/consolidation/*/README.md`, `docs/handoffs/*/README.md`) were not reviewed for content.
7. The worktree HEAD `d4288414` carries an extra commit that adds to `docs/ai/ACTIVE_WORK.md`. Not reverted; not part of this README task.

## Files changed

- `README.md`
- `packages/contracts/README.md`
- `packages/pool-contracts/README.md`
- `packages/i18n/README.md`
- `packages/ux-connect/README.md`
- `packages/ux-core/README.md`
- `packages/ux-fees/README.md`
- `packages/ux-intake/README.md`
- `packages/ux-vault/README.md`
- `docs/maintenance/README_VERIFICATION_20261125.md` (this file)

Not touched: `docs/ai/ACTIVE_WORK.md`, `docs/handoffs/`, `docs/consolidation/`, `docs/evidence/`, any `src/`, any `DEVIATIONS.md`, `package.json`, lockfiles, CI, or executable source.
