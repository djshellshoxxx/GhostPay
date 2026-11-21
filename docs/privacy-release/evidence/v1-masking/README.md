# Global masking first milestone and successor handoff

Execution source `35caab0a0d5f5fa1d4b934eddf1de0e9ee18110c`, tree `280baae877e83f6d75548a8fb18cc7492ba894e9`. Runtime retained from published13762896. No runtime change was needed for the covered scenarios.

Original focused command from apps/web:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/lib/privacyMode.test.tsx src/components/PrivacyQuickHide.test.tsx src/AppShell.privacy.test.tsx src/views/CreateInvoice.privacy.test.tsx src/lib/settings.uiPrivacy.test.ts --coverage=false --maxWorkers=1
```

**49 passed in 5 files, zero skips, exit0**,38.80s. SHA256 unmodified log: `8edafa851b80a63a64eb6a251c580fdd2222da0dcccf34e41b332650baf7355f`. An initial `vitest --version` probe used an apps/web-relative binary from the repository root and exited127; it executed no tests and was corrected by using the documented cwd.

The executed scenarios cover timeout and invalid/rollback clocks, lock/session/visibility revocation, mounted draft and sole-copy key preservation, focus/selection cleanup, one-way quick hide, privacy preference failures and shell boundaries. Concealment uses native hidden/inert/aria-hidden; mounted DOM and workflow memory remain to preserve drafts and recovery. Do not claim DOM erasure or protection from page scripts.

## Fresh independent successor

Review exact module/source against v1-01-masking, especially lifecycle and accessible titles/attributes, focus recovery and quick-hide consistency. Check existing original e2e/privacy-mask-history.spec.ts first browser journey in combined gate window. Keep runtime behavior when tests establish no gap; no gratuitous rewrite. Give source-pinned M2 review and bounded next task. Original full typing/lint/unit coverage/browser/hosted gates remain open. No remote writes, new dependencies, plaintext persistence or recovery erasure.
