# Spec: notify-queue (in-app notification queue, discreet mode)

Package: `packages/ux-notify` (`NotificationQueue`). Pure; clock injected via `now()`.

## Requirements
- R1 Fixed kinds with static templates; callers pass structured params only (amount decimal, asset ticker, address, sanitised label). Free prose is never accepted.
- R2 Dedupe: same `dedupeKey` while the original is unexpired (even if read) is ignored; a higher priority upgrades the original and re-arms its alert.
- R3 Coalesce: unread entries of the same kind + `coalesceKey` updated within `coalesceWindowMs` merge into one with `count`; window slides from last update; coalesced dedupe keys are remembered (max 20) so replays are ignored.
- R4 Priority low<normal<high<critical; list sorted by priority then recency. Low never interrupts.
- R5 Read/unread: `markRead`, `markAllRead`, `unreadCount`, `dismiss`.
- R6 Expiry: entry is gone exactly at `expiresAt`; coalescing extends it. `purgeExpired`.
- R7 Capacity (default 50): evict read-low first, then oldest; unread critical is protected from lower-priority arrivals (rejected `queue_full`).
- R8 Quiet hours: `{startMinute,endMinute,utcOffsetMinutes}`, wraps midnight, equal bounds = off. During quiet only critical alerts (`takeAlerts`); deferred entries alert once quiet ends. No Intl/timezone lookups.
- R9 Privacy: discreet is ON by default.
  - discreet in-app and ALL lock-screen output: static strings, no digits, no amounts, no addresses, no labels, no count, empty `args`.
  - non-discreet in-app: amount shown; address only masked `first6…last4`; address-like labels dropped.
  - lock-screen variant is generic in both modes (title configurable but must not itself look sensitive).
  - final `containsSensitive` guard falls back to generic text.
- R10 Snapshot/restore: params only; restore strictly validates untrusted storage, atomic (unchanged on failure), expired dropped, truncated to maxSize.

## Acceptance tests (notification.test.ts)
privacy rendering (all kinds, both modes, property test with random params); validation rejects (17 cases); dedupe/priority upgrade; coalesce window/kind/read rules; key bound; sort order; expiry boundary; capacity/eviction; quiet-hours wrap with +/- offsets; takeAlerts semantics; snapshot round-trip and 24 tamper cases.
