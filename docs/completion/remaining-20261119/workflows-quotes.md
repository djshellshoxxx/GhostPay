# Trusted quote-age recovery

Implementation: `ea04605c55a7c00e5f6ff26dfab516a7c5c763e4`.
Regression checkpoint: `a7b5eb60`; isolated claim `7c6781c6`.
Base: reviewed CLI recovery on PR #238, `1ad4c9a3`.

## Recovered behavior and source

The quote lifetime is authored by the seller. It cannot be the only bound on the age of
oracle data accepted by the payer. Historical commits `365f017ac47c02734bf1f69ade4f28a8828e1cd9`
and `7aee9060b0361de5a8b053d54f0a3927fe4fda62` required a configured feed heartbeat plus a
300-second allowance to cap that lifetime (LF-365f017ac-1 / LF-7aee9060b-1 / TS-07 / #218 L3).
The protection was absent from both the current #218 head and the #238 integration base.

`readPrice` now accepts a trusted `heartbeatSeconds` value and uses the smaller of the
existing caller age and heartbeat plus 300 seconds. It validates the value before reads.
Pay requires a positive safe-integer registry heartbeat within the library's supported
range and passes it to the reader. Missing or malformed metadata produces a fixed critical
error before RPC. A shorter seller quote window remains enforced. The four testnet feed
addresses, quote protocol, and newer sequencer/reference/depeg guards remain unchanged.

The new error is classified as critical text. The four catalogs contain its fixed English
wording; existing draft-language fallback still requires native review. No translation
review or new network capability is claimed.

## Executed evidence

| Check | Actual result |
|---|---|
| Library baseline regression | 7 failed, 2 passed: stale data and malformed heartbeat were accepted. |
| Signed-invoice payment baseline regression | 8 failed, 2 passed: a day-long seller quote bypassed trusted feed freshness; missing/invalid metadata still reached RPC. |
| Corrected library quote and existing guard suites | 50/50 passed, zero skips. |
| Corrected Pay, Pay execution, quote-age and critical translation suites | 138/138 passed, zero skips. |
| Changed chain-adapters build | Passed before the web suite; web imports the rebuilt package output. |
| Whole chain-adapters typecheck | Passed. |
| Catalog check | 4 catalogs, 0 errors, 503 warnings; passes the original non-strict catalog gate. |
| Whole-web typecheck | Failed to complete: V8 exhausted the required 768 MiB heap cap, subprocess SIGABRT (-6), wrapper exit 250. No TypeScript source diagnostic; no static pass claimed. |
| Scoped lint | Process killed by SIGKILL (-9), wrapper exit 247 after 34.449s, with no ESLint source diagnostic. No lint pass claimed. |

All checks used Node 22.23.4 and the original test budgets. These are focused behavioral
checks, not whole-package coverage, browser acceptance or public-network verification.
The coordinator independently reviewed the runtime diff and regressions and approved source
integration. Combined-source parity and hosted gates remain separate.

## Completed split-project lint follow-up

Separate TypeScript-project processes avoided the earlier combined lint termination.
The quote source and heartbeat test pass library-only ESLint at `9f84fa8b` (runtime unchanged
from `ea04605c`). Web-only lint reached one actual issue: the earlier test fixture destructured
an unused heartbeat binding. Test-only commit `d7667bcb` (`b69c5b91` in the following Pay
residual branch) uses a fresh copy and deletes the optional property instead. Apply these
equivalent commits only once.

At `b69c5b91`, all nine selected web files pass ESLint, and the 10 quote-age fixtures pass
again. That source also contains the separately documented nonce and delay-label repairs.
The original combined lint failure remains in the log history; the subsequent scoped lint
gates pass. Whole-web typecheck is still unresolved after its heap failure.

## F-WEB-02: existing guards, missing verified configuration

The library already supports three opt-in protections: sequencer-up status after more than
3600 seconds of recovery; a fresh reference price within 1% of the lower price; and the
inclusive USD $0.98–$1.02 range for an intentionally configured USD-pegged asset. The
heartbeat repair preserves their implementation and regression suite.

The current saved evidence in `docs/chains/SOURCES-2026-11-04.md` supplies four primary
ETH/USD and USDC/USD proxy addresses, decimals and heartbeat values for Sepolia and Base
Sepolia. It supplies no verified same-chain sequencer address or independent second-source
configuration that Pay can activate. The current `createPayContext` caller supplies neither
`sequencerFeed` nor `reference` nor `enforceUsdPeg`.

To complete the consumer requirement, an owner must supply and authenticate the applicable
same-chain sequencer feed, plus an independent reference reader/feed with matching asset,
quote currency and chain, expected decimals and a trusted age limit. Independence of price
discovery needs evidence; another address by itself is insufficient. Each enabled real
input still needs fork/testnet acceptance. The optional library seam is not a Uniswap TWAP
implementation and does not provide the relayer's required signed `priceRoundId` protocol.
These blockers are explicit in `docs/specs/03-fiat-price-feeds.md` and
`docs/handoffs/agents/TEAM_D_PRICE_GATES.md`.

The separate `quote.maxSlippageBps` caller-policy gap (LF-365f017ac-3) remains open: the
historical source added only an unused helper, and the #218 lost-fix handover records
whether to enforce it as a product decision. This recovery does not claim all of spec 03.

Machine-readable commands, source identities, task mapping and log hashes are retained in
[workflows-quotes.json](workflows-quotes.json), with raw logs in
[workflows-evidence/](workflows-evidence/). No main merge, release or public-network readiness
is claimed.
