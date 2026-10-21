# Audit: ux-fees

Scope: `packages/ux-fees/src/*` (cheapest, timing, preview, amount, errors). Self-audit by the implementing agent; not independent.

## Threat model
Assets: user funds (via wrong fee/recipient shown), privacy (timing, linkability), trust (hidden fees). Adversaries: malicious/buggy RPC or rate source supplying quotes; hostile token metadata (symbols); hostile relayer/manifest; a developer misusing advice as authority. Out of scope: signing path, on-chain enforcement.

## Findings
| # | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | Med | Fee recipient could be shown from an unverified source | preview blocks unless `recipientFromSignedManifest === true` and shape valid | Fixed (tests: 6 bad recipients, unsigned) |
| 2 | Med | Zero fee could be advertised where the fee is unenforceable, or on `direct` | no F-PAY line, explicit disclosure key | Fixed |
| 3 | Med | Quote rounding could understate cost | fiat rounds UP; checkout floor matches router | Fixed (rounding test) |
| 4 | Med | Stale/future quotes or rates steering the choice | age/skew checks, rates ignored with warning | Fixed |
| 5 | Low | Prototype-key native symbols (`constructor`) | `ownGet` own-property lookup | Fixed |
| 6 | Low | Hostile symbol (markup/homograph) in totals | ASCII allow-list regex, throws | Fixed |
| 7 | Low | Duplicate chain ids letting an attacker add a cheap duplicate | all copies excluded | Fixed |
| 8 | Info | Timing advice may be mistaken for a forecast | `limits` always non-empty; docs state it | Mitigated |
| 9 | Info | Waiting for a low-fee window can itself form a pattern | `avoidFixedSchedule` and jitter notes | Documented |

## Unverified / limits
- `DEFAULT_FEE_SCHEDULE` is a copy; drift guard is a text match against docs and chain-adapters source, not a differential test with the contract.
- Fee recipient is shape-checked only; EIP-55 checksum is not verified (no keccak allowed here). The UI/manifest loader must do it.
- `ChainFeeQuote` shape is inferred from chain-adapters types; chain-adapters has no single "quote" type, so the adapter hook that fills it is not written or tested.
- The sweep heuristic is not validated against real fee data; thresholds (25/75 %, 25 % trend, 3x volatility, 10 bps) are judgement calls.
- Cheapest-chain assumes the same token with the same decimals on all chains and ignores bridging, liquidity and recipient preferences beyond `supportedChainIds`.
- Native-mode comparison ignores the token fee (warned).
- No UI or accessibility testing; the wiring plan is untested.
- Numbers above `2^200` are rejected as sanity bound, not by protocol.
