# Paired dependency integration and qualification — 18 November 2026

## Source and integration

Worker: `ci_qualification`, using the Caveman investigate-first, lean-build and verify-and-stop workflows.
Branch: `integration/ghostpay-dependency-qualification-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Tested source: `811276498b589c0576fdc76e58a52296b155c413`.

The branch combines both dependent revisions in order:

1. `5f2162ee` cherry-picks the complete manifest/lock update from [#210](https://github.com/djshellshoxxx/GhostPay/pull/210), source `4d19655a2e5d93ad9378803cd4163245168aca24`.
2. `81127649` extracts only `package.json` and `package-lock.json` from [#236](https://github.com/djshellshoxxx/GhostPay/pull/236), source `defdaa308a2d05ab407af7e42f8dc457cf52d103`.

The resulting root manifest and lockfile are byte-identical to #236. All workspace dependency updates from #210 remain present. The root viem override is 2.57.19, matching the workspace pins; the matching 5.1.0 coverage provider is a root development dependency. The original coverage thresholds and commands remain effective.

| Input | SHA-256 |
|---|---|
| `package.json` | `e6e11d17db5a845f296e270f5d19fe3ecdb0640d64e061d6de6d95108f8e916d` |
| `package-lock.json` | `03f7ba563716fa4b7110ad2f94a0550b5fde71adcd175947e7f0a83bb22c0a49` |

The lock has 821 package records. The two dependency revisions must remain together during integration.

## Actual local verification

Successful checks use Node 22.23.5. The workspace declares Node >=22, and hosted workflows select Node major 22. No repository npm version is pinned. npm 11.21.2, the existing lockfile generation version, was used for the successful fresh installation and the coverage-enabled package checks.

| Check | Actual outcome |
|---|---|
| Clean `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund --maxsockets=1`, npm 11.21.2, heap 768 MiB | Exit 0; 721 packages installed in 11 seconds. |
| `npm run build:libs`, heap 1536 MiB | Exit 0; all 77 workspace library builds ran. |
| `npm run test:dependency-tooling` | Exit 0; 5 passed, 0 failed, 0 skipped. |
| `npm test -w @ghostpay/confidential-amounts -- --maxWorkers=1` | Exit 0; 88 passed. Coverage: statements 99.38%, branches 95.18%, functions 100%, lines 99.76%. |
| `npm test -w @ghostpay/external-pools-privacypools -- --maxWorkers=1` | Exit 0; 73 passed, 4 existing artifact-dependent tests skipped. Coverage: statements 98.11%, branches 91.46%, functions 98.85%, lines 99.77%. |
| `npm run typecheck -w @ghostpay/confidential-amounts -w @ghostpay/external-pools-privacypools` | Exit 0 for both packages. |
| `npm run lint -w @ghostpay/confidential-amounts -w @ghostpay/external-pools-privacypools` | Exit 0 for both packages. |
| `npm run build --workspace @ghostpay/web`, Node 22, heaps 1536 and 1280 MiB | Both attempts exit 137 during TypeScript; no source diagnostic, and Vite/postbuild stages did not execute. |
| `npm ls --all --omit=dev`, npm 10.9.4 and npm 11.21.2 | Exit 0 on the same installed dependency tree. |
| `npm audit --omit=dev --audit-level=high --json` | Exit 0; zero findings. |
| `npm audit --json` | Exit 1; 30 affected-package entries: 14 high and 16 low. See the unresolved advisory below. |
| `git diff --check` | Exit 0. |

The coordinator stopped further standalone web-build retries and owns the final combined-source build. No passing web build is claimed by this worker.

Three earlier `npm ci` attempts under npm 11.9.0 exited 137: Node 24 default heap; Node 22 with 1536 MiB heap; and Node 22 with 512 MiB heap/offline mode. Those failures remain failures. An existing installed tree with the exact same lockfile was copied temporarily to permit the first library/tooling checks. The later npm 11.21.2 clean install independently succeeded and replaced it. The candidate source and lock did not change between these checks.

The environment's npm 11.9.0 `npm ls --all --omit=dev` reports existing explicitly overridden viem, ws and underscore versions as invalid. Both npm 10.9.4 and 11.21.2 return success on that identical installed graph. This observation does not justify changing dependency pins or removing the tree-validation gate.

### Reproducing the successful installation

The verified binaries in this session were:

```sh
TASK_NODE_DIR=/workspace/scratch/a884a1d6c4d8/fs35-node22-npm-cache/_npx/e5e7bdc4f892e393/node_modules/node/bin
TASK_NPM_CLI=/home/agent/.npm/_npx/c3b7dd07abd2a8cc/node_modules/npm/bin/npm-cli.js
env PATH="$TASK_NODE_DIR:$PATH" NODE_OPTIONS=--max-old-space-size=768 \
  node "$TASK_NPM_CLI" ci --ignore-scripts --prefer-offline --no-audit --no-fund --maxsockets=1
```

These absolute executable paths describe this environment. Another runner must install the stated versions through its normal trusted toolchain.

## Unresolved high-severity development advisory

The previous `PICOMATCH_AUDIT.md` was read before further investigation. Fresh primary-source checks reproduce its external blocker:

- The [GitHub-reviewed GHSA-fc5q-39xc-vjpf advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), last updated 17 November 2026, affects picomatch <=4.0.7 and lists **no patched versions**.
- The [upstream releases](https://github.com/micromatch/picomatch/releases) still list 4.0.7 as latest.
- A fresh `npm view picomatch dist-tags versions time --json` exits 0. The latest tag is 4.0.7, and the full published version list ends at 4.0.7. The registry modification timestamp is 2026-08-24T14:36:23.879Z.
- This candidate already resolves picomatch 4.0.7. The 14 high audit entries represent this advisory and its dependency ancestors, not 14 distinct vulnerabilities.

No authentic compatible patched release is available for a narrow upgrade. npm's proposed toolchain downgrades do not establish a patched picomatch release. The development-inclusive high finding remains a release gate; a zero-finding production audit does not waive it. No custom fork, speculative version or suppression was introduced.

## Remaining qualification

The four artifact-dependent Privacy Pools tests, complete combined-source checks, browser acceptance, current hosted CI and the development advisory remain open. Source-scoped local qualification does not relabel the original #210 failed CI or #236 queued checks.

Current Chromium smoke execution exits 134 before page load with `socket() failed: Operation not permitted`. A separate Node loopback TCP listener succeeds. No browser execution tool was available in the current tool catalog. The only discovered Foundry installation reports version 1.5.1, while workflows require 1.8.5; no pinned native-tool campaign is claimed.

Local raw logs and audit outputs are retained in `/workspace/scratch/4fa14be12559/analysis-ci/`. The coordinator owns independent review, combined-source verification and any remote integration.
