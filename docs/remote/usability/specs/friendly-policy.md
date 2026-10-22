# Spec: friendly policy accounts (ux-privacy)

## Requirements
- Data model `FriendlyPolicy`: destination, timeLockSeconds, spendLimits (token, symbol, decimals, limit|unlimited, window), optional allowlist, guardians + threshold, name.
- `validateFriendlyPolicy` returns issues (error/warning/info) and never throws. Mirrors policy-scheme: non-zero destination, time-lock 1 h to 30 d, limit > 0, window 1..2^64-1 for limited rows, no duplicate tokens, decimals 0-36.
- Allowlist and guardians are not part of the on-chain scheme (single destination, no guardian role): accepted as data, flagged `NOT_ENFORCED`; allowlist must contain the destination.
- Untrusted strings: symbols `[A-Za-z0-9$.-]{1,12}`; names/labels at most 40 chars, no control/bidi characters.
- `describePolicy` throws on invalid input; lines are marked `onchain` or `notEnforced`.
- `toSchemePolicyInput` yields plain inputs for policy-scheme (`unlimited` -> 2^256-1, window 0).
- No on-chain calls, no hashing.

## Acceptance tests (policy.test.ts)
Exact description strings; time-lock boundaries; every error code; duplicate detection case-insensitive; bidi/control rejection; not-enforced marking; mapping to scheme input; formatUnits round-trip property.
