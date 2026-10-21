# Audit: @ghostpay/sandbox
## Threat model
Main risk: test data mistaken for live (or the reverse): a test invoice presented to a payer as real, or sandbox faucet/fault tooling reachable in production. Also determinism bugs that make tests flaky.
## Findings and fixes
- F1 `brandAsTest` with empty memo plus `trimEnd` removed the marker's trailing space so `isTestInvoice` failed. Fixed: no trim, empty memo becomes `sandbox`.
- F2 Faucet mint inside a reorged block must not survive: faucet txs are always dropped on reorg (tested).
- F3 `brandAsTest` type did not expose `memo`; return type now `T & {memo: string}`.
- F4 Amount/address validation on every entry (lowercase only, positive, < 2^256).
## Honest limits
- Reserved range is a convention. Real chains with ids 31338-31399 are not known to exist but cannot be ruled out; live UIs must denylist the range AND require the memo marker.
- The memo marker is plain text in a signed invoice; a malicious seller can add it to a real-chain invoice (harmless: chain-id check fails) but cannot make a live-chain invoice pass `isTestInvoice`.
- Mock hash is non-cryptographic. No EVM semantics (gas, nonces, contracts). Wiring into apps/web is not done; see no wiring doc needed until the web app consumes it.
- Coverage 100% lines/branches in this package; thresholds unchanged.
