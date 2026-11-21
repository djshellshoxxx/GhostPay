# Webhook timestamp-width round-trip mismatch (2026-11-21)

- Exact main base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Branch: `fix/ghostpay-webhook-signer-timestamp-width-20261121`.
- Coordination claim `47111ee2377afc10397704bbec4fbdbde66c6989`.
- Test-first RED commit `991ae0981fb990c6e4348ee577ad6f3bc7b7655e`.
- Production fix `dff8f7640840fe015e8e752b13ae5b56592286ab`.

## Root cause and reproducible failure
The original `signWebhook` accepted any nonnegative JS safe-integer timestamp; it constructed a `t=...` header with up to 16 digits. The same package's `verifyWebhook` rejects headers whose timestamp differs from `TS_RE = /^[0-9]{1,12}$/`. A source-valid `1000000000000` signature was therefore rejected as `malformed` even with an identical key and body. No realistic present-day event or exploit is claimed; this is a bounded consistency defect.

## Minimal repair
The signer now applies `TS_RE` to the decimal timestamp before HMAC creation. This rejects out-of-protocol timestamps with the existing `bad-nonce` error instead of generating permanently unverifiable headers; all ordinary timestamp/nonce/HMAC behavior stays unchanged. Regression covers the maximum 12-digit value and two larger JS-safe values. Changes affect only `packages/merchant-hooks/src/webhooks.ts`, `packages/merchant-hooks/src/hooks.test.ts` and append-only docs.

## Verification
- Node 22.16.0 isolated source-equivalent proof: old signer constructs 2 headers the reader regex cannot parse; fixed predicate rejects 2/2; max 12-digit boundary still generates a parsable header. This is **not repository Vitest**.
- Actual package Vitest, typecheck, lint, build, hosted exact-head CI, browser integration and independent review: not yet run/completed. Local container cannot resolve github.com for checkout.
- No dependencies, API features, header format, release or deployed payment behavior changed.

## Integration
Keep draft until exact-head hosted CI, formal independent review and current integration-ownership/dependency checks. No main merge or deployment from this worker. Other active bug-fix PRs are separate and remain owned.
