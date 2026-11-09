# GhostPay CLI completion handoff

## Branch, publication and source

- Branch: `gpt/ghostpay-cli-completion-20261109`.
- Integration PR: https://github.com/djshellshoxxx/GhostPay/pull/92 (draft while final acceptance is in progress).
- Starting source and unchanged parent tip: PR #91, `b748ecdce06d2dfa911144814161c31a46a09e9b`.
- First published infrastructure checkpoint: `1a814ada642dabafdc185651454aff6e993080fa`.
- The next source-bearing checkpoint carries the integrated command families, portable shared codecs, compiled workflows and hosted platform matrix. Its exact SHA is the PR head; final acceptance will record that tested revision explicitly.
- Preserved parent stack: #84 → #88 → #89 → #90 → #91 → #92. No parent branch has been rewritten or merged into main.

Direct engineering workers own disjoint files in one integration checkout. No Codex CLI/cloud task, paid agent workflow, recurring runner or funded transaction has been invoked.

## Authoritative capability inventory

This is the single completion inventory. The command reference is `packages/cli/README.md`. “Implemented” below describes current code; final shared GUI, hosted CI and platform acceptance are still being collected. Production deployment readiness is separate.

| Capability | GUI available | Current CLI | Shared implementation | Evidence | Remaining work |
|---|---|---|---|---|---|
| Invoice creation | Yes | create/sign/link/inspect, protected links and expected fields | invoice-schema and payment-link policy | command/parity suites; compiled signing/link journey | Final hosted gates |
| Invoice verification | Yes | strict envelope, signature/pin/chain/asset/amount/recipient/expiry checks | invoice-schema | wrong-pin expected-red regression; compiled verification | Final hosted gates |
| Payment inspection | Yes, enabled testnets | inspect/verify/status with explicit online consent | chain-adapters canonical verifier | real verifier with bounded fixtures; compiled HTTP pending/reorg/verified journeys | Final hosted gates; public-network acceptance remains external |
| Signed receipts | Yes | inspect/verify/export and exact invoice binding | GUI signed codec extracted to invoice-schema | shared signature vectors, GUI24-suite group, compiled SVG/file round trips | Add creation from freshly verified owned payment, then qualify |
| QR exchange | Yes | public invoice/receipt/seller/meta SVG, multipart and strict decode | qr-exchange/jsQR and shared codecs | bounded image/parser tests; compiled SVG/multiframe round trips | Add existing encrypted-keystore/settings exchange; raster/camera adapter remains explicitly unsupported |
| Public seller pairing | Yes | export-public/import-public with repeated-input preview | GUI public codec extracted to qr-exchange | shared round trips and compiled repeated import | Final hosted gates |
| Encrypted backup | Yes | generate/create/inspect/verify/rekey | same core key generation, scrypt/AES-GCM, GPA and address-book codecs | full ux-vault251; recovery47; key generation5; compiled credentials/rekey | Add generated-key subprocess journey; final hosted gates |
| Restoration | Yes | dry-run or approved immutable encrypted portable output | shared format validation and vault import | authentication/tamper/atomicity tests; compiled immutable recovery | Browser storage activation uses explicit GUI import; final hosted gates |
| Reconciliation | Yes | inspect/create/register/propose/confirm/import/archive-receipt/export-receipts | pure GUI vault/matching extraction | recovery47; mixed-fork/manifest/provider/stale-context regressions; compiled live approval/import journey | Add verified unassociated record and tombstone-preserving local removals |
| Transaction history | Yes | list/inspect, filter/page/report export | encrypted reconciliation vault | query/import/tombstone tests; compiled historical-vs-live labels | Final hosted gates |
| Merchant subscriptions | Library and durable operator | schedule plus shared config/snapshot inspection; existing durable runner retained | merchant-billing validator and subscription-cron | merchant-billing263 and durable subprocess21 | Final hosted gates |
| Installments | Library | plan/inspect, exact integers and duplicate/conflict handling | merchant-billing | malformed/schedule tests; compiled plan/inspect | Final hosted gates |
| Webhooks | Merchant integration | sign/verify plus event/config/idempotency inspection; durable receiver retained | merchant-hooks | existing exact-byte/retry/restart suites; compiled Unicode and inspection | Final hosted gates |
| Refunds | Off-chain fixture only | inspect/status; execute explicitly unsupported | merchant-multisig canonical account/proposal validation | threshold/timelock/expiry/nonce tests; compiled unsupported execution | Accepted real payment/refund authority is external |
| Chain adapters | Read-only/testnet surfaces | chain/assets/deployment, EVM/BTC/Solana/TRON public inspection, pinned Bitcoin headers | existing chain packages | payment/chain/scan159; compiled deployment and RPC verifier | Final hosted gates; no experimental activation or broadcast |
| Privacy scanning | Yes with budgets | plan/run/inspect, immutable authenticated resume reports | existing bounded canonical scanning + standard HKDF/HMAC cursor binding | budget/replay/reorg tests; compiled private scan | Final hosted gates; browser transport preferences do not auto-import |
| Operator diagnostics/configuration | Yes | doctor/diagnostics/RPC health/config validate/version | same self-tests, validators and RPC transport | root command61-group and compiled diagnostics | Add safe settings exchange validation; final hosted gates |

Browser camera capture, UI theme application, browser profile storage/session locking and browser wallet prompts are presentation/infrastructure-specific. CLI operations use portable validated files and explicit credentials. Payment sends, sweeps, registry publication and experimental policies do not gain signing authority through this work.

## Current test evidence

Local runtime: Node24.22.1, npm11.9.0, Linux. `npm ci --ignore-scripts --no-audit --no-fund` installed747 packages. No coverage threshold was lowered.

| Command / gate | Observed result |
|---|---|
| `npm run build:cli` | Passed for integrated command families before latest small additions |
| `npm test -w @ghostpay/cli -- --maxWorkers=2` |427 passed;98.51% statements/97.14% branches/98.99% functions/99.49% lines |
| `npm run test:compiled -w @ghostpay/cli` |12 passed; filesystem, Unicode, signing/link, receipt/QR, encrypted recovery, controlled HTTP verification/reconciliation, scan and merchant/diagnostic journeys |
| `npx vitest run --root packages/cli src/backup-generate.test.ts --maxWorkers=1` |5 passed after5 expected-red missing-command failures |
| Full invoice-schema gate |705 passed;98.06/97.72/100/99.25 coverage |
| Full qr-exchange gate |94 passed;98.73/93.06/100/99.68 coverage |
| Full ux-vault gate |251 passed;96.18/92.90/99.68/98.61 coverage |
| Full merchant-billing gate |263 passed;99.69/99.66/100/99.80 coverage |
| Existing subscription-cron subprocess suite |21 passed after shared validator extraction and URL-policy fix |
| Targeted original GUI receipt/seller/meta tests |24 passed |
| Targeted original GUI recovery/history/tag/component suites |90+72 passed (overlapping shared parity suites are not added to a unique total) |
| CLI/shared package typecheck and lint |Passing focused runs; final snapshot rerun pending |
| Web typecheck and lint |Passed after removing one redundant assertion introduced by the generic shared extraction |
| Secret scan / action pin guard / targeted build regression |Passed;91 pinned action references;1 build-scope regression |
| Full web test and hosted platform matrix |In progress; do not count as passed |

Controlled RPC fixtures exercise the actual canonical verifier and process/network adapter; they do not establish public-network acceptance. The new ordinary GitHub Actions matrix qualifies Node22 on Ubuntu, Windows and macOS. Its results must be attached to the final source revision.

## Reproduced security fixes

- Group-readable signing keys were accepted; private POSIX reads now check ownership/mode/link count on the opened descriptor. Existing bounded descriptor reads and private atomic publication remain intact.
- An explicitly wrong invoice pin returned success; it now exits1.
- Reconciliation proposals could change pinned deployment/provider configuration between review and confirmation; the proposal now binds exact manifest and captured provider configuration.
- Different block hashes at one height could overwrite each other in the final canonical map; the complete context now rejects mixed forks.
- Implausible/finally changed heads and late secondary reorganization observations could survive verification; final provider checks now enforce head bounds, canonical hashes and minimum finality.
- Signed subscription outbox URLs with injected credentials or empty query delimiters bypassed the normal link policy; the shared validator now reuses `assertPaymentLink` (two expected-red regressions).
- An unset key/webhook environment-source error echoed the supplied variable name, which could be an accidentally pasted secret; errors are now generic. Passphrase/RPC sources already suppressed names and values.

Keys/passphrases/endpoints are accepted only through explicitly selected file/stdin/named environment sources. On Windows private file reads fail closed because the adapter cannot qualify DACLs; use stdin/environment, including stdin for private scan reports. POSIX outputs request0600. Windows output confidentiality depends on a trusted private parent-directory ACL and is not inferred from POSIX mode bits.

## Known defects and external gates

The starting parent source is not a passing baseline: CI run42617654239 had2186 passing web tests,1 failure and1 skipped. Its actual typecheck/lint/build/package/browser jobs passed; the aggregate gate failed because of the web test. The saturated-backup component case passes focused locally, but full final acceptance must resolve any recurring failure. A separate full-web random-address fixture failure is being diagnosed before any edit.

Parent #84's Sonar gate remains independent. Production deployment pins, public-network acceptance and accepted real refund authority are external; no production key or funded transaction is needed for this assignment. Imports remain historical, receipt signatures remain attestations, and successful RPC health does not establish provider trust.

## Next work

Complete the final local parity additions listed in the inventory, refresh compiled journeys and command reference, rerun changed gates on a stable snapshot, publish it, collect exact hosted checks and platform results, then mark the integration PR ready when its own gates permit. Preserve the existing parent stack and do not force-push.
