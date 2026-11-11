# examples/

Small, dependency-free (workspace packages only) starting points for merchants. All data is fake. Specs: `docs/remote/usability/specs/`.

| Example | Needs | Status |
|---|---|---|
| `merchant-checkout/` | built `invoice-schema`, `merchant-hooks` | ran `--demo` against built packages (OK); `money.test.mjs`, `checkout.test.mjs` pass; not yet ported to `@ghostpay/sdk` |
| `webhook-receiver/` | built `merchant-hooks` | `selftest.mjs` passes (valid, replay, tamper, stale, duplicate, redelivery during handling, oversize, path) |
| `subscription-cron/` | built `merchant-billing`, `merchant-hooks`, `invoice-schema` | demo run OK (issue, idempotent second run, mark-paid, bad index); not run under cron |
| `pos-terminal/` | none at runtime (static); `merchant-hooks` for the parity test | `parity.test.mjs` passes; HTML/JS NOT tested in a browser |

Run from the repo root after `npm run build -w @ghostpay/invoice-schema -w @ghostpay/merchant-hooks -w @ghostpay/merchant-billing`. If `Cannot find package '@ghostpay/merchant-hooks'`, the workspace link is missing: run `npm install` once at the root (coordinator step). Node >= 22.
Never commit real keys, secrets or payment links; the payment link fragment is a bearer secret.
