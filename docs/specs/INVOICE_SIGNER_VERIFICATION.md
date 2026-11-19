# Invoice signer verification

This specification describes the existing invoice-signing protocol and its local verification boundary. It follows
[ADR-0002, ADR-0005 and ADR-0010](../adr/ADR-LOG.md); version 2 gas-buffer fields follow ADR-0024. The implementation is
[`packages/invoice-schema`](../../packages/invoice-schema/README.md). No new cryptographic primitive, signature scheme,
invoice format, backend service or wallet requirement is introduced.

## Signing and canonicalization

The invoice-signing key is a dedicated secp256k1 key, separate from the spending and viewing keys. The public signer is
a valid 33-byte compressed SEC1 curve point encoded as exactly 66 lowercase hexadecimal characters, with no `0x`
prefix. The signature is exactly 64 compact bytes (`r || s`) encoded as 128 lowercase hexadecimal characters. DER,
recoverable 65-byte and uppercase encodings are rejected. High-s signatures are rejected.

The digest is:

```text
keccak256(UTF8("GhostPay.Invoice.v1\0") || canonicalInvoiceBytes)
```

The trailing domain byte is NUL. ECDSA signs the digest with noble's `prehash: false`, `lowS: true` options and
deterministic RFC 6979 nonces. The same domain applies to supported invoice body versions 1 and 2, because `v` is
itself authenticated inside the invoice. The signing library and its versions remain those pinned by the repository.

`canonicalInvoiceBytes` validates the complete invoice and encodes canonical JSON in UTF-8: sorted object keys, no
whitespace, NFC strings, and bounded non-negative integers. Large monetary quantities are canonical decimal strings.
The serialized envelope and decrypted private data must already equal their canonical representation. The parser
rejects duplicate/prototype keys, ambiguous numeric forms, malformed UTF-8, excess nesting and noncanonical text.
An ordinary JavaScript object with a different property insertion order produces the same canonical signing bytes;
noncanonical wire JSON is rejected rather than silently normalized.

## Authenticated payload

The signature covers the **complete plaintext invoice**, after any required decryption. There is no unsigned optional
metadata section. The schema rejects unknown fields.

| Fields | Meaning and verification boundary |
|---|---|
| `v`, `schemeId` | Invoice version and the supported scheme-1 recipient derivation. |
| `chainId` | The signed chain; changing it invalidates the signature. It is also in encrypted-envelope AAD. |
| `metaAddress` | The recipient's two distinct compressed spending/viewing public keys. This is the signed payment destination input. |
| `signer` | The key against which the payload signature is verified; replacing the key cannot retain a valid original signature. |
| `nonce` | A random 128-bit invoice identifier. It is authenticated, but is not an on-chain single-use authorization. |
| `token`, `amountPolicy` | Asset and the fixed-token amount or fiat-quote pricing mode. |
| `fiat`, `quote`, `tax`, `feePolicy` | Fiat statement, quote source/time/expiry/slippage, tax and fee allocation. Integrity does not establish the accuracy of a quote. |
| `expiresAt` | Invoice expiry. Signature verification itself does not check the clock; payment policy separately calls `checkExpiry`. |
| `lineItems`, optional `memo` | All supported item descriptions, quantities, unit amounts and memo text, including encrypted private fields. |
| `bufferPolicy` (body v2 only) | Gas-buffer acceptance, minimum, maximum and fixed `refund: "none"` policy. |

The fresh stealth destination, payment calldata, token approval, router and fee-recipient manifest are separately
derived or authenticated by the existing payment review path. They are not free-standing fields added to this invoice
format. Pin verification does not replace manifest authentication, expiry/token/chain checks, exact calldata review,
wallet consent or transaction verification. No contract or ERC-5564/ERC-6538 behavior changes.

## Envelope identifiers

Every supported invoice link begins `#gpi=v1.` and carries canonical, unpadded base64url-encoded JSON, at most 16 KiB
decoded. The envelope's `alg` selects encryption, **not** the signature algorithm.

| `alg` | Signed payload and authentication |
|---|---|
| `none` | `{alg, inv, sig}` contains the signed plaintext invoice. `sig` is still mandatory. |
| `A256GCM` | `{alg, pub, enc:{k,n,c}, sig}` encrypts only `lineItems` and `memo`. AAD is `"GPI1" || chainId(u64 BE) || signer(33 bytes)`. The AES key is in the link. |
| `A256GCM-PW` | `{alg, chainId, signer, kdf:{N,r,p,s}, enc:{n,c}}` encrypts canonical `{inv,sig}` with scrypt-derived AES-256-GCM. The existing bounded KDF and `GPI1-PW\0` AAD bind chain, signer, KDF parameters and salt. |

The AES-GCM tag authenticates ciphertext independently of the invoice signature. A holder of a bearer-link key or
passphrase can re-encrypt content, so successful decryption alone never proves signer integrity. Verification always
checks the signature over the resulting full plaintext invoice. A passphrase header is unauthenticated until decryption
and signature verification finish. Wrong passphrase and tampered passphrase ciphertext remain one fixed failure.

## Trust and status model

A valid signature proves that the holder of the embedded signing key authorized the canonical payload. It does not
establish a seller's legal identity, honesty, delivery of goods, payment, invoice freshness or a unique payment attempt.
An attacker can validly sign their own invoice. Trust therefore requires a signer public key obtained through an
independently trusted channel and explicitly pinned by the user.

`parseFragment` and `openFragment` preserve their default review behavior. The caller receives `signatureValid` and
`signerPinned`; an invalid signature can never have `signerPinned: true`. Pins compare case-insensitively against the
validated canonical signer. `requirePinnedSigner: true` throws `INVALID_SIGNATURE` before checking pin membership and
throws `UNTRUSTED_SIGNER` for a valid signature outside the pin set. An empty pin set trusts nobody. An unset/false
policy preserves review results. The shared package never creates, changes or persists pins.

For one selected seller, pass that seller's single pinned key. A list of multiple keys means any listed identity is
acceptable; it does not bind an invoice to a specific selected seller. Browser identity selection must enforce this
distinction and must not let one saved seller key satisfy another seller's expectation. When no named identity is
selected, the browser preserves the legacy Settings `pinnedSigners` trust set. Selecting a named identity always
overrides that global set: a different key in the legacy set cannot satisfy the selected identity's pin.

| Inspection outcome | Protocol result |
|---|---|
| Valid signature, selected trusted key matches | Valid signature and exact authenticated signer/pin match. |
| Valid signature, no applicable pin | Integrity-only result; never a successful pin match. |
| Valid signature, selected pin mismatches | Valid signature with mismatched identity; strict parsing throws `UNTRUSTED_SIGNER`. |
| Invalid signature | `signatureValid: false`, or `INVALID_SIGNATURE` under strict policy. Malformed signature bytes fail `SCHEMA` at `sig`. |
| Missing signature | `MISSING_SIGNATURE` at `sig` in a recognized signed container. Extra container fields are still `SCHEMA`. |
| Unsupported signature/envelope format | `UNSUPPORTED` for unknown envelope algorithms or positive numeric unsupported prefix/body versions. |
| Malformed invoice | Strict format/base64url/UTF-8/JSON/schema/canonical errors; no trusted result. Missing/invalid signer representations are schema errors. |
| Verification unavailable/interrupted | `VERIFICATION_UNAVAILABLE` when a required local crypto operation is unavailable or aborted. A UI/session cancellation also has no verification result. |

All library error messages are fixed and contain no fragment, private fields, passphrase or provider exception text.
Missing Web Crypto is a capability failure rather than an unsupported invoice algorithm. Plaintext signature checks
remain possible without Web Crypto; encrypted payloads require Web Crypto to recover the bytes to be signed.

## Offline, persistence and lifecycle boundaries

The parser, canonicalizer and signature verifier operate locally. They issue no RPC, HTTP, analytics or wallet requests.
The package has no DOM, browser storage or account dependency and never sees a private signing key during verification.
Only public pinned keys are caller inputs. Pin storage and user confirmation belong to the browser inspection workflow;
the parser does not imply persistence, synchronize browser tabs or authorize replacement.

Every browser verification operation must be scoped to the exact invoice, selected pin and current session. A result
from an old invoice, pin revision, cleared pin, lock/reset, seller change or unmounted component must be discarded.
Reopening an invoice requires a fresh current-context result; a previous successful result is not payment authority.
Cross-tab changes must invalidate the displayed identity comparison before any payment action relies on it.

### Browser pin persistence

[`invoiceSignerPins.ts`](../../apps/web/src/lib/invoiceSignerPins.ts) stores the optional named collection under
`ghostpay.invoiceSignerPins.v1` in the current origin's `localStorage`, as plain JSON:

```json
{"v":1,"revision":0,"pins":[]}
```

Each pin contains exactly `label` and `signer`. Labels are unique, trimmed NFC strings of at most 64 Unicode code points;
control/format/surrogate characters are refused. Public keys must be canonical lowercase compressed secp256k1 points,
validated on the curve. The collection allows at most 50 entries and 16,384 UTF-16 code units of stored JSON. Unknown
fields, duplicate JSON keys, invalid records, unavailable storage and read failures make the collection unavailable;
they do not silently create a trusted empty or partially recovered collection.

Creation, replacement and removal require explicit user confirmation. Writes use a nonwaiting exclusive Web Lock
named by the storage key. Under that lock, the store rereads the actual record and compares the expected previous
signer with the displayed identity before changing it. It also rechecks the current UI/session authority before writing
and verifies the read-back value. Lock contention or an unavailable lock/storage refuses the change. There is no silent
memory-only fallback that could be represented as a saved pin. The persisted revision increments and is retained when
the final pin is removed, so remove/re-add cannot revive an older confirmation for the same key.

Same-tab subscribers and native cross-tab storage/focus events cause fresh reads. Event payloads are never trusted as
the stored record, and asynchronous authority guards reread storage even before a queued event reaches the UI. Browser
state retains the selected name only for the active Pay view; saved names/keys persist across reloads. A removed
selected name stays unavailable until the user explicitly changes their expectation. The legacy Settings trust set
is not silently migrated into named identities.

Only user-entered names, public signer keys and a local concurrency revision are persisted by this collection. It does
not store invoice contents, private keys, passphrases, payment information or a network tracking identifier. No network
API is used. Public names/key associations can still reveal relationships to someone with browser-profile access.

The [browser user guide](../user/invoice-signer-pins.md) describes the confirmation controls, key rotation and recovery
from an incorrect pin. Same-origin browser storage and JavaScript are part of the trust boundary: a compromised origin
or browser can alter stored public pins and code. The revision/lock mechanism prevents honest-tab races; it is not
cryptographic authentication of browser storage.
This feature does not claim hardware-backed identity storage, an external audit, anonymity or product release readiness.

## Regression evidence

`verificationStatus.test.ts` covers distinct failure classes and a tamper matrix for all three existing envelope modes,
including valid re-encryption of altered payment, chain, token, amount, signer, expiry, nonce and metadata fields. It
also covers signed v2 gas-buffer policy changes. Existing `sign.test.ts`, `independent.test.ts`, `envelope.test.ts`,
`pinnedSigner.test.ts`, `passphrase.test.ts` and fuzz suites retain canonical, wrong-key, low-s, downgrade, malformed and
strict-pinning coverage. The task's source-pinned qualification report records actual commands/results; this specification
does not imply that any check not recorded there was executed.
