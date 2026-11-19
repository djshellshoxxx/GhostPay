# Independent merchant-profile clock review — 2026-11-19

**Verdict: PASS for the narrow source repair and signed-profile regression.**
The full-package coverage attempt remains a recorded failure.
Reviewer: `contract_security`. Runtime source:
`67caefd2f0a696f115abbc61a7cfc7ccf923f731`; regression baseline:
`9f68917f1a3721a8d20d23002174a5094223ca20`; author evidence packet:
`34eee707030b6818021aa535af32d0f566f43bba`.

## Source and behavior

The audited main `14ded337a10c140d7a9f9a9238ec038587d925bb`, worker base
`8a2ce1da1507771935b88bdc91ecad9eb5c540cb` and regression baseline contain the
same original verifier blob, `a75124bb35d2c319e6936097ef6b4048ac59ec76`.
The repair changes only the expiry predicate and its parameter documentation in
`packages/invoice-schema/src/merchantProfile.ts`.

`Number.isFinite(nowSec)` rejects non-finite numbers and untyped non-number
values without coercing them. It runs after the existing shape and signature
checks and uses the existing `expired` failure reason. Size, format and signature
error precedence remains unchanged, as do the signature domain, schema, profile
authority and public result union.

Every finite numeric input retains the original `p.exp <= nowSec` comparison.
Negative and fractional seconds, epoch zero, negative zero and finite extrema
therefore retain their previous behavior. A profile expires at equality. No
integer-only constraint, nonnegative restriction, clock coercion or new public
error result was introduced.

The test commit adds 62 lines and removes none. Its fixture signs a separate
expired profile with the existing public test key. Both object and JSON inputs
first verify successfully before that profile's expiry and fail as expired at an
ordinary current time. The invalid-clock matrix therefore reaches a genuinely
valid signature; it does not obtain an expiry result by tampering with a signed
field. The entire regression file is identical before and after the repair.

## Recorded evidence

The original run has **26 failures and 37 passing controls** across 63 cases.
Of the failures, 22 accept the expired signed profile and four throw while
coercing a Symbol or a throwing `valueOf`, with both input encodings represented.
Positive infinity already returned `expired` and is a passing control. All 26
finite-value cases and the size/format/signature precedence control pass before
the repair.

| Author check | Exact source | Result |
| --- | --- | --- |
| Signed-profile regression baseline | `9f68917f` | 26 failed / 37 passed; exit 1, 2.618 seconds |
| Same complete merchant-profile file after repair | `67caefd2` | 63 passed, zero failed/skipped; exit 0, 1.451 seconds |
| Full package with coverage requested | `67caefd2` | 786 passed / 1 failed; exit 1, 494.182 seconds; no coverage report |
| Exact failed passphrase case, diagnostic only | `67caefd2` | 1 passed / 25 unselected; exit 0, 6.159 seconds; unchanged 60-second budget, without coverage |
| Package typecheck | `67caefd2` | Exit 0, 5.422 seconds |
| Package build | `67caefd2` | Exit 0, 2.331 seconds |
| Entire package source lint | `67caefd2` | Exit 0, 9.385 seconds |

The full run's sole failure is the unchanged passphrase test
`authentic but malformed plaintext gives typed errors (reachable only with the passphrase)`
timing out at 60,000 milliseconds. Its later isolated success is diagnostic; it
does not establish a passing full-package run or coverage result. The test, KDF
and envelope/signature/parser source remain unchanged. No assertions, timeout,
coverage threshold or test-selection default were weakened.

The coordinator separately ran the same complete merchant-profile file at
integrated source `9bec156622c4c606b97e7d43b1b6f12deff71063`: **63 passed,
zero failed/skipped**, exit 0, 2.113 seconds. Both runtime and regression bytes
match the reviewed author source. This overlaps the author's 63 cases; the
counts are not additional distinct tests. Its original receipt commit is
`d26a0b9c15539844f738d1f7aa80924c4234b65d`; the reviewed packet, with the
timeout wording clarified and identical raw artifacts, is pinned at
`3c6f81fe54d6f4f09354c9d647bbb1cf6bf053e6` in
[MERCHANT_PROFILE_INTEGRATED_20261119.md](../../completion/remaining-20261119/MERCHANT_PROFILE_INTEGRATED_20261119.md).

All **23 author artifacts** match their recorded digests, original bytes,
committed Git objects and author-worktree copies. The check also verifies both
author packet files, seven command receipts, 24 source records identified by
revision and path, 18 preserved paths, and four integrated-packet files. The
original audit patch retains its exact whitespace. The read-only verifier
returned PASS; the [verification result](evidence/merchant-profile-clock-cross-review-20261119/verification.json)
is archived beside it. The reviewer has not rerun application tests.

## Reachability and qualification limits

This closes the conditional caller-clock validation gap described by PR #266,
not an established remote exploit. The inspected production callers use local
`nowSec`, `nowSeconds()` or `services.nowMs()` dependencies in
`apps/web/src/lib/embedHost.ts`, `apps/web/src/lib/merchantTemplate.ts` and
`apps/web/src/components/MerchantProfilePanel.tsx`. No profile-controlled clock
path was established. Normal finite-clock callers were not shown to bypass
expiry. Signed profile verification still establishes field integrity, not
merchant identity or authority to alter an existing invoice.

The dependency manifests, coverage thresholds, test configuration and the three
caller files are unchanged. Dependencies were independent workspace copies;
there is no fresh-install claim. This review does not qualify browser or wallet
execution, public deployments, hosted CI, JSON-array validation or other owners'
features, and it does not change strict security gates.

The [machine record](MERCHANT_PROFILE_CLOCK_CROSS_REVIEW_20261119.json) pins the
source and archived evidence. Its
[read-only verifier](evidence/merchant-profile-clock-cross-review-20261119/verify.mjs)
checks existing Git objects and available original file bytes without executing
application tests or accessing the network. The author handoff is
[MERCHANT_PROFILE_CLOCK_20261119.md](MERCHANT_PROFILE_CLOCK_20261119.md).
