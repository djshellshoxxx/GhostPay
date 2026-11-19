# Canonical array repair qualification

## Pinned integration

Base: `e74ddd26b75912d770e05d51f0b9229756adc649`.
Upstream PR #265: `c591b54078febcf24cba01b29bc173b2fac1f9cb`.
History-preserving merge: `7b2642768f9e4d2a3c631e47dbf6a4153d30d3c9`.
Reviewed product: `0f8dca27613fe9952cdb772cb10d05ced0f2b455`.
Branch: `codex/ghostpay-canonical-array-integration-20261119`.

The claim preceded code edits. Both frozen root and the original six-commit PR
history remain ancestors. The only merge conflict was the ownership registry:
the complete existing registry was retained and all nine upstream claim lines
appended. The upstream handoff is preserved unchanged as historical evidence.
Only `packages/invoice-schema/src/json.ts` and `json.test.ts` differ outside docs.
All package/root dependencies, configurations, scripts and thresholds remain intact.

## Confirmed behavior and exact reuse

The public `canonicalize` export used `Array.map`, which skips holes. Exact-source
Node 22 evaluation demonstrated a one-slot hole becoming `[]`, a middle hole producing
invalid JSON `[1,,3]`, and enumerable/nonenumerable/symbol extra array properties
silently disappearing. The actual upstream checked-in Vitest regression also failed
on frozen root source. Existing invoice signers validate and normalize first, and
receipt payloads reconstruct scalar fields; no signing bypass is demonstrated.

The upstream guard checks that own keys are exactly indices `0..length-1` followed
by intrinsic `length`, then keeps existing recursion. Its executable source is
unchanged here. The sole source variance from upstream is a real newline replacing
a literal `\n` typo inside JSDoc. All upstream assertions are retained.

Independent review identified a useful missing regression: a hole plus an extra
own key can preserve the expected key count. The added case must still reject,
exercising the ordered-key check. Added empty and frozen dense controls retain
exact canonical bytes; the upstream nested dense control remains.

## Executed checks

Commands, exact source/test blobs, environment and raw-log hashes are in `receipt.json`.
The two raw test logs are stored losslessly as gzip, including their original trailing
blank lines; both stored and uncompressed hashes are recorded.
All commands used Node 22.23.4, a 384 MiB Node heap, and original package/repository
configuration. Runtime checks used at most one test worker at a time. No root files or dist were changed.

| Check | Actual result |
| --- | --- |
| Exact upstream json.test against frozen root implementation | Exit 1: 10 passed, 1 failed; 654 ms |
| JSON, schema, signing and receipt test selection | Exit 0: 4 files, 200 tests passed; 3.53 s |
| Entire package TypeScript source/test check | Exit 0 |
| Entire package typed ESLint src check | Exit 0 |
| Original package production build | Exit 0; isolated clone dist only |
| Source whitespace check | Exit 0 |

The red result is **one failed Vitest test**: its loop stops at the first bad fixture.
The separate `exact-source-diagnostic.json` records five individually observed
baseline defects and three unchanged dense controls using the exact source modules
transpiled in memory. That diagnostic is not a package build or Vitest result.

The focused unit run did not request coverage. The full 14-file package test/coverage
script, including multiple real scrypt workloads, was deferred while root's full
web coverage ran. Its 95/90/95/95 coverage thresholds were not changed or qualified
by this focused selection. Consumer checks and final artifacts remain coordinator
work after integrating the qualified source; no new browser/release acceptance is
claimed here.

## Independent review and limits

`privacy_completion` reviewed exact product `0f8dca27`, source/test hashes, ancestry,
scope, array bounds/order, preserved assertions and actual red/green logs. Verdict:
**no introduced source blocker**. All execution remains author-attributed; the
reviewer did not rerun the checks.

This narrow repair covers sparse/decorated inert arrays. Pre-existing accessors,
proxies and custom inherited `map` behavior are not sanitized; a getter can mutate
later indices after validation. Cycles and unbounded input size also remain outside
this patch. No arbitrary-hostile-object or cryptographic-exploit claim is made.

No upstream PR was overwritten, and no remote mutation, deployment or mainnet action
was performed. The root checkout remained frozen throughout qualification.
