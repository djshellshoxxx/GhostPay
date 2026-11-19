# Merchant profile verification clock

Task `RW-MERCHANT-PROFILE-CLOCK` repairs conditional Low finding `GP-AUD-208-01` from audit PR #266,
mapped by the coordinator to F-WEB-19, F-MER-05 and spec 14. The signed-profile verifier now rejects invalid runtime
clocks without coercion, while preserving every finite comparison and its existing error precedence. The full
merchant-profile file, package build, package typecheck and package lint pass. **The broader package coverage run
failed one unchanged passphrase timeout and remains unqualified.**

## Source, ownership and decision

Worktree: `GhostPay-merchant-profile-clock`; branch `chatgpt/ghostpay-merchant-profile-clock-20261119`.
Base: `8a2ce1da1507771935b88bdc91ecad9eb5c540cb`.
Author sequence: `4ea57693` (claim) → `9f68917f` (signed-profile RED) → `67caefd2` (runtime repair), followed by this
documentation-only evidence commit. Root already integrated the RED and repair separately; these original author
commits remain available for history capture. No final completion ledger was edited.

The audit source is `75dc9d3b29e3449b56e13889496c3771ec7c2f93`. Its observed merchant-profile source blob
`a75124bb35d2c319e6936097ef6b4048ac59ec76` exactly matches the original runtime in this task. The audit established
the comparison issue but had not executed a signed expired profile. This task supplies that missing regression.

The original audit proposed safe-integer/nonnegative validation and a possible format error. Root and the independent
reviewer explicitly chose the narrower contract-preserving repair: `Number.isFinite(nowSec)` at the existing expiry
predicate. The API did not require integer or nonnegative clocks, so finite negative, fractional, zero and extreme
numeric values keep their original results. No additional range restriction or result variant was introduced.

## Genuine signed-profile RED

The regression creates `signMerchantProfile({ ...body, exp: NOW - 1 }, KEY)` using the existing real signing function
and public deterministic test key. It does not mutate the expiry after signing. With `NOW = 1700000000` and signed
expiry `1699999999`, both object and JSON inputs verify at `exp - 1` and return `expired` at ordinary `NOW`.

At `9f68917f`, the complete file produced **26 failures and 37 passing controls**:

- 22 cases accepted the validly signed expired profile with invalid clocks, covering NaN, negative Infinity,
  undefined, null, numeric/empty strings, booleans, bigint, plain objects and coercible objects in both encodings.
- Four cases threw from Symbol conversion or a throwing `valueOf`, violating the verifier's no-throw contract.
- Positive Infinity already returned `expired` and remained a passing control.
- All 26 finite-value controls, the genuine-signature/normal-expiry control, and earlier size/format/signature
  precedence controls passed.

Original runtime bytes, exact regression source, audit diff, source hashes and the complete raw RED log are archived.

## Runtime repair

The only executable change is the existing final predicate:

```ts
if (!Number.isFinite(nowSec) || p.exp <= nowSec) return { ok: false, reason: 'expired' };
```

It still runs after size, shape and signature validation. `Number.isFinite` rejects non-number values without invoking
their coercion methods, and short-circuiting prevents the comparison from throwing. Valid finite clocks execute the
same comparison as before, including equality being expired. The existing result union and signature/domain/schema
remain unchanged; the JSDoc describes the runtime clock requirement.

Inspected callers are `embedHost.ts`, `merchantTemplate.ts` and `MerchantProfilePanel.tsx`. They supply local clock
dependencies such as `services.nowMs()` or `nowSeconds()`. No profile-controlled clock path was found. A finite but
inaccurate caller clock remains trusted as before: this repair does not authenticate wall time or prove a browser
exploit. No caller, pinned-invoice-signer, recovery, private-checkpoint or #265 JSON-array source was modified.

## Actual checks

All post-fix author checks below use exact source `67caefd2f0a696f115abbc61a7cfc7ccf923f731`, pinned Node 22.23.4,
a 512 MiB heap cap and the shared qualification mutex. Dependencies are independent copies with matching dependency
manifests; this is not a fresh `npm ci` claim. Test budgets, assertions and coverage thresholds were unchanged.

| Check | Actual result | Seconds |
|---|---|---:|
| Full merchant-profile RED, `9f68917f` | 26 failed / 37 passed, 63 total | 2.618 |
| Full merchant-profile GREEN | 63/63 passed, zero skips | 1.451 |
| Package runtime build | exit 0 | 2.331 |
| Package typecheck | exit 0 | 5.422 |
| Package source lint | exit 0 | 9.385 |
| Full invoice-schema coverage campaign | **exit 1: 786 passed / 1 failed, 787 total; 12 files passed / 1 failed** | 494.182 |
| Exact failed passphrase case, one authorized diagnostic rerun without coverage | 1 selected passed, 25 unselected; unchanged 60-second budget | 6.159 |

The full campaign's sole failure is `passphrase.test.ts`, “authentic but malformed plaintext gives typed errors
(reachable only with the passphrase)”, which timed out at its existing 60,000 ms budget. The campaign completed
without interruption or reset. It produced no coverage report, and no coverage percentages or full-package pass are
claimed.

The failed test, passphrase KDF, envelope parser, JSON parser and invoice-signing source are byte-identical to the
baseline. The failing path executes the existing scrypt fixture and passphrase parser, not `verifyMerchantProfile`.
Root authorized exactly one focused rerun under the unchanged budget. Its pass is diagnostic; it neither overwrites
the original failure nor qualifies full coverage. No further runs were performed after that diagnostic.

## Review, packet and freeze

Root and contract_security independently reported source PASS at `67caefd2`; contract_security also reviewed the
genuine RED failures and finite controls. Root's separately recorded integrated 63/63 check is overlapping evidence,
not 63 additional distinct cases. Final independent archive verification is recorded on the reviewer's branch.

[`MERCHANT_PROFILE_CLOCK_20261119.json`](./MERCHANT_PROFILE_CLOCK_20261119.json) records all seven command receipts,
23 archived artifacts, source/compiled-runtime snapshots, source-preservation hashes, original audit provenance and
qualification limits. Browser, public-network, wallet and external merchant acceptance were not run. Combined-head
hosted qualification remains coordinator-owned. This author branch is frozen after the evidence commit; no further
source changes are planned.
