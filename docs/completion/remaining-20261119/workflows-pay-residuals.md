# Pay residual recovery from historical source

Historical requirement: `65392fcefefdb102bf71863d25f4a5ed9cd07e21`, #218 L3.
Nonce implementation: `617ae8b73afcd0834f14be17954fe84fb92391cb`.
Delay-label implementation: `36c66271d5ce491971339bbafbba0181609c66cd`.
Final test/lint checkpoint: `b69c5b91858da8d45491380b3354be54752ac4da`.

## Restored behavior

**LF-65392fcef-3:** the permit reader now requires exactly 32 ABI bytes before converting
a nonce to bigint. The prior implementation accepted short and oversized words and threw
a raw `SyntaxError` for an empty word. Malformed responses now use the existing fixed
`error.pay.yourRPCReturnedAnUnexpectedResult` descriptor. Canonical uint256 values,
including zero and the maximum word, remain accepted; permit signing semantics are unchanged.

**LF-65392fcef-4:** the existing delay label uses whole minutes for exact minute values
and one decimal place otherwise. A configured 90–150 second interval is shown as
“1.5 to 2.5 minutes”; the original rounding showed “2 to 3 minutes.” The formatter and
one label invocation changed. Scheduling, cancellation, signing and broadcast behavior
remain unchanged.

## Executed checks

| Check | Actual result |
|---|---|
| Nonce baseline | 4 malformed cases failed and 3 valid words passed on `a9267a67`. |
| Label baseline | After source-matching dependency builds, the strengthened regression first found the rendered delay control, then failed the exact text assertion. Its captured DOM shows the incorrect “2 to 3 minutes.” Source `617ae8b7` already contained the nonce-only repair; label runtime was unchanged. |
| Nonce and existing payment execution checks | 123/123 passed at `617ae8b7`, no skips. |
| Existing delay/buffer component describe | 14 passed at `36c66271`; 53 unrelated Pay tests were deliberately unselected. |
| Scoped web ESLint | 9 files passed at `b69c5b91`, in a separate web-only TypeScript process. |
| Quote fixture after removing unused binding | 10/10 passed at `b69c5b91`. The binding repair changes test arrangement only. |

The initial combined baseline attempt also encountered an unresolved package import in
the component suite. It is retained as setup evidence, not counted as a label regression.
The first exact-label failure was strengthened to wait for the generic control before the
text assertion, avoiding an ambiguous page-load failure. No timeout was increased.

The first completed web-only lint identified a real unused binding in the earlier quote
regression. Commit `d7667bcb` on the quote branch (`b69c5b91` here) replaces destructuring
with a fresh fixture copy and deletion of its optional heartbeat. Apply that equivalent
change only once. The final scoped lint and all 10 quote fixtures pass.

Node 22.23.4, Vitest 5.1.0 and the 768 MiB cap were used. Dependencies are independent
copies with the same lock; the missing Solana/TRON/transport outputs were rebuilt locally
because the coordinator's newer source trees differ. None of those package sources was
changed. All payment/provider interactions in these tests are controlled local fakes.

Whole-web typecheck remains a separate unresolved gate after the previous quote checkpoint
exhausted the local heap cap. These focused passes and scoped lint do not establish full
web coverage, browser acceptance or exact combined-candidate hosted qualification. The
coordinator independently reviewed both fixes and their baseline regressions and reported PASS. The review confirmed exact ABI-word admission with zero/max preserved, the existing fixed error, and display-only fractional labels with unchanged scheduling. Hosted qualification and release remain separate gates.

Exact commands, sources, timings, classifications and log hashes are in
[workflows-pay-residuals.json](workflows-pay-residuals.json); raw logs are retained in
[workflows-evidence/](workflows-evidence/).
