# Native qualification — 2026-11-18

Independent worker: `ci_qualification`. This record distinguishes actual execution from installed-tool probes. No remote mutation or deployment was performed. Analyzer gates, severity filters and test budgets were not relaxed.

## Source boundary

- Combined source: `ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929`.
- Contracts tree object: `a84815152b8f07c854197c84b5613b02f7939882`.
- At execution, `git diff --quiet ea8f8d655caa9fa361cfbcfa3e4e41f474dfa929 -- packages/contracts scripts/recovery` succeeded. Later parent edits to ux-vault and documentation do not belong to this tested scope.
- Working directory for contract commands: `/workspace/scratch/4fa14be12559/GhostPay/packages/contracts`.

## Verified tools

Native binaries are in `/workspace/scratch/4fa14be12559/toolchain-probe/bin`.

| Tool | Executed version | Provenance |
| --- | --- | --- |
| forge, cast, anvil | 1.8.5, commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f` | Official Foundry v1.8.5 archive SHA-256 `6c66ffcc55fa4249197721baa3098bc208014ea1d8aa04b2ed50ac6bccffb226` |
| solc | 0.8.28+commit.7893614a.Linux.g++ | Official binary-list checksum `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25` |
| Echidna | 2.2.7 | Official archive, repository-pinned SHA-256 `d9f8c2e829cc35a4077f8c139863c9087a038262639febd1dcc69d93b79aa314` |
| Slither | 0.11.6 | Isolated Python 3.12 venv; exact workflow top-level pin; crytic-compile 0.4.2 |
| Mythril | v0.24.8 | Separate Python 3.12 venv; exact workflow top-level pins and byte-identical repository compatibility launcher |

Version/download/install logs are under `../toolchain-probe/logs/`. The complete transitive Python dependency graph is the graph resolved during these installs, not a claimed lockfile. The Mythril compatibility launcher has SHA-256 `9635bcc9057ddf4681615e67add21bbb584f74df65b563faa23d1219080c2035` and changes only the official Solidity download host, as the existing workflow does.

## Executed core contracts

```sh
env PATH="/workspace/scratch/4fa14be12559/toolchain-probe/bin:$PATH" \
  FOUNDRY_SOLC=/workspace/scratch/4fa14be12559/toolchain-probe/bin/solc \
  FOUNDRY_PROFILE=default RAYON_NUM_THREADS=1 FOUNDRY_INVARIANT_WORKERS=1 \
  forge test --threads 1
```

**Exit 0: 490 passed, 0 failed, 0 skipped, 34 suites; 81.85 seconds.** The effective default profile retained fuzz runs 10,000, invariant runs 256/depth 50, optimizer enabled/runs 200, and Cancun. Resource concurrency was restricted; the development profile was not used. The log contains 41 fuzz tests reporting 10,000 runs and invariant campaigns reporting the original budget.

Evidence: `combined-forge-contracts-185.log`, SHA-256 `d7f30f705efe31e00c5ff319361fd6478f6023f0c757e4e5e87c167a02d25fe3`; `combined-foundry-config.json` retains the effective config. This execution does not substitute for separate coverage, snapshots, lint, extra-contract workspaces or analyzer campaigns.

## Executed raw-key recovery interoperability

Working directory: `/workspace/scratch/4fa14be12559/GhostPay`.

```sh
env PATH="/workspace/scratch/4fa14be12559/toolchain-probe/bin:/workspace/scratch/a884a1d6c4d8/fs35-node22-npm-cache/_npx/e5e7bdc4f892e393/node_modules/node/bin:$PATH" \
  ANVIL_BIN=/workspace/scratch/4fa14be12559/toolchain-probe/bin/anvil \
  CAST_BIN=/workspace/scratch/4fa14be12559/toolchain-probe/bin/cast \
  REQUIRE_ANVIL=1 RAYON_NUM_THREADS=1 NODE_OPTIONS=--max-old-space-size=256 \
  node --test --test-concurrency=1 scripts/recovery/raw-key-anvil.test.mjs
```

**Exit 0: 1 passed, 0 failed, 0 skipped.** Node 22.23.5, verified Foundry 1.8.5 cast/Anvil. The test independently derives the fixture address with cast, funds/spends the public synthetic fixture on local Anvil, and checks receipt/balance/nonce. Evidence: `combined-raw-key-anvil-185.log`.

## Executed Slither gate

```sh
env PATH="/workspace/scratch/4fa14be12559/toolchain-probe/bin:/workspace/scratch/4fa14be12559/toolchain-probe/slither/bin:$PATH" \
  FOUNDRY_SOLC=/workspace/scratch/4fa14be12559/toolchain-probe/bin/solc \
  FOUNDRY_PROFILE=default \
  FOUNDRY_OUT=/workspace/scratch/4fa14be12559/toolchain-probe/slither-out \
  FOUNDRY_CACHE_PATH=/workspace/scratch/4fa14be12559/toolchain-probe/slither-cache \
  RAYON_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  slither . --filter-paths "lib|test|script" --fail-medium --exclude-informational --exclude-low
```

**Exit 0: 34 contracts analyzed with 64 detectors, 0 retained results.** The analyzer command and existing severity/path/source suppressions are identical to CI. The effective compiler is the pinned native solc. crytic-compile invoked its normal `forge clean` and production rebuild; isolated output/cache directories kept the already-qualified root test artifacts available for the coordinator. No detector or failure threshold was weakened.

Evidence: `combined-slither-0116.log`. This result describes the unchanged configured gate; it does not claim absence of informational/low or deliberately suppressed findings.

## Pending full analyzer campaigns

Echidna and Mythril binaries execute successfully. Their full repository campaigns have not yet run at this point in the record. These are pending execution, not unavailable-tool claims. The coordinator is scheduling them around the full npm test memory budget. Preserve Echidna 300,000 calls per harness, all three harnesses and canaries; preserve Mythril five targets, timeout 900 seconds each, transaction depth 3 and fail-on-any-finding/error gate. Add actual final outcomes below when complete.
