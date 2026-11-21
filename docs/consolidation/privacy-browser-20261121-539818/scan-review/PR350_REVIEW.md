# Independent source review: PR #350 router duplicate warning

Reviewer: `/root/scan_fix_review`, delegated by `539818ee134f-root`.
Review date: 20 November 2026 (Pacific).

**Decision: no blocking source or regression-design finding; 35 focused tests
pass.** This approves the bounded source change and records actual focused
execution, not a merge, a release, or unexecuted broader gates.

## Exact inputs

- Existing [draft PR #350](https://github.com/djshellshoxxx/GhostPay/pull/350):
  `89b3572f7e60cb6f5e5a0d7830632d1bb5f04dd8`.
- Source branch: `automation/20261121T0033Z/bug/router-duplicate-warning`.
- Base: `aec179910c39081d820396409ff3139ff2264132`.
- Independent local branch: `review/ghostpay-pr350-539818`.
- Runtime blob `apps/web/src/lib/scanMatches.ts`:
  `f82c8a31dfc162e7187ac61e49ee072caab29637`.
- Test blob `apps/web/src/lib/scanMatches.test.ts`:
  `0e11f5d427345a594b0e3354b664d23903070830`.

The complete base-to-head change comprises these two code/test paths, the
original additive ownership claim, and the original handoff. No dependencies,
workflow, cryptography, transaction, contract, RPC, or payment policy changed.
The relevant base source, test, and `ScannedAnnouncement` identity declaration
are byte-identical to their counterparts in integration PR #307 at
`5a745d4b5fba69b66a9779f88aefc63c253a4f27`.

## Source reasoning

`ScannedAnnouncement.id` is the existing stable `blockHash:logIndex` deduplication
key. Validation constructs it from a validated block hash and bounded log index.
`placeScanMatch` already uses this announcement identity when updating a match.

The correction retains one most recently observed announcement ID per lowercased
address. Once a different ID occurs for an address, the address is added to a
separate, monotonic `shared` set. Retaining every ID is unnecessary: any input
sequence containing two distinct IDs has a first transition between unequal IDs,
and that transition permanently marks the address shared. Later duplicates cannot
remove the warning.

Non-router entries remain excluded before either collection is updated. Case
normalization of addresses is unchanged. The function still does not mutate its
input, alter matches, combine payment amounts, select transactions, or authorize
signing. Its complexity remains linear in the number of input matches.

The live Scan consumer normally applies `placeScanMatch` before passing its
displayed list to this helper. Therefore this is a defensive warning-correctness
repair; this review does not establish a currently reachable browser defect,
financial loss, or security exploit.

## Retained controls and tests

The original two test cases remain unchanged. They cover router entries,
replacement of an earlier public replay, late replay suppression, independent
ephemeral keys, and router-only shared-address warnings.

Two new cases verify that a repeated announcement with a receipt-state update
does not warn, while a distinct announcement at the same address still warns in
both provided orders. The complete changed test file contains four cases.

Existing `Scan.test.tsx` includes both a two-card replay-upgrade case and the
explicit F1 warning case. The latter checks both retained router cards, the
shared-address notice, each per-record warning, and absence of a direct-payment
label. These existing consumer assertions should remain part of focused
qualification.

## Executed checks and execution boundary

The reviewer independently inspected the exact source, complete change list,
original and added tests, validated identity construction, and the actual Scan
consumer. Git whitespace verification passed after the additive review record
was formatted. No production or test source was changed by this reviewer.

The complete four-case helper file and the complete Scan consumer file passed
together: **35 tests across two files, zero failures, zero skips, exit 0**.
The run took 9.91 seconds. Source and tests retain their exact reviewed Git blobs.
No whole-web compiler, lint, build, coverage, or local browser pass is claimed
by this reviewer. Dependency builds and the earlier separate execution failure
are recorded below.

The bounded original-configuration command, from `apps/web`, is:

```sh
NODE_OPTIONS=--max-old-space-size=256 ../../node_modules/.bin/vitest run src/lib/scanMatches.test.ts src/views/Scan.test.tsx --maxWorkers=1
```

This targeted invocation is not the full web coverage gate. The package's `test`
script includes two sequential commands, so appending a file argument to
`npm run test` is not a reliable substitute for this explicit selection.

## Dependency provenance and bounded preparation

The exact source lock SHA-256 is
`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`.
An existing installation from the prior `9a4ab6c3d117` cycle has the same lock,
but its hidden installed-lock metadata is stale. That metadata was not accepted
as proof of dependency identity.

Instead, every present root `node_modules` package was compared byte-for-byte
with its cached package tarball after verifying the tarball's lockfile integrity
digest. All 647 present package entries and 44,635 files matched. Three archive
`.gitignore` paths appeared absent on the first check; their npm-installed
`.npmignore` counterparts contain exactly the same bytes. Twenty-four optional
platform package entries are absent. Seven nested relayer/contract-only package
entries are outside this root installation check and the web test selection.

The installation was reused with hardlinks for immutable dependency files. All
68 workspace links were rebuilt to this isolated checkout. Local Vite caches
were isolated; npm installation was not run on the shared hardlinked files.
Node is `v24.22.3`; repository Vitest is `5.0.5`.

The union of tracked package inputs and the shared TypeScript configuration was
compared against the donor's clean source. Twenty-six available output trees
were copied only where all package inputs match exactly. Six differing packages
were compiled from this checkout instead: `invoice-schema`, `chain-adapters`,
`payment-uri`, `qr-exchange`, `tron-adapter`, and `metadata-hardening`.

The following sequential invocation completed those six builds, then failed
with exit 137 during the redundant `core-crypto` rebuild invoked by the seventh,
previously missing `policy-scheme` package. The overall invocation is a failure;
its termination cause is not established by the exit code. No source, timeout,
compiler configuration, assertion, or dependency version was changed.

```sh
NODE_OPTIONS=--max-old-space-size=512 npm run build \
  --workspace @ghostpay/invoice-schema \
  --workspace @ghostpay/chain-adapters \
  --workspace @ghostpay/payment-uri \
  --workspace @ghostpay/qr-exchange \
  --workspace @ghostpay/tron-adapter \
  --workspace @ghostpay/metadata-hardening \
  --workspace @ghostpay/policy-scheme
```

The complete initial output is retained in [PR350_EXECUTION.json](PR350_EXECUTION.json).
`core-crypto` had already completed successfully twice in the
same invocation before the final redundant rebuild. The coordinator's privacy
branch outputs cannot substitute for the remaining policy build: both its
policy implementation and its `viem` version differ from this exact PR source.

After other compilation/test work stopped, the remaining policy package was
built successfully from its unchanged build configuration and already-built
dependencies, using a smaller heap and avoiding the redundant core rebuild:

```sh
NODE_OPTIONS=--max-old-space-size=256 node node_modules/typescript/bin/tsc -p packages/policy-scheme/tsconfig.build.json
```

This continuation exited 0. The subsequent original-config focused test command
also exited 0. Only resource scheduling and the process heap limit changed; no
test assertion, coverage threshold, timeout, configuration, source, or dependency
version changed. The execution record preserves commands, exit codes, input
identities, and all three complete output streams as lossless JSON strings,
each with its original SHA-256 digest. The successful compiler emitted no output.
The earlier failed build output is retained alongside the successful test output.

## Hosted observations

Exact-head workflow metadata was refreshed at 2026-11-21 02:39:50 UTC. The PR
remains open and draft with the unchanged reviewed head and base:

| Workflow | Observed result |
| --- | --- |
| [Pages 44845144758](https://github.com/djshellshoxxx/GhostPay/actions/runs/44845144758) | Successful |
| [Beta acceptance 44845144767](https://github.com/djshellshoxxx/GhostPay/actions/runs/44845144767) | Successful |
| [Hosting kit 44845144764](https://github.com/djshellshoxxx/GhostPay/actions/runs/44845144764) | Successful |
| [CLI qualification 44845144759](https://github.com/djshellshoxxx/GhostPay/actions/runs/44845144759) | Successful |
| [CI 44845144737](https://github.com/djshellshoxxx/GhostPay/actions/runs/44845144737) | Incomplete |

The earlier CI job collection, inspected before 02:32:10 UTC, showed `e2e (full)`
successful at job `136689372954`,
and `secrets-and-egress` successful. Lean E2E, web tests, compiler, lint, and
other required gates were still queued; contract tests were in progress. The
workflow summary had not yet advanced from queued. These observations are
source-specific and time-bounded, not a complete current required-check audit.

## Integration boundary

Leave the existing PR and source branch authoritative. The integration record
remains owned by the separate coordinator according to the root's fresh census.
This review acquires no lease and authorizes no remote or shared-target update.
Refresh source heads, ownership, and all applicable final-head checks before
composition. Any later combined candidate requires its own relevant qualification.

This is an independent AI-assisted source review, not an external security audit
or a submitted GitHub approval. No remote mutation occurred.
