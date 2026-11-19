# GhostPay isolated follow-through — 2026-11-19

## Scope and source

This draft adds two Pages-related repairs to PR #262:

1. **Canonical arrays:** snapshot own data descriptors before recursion. Reject sparse/decorated/accessor arrays without invoking element getters; do not call an input's map override or traverse its get/has traps. Ordinary dense arrays retain their canonical bytes, including frozen, sealed, null-prototype and nonenumerable-index variants. Object canonicalization is unchanged.
2. **Scanner work avoidance:** use core-crypto's existing unsupported-scheme predicate before repeated announcement crypto. Scheme 1 and an omitted runtime scheme retain existing behavior. Scanned counts, progress, cancellation and replay/memo behavior keep their shared paths. The million-log corpus, assertions and 180-second timeout are unchanged.

Original base: `c40b7581b9b996f33612186bc91960c65273cb64`.
First refresh: `cb7cfc9ec4f6c051e99805a25132c9458beb7af0`.
Qualification base: `155d009160a6e5b2c24a91705c72fc8cca6ce815`.
Publication base: `c7e09bc7cdb52e9172fa80fc2db83251fad6cd1a`, with the **identical** tree `e585d1dec43844bd18167f213c246994ea6c4397`.
Previous tested candidate: `fefcd57fb2397685a361dcbb9b9cf705efbfc17b`.
The current refresh preserves all incoming claims/evidence and the four JSON/scanner blobs tested at that previous candidate.

| Product file | Preserved blob |
| --- | --- |
| JSON runtime | `8ed01592d487c356a72d51e240e5cc63fb470a3a` |
| JSON tests, including both added upstream controls | `813286cc5317177fffcd5e7eac0a1907a45e5f9e` |
| Scanner runtime | `3ad466bae0d7d19187260e0696c0d29fb6a71293` |
| Scanner tests | `64d9d0d95a66da023f2968faa7bd97c7dbe66605` |
| Unchanged million-log corpus | `77ce0bd28772235418d9e241b0da84028068035f` |

## Merchant-clock conflict resolution

The newer coordinator base already imports PR #268's merchant-clock implementation. It rejects nonfinite or negative clocks at API entry with `format`. This differs from our earlier selective #246 port, which returned `expired` at the expiry check and preserved negative finite values and prior error precedence.

Keep the coordinator's two merchant files **exactly**. They are not part of this draft's remaining product delta:

- Runtime: `a4269dec888518799aa4b3e8cc82d2ff9cc21d77`.
- Tests: `a1299d9ceedefeefb5784d287d556008531af02f`.

The alternate #246 implementation's 63-case pass remains historical/source-pinned evidence. It is not acceptance for the retained #268 behavior. No mechanical union of the contradictory policies or assertions is attempted.

## Verification

| Check | Actual outcome and boundary |
| --- | --- |
| JSON original-runtime regression | 11 failed / 11 passed, 22 total, original Vitest configuration |
| JSON prior corrected focused run | 22 passed, exit 0; the final 24-case file also participated in the later full suite |
| Supplemental canonicalizer probes | 11 coordinator groups, including 1,000 seeded ordinary-JSON byte comparisons; independent reviewer separately passed 11 groups |
| Scanner original-runtime regressions | 2 expected failures / 1 passed / 18 filtered; observed 258 vs expected 1 crypto call, and 128 vs expected 0 before cancellation |
| Scanner corrected complete file | 21/21 passed on `fefcd57f`, exit 0; no skips |
| Unchanged million-log corpus | 1/1 passed on `fefcd57f`, exit 0, 65.62 seconds; original 180,000 ms deadline and assertions |
| Full invoice-schema coverage command | **Failed** on `fefcd57f`: 855 passed / 3 timed out, 858 total; 13/14 files passed; exit 1; 852.72 seconds |
| Core/invoice/chain-adapter dependency builds | Passed on `fefcd57f`, exit 0 |
| Refreshed JSON/current-base merchant selection | **32/32 passed** (24 JSON, 8 merchant), zero skips, exit 0; exact input blobs recorded |
| Refreshed invoice TypeScript | **Passed**, direct original `tsc -p tsconfig.json --noEmit`, exit 0 in 3.765 seconds with a 256 MiB heap limit |
| Refreshed original typed lint | Incomplete: invoice/scanner processes were killed at both 512 and 256 MiB settings, before rule diagnostics |
| Refreshed production web build path | Incomplete: address-safety dependency compiled, then BTC dependency TypeScript was killed with exit 137; web build was not reached |
| Independent source review | No introduced blocker identified in the two remaining product changes; semantic merchant conflict resolved by preserving the coordinator base |

The full invoice run failed the existing passphrase cases for re-encrypted altered invoices, authenticated malformed plaintext, and NFKC-equivalent passphrases. Each exhausted the unchanged 60,000 ms deadline. No final coverage percentage/threshold report was produced. Coverage thresholds remain 95/90/95/95 and **unqualified**. Deadline exhaustion is established; its ultimate resource/performance cause is not.

The scanner corpus has no matching baseline timing from this environment, so its result establishes deadline compliance without a quantified speedup claim. Supplemental extracted-function probes do not replace Vitest, compiler, coverage or browser qualification.

See `EXECUTION_EVIDENCE.md` and `receipt.json` for exact commands, source boundaries and sanitized log hashes. Full spy argument/buffer dumps are intentionally excluded.

The refreshed checks ran before publication on a working-tree overlay. The containing commit preserves the six recorded JSON/scanner/merchant blobs, original lockfile and configurations exactly. The execution environment disconnected after the final build attempt and subsequently reconnected; no interrupted check is relabeled as passed.

## Integration disposition

- #238 is already an ancestor of #262.
- #256's strongest idle/session behavior and final test correction are documented as represented in #262; do not duplicate solely because ancestry diverges.
- #267's three hosting source/test blobs already match the integration candidate.
- #264 is a separate broad integration and is not bulk merged here.
- #265's original sparse/decorated-array repair is retained and extended; both later upstream JSON controls are preserved exactly.
- #268's merchant implementation and all incoming ownership/evidence remain unchanged.

Only this isolated task branch is refreshed with a normal two-parent merge. Another coordinator owns shared integration. Shared tracking, protected integration/main, other workers' branches, contracts, fee recipients, recovery/guardian policy, deployments and releases are outside this work.

## Remaining gates

1. Resolve and rerun original full invoice-schema tests/coverage without weakening assertions, timeouts or thresholds.
2. Complete applicable instrumented web tests, nocov acceptance, full/lean static artifact and browser qualification.
3. Recheck live base/head and required hosted checks before integration; PR metadata can expose a stale base SHA, so compare the live branch ref.
4. Preserve strict Mythril. The fresh #255 artifact at source `ea47fa75eabb0be2045081ffeb120fc2bfae67ab` completed analysis with **11 findings (3 medium, 8 low)**. It was not an infrastructure timeout. This application-only draft neither changes contracts nor approves those findings. [Artifact](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476066945/artifacts/14509646188).

Do not merge or claim release readiness while applicable gates remain unresolved.
