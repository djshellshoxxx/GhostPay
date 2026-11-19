# PR #246 scope comparison and independent source review

Reviewed 2026-11-19. PR: https://github.com/djshellshoxxx/GhostPay/pull/246. Head `28edbcf55093a6d6056232fd59ef37a2ae832b9a`, tree `987b5ff2ecf896b3ab407f9bd68bb58afecee427`, base `198aa5baff22272453733a0f3dcfcac0e0994eec` on the PR #238 branch. Comparison candidate: `435c6e6bca463f83b6c55a2063f8c18c546c3c22`.

## Scope result

The exact product-file comparison is recorded in `pr246-product-crosswalk.json`. This PR is mostly overlapping recovery work, not the missing #211 asset-coverage/multichain/focus delta. All twelve changed CLI source/test paths and the CLI README are byte-identical to the combined candidate. The #241 network isolation files, deployment Forge script/tests/gas snapshot, and cancellation lint fixture also match.

No policy asset-coverage, generalized multichain, focus, relayer or policy-client source path is added by this PR at the reviewed head. Its body explicitly says relayer, policy-client, quote-age and deployment-verifier recovery will be added after separate validation. Do not treat that future-work statement as code already present.

## Unique useful recovery

1. The three #220 confidential-contract files exactly reproduce source `cd54452991b9f4e193d98c1365b9dbc4eb838f3b`: router native forwarding, `ReturnBombStealth`, and the gas regression. The memory-safe CALL keeps the same validated recipient and value and checks the success bit, while requesting zero return-output bytes. It retains `nonReentrant`, the buffer cap and `NativeTransferFailed`; it does not cap recipient gas consumption or change the ABI. The mock expands the same recipient memory in both calls, isolating the caller-side copy cost, and the regression verifies both delivered transfers and the delta bound. No blocking source defect found. This is absent from the comparison candidate and is a justified focused recovery.

2. The two additional preflight paths validate the exact acknowledgment shape before shell command substitution can remove trailing newlines, and print the zero-fee diagnostic only for actual all-zero numeric input. The isolated 22-case test constructs a clean environment without RPC, sender or dry-run configuration; it includes wrong token, malformed/newline acknowledgment, zero/leading-zero/large fees, and invalid token/fee/cap. This retains the authority of the stricter checksum-validating Forge script and does not authorize deployment. No blocking source defect found. Recover the shell change and `scripts/tests/policy-predeploy.test.mjs` together.

The PR's handoffs describe failing-first and passing focused results, with whole-package heavy checks explicitly incomplete. Those author-reported results were read, not independently rerun here; raw external-workspace log files are not present in this review workspace. The confidential no-copy source/test blobs match the original historical objects, so its provenance can be checked directly.

## Overlaps to retain from the combined candidate

- Keep the candidate's hostile-text browser version: PR #246 has the same narrow beforeunload handling but omits the candidate's exactly-one custody-warning assertion.
- Keep the candidate's TRON range-completeness repair; PR #246 contains only the earlier network isolation variant.
- Reconcile the dependency-boundary receipt deliberately. Both forms enforce the same finite dependency closure; PR #246 calls hygiene/metadata pending owner review, while the candidate records its new narrow integration review separately from the previous milestone and pending list. Do not overwrite the source-review provenance by selecting a file without inspecting its explanation.
- The independent source branches and PR must remain preserved. A wholesale merge is unnecessary to obtain the five unique product/test files and would create avoidable overlap with already-reviewed source.

## Qualification boundary

This review performed no tests, installs, remote changes or deployment. A port needs a scoped provenance record and exact final-head hosted qualification. Existing core analyzer findings and confidential live-encryption limitations remain separate. No scanner suppression, budget reduction, assertion removal, release or deployment approval is recommended.
