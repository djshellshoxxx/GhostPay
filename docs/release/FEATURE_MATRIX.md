# GhostPay 1.0 Beta feature matrix

## Current continuation — 2026-11-19

[Generation 3 completeness review](../engineering-handoffs/continuous-20261119/generation-3-completeness/ASSESSMENT.md) maps nine required feature families to actual lean routes, source and tests;48 focused tests passed. No additional confirmed required feature gap was found beyond the now-integrated export-expiry and manifest repairs. Source presence and unit evidence do not certify complete browser/wallet/testnet behavior. [Current status](../engineering-handoffs/continuous-20261119/README.md) supersedes older checkpoint counts below; release remains BLOCKED.

## Historical feature checkpoint

Checkpoint: 2026-11-19. Integration branch: `release/ghostpay-beta-qualification-20261119`; implementation checkpoint `c5a2b09ea5dd7ee19400f29cbaddbe5cd93acc0a`; evidence checkpoint `4eb69699a59da84d17d0baa5dfe8dd6c9baaef9a`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. [Draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) is the review entry point. Local and connector-published commits have identical trees and ordered source parents but different metadata; use [PUBLICATION_MAP.json](PUBLICATION_MAP.json) for their exact mapping.

**Demonstration: BLOCKED. Testnet beta: BLOCKED.** Implementation, scoped tests, full qualification and published acceptance are distinct.

## Lean release scope

GhostPay remains a static, non-custodial EVM application. Keys and signing stay client-side; no GhostPay-operated account, database, backend or relayer is required. A demonstration without authenticated deployment manifests disables payment execution, scanning and sweeping on every chain. Pages mainnet remains prohibited. Bitcoin, Solana, TRON, policy accounts, confidential pools and server implementations remain preserved outside this release.

| Family | Implemented behavior and recovered work | Evidence and remaining acceptance |
| --- | --- | --- |
| Seller keys and backups | Generation/import, authenticated private export, encrypted backups, exact-file verification and overwrite protection retained | Spec 18 source and tests retained. Wrong password/file/account, download interruption and browser restart still need final browser acceptance |
| Independent recovery | Portable master/payment-key formats and standalone decoder; fresh export-specific RPC authority after authentication | Fresh 23-case recovery suite passed, including a fresh directory outside the repository and a recovered-key spend on local Anvil. This does not restore every separate signing identity/history format automatically |
| Session authority | Sleep/idle expiry, rollback refusal, revocation, cross-tab handling and recovery-aware locking retained | Existing authority tests plus reproduced entry-lock and invalid/decreasing-clock repairs. Actual browser suspension/restart remains unverified |
| Invoice and buyer flow | Signed canonical invoices, expiry, links/QR, explicit wallet/network confirmation, pending/uncertain handling retained | #270/#274 preserved. #279 malformed multipart Unicode repair passed 17 web QR tests and 233 package tests with the original coverage gate. Complete buyer browser journey remains required |
| Private discovery and receipts | Private checkpoints, encrypted discoveries, bounded scanning, cancellation and receipt association retained | #269 source and 300-case historical scoped selection retained. Fresh full application coverage and reorg/restart/browser acceptance remain required |
| Direct native sweep | Separate read-only preparation and one-use confirmation; exact destination, balance, nonce, fee caps/reserves and net amount; wall/monotonic expiry; fresh final checks and persistent uncertain-attempt handling | Recovered source passed 384 tests in ten files. Subsequent behavior-preserving lint repair passed 367 affected tests, full web typecheck and complete web lint. Final combined/browser/testnet qualification remains required |
| ERC-20 sweep | Existing direct path retained; one-time address requires native gas | Separate gas-funding and token acceptance required. Native tests do not qualify ERC-20 support |
| Static site and help | Lean profile, no-manifest payment refusal, mainnet exclusion, CSP and bundle guards, relative routing and public guides | Full web build passed. Final Pages artifact, reproducibility, subpath HTTP and browser checks remain separate |
| Release integrity | Independent artifact verifier, byte/file-identity checks, strict analyzer completeness and evidence capture | #276/#277 preserved; static selection 151 passed. Analyzer tooling 54 passed; complete native analyzer and hosted release gates remain distinct |

A downloaded backup is not a verified backup. Verify its actual bytes by decrypting and matching the intended keys. Preserve invoice-signing identity and application history using their own documented formats where needed. Secret-buffer disposal is best effort in JavaScript, not a guarantee that every runtime copy is erased.

## Evidence-based progress

All nine rows have source; that is an inventory, not proof of complete product behavior. **0/12 mandatory final-candidate real-browser scenarios are verified here (0%).** The local Anvil recovery test is not a browser or public-testnet result. **Qualified public milestones: demonstration 0/1 (0%), testnet beta 0/1 (0%).** An overall implementation-completion estimate is withheld until the full matrix can establish it. These counts never override the BLOCKED verdict.

## Guides

- [User guide](../user/README.md), [seller setup](../user/set-up-stealth-meta-address.md), [session security](../user/session-security.md).
- [Independent recovery](../user/recover-stealth-payment-keys.md), [Spec 18](../specs/18-stealth-keypair-export.md), [portable formats](../specs/18-stealth-keypair-export-formats.md), [standalone decoder](../../scripts/recovery/stealth-export-recover.mjs).
- [Buyer workflow](../user/review-and-pay-an-invoice.md), [scanning](../user/receive-and-scan.md), [native sweep review and gas privacy](../user/sweep-and-gas-privacy.md).
- [Privacy limits](../user/privacy-limits.md), [seller privacy](../user/seller-privacy.md), [signer pins](../user/invoice-signer-pins.md), [developer guide](../developer/README.md), [Pages guide](../pages/README.md).
