# `@ghostpay/core-crypto`

ERC-5564 **scheme 1** stealth-address engine (secp256k1), pinned by ADR-0001. Source: `packages/core-crypto/src/`.
Runtime deps: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `viem` 2.57.7 (`getAddress`/`isAddress` only).
Matches `@scopelift/stealth-address-sdk@1.0.0-beta.5` (dev dependency, differential tests only; never imported by `src`).

## The maths (ADR-0001)

```
S   = p_eph * P_view              33-byte compressed SEC1 point
s_h = keccak256(S)                32 bytes; view tag = s_h[0]
h   = int(s_h) mod n              must be non-zero
Q   = P_spend + h*G               address = last 20 bytes of keccak256(Q.x || Q.y), EIP-55
p   = (p_spend + h) mod n         must be non-zero; re-mapped to the announced address before use
```

Receiver side swaps the roles: `S = p_view * R`. A change of the hash requires a new scheme id.

## Exports

### Keys and meta-address (`keys.ts`)

```ts
interface StealthKeySet {
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
  readonly spendingSecret: SecretScalar;
  readonly viewingSecret: SecretScalar;
}
interface MetaAddressKeys { readonly spendingPublicKey: CompressedPoint; readonly viewingPublicKey: CompressedPoint }

function generateKeySet(rng?: RandomSource): StealthKeySet
function encodeMetaAddress(keys: MetaAddressKeys): string      // 'st:eth:0x' + spend33 + view33, lowercase, 141 chars
function decodeMetaAddress(metaAddress: string): MetaAddressKeys
```

- `generateKeySet` samples both scalars independently; `KEY_REUSE` if the RNG returns the same scalar twice.
- `encodeMetaAddress` accepts a whole `StealthKeySet` too (structural typing) but only reads the two public keys.
- `decodeMetaAddress` requires exactly 132 hex digits after `st:eth:0x` (case-insensitive input, canonical output). It
  rejects the 66-hex single-key form, uncompressed keys, off-curve x, and identical spend/view keys.

### Stealth derivation and scanning (`stealth.ts`)

```ts
interface DerivedStealthPayment {
  readonly stealthAddress: Address;           // EIP-55
  readonly ephemeralPublicKey: CompressedPoint; // 33 bytes
  readonly viewTag: Uint8Array;               // exactly 1 byte
  readonly metadataPrefix: Uint8Array;        // same single byte; must start the announcement metadata
}
interface PublicAnnouncement {
  readonly schemeId?: bigint;                 // if present must be 1n
  readonly stealthAddress: string;
  readonly ephemeralPublicKey: string;        // 0x-hex, 33 bytes
  readonly metadata: string;                  // 0x-hex; metadata[0] is the view tag
}
type AnnouncementCheck = { readonly matches: false } | { readonly matches: true; readonly stealthAddress: Address };

function deriveStealthPayment(metaAddress: string, rng?: RandomSource): DerivedStealthPayment
function checkAnnouncement(announcement: PublicAnnouncement, viewingSecret: SecretScalar, spendingPublicKey: CompressedPoint): AnnouncementCheck
function deriveStealthSecret(announcement: PublicAnnouncement, keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>): SecretScalar
```

- `checkAnnouncement` never throws on malformed **chain data** (bad hex, bad point, scheme != 1, empty metadata, wrong
  EIP-55 checksum, zero hash) and returns `{ matches: false }` so one hostile log cannot stop a scanner. It throws
  `GhostPayCryptoError` only for bad **key arguments** (`INVALID_SCALAR`/`INVALID_POINT`).
  The view tag is compared first; the address is derived only on a tag hit (about 1 in 256 for unrelated logs).
- `deriveStealthSecret` throws on any mismatch (`VIEW_TAG_MISMATCH`, `ADDRESS_MISMATCH`, `ZERO_STEALTH_KEY`,
  `INVALID_ANNOUNCEMENT`). The returned key has been mapped back to its address and compared; never sign with a key
  that did not come through this check.
- Mixed-case `stealthAddress` must be a valid EIP-55 checksum; all-uppercase hex is rejected (`strict` address parse).

### Router metadata (`metadata.ts`) - see [byte-layouts.md](../byte-layouts.md#announcement-metadata-57-bytes)

```ts
const ERC20_TRANSFER_SELECTOR = 'a9059cbb';
const NATIVE_SELECTOR = 'eeeeeeee';
const NATIVE_TOKEN_ADDRESS: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const METADATA_LENGTH = 57;

interface ParsedMetadata { readonly viewTag: number; readonly kind: 'erc20' | 'native'; readonly token: Address; readonly netAmount: bigint }

function buildErc20Metadata(viewTag: number | Uint8Array, token: string, netAmount: bigint): Uint8Array
function buildNativeMetadata(viewTag: number | Uint8Array, netAmount: bigint): Uint8Array
function parseMetadata(metadata: Uint8Array | string): ParsedMetadata
```

Amounts must be in `[1, 2^256-1]` (`INVALID_AMOUNT`); the ERC-20 token must be neither zero nor the native marker
(`INVALID_ADDRESS`); `parseMetadata` throws `INVALID_METADATA` for anything that is not exactly the router layout.
`netAmount` is the **net** the stealth address receives (gross minus the 25 bps fee), because the router checks
`metadata[25:57] == net`.

### Secrets and points (`secret.ts`, `rng.ts`)

```ts
type SecretScalar = Uint8Array & { readonly [secretBrand]: 'SecretScalar' };   // 32 bytes in [1, n-1]
type CompressedPoint = Uint8Array & { readonly [pointBrand]: 'CompressedPoint' }; // 33 bytes, 02/03, on curve
const CURVE_ORDER: bigint
function secretScalarFromBytes(bytes: Uint8Array): SecretScalar   // validates range, copies
function unsafeRevealSecret(secret: SecretScalar): Uint8Array      // plain copy; you own it
function zeroize(...buffers: readonly Uint8Array[]): void          // best effort
function parseCompressedPoint(bytes: Uint8Array): CompressedPoint  // 33 bytes, prefix 02/03, on curve
type RandomSource = Pick<Crypto, 'getRandomValues'>
function randomScalar(rng?: RandomSource): SecretScalar            // rejection sampling in [1, n-1]
```

`structuredClone`/`postMessage` of a `SecretScalar` copies the raw bytes into a plain `Uint8Array` (the redaction does
not survive). The web app does this once on purpose when it starts the scan worker (see
[security-model.md](../security-model.md#3-secrets-and-the-scanner-worker)).

### Errors (`errors.ts`)

`class GhostPayCryptoError extends Error { readonly code: CryptoErrorCode }`, codes:
`INVALID_SCALAR`, `INVALID_POINT`, `INVALID_META_ADDRESS`, `INVALID_ANNOUNCEMENT`, `INVALID_ADDRESS`, `INVALID_METADATA`,
`INVALID_VIEW_TAG`, `INVALID_AMOUNT`, `ZERO_HASH`, `INFINITY_POINT`, `ZERO_STEALTH_KEY`, `VIEW_TAG_MISMATCH`,
`ADDRESS_MISMATCH`, `KEY_REUSE`, `RNG_UNAVAILABLE`, `RNG_FAILURE`.

Also exported: types `Address`, `Hex`.

## Verified example

Executed against `packages/core-crypto/dist` (Node 22.22.0). Keys are random, so the view tag, addresses and key bytes
in the comments are from one run and differ every time.

```ts
import {
  generateKeySet, encodeMetaAddress, deriveStealthPayment, checkAnnouncement, deriveStealthSecret,
  buildErc20Metadata, parseMetadata, unsafeRevealSecret, zeroize, GhostPayCryptoError,
} from '@ghostpay/core-crypto';
import { bytesToHex } from 'viem';

// Recipient
const keys = generateKeySet();
const meta = encodeMetaAddress(keys);                       // 'st:eth:0x03215d65a2c...' (141 chars)

// Sender
const pay = deriveStealthPayment(meta);
const token = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';  // Base Sepolia USDC
const metadata = buildErc20Metadata(pay.viewTag, token, 996_000_000n);   // 57 bytes
// -> 0xcb a9059cbb 036cbd53842c5426634e7929541ec2318f3dcf7e <32-byte 0x3b5dc100>  (spaces added)

// Recipient scans one log
const ann = {
  schemeId: 1n,
  stealthAddress: pay.stealthAddress,
  ephemeralPublicKey: bytesToHex(pay.ephemeralPublicKey),
  metadata: bytesToHex(metadata),
};
const hit = checkAnnouncement(ann, keys.viewingSecret, keys.spendingPublicKey);
// { matches: true, stealthAddress: '0x08d5...F493' }   (address differs per run)
if (hit.matches) {
  const secret = deriveStealthSecret(ann, keys);            // 32-byte SecretScalar, address-verified
  try { JSON.stringify(secret); } catch { /* TypeError: redacted */ }
  const raw = unsafeRevealSecret(secret);                   // plain Uint8Array copy
  zeroize(raw);
}
parseMetadata(ann.metadata);  // { viewTag: 203, kind: 'erc20', token: '0x036C...F7e', netAmount: 996000000n }

// Another recipient's keys never match
const other = generateKeySet();
checkAnnouncement(ann, other.viewingSecret, other.spendingPublicKey); // { matches: false }
```

`pay.viewTag` is a `Uint8Array` of length 1; `buildErc20Metadata` also accepts the number form (`0xcb`).

## Pitfalls

- Pass the **net** amount to the metadata builders, not the gross. Use `chain-adapters`' `routerSplit`/`grossForNet`.
- Metadata is public on-chain: it reveals token and net amount.
- Do not call `deriveStealthPayment` once and reuse the result for two payments: the ephemeral key is the uniqueness source.
- `checkAnnouncement` proves only the address derivation, not that funds arrived; check the balance (audit L-02/S3-02).
- `zeroize` cannot defeat JIT/GC copies; do not describe it as secure erasure.
- Mocking: pass an `RandomSource` whose `getRandomValues` fills deterministic bytes (see `src/rng.testutil.ts`). Never in production.

Tests: `vectors.test.ts` (`test-vectors/scheme1.json`), `differential.test.ts` (1000 payments vs the SDK),
`properties.test.ts` (fast-check), `negative.test.ts`, `hash-edge.test.ts` (keccak mocked to force `h = 0` / `h >= n`),
`secrets.test.ts`, `metadata.test.ts`. Deviations from the SDK and from the spec's API sketch: `packages/core-crypto/DEVIATIONS.md`.
