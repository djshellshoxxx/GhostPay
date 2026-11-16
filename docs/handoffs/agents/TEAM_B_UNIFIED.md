# Team B/I — merchant profile continuation

- Repository: `djshellshoxxx/GhostPay`.
- Worktree branch: `codex/unified-merchant`.
- Base: `365a1c38770ba02826d7e039dbeef44e5a966323`.
- Implementation: `4655bab8bde68bba3338a52de6e3535d6bedb5bf`.
- Catalog dependency: coordinator-owned English/draft messages and critical-key classification, matching
  `cb6a3de37b31cb053b4a9588616f43d11f690777` during the final local checks. Those files were copied unstaged into this
  worktree for validation and deliberately excluded from the merchant commit. Revalidate the combined candidate.

## Implemented

The full application now presents an explicit merchant-profile loader. URL parameters and SDK attributes only
prefill it; the payer sees the IP/URL disclosure and chooses Load before any network request. Fetches use the existing
injected transport, HTTPS, omitted credentials/referrer, no redirects/cache, an 8192-byte streaming cap, a ten-second
abort, cancellation and late-result rejection. The verified profile must name its source origin; expiry is rechecked
after loading and before saving a pin. The existing inline-profile disclosure remains available.

The payer can independently confirm a full signer key and remember it for the source HTTPS origin. A different key
produces a change warning; forgetting the previous pin requires separate consent. Mutations use a shared, nonwaiting
Web Lock; absent/busy locks fail closed. The key/profile and consent generation are checked inside the lock. Editing
the confirmation, withdrawing removal consent, changing URL, unmounting, or storage/focus refresh invalidates stale
operations. Public localStorage pins remain advisory and do not enter invoice trust, payment authorization or framing
authority. Other code controlling that origin remains outside this concurrency guarantee.

Signed templates display exact decimal minor amounts, currency and duration. `data-template` selects presentation;
no invoice is created or changed. SDK v2 `data-profile-url` forwards the URL and opens a popup immediately in the user
click even when iframe mode was requested. Frozen SDK v1 is unchanged. Full-profile changes stay outside lean Pages.

## Evidence

Checks ran against the implementation source plus the coordinator catalog overlay above. Dependencies used the
coordinator's installed/built workspace packages. Counts overlap; do not add intermediate suites into the final count.

- Test-first wrong-source profile regression: 1 failure against the old fetch helper.
- SDK URL support and validation regressions: 5 failures / 25 passes before implementation.
- Independent review remote-iframe regression: 1 failure before the immediate-popup correction.
- Independent review pin transaction regressions: 3 failures before Web Locks and inside-lock validation.
- Independent review stale-consent regression: 1 failure before consent-generation invalidation.
- Final targeted integration: `cd apps/web && ../../node_modules/.bin/vitest run src/lib/merchantIdentity.test.ts
  src/components/MerchantProfilePanel.test.tsx src/embedV2.test.ts src/lib/embedHost.test.ts
  src/privacyInvariants.test.ts src/App.test.tsx --maxWorkers=1`: **116 passed, 6 files, zero skips**.
- `npm run typecheck -w @ghostpay/web`: passed.
- Focused ESLint on App, merchant components/helpers/tests, SDK tests and the new Playwright file: passed.
- `git diff --check`: passed.
- `e2e/merchant-profile.spec.ts`: added a real-browser two-tab journey for explicit network consent, exact template
  presentation, pin persistence, changed-key warning and cross-tab removal. **Not executed locally.** The existing
  lean-profile embed filter excludes this full-only feature. No browser or external-host pass is claimed.

The first attempted Vitest command used the repository root instead of the web workspace and found no tests; it was
corrected before the test-first results above. An intermediate cancellation race and test-only lint errors were fixed.
Node 24 exposes `navigator.locks`; the unavailable-lock test explicitly stubs that capability rather than assuming it
is absent. Coverage thresholds and assertions were not lowered.

## Independent review and next actions

The registry agent reviewed the production diff independently, reproduced the remote-iframe and pin-race issues,
then reviewed their corrections and the stale-consent fix. Its final message reported no further blocking findings
in this scope. The security-inventory agent independently identified the same pin transaction race. Neither is an
external security audit. Source-pinned review evidence is maintained by the coordinator/reviewing agent.

1. Integrate `4655bab8` with the coordinator catalog/security changes, resolving only coordination-document overlap.
2. Run the combined-head web checks, coverage, build/bundle scan and full-profile browser acceptance, including the new
   merchant journey. Validate the lean artifact still excludes this surface.
3. Publish the exact reviewed SDK hash during approved release preparation; perform real merchant-host/browser/device
   acceptance and native-language review separately.

## Remaining specification limits

Spec 14 is not fully release-qualified. Merchant-side template-to-invoice issuance and free-form amount overrides
remain absent: a payer cannot sign a new invoice on behalf of the merchant. No new merchant signer/service or authority
model was selected. Profile pins are not independently verified business identities, and no automatic key rotation,
invoice trust, embedding authorization, deployment or release publication was introduced. ENS/registry workflows
belong to another lane. The current iframe flag and server `frame-ancestors` allowlist remain mandatory for inline
profile iframe mode. No production funds or external credentials were used.
