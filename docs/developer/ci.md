# CI map

Workflows live in `.github/workflows/`; composite actions in `.github/actions/` (`setup-node-libs`, `setup-forge`,
`release-verify`). Every `uses:` is pinned to a full commit SHA with a `# vX.Y.Z` comment, enforced per push by
`scripts/check-actions-pinned.sh` (job `secrets-and-egress`). Release and publish workflows are documented in
`release-and-repro.md`.

## Per push and pull request (`ci.yml`)

A `changes` job classifies pull requests. If every changed file is under `docs/` or is a `*.md`, the heavy jobs are
skipped. Pushes to `main` and manual runs always run everything. `secrets-and-egress` never depends on `changes`.
A new push to a PR cancels the superseded run; runs on `main` are never cancelled.

| Job | What it does | Reproduce locally |
| --- | --- | --- |
| `ts-check` | `npm ls --all --omit=dev` (dependency-integrity gate), typecheck, lint, build, `npm audit --omit=dev` | `npm ci --ignore-scripts && npm ls --all --omit=dev && npm run typecheck && npm run lint && npm run build` |
| `ts-test` (7 shards) | Unit tests per workspace group, with anvil | `npm test -w <workspace>` (anvil on PATH, `REQUIRE_ANVIL=1`) |
| `ts-test-relayer` | Relayer tests with the anvil e2e required | `cd packages/contracts && forge build`, then `REQUIRE_ANVIL=1 npm test -w apps/relayer` |
| `e2e` | Playwright against the built web app | `npx playwright install chromium && npm run test:e2e -w @ghostpay/web` |
| `contracts-test` | `forge build --sizes`, `forge test` | `cd packages/contracts && forge test` |
| `contracts-coverage` | `forge coverage --ir-minimum` (lcov artifact) | as in the workflow |
| `contracts-static` | `forge fmt --check`, NatSpec check, gas snapshot check | `forge fmt --check; bash scripts/check-natspec.sh; forge snapshot --check --no-match-test "testFuzz\|invariant"` |
| `contracts-slither` | Slither 0.11.6 with solc 0.8.28, Python 3.12 | `pip install slither-analyzer==0.11.6 solc-select==1.2.0; slither . --filter-paths "lib\|test\|script" --fail-medium --exclude-informational --exclude-low` |
| `contracts-extra` | `pool-contracts` and `payer-hiding-contracts` build, test, fmt, NatSpec, static | per project directory |
| `secrets-and-egress` | Secret scan, action pin check | `bash scripts/scan-secrets.sh; bash scripts/check-actions-pinned.sh` |

### Required gates

Use these stable names as the required status checks:

- `typescript` aggregates `ts-check`, `ts-test`, `ts-test-relayer`.
- `contracts` aggregates `contracts-test`, `contracts-coverage`, `contracts-static`, `contracts-slither`, `contracts-extra`.
- `e2e` and `secrets-and-egress` are standalone.

The aggregate gates run with `if: always()` and accept only `success` or `skipped` from every needed job (the `changes`
job included). `failure`, `cancelled`, or any unknown result fails the gate. Skipped passes only for the docs-only case,
because a failed `changes` job is itself a failing result.

## Integration (`integration.yml`)

Docker stack with anvil, bitcoind regtest and solana-test-validator. Runs nightly, on manual dispatch, and on pull
requests that touch the paths listed in the workflow. Runs are queued, not cancelled, on purpose: each run is slow and
every result is useful. Locally: `bash scripts/integration/run-all.sh up && bash scripts/integration/run-all.sh test`.

## Pages mirror (`pages.yml`)

`workflow_dispatch` only, main ref only, behind the `github-pages` environment. Nothing deploys automatically. The build
job rebuilds `apps/web`, runs the bundle scan, and checks the CSP meta and the absence of source maps before upload.

## Nightly only (`nightly.yml`)

| Job | Purpose | Reproduce locally |
| --- | --- | --- |
| `fuzz` | `forge test --fuzz-runs 100000` | `cd packages/contracts && forge test --fuzz-runs 100000` |
| `slither` | Same as the per-push job | see above |
| `dependency-audit` | Prod audit (gating), full audit (non-gating), `npm audit signatures` | `npm ci --ignore-scripts && npm audit signatures` |
| `reproducibility` | Two clean builds must be byte-identical (needs a valid `npm sbom`) | `bash scripts/repro-check.sh --head` |
| `echidna` | Echidna 2.2.7 (checksum-verified) harnesses | `cd packages/contracts && bash scripts/run-echidna.sh` |
| `mythril` | Mythril 0.24.8 symbolic analysis | `cd packages/contracts && bash scripts/run-mythril.sh` |

### Mythril and Python pinning

Nightly run 42806095211 failed `mythril` because `pip install mythril==0.24.8` ran on the runner's system Python 3.14
and failed building `coincurve` ("Expected exactly one LICENSE file in cffi distribution"). Every job that pip-installs a
tool (`slither`, `echidna`, `mythril`, and the per-push `contracts-slither`) now uses `actions/setup-python` (Mythril additionally pins `setuptools<81`, because py-evm imports `pkg_resources`, which a 3.12 interpreter from setup-python does not ship) pinned to
Python 3.12, so a runner image upgrade cannot change the interpreter. Tool versions stay pinned.

### Dependency-integrity gate

The same run also failed `reproducibility` with `npm sbom` ESBOMPROBLEMS (invalid `zod` peer). `ts-check` now runs
`npm ls --all --omit=dev` right after install, so an invalid lockfile or peer tree fails the pull request. Verified
locally: it exits 0 on the fixed tree and exits 1 (ELSPROBLEMS, invalid `zod@4.6.7`) on the tree before the lockfile fix.

## Known gaps

- Mutation testing (gambit) and mainnet-fork tests have no CI configuration.
- The echidna install URL and checksum are unverified until a green nightly run.
- No CodeQL, dependency review on PRs, or CODEOWNERS (see `docs/operators/release-and-verify.md`, open gaps).
- Integration only runs on PRs for the path filter above, so a change outside it relies on the nightly run.
