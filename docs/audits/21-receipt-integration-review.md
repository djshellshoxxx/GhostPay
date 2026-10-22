# Receipt integration security review

Review date: 2026-10-22. Preliminary, focused review of the seller-receipt helper and Pay view integration in `apps/web/src/lib/receipts.ts`, `apps/web/src/views/Pay.tsx`, `apps/web/src/lib/pay.ts`, and `apps/web/src/lib/payExec.ts`, plus their focused tests. This is not an external audit or launch certification.

## Findings and disposition

### Closed: a delayed old invoice flow could leave a stale prepared payment under a newly opened invoice

During review, I found that an in-flight wallet connection or payment preparation could finish after an invoice fragment changed. The old completion could set a prepared transaction after the page had reset, and the generic send guard checked chain, token, and amount but did not bind the built payment to the invoice recipient. Thus two invoices with the same chain, token, and amount but different sellers could be confused by stale UI state.

The Pay flow now increments a revision on invoice changes, resets invoice-scoped wallet/payment state, and ignores stale async completions for unlocking, connecting, preparing, approving, sending, and revoking. The prepared preview and send handler require the exact current invoice and `PayContext`. `buildFinal` also records each exact built-payment object in a private `WeakMap`; `assertReadyToSend` rejects a build object reused with any other context. A regression constructs same-chain/token/amount invoices with distinct recipients and confirms rebinding is rejected. A deferred preparation regression switches invoices before resolving the old build and confirms no stale preview appears and no transaction is sent. If an earlier flow broadcasts while an invoice changes, its hash remains visible with a warning.

### Closed: receipt import could finish under changed invoice or trust-key state

The import handler caps the file at 64 KiB before reading, parses and verifies the signed JSON, then binds the receipt to the currently opened invoice digest, chain, asset, and exact seller net amount. It checks the current invoice context again after file reading, rejects stale import revisions and changed explicit trust keys, and checks local transaction hash and prepared stealth address when those are available. A receipt notice is cleared when invoice context, build, result, or trust key changes.

The receipt signer is accepted only when it matches the key on a cryptographically valid invoice signature or a compressed public key the user explicitly entered as verified out of band. The helper does not infer trust from a signer key embedded in a receipt. UI copy says this is a seller-key attestation, not proof of seller identity or an independent on-chain payment. Imported seller receipts are not fed into payment verification.

## Verification

- Independent focused rerun: `npm exec -w apps/web -- vitest run src/lib/pay.test.ts src/lib/payExec.test.ts src/lib/receipts.test.ts src/views/Pay.test.tsx --reporter dot --maxWorkers=1` — 4 files passed, 86 tests passed.
- The author additionally reported a post-broadcast follow-up run of `payExec.test.ts` (17/17), web typecheck, scoped ESLint, and `git diff --check` passing after the last change.

## Limits

Receipt signatures establish control of a key and consistency of signed fields only. They do not establish seller identity or prove a payment reached the chain. Invoice signature validity likewise does not independently establish the real-world identity of the embedded signer. Explicitly trusted receipt keys require out-of-band verification by the user. This review covered the focused integration and regression paths; it did not audit the complete application, external chain deployments, or production operations.
