# B2 feature inventory (candidate 7a620ff1)

Verification: LOCAL = run by B2 2026-11-18 (vitest --coverage.enabled=false); CI = per PROMOTION_PACKET run 44231986652 on d91ae16a; not rerun.

| id | name | tier | impl% | verif% | status | effort | strategy |
|---|---|---|---|---|---|---|---|
| F-CLI-01 | CLI core: registry, strict arg parsing, --json, exit codes, doctor, build-info | beta-supporting | 100 | 85 | IMPLEMENTED_UNVERIFIED | S [0, 1] | none |
| F-CLI-02 | CLI invoice, receipt, QR, seller-pairing commands | beta-supporting | 100 | 100 | VERIFIED_COMPLETE | S [0, 1] | none |
| F-CLI-03 | CLI encrypted backup, restore, rekey, offline recovery | beta-core | 100 | 85 | IMPLEMENTED_UNVERIFIED | S [0, 1] | none |
| F-CLI-04 | CLI reconcile, history, encrypted receipt archive | beta-supporting | 100 | 100 | VERIFIED_COMPLETE | S [0, 1] | none |
| F-CLI-05 | CLI read-only chain/payment/scan/registry commands | beta-supporting | 100 | 80 | IMPLEMENTED_UNVERIFIED | S [0, 1] | none |
| F-CLI-06 | CLI merchant commands: refunds, installments, subscriptions, webhooks, split, batch | beta-supporting | 80 | 80 | PARTIAL | S [0, 1] | defer |
| F-MER-01 | Merchant billing: subscriptions, schedules, installments, refunds, payouts, CSV | beta-supporting | 85 | 85 | PARTIAL | S [0, 1] | defer |
| F-MER-02 | Merchant ledger: reconciliation + accounting/tax exports | beta-supporting | 80 | 65 | PARTIAL | M [1, 3] | consolidate |
| F-MER-03 | Merchant hooks: signed webhooks, payment button/link, POS/NFC payload builders | beta-supporting | 100 | 100 | VERIFIED_COMPLETE | S [0, 1] | none |
| F-MER-04 | Merchant m-of-n multisig approvals | full-profile | 60 | 60 | PARTIAL | S [0, 1] | defer |
| F-MER-05 | Web merchant profile, templates, printable bill, reconciliation UI (cross-ref B1b) | beta-core | 100 | 100 | VERIFIED_COMPLETE | S [0, 1] | none |
| F-MER-06 | Merchant examples: checkout, POS terminal, subscription cron, webhook receiver, operations, plugin conformance | beta-supporting | 100 | 90 | VERIFIED_COMPLETE | S [1, 2] | repair |
| F-MER-07 | Optional itemised developer donation | experimental | 40 | 40 | EXPERIMENTAL | S [0, 1] | defer |
| F-INT-01 | WooCommerce gateway plugin (payment-link redirect flow) | full-profile | 85 | 75 | PARTIAL | S [0, 1] | defer |
| F-INT-02 | PrestaShop module | full-profile | 60 | 60 | PARTIAL | S [0, 1] | defer |
| F-INT-03 | Shopify integration | future | 50 | 0 | SPEC_ONLY | L [3, 10] | defer |
| F-INT-04 | Plugin/extension API (privacy options) + conformance example | experimental | 55 | 55 | EXPERIMENTAL | S [0, 1] | defer |
| F-RLY-01 | Optional relayer: quote/sweep API, fee policy, permit failure classes | full-profile | 95 | 90 | IMPLEMENTED_UNVERIFIED | S [0, 1] | none |
| F-RLY-02 | Relayer restart-safe daily budget + nonce journal (state lock) | full-profile | 100 | 100 | VERIFIED_COMPLETE | S [0, 1] | none |
| F-RLY-03 | Relayer private metrics listener (PR #185) and signed alerts | full-profile | 100 | 95 | VERIFIED_COMPLETE | S [0, 1] | none |
| F-RLY-04 | relayer-guard: breaker, trusted-proxy IP, /64 buckets, limiter, loss budget, challenge | full-profile | 60 | 60 | PARTIAL | S [0, 1] | none |
| F-RLY-05 | payer-sponsor: payer-address hiding modes + testnet sponsor core | experimental | 60 | 40 | EXPERIMENTAL | S [0, 1] | defer |
| F-OPS-01 | ops-monitor: read-only chain anomaly probes + bounded release-asset streaming | full-profile | 80 | 75 | PARTIAL | S [1, 2] | repair |
| F-OPS-02 | hygiene: own-leak hygiene options (HY-DST/CON/VER/BUF/FUND) | experimental | 45 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-OPS-03 | sandbox / test mode: deterministic mock chain, faucet, clock, fault injection | beta-supporting | 70 | 70 | PARTIAL | S [0, 1] | none |
| F-UX-01 | ux-connect: wallet connect compat, WalletConnect session grammar, hardware-signer status | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-02 | ux-core: netstate, theme, palette, store (pure UX core) | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-03 | ux-export: structured export encoder/parser/import with formula neutralisation | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-04 | ux-fees: fee preview, cheapest route, timing | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-05 | ux-fiat: BigInt fiat display + rate validation/state machine | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-06 | ux-flow: return URLs, embed, proof, reconcile, undo | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-07 | ux-guide: onboarding checklist, profiles, questionnaire validation (PR #127/#133) | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-08 | ux-intake: address/deeplink/NL amount/QR payload intake | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-09 | ux-links: payment links, handles, address book, tip, URI | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-10 | ux-notify: notification manifest, redaction, URL safety, reminder bridge | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-11 | ux-presets: pay-again presets, sealed store | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-12 | ux-privacy: privacy score + policy | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-13 | ux-receipts: receipt parse/render/verify/disclose | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-14 | ux-schedule: recurrence, schedule templates, advancing-clock expiry guard (PR #126/#132) | experimental | 55 | 45 | EXPERIMENTAL | S [0, 1] | defer |
| F-UX-15 | ux-i18n and ux-sandbox: deprecated thin re-export shims | experimental | 50 | 50 | EXPERIMENTAL | S [0, 1] | defer |
| F-I18N-01 | Web i18n framework: catalogs, translator, plurals/ICU-lite, RTL, language picker, pseudo-locales | beta-core | 90 | 90 | IMPLEMENTED_UNVERIFIED | M [1, 3] | repair |
| F-I18N-02 | Locale catalogs: translation completeness and native review | beta-supporting | 60 | 55 | PARTIAL | L [3, 10] | recover |
| F-I18N-03 | packages/i18n localisation framework (CLI/library) + CLI i18n check | beta-supporting | 60 | 60 | PARTIAL | M [2, 3] | consolidate |
| F-A11Y-01 | Automated accessibility: axe-core audit in Playwright (all routes, keyboard, 320px reflow, forced-colors, reduced-motion) | beta-supporting | 90 | 85 | IMPLEMENTED_UNVERIFIED | M [1, 3] | repair |
| F-A11Y-02 | Mobile/responsive: Chromium device-emulation projects (Pixel 7, iPhone SE, iPad Mini descriptors) | beta-supporting | 50 | 50 | PARTIAL | S [0, 1] | defer |
| F-A11Y-03 | Screen-reader / assistive-tech qualification | beta-supporting | 40 | 20 | NOT_STARTED | M [1, 3] | implement |
| F-HOST-01 | Self-host recipe: docker-compose + nginx + relayer image + selfhost.sh | full-profile | 70 | 45 | PARTIAL | S [1, 2] | repair |
| F-HOST-02 | Tor onion service for the static bundle | full-profile | 60 | 45 | PARTIAL | S [1, 2] | repair |
| F-HOST-03 | Portable hosting kit: package/verify/preview + nginx/container/Tor/I2P profiles | beta-supporting | 80 | 80 | PARTIAL | S [0, 1] | none |
| F-HOST-04 | infra/: devnet, integration, proxy, publish (IPFS/Tor), static web Caddy | beta-supporting | 100 | 40 | IMPLEMENTED_UNVERIFIED | S [0, 1] | none |
| F-DOC-01 | User docs (docs/user, 20 pages) + guides (docs/guides, 11 pages) | beta-supporting | 90 | 90 | IMPLEMENTED_UNVERIFIED | S [0, 1] | none |
| F-DOC-02 | Developer wiki (docs/wiki, 9 pages) | beta-supporting | 60 | 50 | PARTIAL | S [0, 1] | consolidate |
| F-DOC-03 | Operator docs (docs/operators, 17 pages): runbooks, relayer, monitoring, release, rollback | full-profile | 50 | 50 | PARTIAL | S [0, 1] | none |
| F-DOC-04 | In-app contextual help + static help/privacy pages | beta-core | 65 | 65 | PARTIAL | S [0, 1] | none |

## Notes

- **F-CLI-01** UNVERIFIED: handoff claims 68 command paths / 100% acceptance; counted ~69 path literals incl. dynamic; not independently recounted; compiled .mjs tests not run (would need dist build) | Branches: origin/gpt/ghostpay-cli-completion-20261109#92 ancestor of cand; pr/129#129 end-of-options port; ancestor | External: none required
- **F-CLI-02** Branches: pr/105#105 invoice-bound receipt negatives; ancestor
- **F-CLI-03** Missing: CLI per-keypair export command (spec 18) not present in registry | UNVERIFIED: per-stealth-address keypair export is not a CLI command (spec 18 lives in web/ux-vault; B1b) | Branches: pr/108#108 receipt create+archive+offline recovery; ancestor; pr/109#109 unauth recovery; ancestor
- **F-CLI-04** Branches: pr/111#111 shared RPC byte budgets; ancestor; pr/107#107 live RPC evidence; ancestor
- **F-CLI-05** UNVERIFIED: no live RPC used; fixtures only | External: Public-testnet CLI verification not performed here (handoff: pending)
- **F-CLI-06** Missing: refund execute is deliberately unsupported (noncustodial / no hosted signing) | Plan: keep execute unsupported; matches constraint 1
- **F-MER-01** Missing: no web UI; merchant side is CLI/examples/library only | Plan: optional full-profile; keep as library+CLI, no web UI needed for Sepolia beta | Branches: pr/130#130 horizon regression; ancestor; pr/131#131 CSV formula; ancestor
- **F-MER-02** Missing: duplicate logic with apps/web reconciliation (two implementations) | Plan: decide single reconciliation source; web version is the shipped one | UNVERIFIED: PR #148 closed-unmerged: not verified its NaN fix is byte-identical in cand | Branches: pr/148#148 closed unmerged; fix present in cand? ledger.test passes NaN case - INFERRED
- **F-MER-03** Branches: pr/189#189 historical CLI/merchant recovery; ancestor
- **F-MER-04** Missing: no execution path; no UI | Plan: approval logic only; keep as optional library
- **F-MER-05** UNVERIFIED: owned by B1b; B2 did not rerun web e2e (shared dist/build) | External: spec 14 acceptance: ADR-0002/0015 signer pinning+hosting gates
- **F-MER-06** Missing: POS page browser test | Plan: add example tests to CI; browser smoke for POS
- **F-MER-07** Plan: keep; separated; constraint 3/5: needs explicit opt-in design before wiring | Branches: pr/12#12 closed; feat(remote) relayer-guard,donation; ancestor of cand
- **F-INT-01** Missing: Blocks checkout; refunds | Plan: REAL code, not stub; keep as optional merchant integration | UNVERIFIED: platform 28-check harness (docs/companion-merchant/shop-acceptance-20261109.md) not rerun | External: live shop + real invoice service + browser checkout not qualified
- **F-INT-02** Plan: real module, shim-qualified only | UNVERIFIED: behaviour vs real PrestaShop 8.1.7 is read from source only | External: real PrestaShop install/validator/browser not done
- **F-INT-03** Plan: STUB: snippet+docs only; Shopify gateway needs Payments Partner program
- **F-INT-04** Plan: keep isolated; constraint 5
- **F-RLY-01** Missing: fee bump / cancel stuck tx (DEVIATIONS 7); oracle-based pricing; manifest-verified fee feeds for mainnet | Plan: complete for testnet self-host; mainnet gated | UNVERIFIED: anvil e2e (5 tests) not run locally: forge/anvil absent | Branches: pr/118#118 restart-safe budget+nonce journal, permit classes; ancestor; pr/40#40 secret fd-bind; superseded: packages/relayer-guard/src/secrets.ts uses openSync+O_NOFOLLOW+fstat; pr/17#17 claude/laughing-bardeen 104 commits, old line; 64 files differ - review before deleting; pr/39#39 D3 deadline fix present in cand service.ts:762 | External: real testnet deployment + funded hot-key run not done
- **F-RLY-02** UNVERIFIED: multi-host/network filesystem locking not verified | Branches: pr/118#118 ancestor
- **F-RLY-03** Branches: pr/185#185 open draft PR; head is ANCESTOR of cand -> content in candidate; PR can be closed once #203 lands
- **F-RLY-04** Missing: challenge-bank/challenge unused (bot-cost only, not a security boundary) | UNVERIFIED: real proxy topology
- **F-RLY-05** Plan: keep isolated; doc claim limits already honest (constraint 3) | Branches: pr/16#16 remote-extensions-10: 17 unique commits, 10 files differ vs cand (payer-sponsor); triage before retire
- **F-OPS-01** Plan: add live-RPC smoke on Sepolia; not wired to any app | Branches: pr/184#184 open; ancestor (content in cand); pr/106#106 open; ancestor; pr/188#188 merged
- **F-OPS-02** complete as scoped
- **F-OPS-03** complete as scoped
- **F-UX-01** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | UNVERIFIED: README: UNVERIFIED no real wallet/device; grammar from memory | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-02** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-03** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-04** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-05** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | UNVERIFIED: 1 test file; rates injected; web does fiat via MerchantTemplateIssuer/PrintableBill own code | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-06** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-07** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-08** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-09** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-10** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-11** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-12** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-13** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | UNVERIFIED: web has its own lib/receipts.ts; 2 test files | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-14** Plan: support/experimental library; not imported by any app. Keep, separate from beta-qualified. Wire or retire per feature need. | Branches: pr/8#8 closed; ux-* swarm 7; ancestor of cand
- **F-UX-15** Plan: deprecated; candidates for retirement in phase 2 after confirming zero consumers
- **F-I18N-01** Missing: hard-coded string audit (an automated 'no literal JSX text' lint) not found | Branches: pr/66#66 Pay view; ancestor; pr/67#67 Scan view; ancestor; pr/68#68 Create invoice; ancestor; pr/88#88 notice labels; ancestor; pr/183#183 merchant identity disclosures; merged
- **F-I18N-02** Missing: 20 of 24 listed languages unshipped; native review for es/ar/ja | Plan: trim LANGUAGES to shipped locales or ship catalogs; get native review before removing 'needs review' banner | UNVERIFIED: quality of machine translations not assessed (cannot read all 3 languages reliably) | Branches: pr/147#147 closed unmerged 'translate ~860 keys' but ancestor of cand -> content present (now 2253 keys, was ~860 untranslated) | External: native-speaker review per locale (human)
- **F-I18N-03** Missing: web does not consume | Plan: two parallel i18n stacks (packages/i18n vs apps/web/src/i18n); pick one, retire ux-i18n shim
- **F-A11Y-01** Plan: add remaining modals/routes; manual screen-reader pass (NVDA/VoiceOver) as external acceptance | UNVERIFIED: axe results not rerun by B2 | Branches: pr/59#59 axe page-global cast typecheck fix; ancestor?; pr/73#73 C5 device projects a11y; ancestor | External: screen-reader / native AT / real device testing not done (handoff states emulation is not AT proof)
- **F-A11Y-02** Plan: external acceptance only; emulation labelled honestly | Branches: pr/73#73 ancestor | External: real device + Safari acceptance outstanding
- **F-A11Y-03** Plan: manual NVDA/VoiceOver/TalkBack pass on 9 core routes; record in docs/operators | External: human AT testing
- **F-HOST-01** Plan: pin digests; add `docker compose config` + header check to CI | UNVERIFIED: image builds, container permissions | External: real host deploy by operator
- **F-HOST-02** Plan: onion smoke in hosting-kit CI
- **F-HOST-03** UNVERIFIED: 13 skipped tests not analysed | Branches: pr/36#36 Portable hosting kit; ancestor | External: ADR-0015 signed releases + legal review
- **F-HOST-04** UNVERIFIED: not run locally (docker/anvil/bitcoind absent or shared)
- **F-DOC-01** Branches: pr/104#104 source-pinned user/dev guides; ancestor?
- **F-DOC-02** Plan: diff #140 wiki files vs cand, merge newer text | Branches: pr/140#140 open; not ancestor; wiki Home/User/Developer/Codebase-Map differ
- **F-DOC-03** External: operator dry-run
- **F-DOC-04** UNVERIFIED: not rerun
