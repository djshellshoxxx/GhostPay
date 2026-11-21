# Independent Pages artifact verifier review

Date: 2026-11-19. Reviewer: final Pages consolidation worker `key_exports`, independent of the PR #276 author.

## Scope and disposition

PR [#276](https://github.com/djshellshoxxx/GhostPay/pull/276), exact head `f39a9dd36c09f8b02d937c5f3d19676d334976d6`, adds a standalone artifact checksum verifier, its adversarial tests, and the original author's handoff. These three files merged without a conflict at `de5686afc0248a1a60cf4171ed79f9565eac1539`. Both parent histories are preserved; the merge base is `8f56376427c96881f49590920ff0bf8543ec81b4`.

**Disposition: suitable for integration.** This independent review found no blocking defect within the documented extracted-artifact and trusted-checksum use case. The verifier and original tests were retained byte for byte. No application, dependency declaration, lockfile, workflow, release condition, or assertion was changed. This disposition qualifies the bounded change; it is not a demonstration or testnet release verdict.

The branch also contains the preceding dependency qualification evidence at `576cd3f5fa8317154f92031970b9362d43a7eede`. A normal merge can retain both the dependency evidence and PR #276 ancestry.

## Exact source

| File | Git blob |
| --- | --- |
| `scripts/pages/verify-pages-artifact.mjs` | `b13870688d722fe5928ed192499ae76be55554ee` |
| `scripts/pages/verify-pages-artifact.test.mjs` | `341e14cfd555a8db44eba8861458b682dedd54ff` |

`RESULTS.json` records source hashes, the unchanged existing site verifier, commands, environments and outcomes. Compressed logs preserve the exact original output; their uncompressed hashes are included. `SHA256SUMS.json` hashes every committed evidence file.

## Independent tests

All checks below used Node v24.22.3 at the merge source above.

| Check | Actual result |
| --- | --- |
| Original PR verifier test file | **6 passed**, 0 failed, 0 skipped; exit 0 |
| First complete Pages tooling glob, before dependency preparation | 96 passed, **5 failed**, 0 skipped; missing modules, not qualified |
| Complete unchanged Pages tooling glob after dependency preparation | **101 passed**, 0 failed, 0 skipped; exit 0 |

The six original test groups cover intact exact-commit artifacts; altered, missing and extra files; unsafe, duplicate, unsorted and noncanonical checksum records; symlinks; required files and source mismatch; and real CLI success/failure/usage exit codes. The six are included in the 101-test result and must not be counted twice.

The first complete tooling run lacked `js-yaml`, `@playwright/test` and the built `@ghostpay/invoice-schema` package in this new worktree. Its five failures are retained. The corrected environment used read-only third-party links to the coordinator's fresh clean install, an invoice-schema link to this worktree's own package, and copied compiled output after all 33 tracked invoice-schema files matched the coordinator's source byte for byte. No dependency was installed or changed by this review, and the coordinator's node_modules tree was not mutated. The byte comparison is preserved in the evidence directory. This is a bounded tooling test, not a fresh full build of this worktree or browser execution.

## Security and integration review

The new verifier uses Node built-ins and performs no network request, shell execution, archive extraction, application import or key access. It enumerates the extracted artifact, rejects unsafe names, symlinks and special files, requires `.nojekyll`, `build-info.json` and `index.html`, checks canonical sorted checksum records, rejects duplicates and any missing or unlisted file, and hashes raw file bytes. With `--expect-commit`, the full expected commit must match the hashed build metadata. Reported problems cause a failing CLI exit even when some files verified successfully.

`verify-pages-site.mjs` remains necessary. Its content, CSP, relative-resource, secret-pattern, lean-module, testnet-manifest and mirror-banner checks are separate from artifact byte integrity. A correctly checksummed artifact can still contain unsafe content. Neither tool was substituted for the other. The existing Pages test glob includes the new test without a workflow edit.

Trust and operating limits remain explicit:

- Obtain SHA256SUMS independently from a trusted release/workflow. A checksum file served alongside a compromised site cannot establish publisher authenticity; this verifier does not check release signatures or attestations.
- Verify an already extracted, stable local directory. The implementation does not provide hostile archive extraction or an atomic snapshot against a concurrent local filesystem writer. Enumeration and hashing are separate filesystem operations.
- Resource consumption scales with directory inventory and file sizes. This review does not claim exhaustive hostile-volume bounds or portability beyond the Linux/Node environment exercised.
- The PR author's older source/artifact verification is historical evidence. This reviewer did not relabel it as a fresh artifact or a deployed demonstration.

## Reproduction and next gate

With the repository's qualified dependencies and libraries built, run the original commands:

```sh
node --test scripts/pages/verify-pages-artifact.test.mjs
node --test scripts/pages/*.test.mjs
```

For the release coordinator's final artifact, retain the separate site-safety gate and run:

```sh
node scripts/pages/verify-pages-artifact.mjs /path/to/extracted/site /path/to/trusted/SHA256SUMS --expect-commit FULL_ARTIFACT_SOURCE_SHA
```

The path and commit placeholders must refer to the actual artifact and independently trusted checksums. Current-source full CI, final artifact verification, hosting approval, deployment smoke, testnet acceptance and required external review are not supplied by these local tooling results.
