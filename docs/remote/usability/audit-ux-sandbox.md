# Audit: ux-sandbox

## Threat model
Assets: real profiles/addresses/funds. Threats: user mistakes test for real (or reverse); test data leaks into real storage/exports; hostile faucet link; rate-limit bypass; resource exhaustion; corrupted persisted mode.

## Findings
| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1 | High | Visual mode could diverge from mode if stored | Fixed: derived only; `normalizeModeState` ignores supplied `visual` (test) |
| 2 | High | Test ids could be reused as real profile ids | Fixed: `toRealProfileId` rejects markers; `assertRealProfile` checks forged objects (tests) |
| 3 | Med | Oversized/deep object could hide markers from scan | Fixed: scan fails closed past depth 32 / 100k nodes (tests) |
| 4 | Med | Faucet bypass by rewinding clock | Fixed: negative elapsed treated as full cooldown (test) |
| 5 | Med | Faucet URL scheme/userinfo/fragment abuse | Fixed: strict validation; always `trusted:false` (test) |
| 6 | Low | rng returning wrong length/type | Fixed: validated, `invalid-rng` |
| 7 | Low | Unbounded accounts/txs | Fixed: caps (100 / 10 000 defaults) |
| 8 | Info | Brands are compile-time only; JS callers can cast | Mitigated by runtime guards, but only where the app calls them |

## Unverified / limits
- Marker detection is pattern-based (`test1`+32 hex etc.). A real address that collides with that format is astronomically unlikely but not impossible; formats are unlike any real chain.
- Nothing prevents the app from forgetting to call the guards; wiring plan lists mandatory call sites, an app-level lint/e2e is still needed.
- Real-data detection (`assertNoRealData`) relies on a caller-supplied predicate.
- Visual distinctness is a CSS concern, not testable here.
- A caller-supplied rng that is non-random only affects fake ids.
