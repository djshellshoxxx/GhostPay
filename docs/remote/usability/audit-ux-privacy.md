# Audit: ux-privacy

## Threat model
Inputs (facts, policy objects, imports) are untrusted; outputs are rendered by the UI. No network, keys or storage here. Risks: misleading the user about their privacy, injection through labels/symbols, invalid policies that make funds unrecoverable.

## Findings
| # | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | Medium | Score could be read as an anonymity guarantee | Cap 90, neutral band names, `limits` always returned, tests | Mitigated |
| 2 | Medium | Allowlist/guardians could be mistaken for protections | Not in on-chain scheme; flagged `NOT_ENFORCED`, lines marked `notEnforced` | Mitigated |
| 3 | Low | Text injection via names/symbols (bidi, control chars, markup) | Strict regex/length validation, tests | Mitigated |
| 4 | Low | NaN/Infinity/negative facts | Safe-integer checks with bounds, tests | Mitigated |
| 5 | Low | Mixed-case addresses not checksum-verified (no keccak dependency) | Warning `CHECKSUM_UNVERIFIED` | Accepted; policy-scheme re-validates strictly |

## Unverified
- Scoring weights/tiers are judgement, not empirically calibrated against real deanonymisation research.
- Policy limits are copied from policy-scheme constants (not imported); drift is possible if the contract changes.
- Wiring plan not exercised in a real UI.
