# Hostile-text browser fixture review

Worker: browser_privacy. Branch: `chatgpt/ghostpay-tm-hardening-20261118`.
Local source before this fixture-only edit: `9edcfe310e4cee829ae68aab007adffb843388fc`.
Owned change: `apps/web/e2e/app.spec.ts`, only the existing hostile-text test.
Coordinator explicitly authorized this narrow acceptance-fixture correction.

## Regression evidence and diagnosis

The coordinator's source-pinned PR #238 full and lean browser logs both fail only
`hostile text in line items and memo is rendered inert`, on the first navigation
inside `openFresh`: `page.goto('about:blank')` returns `net::ERR_ABORTED`.
Reported counts: full 83 passed / 1 failed / 1 skipped; lean 71 passed / 1 failed /
3 skipped. Source under test: `198aa5baff22272453733a0f3dcfcac0e0994eec`.
These existing failures are the regression-first evidence; this worker did not
rerun the browser suites.

`generateKeys` types the backup waiver but does not verify a backup. The existing
`AppShell` beforeunload protection therefore remains active. This test installs
its own dialog listener and dismisses every dialog, cancelling its intended fresh
navigation. Installed Playwright 1.65.1 handles a dismissed beforeunload by
aborting navigation; its default handler accepts beforeunload when no user dialog
listener is installed. This explains why the other fresh-navigation fixtures
continue. This is an inherited fixture conflict with the existing key safeguard,
not evidence of a TM10 encrypted-default regression: `createInvoice` opts out of
encryption when `opts.encrypt` is omitted in this test.

## Intent and guard lifecycle

Keep the unexpected-dialog listener installed from initial seller-page load
through invoice review. Arm a one-use beforeunload allowance only immediately
before navigating the outgoing seller page to `about:blank`. A matching dialog
consumes the allowance synchronously and is accepted. All other dialog types,
extra beforeunload dialogs and dialogs outside this interval are still recorded
and dismissed. A `finally` block disarms the allowance before navigating to the
invoice, even if the blank navigation fails. Assert exactly one expected
beforeunload, then retain every existing hostile-text rendering, execution-marker,
injected-element and empty unexpected-dialog assertion.

No global helper or dialog suppression, caught navigation failure, skip, runtime,
custody, backup verification or key-lifecycle change. The repair permits the
existing full/lean TM browser acceptance suite to reach its security assertions.

## Validation boundary

Source review and whitespace-diff validation only. No local browser, heavy test,
build, lint or typecheck execution for this follow-up. Actual final-source full
and lean browser results remain coordinator-owned hosted qualification; this
note makes no executed-browser or passing-browser claim.
