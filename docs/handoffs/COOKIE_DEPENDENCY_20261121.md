# Scoped cookie dependency repair — 2026-11-21 UTC

## Result and scope

Candidate branch: `repair/ghostpay-cookie-dependency-20261121-5ceb`.
Base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Product commit: `8519a14c41e473b712df427f8ea4924247bb0f95`.
Product tree: `f80cab6cb8d4d9ad9a96be81e5a7121fd524c825`.
Worker: `/root/dependency_cookie_repair`; publication coordinator: `/root`.

A version-scoped root override pins `cookie@0.7.2` below `@sentry/node@5.30.0`.
This removes the cookie advisory from the existing development-only Hardhat diagnostics
dependency graph while preserving Hardhat, fhEVM, application and cryptographic versions.
The installed consumer uses `cookie.parse` through `@sentry/utils`; the added compatibility
case exercises that actual consumer with ordinary encoded, empty, quoted and duplicate
cookies, absent headers, and existing middleware values. It does not initialize Sentry or
transmit any request. All five prior dependency-tooling tests are byte-for-byte preserved.

Exactly **one of 815 lock records** changes: `node_modules/cookie`, from `0.4.2` to `0.7.2`.
The other **814 records**, including all **222 non-development, non-link package records**,
are identical to main. The new archive integrity matches the registry metadata. No other
version, manifest dependency, source guard, application, contract, workflow, threshold,
telemetry setting or deployment behavior changes. The override is deliberately scoped to
the current Sentry version and must be reevaluated when that parent is upgraded.

## Actual qualification at the product commit

Runtime: Node `24.22.3`, npm `11.19.1`; private dependency directory in this worktree.
All listed commands ran at the product SHA above unless explicitly described as baseline.

| Command | Actual result |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=512 npm_config_maxsockets=1 npm ci --ignore-scripts --no-audit --no-fund` | Exit 0; clean install of 722 packages in 12.318 s; lock hash unchanged. |
| `npm run test:dependency-tooling` | **6 passed, 0 failed, 0 skipped**, including existing Mocha/solc integration tests and the new Sentry parser compatibility case. |
| `npm run typecheck --workspace @ghostpay/confidential-contracts` | Exit 0. |
| `HARDHAT_DISABLE_TELEMETRY_PROMPT=true npm run compile --workspace @ghostpay/confidential-contracts` | Exit 0; **36 Solidity files** compiled with the unchanged native solc `0.8.28`, Cancun target. |
| `HARDHAT_DISABLE_TELEMETRY_PROMPT=true npm test --workspace @ghostpay/confidential-contracts -- test/router.test.ts` | **30 passed, 0 failed, 0 skipped**. Local existing Hardhat/mock suite; no public network or real-funds action. |
| `npm ls cookie @sentry/node --all --json` | Exit 0; Sentry `5.30.0` resolves overridden cookie `0.7.2` below Hardhat `2.29.2`. |
| `npm run ci:scan-secrets` | Exit 0. |
| `node --check scripts/tests/dependency-tooling.test.mjs` | Exit 0. |
| `git diff --check eb59d93cffed7848c4aac37d0e9650b87239c6da HEAD` | Exit 0. |
| `npm audit --json` before / after | **17 low -> 15 low**; both exit **1**, zero moderate/high/critical. Full audit is not clean. |
| `npm audit --omit=dev --json` before / after | **0 findings**, both exit 0. |
| `npm audit --omit=dev --audit-level=high` | Exit 0; original repository CI audit policy, unchanged. |

There are **36 executed suite cases** across the two disjoint test suites. No full-application,
browser, mobile, Tor, native-Anvil or full FHE fuzz result is asserted by this worker.
Anvil is absent from this environment. Those additional applicable integration/CI gates
remain the coordinator's responsibility; no assertion or threshold was reduced.

## Lock resolution and audit limits

An initial npm 11 `install --package-lock-only --ignore-scripts --no-audit --no-fund`
returned exit 0 but left the stale cookie resolution unchanged. Its receipt is retained and
it is not counted as remediation. The documented npm 10 targeted update resolved precisely
one record:

```sh
NODE_OPTIONS=--max-old-space-size=512 npm_config_maxsockets=1 \
  npx --yes npm@10.9.8 update cookie --package-lock-only --ignore-scripts --no-audit --no-fund
```

The final npm 11 clean install succeeded. No broad unlocked resolution or `audit fix --force`
was used. Final lock SHA-256: `beadafcce959f301fb812ae96e62ffc8f07440a9f0d8cbaaa9e8b05d36f59660`.

The removed audit nodes are `cookie` and its dependent `@sentry/node`; this is one advisory
root, not two independently demonstrated vulnerabilities. The remaining 15 low audit nodes
all derive from the existing Elliptic advisory. Published metadata observed by the coordinator
still lists Elliptic `6.6.1` as current; the advisory reports no patched version. The current
fhEVM plugin `0.4.2` requires Hardhat `^2.0.0`, so the suggested Hardhat 3 ecosystem migration
is a separate compatibility task. These development-only findings are retained as unresolved,
not waived or represented as unreachable. Registry audit data is a dated advisory snapshot.

Primary sources consulted:

- [Cookie upstream advisory and patched range](https://github.com/jshttp/cookie/security/advisories/GHSA-pxg6-pf52-xh8x).
- [Unpatched Elliptic advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84).
- Pinned npm package metadata and installed Sentry consumer source; exact metadata and lock records are in the worker evidence packet.

## Ownership, preservation and next steps

The original main history and all existing PR branches are preserved. Current minor dependency
PR #210 retains cookie `0.4.2`; broader major dependency candidates #87/#253 remove its graph
through substantially wider migrations. This isolated patch does not overwrite either lane.
The existing integration lease remains held by its previous owner; expiration never authorizes
takeover. This worker changed no remote ref, PR, lock, deployment or release.

The coordinator receives `cookie-dependency-evidence/`: command receipts with times, exit codes,
source/tree pins and raw-log hashes; baseline/final full and production audits; lock-preservation
proof; source patch; exact metadata; and a verified Git bundle. Capture that packet into the
single authoritative engineering ledger. Independently review the exact final source, run
hosted required checks, and only then consider integration after the existing lease is
reconciled. This handoff is not an independent approval, merge qualification or release claim.


## Source-preserving recovery — 2026-11-24 UTC

This section records the current isolated recovery. The 2026-11-21 qualification
above remains historical donor evidence, including its 722-package full install.
The current private installation contains 334 packages for one workspace.

| Role | Exact source |
| --- | --- |
| Current combined base | `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8` |
| Original #377 donor, preserved as merge parent | `d3c2228c53cbda4ee650ec91776af8bb1c02674d` |
| Ownership claim before product edits | `6e28590a9dc96a6aece3372dc84306ff1e25246e` |
| Qualified recovered source | `5a2038d6f5fd0e01f663a09d9dcaa75742754c07` |
| Qualified recovered tree | `445c977595f679857506f3eacee8825b2a563613` |

Worker `/root/historical_review`; coordinator `/root`. Branch
`integration/scoped-cookie-recovery-20261124` in
`/workspace/scratch/f80482f352bc/native-idb-ci`. The earlier F08 branch remains at
`b6c3c73d767df56e4119ff7b3918044f21d996ef`.

All three donor preimages match the current base exactly. The recovered root
manifest, lockfile and tooling test are byte-identical to the original donor.
Only the ownership registry conflicted: both complete ordered nonblank parent
sequences and multiplicities survive. Exactly one of 815 lock records changes;
all other 814 remain exact, including 222 nondevelopment non-link package records
(223 entries when root metadata is included). The original five tooling test
bodies remain an unchanged byte prefix. No application, contract, compiler
configuration, workflow or threshold changes.

The upstream cookie advisory still identifies versions below 0.7.0 as affected;
the recovered 0.7.2 pin remains a useful narrow correction to the existing Sentry
development graph. The actual consumer uses cookie parsing. No serialization
vulnerability reproduction or new adversarial test ran. The fresh full audit
omits cookie/Sentry while retaining the separate Elliptic-derived findings.

### Installation and actual resolution

Shared installations contain cookie 0.4.2; the existing cache had no 0.7.2 archive.
The exact archive was retrieved normally and its SHA-512 matches the donor lock.
To avoid exhausting workspace disk, a private
`/tmp/ghostpay-cookie-377-5a2038d6-uh9fv90v` directory received byte-exact snapshots
of all 74 manifests and the candidate lock. Read-only copies of all 334 required
archives were integrity-checked into its own cache. The normal command below
succeeded in 7.127 seconds, installing **334 packages** without changing snapshots:

```sh
npm ci --workspace @ghostpay/confidential-contracts --include-workspace-root \
  --ignore-scripts --no-audit --no-fund --prefer-offline --cache <private-cache>
```

This is a **workspace-only clean installation**, not full-repository `npm ci`.
Every installed non-link record matches the candidate lock's version, resolution
and integrity. Tests ran from the actual checkout using private module links;
the workspace link resolves to that checkout. Root, Sentry node and Sentry utils
resolve private cookie 0.7.2. No Node module-resolution flags, dependency-source
edits, old-cookie substitution, shared-cache mutation or unapproved cleanup.

Canonical private-install `npm ls` confirms
`Hardhat 2.29.2 -> Sentry 5.30.0 -> overridden cookie 0.7.2`, exit 0, no problems.
An earlier listing from the externally linked checkout reported extraneous-link
diagnostics; a stage listing with its workspace link targeting the external
checkout exited 1. Both are retained and not counted as clean-tree results. For
the canonical check npm's generated workspace link was temporarily restored,
then immediately returned to the source checkout. Package bytes never changed.
After testing, two whole-directory links became real ignored directories with
per-entry links; all twelve checked resolved module filenames stayed identical.
Both layouts are recorded. The worktree was clean before this docs-only handoff.

### Fresh qualification on the recovered source

| Check | Actual outcome |
| --- | --- |
| `npm run test:dependency-tooling` | 6 passed, 0 failed, 0 skipped |
| Contract workspace `npm run typecheck` | Passed |
| Contract workspace `npm run compile` | Native solc 0.8.28 compiled 36 Solidity files, Cancun target |
| Contract workspace `npm test -- test/router.test.ts` | 30 passed, 0 failed, 0 skipped |
| Canonical private-install `npm ls cookie @sentry/node --all`, workspace filter | Passed; expected overridden chain, no problems |
| `npm audit --package-lock-only --omit=dev --audit-level=high --json` | Exit 0, zero findings |
| `npm audit --package-lock-only --json` | Exit 1, 15 low Elliptic-derived nodes; zero moderate/high/critical |
| `npm run ci:scan-secrets` | Passed |
| Test-script syntax and base-relative whitespace checks | Passed |

There are **36 executed cases** across two disjoint compatibility suites. Runtime
was Node 24.22.3/npm 11.19.1, with a 512 MiB Node heap and only the private cache.
Compilation used the existing `GHOSTPAY_SOLC_PATH` setting and unchanged binary
`/workspace/scratch/efb8df2579c9/gp-foundry-tools/solc-0.8.28`, reported version
`0.8.28+commit.7893614a.Linux.g++`, SHA-256
`9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`.
Only local Hardhat mock/router operations ran; no deployment or real-funds action.

Independent reviewer `/root/ui_data_review` found no source blocker at the exact
qualified source/tree and checked donor preservation, all 334 installed records,
75 snapshot identities, consumer resolution, final link cleanup and diagnostic
limits. The reviewer reran no tests and changed no source. Source-pinned approval:
`/workspace/scratch/f80482f352bc/cookie-377-independent-review/REVIEW.md` and
`SOURCE_EVIDENCE.json` beside it.

Complete proofs, commands, durations, exit codes, raw output and hashes are in
`/workspace/scratch/f80482f352bc/cookie-recovery-qualification/`.
`qualification-source.json` summarizes the source-pinned results. The compact
`cookie-recovery-evidence.tar.gz` is 88959 bytes, SHA-256
`3a9ee6c67a2e78c842ba7d38ca2f926d55e7221c908c483023cb1806d36048d8`. It includes diagnostic outputs and the exact public cookie
archive, but no dependency trees or caches; retain it with the exhaustive report.

No full application/browser, full FHE fuzz or native Anvil suite is claimed. The
full audit is not clean. Fresh exact-final-head full repository installation and
applicable required hosted CI/security gates remain necessary before promotion.
This worker changed no root checkout, donor ref, remote ref, PR or deployment.
Product/test source remain frozen; only this handoff and the registry receive
this completion record.
