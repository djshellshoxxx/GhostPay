# GhostID offline merchant profile review

[PR #563](https://github.com/djshellshoxxx/GhostPay/pull/563) implements the customer import and signer comparison from the [F08 specification](https://github.com/djshellshoxxx/GhostPay/blob/50ea73dcf3d4e9593da780ffb34bdfce60a90a15/docs/future/modules/F08-ghostid/SPEC.md). Tested source `23e33b2421fcc44e7e08a6f9751c86d87e9ca4ff` includes main `f76904301cff0b24d65ea4e31cbf37d470db4d95`. Its tree is `bc8d2618cae420cb64475de169a2625c605a3cd7`.

## Try the preview

Set `GHOSTPAY_LOCAL_BUILD_PROFILE=full` and `VITE_GHOSTID_OFFLINE_REVIEW=1` when building the static web client. Open **Merchant profile → Review a merchant profile offline**, select a public signed v1 JSON file, and enter the full public key obtained independently. The comparison applies to the current file. Choosing another file preserves the independently entered key so a changed signer is visible. **Clear local review** clears both and returns focus to the picker.

The full build requires the preview flag. The lean build omits the picker even when the flag is set. The existing verifier checks the strict schema, signature, and expiry. Domain names remain inert signer claims. The review reads public data and has no storage, wallet, network, or catalog-attestation adapter.

## Local qualification

- The four web Vitest suites covering the GhostID review, existing merchant panel, critical-message classification and privacy invariants passed all 69 tests. The 15 GhostID cases include each of the 66 truncated keys and each of 66 single-character substitutions. The new component's focused V8 coverage was 100% of lines and functions, 97.05% of statements and 94.44% of branches.
- A regression first reproduced a false match when the key was entered after expiry and before a queued timer ran. The comparison now samples the clock on input. Tests also cover exact expiry after a delayed read, focus after expiry, denied reads, replacement, clearing, tampering, malformed UTF-8, duplicate keys, unsupported metadata and the 8 KiB limit.
- Chromium 156 ran the committed Playwright test against three built artifacts. The opt-in full review finished offline, emitted zero requests during the interaction, and preserved a previously stored pin. Both the ordinary full build and the lean build with the flag set passed the picker-exclusion check. Each run selected its applicable scenario. The repository bundle scanner passed on 19 files in each full artifact and 17 in lean.
- Strict TypeScript 5.9.3 and typed ESLint passed for the new feature and Playwright files with a scoped web project. The four locale catalogs had zero validation errors. Extraction found zero missing English keys. Secret scanning, action pinning, the transaction-origin check and Git whitespace validation passed.
- The local whole-web TypeScript and unscoped lint attempts exited 137. The successful browser checks used direct Vite builds, the original bundle scanner, the repository Playwright configuration with a separate local port, and Chrome for Testing headless shell. The full repository suite and native-language review remain open. Hosted Actions results are tracked on the PR.

Run the focused checks from `apps/web`.

```sh
npx --no-install vitest run --maxWorkers=1 \
  src/features/future/ghostid/OfflineProfileReview.test.tsx \
  src/components/MerchantProfilePanel.test.tsx \
  src/i18n/securityKeys.test.ts src/privacyInvariants.test.ts

GHOSTPAY_LOCAL_BUILD_PROFILE=full VITE_GHOSTID_OFFLINE_REVIEW=1 \
  npx --no-install playwright test e2e/future-ghostid.spec.ts --project=desktop
```

A separate F08 milestone is required for authenticated catalog attestations consumed by GhostStore. Persona creation and rotation also depend on the scoped key-role and encrypted-state providers.
