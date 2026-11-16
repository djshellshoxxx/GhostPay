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

## Follow-on: merchant-side template issuance

This supersedes the earlier statement that all merchant-side template issuance and amount overrides remain absent.

- Base: `e84e72d951c2c3fd1f4073dbee19805714d87f74`.
- Implementation: `5d36ac5db78ebdb1698c79dfa28a1294dbcc6b8a`.
- Owned files: `merchantTemplate.ts`/tests, `MerchantTemplateIssuer.tsx`/tests, profile panel, SDK v2/tests,
  `invoiceCreate.ts`/tests, merchant Playwright journey and current user/specification documentation.
- Shared validation overlays, excluded from this commit: coordinator catalog/security layer matching
  `f5142b19a6868f155b682eed50f606603cb68b97`; `ReconciliationLedger.tsx` matching
  `27852ba898968a08f7d7c448fac8b19058189281`. The latter aligns this older worktree with the coordinator's freshly built
  canonical-time package types. Final integration must validate the coordinator's actual combined source.

### Completed behavior

The matching loaded merchant signing key can now explicitly create a new invoice from a verified signed template.
The helper uses the existing `buildInvoiceLink` secret-borrowing/signing path. It clones and verifies the profile,
validates the selected enabled/profile-allowed chain and asset, captures the session and request, and requires a
verified recoverable backup or the existing explicit waiver. Custody, session, request freshness and profile expiry
are checked across asynchronous work and before returning the link. No signer key, new credential, service or
merchant-DOM secret channel was introduced.

Template fiat minor units and the merchant's independently entered fixed token amount are separate. USD `50000`
remains USD 500.00; chosen 1.25 USDC becomes `1250000` token base units. The merchant chooses the fee policy. Exact
second expiry supports the profile's 60-second minimum, rather than rounding 1800 seconds to the old whole-hour form.
The existing invoice wire schema caps fiat/line-item minor units at 30 digits; signed profiles can display larger
values, but issuance refuses them without truncation or schema widening. An attempted 39-digit successful-issuance
regression exposed that actual protocol bound and was corrected to test both the exact 30-digit boundary and rejection
of 31/39 digits. No existing assertion or protocol bound was weakened.

SDK `data-amount` forwards only a bounded decimal draft in the selected template currency. The checkout requires
signed `allowAmount`, validates currency precision/positivity, and makes the matching merchant explicitly issue a fresh
signed invoice to adopt it. The existing payer invoice remains unchanged. Editing issuance fields invalidates the prior
output and in-flight actions. Oversized query requests retain a rejected marker rather than becoming an absent request.

### Executed evidence

- SDK amount regressions before implementation: 5 failed / 31 passed.
- Final ordinary Vitest command on `merchantTemplate.test.ts`, `invoiceCreate.test.ts`,
  `MerchantTemplateIssuer.test.tsx`, `MerchantProfilePanel.test.tsx`, `embedV2.test.ts`,
  `privacyInvariants.test.ts` and `App.test.tsx`, `--maxWorkers=1`: **115 passed, 7 files, zero skips**.
- Full web typecheck and focused source/test/Playwright ESLint: **exit 0**.
- `git diff --check`: passed.
- Added a browser journey for importing known test merchant keys, issuing an independent template invoice, checking its
  signature and separate fiat/token amounts, and invalidating the old link after edits. **Not run locally:** the
  coordinator confirmed Chromium's process-singleton socket fails with EPERM. Hosted full-profile execution remains
  required. Lean remains excluded by the existing full-only embed test filter.
- The final-review agent independently reviewed the signer/backup/session/unit boundaries and found no blocker before
  source pinning. It independently ran 20 earlier focused tests before the protocol-boundary test addition; use its
  source-pinned follow-up for the final independent result.

### Exact remaining scope decision

Unattended checkout from attributes/profile alone is still not implemented: the SDK requires an independent signed
`data-invoice`. Profile v1 contains no stealth meta-address, exact token-address/payment-pricing authority or fee policy,
and its signing domain differs from the invoice domain. Choosing a merchant signing service changes credential
custody/transport. Alternatively, introducing a payer-verifiable signed payment-intent/profile schema changes payment
authority and needs destination, fee, quote, nonce/order and expiry decisions. Concrete alternatives are documented in
`docs/specs/14-embed-merchant-profile.md`; existing local issuance is usable without either expansion. SDK release hash
publication and real merchant/browser/wallet acceptance remain release gates.

Next integration: cherry-pick `5d36ac5d` after the already integrated profile milestone and coordinator catalogs, then
run combined-head coverage/build/lean isolation and hosted browser checks. Do not copy the uncommitted overlays or
`node_modules` symlink from the worker tree.
