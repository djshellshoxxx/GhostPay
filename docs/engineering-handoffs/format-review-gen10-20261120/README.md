# Amount parser candidate port and independent review — generation 10

## Outcome and ownership

The original PR #301 repair is suitable for a separately reviewed follow-up to the current candidate. The source review found no new blocker in its bounded two-file scope. The existing repository test suite reproduces two failures on the unchanged runtime, then passes all 12 cases after the original one-line guard. Scoped typed ESLint also passes. No integration, hosted qualification, deployment or release is asserted.

Worker: `/root/format_review_gen10`. Dedicated branch: `review/ghostpay-format-candidate-gen10-20261120`. Base candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6` (draft #302). Ownership claim: `660ddb9433a31b122069900a619ed9dcf9d15bc3`. The coordinator explicitly authorized this isolated port after the original main-based dependency mismatch was identified. The original PR and shared integration refs remain untouched.

| Source | Exact identity |
| --- | --- |
| Original PR #301 head | `7523da612ba365451f1d5c2dbc01d0bdeedbe8c7` |
| Original tests-first commit | `1e90047b17627f3f18446b2d9bcc0d73e345d4ce` |
| Original repair | `f49cd29b27766afe6cb42c07ab5cfd2d8b2e6f51` |
| Original author | sheldon, `127660907+djshellshoxxx@users.noreply.github.com` |
| Ported tests-only RED source | `d2d270edd0697fa5d2b2a6a39995db2e39ebbeed` |
| Ported repair and GREEN source | `eb969686fece9a1c89be38983b5cb4b0cae14bd8` |

Both original pre-repair files are byte-identical to the current candidate. The ported fixed implementation and test files are byte-identical to the original PR. [SOURCE.json](SOURCE.json) records these pairs and 13 unchanged configuration/control scopes. Exactly two non-documentation paths differ from #302: `apps/web/src/lib/format.ts` and `apps/web/src/lib/format.test.ts`. No independent behavior is attributed to this reviewer; the implementation and added regressions belong to the original proposal.

## Source review

`parseUnits` promises `undefined` for unexpected inputs but previously reached string trimming or a BigInt exponent before validating runtime parameters. The guard checks that the amount is a primitive string and precision is an integer in 0..36. This matches `formatUnits`' pre-existing precision domain. The regular expression, significant-digit limits, whitespace handling, fractional padding, bigint calculation and rejection of rounding remain unchanged. The guard returns before coercion for nonprimitive amount or precision inputs.

The inspected candidate has four production calls to this local helper: `invoiceCreate.ts` parses tax percentages at 2 digits, line prices at `fiatDecimals` (0 or 2), and fixed token amounts at native 18 or an allowlisted token's precision; `merchantTemplate.ts` parses requested fiat amounts at 0 or 2. All configured allowlist tokens have 6 decimal places. No inspected caller relies on precision above 36. Current callers already handle an `undefined` parse result. This source inspection establishes compatibility for those callers; it is not a browser-flow or financial-loss assessment.

The original tests retain all ten existing cases and add two regression cases with loops over eight invalid precisions and eight non-string amounts. They preserve controls for supported precision 0 and 36, the smallest unit at precision 36, and surrounding whitespace. On the unchanged runtime, the precision loop stops at 1.5 with `RangeError` and the amount loop stops at `null` with `TypeError`; later loop entries are not counted as independently observed baseline failures. The fixed run executes the complete loops successfully.

## Executed qualification

Runs used Node `v24.22.3`, the current candidate's Vitest `5.1.0`, original `apps/web/vite.config.ts`, one worker, and a 768 MiB Node heap. The 180-second external cap was never reached. No assertions, exclusions, timeouts, coverage thresholds or configuration were changed.

| Run | Result | Process duration |
| --- | --- | --- |
| Configuration startup attempt | Exit 1; missing `@ghostpay/chain-adapters` output; **zero cases executed** | 0.526 s |
| Unchanged-runtime baseline at `d2d270ed` | Exit 1; **2 failed / 10 passed**, one file | 0.781 s |
| Exact-source repair at `eb969686` | Exit 0; **12/12 passed**, one file | 0.941 s |
| Scoped typed ESLint, same repaired source | Exit 0; both changed files, unchanged project configuration | 8.691 s |

The regression command, from `apps/web`, was `NODE_OPTIONS=--max-old-space-size=768 node ../../node_modules/vitest/vitest.mjs run src/lib/format.test.ts --maxWorkers=1`. Scoped lint used `node ../../node_modules/eslint/bin/eslint.js --config ../../eslint.config.js src/lib/format.ts src/lib/format.test.ts` with the same heap bound. Exact commands, selected environment, source blobs, process results and lossless log hashes are in the paired result JSON and log files.

### Dependency and setup limits

The original PR targets main and uses lock blob `8ce2a5bb315cd84f45d3351131de0914337224ae`, including Vitest 5.0.5. The current candidate uses lock blob `539274d58048bc3edf066ca1a7891f247b2aea36`, including Vitest 5.1.0. The Vite, ESLint and web TypeScript configuration blobs match between them. These results qualify the exact source port in the **current candidate context**; they do not establish execution under the original PR's older dependencies.

A private dependency-copy preparation was refused before its target directory was created because the filesystem was full (`No space left on device`). This was a setup failure, not a failed test. The coordinator reclaimed only rebuildable completed-worker dependency copies. This reviewer removed no other worker's files.

The replacement uses a private `node_modules` directory with external package symlinks to the coordinator's candidate-identical installed dependencies, local workspace links, and private Vite caches. The first runner startup then exposed missing local package outputs. Three source-identical prebuilt package outputs—chain-adapters, core-crypto and invoice-schema—were copied, and all 150 output-file hashes were checked. [DEPENDENCIES.json](DEPENDENCIES.json) records source, lock identity, links and copied hashes. No package was installed or upgraded; no independent clean install or whole-library build is claimed. The initial startup failure remains in [STARTUP-missing-dist-result.json](STARTUP-missing-dist-result.json) and its lossless log.

No full TypeScript, full ESLint, aggregate coverage, browser, static build, hosted CI or whole-repository security pass is claimed for this follow-up. The original author's standalone 21-case and 1,500-roundtrip claims were read, not re-executed or combined with these 12 repository cases. The execution window was released after scoped ESLint completed.

## Handoff

The coordinator independently inspected the exact two-file port and the full parser/formatter module after the focused results; no additional source change was requested. Root owns publication and integration. Preserve the original proposal's attribution and the tests-first sequence. A stacked follow-up should target the fixed #302 candidate without changing its already-published code head. Recheck the original/source and target refs, obtain exact-head required qualification before integration, and retain source-specific limits. [HANDOFF.md](HANDOFF.md) identifies the concrete successor steps.
