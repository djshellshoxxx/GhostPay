# Calldata, metadata and wire formats (byte layouts)

All offsets are zero-based byte offsets. "word" means a 32-byte ABI slot. Every hex value and size on this page was
computed from the generated ABIs or the source (commit `7aee906`) and cross-checked by encoding sample calls with viem;
sizes marked "sample" use a 33-byte ephemeral key and a 57-byte metadata, the only lengths the routers accept.

## Announcement metadata (57 bytes)

Built by `buildErc20Metadata` / `buildNativeMetadata` (core-crypto), required byte for byte by `GhostPayRouter` and
`GhostPayPolicyRouter`, parsed by `parseMetadata`.

| Offset | Size | ERC-20 payment | Native payment |
|---|---|---|---|
| 0 | 1 | view tag = `keccak256(S)[0]` (any value; the router cannot verify it) | same |
| 1 | 4 | `0xa9059cbb` (`transfer(address,uint256)` selector) | `0xeeeeeeee` |
| 5 | 20 | token address | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` |
| 25 | 32 | **net** amount (gross minus fee), big-endian `uint256`, never 0 | same |

Total 57. Example (Base Sepolia USDC, view tag `0xcb`, net `996000000 = 0x3b5dc100`):

```
cb a9059cbb 036cbd53842c5426634e7929541ec2318f3dcf7e 000000000000000000000000000000000000000000000000000000003b5dc100
```

Native, tag `0xab`, net `1`: `ab eeeeeeee eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee 0000...0001`. The layout mirrors the ERC-5564 `transfer`
example (selector, token, amount). The amount is public by design. A direct payer who bypasses the router can write any
metadata, so a parsed amount is a **claim** until verified (`verifyAnnouncementAmount`).

## Ephemeral public key (33 bytes)

SEC1 compressed secp256k1 point: byte 0 is `0x02` or `0x03`, bytes 1..32 the x coordinate. The routers check length 33 and
the prefix byte only; `parseCompressedPoint` (off-chain) also checks the point is on the curve. Uncompressed (65 byte) and
x-only keys are not accepted anywhere.

## ERC-5564 `Announcement` event

`event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)`

| Part | Content |
|---|---|
| topic0 | `0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7` (`ANNOUNCEMENT_TOPIC`) |
| topic1 | `schemeId` as a 32-byte word (`...0001` for scheme 1, `...47500002` for policy accounts) |
| topic2 | `stealthAddress` left-padded to 32 bytes |
| topic3 | `caller` left-padded to 32 bytes (the router for GhostPay payments) |
| data | `abi.encode(bytes ephemeralPubKey, bytes metadata)` |

`data` for 33-byte key and 57-byte metadata is **256 bytes**: word 0 `0x40` (offset of key), word 1 `0xa0` (offset of
metadata), word 2 `0x21` (length 33), words 3-4 key (33 bytes + 31 zero pad), word 5 `0x39` (length 57), words 6-7 metadata
(57 bytes + 7 zero pad). The view tag is the first byte of the metadata, **not** an indexed argument. `validateAnnouncementLog`
re-encodes the decoded data and requires equality, so non-canonical ABI encodings are skipped.

`FeeCollected(address indexed token, uint256 amount)`: topic0 `0x06c5efeff5c320943d265dc4e5f1af95ad523555ce0c1957e367dda5514572df`,
topic1 token (or the `0xEeee...EEeE` sentinel), data one word. Emitted by the router only when `fee > 0`.

## Router calldata (`GhostPayRouter`)

Standard Solidity ABI encoding; `bytes` arguments are dynamic (offset in the head, length-prefixed tail padded to 32).
With the only valid lengths the tails are fixed: key = 1 length word + 2 data words = 96 bytes, metadata = 96 bytes.

| Function | Selector | Head words (in order) | Sample size |
|---|---|---|---|
| `payERC20(address,address,uint256,uint256,uint256,bytes,bytes)` | `0xaf3d6d73` | token, stealth, gross, minNet, deadline, off(key)=`0xe0`, off(meta)=`0x140` | 420 |
| `payERC20WithPermit(address,address,uint256,uint256,uint256,bytes,bytes,uint8,bytes32,bytes32)` | `0x5074fd54` | token, stealth, gross, minNet, deadline, off(key)=`0x140`, off(meta)=`0x1a0`, v, r, s | 516 |
| `payNative(address,uint256,uint256,bytes,bytes)` | `0xb0c02fa3` | stealth, minNet, deadline, off(key)=`0xa0`, off(meta)=`0x100` | 356 |
| `payERC20WithBuffer(address,address,uint256,uint256,uint256,uint256,bytes,bytes)` | `0x8538e776` | token, stealth, gross, minNet, deadline, maxBufferWei, off(key)=`0x100`, off(meta)=`0x160` | 452 |

Sample size = 4 + 32 x head words + 96 + 96. Native value: `payNative` `msg.value = gross`; `payERC20WithBuffer` `msg.value =
buffer`; others 0. The `payERC20` words, decoded from a real encoding (`token=0x...1001`, `stealth=0x...2002`, gross
`1000000000`, minNet `996000000`, deadline `1700000000`):

```
  4  0000...1001                     token
 36  0000...2002                     stealth
 68  0000...3b9aca00                 gross
100  0000...3b5dc100                 minNet
132  0000...6553f100                 deadline
164  0000...00e0                     offset of ephemeralPubKey (7 words after the selector)
196  0000...0140                     offset of metadata
228  0000...0021                     length 33
260  02abab...ab 00..00              key bytes, zero padded to 64
324  0000...0039                     length 57
356  cba9059cbb036c...  00..00       metadata bytes, zero padded to 64
```

`decodePaymentCalldata` re-encodes the decoded call and requires the exact input, so trailing bytes or non-canonical offsets
make the preview check fail.

### `GhostPayPolicyRouter` calldata

Same as above with a `bytes32 salt` (`keccak256(abi.encode(owner, policyHash))`) after `stealth` (or after `stealth` in
`payNative`), and a `(uint8 v, bytes32 r, bytes32 s)` tuple (3 inline words) for the permit.

| Function | Selector | Head words | Sample size |
|---|---|---|---|
| `payERC20(address,address,bytes32,uint256,uint256,uint256,bytes,bytes)` | `0x95e21466` | token, stealth, salt, gross, minNet, deadline, off(key)=`0x100`, off(meta)=`0x160` | 452 |
| `payERC20WithPermit(address,address,bytes32,uint256,uint256,uint256,bytes,bytes,(uint8,bytes32,bytes32))` | `0x992f560d` | token, stealth, salt, gross, minNet, deadline, off(key)=`0x160`, off(meta)=`0x1c0`, v, r, s | 548 |
| `payNative(address,bytes32,uint256,uint256,bytes,bytes)` | `0x2efffba1` | stealth, salt, minNet, deadline, off(key)=`0xc0`, off(meta)=`0x120` | 388 |
| `payERC20WithBuffer(address,address,bytes32,uint256,uint256,uint256,uint256,bytes,bytes)` | `0xd403121c` | token, stealth, salt, gross, minNet, deadline, maxBufferWei, off(key)=`0x120`, off(meta)=`0x180` | 484 |

(Before the N-01 change these took `(address owner, bytes32 policyHash)` inline and had different selectors; ABIs generated
at older commits are wrong.)

## Sweep relayer calldata and EIP-712 encoding

`struct Sweep` is static (8 words, encoded inline); `bytes sweepSig` is dynamic.

| Function | Selector | Layout | Sample size |
|---|---|---|---|
| `sweep((address,address,address,address,uint256,uint256,uint256,uint256),bytes)` | `0xbad66243` | words 0-7 the `Sweep` fields (`token, owner, destination, feeTo, amount, fee, deadline, nonce`), word 8 offset `0x120`, then length 65 + 96 bytes of signature | 420 |
| `sweepWithPermit(Sweep,bytes,(uint256,uint256,uint8,bytes32,bytes32))` | `0x361e8aef` | words 0-7 `Sweep`, word 8 offset of `sweepSig` (`0x1c0`), words 9-13 the `PermitSig` (`value, deadline, v, r, s`), then the signature tail | 580 |

`sweepSig` is 65 bytes `r || s || v` (`v` 27/28, low-s). EIP-712 hashing of an order:

```
typehash   = keccak256("Sweep(address token,address owner,address destination,address feeTo,uint256 amount,uint256 fee,uint256 deadline,uint256 nonce)")
           = 0xd364d849b4b3fcf6d55557d576adc7a5363ae607555219988e043f366f005531
structHash = keccak256(abi.encode(typehash, token, owner, destination, feeTo, amount, fee, deadline, nonce))   // 9 words, 288 bytes
domainSep  = keccak256(abi.encode(0x8b73c3c6...400f, keccak256("GhostPaySweepRelayer"), keccak256("1"), chainId, relayer))
digest     = keccak256(0x1901 || domainSep || structHash)
```

`0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f` is `keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")`.
The ERC-2612 permit uses the **token's** domain (name and version read from the token; Circle USDC version `"2"`) and
`Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)`; its signature is passed split into
`v, r, s`.

## Policy account formats

| Item | Definition |
|---|---|
| `policyHash` | `keccak256(abi.encode(address destination, uint256 delaySeconds, bytes32 limitsRoot))` (96-byte preimage) |
| CREATE2 `salt` | `keccak256(abi.encode(address owner, bytes32 policyHash))` (64-byte preimage) |
| Clone creation code (OpenZeppelin `Clones` 5.x, 55 bytes) | `3d602d80600a3d3981f3363d3d373d3d3d363d73` (20) `\|\|` implementation (20) `\|\|` `5af43d82803e903d91602b57fd5bf3` (15) |
| Account address | `address(keccak256(0xff \|\| factory \|\| salt \|\| keccak256(creationCode))[12:])` |
| Limit leaf | `keccak256(bytes.concat(keccak256(abi.encode(address token, uint256 limit, uint64 windowSeconds))))` |
| Merkle tree | sorted-pair `keccak256(a, b)` (smaller first), leaves sorted by hash; flat array `tree[0]` root, leaf `i` at `tree[len-1-i]`; one-leaf tree: root = leaf, proof empty; `limit = 2^256-1` means unlimited |
| Request id | the `Withdraw` struct hash: `keccak256(abi.encode(WITHDRAW_TYPEHASH, token, amount, deadline, nonce, limitLeafHash))` |
| Scheme-2 meta-address | `st:eth:gp2:0x` + spend33 + view33 + policyHash32 (196 hex digits; 209 chars total) |

Typehashes (computed from the type strings; the contracts use the same strings): `Withdraw`
`0xffeb215f025c01628a78e6366a168516f13ecc344c411e565b1564f5c4f20955`, `CancelWithdraw`
`0xf0d8f5f0337de03f06a9d6754d9ae78dbc0811027fa6c44b7e02453b019dd861`, `ProposeDestination`
`0x10294cd73f34c122b5b9fb575b8f787ef212a5ba08f22cf7366337188fbbf7ac`, `CancelDestination`
`0x1546cb2585190c4712e63f866d7810cdf66d9100f5a440b742fe263fd77a37ce`. Domain: `"GhostPayPolicyAccount"`, `"1"`, chain id,
the clone address.

`PolicyAccountFactory.deploy` selector `0xaffdf337` (`deploy(address,address,uint256,bytes32)`), `PolicyAccount.requestWithdraw`
`0x30d51307` (`requestWithdraw((address,uint256,uint256,uint256,bytes32),(uint256,uint64,bytes32[]),bytes)`),
`executeWithdraw(bytes32)` `0x32342d03`. `LimitProof` is dynamic (contains `bytes32[]`).

## Meta-addresses

| Form | Layout | Length |
|---|---|---|
| Scheme 1 | `st:eth:0x` + `<P_spend 33 bytes hex><P_view 33 bytes hex>`, lowercase on output, spend key first | 9 + 132 = **141** characters |
| Scheme 2 (GhostPay-specific) | `st:eth:gp2:0x` + spend33 + view33 + policyHash32 | 13 + 196 = **209** characters |
| ERC-6538 registry bytes | spend33 `\|\|` view33 (66 bytes) as the `bytes` argument of `registerKeys(1, ...)` | 66 bytes |

Keys are compressed SEC1 points; spend and view keys must differ.

## Invoice fragment and envelope

`location.hash` value `#gpi=v1.` + `base64url(envelopeBytes)`. Base64url is RFC 4648 section 5, **unpadded**, canonical
(trailing bits must be zero; `=`, `+`, `/`, whitespace and length `mod 4 == 1` are rejected). `envelopeBytes` is canonical
JSON (UTF-8): object keys sorted by UTF-16 code unit, no whitespace, strings NFC with `JSON.stringify` escaping, numbers only
non-negative safe integers (large values are decimal strings), no duplicate keys, depth at most 8. The parser requires
`canonicalize(parse(bytes)) === bytes`. Limits: decoded size <= 16 384 bytes (16 385 rejected); encoded payload at most
`ceil(16384 * 4 / 3)` characters.

Plain: `{"alg":"none","inv":<Invoice>,"sig":"<128 hex>"}` (key order is the sorted order `alg, inv, sig`).
Encrypted: `{"alg":"A256GCM","enc":{"c":"<hex>","k":"<64 hex>","n":"<24 hex>"},"pub":<Invoice without lineItems and memo>,"sig":"<128 hex>"}`.

Observed sizes for one line item, native token, 141-character meta-address: plain envelope 865 bytes (fragment 1 162
characters), encrypted 1 097 bytes (fragment 1 471 characters).

| Field | Rule |
|---|---|
| `sig` | 64-byte compact ECDSA (r then s, low-s) over `keccak256("GhostPay.Invoice.v1\0" \|\| canonicalBytes(full plaintext invoice))`, verified against `invoice.signer` |
| `enc.k` | random 32-byte AES-256 key, hex |
| `enc.n` | random 12-byte nonce, hex |
| `enc.c` | AES-256-GCM ciphertext of `canonicalize({lineItems, memo?})` with the 16-byte tag appended (at least 16 bytes), hex |
| AAD | `"GPI1"` (4 bytes) `\|\|` `chainId` as `uint64` big-endian (8 bytes) `\|\|` signer public key (33 bytes) = 45 bytes; for chain 84532 the middle is `0000000000014a34` |

The AES key travels in the fragment, so the link is a bearer secret. Invoice field shapes: `packages/invoice-schema/src/schema.ts`
(normative for v1, ADR-0010).

## Relayer quote token

`v1.<expiresAt>.<fee>.<hex>`: `expiresAt` unix seconds (1-12 digits), `fee` decimal, `hex` = 64 lowercase hex characters of
`HMAC-SHA256(QUOTE_SECRET, claims)` where `claims` is the UTF-8 string joined with `\n`:
`ghostpay-quote-v1`, `chainId`, `token`, `owner`, `destination`, `amount`, `fee`, `feeTo` (addresses lower-cased), `expiresAt`.

## Seller key backup (web app)

`apps/web/src/lib/keystore.ts` writes JSON `{ v: 1, kdf: 'scrypt', kdfParams: { N, r, p, salt }, cipher: 'AES-256-GCM', iv,
meta: { metaAddress, signer }, ciphertext }` with scrypt `N = 2^17, r = 8, p = 1`, passphrase NFKC-normalised, AAD
`"GhostPay.keystore.v1|<metaAddress>|<signer>|<N>|<r>|<p>"`; `N` is bounded to `[2^14, 2^20]`, the file to 8 KiB, the
passphrase to at least 10 characters. Plaintext holds the spending, viewing and invoice-signing keys.

## Selectors, topics and typehashes

Computed with viem from the generated ABIs (commit `7aee906`).

| Name | Value |
|---|---|
| `ERC-5564 announce(uint256,address,bytes,bytes)` | `0x4d1f9583` |
| `Announcement` topic0 | `0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7` |
| ERC-20 `Transfer` topic0 | `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` |
| `FeeCollected` topic0 | `0x06c5efeff5c320943d265dc4e5f1af95ad523555ce0c1957e367dda5514572df` |
| `Swept` topic0 | `0xf84bad408c039b5a953d2107920b192a190136cd283a1f5bc35558e7d7ae53ea` |
| `AccountDeployed` / `FeeWaived` topic0 | `0xc696b81c0117824045f3a89b5f4db265a7cfbc16cc9a43222f39d91a1ca19757` / `0x578e1423c44fcaf68aa7b1a12d831e1a419bcd548c433022dc75136c023f485a` |
| `WithdrawRequested` topic0 | `0x4625958bb30b35c209b91132296ca831b399fd3d47ec19b852a32e236bef6bfb` |
| `WithdrawExecuted` topic0 | `0x4b7e3321843f346afd1db54b1751c4a3e520b18e4de795baaac5a6c5a89ee64e` |
| `WithdrawCancelled` topic0 | `0xa4d52f4c33f8d0683fda2d4d61f93782366bd9e363626a931bd3e1cd698ad999` |
| ERC-6538 `registerKeys(uint256,bytes)` / `stealthMetaAddressOf(address,uint256)` | `0x042c7aa3` / `0x7aa8b5ad` |
| ERC-20 `transfer(address,uint256)` / ERC-2612 `permit(...)` | `0xa9059cbb` / `0xd505accf` |
| Router custom errors | `ZeroAddress 0xedc1b8eb`, `InvalidStealth 0xf0dc01ff`, `Expired 0x86e4a7ac`, `ZeroAmount 0x7a943395`, `SlippageExceeded 0x5dc903af`, `InvalidEphemeralKey 0x6feed27e`, `InvalidMetadata 0x70cd6adf`, `UnexpectedBalanceDelta 0x731f7aa8`, `NativeTransferFailed 0x7d1c76f2`, `BufferTooLarge 0x386aa26a`, `BufferRequired 0xd663b430`, `NoDirectETH 0xcf6cf5ad` |
| Policy router extra errors | `NotPolicyAccount(address) 0x5f790514`, `FactoryHasNoCode 0x88388627` |
| Sweep relayer errors | `SelfAddress 0xbd058358`, `InvalidAmount 0xd0dc6b60`, `InvalidSignature 0x9e2496ec`, `NonceAlreadyUsed 0xcabcfcbb`, `PermitValueTooLow 0x8b0b71b5` |
| Factory errors | `AlreadyDeployed(address) 0xfc1a24c4`, `DelayTooShort(uint256) 0xc4d00100`, `UnexpectedFeeDelta 0x35a66fba`, `FeeTransferFailed 0xba01b110` |

Regenerate any of these with `toFunctionSelector` / `toEventSelector` from viem over the exported ABIs rather than copying
them from here when a contract changes.
