# Audit: ux-schedule

## Threat model
Assets: user funds (no custody here), correctness of amount/recipient, user trust in timing. Adversaries: tampered/imported templates or schedules, stale state after long offline, UI/state substitution between display and confirm, hostile or buggy clock/timezone resolver.

## Findings
| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1 | High (design) | Auto-send on due would let a stale or tampered schedule move funds | Fixed by design: only `due` items with `needsUserConfirm`; confirm needs explicit ack |
| 2 | High | Recipient/amount swap between display and confirm | Mitigated: confirm compares ack to frozen snapshot |
| 3 | Med | Payment surfacing after long absence | Max-age guard (default 7d), applies even without a tick |
| 4 | Med | Imports smuggling fields / huge lists / bidi text | Strict key allow-list, caps (200/500), control+bidi rejection, all-or-nothing |
| 5 | Med | DST double/zero fire | Local-to-UTC resolution with gap/ambiguity rules, strictly-increasing guard |
| 6 | Low | Month-end drift | Anchor day recomputed each month |
| 7 | Low | Float amounts | Amounts are digit strings only |
| 8 | Low | Unbounded iteration | Year cap 2200, count cap, interval caps |

## Evidence
120 tests: DST dates for 2026, month clamping, adversarial inputs, fast-check (round trip, monotonic).

## Unverified
- `TzOffset` correctness for real IANA zones (host-built); only a synthetic US 2026 zone is tested. Zones with transitions closer than 24h or offset changes other than DST are assumed handled by the +-1 day probe.
- Recipient format is not chain-validated here; callers must validate with chain adapters.
- Persistence integrity/encryption is host responsibility; no tamper detection of stored state (a local attacker who edits state could alter a snapshot).
- Weekly default maxAge/policy for materialized payments is fixed at 7d.
