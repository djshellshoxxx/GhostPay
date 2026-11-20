# Audit evidence

These are outputs from this audit, not historical CI results. Expected-behavior regression failures demonstrate the recorded defects; they are not passing test qualifications. Test-source `.txt` copies retain original execution imports and paths for fidelity and are outside application test discovery. They use local synthetic data and mocks. The coverage manifest records source review independently of these checks.

Console logs retain their original whitespace, including final blank lines and reporter trailing spaces. The `.log.txt` suffix makes the evidence trackable without changing the repository's ignored-log policy.

| File | Original scratch-relative source |
|---|---|
| [payment-uri-tests.log.txt](payment-uri-tests.log.txt) | `payment-uri-tests.log` |
| [invoice-schema-tests.log.txt](invoice-schema-tests.log.txt) | `invoice-schema-tests.log` |
| [tx-review-tests.log.txt](tx-review-tests.log.txt) | `tx-review-tests.log` |
| [net-transport-tests.log.txt](net-transport-tests.log.txt) | `net-transport-tests.log` |
| [address-safety-tests.log.txt](address-safety-tests.log.txt) | `address-safety-tests.log` |
| [ux-vault-tests.log.txt](ux-vault-tests.log.txt) | `ux-vault-tests.log` |
| [core-crypto-tests.log.txt](core-crypto-tests.log.txt) | `core-crypto-tests.log` |
| [qr-exchange-tests.log.txt](qr-exchange-tests.log.txt) | `qr-exchange-tests.log` |
| [secret-box-tests.log.txt](secret-box-tests.log.txt) | `secret-box-tests.log` |
| [scan-source-tests.log.txt](scan-source-tests.log.txt) | `scan-source-tests.log` |
| [qa-ui.log.txt](qa-ui.log.txt) | `qa-ui.log` |
| [qa-ui-main.log.txt](qa-ui-main.log.txt) | `qa-ui-main.log` |
| [receipt-archive-regression.log.txt](receipt-archive-regression.log.txt) | `components-qa/receipt-regeneration.log` |
| [policy-state.log.txt](policy-state.log.txt) | `multichain-qa/policy-state.log` |
| [destination-networks.log.txt](destination-networks.log.txt) | `chain-core-qa/destination-networks.log` |
| [chain-core-boundary-check.log.txt](chain-core-boundary-check.log.txt) | `chain-core-boundary-check.log` |
| [build-main.log.txt](build-main.log.txt) | `build-main.log` |
| [build-latest.log.txt](build-latest.log.txt) | `build-latest.log` |
| [build-main-web.log.txt](build-main-web.log.txt) | `build-main-web.log` |
| [build-latest-web.log.txt](build-latest-web.log.txt) | `build-latest-web.log` |
| [build-main-web-retry.log.txt](build-main-web-retry.log.txt) | `build-main-web-retry.log` |
| [components-existing-latest.log.txt](components-existing-latest.log.txt) | `components-existing-latest.log` |
| [bugcheck-ui.test.tsx.txt](bugcheck-ui.test.tsx.txt) | `qa/bugcheck-ui.test.tsx` |
| [receipt-regeneration.test.tsx.txt](receipt-regeneration.test.tsx.txt) | `components-qa/receipt-regeneration.test.tsx` |
| [policy-state.test.tsx.txt](policy-state.test.tsx.txt) | `multichain-qa/policy-state.test.tsx` |
| [tron-cancel.mjs.txt](tron-cancel.mjs.txt) | `multichain-qa/tron-cancel.mjs` |
| [destination-networks.test.ts.txt](destination-networks.test.ts.txt) | `chain-core-qa/destination-networks.test.ts` |
| [chain-core-boundary-check.mjs.txt](chain-core-boundary-check.mjs.txt) | `chain-core-boundary-check.mjs` |
