# @ghostpay/ux-notify

Pure logic (no DOM, network, timers): in-app notification queue with dedupe, coalescing, priority, read/unread, expiry, quiet hours (injected clock) and discreet/lock-screen-safe rendering; PWA manifest generator/validator; service-worker cache-policy planner (default-deny, never caches API/secret URLs), offline-fallback and update/version-skew decisions; `ScheduledReminder` bridge type for ux-schedule.

Specs/wiring/audit: `docs/remote/usability/{specs,wiring,audit-ux-notify.md}`.
