# Hostile-text browser qualification repair

Requirement: restore the existing full/lean hostile-text acceptance test after
the separately implemented SEC-40 beforeunload key-loss guard. Source inspected:
`264cf86b` (application test matches #238 `198aa5ba`). The current #233 changed-file
list does not include `app.spec.ts`, `helpers.ts`, or `AppShell.tsx`.

The test installed a handler that dismissed every dialog, generated synthetic
seller keys without retaining a backup, then called `openFresh()`. Its first
navigation to `about:blank` correctly raises beforeunload. Dismissing that prompt
aborts navigation, producing the observed `net::ERR_ABORTED` in both full and lean
#238 jobs. The test never reaches its inert-text assertions in that failure.

The repair accepts only `dialog.type() === 'beforeunload'` in this one test.
Every other dialog remains recorded and dismissed. The original payment-heading,
literal-text, undefined `window.__xss`, injected-DOM count and empty script-dialog
assertions all remain. Application code, timeouts, fixtures, skip rules, backup and
privacy behavior are unchanged.

Independent review: `backlog_ci` reviewed the exact six-line change and ownership
on 2026-11-19 UTC. No source blocker; no executed browser pass was claimed by that
review. Root implements, reviewer is a separate worker.

## Execution

Command (Node 22.23.4, Chromium `/usr/bin/chromium`):

```sh
GHOSTPAY_CHROMIUM=/usr/bin/chromium GHOSTPAY_LOCAL_BUILD_PROFILE=full \
  npm run test:e2e -w @ghostpay/web -- e2e/app.spec.ts \
  --grep 'hostile text' --project desktop
```

Local result: **BLOCKED**, exit 1 because the configured webServer build's
TypeScript process exited 137 before a browser launched. This is not a browser
assertion failure or a passing test. The original hosted #238 failures are
preserved in `evidence/remaining-ci-20261119/pr238-ci-diagnosis.json`.
Full and lean hosted validation of the integration candidate remains required.
No assertion was removed and no timeout was increased.
