# Independent review — #377 scoped cookie recovery

**Decision: approve the source for composition. No source blocker found.**

Reviewed source: `5a2038d6f5fd0e01f663a09d9dcaa75742754c07`  
Reviewed tree: `445c977595f679857506f3eacee8825b2a563613`  
Comparison base: `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8`  
Original donor: `d3c2228c53cbda4ee650ec91776af8bb1c02674d`  
Reviewer: `/root/ui_data_review`, 2026-11-24 UTC.

This review used the pinned Git objects, existing qualification receipts,
private installation on disk and read-only module-resolution inspection.
It did not rerun tests, change dependencies, edit a repository or mutate a
remote reference. Final combined hosted checks remain required.

## Source and lock preservation

The three product paths are exact donor postimages, including file modes:
`package.json`, `package-lock.json`, and
`scripts/tests/dependency-tooling.test.mjs`. The base and original donor are
both ancestors of the reviewed merge. The other two paths are the additive
work registry and original, explicitly source-pinned historical handoff.

The manifest adds only the exact-version-scoped override
`@sentry/node@5.30.0 -> cookie@0.7.2`. Exactly one of 815 lock records changes:
`node_modules/cookie`, whose version, archive URL and integrity move from
0.4.2 to 0.7.2. Its development-only classification, license and engine metadata
remain unchanged. All 814 other records and top-level lock metadata are
identical to the base. The unchanged nondevelopment/non-link count is **222
package records**, or **223 records when root metadata is included**.

The five existing top-level dependency-tooling tests are preserved byte for
byte; one ordinary compatibility case is appended. The added case exercises
the actual Sentry request extractor and preserves encoded, empty, quoted and
first-occurrence cookie values, absent headers, and existing middleware values
and identity. Installed `@sentry/utils` calls `cookie.parse` in that path.
The test does not initialize Sentry or transmit a request. No application,
contract, compiler selection, workflow or acceptance threshold changes.

## Installation and actual consumer resolution

The saved successful command is a normal, private
`npm ci --workspace @ghostpay/confidential-contracts --include-workspace-root
--ignore-scripts --no-audit --no-fund --prefer-offline` with its private cache.
It installed **334 packages**. This is a root-plus-one-workspace installation;
it is not a full-repository installation and does not qualify lifecycle scripts.

I independently compared all **74 staged manifests plus the lockfile** with
the reviewed Git source. I also checked the generated installed lock: its
334 non-link records all match the candidate's version, resolved URL and
integrity. The 335th installed record is the workspace link. The cookie archive
matches the candidate lock's SHA-512 integrity, and all five installed cookie
files exactly match that archive.

Read-only `createRequire(...).resolve(...)` inspection under normal Node
resolution confirmed that the checkout root, `@sentry/node` and actual
`@sentry/utils` consumer all resolve the private cookie **0.7.2**. Hardhat resolves
Sentry **5.30.0**. There were no custom resolution flags or `NODE_OPTIONS`.
The reviewed executions used private checkout root/nested module links and a
workspace link targeting the source checkout. The author subsequently replaced
whole-directory links with ignored directories of per-entry links solely for
local bookkeeping. The separate receipt preserves all twelve checked resolved
module filenames exactly. I independently rechecked the root, Sentry and utils
cookie resolution after that cleanup: the same private filenames, realpaths and
0.7.2 version remained. This is not a new installation or a new runtime test.

The canonical private-install `npm ls` receipt exits zero and contains the
expected Hardhat → Sentry → overridden cookie chain without problem entries.
Earlier source-checkout extraneous-link diagnostics and the retargeted-stage
`npm ls` exit 1 remain saved. They are not counted as successful logical-tree
qualification. Returning the workspace link to its generated layout for the
canonical metadata inspection does not change package contents; the actual
consumer-resolution evidence and runtime receipts use the tested source layout.

## Qualification evidence reviewed

| Existing check | Verified receipt |
| --- | --- |
| Private workspace clean install | Exit 0; 334 packages; exact source manifests and lock retained |
| Dependency-tooling suite | 6 passed, 0 failed, 0 skipped |
| Confidential-contracts typecheck | Exit 0 |
| Confidential-contracts compile | Exit 0; 36 Solidity files; Cancun |
| Existing router suite | 30 passed |
| Production lock audit | Exit 0; zero findings |
| Full lock audit | Exit 1 retained; 15 low findings; zero moderate/high/critical |

The generated compiler build-info independently confirms 36 inputs and solc
metadata `0.8.28+commit.7893614a`, consistent with the unchanged native-compiler
configuration, recorded compiler path and successful compile log. Raw log hashes
match their receipts. These are the author's existing executions, not new
reviewer test runs. The dated lock audits do not establish a clean full
development graph.

The original donor handoff remains byte-exact and describes its historical
722-package installation at its old product SHA. That number must not be used
as a current full-install claim; the current source's evidence is the 334-package
workspace installation above. No browser, live RPC, Tor, production transaction,
native-Anvil or full-FHE result follows from this review.

## Remaining acceptance and evidence

The source is a bounded, compatible development-dependency correction suitable
for the coordinator's combined candidate. The original exact Sentry version is
part of the override contract and should be reconsidered if that parent changes.
Fresh applicable hosted checks on the combined candidate remain the acceptance
gate. No additional source repair is requested.

`SOURCE_EVIDENCE.json` records immutable pins, preservation checks, installation
boundaries, independently observed resolution and SHA-256 hashes for reviewed
raw receipts in `/workspace/scratch/f80482f352bc/cookie-recovery-qualification/`.
