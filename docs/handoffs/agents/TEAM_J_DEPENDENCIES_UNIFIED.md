# Team J dependency security remediation — 2026-11-16

Repository: `djshellshoxxx/GhostPay`. Branch: `codex/unified-dependencies`.
Base: `ab5039a3da0a1653df85b8ecbda6973947827547`.
Implementation: `379fe3004f06261949a7cd3303ae1699927bdc6a`.

## Result and scope

The complete npm audit decreased from **33 findings (6 high, 12 moderate, 15 low)** to
**17 low findings, with no moderate/high/critical findings**. The production-only audit reports
zero findings. The full development tree is **not clean**: the remaining findings and next steps
are listed below. npm counts affected package nodes, including inherited findings, rather than
independent vulnerabilities.

All **154 non-development installed-package lock records** are exactly unchanged from the base,
including dependency metadata, versions, resolved URLs and integrity values. Those records contain
142 unique name/version/resolved/integrity tuples. There are no new or removed production records.
All direct runtime dependency specifications are unchanged. In particular, `@bufbuild/protobuf`
remains exactly `2.17.0`, Viem remains `2.57.13`, and the BlindBit schema sources, upstream pin and
license under `packages/btc-silent-payments/proto/blindbit/` are untouched.

Raw evidence:

- [Baseline complete audit](evidence/team-j-dependencies-2026-11-16/audit-before.json)
- [Final complete audit](evidence/team-j-dependencies-2026-11-16/audit-after.json)
- [Production-only audit](evidence/team-j-dependencies-2026-11-16/audit-production.json)
- [Validation logs and incomplete attempts](evidence/team-j-dependencies-2026-11-16/validation.txt)

The baseline JSON was supplied by the coordinator for the current base. Audit results are a dated
registry snapshot, not a guarantee against future advisories or an external security audit.

## Changes and compatibility evidence

| Change | Reason and bounded compatibility evidence |
|---|---|
| ESLint `10.13.0` → `10.15.0`, in all 65 existing direct pins | Same major. Upstream's November 13 release requires fixed minimatch versions. Existing type-aware ESLint configuration passed against core-crypto and secret-box source. |
| typescript-eslint `8.72.1` → `8.73.0`, in all 65 existing direct pins | Same major. Published peers include ESLint 10 and TypeScript `>=4.8.4 <6.1.0`; the project's TypeScript remains `5.9.3`. Both package lint runs passed. |
| Hardhat `2.29.1` → `2.29.2` | Compatible upstream patch; existing fhEVM/ethers/plugins stay pinned. The upstream dependency ranges now admit `adm-zip@0.6.1` and `undici@6.29.1`; vulnerable `@fastify/busboy@2.1.1` is removed with the old Undici dependency. Compile, TypeScript and 39 router/chain-guard tests passed. |
| `mocha`-scoped `serialize-javascript@7.1.4` override | Fixes the RCE/DoS and subsequent XSS findings. CommonJS remains supported; Node minimum 20 fits the project toolchain. Mocha passes `{unsafe:true, ignoreFunction:true}` to serialize worker options. Actual Mocha serialization tests preserve RegExp, Date and undefined, omit functions without mutating the parent, and exercise real parallel worker IPC. |
| `mocha`-scoped `glob@14.0.6` and `minimatch@11.0.8` overrides | Clear cancellation/amplification advisories. CommonJS exports and Mocha's `hasMagic`, `sync`, `Glob.patterns`, `Pattern.pattern/rest/globString`, and `minimatch` options remain available. Integration tests cover nested discovery, ignored files, grep, workers, brace alternatives and dotfiles. Upstream glob 11–13 changes include Node support and CLI removal; Mocha uses the library API. Brace alternatives may be compacted internally, so tests check matching behavior instead of requiring a particular internal array layout. |
| `mocha`-scoped `diff@8.0.3` override | Fixes patch-parser DoS. Mocha uses `createPatch` and `diffWordsWithSpace`; both unified and inline assertion-error reports are executed. Removed `merge`, changed TypeScript types and custom Diff subclass behavior are not used by these call sites. ts-node retains its independent `diff@4.0.4`. |
| `solc`-scoped `tmp@0.2.7` override | Fixes plain-string traversal and the follow-up non-string bypass in `0.2.6`. Bundled `solc@0.8.26` remains unchanged. Its SMT helper calls `fileSync({postfix:'.smt2'})`, writes the returned path and invokes `removeCallback()`. Tests exercise that exact API and the actual SMT helper with a local fake solver; string, array and coercible-object traversal attempts are rejected. |

The scoped overrides intentionally cross the transitive upstream ranges where no fixed in-range
release exists. They are not global replacement of application dependencies. They need to be
removed or reevaluated when Hardhat/Mocha/solc publish compatible native resolutions. Published npm
metadata and the installed consumer source were inspected before the overrides were accepted.

Other lock changes are development-only resolution cleanup and compatible patch updates such as
`brace-expansion@5.0.13`, `semver@7.8.6` and the separate `undici@8.12.4`. Existing root `ws`,
`underscore` and Privacy Pools Viem overrides remain intact.

## Remaining findings: explicit disposition

| Advisory root and affected audit nodes | Reachability and disposition |
|---|---|
| `elliptic@6.6.1`: 15 low nodes — elliptic; secp256k1; ethereum-cryptography; ethereumjs-util; six `@ethersproject/*` packages; hardhat; hardhat-ethers; hardhat-network-helpers; hardhat-chai-matchers; fhEVM hardhat-plugin | All nodes are development-only in this lock and absent from the production audit. The advisory has no patched Elliptic version. The dependency paths come through Hardhat's ethers-v5 ABI stack and helpers' ethereumjs-util stack. This is not proof that all tool-side signing paths are unreachable. A supported Hardhat 3 / ethers 6 / helpers 3 migration is required rather than aliasing cryptography APIs or forcing incompatible majors. |
| `cookie@0.4.2` and `@sentry/node@5.30.0`: two low nodes | Development-only Hardhat diagnostics chain. Installed Sentry utils dynamically use `cookie.parse` to read request cookies; the reported flaw concerns `cookie.serialize` name/path/domain validation. No serialization call was found in this consumer path. Retained pending upstream Sentry/Hardhat migration; not represented as a fixed advisory. |

Audit's suggested helpers `3.0.12` requires Hardhat `^3.8.0`, while the installed fhEVM plugin
`0.4.2` requires Hardhat `^2.0.0` and hardhat-ethers `^3.1.3`. The next migration must first select
a compatible fhEVM plugin/SDK and Hardhat 3 plugin set, convert configuration/tasks as required,
then run the actual complete confidential-contract suite and deployment-tooling checks. The
existing Zama relayer SDK deprecation likewise needs its own compatible migration. No production
or protocol major version was changed just to make the development audit report zero.

## Validation and package-manager behavior

Tests ran in this worktree's own installed `node_modules`, not a shared root symlink. Runtime:
Node `24.22.1`. Lock resolution used npm `10.9.8`; the repository CI's Node 22 lane remains the
authoritative cross-version check. No npm package-manager pin, CI configuration or threshold changed.

| Check | Result |
|---|---|
| `npm audit --json` | 17 low, 0 moderate/high/critical. Exit 1 is expected because low findings remain. |
| `npm audit --omit=dev --json` | 0 findings. |
| `npm run test:dependency-tooling` | Five focused integration tests passed; no skips. |
| `NODE_OPTIONS=--max-old-space-size=1024 npm run lint -w @ghostpay/core-crypto -w @ghostpay/secret-box` | Both passed using the updated type-aware ESLint toolchain. |
| `GHOSTPAY_SOLC_PATH=/tmp/ghostpay-analyzers/bin/solc npm run compile -w @ghostpay/confidential-contracts` | 36 Solidity files compiled, Cancun target. Existing local compiler escape hatch used with the coordinator's verified solc 0.8.28 binary. |
| `npm run typecheck -w @ghostpay/confidential-contracts` | Passed. |
| npm `10.9.8` clean install of the final lock, 512 MiB heap / one socket | Passed; the lock's SHA256 is unchanged. |
| npm `11.9.0` clean install of the final lock, same bounds | Killed with exit 137; compatibility of this clean-install path is **not qualified** locally. The lock was not changed. |
| `NODE_OPTIONS=--max-old-space-size=512 GHOSTPAY_SOLC_PATH=... ANVIL_BIN=... npm run test -w @ghostpay/confidential-contracts -- test/chainGuard.test.ts test/router.test.ts` | 39 passed, including all nine native Anvil chain-guard cases; zero skips. |
| Full `npm run test` with the unchanged 1,000-run FHE fuzz configuration | Exited 137 during random-amount fuzzing after the boundary test. **Not a pass.** Initial attempt lacked `ANVIL_BIN` and skipped nine chain guards; the bounded suite above subsequently executed them. |
| Existing `test:quick` with 100 fuzz runs and two invariant sequences | Also exited 137 during random-amount fuzzing. **Not a pass and not a substitute for full fuzzing.** No test counts, configuration or thresholds were weakened. |

The coordinator/hosted CI must run the full existing FHE suite and combined lint/typecheck/build
against the integrated head. Broad application tests and build results from earlier source heads
are not reissued as dependency validation here.

Incremental npm `11.9.0` installs did not apply the new overrides and could undo an existing root
override. npm `10.9.8` correctly reported stale override resolutions; a targeted npm 10 update
resolved them without production version drift. A fresh unlocked npm 10 resolution was abandoned
after an `edgesOut` resolver error; a fresh npm 11 resolution was also abandoned before accepting
any broad transitive updates. The committed lock comes from the original lock plus targeted updates.
Do not use a broad unlocked install or `npm audit fix --force` to reproduce this patch.

The verified reproduction is a clean npm 10 install using the committed lock:

```sh
NODE_OPTIONS=--max-old-space-size=512 npm_config_maxsockets=1 \
  npx --yes npm@10.9.8 ci --ignore-scripts --no-audit --no-fund
npm run test:dependency-tooling
```

The installed npm 10 CLI for the coordinator's current environment is
`/home/agent/.npm/_npx/d8f2e63c6145eb9d/node_modules/npm/bin/npm-cli.js`; it can be invoked directly
with `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` and the same flags.
These environment paths are conveniences, not repository dependencies. CI should continue to use
its standard Node 22 locked install. The committed lock's SHA256 is
`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.

One unrestricted repeat npm 10 install and the subsequent bounded npm 11 install were killed with
exit 137 during shared-host pressure. The bounded npm 10 retry succeeded in 20 seconds with no
lock mutation. After npm 11's failed attempt the local dependency directory was restored using
the verified npm 10 command before final smoke checks. No root/shared dependency directory was edited.

## Primary sources consulted

- [ESLint 10.15.0 release](https://eslint.org/blog/2026/11/eslint-v10.15.0-released/)
- [typescript-eslint package and peer declarations](https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/typescript-eslint/package.json)
- [typescript-eslint changelog](https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/typescript-eslint/CHANGELOG.md)
- [Hardhat release history](https://github.com/NomicFoundation/hardhat/releases) and published npm metadata for `hardhat@2.29.2`, `@fhevm/hardhat-plugin@0.4.2` and `@nomicfoundation/hardhat-network-helpers@3.0.12`
- [serialize-javascript releases](https://github.com/yahoo/serialize-javascript/releases), including 7.1.3's security fix and 7.1.4's method serialization correction
- [Glob changelog](https://github.com/isaacs/node-glob/blob/main/changelog.md), [14.0.6 security release](https://github.com/isaacs/node-glob/releases/tag/v14.0.6), and [cancellation advisory](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4)
- [minimatch amplification advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- [jsdiff release notes](https://github.com/kpdecker/jsdiff/blob/master/release-notes.md), also inspected in the installed 8.0.3 package
- [tmp changelog](https://github.com/raszi/node-tmp/blob/master/CHANGELOG.md), [plain traversal advisory](https://github.com/advisories/GHSA-ph9p-34f9-6g65), and [0.2.6 type-confusion bypass](https://github.com/advisories/GHSA-7c78-jf6q-g5cm)
- [Unfixed Elliptic advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84)
- [Cookie serialization advisory](https://github.com/advisories/GHSA-pxg6-pf52-xh8x)
- [npm workspace override issue](https://github.com/npm/cli/issues/9514)

The complete audit JSON files retain the exact remaining and removed advisory URLs, affected
ranges, dependency paths and suggested fixes. Source review was independently performed by the
coordinator's `final_review` worker against implementation commit `379fe300`.
