# PR #210 dependency alignment and coverage placement — 2026-11-18

## Scope and source

- Repository: `djshellshoxxx/GhostPay`.
- Exact PR #210 base: `4d19655a2e5d93ad9378803cd4163245168aca24`.
- Branch: `chatgpt/ghostpay-viem-alignment-20261118`.
- Viem alignment: `0597852aeede368b0b8819be0c4cd68c9b1a6081`.
- Separate coverage placement repair, and final tested dependency source:
  `8b98e68effa2da42dd612c7db456b63dbdf990a2`.
- Final `package.json` blob: `12156705352eb7ddfaaab7b3190e60feefbb9f92`.
- Final `package-lock.json` blob: `875e90c613d4bdc1ca53c564944b1a734b3ffd31`.

Only the root manifest, lockfile, task claim and this handoff change. Application code, package manifests,
contracts, workflows, tests, coverage configuration and release policy are unchanged.

This is a repair of the complete #210 dependency candidate. Its workspace manifests already pin viem
2.57.19 and Vitest/coverage-v8 5.1.0. Do not transplant only these root changes onto unchanged main,
whose workspace dependency versions differ. Integration must include the corresponding #210 updates
and pass CI on the actual combined head.

## Confirmed build failure and repair

After a successful clean install of the exact original head, the local command
`npm run build --workspace @ghostpay/confidential-amounts` exited 2 with TS2322 at
`src/backends/zama-sdk.ts(100,9)` and `(101,9)`. These are the public/wallet client arguments to
the Zama adapter. They match the original hosted failure in
[job 134649934566](https://github.com/djshellshoxxx/GhostPay/actions/runs/44257870877/job/134649934566).

Runtime module resolution confirmed the cause: GhostPay's confidential-amounts package resolved
viem 2.57.19 from its workspace, while Zama and the 0xbow SDK resolved the hoisted viem 2.57.13.
The root manifest's existing override for `@0xbow/privacy-pools-core-sdk` retained the older version.

The first commit changes only that existing override from 2.57.13 to 2.57.19 and regenerates the lock.
No client cast, adapter change, override broadening or major migration is introduced. After clean
installation, GhostPay, Zama and the 0xbow SDK resolve the same root viem 2.57.19 file.

Primary package metadata was checked with `npm view` for the exact published versions:

| Package | Relevant published requirement | Consequence |
|---|---|---|
| [viem 2.57.19](https://registry.npmjs.org/viem/2.57.19) | ox 0.14.65; optional TypeScript peer >=5.0.4 | The project retains TypeScript 5.9.3; both viem and ox artifacts already existed in #210. |
| [Zama SDK 3.7.2](https://www.npmjs.com/package/@zama-fhe/sdk/v/3.7.2) | viem >=2; Node >=22 | The aligned version satisfies Zama's declaration. Validation used Node 24.22.1. |
| [0xbow SDK 1.5.0](https://www.npmjs.com/package/@0xbow/privacy-pools-core-sdk/v/1.5.0) | Native dependency viem 2.22.14 | The repository already overrides this to 2.57.13. This repair retains that policy and aligns its patch version with the workspace clients; it does not claim that upstream declares 2.57.19 itself. |

## Coverage startup failure and separate repair

On the first repaired source (`0597852a`), both original package test commands failed before executing
tests: hoisted Vitest 5.1.0 could not import `@vitest/coverage-v8` from its own module location. The
#210 lock has one root Vitest and 67 workspace-local coverage provider copies, with no root provider.
Those provider records were unchanged by the viem commit. The inherited placement diagnosis is
supported by exact-source inspection; the executed RED evidence is on `0597852a`.

Two attempted clean reinstalls in a separate original-head diagnostic worktree were killed with
exit 137. They produced no baseline test result, and no cause for those terminations is certified.
The coordinator accepted the exact lock inspection plus the candidate's actual startup failures
as sufficient evidence for a bounded placement correction.

The second commit declares the already-used `@vitest/coverage-v8` 5.1.0 as an exact root development
dependency. Normal npm regeneration places it beside Vitest, with its unchanged helper packages.
All workspace pins, test commands, includes/excludes and coverage thresholds remain unchanged.
The original coverage-enabled commands then execute and pass.

## Lockfile scope and integrity

| Commit delta | Added records | Removed records | Retained records changed |
|---|---:|---:|---|
| Viem alignment vs #210 | 0 | 132 | Root viem 2.57.13 → 2.57.19; root ox 0.14.59 → 0.14.65; web lock metadata `vite: ^8.3.8` → `8.3.8`, matching its already-exact manifest. |
| Coverage placement vs viem commit | 3 | 201 | Root lock metadata gains the exact development dependency. |

The first removal set contains 24 viem, 24 ox, 24 `@noble/curves`, 24 `@noble/ciphers` and 36
`@noble/hashes` duplicate records. Independent review found 127 retained equivalents with identical metadata;
five pool-circuits records differ only by the former `dev: true` placement flag. Package versions,
tarball URLs, integrity hashes and dependency metadata are preserved. The promoted root viem and
ox records match versions already present in the original workspace graph.

The second removal set contains 67 copies each of coverage-v8, istanbul-lib-coverage and
istanbul-lib-report. Each removed record has a retained equivalent with identical metadata. The three added
root records already existed identically under the workspaces.

Across both commits, there are no new unique package/version/tarball/integrity tuples. Only the
old viem 2.57.13 and ox 0.14.59 tuples disappear. All 30 OS/CPU/libc-constrained records are unchanged;
unrelated package versions, integrity values and existing security overrides are preserved.
The lock's large textual deletion is duplicate removal, not a broad dependency update.

Regeneration used pinned npm 11.21.2, with the existing override edited first:

```sh
NODE_OPTIONS=--max-old-space-size=768 npm exec --yes --package=npm@11.21.2 -- npm update viem --package-lock-only --ignore-scripts --no-audit --no-fund --maxsockets=2 --prefer-offline
NODE_OPTIONS=--max-old-space-size=768 npm exec --yes --package=npm@11.21.2 -- npm install --save-dev --save-exact --package-lock-only --ignore-scripts --no-audit --no-fund --maxsockets=2 --prefer-offline @vitest/coverage-v8@5.1.0
```

Earlier client attempts that left the old resolution or changed unrelated overrides were discarded.
No force/legacy-peer install, audit fix, manual dependency-record transplant or suppression is retained.
Clean installs and verification used the environment's npm 11.9.0; changing the project toolchain
is not part of this repair.

## Executed validation

| Source | Command / check | Actual result |
|---|---|---|
| Original #210 | Clean `npm ci --ignore-scripts --no-audit --no-fund --maxsockets=2 --prefer-offline`, bounded heap | Exit 0; 1,051 packages installed. Earlier killed/interrupted attempts are not counted as success. |
| Original #210 | Confidential-amounts build | Exit 2; the two Zama/viem TS2322 errors reproduced. |
| `0597852a` | `NODE_OPTIONS=--max-old-space-size=1536 npm run build:libs` | Exit 0; 77 workspace build invocations. The later coverage-only commit changes no library source or runtime dependency record. |
| `0597852a` | Original coverage-enabled tests for both affected packages | Both exit 1 before test execution because the hoisted coverage provider is missing. |
| `8b98e68e` | Clean bounded `npm ci` with the same flags | Exit 0; 721 packages installed. |
| `8b98e68e` | `npm test --workspace @ghostpay/confidential-amounts -- --maxWorkers=1` | Exit 0; 88 passed, no skips. Coverage: 99.38% statements, 95.18% branches, 100% functions, 99.76% lines. |
| `8b98e68e` | `npm test --workspace @ghostpay/external-pools-privacypools -- --maxWorkers=1` | Exit 0; 73 passed, 4 pre-existing artifact-dependent skips. Coverage: 98.11% statements, 91.46% branches, 98.85% functions, 99.77% lines. |
| `8b98e68e` | `npm run test:dependency-tooling` | Exit 0; 5/5 passed, including the existing Mocha and solc integration checks. |
| `8b98e68e` | `npm run typecheck --workspace @ghostpay/confidential-amounts --workspace @ghostpay/external-pools-privacypools` | Exit 0 for both packages. |
| `8b98e68e` | Corresponding two-package `npm run lint` | Exit 0. |
| `8b98e68e` | `NODE_OPTIONS=--max-old-space-size=1536 npm run build --workspace @ghostpay/web` | Exit 0; includes whole-web TypeScript, Vite production build and unchanged postbuild bundle scan. Scanner validated 19 files. |
| Both sources | Production `npm audit --omit=dev --audit-level=high --json` | Zero findings; successful production audit. |
| Both sources | Full `npm audit --audit-level=high --json` | Exit 1; unchanged 30 entries: 14 high and 16 low. |

The web build emitted nonfatal diagnostics for build-time `help.css` resolution, `node:http`
externalization from the PIR package, a large chunk and an ineffective dynamic import. No browser
execution or warning-remediation claim is made. The four skipped Privacy Pools cases require the
external contract/circuit artifacts (and Anvil for the full integration); they were not forced to pass.
The test suite does exercise real offline SDK derivations and loads Zama's real node/web/cleartext
entry points, but no live relayer, public-chain or real-funds acceptance was performed.

## Independent review and remaining gates

The privacy reviewer independently checked both commit deltas, all platform records and installed
resolution on exact `8b98e68e`. Its separate Zama SDK/glue selection passed 17/17 with one worker and
coverage disabled for that narrow additional selection; this supplements the author's complete
coverage-enabled package runs. The reviewer also independently repeated audits: production exit 0
with zero findings, full audit exit 1 with 30 entries (14 high, 16 low). No blocking source/lock finding
was identified. The final documentation commit leaves the two tested manifest/lock blobs unchanged.

This repair does not remediate [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
The development dependency findings remain; the 14 high entries are propagated audit records, not
14 distinct advisories. No all-dependency security pass or complete beta qualification is claimed.

The repaired candidate is ready for the coordinator's source review and hosted CI. Original #210's
red checks are not superseded by local results, and no hosted result for these local commits or the
combined main head is asserted. No publication, merge, deployment or release was performed by this
worker. Required hosted checks must pass before integration.

Local evidence is under `/workspace/scratch/fb6d03ffb806/`: `viem-baseline-build.log`,
`viem-candidate-build-libs.log`, `viem-confidential-amounts-tests.log`, `viem-privacy-pools-tests.log`,
`viem-final-*` validation logs/audits, `viem-lock-delta.json`, `viem-lock-dedup-proof.json`,
`viem-coverage-lock-delta.json`, `viem-sdk-independent.log`, `viem-audit-production-independent.json`
and `viem-audit-all-independent.json`.
The baseline audit manifests were copied from exact #210 into `viem-baseline-audit`; those audits
read the original lock without altering a checked-out source tree.
