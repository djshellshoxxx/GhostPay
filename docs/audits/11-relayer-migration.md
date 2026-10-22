# Relayer migration disposition

Source: `origin/claude/inspiring-fermat-vxv689` at `c1c4ac9`, unique relayer commit `6f25385` after merge-base `cccc303`.
The source changed the relayer's config and service architecture substantially. This migration retains the target branch's
`@ghostpay/relayer-guard` `GuardedBreaker`, `LossBudget`, monotonic clock, metrics, and on-chain manifest read-back.
Compatible hardening was ported into that architecture; source-only tests were adapted to target interfaces.

## Behavior carried forward

- Daily-budget reservations now retain their UTC day tag. A delayed receipt from yesterday cannot release today's reserve.
- Quote tokens use canonical `v2.<keyId>.<expiresAt>.<fee>.<mac>` tokens. A previous verify-only key supports one quote-TTL rotation window.
- Secret files reject symlinks, permissive modes, and unexpected owners. Production environment secrets require an explicit opt-in.
  Quote keys are checked against the hot signing key, and process-level failures emit only a fixed error class.
- Alert webhooks accept HTTPS public hosts and validate every DNS answer again at connect time; private/mixed answers are refused.
- Sweep admission reads token balance, allowance, and nonce before simulation. The relayer simulates twice, checks the actual gas
  estimate against the configured cover percentage, and applies a gas-price movement cap before sending.
- `feeTo` must be explicit and differ from the hot key by default; zero and precompile recipients are rejected. Operators may
  opt into the hot key explicitly with `allowFeeToHotKey`.
- Rotating-salt refresh runs while idle and is stopped through `Relayer.dispose()`. The existing privacy/proxy documentation was
  corrected to describe the current `trustedProxies` behavior and webhook data.

## Source-path disposition

| Source path | Disposition |
|---|---|
| `apps/relayer/DEVIATIONS.md` | Updated compatible quote, secret, and webhook notes; retained target architecture details. |
| `apps/relayer/Dockerfile` | Kept target guard package copies; clarified that secrets may be root-owned or service-owned. |
| `apps/relayer/PRIVACY.md` | Adapted: trusted-proxy selection, timed salt rotation, aggregate metrics, and request-data-free webhook behavior. |
| `apps/relayer/README.md` | Adapted: v2 quote rotation, secret handling, safe fee recipient, gas checks, and `trustedProxies`; did not copy source-only config names. |
| `apps/relayer/deploy/ghostpay-relayer.service` | Added `LoadCredential=` handoff for secret files and optional rotation guidance; did not copy unverified sandbox directives. |
| `apps/relayer/relayer.config.example.json` | Added safe gas defaults and replaced the precompile fee recipient with a non-precompile example address. |
| `apps/relayer/src/abuse.ts` | Already existed in target; retained as an unwired helper. The service continues to use the loss-in-wei `LossBudget`, not source failure-count budgets. |
| `apps/relayer/src/alerts.ts` | Ported public-host validation and connect-time DNS filtering while keeping target `AlertSink.send` and payload interfaces. |
| `apps/relayer/src/api.test.ts` | Updated token format assertions; added balance/allowance precheck, double-simulation, gas-move, and fee-cover tests. |
| `apps/relayer/src/breaker.ts` | Not copied: source breaker is superseded by `GuardedBreaker` in `@ghostpay/relayer-guard`. |
| `apps/relayer/src/budget.ts` | Ported UTC reservation-day protection and `remaining`/`currentDay` accessors. |
| `apps/relayer/src/chain.test.ts` | Adapted for `readOrderState` and actual gas estimate results. |
| `apps/relayer/src/chain.ts` | Ported balance/allowance/nonce reads and the base gas estimate alongside the padded gas limit. |
| `apps/relayer/src/clientip.ts` | Already existed. Kept separate from guard's trusted-proxy/rate-limit implementation; reused its IP normalizer for webhook checks. |
| `apps/relayer/src/config.test.ts` | Added gas default/override, hot-key fee recipient opt-in, precompile rejection, and production-secret tests. |
| `apps/relayer/src/config.ts` | Added compatible `gas` controls and `allowFeeToHotKey`; preserved the target's `verifyTextManifestSignature` alias and existing schema names. |
| `apps/relayer/src/e2e.anvil.test.ts` | Existing required-Anvil gate retained; full required Anvil suite passed. |
| `apps/relayer/src/hardening.test.ts` | Not copied wholesale: its service/config assumptions follow the source architecture. Applicable cases were rewritten in `api.test.ts`, `units.test.ts`, and `runtime.test.ts`. |
| `apps/relayer/src/harness.testutil.ts` | Extended the fake client for state reads and separate gas estimates; retained target guard configuration and test seams. |
| `apps/relayer/src/limiter.ts` | Added `KeyHasher.onRotate` cleanup callbacks and explicit refresh for the idle rotation timer. |
| `apps/relayer/src/log.ts` | No source behavior needed; target logger remains allowlist-based. |
| `apps/relayer/src/main.ts` | Added previous quote-key loading, fixed-class process error handlers, and timer disposal on shutdown. |
| `apps/relayer/src/metrics.ts` | No transplant: target already had a bounded Prometheus registry integrated with service/server metrics. |
| `apps/relayer/src/netsafety.test.ts` | Adapted relevant URL/DNS tests in `units.test.ts`; existing API tests cover trusted-proxy/XFF behavior. |
| `apps/relayer/src/quoteToken.ts` | Ported v2 key identifiers and primary/previous key verification. |
| `apps/relayer/src/runtime.ts` | Added independent quote-key check and idle salt timer/disposal; preserved `LossBudget`, metrics, monotonic clock, and manifest read-back. |
| `apps/relayer/src/secrets.ts` | Ported symlink, owner, production-environment, and optional previous-secret handling. |
| `apps/relayer/src/server.ts` | No wholesale port: target already uses guard's trusted-proxy resolution and its current server limits/metrics API. |
| `apps/relayer/src/service.ts` | Ported state prechecks, second simulation, fee coverage, gas movement cap, and day-tagged release; retained guarded-breaker outcomes and loss-budget accounting. |
| `apps/relayer/src/units.test.ts` | Added regression coverage for rollover, key rotation, salt callbacks, and webhook SSRF checks. |
| `apps/relayer/src/validate.ts` | Updated strict quote token syntax to v2 with canonical numeric fields. |

## Verification

- `npm run build --workspace @ghostpay/relayer` — passed.
- `npm run typecheck --workspace @ghostpay/relayer` — passed.
- `npm run lint --workspace @ghostpay/relayer` — passed.
- `ANVIL_BIN=/tmp/ghostpay-tools/anvil REQUIRE_ANVIL=1 npx vitest run --pool=threads --maxWorkers=1` from `apps/relayer` — 232/232 passed, including the required live Anvil e2e tests (no skips).

The main remaining source-only differences are the alternative failure-count abuse budget, source config names and defaults, and
source-specific docs/tests tied to those changes. They were not substituted for the target loss budget or trusted-proxy guard.
