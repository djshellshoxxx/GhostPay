# Wiring plan: ux-notify in apps/web

No UI is built in the package; this is the plan.

## Files / components
- `apps/web/src/notify/NotifyProvider.tsx`: creates one `NotificationQueue` with `now: Date.now`, `discreet` from settings (default true). Loads/saves `snapshot()` to local storage key `notify.v1` (try/catch; `restore()` result checked, discard on `ok:false`). Re-render on a subscribe callback after each mutation (wrap queue calls).
- `NotificationBell.tsx` (unread badge from `unreadCount()`), `NotificationPanel.tsx` (renders `list('inapp')`, text only, no HTML injection), mark-read on open.
- `ToastHost.tsx`: every ~15 s and on visibility change call `takeAlerts('inapp')`; show toasts. Timer lives in the component, not the package.
- `SettingsNotifications.tsx`: discreet toggle (default on), quiet-hours start/end (local time inputs converted to minutes; offset from `-new Date().getTimezoneOffset()`), warns that lock-screen text is always generic.
- OS notifications (only if user opts in via Notification permission): use `takeAlerts('lockscreen')` view `title`/`body` only.
- Scheduler glue: ux-schedule emits `ScheduledReminder`; on tick call `dueNotificationInputs(list, Date.now())` and `push` each.
- PWA: `scripts/gen-manifest.ts` calls `generateManifest` at build (fail build on `ok:false`) and writes `public/manifest.webmanifest`; settings option "Disguise app name" feeds `discreetIdentity` (requires reinstall; tell the user). `public/sw.js` (separate task) imports plan functions bundle: fetch handler calls `classifyRequest` and only then touches `caches`; `activate` deletes `obsoleteCaches`; `waiting` worker triggers `decideUpdate` and the UI shows an "Update ready" prompt (kind `update_available`) for `prompt`, applies on idle for `apply-on-idle`, never during send/sign flow (`inSensitiveFlow` from route state).

## State
Queue snapshot (local only), settings `{discreet, quietHours}`. No network.

## i18n keys
`notify.<kind>.title|body|bodyDiscreet`, `notify.<kind>.titleMulti`, `notify.multi.body`, `notify.lockscreen.title|body`, `settings.notify.discreet`, `settings.notify.quietHours`, `pwa.update.available|apply|later`, `pwa.offline.title|body`. English strings returned by the package are fallbacks; prefer keys + `args`.

## E2E ideas
1. Receive payment with discreet on: panel and toast contain no digits/0x; toggle off: amount and masked address appear, full address never in DOM.
2. Quiet hours: critical alert shows, normal alert appears after window.
3. Offline: go offline, navigate, see offline page; API calls fail without cached data; secrets URL (`/pay#...`) never present in Cache Storage.
4. Update: deploy new version mid-send flow, no reload until flow ends.
5. Reload restores unread count; corrupted `notify.v1` is ignored.
