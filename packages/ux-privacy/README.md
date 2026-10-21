# @ghostpay/ux-privacy

Pure logic, no UI, no network, no clock, no randomness. See `docs/remote/usability/`.

- `computePrivacyScore(facts)`: hygiene score 0-90 (never 100) from six plain facts, per-factor breakdown,
  caps, ranked advice, and mandatory honest-limits text. It never claims anonymity.
- `validateFriendlyPolicy`, `describePolicy`, `toSchemePolicyInput`: human-readable policy accounts
  (spend limits, time-lock, destination; allowlist and guardians accepted as data but reported as
  not enforced by the current on-chain scheme). Mirrors the factory rules of `packages/policy-scheme`
  (not imported, not modified).

Tests: `npm test` (vitest, thresholds 95/90/95/95).
