# F05 independent milestone review — 2026-11-20

## Verdict

**No blocking defect identified in the introduced offline receipt-review milestone.**
The original focused suite independently passed **62/62 tests in 2/2 files**.
After the coordinator corrected the format-consistency observation below, the
final focused suite independently passed **67/67 tests in 2/2 files**.
This review qualifies the bounded, unmounted adapter and import-session source;
it does not qualify the full F05 product, a browser workflow, or a proof provider.

## Reviewed source

- Reviewer: `future_features/f05_independent_review`, independently assigned after implementation freeze.
- Branch: `future/f05-ghostproof`.
- Product/test commit: `726d16dc560f8b12e4c71f6c04895fd1dcbd34f4`.
- Feature-directory tree: `32d0bf43dee013f921c7b304742dfe5de809585c`.
- Reviewed correction commit: `d44604ce463cec708c77a230b068f0ac44669280`.
- Corrected feature-directory tree: `1284c48c47cddaded1f6b762f397322edf1b28f4`.
- Documentation head at review start: `160acff6dfa40491d36aea151b0e7aa679f05307`.
- Main incorporated by the author: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.

Reviewed all introduced runtime modules, fixture/test files, the web manifest and
lockfile changes. Supporting source inspected: `packages/invoice-schema/src/receipts.ts`,
`packages/invoice-schema/src/json.ts`, and `packages/ux-receipts/src/{parse,verify}.ts`.
The coordinator had already checked that no existing open PR owns this feature
branch; this reviewer performed no remote mutation or new live-CI inspection.

Product code was read-only throughout. A comparison against the frozen product
commit found no later feature-source or manifest/lockfile differences at replay.
The coordinator subsequently made the two-file correction described below.
This reviewer changes only this report, the additive ownership records and the
handoff's correction summary; product code remains read-only for the reviewer.

## Findings by boundary

| Boundary | Assessment |
| --- | --- |
| Digest receipts | Uses the existing parser and digest verifier without a chain verifier. Success requires `self_consistent_unverified` and `not_checked`; the result never claims a signature, ownership or payment. |
| Signed receipts | Uses the existing domain-separated signature verifier. Valid signatures remain `signed_statement`; an embedded key remains distinct from a trusted signer. |
| Invoice binding | Uses the existing binding function for invoice digest, chain, asset, exact amount, and optional transaction/recipient. A supplied trusted key is a requirement; the invoice key is not a fallback for a different pin. |
| Invoice authentication | Reports caller-verified, not-verified, or not-checked separately. A matching external pin does not turn an unauthenticated invoice into an authenticated invoice. |
| Unsupported claims | Ownership, payment finality, audience-bound proofs and zero-knowledge claims remain unavailable. Existing receipt bytes cannot choose a new algorithm or verifier. |
| Input bounds | UTF-8 byte checking precedes strict JSON parsing. Digest receipts keep the lower character limit. Shared duplicate-field, nesting and numeric validation remain in use. Unknown receipt fields are refused by their existing format validators. |
| Public disclosure | Output contains immutable plain-text field pairs and explicit caveats. Redacted history is not reconstructed. Errors carry fixed codes and no imported values. |
| Caller context | Options and binding terms are copied before work; own-property accessors are rejected. The abort signal is an application-supplied lifecycle object, not a field loaded from the receipt. |
| Cancellation and supersession | Clear/dispose revoke the generation, remove the listener, abort owned work and clear state. Delayed digest completion cannot reinstall a previous review. A completed review is also cleared on the caller signal's abort. |
| Error cleanup | Invalid options, failed listener installation and unexpected verification exceptions have fixed results; the session can recover with a fresh import. |
| Ambient effects | No network-verifier port, fetch, wallet, storage or download behavior is introduced. Source search found no imports from production routes into this module. |
| Dependencies | The two manifest/lock additions declare the existing `@ghostpay/ux-receipts` workspace at `0.1.0`. No external version, integrity field, threshold or workflow changes. |

### Resolved observation: complete canonical binding strings

The initial review noted that `$`-terminated regular expressions can match before
a final line terminator, which is weaker than the intended complete canonical
binding-field check. Exact binding comparison still prevented a differently
normalized expected value from silently matching a receipt. No authority bypass
or payment effect was established.

The coordinator corrected the new F05 boundary in `d44604ce463cec708c77a230b068f0ac44669280`.
`matchesEntire` now compares the entire regex match with the input for canonical
invoice digest, asset, amount, signer key, transaction hash and recipient fields.
The configured trusted signer pin deliberately retains its existing trim policy,
followed by complete validation. Shared receipt-format source remains unchanged.

Independent delta review found the correction narrow and consistent with the
existing API. Five added cases check line-terminator forms across six binding
fields, and the final **67/67** existing-plus-added tests passed independently.
**The F05 observation is resolved.** No additional product change is requested by
this review. Broader provider-format changes belong to the provider owner.

## Independent execution

Run from `apps/web` using the normal repository Vite/Vitest configuration and
source-identical library outputs prepared by the coordinator:

```sh
NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/vitest run \
  src/features/future/ghostproof/review.test.ts \
  src/features/future/ghostproof/session.test.ts --maxWorkers=1
```

Original replay exit: **0**, 62 tests. Final correction replay exit: **0**, 67 tests.
The tests use real receipt signatures/digests and existing controlled
asynchronous seams. No new test or product code was written by this reviewer.

```text
RUN  v5.0.5 /workspace/scratch/db9ec5207fdd/GhostPay-f05/apps/web


 Test Files  2 passed (2)
      Tests  62 passed (62)
   Start at  08:24:24
   Duration  1.54s (import 42%, transform 39%, tests 18%, worker 1%)
```

Final correction replay at `d44604ce463cec708c77a230b068f0ac44669280`:

```text
RUN  v5.0.5 /workspace/scratch/db9ec5207fdd/GhostPay-f05/apps/web


 Test Files  2 passed (2)
      Tests  67 passed (67)
   Start at  08:28:56
   Duration  812ms (import 45%, tests 31%, transform 22%, worker 2%)
```

Final log SHA-256: `71f7cf1f41b5e612c8b58b0168d9f5a4bd996f826d6061d3c0ce66de54fca491`.

Elapsed test-run time is recorded execution output, not a device performance claim.
Test log SHA-256: `ce848a9f4194d68e8e469e0c2d95dd6f435139549846b9a9e611c56c77111060`.
The author coverage/type/lint evidence is documented in [HANDOFF.md](HANDOFF.md);
those checks were not independently rerun here. Whole-web TypeScript and typed
lint were reserved for the coordinator's serialized validation queue because
parallel heavy checks had already encountered OS resource termination.

## Remaining integration requirements

- The future UI must render disclosure values as text and display all assurance,
  trust, invoice-authentication and chain/freshness dimensions accurately.
- Its real lock/profile/session lifecycle must abort the supplied signal and discard
  copies of returned views. This module cannot revoke copies retained by a caller.
- File-size checks before file allocation, real browser lifecycle/accessibility,
  localized UI, P05 encrypted evidence, P12 proof generation and explicit export
  consent are still pending.
- Final combined typecheck/build, hosted checks and release gates remain separately
  required. No production route, deployment, wallet or chain transaction was tested
  or activated by this review.
