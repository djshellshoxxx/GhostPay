# @ghostpay/address-safety

Pure checks that an address or display text means what it appears to mean. Spec: [`docs/remote/specs/address-safety.md`](../../docs/remote/specs/address-safety.md).

- `parseStrictAddress`: `0x` + 40 hex; lowercase accepted, mixed case must be valid EIP-55, all-uppercase rejected. Returns the checksummed address or a `Reason`.
- `lookalikeScore`, `findLookalikes`: first/last N nibble matches against known addresses (address poisoning).
- `classifyDestination`: `saved`, `own_stealth`, `fee_recipient`, `lookalike_of_saved` (hard stop) or `new`.
- `fingerprint`: full address in fixed four-nibble groups, never truncated.
- `metaAddressFingerprint`: 80-bit SHA-256 digest for out-of-band comparison.
- `payeeTrust`: `pinned`, `unpinned_valid_signature` (needs explicit confirmation) or `invalid`.
- `sanitizeDisplayText`: rejects bidi controls, default-ignorable, private-use, tag characters, control characters and unpaired surrogates; marks Latin+Cyrillic/Greek tokens.

Runtime dependency: `viem` (checksum only) plus Node `node:crypto`. **Not wired in** to any app or package. Nothing here has been run in a browser; the Playwright cross-engine check in the spec is not done.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```

## Status and deviations

Library only; not imported by any app or package; no external audit.
Differences from the spec and open items: [`DEVIATIONS.md`](./DEVIATIONS.md). Scripts (`package.json`): `build`, `typecheck`, `test` (`vitest run --coverage`), `lint`.
