# GhostPay isolated consolidation follow-through — 2026-11-19

## Scope and source

Original base: PR #262, `c40b7581b9b996f33612186bc91960c65273cb64`.
Refresh base: PR #262, `cb7cfc9ec4f6c051e99805a25132c9458beb7af0`, tree `c58843c86dae5164eab259d3440aba01406bd593`.
The refresh retains all incoming canonical-array claims, documentation, evidence and two additional regression controls. The JSON runtime is byte-identical to the runtime used for the 22-case corrected run.
This branch stages three reviewed Pages-related repairs. It does not update an active coordinator branch or claim protected-main readiness.

1. **Canonical arrays:** retain #265's sparse/decorated-array regression, then snapshot own data descriptors before recursion. Reject accessor elements without invoking them. Do not call an input's map implementation or traverse its get/has traps. Ordinary dense arrays retain their canonical bytes; frozen, sealed, null-prototype and nonenumerable-index dense arrays remain supported. Object canonicalization is unchanged. This is a public programmatic-input correctness repair; no remote signature bypass or fund loss was demonstrated.
2. **Merchant clocks:** selectively recover the exact two merchant-profile files from #246 `509a800439f2feb6173b20d2543746c3d74e9a42`. Invalid runtime clocks fail at the existing expiry boundary. Size, format and signature error precedence and all finite-number behavior remain intact. Do not import #246's unrelated security/contract changes or #268's broader negative-clock/error-order changes.
3. **Scanner work avoidance:** use core-crypto's existing unsupported-scheme predicate before repeated announcement crypto. Valid scheme-1 and omitted runtime scheme behavior still use existing crypto; counting, progress, cancellation and memo behavior retain their shared paths. The original million-log corpus, assertions and 180-second timeout are unchanged. A full-corpus speedup has not yet been measured.

## Verification so far

| Check | Actual result |
| --- | --- |
| JSON regressions on unchanged candidate runtime | 11 failed / 11 passed, 22 total, original Vitest configuration |
| Canonicalizer source probes | 11 coordinator probe groups passed, including 1,000 seeded ordinary-JSON byte comparisons; independent reviewer also passed 11 source-probe groups |
| JSON focused corrected-source run | **22 passed**, zero failures, exit 0; 244.82 seconds under heavy environment pressure |
| Refreshed JSON test union | Preserves both new upstream controls; 24 cases by source enumeration, **not rerun** after the environment disconnected again |
| Merchant regressions on unchanged candidate runtime | 26 failed / 37 passed, 63 total, exit 1 |
| Merchant regressions on exact recovered runtime | 63 passed, zero failures or skips, exit 0 |
| Merchant package typecheck | Passed, exit 0 on the merchant worker snapshot |
| JSON package typecheck | Passed before the interrupted lint attempt; final combined/refresh typecheck remains required |
| Original typed lint attempts | Exited 137 under local resource pressure; a later direct invocation was interrupted, not passed |
| Scanner focused regressions and unchanged million-log corpus | Pending execution |
| Combined package coverage, final web typecheck/lint/build/browser | Pending execution |
| Independent source review | No introduced source blocker identified in the canonical, merchant or scanner changes; execution gates remain separate |

The source probes execute extracted TypeScript functions after erasing only type syntax; they are not Vitest, compiler, coverage or browser qualification. Fresh tests must qualify the combined source, not inherit results from the broad integration or other branches.

The execution environment disconnected during dependency setup and later recovered. Exact-lock invoice-scoped installation succeeded after reducing the Node heap. Shared filesystem exhaustion required moving only this task's downloaded dependencies to temporary storage and restoring normal node_modules layout. Setup failures and interrupted checks are not test passes. The execution environment disconnected again after the 22-case JSON pass. Further local checks could not be completed, so the source and regression work was preserved through the authorized GitHub connection.

## Provenance and integration disposition

- #238 is already an ancestor of #262.
- #256's strongest idle/session behavior and final test correction are documented as represented in #262. Do not bulk import it again solely because Git ancestry diverges.
- #267's three hosting source/test blobs already match #262.
- #264 is a separate broad integration, diverging from #262. It is not bulk merged here.
- #265 source reference: `c591b54078febcf24cba01b29bc173b2fac1f9cb`; the final array algorithm deliberately closes the remaining getter/map/Proxy traversal weaknesses.
- Merchant runtime blob: `35af2b07417916eca4d10e1e4f5584e171ece1dd`.
- Merchant regression blob: `31d40e8871a4d1a89c525d3361cb2922431c5c4b`.
- Unchanged scanner fuzz blob: `77ce0bd28772235418d9e241b0da84028068035f`.

Another coordinator's integration lock was held when this isolated branch was prepared. Shared tracking, protected integration/main, other workers' branches, deployment, release tags, fees, custody and guardian policy are unchanged.

## Remaining qualification

Run with the repository's original configuration and exact lockfile, using bounded serial workers where necessary:

- Invoice-schema full tests with existing coverage thresholds; build, typecheck and typed lint.
- Scanner regressions, existing scanner cases and the unchanged million-log corpus, then complete applicable web tests/coverage and nocov acceptance.
- Rebuild affected libraries before full and lean static builds; verify Pages artifact and browser flows.
- Recheck current source/head and required hosted checks before any integration.
- Preserve strict Mythril. Fresh #255 artifact at source `ea47fa75eabb0be2045081ffeb120fc2bfae67ab` contains 11 findings (3 medium, 8 low), not a timeout. This application-only work neither changes contracts nor approves findings. Artifact: https://github.com/djshellshoxxx/GhostPay/actions/runs/44476066945/artifacts/14509646188

Do not merge or claim release readiness while these applicable gates remain unresolved.

## Refresh verification

Only three paths overlapped when #262 advanced: the additive ownership registry and the two JSON files.
The refreshed tree uses the complete new base, then adds this branch's reviewed deltas. It preserves:

- `rejects a missing array index even when an extra key balances the count`;
- `preserves empty and frozen dense array bytes`;
- the common sparse/decorated-array regression exactly once;
- every incoming canonical-array receipt and ownership section.

The refreshed JSON runtime is exactly identical to the corrected runtime already exercised by the focused 22-case run and independent source probes. Additional inherited tests still require execution as part of final-source qualification. No passing result from an older source is relabeled as a full final-source pass.
