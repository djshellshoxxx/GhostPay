# Private checkpoint browser assertion repair

## Problem and source

PR #262 at `c40b7581b9b996f33612186bc91960c65273cb64` retains browser test
blob `db9e79a1337f1d8bcc423d0fc28c51e36975ee23`. Its global exact-address
selectors match both a discovered payment's address and the same address in its
seller-signed receipt. This makes the visibility assertion ambiguous and makes
one-payment assertions report two elements.

The same test source failed both full and lean hosted runs on PR #248:

- [Full browser job 135425979506](https://github.com/djshellshoxxx/GhostPay/actions/runs/44480893086/job/135425979506)
- [Lean browser job 135425979061](https://github.com/djshellshoxxx/GhostPay/actions/runs/44480893086/job/135425979061)

Both jobs report two failed cases: recovered checkpoint discovery and concurrent
checkpoint-writer recovery. Their logs explicitly identify the two rendered
address elements. This is existing hosted failure evidence, not a new local run.

## Change

The four positive assertions now select `ul.matches > li` payment rows containing
the exact address. One row can contain the address and its receipt; duplicate
payment rows still fail the original count of one. Initial visibility remains a
strict single-row assertion. No `.first()`, increased count, relaxed timeout, or
skipped assertion is used.

The global zero-address assertion before revalidation remains unchanged. The
encrypted-storage/secret-absence checks, independent browser profile, concurrent
winner/loser behavior, and saved-row count also remain unchanged. No application,
storage, dependency, workflow, or threshold source changes.

## Independent review and verification

- Reviewed test blob: `e46026f905b73f5f9c43a366db7737118983d62c`.
- A separate reviewer matched the locator to the actual Scan `Matches` DOM and
  checked all retained assertions. No introduced blocker found.
- Reviewer executed full-file TypeScript syntax checking: zero diagnostics.
- Reviewer executed a strict helper-only semantic check against the installed
  Playwright types: zero diagnostics. This is not whole-web typechecking.
- `git diff --check`: passed.
- Local Chromium smoke could not start: `socket() failed: Operation not permitted`.
  It executed no browser assertions. An earlier smoke-harness import typo was
  corrected before this launch attempt; it was not a product failure.
- Full and lean browser reruns and applicable hosted checks remain required on
  the published source. The interrupted local execution environment and partial
  dependency builds are not passing build, lint, coverage, or browser evidence.

This focused follow-up targets PR #262's feature branch so its existing source
and qualification remain intact until the correction is reviewed and integrated.
