# Reproducing the external pool integration fixtures

These fixtures are for disposable local tests. They do not authenticate public deployments, change a
manifest, install a relayer, or enable a product feature. The complete generated directory is ignored by
Git. Privacy Pools verifier sources and proving artifacts remain there; no ceremony is run and no key
or verifier is regenerated.

## Prepare and run

Use the repository's Node toolchain and Foundry with Solc **0.8.28** available. `FORGE_BIN` and `SOLC_BIN`
can select already installed binaries; otherwise the script uses `forge` and Foundry's `0.8.28` compiler.

```bash
npm ci --ignore-scripts
npm run build:libs
node --test scripts/integration/prepare-external-fixtures.test.mjs
node scripts/integration/prepare-external-fixtures.mjs

export PP_CONTRACTS_OUT="$PWD/.integration-fixtures/privacy-pools-build/out"
export PP_ARTIFACT_DIR="$PWD/.integration-fixtures/pp-artifacts"
export RG_CONTRACTS_OUT="$PWD/.integration-fixtures/railgun-build/out"
export ANVIL_BIN="$(command -v anvil)"
REQUIRE_ANVIL=1 npm test -w @ghostpay/external-pools-privacypools -w @ghostpay/external-pools-railgun

# Reuse the existing test-only EntryPoint fetch/build path for sponsor tests.
bash packages/payer-hiding-contracts/scripts/fetch-entrypoint.sh
forge build --root packages/payer-hiding-contracts
npm test -w @ghostpay/payer-sponsor
```

If `SOLC_BIN` selects a local compiler, also pass `--use "$SOLC_BIN"` to the sponsor `forge build`.
`REQUIRE_ANVIL` above is limited to the two packages with prepared fixtures. Do not export it globally
across optional-fixture workspaces. A preparation failure must be resolved before a required run;
without required mode the package's existing optional skip behavior still applies. The preparation
script prints **no test pass**: its final output is only the three directory paths, also written to
`.integration-fixtures/paths.json`.

## Inputs and validation

| Input | Identity / source | Check before use |
| --- | --- | --- |
| Privacy Pools contracts, verifiers and circuit artifacts | [`0xbow-io/privacy-pools-core` at `d494b63e79f33bb2b0c8ece6cdacdca465c3b884`](https://github.com/0xbow-io/privacy-pools-core/tree/d494b63e79f33bb2b0c8ece6cdacdca465c3b884) | Exact Git revision and completely clean checkout, including ignored/untracked extras |
| Railgun contract logic | [`Railgun-Privacy/contract` at `36bcf5ed7cf94bfafb6e1a303e1832c769c16780`](https://github.com/Railgun-Privacy/contract/tree/36bcf5ed7cf94bfafb6e1a303e1832c769c16780) | Same revision and cleanliness checks |
| Privacy Pools Solidity dependencies | OpenZeppelin contracts 5.1.0, upgradeable contracts 5.0.2, lean-imt.sol 2.0.0, poseidon-solidity 0.0.5, as declared by the pinned upstream | Exact npm versions and SHA-512 tarball pins in `external-fixtures.pins.json`; no install scripts |
| Railgun Solidity dependencies | OpenZeppelin contracts and upgradeable contracts 4.9.6, matching the existing integration fixture specification | Exact npm versions and SHA-512 tarball pins; no install scripts |
| `commitment` and `withdraw` WASM, vkey and zkey | Six committed upstream artifacts; digest table in its SDK README | All six SHA-256 values must equal the existing `packages/external-pools/src/manifest-data.ts` values |
| Local Railgun test token | Tiny generated OpenZeppelin ERC-20 with public mint, isolated in `railgun-build/TestToken.sol` | Test-only fixture compiled with the same pinned dependency; never shipped or used on public chains |

The npm integrity pins were recorded from the named package tarballs on 2026-11-09. The helper verifies
the downloaded bytes before extraction, rejects unsafe archive paths, and refreshes extracted package
contents on each run. An existing upstream checkout with the wrong commit or changed files fails
closed; the helper does not overwrite it. Test fixture compiler settings are recorded in generated
`foundry.toml` files: optimizer enabled, 10,000 runs, no bytecode metadata. Only the needed upstream
logic is compiled; upstream test/install/deploy scripts are not executed.
Each build forces a fresh compilation so a modified cached output cannot survive an incremental
no-op. A supplied local `SOLC_BIN` must identify itself as version 0.8.28.

## Qualification on 2026-11-09

Node 24.22.1, npm 11.9.0, Foundry/Anvil 1.8.5, Solc 0.8.28. The preparation script completed and its
three regression tests passed, covering wrong revisions, dirty/ignored source additions, modified or
missing artifact files, symlinks, and missing/ambiguous runtime pins.
A manual cache-tamper check changed the generated Railgun token bytecode to `0x6000`; rerunning the
preparation helper replaced it with freshly compiled bytecode, verifying the forced-build behavior.

With the prepared paths, this invocation passed **230 tests, no failures or skips**:

```bash
VITEST_MAX_WORKERS=2 npm test \
  -w @ghostpay/external-pools-privacypools \
  -w @ghostpay/external-pools-railgun \
  -w @ghostpay/payer-sponsor
```

| Suite | Executed result | What this establishes |
| --- | --- | --- |
| Privacy Pools | 77 passed / 8 files | Real circuit hashing/proofs and local Anvil deposit, relayed withdrawal, ragequit, self-relay and recovery; its relayer is an in-test HTTP-shape stand-in |
| Railgun | 21 passed / 4 files | Real contract shield/fee/event path on local Anvil; unshield/SDK/PPOI/broadcaster integrations are still outside this fixture |
| Payer sponsor | 132 passed / 13 files | Existing pinned EntryPoint fixture and four real Anvil tests, plus unit/property tests |

These sources inherit PR #89 `cfc7b0f3325a550df830584e86db4c38bcc9d6b2`; this lane changes fixture tooling
and browser tests, not the package runtime source. No internal-pool trusted-setup artifacts were
generated. Live network services, deployed code identities and funded-wallet qualification remain
separate from this local evidence.

Browser additions cover reconciliation backup retry, repeat file input, lock/reload cancellation,
locale persistence, unchanged invoice identity/amount/status, reviewed-English security copy and RTL
backup input; public pairing covers repeat file input and reload without key installation. The new
reconciliation journey requires the accompanying localization change. Local collection reports 61
tests in 13 files. Chromium cannot create its singleton socket in this environment, so browser
execution must be qualified by hosted full/lean checks on the integrated commit; collection alone is
not an E2E pass.
