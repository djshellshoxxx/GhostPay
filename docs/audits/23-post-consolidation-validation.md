# Post-consolidation product and dependency validation

This report follows the completed source consolidation in [audit 22](22-consolidation-completion.md). Main remains the canonical development branch. The changes below passed separate automated validation before promotion; prior green results were not reused to certify new code.

## Dependency review

- PR #21 updates SHA-pinned `actions/cache` references to the verified upstream v6.1.0 commit. All CI and Integration checks passed before merge.
- PR #22 retains the compatible confidential-contract stack: `@fhevm/hardhat-plugin` 0.4.2, `@fhevm/solidity` 0.11.1 and `@zama-fhe/relayer-sdk` 0.4.1. Hosted checks reproduced the incompatible Solidity configuration and exact SDK-version assertion before both proposed bumps were reverted. The remaining update is Solana Kit 8.5.0. Revised CI run 39771903866 and Integration run 39771903872 both passed, including the complete 46-test confidential-contract suite, before merge to main at `c3e282b468cea55fff1a888b7702d5c93a9a9b0b`.
- PR #23 and its regenerated duplicate #25 are closed as deferred. Its ten grouped major dependency upgrades contained no corresponding source/configuration migrations, and required checks failed on TypeScript 7 configuration and typed arrays, Hardhat 3 ESM requirements, and privacy-pools imports. This proposal contains no missing authored GhostPay modules. Keep the validated pins until staged migrations pass the full checks.

## Product changes under validation

- An optional local seller reconciliation ledger records selected verified router-scan observations, with seller/chain scoping, bounded storage, search, export, deletion and reorg invalidation. It deliberately stores no private keys, customer tags, invoice contents or signed receipts. Manual invoice digest associations are seller assertions. Plain-text local history is editable and is not current independent payment proof.
- Pay accepts seller receipt JSON from opt-in camera scanning or pasted QR text through the same bounded signature/invoice binding path used for files. It does not infer a trusted seller key from receipt content.
- Scan setup guards prevent overlapping starts and reject seller-session changes across asynchronous provider/manifest setup.

## Review and validation

Independent review found and closed stale scan-result actions after a chain/seller change, asynchronous scan setup/session mixing, and a timestamp bound that could crash date rendering on tampered local storage. Scan results/actions now remain scoped to the original chain, seller keys and signer; callbacks stop updating state after cancellation or scope changes. Ledger timestamps must fit JavaScript's valid date range. Regressions cover these triggers.

Local focused checks passed: ledger helper/component 18 tests, scan scope/cancellation 4 tests, receipt-to-ledger wiring 1 test, and selected Pay/ReceiptPanel receipt tests 3 tests (36 other tests unselected). Scoped ESLint passed for Pay, ReceiptPanel and QR-kind metadata. The committed-source secret scanner passed. Candidate `bb011134c1bf9cd0e75090fec75d85235d637281` passed all required jobs in [CI run 39774066101](https://github.com/djshellshoxxx/GhostPay/actions/runs/39774066101) before [PR #24](https://github.com/djshellshoxxx/GhostPay/pull/24) merged. Web verification passed 651 tests (61 files), with one live-Bitcoin test skipped in ordinary CI and separately exercised in the baseline regtest evidence. Coverage was 91.68% statements / 86.05% branches / 91.97% functions / 95.33% lines, above the unchanged 90/85/90/90 thresholds. The normal hosted Playwright build-and-start path passed 17/17 tests in 20.7 seconds. Workspace typecheck, lint, build, production dependency audit, contract and package jobs passed. The ledger regression suite exercises 2,000 records and refuses an additional save without changing stored data.

The local combined Playwright attempt hit the existing 180-second build/start budget before any browser assertions ran. A separate duplicate fixture build was stopped after the exact-candidate hosted browser job passed; neither local attempt is counted as passing evidence. The hosted job used the normal configuration without increasing timeouts or lowering test/coverage gates.

Promotion merge: `ca30bf821f412f0af50b2725722b0e968e6fed12`. A following documentation-only closure records these results; its runtime tree is identical to the validated candidate. The baseline results in audit 22 remain scoped to their original candidate.

The review found no remaining actionable authorization or fund-loss issue in this change. One low-impact camera behavior remains: after a QR has already been decoded, stopping the camera does not cancel an asynchronous receipt check already in progress. A valid receipt can finish importing, but it still must bind to the current invoice and does not initiate payment. Camera permission denial and unavailable decoding retain the text/file fallback. No physical-camera or funded-device certification is claimed.

## Remaining boundaries

Application-wide localization, sensitive key/device exchange, experimental scheme-2 activation and the external release gates remain in [completion gates](08-completion-gates.md). Professional security audit, trusted setup, release/deployer custody, real deployments and funded device/wallet operation require their own evidence. Automated and AI-assisted review does not replace those gates.
