# Workspace test execution report

Observed UTC: `2026-11-18T15:12:18.332018+00:00`. Source: `e8c77e7e8699dd16b86b7a1ff90b834594d07105`.

Outcome: **completed_successfully**. Existing session: `55369`. Collected process exit: `0`.

Workspace invocations started: **68**; complete summaries without failure markers: **68**.

Reported test totals: `{"passed": 12402, "skipped": 79}`.

All 68 workspace invocations have complete summaries, and the coordinator collected aggregate exit 0. The 79 skipped cases remain unexecuted; separate phases without coverage do not add coverage evidence.

| Workspace | Passed | Failed | Skipped | Todo | Coverage S/B/F/L | Evidence status |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| @ghostpay/address-safety | 76 | 0 | 0 | 0 | 100.00 / 97.43 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/amount-blur | 96 | 0 | 0 | 0 | 98.20 / 95.47 / 100.00 / 99.70 | summaries_complete |
| @ghostpay/btc-family | 162 | 0 | 0 | 0 | 96.75 / 94.04 / 100.00 / 99.78 | summaries_complete |
| @ghostpay/btc-payjoin | 158 | 0 | 0 | 0 | 97.31 / 92.69 / 98.36 / 99.51 | summaries_complete |
| @ghostpay/btc-silent-payments | 559 | 0 | 0 | 0 | 97.80 / 95.85 / 98.44 / 99.46 | summaries_complete |
| @ghostpay/chain-adapters | 584 | 0 | 0 | 0 | 97.51 / 96.64 / 99.11 / 99.05 | summaries_complete |
| @ghostpay/chain-evm-extra | 44 | 0 | 0 | 0 | 96.50 / 94.00 / 97.05 / 99.42 | summaries_complete |
| @ghostpay/chain-solana | 97 | 0 | 0 | 0 | 98.71 / 97.77 / 98.30 / 99.61 | summaries_complete |
| @ghostpay/chain-tron | 42 | 0 | 0 | 0 | 100.00 / 100.00 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/cli | 570 | 0 | 0 | 0 | 98.61 / 97.33 / 99.07 / 99.49 | summaries_complete |
| @ghostpay/confidential-amounts | 88 | 0 | 0 | 0 | 99.38 / 95.18 / 100.00 / 99.76 | summaries_complete |
| @ghostpay/confidential-contracts | 46 | 0 | 0 | 0 | not reported | summaries_complete |
| @ghostpay/core-crypto | 76 | 0 | 0 | 0 | 98.50 / 98.16 / 100.00 / 98.21 | summaries_complete |
| @ghostpay/donation | 68 | 0 | 0 | 0 | 100.00 / 100.00 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/external-pools | 94 | 0 | 0 | 0 | 99.12 / 96.66 / 99.30 / 100.00 | summaries_complete |
| @ghostpay/external-pools-privacypools | 73 | 0 | 4 | 0 | 98.11 / 91.46 / 98.85 / 99.77 | summaries_complete |
| @ghostpay/external-pools-railgun | 20 | 0 | 1 | 0 | 98.92 / 94.89 / 97.82 / 100.00 | summaries_complete |
| @ghostpay/hops | 57 | 0 | 0 | 0 | 100.00 / 100.00 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/hygiene | 142 | 0 | 0 | 0 | 100.00 / 99.67 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/i18n | 215 | 0 | 0 | 0 | 99.91 / 97.00 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/invoice-schema | 731 | 0 | 0 | 0 | 98.09 / 97.77 / 100.00 / 99.26 | summaries_complete |
| @ghostpay/merchant-billing | 275 | 0 | 0 | 0 | 99.69 / 99.66 / 100.00 / 99.80 | summaries_complete |
| @ghostpay/merchant-hooks | 35 | 0 | 0 | 0 | 100.00 / 99.58 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/merchant-ledger | 27 | 0 | 0 | 0 | 100.00 / 99.31 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/merchant-multisig | 92 | 0 | 0 | 0 | 99.15 / 98.40 / 100.00 / 99.67 | summaries_complete |
| @ghostpay/metadata-hardening | 115 | 0 | 0 | 0 | 99.48 / 98.83 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/net-harness | 27 | 0 | 0 | 0 | 96.13 / 90.52 / 96.96 / 99.11 | summaries_complete |
| @ghostpay/net-transport | 156 | 0 | 0 | 0 | 97.64 / 96.60 / 96.49 / 97.92 | summaries_complete |
| @ghostpay/ops-monitor | 113 | 0 | 0 | 0 | 98.01 / 93.59 / 97.72 / 99.78 | summaries_complete |
| @ghostpay/payer-sponsor | 135 | 0 | 4 | 0 | 99.28 / 98.04 / 99.37 / 99.57 | summaries_complete |
| @ghostpay/payment-uri | 199 | 0 | 0 | 0 | 97.31 / 96.53 / 100.00 / 99.08 | summaries_complete |
| @ghostpay/pir-two-server | 60 | 0 | 0 | 0 | 99.14 / 93.29 / 98.76 / 99.74 | summaries_complete |
| @ghostpay/plugin-api | 45 | 0 | 0 | 0 | 98.52 / 97.36 / 98.46 / 99.13 | summaries_complete |
| @ghostpay/policy-scheme | 95 | 0 | 0 | 0 | 97.11 / 94.70 / 100.00 / 99.74 | summaries_complete |
| @ghostpay/pool-circuits | 18 | 0 | 59 | 0 | 100.00 / 100.00 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/pool-prover | 8 | 0 | 0 | 0 | 98.61 / 95.31 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/pool-relayer | 43 | 0 | 9 | 0 | 97.65 / 95.78 / 96.59 / 100.00 | summaries_complete |
| @ghostpay/pool-sdk | 47 | 0 | 0 | 0 | 98.73 / 95.85 / 99.10 / 99.77 | summaries_complete |
| @ghostpay/privacy-pipeline | 747 | 0 | 0 | 0 | 99.34 / 97.07 / 99.70 / 99.50 | summaries_complete |
| @ghostpay/privacy-profiles | 176 | 0 | 0 | 0 | 97.07 / 93.93 / 98.95 / 98.66 | summaries_complete |
| @ghostpay/qr-exchange | 233 | 0 | 0 | 0 | 97.57 / 95.17 / 100.00 / 99.08 | summaries_complete |
| @ghostpay/relayer-guard | 167 | 0 | 0 | 0 | 98.62 / 94.14 / 99.25 / 99.19 | summaries_complete |
| @ghostpay/sandbox | 95 | 0 | 0 | 0 | 100.00 / 99.69 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/scan-source | 72 | 0 | 0 | 0 | 98.76 / 95.82 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/sdk | 54 | 0 | 0 | 0 | 99.63 / 97.81 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/secret-box | 47 | 0 | 0 | 0 | 98.85 / 98.93 / 100.00 / 99.33 | summaries_complete |
| @ghostpay/solana-stealth | 109 | 0 | 0 | 0 | 97.83 / 95.61 / 97.91 / 99.55 | summaries_complete |
| @ghostpay/tron-adapter | 74 | 0 | 0 | 0 | 97.29 / 93.64 / 98.79 / 99.50 | summaries_complete |
| @ghostpay/tx-review | 160 | 0 | 0 | 0 | 99.58 / 98.67 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/ux-connect | 129 | 0 | 0 | 0 | 99.62 / 99.32 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/ux-core | 119 | 0 | 0 | 0 | 100.00 / 97.94 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/ux-export | 134 | 0 | 0 | 0 | 99.80 / 98.25 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/ux-fees | 50 | 0 | 0 | 0 | 98.56 / 98.37 / 98.07 / 99.75 | summaries_complete |
| @ghostpay/ux-fiat | 48 | 0 | 0 | 0 | 100.00 / 99.31 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/ux-flow | 91 | 0 | 0 | 0 | 99.16 / 97.72 / 100.00 / 99.20 | summaries_complete |
| @ghostpay/ux-guide | 62 | 0 | 0 | 0 | 99.43 / 99.47 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/ux-i18n | 2 | 0 | 0 | 0 | 0.00 / 0.00 / 0.00 / 0.00 | summaries_complete |
| @ghostpay/ux-intake | 77 | 0 | 0 | 0 | 99.67 / 99.42 / 100.00 / 99.79 | summaries_complete |
| @ghostpay/ux-links | 49 | 0 | 0 | 0 | 99.53 / 99.02 / 100.00 / 99.69 | summaries_complete |
| @ghostpay/ux-notify | 79 | 0 | 0 | 0 | 99.81 / 99.15 / 98.88 / 99.76 | summaries_complete |
| @ghostpay/ux-presets | 57 | 0 | 0 | 0 | 99.05 / 98.66 / 98.43 / 100.00 | summaries_complete |
| @ghostpay/ux-privacy | 33 | 0 | 0 | 0 | 100.00 / 99.13 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/ux-receipts | 117 | 0 | 0 | 0 | 99.74 / 98.19 / 98.07 / 99.66 | summaries_complete |
| @ghostpay/ux-sandbox | 2 | 0 | 0 | 0 | 0.00 / 0.00 / 0.00 / 0.00 | summaries_complete |
| @ghostpay/ux-schedule | 133 | 0 | 0 | 0 | 99.54 / 97.95 / 100.00 / 100.00 | summaries_complete |
| @ghostpay/ux-vault | 352 | 0 | 0 | 0 | 96.99 / 94.24 / 99.50 / 98.89 | summaries_complete |
| @ghostpay/relayer | 484 | 0 | 1 | 0 | 97.08 / 92.75 / 98.05 / 98.87 | summaries_complete |
| @ghostpay/web | 2962 | 0 | 1 | 0 | 93.30 / 89.52 / 95.04 / 97.04 | summaries_complete |

## Failures and incomplete execution

No workspace summary failure/incomplete state was identified in the captured log.

## Validation and limits

- Counts are executed test cases in this npm invocation, not unique behaviors or independent security properties.
- A reported summary does not independently reveal a workspace process exit; aggregate exit is supplied only after coordinator observation.
- Minimal reporter does not identify every skipped test. Skip reasons remain unknown unless separately established from retained evidence.
- Coverage percentages are each phase's reported aggregate; they are not combined across workspaces.
- Start-clock strings retain runtime-local formatting and are not relabeled UTC.

Captured log SHA-256: `df758e1fd7d1a95be14c27d74370a5e8af406707db41d8eb95d6dc89f7660e17` (260844 bytes).

## Collected execution metadata

```json
{
  "source": "e8c77e7e8699dd16b86b7a1ff90b834594d07105",
  "command": "npm test",
  "node": "22.23.5",
  "npm": "11.21.2",
  "env": {
    "NODE_OPTIONS": "--max-old-space-size=1536",
    "VITEST_MAX_WORKERS": "1",
    "RAYON_NUM_THREADS": "1",
    "ANVIL_BIN": "/workspace/scratch/4fa14be12559/toolchain-probe/bin/anvil",
    "CAST_BIN": "/workspace/scratch/4fa14be12559/toolchain-probe/bin/cast",
    "SOLC_BIN": "/workspace/scratch/4fa14be12559/toolchain-probe/bin/solc",
    "FOUNDRY_SOLC": "/workspace/scratch/4fa14be12559/toolchain-probe/bin/solc"
  },
  "exitCode": 0,
  "seconds": 2204.93,
  "log": "package-tests.log"
}
```
