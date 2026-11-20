# Independent QR primitive-key verification

Reviewer: native ChatGPT worker `/root/qr_security_review`, separate from the root implementer.

## Source pins and scope

- Reviewed local implementation commit: `c7abdef110bf703ef3743b4cf6eea8c00d38e6f1`.
- Source base: published PR #278 at `d74af79ebabdc8cead843361c3497b46d8c421f9`.
- Fixed `apps/web/src/lib/qrKinds.ts` blob: `a85e1011cdface74c87683146ff7428654b7830d`.
- Fixed `apps/web/src/lib/qrKinds.test.ts` blob: `b0ceb8bbf584ead9f610471c57a3e7bc768a1c64`.
- Original runtime blob: `68de6518783cc57bd7f3a66d0588d530e27d21b6`.
- Original test blob: `e918e36848f4e01322afbdf41cf561b3222cc14a`.
- PR #285 at `89942105c48df03b9351f777278b6a992e35a95e` and PR #278 at the base have identical original runtime and test blobs. The original unknown/inherited-string repair is already incorporated. No duplicate integration is required.

The production delta adds primitive-string checks before the two own-property lookups in `qrKindClass` and `kindForPayload`. No classification map, warning, print policy, crypto, contract, dependency, workflow, permission or release-setting change is part of this repair.

## Finding and disposition

Severity: low, defensive API-boundary correctness. Confidence: high. Repair owner: root coordinator. Verification state: implementation independently verified; no merge or release qualification asserted.

Before repair, property-name coercion admits arrays containing valid names, boxed strings and coercible objects. A stateful conversion can return `keystore-backup` during validation and `invoice-link` during lookup, producing `shareable`; the frame equivalent can validate `secret` and return `qr-kind-shareable`. This was independently reproduced by importing the exact original TypeScript module after verifying its Git blob. That initial standalone probe used Node v24.22.3; it was not repository Vitest qualification.

Source inspection finds no demonstrated external-input path to these non-string arguments. `PaymentRequestQr` and `printQrPolicy` supply literal payload types; `kindForFamily` assigns literal types in its classification switch; current `QrFrame` callers supply literals or internally selected kinds. These boundaries limit the practical impact. No reachable remote exploit, fund-loss scenario or practical secret-warning bypass through current UI input is claimed.

The repair short-circuits before property conversion and retains the existing `TypeError` messages `unknown QR payload type` and `unknown QR kind`. The test-only label change adds diagnostic context to existing expectations; it does not remove or weaken assertions.

## Actual independent execution

Environment: Node v22.23.4 from `/workspace/scratch/fc8b0b472d30/toolbin`; repository Vitest v5.1.0; separate detached worktree at the reviewed commit. Original Vite/Vitest configuration, assertions, timeouts and thresholds are unchanged. Focused runs use one worker and disable file parallelism; coverage is not enabled or claimed for these focused selections.

The independent worktree links read-only dependency use to the coordinator's clean `npm ci` installation and completed library build. A `git diff --exit-code` check confirms identical package source, application source, configuration and package lock between the frozen review commit and the coordinator's later documentation-only state. Vite's original aliases resolve invoice-schema, QR exchange and portable vault source within the independent worktree.

### Supplied regression suite

Command from the independent worktree's `apps/web`:

```text
node ../../node_modules/vitest/vitest.mjs run src/lib/qrKinds.test.ts --maxWorkers=1 --no-file-parallelism
```

Result: exit 0, 1 file passed, **39 tests passed**, none skipped. Raw output: `qr-kinds-vitest.log.gz`.

An additional independent baseline check temporarily substituted only the original runtime blob in this worktree, ran the same 39-test suite, and restored the fixed blob in a `finally` block. Result: expected exit 1, **10 failed and 29 passed**. Both original and restored blob identities were asserted. Raw output: `qr-kinds-baseline-red.log.gz`. No root-worktree source was changed.

### Original consumer and UI regression selection

```text
node ../../node_modules/vitest/vitest.mjs run src/lib/qrKinds.test.ts src/lib/qrClassify.test.ts src/components/QrFrame.test.tsx src/components/QrFrame.security.test.tsx src/components/QrFrame.i18n.test.tsx src/components/QrFrame.largeWarning.test.tsx src/components/PaymentRequestQr.test.tsx src/components/PrintableBill.test.tsx --maxWorkers=1 --no-file-parallelism
```

Result: exit 0, **8 files and 119 tests passed**, none skipped; duration 16.45 seconds. Raw output: `qr-original-eight-files.log.gz`. This selection includes the 39 tests above, so the totals must not be added as distinct tests. It checks taxonomy and classifiers, valid UI rendering, reveal/hide behavior, warnings, translation, payment-request controls and print behavior. A jsdom navigation diagnostic appears in the raw output without a failed test. This is DOM-unit execution, not real-browser acceptance.

### Reviewer-authored adversarial probe

```text
node --experimental-strip-types /workspace/scratch/fc8b0b472d30/qr-independent-evidence/adversarial-probe.mjs
```

The probe checks the fixed source blob before direct import. Result: exit 0; **144 valid payload controls** (all 16 mappings with default flags and all eight flag combinations), **6 valid frame controls**, **87 malformed-input rejection assertions**, and **7 hook/proxy cases with zero hooks invoked**. Cases include symbols, numbers, BigInts, arrays, boxed strings, plain and null-prototype objects, functions, getters, coercion callbacks, proxy traps and a revoked proxy. The stable error class and message are asserted. Raw output: `adversarial-probe.log.gz`.

## Review conclusion and limitations

No introduced blocker found in this scoped repair. The exact source closes the reproduced non-string coercion gap, preserves all valid mappings and warning precedence, and passes independent baseline/fixed regression and consumer checks.

This review is a native worker review, not a human GitHub review or an external security audit. It does not qualify full workspace coverage, hosted exact-head CI, real-browser journeys, deployment, Mythril findings, transaction/recovery acceptance or main integration. The coordinator must preserve required policy, independent-qualification and integration-lock gates. No remote mutation, product edit, shared-ledger change, merge, deployment, release or real-funds operation was performed by this reviewer.

## Final test-consolidation addendum

This section extends the earlier review without replacing its source pins or counts.

Final reviewed local source: `53503b41e1b459e389b8b2d2696631a47bc2298c`, following test consolidation at `d1a9c9e41ba353b75740d0f0e0f516e40881a677`.

- Runtime blob remains exactly `a85e1011cdface74c87683146ff7428654b7830d`.
- Final test blob is `af5ef89f6fba0cea13b18884df387875f064ad34`.
- Independently inspected parallel PR #291 at `17333ceda784ecdf5734a666ef57ee1d1e599296`: runtime blob `1a4beffc898c7854f6183aac5a7e6f74f8228d63`, test blob `3eaea811d82c9a1913313fc1c0d587147b68fd16`.

The PR #291 runtime has the same executable code as this repair; only one comment differs. No second implementation was incorporated. The final tests preserve the existing #290 assertions and add useful coverage from the parallel candidate: zero, false, NaN, Infinity and plain objects; hostile `Symbol.toPrimitive` getters for payload, unverified payload and frame classification; all 16 declared mappings with default, individual and combined flags; and explicit `TypeError` constructor checks alongside exact message checks. The three hostile getter tests explicitly confirm that no getter is invoked. The earlier reviewer-authored probe independently exercises all eight flag combinations against the unchanged runtime blob.

### Final exact-source execution

Using the same independent worktree and original configuration at `53503b41`:

1. The same eight-file Vitest selection passed **133 of 133 tests in 8 files**, with no skips, exit 0, 13.36 seconds. This includes the final **53 taxonomy tests**. Raw output: `qr-final-eight-files.log.gz`.
2. Temporarily substituting only original runtime blob `68de6518783cc57bd7f3a66d0588d530e27d21b6` produced the expected exit 1: **13 failures and 40 passes out of 53 tests**. The three additional failures are the newly retained hostile getter cases. The fixed runtime was restored in a `finally` block and its exact blob verified. Raw output: `qr-final-baseline-red.log.gz`.
3. Full web typecheck passed, exit 0:

   ```text
   node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
   ```

   Raw output: `qr-final-web-typecheck.log.gz` (empty because no diagnostics were emitted).
4. Original typed ESLint configuration on both changed files passed, exit 0:

   ```text
   node ../../node_modules/eslint/bin/eslint.js --config ../../eslint.config.js src/lib/qrKinds.ts src/lib/qrKinds.test.ts
   ```

   Raw output: `qr-final-scoped-eslint.log.gz` (runtime proxy warning only; no lint diagnostic).

The intermediate `d1a9c9e4` test selection also passed 133 tests; its output is retained separately as `qr-d1a9-eight-files.log.gz`. Earlier 119-test results belong to `c7abdef1`; they are not represented as final-source results or added to the final 133-test count. Final result remains **no introduced blocker in the scoped repair and test consolidation**. Hosted CI, required repository reviews, integration-lock ownership, full release qualification and no-deployment requirements remain coordinator gates.
