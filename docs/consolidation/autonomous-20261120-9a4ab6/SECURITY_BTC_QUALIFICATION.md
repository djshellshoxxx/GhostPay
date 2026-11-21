# Bitcoin preview network guard: independent qualification

The existing #338 guard is reproduced and qualified on a source-preserving,
isolated successor of PR #307. It now rejects malformed or wrong-network
silent-payment addresses before presenting the sweep fee and amount preview.
The actual signing path already performs strict decoding; this correction does
not establish that wrong-network signing was previously possible.

## Exact source and reuse

| Role | SHA |
| --- | --- |
| Reviewed integration base | `5a745d4b5fba69b66a9779f88aefc63c253a4f27` |
| Existing #338 donor head | `692cac58b1c345137264936e60bee7b1e2eed8b2` |
| Isolated test-only checkpoint | `8ff918c634415bb42cebffdc18f6d59b19b95a1c` |
| Qualified application/test source | `cd5f01ff1d6fef2041654d213509d1a1ec3e0be6` |
| Runtime blob, identical to donor | `4bd08c0b56f7321e0ea06941e4f48e0659f66273` |
| Regression blob, identical to donor | `8ffcf80a6a37178fe36ada08340e58fb43926a17` |

The donor test commit `498a72ed` and runtime commit `0860e8fb` were separately
cherry-picked with `-x`, preserving their authorship and original commit references.
Only `packages/btc-silent-payments/src/spend.ts` and its new
`spend.preview.network.test.ts` are application/test contributions. The existing
decode function is reused, no new validation implementation is introduced, and
both final files preserve donor mode and bytes exactly. Main's #334 fee-cap
change belongs to the separate `metadata-hardening` package and is not a
dependency of this correction.

Before edits, the branch-census worker compared all 111 open PRs at their exact
head/base SHAs. Only #338 changed these two paths. That existing PR remains the
authoritative feature PR; this work creates qualification evidence and a local
integration contribution, not a competing implementation.

## Actual execution

All results below belong to the exact composition above. Full commands,
timestamps, exit codes, raw output text, byte lengths and verified SHA-256 hashes
are retained in [SECURITY_BTC_QUALIFICATION.json](SECURITY_BTC_QUALIFICATION.json).

| Check | Result |
| --- | --- |
| Unchanged runtime plus donor regressions | **3 expected failures / 1 passed control**: both network mismatches and malformed silent-payment prefix were accepted. |
| Corrected focused regressions | **4/4 passed**, zero skips. |
| Original complete package coverage command, default concurrency | Killed with **exit 137** before case results; not a pass. |
| Same complete coverage command with `--maxWorkers=1` | **563/563 passed**, **33/33 files**, zero failures/skips. |
| Statements / branches / functions / lines | **97.80% / 95.86% / 98.44% / 99.46%**. Original thresholds remain **95% / 90% / 95% / 95%**. |
| Original package typecheck | Passed. |
| Original package build | Passed. |
| Original typed lint with 768 MiB old-space cap | Killed with **exit 137**; retained as a failed execution. |
| Same original typed lint with 384 MiB old-space cap | Passed, zero errors; one existing unused-disable warning in generated `scan/proto/indexing_server_pb.ts`. |
| Source/configuration/object inspection | No dependency, configuration, workflow, threshold, assertion or timeout change. Both contributed file blobs/modes match #338. |

The focused four-case set is included in the 563-case set and is not added to it.
The Node heap caps and single-worker retry constrain resource use; they do not
relax any test behavior or gate. Source stayed unchanged between attempts.

Execution used Node 24.22.3 and npm 11.19.1. The coordinator reused installed
third-party dependencies only after matching 76 manifest/configuration inputs
and checking no nonoptional lock paths were missing. Worktrees have distinct
workspace directories; this package has no GhostPay workspace dependency and
needed no prebuilt sibling libraries. This was dependency reuse, not a fresh
installation or a new vulnerability scan.

## Independent review

`/root/branch_recovery` independently approved the exact two-file composition.
The reviewer checked requested-network HRP binding, canonical case/checksum/
version/point validation, decoder placement before fee arithmetic, absence of
new secret or network access, valid fee controls, and preservation of regular
address and signing paths. No blocking finding was identified. The existing
`previewSweep` `@throws` documentation omits decoder-specific errors; this is
nonblocking documentation debt and does not change runtime behavior. The
reviewer performed source checks, while this worker executed the tests.

## Remaining boundaries

This is local package qualification and independent source approval. A future
combined integration head still requires its own applicable hosted checks and
browser/Pages qualification. No previous donor workflow result is substituted
for this new composition. No live-chain, external-wallet, hardware or physical
mobile acceptance was run here. The broader key-recovery findings are in
[SECURITY_RECOVERY_REVIEW.md](SECURITY_RECOVERY_REVIEW.md).

No shared integration ref or occupied lease, release, deployment, custody,
fee policy, signing authority or network-enablement setting was changed.
