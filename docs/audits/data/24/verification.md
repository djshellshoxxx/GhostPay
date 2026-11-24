**Where the checks ran:** in the agent container, with `scripts/dev/local-ci.sh` (all steps), on `af85693`. That commit integrates every fix cluster (A, B, B2, C, D, E, G and H, each with its review rounds) plus `9a00a7a` and `2fcab7f`. The machine has 4 vCPUs and Node 22.22.0. Every step passed:

- **Build and static checks:** `build:libs`, then typecheck and lint across all workspaces.
- **Package tests:** all 14 package suites: core-crypto, invoice-schema, payment-uri, chain-adapters, sdk, cli, merchant-hooks, merchant-ledger, relayer-guard, relayer, pool-relayer, solana-stealth, tron-adapter and btc-silent-payments.
- **Script and recipe checks:** the secret scan, `infra/proxy/check-headers.sh`, `deploy/selftest.sh`, and the `scripts/regtest` and `scripts/tests` suites. `scripts/testnet` was skipped because it needs Foundry's `cast`, and CI runs it. The WooCommerce and PrestaShop PHP suites also pass, as does the hosting kit.
- **Web app:** the production build and its bundle scan pass. The suite with coverage passes 1586 tests and skips 4, in 111 files, with 1 file skipped. Coverage is 92.19% statements, 87.89% branches, 93.95% functions and 95.98% lines, against thresholds of 90/85/90/90. The no-coverage config also passes.
- **Later commits:** `9f914f7` changes only three test files (CodeQL hygiene), and those files pass on their own (75 tests). `bd45a32` and `2117203` change only docs.
- **Each fix cluster:** its AI reviewer also ran the area's checks and re-ran the new tests against the base, where they fail.
- **Failing before the fix:** every fixed finding has a test that fails on the code before the change. The fix commit messages name those tests.
- **CI:** GitHub CI on the PR head remains the authority for the combined suites on CI hardware. It also runs the contract, e2e, integration and CodeQL jobs, which this container does not run.
