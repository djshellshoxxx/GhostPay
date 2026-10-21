# Audit: ux-notify

## Threat model
Assets: transaction metadata (amounts, counterparties, addresses), secrets in links, user's cache/storage. Adversaries: bystander seeing lock screen/screen share; malicious link/import supplying params; stale or poisoned SW cache; storage tampering; version skew bricking wallet.

## Findings
| # | Sev | Finding | Evidence | Status |
|---|-----|---------|----------|--------|
| 1 | High | Free-text label could carry a full address/amount into notifications | label sanitised; address-like labels dropped; discreet/lock-screen never render labels | Fixed, tested |
| 2 | High | Caching secret-bearing URLs (payment links with fragment/query) | default-deny classifier; fragments/secret queries/API/auth never cacheable; fast-check property | Fixed, tested |
| 3 | Med | Path tricks (`/assets/../api`, `%2e%2e`, `%2f`) bypassing API prefix | decisions made on WHATWG-normalised pathname; `%2f/%5c` rejected | Fixed, tested |
| 4 | Med | Tampered stored snapshot | strict schema validation, atomic restore (24 negative cases) | Fixed |
| 5 | Med | Auto-update during signing | `inSensitiveFlow` always defers | Fixed |
| 6 | Low | Manifest could request share_target/handlers (data inflow channels) | flagged as errors | Fixed |
| 7 | Low | Sensitive-key heuristic is substring based (`key`, `code`, `view`...) | over-blocks harmlessly; may under-block opaque short tokens | Accepted |
| 8 | Info | Snapshot stored unencrypted holds amounts/addresses in plaintext | wiring plan stores local only; consider secret-box if threat model includes disk access | Open |

## Unverified
- No real browser/SW/OS-notification testing; behaviour of platform lock-screen previews not verified.
- Wiring (React, storage, SW shell) not built or exercised.
- Home-screen disguise depends on browser honouring manifest names; icon still reveals the app unless a neutral icon is supplied.
- A user-chosen lock-screen title is only heuristically checked.
- `/* c8 ignore */` comments mark two unreachable defensive branches.
