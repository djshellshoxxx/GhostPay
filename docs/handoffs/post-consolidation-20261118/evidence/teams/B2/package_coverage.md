# Package coverage (candidate 7a620ff1)

Owner per assignment. B2 rows are inventoried in features.json (see feature ids). 'web dep' = listed in apps/web/package.json dependencies. src/test = non-test/test .ts(x) file counts excluding node_modules/dist.

| dir | owner | src files | test files | web dep | B2 feature ids |
|---|---|---|---|---|---|
| packages/address-safety | B1b | 7 | 4 | yes |  |
| packages/amount-blur | B3 | 13 | 8 | no |  |
| packages/btc-family | B3 | 22 | 9 | no |  |
| packages/btc-payjoin | B3 | 24 | 11 | no |  |
| packages/btc-silent-payments | B3 | 40 | 32 | yes |  |
| packages/chain-adapters | B1a | 34 | 26 | yes |  |
| packages/chain-evm-extra | B3 | 9 | 5 | no |  |
| packages/chain-solana | B3 | 17 | 10 | no |  |
| packages/chain-tron | B3 | 8 | 4 | no |  |
| packages/cli | B2 | 44 | 40 | no | F-CLI-01..06 |
| packages/confidential-amounts | B3 | 17 | 7 | no |  |
| packages/confidential-contracts | B3 | 4 | 3 | no |  |
| packages/contracts | B1a | 0 | 0 | no |  |
| packages/core-crypto | B1a | 11 | 9 | yes |  |
| packages/donation | B2 | 9 | 6 | no | F-MER-07 |
| packages/external-pools | B3 | 22 | 5 | no |  |
| packages/external-pools-privacypools | B3 | 11 | 8 | no |  |
| packages/external-pools-railgun | B3 | 7 | 4 | no |  |
| packages/hops | B3 | 16 | 8 | no |  |
| packages/hygiene | B2 | 14 | 5 | no | F-OPS-02 |
| packages/i18n | B2 | 26 | 12 | no | F-I18N-03 |
| packages/invoice-schema | B1a | 14 | 12 | yes |  |
| packages/merchant-billing | B2 | 13 | 10 | no | F-MER-01 |
| packages/merchant-hooks | B2 | 8 | 2 | no | F-MER-03 |
| packages/merchant-ledger | B2 | 7 | 1 | no | F-MER-02 |
| packages/merchant-multisig | B2 | 11 | 6 | no | F-MER-04 |
| packages/metadata-hardening | B3 | 15 | 10 | no |  |
| packages/net-harness | B3 | 9 | 1 | no |  |
| packages/net-transport | B3 | 22 | 4 | yes |  |
| packages/ops-monitor | B2 | 18 | 8 | no | F-OPS-01 |
| packages/payer-hiding-contracts | B3 | 0 | 0 | no |  |
| packages/payer-sponsor | B2 | 27 | 14 | no | F-RLY-05 |
| packages/payment-uri | B1a | 16 | 3 | yes |  |
| packages/pir-two-server | B3 | 13 | 4 | no |  |
| packages/plugin-api | B2 | 9 | 4 | no | F-INT-04 |
| packages/policy-scheme | B1a | 17 | 6 | yes |  |
| packages/pool-circuits | B3 | 10 | 5 | no |  |
| packages/pool-contracts | B3 | 0 | 0 | no |  |
| packages/pool-prover | B3 | 4 | 1 | no |  |
| packages/pool-relayer | B3 | 13 | 7 | no |  |
| packages/pool-sdk | B3 | 22 | 5 | no |  |
| packages/privacy-pipeline | B3 | 24 | 13 | no |  |
| packages/privacy-profiles | B3 | 14 | 6 | no |  |
| packages/qr-exchange | B1a | 11 | 7 | yes |  |
| packages/relayer-guard | B2 | 10 | 5 | no | F-RLY-04 |
| packages/sandbox | B2 | 14 | 9 | no | F-OPS-03 |
| packages/scan-source | B1a | 15 | 6 | yes |  |
| packages/sdk | B1a | 11 | 8 | no |  |
| packages/secret-box | B1b | 4 | 3 | yes |  |
| packages/solana-stealth | B3 | 18 | 6 | yes |  |
| packages/tron-adapter | B3 | 12 | 8 | yes |  |
| packages/tx-review | B1b | 7 | 5 | yes |  |
| packages/ux-connect | B2 | 7 | 4 | no | F-UX-01 |
| packages/ux-core | B2 | 7 | 5 | no | F-UX-02 |
| packages/ux-export | B2 | 12 | 6 | no | F-UX-03 |
| packages/ux-fees | B2 | 7 | 3 | no | F-UX-04 |
| packages/ux-fiat | B2 | 8 | 1 | no | F-UX-05 |
| packages/ux-flow | B2 | 9 | 5 | no | F-UX-06 |
| packages/ux-guide | B2 | 5 | 3 | no | F-UX-07 |
| packages/ux-i18n | B2 | 2 | 1 | no | F-UX-15 |
| packages/ux-intake | B2 | 10 | 6 | no | F-UX-08 |
| packages/ux-links | B2 | 14 | 5 | no | F-UX-09 |
| packages/ux-notify | B2 | 9 | 5 | no | F-UX-10 |
| packages/ux-presets | B2 | 8 | 4 | no | F-UX-11 |
| packages/ux-privacy | B2 | 5 | 2 | no | F-UX-12 |
| packages/ux-receipts | B2 | 16 | 2 | no | F-UX-13 |
| packages/ux-sandbox | B2 | 2 | 1 | no | F-UX-15 |
| packages/ux-schedule | B2 | 10 | 5 | no | F-UX-14 |
| packages/ux-vault | B1b | 20 | 7 | yes |  |
| apps/web | B1b | 206 | 225 | - |  |
| apps/relayer | B2 | 32 | 18 | no | F-RLY-01..03 |

Non-package B2 dirs: integrations/{woocommerce,prestashop,shopify} F-INT-01..03; examples/* F-MER-06; deploy/ F-HOST-01,02; infra/* F-HOST-04; tools/portable-hosting-kit F-HOST-03; apps/web/locales + src/i18n F-I18N-01,02; e2e a11y/devices F-A11Y-01..03; docs F-DOC-01..04.

Dirs not in any assignment list: none (every packages/* and apps/* dir mapped; contracts/pool-contracts/payer-hiding-contracts have 0 TS src = Solidity/other, owners B1a/B3).

Web-consumed packages (apps/web/package.json): address-safety, btc-silent-payments, chain-adapters, core-crypto, invoice-schema, net-transport, payment-uri, policy-scheme, qr-exchange, scan-source, secret-box, solana-stealth, tron-adapter, tx-review, ux-vault. All other B2 packages are NOT imported by any app: cli/merchant-*/relayer-guard are used by CLI or apps/relayer only; ops-monitor, payer-sponsor, plugin-api, donation, hygiene, i18n, ux-* (except ux-vault) have no app consumer.
