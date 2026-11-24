# Encrypted checkout wallet-change notice

Worker: `resume_package_qualification`, coordinator-assigned continuation of [PR #598](https://github.com/djshellshoxxx/GhostPay/pull/598). Branch: `fix/20261124/encrypted-wallet-revocation-notice` in the coordinator-provided checkout. Base: `6419f237660978aa4f97c4eae2e39b96854b9d3e`, a qualification claim over published head `86450d8d459ccf4a6925742d082e1c7ad0905e75`.

**Source fix:** `1efeb250c83a2bdf8cd66d85683e6b05fc19461e`. Only production file changed: `apps/web/src/views/Pay.tsx`. The remaining changes are lifecycle regression tests and additive documentation. No wallet hook, provider, network, journal, encryption, translation catalogue, dependency or other production code was changed.

## Confirmed failure and minimal repair

The coordinator's original real-Anvil full-profile journey passed two cases and failed the silent wrong-network case at the required public reconnect message. The encrypted invoice was correctly concealed and its reopen capability removed. However, that fragment removal reran Pay's parsing effect, which cleared the ordinary error containing the reason; the input view did not render ordinary execution errors in any case.

Pay now keeps this one existing localized public reason in a separate boolean state. It renders through the standard Notice component in both the input and review views, without retaining wallet/invoice data or a private error object. Private fragment cleanup no longer clears it. Lock or session invalidation clears it; opening a new invoice, reconnecting, forgetting the invoice or leaving the view also clears it.

The change does not use `inputRejection`, whose existing UI appends a nothing-sent statement. The generic wallet-change notice makes no claim about a prior transaction's outcome. All private-state cleanup, operation guards and durable attempt-journal behavior remain unchanged.

## Test-first and final native evidence

- Test-first commit `be2a87e545c1d981cbd1541eb3685a8d7ec331b8`, before the production change: **7 new cases failed on the missing reason; 2 existing plain-invoice controls passed**. Eighteen other lifecycle cases were intentionally excluded by this focused name filter. The four silent-mismatch cases had already verified concealment, erased capability inputs, zero wallet send/sign calls and an empty journal before reaching the missing-message failure.
- Four new cases use actual encrypted or passphrase-protected signed invoices, covering silent network and account mismatch. They require one standard public notice with the exact reconnect reason, no false nothing-sent message, no prior account/invoice/send UI, an empty journal, no send/sign request, and no reopening of the erased private context after navigating away and back.
- Three new cases require the notice to clear on app lock, session change and a new invoice. The new-invoice case preserves the seller session while building the next invoice so a session change cannot accidentally satisfy that check.
- **Final complete focused suites: 40/40 passed, two files, no skips**, including all 33 preexisting lifecycle/hook cases and the seven additions. Existing late-hash recovery, unknown-outcome journal, app-lock and superseded-connection checks remain intact.
- Full web TypeScript check: passed.
- Typed ESLint on both changed source/test files at repository pins: passed.
- `git diff --check`: passed. Repository secret scan is run before the documentation commit.

The standard Notice includes a public icon/title; the final test checks its exact message child and a single alert rather than incorrectly treating that decoration as part of the message. Test-only query typing/options were corrected during type/lint validation. No production assertion, timeout or privacy guarantee was relaxed.

Commands:

```sh
# From apps/web; the red run additionally used -t 'Pay .*silent|public wallet-change'.
../../node_modules/.bin/vitest run src/views/WalletPrivacy.lifecycle.test.tsx src/lib/useWalletPrivacy.test.tsx --coverage.enabled=false --maxWorkers=1

# From the repository root.
npm run typecheck --workspace=@ghostpay/web
./node_modules/.bin/eslint --config eslint.config.js apps/web/src/views/Pay.tsx apps/web/src/views/WalletPrivacy.lifecycle.test.tsx
npm run ci:scan-secrets
```

Node 24.22.3; Vitest 5.1.0; TypeScript 5.9.3; ESLint 10.15.0; typescript-eslint 8.73.0. The coordinator's existing exact-lock installation was reused without dependency changes. No coverage percentage or whole-repository unit-test pass is claimed.

Final reviewed inputs for the native checks:

| File | Git blob |
| --- | --- |
| Pay.tsx | `7f204501dd00ab5b915c6f75f023209973df4495` |
| WalletPrivacy.lifecycle.test.tsx | `c78c256fe22a4f7f6e74eae38faa7d5d0888519b` |

Logs are retained at `/workspace/scratch/efb8df2579c9/privacy-598-encrypted-red.log`, `privacy-598-encrypted-green.log`, `privacy-598-encrypted-typecheck.log`, and `privacy-598-encrypted-lint.log` in the same directory. The original coordinator failure is recorded in `privacy-598-devnet.log` and `/tmp/ghostpay-browser-devnet.hiQRau/dist-results/devnet-journey-real-chain--3172c-ore-send-blocks-the-payment/error-context.md`.

## Coordinator review and final browser qualification

The coordinator independently reviewed the source and regression changes, found no blocking finding, and reran all **40/40** focused cases successfully. The public boolean retains no account, invoice, key or transaction outcome.

At exact handoff head `b2d222772fec857b69eb626afe3b8f58c0b8dfbd`, the unmodified original Beta runner rebuilt the full application against fresh local Anvil and passed **3/3 tests in 51.9 seconds**, without retries or skips. The formerly failing encrypted wrong-network case passed with the public reason, removed final-check/send UI, zero sends, empty journal and unchanged nonce. The original payment, reload, scan, receipt and sweep/no-second-sweep checks also passed.

The standard lean build/typecheck, CSP/bundle scan, hosting validation and packaging passed. The unmodified static-hosting browser script then passed **both origins**, retaining storage separation, headers, blocked external HTTP/WebSocket requests, failed-integrity/no-fallback and local-key checks. This also qualifies #598's existing confirmation fixture locally.

Commands were the original `scripts/beta/browser-devnet.sh` on local ports 8548/4177 and `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build --workspace @ghostpay/web`. Browser: Chrome for Testing Headless Shell 156.0.8078.4; Foundry 1.8.5 and solc 0.8.28. Static archive SHA-256: `85f4ada5e626483247602e1b6c079ae0fc5ab92cb1dd15a75a03cc3353081b7e`; content digest: `sha256:76036b8f5f3cfa478373768223d4b5f349d4756313b4bd71479832723f2083d6`.

Complete successful output, artifact report and initial failure are in `docs/qa/wallet-privacy-598-20261124/qualification.json`. The earlier **2/3** result remains attributed to public parent `86450d8d459ccf4a6925742d082e1c7ad0905e75`; the new **3/3** result belongs to the fixed source. No failure was removed or relabeled.

## Remaining integration gates

Fresh hosted checks must qualify the public child. Refresh ownership and #598/#571 dependency order before integration. Ordinary loopback Chromium does not establish Tor Browser/live onion acceptance; Docker image/runtime qualification was not run locally. No shared merge, deployment, original-branch overwrite or real funds occurred.
