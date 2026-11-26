# Request-file hosted browser qualification — 2026-11-25

## Source and observed failure

- Worker: `/root` coordinator.
- Branch: `fix/request-file-browser-qualification-20261125-8812`.
- Published base: `39cece11afac78212d9f7331aeb1ab1a5fe8d427`, PR #688.
- Ownership claim: `01b6d94f`.
- Local implementation pin: `5fa157f509ca2e5bda198bf4b13e427273987bbd`.
- Initial hosted run: [45735675181](https://github.com/djshellshoxxx/GhostPay/actions/runs/45735675181).

Both browser profiles reached actual browser execution and reported the same five
failures. The app privacy-output case and three mobile camera-denial variants still
looked for the former exact `Scan an invoice QR` summary. The request-file cross-tab
journal case connected its mock wallet without handling the current wallet-disclosure
dialog, so its next `Prepare payment` action could not proceed.

The initial lean job [139628238899](https://github.com/djshellshoxxx/GhostPay/actions/runs/45735675181/job/139628238899)
reported 151 passed, five failed and four skipped. The initial full job
[139628238892](https://github.com/djshellshoxxx/GhostPay/actions/runs/45735675181/job/139628238892)
reported 163 passed, five failed and two skipped. Those results are failure evidence,
not a combined qualification pass.

## Bounded correction

Only three browser fixtures change, with seven added and two replaced lines:

1. The app privacy-output and mobile camera-denial fixtures use the current exact
   `requestFile.summary` English label: `Scan an invoice QR or open a request file`.
2. The request-file fixture uses the existing `approveWalletDisclosures` helper for
   both mock-wallet tabs, as the current shared payment journeys already do. That
   helper observes and clicks the real dialog; it does not replace the disclosure gate.
3. The fixture checks the displayed account-access and transaction methods in the
   first tab and account-access disclosure in the second. Its existing one-send,
   refused-repeat, zero-second-send, file-preview and final-review assertions remain.

Runtime code, all previous assertions, existing time limits, dependencies, workflows
and release settings remain unchanged. The source-only claim and this evidence record
are additive. Original donor refs are preserved.

## Local verification

The already prepared isolated request-file installation and built libraries were
reused; the published base has exactly the earlier reviewed local source tree.

| Command | Observed result |
| --- | --- |
| `npm exec --workspace @ghostpay/web -- eslint --config ../../eslint.config.js e2e/app.spec.ts e2e/devices-mobile-workflows.spec.ts e2e/payment-request-file-attempt.spec.ts` | Passed |
| `npm run typecheck --workspace @ghostpay/web` | Passed |
| `npm exec --workspace @ghostpay/web -- playwright test e2e/app.spec.ts e2e/devices-mobile-workflows.spec.ts e2e/payment-request-file-attempt.spec.ts --list` | 20 cases collected in three files; no browser bodies executed |

Local browser execution is still unavailable because the installed Chromium launcher
refers to a missing binary. It was not retried against that unchanged environment.
Independent source review and fresh combined hosted CI, including actual full/lean
browser execution, are required before integration. The parent coordinator will
record the canonical published pin and completed hosted results in PR #688.
