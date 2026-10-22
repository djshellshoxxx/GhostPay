# Post-consolidation product and dependency validation

This report follows the completed source consolidation in [audit 22](22-consolidation-completion.md). Main remains the canonical development branch. The changes below are undergoing separate verification; prior green results do not certify new code.

## Dependency review

- PR #21 updates SHA-pinned `actions/cache` references to the verified upstream v6.1.0 commit. All CI and Integration checks passed before merge.
- PR #22 retains the compatible confidential-contract stack: `@fhevm/hardhat-plugin` 0.4.2, `@fhevm/solidity` 0.11.1 and `@zama-fhe/relayer-sdk` 0.4.1. Hosted checks reproduced the incompatible Solidity configuration and exact SDK-version assertion before both proposed bumps were reverted. The remaining update is Solana Kit 8.5.0. Revised CI run 39771903866 and Integration run 39771903872 both passed, including the complete 46-test confidential-contract suite, before merge to main at `c3e282b468cea55fff1a888b7702d5c93a9a9b0b`.
- PR #23 is closed as deferred. Its ten grouped major dependency upgrades contained no corresponding source/configuration migrations, and required checks failed on TypeScript 7 configuration and typed arrays, Hardhat 3 ESM requirements, and privacy-pools imports. This proposal contains no missing authored GhostPay modules. Keep the validated pins until staged migrations pass the full checks.

## Product changes under validation

- An optional local seller reconciliation ledger records selected verified router-scan observations, with seller/chain scoping, bounded storage, search, export, deletion and reorg invalidation. It deliberately stores no private keys, customer tags, invoice contents or signed receipts. Manual invoice digest associations are seller assertions. Plain-text local history is editable and is not current independent payment proof.
- Pay accepts seller receipt JSON from opt-in camera scanning or pasted QR text through the same bounded signature/invoice binding path used for files. It does not infer a trusted seller key from receipt content.
- Scan setup guards prevent overlapping starts and reject seller-session changes across asynchronous provider/manifest setup.

## Review and validation

Independent review found and closed stale scan-result actions after a chain/seller change, asynchronous scan setup/session mixing, and a timestamp bound that could crash date rendering on tampered local storage. Scan results/actions now remain scoped to the original chain, seller keys and signer; callbacks stop updating state after cancellation or scope changes. Ledger timestamps must fit JavaScript's valid date range. Regressions cover these triggers.

Local focused checks passed: ledger helper/component 18 tests, scan scope/cancellation 4 tests, receipt-to-ledger wiring 1 test, and selected Pay/ReceiptPanel receipt tests 3 tests (36 other tests unselected). Scoped ESLint passed for Pay, ReceiptPanel and QR-kind metadata. The committed-source secret scanner passed. Combined browser and final hosted workspace checks remain merge gates. The associated pull request records the final candidate SHA and exact check results; the baseline results in audit 22 are not reused as evidence for these additions.

The review found no remaining actionable authorization or fund-loss issue in this change. One low-impact camera behavior remains: after a QR has already been decoded, stopping the camera does not cancel an asynchronous receipt check already in progress. A valid receipt can finish importing, but it still must bind to the current invoice and does not initiate payment. Camera permission denial and unavailable decoding retain the text/file fallback. No physical-camera or funded-device certification is claimed.

## Remaining boundaries

Application-wide localization, sensitive key/device exchange, experimental scheme-2 activation and the external release gates remain in [completion gates](08-completion-gates.md). Professional security audit, trusted setup, release/deployer custody, real deployments and funded device/wallet operation require their own evidence. Automated and AI-assisted review does not replace those gates.
