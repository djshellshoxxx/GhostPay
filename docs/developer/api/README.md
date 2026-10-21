# API reference: conventions and index

One page per package. Every page lists: purpose, install/import, exports (grouped), signatures copied from `src/`,
error codes, a verified example, and pitfalls. Packages are ESM only (`"type": "module"`), `private: true`
(never published to npm), version `0.1.0`, and are consumed inside the workspace through their built `dist/`.

| Page | Package | Entry |
|---|---|---|
| [core-crypto.md](core-crypto.md) | `@ghostpay/core-crypto` | `packages/core-crypto/src/index.ts` |
| [invoice-schema.md](invoice-schema.md) | `@ghostpay/invoice-schema` | `packages/invoice-schema/src/index.ts` |
| [chain-adapters.md](chain-adapters.md) | `@ghostpay/chain-adapters` | `packages/chain-adapters/src/index.ts` |
| [policy-scheme.md](policy-scheme.md) | `@ghostpay/policy-scheme` | `packages/policy-scheme/src/index.ts` |
| [btc-silent-payments.md](btc-silent-payments.md) | `@ghostpay/btc-silent-payments` | `packages/btc-silent-payments/src/index.ts` |
| [apps.md](apps.md) | `@ghostpay/relayer` (HTTP API, config) and `@ghostpay/web` (module map) | `apps/*/src` |

## Cross-package conventions

- **TypeScript**: `tsconfig.base.json` is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`. With `exactOptionalPropertyTypes` you cannot pass `{ x: undefined }` for an optional `x`;
  omit the key (chain-adapters' own code spreads conditionally for that reason).
- **Imports** use explicit `.js` subpaths for noble 2.x (`@noble/curves/secp256k1.js`, `@noble/hashes/utils.js`).
- **Errors**: each package throws exactly one error family with a stable `code`; messages are fixed strings and never
  echo key bytes, addresses or user input (some append a package-chosen *field name*, e.g. `INVALID_DELAY: delaySeconds`).
- **Secrets**: `SecretScalar` (core-crypto, and a separate copy in btc-silent-payments) is a `Uint8Array` subclass that
  throws on `JSON.stringify`, `String()`, template strings, `toLocaleString`, `Symbol.toPrimitive` and `util.inspect`.
  Call `unsafeRevealSecret` only at an explicit export boundary and `zeroize` the copy. Zeroization is best effort.
- **Randomness**: production callers pass no RNG; everything uses `crypto.getRandomValues` with rejection sampling.
  Each package exposes `rng?: RandomSource` (`Pick<Crypto, 'getRandomValues'>`) for deterministic tests only.
- **Addresses**: core-crypto, chain-adapters, policy-scheme accept all-lowercase or valid EIP-55 mixed case and return
  EIP-55. invoice-schema accepts **only** lowercase. A mixed-case string with a wrong checksum is rejected everywhere.
- **Numbers**: amounts are `bigint`; JSON carriers (invoice, relayer API, manifest `policyFlatFee`) use decimal strings
  for anything that may exceed 2^53.

## Running the samples yourself

The samples are plain ESM. From the repository root, after `npm ci --ignore-scripts && npm run build:libs`:

```bash
# save a sample as /tmp/sample.mjs, then import the built dist by path, e.g.
#   import { generateKeySet } from '/abs/path/to/ghostpay/packages/core-crypto/dist/index.js';
node /tmp/sample.mjs
```

Inside a workspace package you can write `import ... from '@ghostpay/core-crypto'` directly. `policy-scheme` and
`btc-silent-payments` are not covered by `build:libs`; build them with `npm run build -w @ghostpay/policy-scheme`
(which also builds core-crypto) or `npm run build -w @ghostpay/btc-silent-payments`.
