# Local development setup

Sources: root `README.md` ("Build and test"), `package.json`, `.github/workflows/*.yml`, `packages/contracts/{README.md,foundry.toml}`,
`apps/web/playwright.config.ts`, `.env.example`. The CI workflows are the reference for what a clean machine needs.

## 1. Toolchain

| Tool | Version | Used for | Notes |
|---|---|---|---|
| Node.js | >= 22 (`engines`); CI uses 22; this documentation was checked on 22.22.0 / npm 10.9 | all TypeScript | ESM only |
| npm | workspaces (`packages/*`, `apps/*`) | install, scripts | the lockfile is `package-lock.json`; no pnpm/yarn |
| Foundry (`forge`, `anvil`, `cast`) | **1.8.5** (pinned in CI via `foundry-rs/foundry-toolchain`) | contracts, anvil e2e tests | |
| solc | **0.8.28** | contracts | `forge` downloads it when `solc_version` is used |
| Python 3 | any recent | `scripts/check-natspec.sh`, Slither | |
| Playwright Chromium | `@playwright/test` 1.64.1 | web e2e | see section 6 |
| Slither | 0.11.6 + `solc-select` 1.2.0 | CI static analysis | optional locally |
| Echidna | 2.3.1 + `crytic-compile` 0.4.2 | property fuzzing | optional, not in CI |

`packages/contracts` has **no `package.json`**: it is a Foundry project, not an npm workspace member. OpenZeppelin 5.6.1
and forge-std are vendored in `packages/contracts/lib/` (no git submodules, no `forge install`); remappings live in
`remappings.txt`.

## 2. Install and build (TypeScript)

```bash
git clone <repo> ghostpay && cd ghostpay
npm ci --ignore-scripts      # exactly what package-lock.json says; install scripts are never run
npm run build:libs           # REQUIRED before typecheck / test / app build
npm run typecheck
npm run lint
npm test                     # every workspace: vitest + v8 coverage thresholds
```

Why `build:libs`: workspaces resolve each other through `dist/` (`main`/`types` point there). `build:libs` runs
`npm run build -w @ghostpay/core-crypto -w @ghostpay/invoice-schema && npm run build -w @ghostpay/chain-adapters`.
Without it you get `Cannot find module '@ghostpay/core-crypto'` or missing `.d.ts` errors. The build is `tsc -p
tsconfig.build.json`. It does **not** build `policy-scheme`, `btc-silent-payments`, `relayer` or `web`; build those when
you need their `dist/` (`npm run build -w @ghostpay/policy-scheme`, which also builds core-crypto first;
`npm run build -w @ghostpay/relayer`, which builds chain-adapters first; `npm run build -w @ghostpay/web`).
Tests in `chain-adapters`, `policy-scheme` and `relayer` alias `@ghostpay/*` to `src/` through `vitest.config.ts`, so they
run against sources even when `dist/` is stale; `typecheck` for those packages uses tsconfig `paths` the same way.

Per-workspace commands (run from the repo root with `-w`, or from the package directory):

```bash
npm run build     -w @ghostpay/core-crypto
npm run typecheck -w @ghostpay/chain-adapters
npm test          -w @ghostpay/invoice-schema            # vitest run --coverage
npx vitest run src/router.test.ts                         # single file, from the package directory
npm run lint      -w @ghostpay/web                        # eslint --config ../../eslint.config.js src e2e
npm run gen-abi   -w @ghostpay/chain-adapters             # needs forge (+ SOLC for the Chainlink interface)
npm run gen-abi   -w @ghostpay/policy-scheme              # needs forge
npm run gen-vectors -w @ghostpay/policy-scheme            # node ../../test-vectors/generate-policy-scheme.mjs
node test-vectors/generate.mjs                            # scheme-1 vectors (repo root)
```

Other root scripts: `npm run ci:scan-secrets`, `npm run ci:check-actions`, `npm run release:build`,
`npm run release:repro` (see [release-and-repro.md](release-and-repro.md)).

Coverage thresholds fail `npm test`: statements/lines/functions 95 and branches 90 for every library and the relayer; the
web app uses 90/85/90/90. Baseline test counts and caveats are in the root README ("Build and test"); they are a snapshot.

## 3. Web app (dev, preview)

```bash
npm run build:libs
npm run dev -w @ghostpay/web           # vite dev server; the dev plugin strips the meta CSP (React Refresh uses inline scripts)
npm run build -w @ghostpay/web         # tsc --noEmit && vite build, then postbuild: apps/web/scripts/scan-bundle.mjs
npm run preview -w @ghostpay/web
```

Payment is disabled until a deployment manifest exists for the chain (`apps/web/public/deployments/<chainId>.json`; the
folder holds only a README) **and** it passes the on-chain read-back against an RPC you configured in Settings. To exercise the full flow locally use the unit tests' mocks (`apps/web/src/test/`) or the
Playwright suite; there is no public deployment to point at.

## 4. Contracts (Foundry)

```bash
cd packages/contracts
# foundry.toml pins a sandbox-only compiler path:   solc = "/opt/tools/solc"
# On any other machine replace it LOCALLY (CI does exactly this) and do not commit the change:
sed -i 's|^solc = .*|solc_version = "0.8.28"|' foundry.toml
forge build                              # zero warnings expected
forge fmt --check
forge test                               # default profile: 10 000 fuzz runs, invariants 256 runs x depth 50
FOUNDRY_PROFILE=dev forge test           # quick loop: 256 fuzz runs, invariants 64 x 50
forge test --match-contract Invariant    # all invariant suites
forge test --no-match-path 'test/audit/*'   # skip adversarial PoCs (they assert that known weaknesses are real)
forge snapshot --no-match-test "testFuzz|invariant"   # rewrites .gas-snapshot (CI uses `forge snapshot --check`)
forge coverage --ir-minimum --report summary --no-match-coverage "test|script|lib"
forge build --sizes
bash scripts/check-natspec.sh            # needs python3; FORGE=/path/to/forge if forge is not on PATH
```

Compiler settings (do not drift): `evm_version = "cancun"`, optimizer 200 runs, `bytecode_hash = "none"`,
`cbor_metadata = false`, `ffi = false`, `fs_permissions = []`. `solc` and `solc_version` are mutually exclusive in
`foundry.toml` (if you prefer an environment override, remove the `solc` key first and set `FOUNDRY_SOLC_VERSION=0.8.28`).
Because the file is tracked, an uncommitted local edit shows up in `git status`; take care not to stage it when committing
other changes (`git add -p`, or `git update-index --skip-worktree packages/contracts/foundry.toml` while you work, and
undo with `--no-skip-worktree`).

`forge build` also compiles `test/` (mocks such as `PermitToken`, `MockERC20`, the CC0 reference `ERC5564Announcer` under
`test/utils/`) into `packages/contracts/out/`; the TypeScript anvil tests read those artifacts. `out/`, `cache/` and
`broadcast/` are git-ignored.

## 5. anvil, `ANVIL_BIN`, `REQUIRE_ANVIL`

Two TypeScript test files deploy the compiled contracts to a local `anvil` (started on an ephemeral port by the test):

| Test | Reads | Artifacts needed under `packages/contracts/out/` |
|---|---|---|
| `apps/relayer/src/e2e.anvil.test.ts` | `ANVIL_BIN` (default `/home/user/tools/foundry/anvil`) | `GhostPaySweepRelayer.sol/GhostPaySweepRelayer.json`, `PermitToken.sol/PermitToken.json` |
| `packages/policy-scheme/src/anvil.test.ts` | `ANVIL_BIN` (default `anvil` from `PATH`), `REQUIRE_ANVIL`, `POLICY_SCHEME_ARTIFACTS` (path relative to `src/`) | `PolicyAccount`, `PolicyAccountFactory`, `GhostPayPolicyRouter`, `ERC5564Announcer`, `MockERC20` |

Behaviour (read from the tests):

- If `anvil` or an artifact is missing, the test **skips silently** (a green run does not prove it ran).
- **`REQUIRE_ANVIL=1` turns "missing" into a failure, but only in `packages/policy-scheme/src/anvil.test.ts`.** The relayer
  e2e does not read it yet (CI comments and `docs/operators/release-and-verify.md` section 6 say so), although CI and the
  release workflow set it for the whole `npm test`.
- The relayer test checks `existsSync(ANVIL)`, so `ANVIL_BIN` must be an **absolute path** (`ANVIL_BIN=$(command -v anvil)`,
  which is what CI does); a bare `anvil` only works for the policy-scheme test.

```bash
(cd packages/contracts && sed -i 's|^solc = .*|solc_version = "0.8.28"|' foundry.toml && forge build)
export ANVIL_BIN="$(command -v anvil)"
REQUIRE_ANVIL=1 npm test -w @ghostpay/policy-scheme
npm test -w @ghostpay/relayer                  # runs e2e.anvil.test.ts when the artifacts exist
```

No test forks a live chain or needs a live RPC.

## 6. Playwright (web e2e)

```bash
npm run build:libs
npx playwright install --with-deps chromium        # CI does this; skip if a Chromium build is already present
npm run test:e2e -w @ghostpay/web                   # NOT part of `npm test`
```

`apps/web/playwright.config.ts`: tests in `apps/web/e2e/` (`app.spec.ts`, `flows.spec.ts`, helper `helpers.ts`), one worker,
`baseURL http://localhost:4173`, `serviceWorkers: 'block'`, and a `webServer` that runs `npm run build && npx vite preview
--port 4173 --strictPort --host localhost` (so the bundle scan runs first and an occupied port 4173 fails the run). Browser
selection: `GHOSTPAY_CHROMIUM` if set and the file exists, else `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` if it
exists (sandbox layout; launched with `--no-sandbox`), else Playwright's managed Chromium. The e2e exercises the **meta**
CSP, not `_headers`, which neither `vite preview` nor the unit tests apply. Only Chromium is covered (no Firefox/Safari).

## 7. Environment variables

`.env.example` lists names only; copy to a git-ignored `.env`. The web app reads no environment at runtime.

| Variable | Used by | Meaning |
|---|---|---|
| `RELAYER_KEY_FILE` / `RELAYER_KEY` | relayer | 32-byte hot key (hex); the file must be a regular file with no group/world bits |
| `QUOTE_SECRET_FILE` / `QUOTE_SECRET` | relayer | 32-128 byte HMAC secret (hex) |
| `RELAYER_CONFIG`, `DEPLOYMENTS_DIR` | relayer | JSON config path (default `./relayer.config.json`); manifest directory (default `../../deployments`) |
| `ALLOW_MAINNET=1` | relayer | required, with a valid manifest, for any non-testnet chain |
| `RPC_URL_<chainId>` (name chosen by `rpcUrlEnv`) | relayer | RPC URL kept out of the file |
| `METRICS_BEARER_TOKEN`, `ALERT_WEBHOOK_URL` | relayer | example names for in-progress metrics/alerts (names are chosen in the config) |
| `FEE_RECIPIENT`, `ALLOWED_CHAIN_IDS`, `ALLOW_LOCAL` | deploy scripts | see [contracts-reference.md](contracts-reference.md#7-deployment-scripts-packagescontractsscript) |
| `ANNOUNCER`, `ALLOW_CUSTOM_ANNOUNCER`, `EXPECTED_ANNOUNCER_CODEHASH` | `Deploy`, `DeployPolicyRouter` | announcer pinning |
| `FEE_TOKEN`, `FLAT_FEE`, `MAX_FLAT_FEE` | `DeployPolicy` | policy factory fee configuration |
| `POLICY_FACTORY`, `EXPECTED_POLICY_FACTORY_CODEHASH` | `DeployPolicyRouter` | **not in `.env.example`** |
| `RPC` | runbooks | shell convenience for `--rpc-url "$RPC"` (not read by scripts) |
| `ANVIL_BIN`, `REQUIRE_ANVIL` | tests | section 5 |
| `POLICY_SCHEME_ARTIFACTS` | policy-scheme anvil test | alternative `out/` directory, relative to `src/` |
| `GHOSTPAY_CHROMIUM` | Playwright | path to a Chromium binary |
| `SOURCE_DATE_EPOCH`, `OUT_DIR`, `VERSION`, `GP_COMMIT`, `GP_SKIP_INSTALL` | release scripts | [release-and-repro.md](release-and-repro.md) |

Never put keys, RPC URLs with provider keys or passphrases into committed files; `scripts/scan-secrets.sh` rejects
committed env files and key material.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Cannot find module '@ghostpay/...'` or missing types | libraries not built: `npm run build:libs` (or the specific `npm run build -w ...`) |
| `forge build` fails with a missing compiler path | `foundry.toml` still points at the sandbox `solc`; section 4 |
| anvil tests "pass" instantly | they skipped; set `ANVIL_BIN` (absolute), run `forge build`, and use `REQUIRE_ANVIL=1` for the policy-scheme test |
| relayer e2e skipped although `anvil` is installed | `ANVIL_BIN` is not an existing absolute path, or `packages/contracts/out` lacks `PermitToken` / `GhostPaySweepRelayer` artifacts |
| `playwright` cannot launch a browser | set `GHOSTPAY_CHROMIUM` or run `npx playwright install chromium`; port 4173 must be free |
| `npm ci` runs lifecycle scripts | you omitted `--ignore-scripts`; repeat with it (the only lockfile install script is optional `fsevents`) |
| `npm run build:libs` slow or stale after edits to `core-crypto` | `chain-adapters`' build rebuilds core-crypto and invoice-schema first; `dist/` is git-ignored |
| coverage threshold failure after adding code | add tests; thresholds are enforced per workspace (section 2) |
