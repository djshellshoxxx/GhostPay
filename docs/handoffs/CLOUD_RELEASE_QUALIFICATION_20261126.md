# Cloud release qualification of main `8aca5a06`, re-run on `cc8466dd` (2026-11-26 UTC)

Worker: Claude cloud session (claude.ai). Branch `claude/release-qual-cloud-20261125`, base main
`cc8466dd4c9101bb7b73418dab93dcc03a2e4421` (Merge PR #685). The full run was on `8aca5a06` (Merge PR #683); main
moved during it, so section 2b re-runs the affected checks on `cc8466dd`. This session had anonymous read access only: no push, no
PR, no GitHub API, no integration lock. Its commits reach the repository as a git bundle through the owner.

This is qualification evidence for the current main, not an audit and not a release decision. Mocked or local results
are not production readiness. Hosted CI on the exact head of whatever lands remains the gate.

## 1. Authority and coordination observed

- Binding scope: `AGENTS.md` owner stop-work directive and shared-core privacy clarification (2026-11-25).
- Integration lock `automation/ghostpay-integration-lock`: **released** at generation 33 (`f8dda4e6`, after #683),
  then generation 35 (`e2c99231`, owner `chatgpt-8812-branch-completion`, after #684/#685). Never acquired here.
- Existing census reused, not repeated: #673 (cloud lead `ghostpay-6a`) classifies 256 open PRs A to K and adds the
  REL-EXCL release-exclusion gate; #665 (W5) owns `verification/independent-beta/**`; #680 lands owner scope docs.
- Anchor PR heads read at fetch time: #647 `6fd126db`, #659 `ea94ba7c`, #665 `9f15760d`, #667 `67a241c7`,
  #673 `e2bd32c5`, #678 `6dd97323`, #680 `f1ec3522`. #635 is merged on main (`aaa71a11`). During this run #684
  (`29d21c1b`) integrated #647, #666, #671, #673 and #680, and #685 (`cc8466dd`) completed the standalone
  `privacy-profiles` library (no app wiring). Production payment code (`apps/web/src/views/Pay.tsx`, `apps/web/src/lib`)
  is byte-identical between `8aca5a06` and `cc8466dd`; the web source diff is `src/i18n/message.ts` and strings.
- Owned here: the new claims guard test, this handoff and the ACTIVE_WORK entry. No production file changed.

## 2. Checks on `8aca5a06` (this session)

Environment: Linux, Node 22.23.5, npm 10.9.9, 2 CPU, 7 GB; Google Chrome for Testing 153.0.8010.12 as
`GHOSTPAY_CHROMIUM`; Playwright 1.64.1. No Foundry (`forge`, `anvil`, `cast`), so anvil-backed tests skip and are
**not** counted as passed. No Firefox or WebKit binaries.

| Check | Command | Result |
|---|---|---|
| Install, libraries | `npm ci --ignore-scripts && npm run build:libs` | pass |
| Typecheck, all workspaces | `npm run typecheck` | pass (153 s) |
| Lint, all workspaces | `npm run lint` | pass (280 s) |
| Web unit tests with coverage | `npm test -w @ghostpay/web` | 265 files pass, 2 skipped; 3653 tests pass, 13 skipped; coverage 93.16 / 89.43 / 94.65 / 96.89 (thresholds 90 / 85 / 90 / 90); nocov pass 3/3 |
| Script tests | `node --test scripts/pages/*.test.mjs scripts/tests/*.test.mjs scripts/agent/*.test.mjs` | 343 pass, 1 skip, 0 fail |
| Pages release build | `bash scripts/pages/build-pages.sh <new dir>` (release mode, clean tree, no manifests) | OK: 17 files, "DEMO: payments disabled on every chain" |
| Lean e2e, desktop | `GHOSTPAY_LOCAL_BUILD_PROFILE=lean npx playwright test --project=desktop` | 111 pass, 4 skip, 0 fail (4.9 min) |
| Lean e2e, Chromium device emulation | same, `--project=pixel-7-chromium --project=iphone-se-chromium --project=ipad-mini-chromium` | 30 pass, 0 fail (2.1 min) |
| All workspaces | `npm test` | pass: 68 workspaces, 13 996 tests pass, 125 skipped (anvil-gated without Foundry; not counted as passed), 0 fail (1992 s) |
| Secret scan, action pins | `bash scripts/scan-secrets.sh`, `bash scripts/check-actions-pinned.sh` | pass; 116 `uses:` pinned to full SHAs |
| Dependency audit | `npm audit --omit=dev`, `npm audit` | production 0; all (dev) 15 low, 0 moderate or higher |

The four lean desktop skips are full-profile-only specs: `backup-panel`, `btc-worker`, `future-ghostid` (F08,
deferred) and `product-backup-retry`.

## 2b. Re-run on `cc8466dd` (this branch = `cc8466dd` + test/doc only)

| Check | Result |
|---|---|
| `npm run build:libs` | pass |
| typecheck and lint: web, privacy-profiles, ux-intake, i18n | pass |
| `npm test`: privacy-profiles, ux-intake, i18n | 556, 115, 230 pass |
| Script tests, now incl. `scripts/recovery/*.test.mjs` and `apps/web/scripts/*.test.mjs` | 442 pass, 3 skip, 0 fail |
| Pages release build with the REL-EXCL step | OK: "Release exclusions verified: 364 rendered modules and 17 site files contain no F01, F02, F04, F08, F09, F11, F12, F13, F14, P07, FUTURE module"; DEMO |
| Lean artifact packages | same 11 core packages; no `privacy-profiles`, `confidential-amounts` or `future/` module |
| Web unit tests on this branch | 268 files pass, 2 skipped; 3696 tests pass, 13 skipped; coverage 93.16 / 89.42 / 94.65 / 96.89 |
| Lean e2e on this branch (Chrome for Testing 153) | desktop 113 pass, 4 skip (same full-profile-only specs), 0 fail; Chromium device emulation 30 pass |

## 3. Shipped artifact (lean Pages site from `8aca5a06`)

- 368 module ids across the main chunks and the scanner worker (`evidence/ghostpay-lean-build.json`). Workspace packages rendered: address-safety,
  chain-adapters, core-crypto, invoice-schema, net-transport, payment-uri, qr-exchange, scan-source, secret-box,
  tx-review, ux-vault. No module id matches POS, GhostID, tips, teams, bridge, fiat, multichain routing, store,
  `future/` or P13 confidential amounts.
- CSP: `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self' https: wss:`
  (user-chosen RPCs, documented in `apps/web/public/_headers`). No remote fonts, analytics or third-party scripts.
- Absolute origins in emitted text: w3.org (SVG namespace) and documentation links inside library error strings
  (viem, React, noble, EIPs, github.com, bitcoin.org, `4byte.sourcify.dev` from viem's ABI error text). None is a
  fetch target; the egress e2e cases (`app.spec.ts` egress, `network-isolation.spec.ts`) passed.

## 4. Core beta workflows on main

Status words: **verified** = automated evidence on this SHA (this session or W5 #665 on `8aca5a06`); **verified
(local)** = mocked chain or local anvil only; external gates are listed separately.

| # | Workflow | Status | Evidence | Open |
|---|---|---|---|---|
| 1 | Create invoice | verified (local) | lean e2e `app.spec`, `flows.spec`, `core-journey`; CreateInvoice unit tests | none in code |
| 2 | Validate invoice and payment details | verified | payment-uri, invoice-schema suites; #670 dot-segment fix; `pay.error.supportedInvoice` gating | none in code |
| 3 | Exchange invoice securely | verified (local) | link fragment, `qr-invoice-image`, `qr-camera*`, `passphrase-vault` e2e | physical-device QR rows pending (`docs/qr/PHYSICAL_DEVICE_ACCEPTANCE.md`) |
| 4 | Review payment and privacy disclosures | verified | #679 wallet disclosure gate (W5 N13), #672 scan privacy, #674 reuse notice, #676 retention | #372 privacy-mode foundation absent from main (owner decision, #673 section 9) |
| 5 | Connect and authorize wallet | verified (mock wallet) | `wallet.disclosure*` tests; W5 N5, N7 account/chain switch | real wallet extensions not qualified |
| 6 | Submit EVM testnet payment | verified (local) | W5 91 handoffs on `8aca5a06`; devnet journey (needs anvil, not run here) | public testnet broadcast needs owner authorization |
| 7 | Track submission and pending state | verified | W5 N2, N3, N6, N11; journals' durable tests | none in code |
| 8 | Verify receipt and confirmations | verified (local) | chain-adapters `payments.test.ts`; `core-journey` "unknown and late outcomes ... pending until final" | ERC-20 proof stays "unverified" on devnet by design |
| 9 | Failure, rejection, timeout, reorg | verified, one open rule | W5 N1 to N13, G-1 to G-30: 0 violations; `core-journey` reorg cases | **A1**: payer done panel keeps "included in block N (not necessarily final yet)" after a reorg until re-check or reload; needs an owner rule |
| 10 | Recover from refresh, closure, RPC loss, session loss | verified | W5 N1, N2, N6, N11, N12 (real browser restart over a mocked chain); `recovery.spec` | real-chain browser restart unchecked |
| 11 | Seller reconciliation | verified (local) | #635 merged; `reconciliation.spec`; `core-journey` late payment and reorg invalidation | W5 has not yet covered it (its milestone 1); persistent timestamp retention (#587) owner decision |
| 12 | Export and restore recovery evidence | verified (local) | #641, #657 merged; `devices-mobile-restore`, `individual-stealth-export`, `backup-ownership` | #647 (independent keystore recovery without GhostPay) open |
| 13 | Security and privacy across transitions | verified, with open items | `privacyInvariants.test.ts`, egress e2e, W5 "off-origin requests blocked: none" | A1; F1 wording (section 6) |

## 5. Payment-safety invariants and their enforcement

| Invariant (never ...) | Enforced by |
|---|---|
| report success from wallet submission alone | W5 oracle I1 (done-panel claims judged against chain truth), 0 violations; `core-journey` "unknown and late outcomes are shown honestly: no false success, pending until final" |
| treat ERC-20 approval as payment | `transactionOutcome.test.ts` (`approvedPaymentOutcome`), `Pay.test.tsx` "keeps payment ambiguity when the wallet loses its payment response after confirmed approval" |
| mark an unverified transaction paid | chain-adapters `payments.test.ts`; `core-journey` "a mined deadline revert stays unpaid" |
| treat a reorg-invalidated payment as final | `core-journey` reorg cases (seller); W5 N2, N8 (explicit check says Pending or Outcome unknown). Display staleness: A1 |
| lose recovery evidence after an interruption | `walletJournal.durable`, `duplicateAttemptJournal.durable`; W5 N1, N11, N12 |
| sign with silently changed invoice details | W5 N9; `txGuard.test.ts`; `flows.spec` preview equals calldata; `wallet.disclosure.test.ts` "submits the reviewed permit verbatim" |
| retry a possibly submitted transaction blindly | `duplicateAttemptJournal*.test.ts`; W5 N2, N3, N4, N10 |
| ask for a signature from an unrelated second tab | W5 N10 two-tab race; Web Locks cases in `walletJournal.durable.test.ts` and `walletJournal.adversarial.test.ts` |
| leak keys or invoice secrets to logs or telemetry | `privacyInvariants.test.ts` (no analytics/telemetry/fixed third-party origin); production `console` calls log only a manifest warning, an i18n issue kind and a render-error class |
| display an unsupported refund guarantee | **new** `apps/web/src/i18n/claimsWording.test.ts` |
| treat invoice expiry as on-chain reversal | **new** `claimsWording.test.ts`; `ledger.late.decision` ("Expiry never reverses a transfer") |
| assume a timeout proves failure | W5 N1, N12 (unknown-outcome record survives and blocks repeats); `transactionOutcome.test.ts` "never turns an unknown payment into a not-sent claim" |
| enable deferred products through integration | section 3 artifact check; REL-EXCL gate (from #673, on main since #684) passes on `cc8466dd` (section 2b) |

## 6. Change in this branch

`apps/web/src/i18n/claimsWording.test.ts` (test only). Gap closed: no catalog-wide guard existed for the
claims rules in `.claude/skills/ghostpay-security-invariants/REFERENCE.md` section 1 or the refund/expiry payment-safety
wording rules; existing checks were per feature.

- Forbidden affirmations (anonymity, "audited", mainnet readiness, "verified seller", refund promise, expiry reversal,
  guaranteed privacy/payment/value) fail in the English catalog, `help.html` and `privacy.html`. A negator earlier in
  the clause makes a denial; only mainnet wording may be a future condition.
- Every English catalog message on those topics (31 on `cc8466dd`, all reviewed as negated or qualified) is pinned to
  a SHA-256 fingerprint of its text, so new or edited wording fails until re-reviewed. It caught the two new #684
  stealth-export messages on rebase; both warn never to hand a payment key to the payer "as a refund" and were
  reviewed as safe.
- Evidence: 27/27 pass, including 12 forbidden-form detections and 8 negated-form acceptances; the review test failed
  before fingerprints were recorded; planting "If it fails you will be refunded." in `pay.announce.submitted`
  failed both layers, then the catalog was restored. ESLint and `tsc -p apps/web/tsconfig.json` pass.
- Limits: English only (es/ar/ja are machine drafts under native review); regex wording checks reduce, not remove,
  the need for human review.

## 7. Findings routed, not changed here

| Id | Severity | Finding | Why not changed here |
|---|---|---|---|
| A1 (W5) | needs owner rule | after a reorg drop, the payer done panel keeps the inclusion text until re-check or reload; the explicit check is correct | the payer-side reorg display rule is unspecified; inventing it would be a new financial-safety policy |
| F1 (W5) | low, wording | a send refused by an existing journal record is shown inside `transaction.walletUnknown` ("The wallet request failed with an unknown outcome ...") although that click made no request | the wrapper is deliberate (`1332c7b5`: keep the unknown-outcome warning when an earlier request may be on chain); a fix must keep that warning and change security-classified wording in four locales, so it needs the wording owner |
| A2 (W5) | docs | `docs/handoffs/PAGES_INTERRUPTED_PAYMENT_VERIFICATION.md:7` still says "same-tab attempt journal" | docs owner; still present on `cc8466dd` |

## 8. Resume

```bash
git fetch origin main
git bundle verify ghostpay-release-qual-cloud-20261126.bundle
git fetch ghostpay-release-qual-cloud-20261126.bundle claude/release-qual-cloud-20261125:claude/release-qual-cloud-20261125
npm ci --ignore-scripts && npm run build:libs
(cd apps/web && npx vitest run src/i18n/claimsWording.test.ts --coverage=false)
```

Push the branch, open a PR against main, wait for full hosted CI on the exact head, then merge through the lock queue
(acquire, merge, release). If main changed any reviewed English message first, the guard names the key and prints the
new fingerprint to re-review.
