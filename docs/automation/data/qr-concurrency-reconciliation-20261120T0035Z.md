# QR concurrency reconciliation

## Final reconciliation addendum — 01:04 UTC

The five-case recommendation below describes #290 at aaa8a7e2. #290 later advanced to ec546311
and incorporated most overlapping tests. Final #295 at 4493793a retains only one added unverified
stateful-hook test and all eight flag combinations in the existing exhaustive mapping test.
Both author and fresh reviewer passed 54/54 at local 954152e2. The intermediate five-case patch
and handoff are archived under verification-20261120T0035Z as historical evidence.
The independent original comparison below is preserved unchanged.


Independent native reviewer: `/root/ci_and_consolidation_audit`. Read-only; no source/remote changes.

## Source pins

- Canonical existing follow-up [PR #290](https://github.com/djshellshoxxx/GhostPay/pull/290): `aaa8a7e2091e91f17b5c6f3ca6a9e7f8bc8f27da`, stacked on #278 `d74af79ebabdc8cead843361c3497b46d8c421f9`.
- This cycle's overlapping [PR #291](https://github.com/djshellshoxxx/GhostPay/pull/291): `17333ceda784ecdf5734a666ef57ee1d1e599296`, reviewed local product source `2df03bde3883439e7514a02c871db66ccffd83fd`, stacked on #285 `89942105c48df03b9351f777278b6a992e35a95e`.

## Runtime: duplicate

Fetched complete exact-head `qrKinds.ts` sources. After removing each version's single explanatory comment line, the files are exactly equal. Both add the same two primitive-string guards and preserve identical executable source, declarations, tables and TypeError messages.

- #290 runtime blob: `a85e1011cdface74c87683146ff7428654b7830d`.
- #291 runtime blob: `1a4beffc898c7854f6183aac5a7e6f74f8228d63`.

Do not import #291's runtime guard into #290 or #278. Preserve original branches and source-pinned evidence; the overlapping PR may be retired after its genuinely additional evidence is retained.

## Additional regression value

| Additional #291 coverage | Existing #290 coverage | Supplement |
|---|---|---|
| Throwing `Symbol.toPrimitive` getter for normal payload, unverified payload and frame | Stateful conversion functions are tested, but hook-property reads are not | Three cases proving the getter is never read and fixed error is retained |
| All 16 payload mappings with no flags, each single flag and combined flags; every frame class | Selected original valid controls | One exhaustive compatibility matrix |
| Stateful conversion hook with `unverified: true` | Stateful hooks tested for unflagged payload and frame | One unverified-policy case |

The broad malformed-value matrices overlap and need not be copied. Keep #290's matrix, including its null-prototype object and ordinary `toString` probes. Supplemental tests should add only the five cases above.

## Documentation and evidence

#290 already has the more complete runtime-contract guide, and its #278 base already corrected bearer-warning precedence. #291's guide edit is redundant.

#291's `QR_KIND_PRIMITIVES_20261120.md` is unique historical evidence: local test-first commits, commands, independent review and payments-disabled build provenance. Preserve it, accompanied by an explicit concurrency-reconciliation addendum. Its earlier statement that the follow-up was unique no longer describes the live repository. Do not transfer its old-source test/build results to a new supplementary head.

## Gate decision

A supplementary branch must start at a freshly verified #290 head and contain no new runtime guard or competing guide rewrite. Qualify the added tests against that base with repository Vitest/lint/type checking and independent review. Preserve external integration-lock ownership and all existing CI/protection/security restrictions. No merge, branch deletion, workflow retry or deployment was performed by this reviewer.
