# Wiring: @ghostpay/net-harness

Test-only package. No production wiring. Edits needed elsewhere:

1. `packages/net-transport/package.json`: add `"@ghostpay/net-harness": "0.1.0"` to devDependencies (workspace) if the owner prefers it over copied helpers; `net-transport` tests currently copy the tiny helpers they need and do NOT depend on it (see net-transport wiring doc).
2. `apps/web/e2e/*` (AT-NP-1, extends `apps/web/e2e/app.spec.ts:49`): start `startHttpEcho` / `startSocks5Server` from a Playwright global setup (Node side) and assert the recorders saw only proxy/relay/same-origin traffic. The harness runs in Node only.
3. `apps/relayer` tests (AT-NP-20/21): devDepend on this package; point `upstream.transport` at `startSocks5Server({hosts})` and assert `records` (ATYP 3, credentials) plus `installPoisonedResolver().calls` is empty. Real egress denial (network namespace) is still needed for AT-NP-21 and is not provided.
4. Root `build:libs` order is unaffected (nothing imports the built output yet).
