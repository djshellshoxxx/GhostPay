# Audit: ux-fiat

## Threat model
Untrusted: rate quotes (cache/API/user paste), source labels, user-typed fiat text, locale-supplied separators/symbols. Goals: no misleading fiat figure, no float drift, no crash, no network.

## Findings
| # | Sev | Finding | Evidence / Fix |
|---|-----|---------|----------------|
| 1 | High (mitigated) | Poisoned zero/negative/huge/tiny rate shows wrong value | `parseRate` rejects; tests `rejects %s` |
| 2 | Med (mitigated) | Stale/future-dated quote presented as current | `classifyAge`; stale withheld by default; future invalid |
| 3 | Med (mitigated) | Wrong-pair quote applied | `rate-mismatch` check in `computeFiatView` |
| 4 | Med (mitigated) | Bidi/control chars in source label or separators spoof display | `isSafeLabel`, separator validation |
| 5 | Med (mitigated) | Silent rounding of user input | `parseFiatInput`/`parseUnits` reject excess precision |
| 6 | Low | Reverse conversion direction ambiguity | rounding arg required; docs say ceil to cover, floor to cap |
| 7 | Low | DoS via huge digit strings | length/magnitude caps (30 int, 18 frac, 78 digits, 100 chars input) |
| 8 | Info | `symbol` is passed through unescaped; UI must render as text | wiring plan |

## Unverified
- No real-world locale tables checked (caller supplies data); Indian grouping covered only by unit tests.
- Fiat decimals per currency (e.g. JPY=0) are caller-supplied, not verified.
- Rate source trustworthiness/authenticity is out of scope (no signatures); jump check is heuristic.
- Mutation testing not run.
