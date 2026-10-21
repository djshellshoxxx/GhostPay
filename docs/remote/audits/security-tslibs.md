# Security audit: core-crypto, invoice-schema, chain-adapters

| | |
|---|---|
| Branch | `claude/remote-extensions-1` |
| Scope | `packages/core-crypto`, `packages/invoice-schema`, `packages/chain-adapters` (non-test `src/`) |
| Mode | Read-only static review. No source, test or config edited. No git commit. |
| Executed | Nothing. No tests, `tsc`, `npm audit`, RPC or on-chain calls were run. All findings are from reading code. |
| Read first | `packages/*/DEVIATIONS.md` (all three), `docs/audits/03-security-review-client-relayer.md` (sections 1, 3, 4, 5), `docs/adr/ADR-LOG.md` (ADR-0001, 0004), `docs/SPEC_REVIEW.md` (head only), `docs/CONTRACTS_SPEC.md` (routing rules), `docs/MULTICHAIN_SPEC.md` (grep only) |

Known or accepted items are not repeated below. They are listed in section 4.

## 1. Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | |
| High | 0 | |
| Medium | 1 | M-1 |
| Low | 5 | L-1 .. L-5 |
| Info | 5 | I-1 .. I-5 |

No new critical or high issue in these three packages. The main new risk is a trust-model gap in the payer flow (M-1). Most of the rest is API hardening, where a future or misused caller could cause harm.

## 2. Findings

### M-1 (Medium) Unpinned, valid-signature invoices are payable; the payee is whatever `metaAddress` the link carries

- **Where:**
  - `packages/invoice-schema/src/envelope.ts:302-306`: `trust` is `valid-signature` for any self-signed invoice whose key is not pinned.
  - `apps/web/src/lib/pay.ts:73-81`: the only trust-based blocker is `invalid-signature` (line 75). `valid-signature` does not block.
  - `apps/web/src/lib/pay.ts:46-52`: the copy for this state says only that the link "was not altered".
  - `packages/chain-adapters/src/adapter.ts:111` and `:188`: `buildPaymentRequest(inv)` takes no trust input and pays `deriveStealthPayment(inv.metaAddress, ...)`.
  - `docs/adr/ADR-LOG.md` line 9 says "trust requires pinning the signer".
- **Evidence:** by reading. The signature proves only possession of `invoice.signer`. The payee is `invoice.metaAddress`, which is set by whoever created the link.
- **Failing scenario:** a phisher builds an invoice with their own meta-address, signs it with their own key, and sends the link. The payer sees "Signature matches key X (not pinned)" as a warning, not a blocker, and pays the attacker's one-time address. The UI never says "this payee is unknown".
- **Fix:** block payment to unpinned payees unless the user explicitly confirms the payee key or meta-address. Better, make `buildPaymentRequest` accept only `TrustedSellerInvoice` (`isTrustedSeller`) or require an explicit `allowUnpinnedPayee` option. Show the payee meta-address in the review step.
- **Note:** this may be an accepted product choice. I found no ADR that accepts it. Not verified against the full ADR set.

### L-1 (Low) Invoice `token` accepts the zero address and a lowercase native marker

- **Where:** `packages/invoice-schema/src/schema.ts:98` (`ADDRESS_RE = /^0x[0-9a-f]{40}$/`) and `:238-239`. Only the literal `'native'` is special-cased.
- **Evidence:** by reading. `token: "0x0000000000000000000000000000000000000000"` and `token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"` both pass `validateInvoice`. `invoice-schema/DEVIATIONS.md` item 3 says "one encoding per value", which is not true for native.
- **Failing scenario:** the zero token fails later in `router.ts:92`. The native marker address fails the allowlist (`router.ts:154`). Both fail closed, so no funds move. The problem is that a schema-valid invoice is not canonical and can be presented as a different asset.
- **Fix:** in `validateInvoice`, reject the zero address and map the native marker to `'native'`, or reject it.

### L-2 (Low) `buildPermitTypedData` and `signPermit` do not bind spender, deadline or value

- **Where:** `packages/chain-adapters/src/sweep.ts:259-287` (`buildPermitTypedData`) and `:308-311` (`signPermit`).
  - `spender` is only checked non-zero (`addr`, line 271).
  - `deadline` is only range-checked (line 273). It is not compared with the current time.
  - `value` is only `!== 0n` and `<= 2^256-1` (lines 272 and 274).
- **Evidence:** by reading. `signPermit` signs whatever `td` contains, after checking only that `owner` is the key address.
- **Failing scenario:** a caller that passes `value = MAX_UINT256`, `deadline = MAX_UINT256` and an attacker-chosen `spender` causes the stealth key to sign an unlimited, non-expiring ERC-2612 allowance. The current app (`apps/web/src/lib/sweep.ts:126-132`) passes `spender = manifest.sweepRelayer` and `value = amount`, so this is latent. It is a footgun in an exported API.
- **Fix:** take an explicit spender allowlist from the verified manifest, require `deadline > now` and `value <= expectedAmount`, and reject `MAX_UINT256` unless the caller passes an explicit unlimited flag.

### L-3 (Low) Exported `signDigest` is a raw-hash signing oracle for one-time stealth keys

- **Where:** `packages/chain-adapters/src/sweep.ts:192-202`. `index.ts` re-exports it (`export * from './sweep.js'`). `apps/web/src/lib/sweep.ts:194` uses it to sign a transaction hash.
- **Evidence:** by reading. `signDigest(digest, secret)` accepts any 32-byte value. Its only check is that the recovered address matches the key.
- **Failing scenario:** a future code path passes an attacker-chosen 32-byte value from a relayer response or a dApp request. The stealth key signs it. That signature can then authorise anything on any contract that accepts ECDSA from that address, such as Permit2 or another domain.
- **Fix:** stop exporting `signDigest`. Expose only typed wrappers (`signSweep`, `signPermit`, `signTx`) that each have a fixed domain or type check.

### L-4 (Low) Production-facing `rng` parameters with no runtime guard

- **Where:**
  - `packages/core-crypto/src/stealth.ts:111` (`deriveStealthPayment(metaAddress, rng?)`)
  - `packages/core-crypto/src/keys.ts:216` (`generateKeySet(rng?)`)
  - `packages/core-crypto/src/rng.ts:158` (`randomScalar(rng?)`, exported)
  - `packages/invoice-schema/src/schema.ts:311` and `:331` (`randomBytes`, `createInvoice(input, rng?)`)
  - `packages/invoice-schema/src/envelope.ts:97` and `:171-172` (`encodeFragment` takes `options.rng` for the AES key and nonce)
  - `packages/chain-adapters/src/adapter.ts:66-67` and `:188` (`BuildOptions.rng`, comment says "tests only")
- **Evidence:** by reading. The doc comments say production callers omit `rng`, but nothing enforces it. Each parameter is exported.
- **Failing scenario:**
  1. A caller passes a seeded or repeating source in production. `encodeFragment` then reuses the same AES-256 key and 96-bit nonce across invoices, which breaks GCM confidentiality and integrity.
  2. A predictable ephemeral scalar `r` lets anyone with the public `P_view` compute `S = r·P_view`, `h = keccak(S) mod n` and the announced stealth address. That links the payment to the recipient without the viewing key.
- **Fix:** remove `rng` from production signatures, or move it behind a separate `*ForTests` export. Alternatively, check at runtime that the source is `globalThis.crypto` unless a test flag is set.

### L-5 (Low, latent) `fiat_quote` staleness is set by the invoice, and `maxSlippageBps` is not enforced

- **Where:**
  - `apps/web/src/lib/pay.ts:148`: `maxAgeSeconds = clamp(quote.expiresAt - quote.timestamp, 60, 86400)`. Both values come from the invoice, which is seller-controlled.
  - `packages/invoice-schema/src/schema.ts:25`, `:264`: `maxSlippageBps` is validated.
  - `apps/web/src/views/Pay.tsx:386`: shown to the payer.
  - Nowhere in `packages/` or `apps/web` is `maxSlippageBps` compared with an actual price movement (grep).
- **Evidence:** by reading. `packages/chain-adapters/src/quote.ts:36`: `FEEDS` is empty. `pay.ts:140-144` therefore blocks `fiat_quote` invoices today, so the impact is latent.
- **Failing scenario:** once a feed is configured, a seller can allow prices up to 24 h old, and the advertised slippage is never applied.
- **Fix:** use an app-side maximum age, not an invoice-supplied one. Enforce `maxSlippageBps` against the quoted and current price, or remove the field.

### I-1 (Info) Metadata and link leakage (documented design, listed for completeness)

- Router metadata carries the token address and the net amount in clear on-chain. See `packages/core-crypto/src/metadata.ts:256-267` and `:286-291`, which document this.
- Every GhostPay payment has `caller` equal to the router (`adapter.ts:225`), so all payments are clusterable by that address.
- The fragment repeats `signer` and `metaAddress` in every invoice. The encrypted form encrypts only `lineItems` and `memo`. Amounts, token, quote, tax, payee and `signer` stay in clear (`envelope.ts:150-156`).

### I-2 (Info) Dependency surface in the crypto package

- `packages/core-crypto/src/stealth.ts:5`, `metadata.ts:2` and `hex.ts:3` import `viem/utils` only for `getAddress` and `isAddress`. The full viem tree (pinned 2.57.7) therefore sits under a crypto primitive. `invoice-schema` has no viem dependency.
- `docs/adr/ADR-LOG.md` ADR-0004 already notes duplicate `@noble/curves` 1.x copies. `npm audit` was not run here.
- Suggested: implement EIP-55 with the existing keccak, and drop the viem dependency from `core-crypto`.

### I-3 (Info) Runtime type of `SecretScalar` is not checked on key-taking functions

- `packages/core-crypto/src/stealth.ts:148-152` (`checkAnnouncement`) and `:196-199` (`deriveStealthSecret`) trust the TypeScript brand. A plain `Uint8Array` with an invalid scalar reaches noble and throws a non-`GhostPayCryptoError`. This is caller error only, not attacker-triggerable.
- Fix: call `isScalarBytes` on entry.

### I-4 (Info) Permit `v` is not range-checked in the decoder

- `packages/chain-adapters/src/router.ts:243-249` and `:285-328`. `decodePaymentCalldata` accepts any `uint8` `v` for `payERC20WithPermit`. `parsePermitSignature` normalises to 27/28 only on the build path (`:204-210`).
- A calldata with `v = 0` or `1` would preview correctly and then be rejected by the token. No funds are at risk.
- Fix: in `assemble`, require `v` in {27, 28}.

### I-5 (Info) Line-item total check is skipped when there are no line items

- `apps/web/src/lib/pay.ts:80`: `if (inv.lineItems.length > 0 && totals.total !== fiat.minorUnits)`. An invoice with no items can show any fiat total. This is display only. The payment amount comes from `amountPolicy`.
- Fix: require `lineItems.length > 0`, or check that `fiat.minorUnits` is consistent with the tax field.

## 3. Checked and found safe (by reading)

- **core-crypto**
  - Scalar sampling is rejection sampling with a 64-attempt guard and no modular bias: `rng.ts:158-171`.
  - Scalars are range-checked, not reduced: `secret.ts:75-78`.
  - Points are on-curve checked, and prefix 02/03 is required: `secret.ts:119-127`.
  - View-tag early reject, then address compare: `stealth.ts:168-177`.
  - `deriveStealthSecret` self-checks the derived address: `stealth.ts:209-211`.
  - Spending and viewing keys must differ: `keys.ts:219`.
  - Errors use fixed messages with no input echo: `errors.ts`.
- **invoice-schema**
  - Strict JSON parser: duplicate, `__proto__`, `constructor` and `prototype` keys are rejected; numbers are safe non-negative integers; depth is capped at 8: `json.ts:30-155`.
  - Canonical byte-equality is required: `envelope.ts:242`, `:290`.
  - Base64url rejects non-zero trailing bits: `base64url.ts:219`.
  - Size limits are applied before decode: `envelope.ts:232-234`.
  - AES-GCM uses random 256-bit keys and 96-bit nonces, with AAD `GPI1 || chainId || signer`: `envelope.ts:112-116`.
  - Verification is low-s only: `sign.ts:105-108`.
  - Digest covers the full canonical plaintext: `sign.ts:44-46`.
  - `record()` rejects unknown keys: `schema.ts:117`.
  - Private keys cannot appear in `pub`: `envelope.ts:292`.
- **chain-adapters**
  - Full preview-vs-calldata cross-check, with calldata re-encode equality: `router.ts:366-380`, `:267-268`.
  - Net in metadata must equal computed net: `router.ts:308`.
  - Stealth address must not collide with router or fee recipient: `router.ts:137-139`.
  - Manifest validation is strict and rejects `__proto__` keys: `deployments.ts:55`, `:95`, `:101`.
  - RPC transport: `redirect: 'error'` (`rpc.ts:106`), streamed size cap (`:113-120`), strict quantity regex (`:173`), id match (`:297`), and no URL echo in errors (`:130-132`).
  - Sweep digest is cross-checked manually and by viem (`sweep.ts:214-215`). Signatures are self-recovered (`:199-200`).
  - Fee rounding matches docs: floor for router fee (`fees.ts:39-41`), ceil for gross-for-net (`:82-92`).
- **Sensitive logging.** No `console.`, `Math.random`, `eval` or `innerHTML` in the three `src/` trees (grep, non-test). No telemetry or network calls outside `rpc.ts`.

## 4. Known or accepted items (not repeated)

- `docs/audits/03`: S3-01 (manifest unauthenticated; `signature` field never verified), S3-02 (forged announcements shown as payments), S3-08 (`SecretBytes` is a guardrail), S3-09 (relayer fee parameters), S3-12 (bidi in text fields), S3-14 (RPC chain id checked once, log `blockHash` not cross-checked), S3-16 (tag vault splicing), S3-24 (duplicate noble copies), S3-25 (settings pins in localStorage).
- `core-crypto/DEVIATIONS.md` items 1-4. `invoice-schema/DEVIATIONS.md` items 1-3 (signature scope, invalid signature does not throw, totals not cross-checked in the package). `chain-adapters/DEVIATIONS.md` items 2, 3, 6, 9 (fee recipient not verified on-chain, amount semantics, flat-security not deployed, ABI generation by construction).

## 5. Could not verify

- Nothing was executed. Test suites, type checks and `npm audit` were not run.
- Contracts (`packages/contracts`) are out of scope. Reentrancy and authorisation in the router and relayer were not reviewed.
- Constant-time behaviour of noble `getSharedSecret`, `sign` and `multiply` was not checked. Noble and viem internals were not reviewed.
- Token addresses in `config/tokens.ts` and Chainlink feed addresses were not checked against issuer documentation. `TODO-VERIFY.md` covers this.
- ADR-0002, 0005 and 0010 were not read in full. The `valid-signature` policy in M-1 may be covered by a decision I did not read.
- Applications were checked only at the call sites listed. Relayer app and the rest of `apps/web` were not reviewed.
- The on-chain `bytecodeHashes` in manifests were not compared with deployed code (known gap in `chain-adapters/DEVIATIONS.md` item 2).
