# Transaction-field type validation

## Result

The previous RPC transaction parser converted the transaction hash and selected input/data field with `String(...)`. A JSON array containing the expected string could therefore satisfy submission verification. The repair captures each selected value once, requires primitive strings, then performs the same case normalization. Correct strings, empty call data, optional chain identifiers, and null/undefined input fallback remain supported. An unused fallback field is not read.

The parser uses the existing fixed, translated transaction-shape error. After broadcast, the consumer retains the original hash and submitted journal entry, does not query the receipt for a malformed transaction, and refuses another wallet send. This is an input-validation correctness repair. It does not establish that a consistently dishonest RPC is trustworthy.

## Source and authorship

- Fresh bug worker generation2 proved the three JSON-array cases and handed them off.
- Fresh generation3 worker preserved ownership and permanent regressions at `795a3892ded8a8d20aea67b2b88d69620a4afdf5`. Its turn ended before implementation.
- The root coordinator completed the same scoped task at `c344334d757db9ca51e107000b918fd23cc7397d`, preserving that worker's tests and attribution.
- Independent generation4 security review owns a separate worktree and report; its results are not asserted prospectively here.
- The earlier receipt-status repair at `f77fe857` remains unchanged.

## Actual verification

Original wallet and payment-execution suites on the regression-only baseline: **12 failed /125 passed**, zero skipped, exit1. The same two suites on the implementation: **137/137 passed**, zero skipped, exit0. Full commands, exact source hashes, and lossless original logs appear in `QUALIFICATION.json` and the adjacent gzip transcripts. Resource limits used one worker and a768MiB heap without changing project test configuration, assertions, test timeouts, or gates.

Tests include JSON arrays in hash, input and fallback data; non-string values; refusal to inspect coercion hooks; case normalization; valid nullish fallback; empty calldata; and post-broadcast hash/journal/no-resend preservation. JavaScript field getters and arbitrary Proxy behavior are not claimed to be isolated; normal network JSON does not contain those capabilities.

## Integration and fresh handoff

Integrate this branch only after its narrow independent source review. Then qualify the combined candidate using the original web typing, lint, coverage, static artifact, browser and hosted security gates. Preserve prior resource failures and source-specific results; do not add overlapping test counts. Original local privacy implementation remains actively owned by another run and is not part of this fix. No remote ref, production configuration, contract, fee, deployment, release or real-funds operation was changed by this implementation.
