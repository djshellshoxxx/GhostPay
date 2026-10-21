# Deviations and discrepancies (core-crypto)

Status of the spec/SDK comparison (2026-10-21): **no maths discrepancy found.**
ADR-0001 (compressed 33-byte ECDH point -> keccak256 -> tag `s_h[0]`, `P = P_spend + (s_h mod n)G`,
`p = (p_spend + s_h) mod n`) matches `@scopelift/stealth-address-sdk@1.0.0-beta.5` exactly on
1000 differential payments (see `src/differential.test.ts`) and on the fixed vectors.

## Intentional differences from the SDK (not disagreements about scheme-1 maths)

| # | SDK behaviour | This package | Reason |
|---|---------------|--------------|--------|
| 1 | Accepts a 66-hex single-key meta-address (same key for spend and view) | Rejects it, and rejects identical spend/view keys | DEVELOPER_SPECIFICATION: never reuse one key for both roles |
| 2 | `getStealthPublicKey` feeds the raw hash to `fromPrivateKey`, which throws if the hash is `>= n` | Reduces `s_h mod n` and rejects only 0 | ADR-0001 / task text; probability ~2^-128, so no differential test can reach it. Covered by `src/hash-edge.test.ts` with keccak mocked |
| 3 | `generatePrivateKey` silently falls back to a random key if a supplied ephemeral key is invalid | Never substitutes: invalid scalars throw | fail closed |
| 4 | Announcement input hardening not exercised/compared | Strict hex, EIP-55 strict address input (all-uppercase hex rejected), output always checksummed | hostile-log hardening |

## Deviations from the DEVELOPER_SPECIFICATION API sketch

- `SecretScalar` brand uses a module-private `unique symbol` property (the sketch's
  `{ readonly __secret: unique symbol }` is not valid TypeScript).
- `PublicAnnouncement` is hex-string based (`stealthAddress`, `ephemeralPublicKey`, `metadata`, optional `schemeId: bigint`).
- `rng?: Crypto` is typed `Pick<Crypto, 'getRandomValues'>` (`RandomSource`) so test doubles need not implement all of `Crypto`.
- `viewTag` is a 1-byte `Uint8Array` as specified; `metadataPrefix` is a second copy of the same single byte.
- `checkAnnouncement` returns `{ matches: false }` (never throws) for malformed on-chain data; it throws only for invalid key arguments.
- Added exports not in the sketch: `decodeMetaAddress`, `randomScalar`, `secretScalarFromBytes`, `unsafeRevealSecret`, `parseCompressedPoint`, `zeroize`, metadata helpers.

## Tooling notes

- TypeScript is pinned to 5.9.3, not 7.x: `typescript-eslint@8.72.0` declares `typescript <6.1.0`.
- The SDK's published ESM uses extensionless imports and cannot be loaded by plain Node. Vitest inlines it
  (`server.deps.inline`); `test-vectors/generate.mjs` loads it through Vite's SSR loader.
