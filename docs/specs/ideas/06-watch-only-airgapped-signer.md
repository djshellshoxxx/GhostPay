# 06 (idea D2) Watch-only mode and air-gapped sweep signer

Status: proposal-grade spec, not reviewed, not built. Priority P2 | Effort L (about 3 weeks one engineer, 2 more for audit fixes) | Owner: apps/web + new `packages/signer-protocol` | Date 2026-10-21, branch `claude/remote-extensions-3`.
Sources read: `docs/remote/ideas.md` (D2, D3, D5, D7, B3 mentions), `docs/remote/research.md` s1-2, `docs/specs/08-feature4-archive-key-rotation.md`, `packages/core-crypto/src/{stealth,keys,secret}.ts`, `packages/chain-adapters/src/sweep.ts`, `packages/contracts/src/GhostPaySweepRelayer.sol`, `apps/web/src/lib/{session,keystore,sweep,qr,scannerCore}.ts`. Source line numbers are not cited because the tree is shared and moving. Anything not read in source is marked UNVERIFIED.

## 1. Problem

Today one page holds spending key, viewing key and invoice-signing key in memory (`session.ts`, `SessionSecrets`), and `sweep.ts` derives the stealth key `p_spend + h` on that same page. A compromised static bundle (threat D7: hosting or supply-chain compromise) can therefore sign a sweep to an attacker destination. Scanning only needs the viewing secret and the spending PUBLIC key (`scannerCore.ts` `start` message carries exactly those). So the spend secret does not have to be online.

Goal: split the profile so the online page can scan, list, tag, create invoices and PREPARE sweeps, while sweeps are signed on a separate offline device that decodes and shows the full sweep for human confirmation, and returns only signatures.

## 2. Goals and non-goals

Goals
- G1 Watch-only profile on the online page: no spend secret ever enters that origin.
- G2 Offline signer: separately delivered, network-less build; signs only two action types (relayed EIP-712 sweep + permit; direct native/ERC-20 transfer tx), after re-deriving everything it can and showing the rest.
- G3 Transfer by animated QR (camera) and by file (USB stick, AirDrop-free manual copy). Both directions.
- G4 No operator, no service. Everything static; the signer works from a local file.
- G5 The signer never trusts request fields it can recompute or check against an embedded allowlist.

Non-goals (explicit)
- N1 Does NOT make a key safe that was ever online. Moving an existing online-generated spend key to an offline device does not undo prior exposure. Such users must rotate to a new meta-address (needs D3-style migration; out of scope here).
- N2 Not hardware-wallet support. A hardware wallet cannot apply the stealth tweak (ideas D3). The "offline device" is a general computer or phone in airplane mode with a verified build.
- N3 Not protection against a compromised online page that shows the wrong thing to a user who does not read the offline screen. The offline screen is the only trusted display (s7).
- N4 No hosted signing, no remote signer, no relay of QR frames over a network. Rejected: anything needing a server (s12).
- N5 Invoice-signing key stays online in v1 (invoices need frequent signing; loss means forged invoices, not fund loss). Optional later.
- N6 No multi-party/threshold signing.

## 3. UX

Profiles (Seller keys view)
1. "Create keys on an offline device": opens the signer build; generates spend/view/signing keys there (same `generateKeySet`), shows encrypted full keystore (backup, existing v1 file format) and a WATCH-ONLY bundle (s5.2) as QR/file. Passphrase required for both (min length as `passphraseProblem`).
2. Online page: "Import watch-only profile" -> scan QR or pick file -> passphrase. Header badge "Watch-only: this page cannot spend". Scan, tags, invoices work. Sweep button label becomes "Prepare sweep for offline signing".
3. Sweep flow (relayed): destination + amount as today -> relayer quote (as `getSweepQuote`, fee cap checked) -> page builds a `SignRequest`, shows animated QR plus "Save request file" and the 16-hex request fingerprint.
4. Offline device: open signer, import keystore from USB (passphrase), scan request. Signer shows a decoded card (s6.3), user taps "Sign" after a 3-second hold (no accidental tap). Signer shows response QR + file download.
5. Online page: "Scan signed response" -> verifies against the pending request -> submits to relayer (or broadcasts raw tx via the user's RPC). Shows tx link.
6. Cancel/expiry: pending requests list with expiry; expired ones auto-discard.

Rules: the signer has no "sign anything" screen and no free-text message signing. Direct sweep requires the stealth address to hold native gas (existing limitation; funding links addresses, see sweep-and-gas-privacy doc).

## 4. Architecture

New package `packages/signer-protocol` (pure TS, no DOM, no network): types, canonical encode/decode, framing, request validation, signer decision function. Depends on `core-crypto`, `chain-adapters` (`buildSweepTypedData`, `signSweep`, `signPermit`, `signDigest`, `addressOfSecret`, `assertSponsorFeeAcceptable`, chain/token tables, `erc20Abi`), `invoice-schema` (`canonicalize`, `parseStrictJson`, `encodeBase64Url`).

New app entry `apps/web/signer.html` + `src/signer/*` built as a SEPARATE bundle (no React Router, no scanner, no RPC client, no relayer client). Release outputs:
- `ghostpay-signer-<ver>.html`: single self-contained file, inline script allowed ONLY via CSP hash: `default-src 'none'; script-src 'sha256-<hash>'; style-src 'sha256-<hash>'; img-src blob: data:; media-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'`. `connect-src 'none'` is the offline guarantee against exfiltration even if the user forgets airplane mode.
- Its SHA-256 and the embedded manifest hash are listed in the signed release manifest (`release.ts`).
- The same code is also served at `/signer/` on the static host for convenience, but the docs say: download the single file, verify the hash on a second device, move by USB.

Embedded data in the signer build (so it needs no network): chain table and token table from `chain-adapters/config`, and the verified deployment manifest per chain (router, sweepRelayer, announcer, feeRecipient). The manifest is read-back verified at BUILD time by the release pipeline (spec 01), not at run time, since the signer is offline. A new deployment means a new signer build (documented as a limit).

QR scanning (online side reads response, offline side reads request): needs a decoder. Options: `BarcodeDetector` (not available in all browsers; UNVERIFIED current support), or a pinned pure-JS decoder (`jsQR`, UNVERIFIED exact version/licence/maintenance). Decision deferred to an ADR; requirement: exact pinned version, no network, bundle-scanned, decoder fuzzed with oversize/garbled input. QR generation reuses `qr.ts` (`qrcode-generator`, local).

## 5. Exact formats

### 5.1 Common rules
- JSON canonicalised with `invoice-schema` `canonicalize` (sorted keys, NFC, no whitespace, integers only). All uint256 values and timestamps beyond 2^53 are decimal strings; addresses lowercase 0x-hex 40 chars in the wire form (EIP-55 only for display); hex bytes lowercase.
- Strict parse (`parseStrictJson`): duplicate keys rejected, unknown keys rejected, max payload 16384 bytes, max depth 6.
- `requestHash = sha256("GhostPay.SignRequest.v1\0" || canonicalBytes(request))` (32 bytes). `fingerprint` = first 8 bytes of `requestHash` as four 4-hex groups. It detects transport corruption only; it does NOT authenticate content to a human because a compromised page controls its own display.

### 5.2 Types
```ts
type Hex = `0x${string}`; type Addr = `0x${string}`; // lowercase on wire

interface SignRequestV1 {
  v: 1;
  kind: 'ghostpay.sign-request';
  id: string;               // 32 hex, random, unique per request
  createdAt: number;        // unix s, online clock
  expiresAt: number;        // <= createdAt + 900 (15 min). Signer refuses larger windows.
  profile: string;          // 16 hex = first 8 bytes of keccak256(spendPub33 || viewPub33); must equal loaded keystore
  chainId: number;
  action: RelayedSweepAction | DirectSweepAction;
}

interface AnnouncementRef {  // what the signer needs to re-derive the key; all public
  stealthAddress: Addr;
  ephemeralPublicKey: Hex;   // 33 bytes
  metadata: Hex;             // >= 1 byte, byte0 = view tag
}

interface RelayedSweepAction {
  type: 'relayed-sweep';
  announcement: AnnouncementRef;
  token: Addr;
  owner: Addr;               // must equal announcement.stealthAddress
  destination: Addr;
  feeTo: Addr;
  amount: string;            // uint256 dec
  fee: string;               // uint256 dec
  deadline: string;          // uint256 dec, unix s
  nonce: string;             // uint256 dec, 128 random bits from online page
  relayer: Addr;             // GhostPaySweepRelayer; must equal embedded manifest value
  permit: { name: string; version: '1' | '2'; nonce: string; value: string; deadline: string };
}

interface DirectSweepAction {
  type: 'direct-sweep';
  announcement: AnnouncementRef;
  token: Addr | 'native';
  owner: Addr;
  destination: Addr;
  amount: string;            // ERC-20: amount to move. native: balance observed (signer recomputes value)
  txNonce: number;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

interface SignResponseV1 {
  v: 1;
  kind: 'ghostpay.sign-response';
  requestId: string;
  requestHash: Hex;          // sha256 as above
  signer: Addr;              // stealth address that signed
  result:
    | { type: 'relayed-sweep'; sweepSig: Hex /*65B r||s||v*/; permit: { v: number; r: Hex; s: Hex } }
    | { type: 'direct-sweep'; rawTx: Hex; txHash: Hex };
}
```
The request does NOT contain a raw transaction, raw calldata, a digest, or any pre-hashed value. The signer reconstructs every signed object from semantic fields using the same builders as the online page (`buildSweepTypedData`, `serializeTransaction` of a transfer it encodes itself). That removes "blind signing".

Permit typed data is rebuilt by the signer as: domain `{name: permit.name, version: permit.version, chainId, verifyingContract: token}`, message `{owner, spender: relayer, value: amount, nonce: permit.nonce, deadline}`. `permit.value` MUST equal `amount`; spender is forced to the embedded relayer, never taken from the request. A wrong `name`/`version`/`nonce` only yields a signature the token rejects (harmless DoS); it cannot redirect funds because the digest binds token, owner, spender, value and deadline.

### 5.3 Framing (QR)
Frame text: `GP1.<r|s>.<id8>.<i>.<n>.<b64url chunk>.<crc32hex8>` where `r`=request, `s`=response, `id8`= first 8 hex of request id, `i` zero-based, `n` total (1..24), chunk max 600 bytes of payload before base64url, crc32 over the preceding text. QR level L, byte mode. No compression (zip-bomb surface). Receiver collects any order, ignores duplicates, shows progress bitmap, rejects mixed `id8`, rejects total > 24 or payload > 16384 bytes, and after assembly checks the full payload parses strictly. Typical relayed sweep is about 900 bytes, so 2 frames; animated at 2 fps looping. UNVERIFIED: real-camera reliability at that density across devices; the test plan measures it. Fountain codes rejected as unneeded complexity.

### 5.4 Files
`<id8>.gpreq.json` and `<id8>.gpsig.json`, UTF-8, exact canonical text from s5.1 (no BOM). Import enforces the 16 KiB cap before reading into memory (`File.size`), MIME ignored, extension ignored (content decides).

### 5.5 Watch-only keystore (extends `keystore.ts`)
`KeystoreFile` v2 adds `profile: 'full' | 'watch-only'`. The AAD string becomes `GhostPay.keystore.v2|<profile>|<metaAddress>|<signer>|N|r|p` so a watch-only file can never be decrypted as full or the reverse (anti-confusion/downgrade). Secrets in watch-only: `viewingKey`, `signingKey`; `spendingPublicKey` is already inside `meta.metaAddress`. v1 files keep loading as `full`. scrypt parameters unchanged (2^17, r=8, p=1), same caps (MIN_N, MAX_N, 8 KiB).

Session changes (`session.ts`): `SessionSecrets` becomes a union `{profile:'full', keys, signingKey} | {profile:'watch-only', viewingSecret, spendingPublicKey, signingKey}`. Add `requireSpendSession()` that throws a typed `WATCH_ONLY` error; `deriveVerifiedSweepKey`, `relayedSweep`, `directSweep`, `exportKeystore(full)` use it. `Scan.tsx` and invoice creation use `requireViewSession()`. Compile-time: the watch-only variant has no field that can hold a spend secret.

## 6. Signer decision function (the security core)

`evaluate(request, ctx) -> {ok:true, display, plan} | {ok:false, reasons[]}`; pure, fully unit-tested. `ctx` = loaded keys, embedded tables, signer clock, pinned destinations.

6.1 Hard refusals (no override)
1. Schema/size/duplicate-key/unknown-key failure; `v != 1`.
2. `expiresAt < now_signer`, or `expiresAt - createdAt > 900`, or `|createdAt - now_signer| > 600` -> "clocks differ, confirm date" (user may set signer clock, then re-evaluate; no override of expiry).
3. `chainId` not in embedded table or chain disabled.
4. `profile` differs from the loaded keystore.
5. Key re-derivation: `deriveStealthSecret(announcement, {viewingSecret, spendingSecret})` throws, or `addressOfSecret(key) != owner`, or `owner != announcement.stealthAddress`. (This also rejects a lying `owner`.)
6. relayed: `relayer != manifest[chainId].sweepRelayer`; `token` has no code in table AND is not user-acknowledged (see 6.2); `amount <= fee`; `fee > assertSponsorFeeAcceptable cap`; `feeTo` equals owner or destination or relayer; `deadline - createdAt > 1800`; `deadline < expiresAt`; any address zero or self-referential per `buildSweepTypedData` rules; `permit.value != amount`.
7. destination: not a valid address, equals owner, or equals router/relayer/announcer/feeRecipient (same as `checkDestination`).
8. direct: native requires `to == destination`, `data == 0x` (signer builds it); ERC-20 requires signer-encoded `transfer(destination, amount)` to `token`, `value 0`; `gas <= 21000` native, `<= 120000` ERC-20; `maxFeePerGas <= user cap` (default 500 gwei, editable on signer, NOT by request); total max fee displayed in native units and must be <= 5% of native sweep value (or user cap) else refuse.
9. `id` already signed in this signer session with different content (same id + same hash is allowed, returns the same response; ECDSA is deterministic with RFC 6979 via the existing signer path, UNVERIFIED that `signDigest` is deterministic, so test).

6.2 Acknowledgements (needs explicit user action)
- Token not in the embedded token table: red banner, user must type the last 6 hex of the token address.
- Destination not in the signer's pinned destination list: user must type the last 6 and first 6 hex characters of the destination. Pinned destinations: user enrols addresses on the signer (typed, or imported from a wallet screen photographed on the signer); stored only in memory unless exported in the encrypted profile bundle (`pinned` list inside the plaintext-before-encrypt payload of a v2 full keystore, UNVERIFIED design, optional).
- Amount greater than 10x the largest previously signed amount in this session (soft heuristic, can be disabled).

6.3 Display (all derived from validated, signer-recomputed values)
Chain name and id; token symbol + full address; amount in human units with decimals from table (raw integer also); fee and net; full destination in 4-char groups with EIP-55 casing and, when pinned, its label; relayer full address; deadline as local time and "in N minutes"; request fingerprint; signer-recomputed typed-data digest (first 8 bytes) for optional comparison with the online page. Never render request strings as HTML (`textContent` only); `permit.name` is shown inside a monospace escaped span with length cap 64 and non-printables replaced.

## 7. Storage and key handling

- Offline device: keystore imported per session, decrypted in memory only, held as `SecretScalar`, zeroised on "Lock" or 5 minutes of inactivity (`zeroize`, best effort in JS). Nothing is written to localStorage/IndexedDB. The signer build must not call `indexedDB`/`localStorage` (static test). The encrypted keystore file lives on removable media or paper (QR of the encrypted file may exceed capacity: file/USB is the supported path; paper backup is of the passphrase-protected file bytes, base64, optional).
- Online device: watch-only profile in memory only (as today). Optional persistence is out of scope (B4/B1).
- Per-signature, the derived stealth secret is created, used for the 1-2 signatures, and zeroised in `finally` (mirrors `relayedSweep`).
- No logging of request bodies on the signer; errors carry codes only.
- Randomness: signer does not generate nonces (the online page does, 128 bits via `crypto.getRandomValues`, like `defaultNonce`). A page that reuses a nonce only causes a revert (`NonceAlreadyUsed`), not theft.

## 8. Threat model

Assets: spend key (funds), view key (privacy of history), signing key (invoice forgery).
Adversaries: A1 compromised online page/host (D7); A2 malicious RPC/relayer; A3 malware on the offline device; A4 someone who photographs the QR; A5 hostile QR payload aimed at the decoder; A6 supply-chain on the signer build; A7 shoulder-surfer.

What the design stops
- A1 cannot obtain the spend key (never present). A1 cannot make the signer sign a sweep without the user seeing the real decoded destination/amount on the offline screen. A1 cannot change destination after signing (EIP-712 signature binds destination, feeTo, amount, fee, deadline, nonce, token, owner, chainId, verifyingContract; direct tx is a signed raw tx).
- A2 cannot alter the signed order. A relayer can still censor or delay.
- A5: sizes capped, strict parsing, no eval, no compression.
- Replay: relayed signature is single-use through the nonce bitmap and expires at `deadline` (<= 30 min); direct tx is bound to chain id and account nonce.

What this does NOT hide or stop (honest list)
- The view key is online: a stolen view key reveals your whole payment history and all future payments (not spendable). This mode is "view-only is still sensitive".
- A1 can still show a WRONG destination to the user on the online page and also in the request; protection exists only if the user checks the offline screen against an independent source or uses pinned destinations. If the user approves without reading, funds are lost. The offline signer cannot know your true intent.
- A1 can request signatures of real but unwanted sweeps (e.g. tiny amounts, wrong timing) to pinned destinations; harmless to funds, but can leak timing preferences. A1 can also withhold requests (DoS).
- QR/file transfer exposes the sweep (owner, destination, amount, token) to anyone who sees the screen or photographs it, and the signed relayed order is a bearer authorisation until deadline (submitting it only pays the fee, destination fixed).
- Sweep transactions remain public: stealth address -> destination link, amounts, timing (existing D1). Air-gapping is key custody, not privacy on chain.
- A3 (malware on the signer) can steal the keystore after the passphrase is typed, and display lies. "Offline" without a verified build and a clean device is theatre. A6 (malicious signer build) is the same class as D7 relocated to a file: the user must verify the SHA-256 on an independent device; the project cannot enforce this.
- Camera and screen are optical side channels. Timing and frame counts reveal sweep size class.
- Rotating from an online-exposed key is required (N1). Browser memory cannot be reliably wiped.
- Does not protect the invoice-signing key (online).
- Does not help with the payer-side wallet.

## 9. Failure modes and handling

| Failure | Handling |
|---|---|
| QR frame missed/garbled | Progress bitmap, loop continues, manual "restart"; file fallback |
| Camera denied/absent | File path; text paste of `GP1.` frames (all frames at once) |
| Offline clock wrong | Refuse by 6.1(2) with the exact skew; user sets clock; never auto-extends expiry |
| Request expired before response imported | Online page discards; user repeats; relayer quote also expires (quote expiry check kept) |
| Response for different request | `requestHash` mismatch -> reject |
| Response sig does not recover to owner / rawTx differs from expected | Reject; show "do not submit"; keep request pending |
| Relayer rejects (nonce used, fee changed) | New request required; show error code |
| Stealth address lacks gas for direct sweep | Same message as today; no auto-funding |
| Keystore wrong passphrase / v1 vs v2 mismatch | Generic failure, no oracle for profile kind beyond what AAD allows |
| Decoder library throws | Caught, frame ignored, counter shown |
| User lost the offline device | Restore from encrypted full keystore backup on a new clean device |
| Embedded manifest outdated (new deployment) | Signer refuses unknown relayer; needs new signed build |

## 10. Test plan

Unit (signer-protocol, pure)
- Round trip encode/decode/frame/reassemble for sizes 1..16384, any frame order, duplicates, CRC corruption, mixed ids, total 25, payload 16385.
- `evaluate` table: one case per refusal in 6.1 and each acknowledgement in 6.2; golden "happy path" for relayed and direct (ERC-20 and native).
- Differential: signer-produced `sweepSig` equals online `signSweep` for same inputs; recovered address equals `owner`; equals contract-side digest `sweepDigestManual`.
- Fuzz request parser (random bytes, deep nesting, duplicate keys, huge numbers, unicode confusables in `permit.name`): never throws uncaught, never allocates over the cap.
- Property: for random valid requests, mutating any single field after hashing changes `requestHash`, and the signer signs exactly the displayed values.
- Keystore v2: AAD confusion tests (profile swap, meta swap, N/r/p swap), v1 compatibility, KATs with fixed salt/iv checked by a second implementation (node webcrypto).
- Session: watch-only variant cannot call spend paths (type test + runtime `WATCH_ONLY`).
Integration
- Anvil: full relayed sweep with the real `GhostPaySweepRelayer`, signed through the QR/file protocol (no shortcuts), and a direct sweep. Wrong-relayer and wrong-chain requests refused.
- Playwright: online page watch-only badge; sweep prepare -> request QR present; scripted response import -> relayer mock receives expected body. Egress test: signer page makes zero network requests (assert `connect-src 'none'`, no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `indexedDB`, `localStorage` strings in the signer bundle; reuse the `scannerCore` style source scan).
- Static: single-file signer's CSP hash matches the inline script; the build is reproducible (two builds, same SHA-256).
- Manual camera matrix (at least 3 phones/laptops, 2 sizes of QR) recorded in the PR; results for UNVERIFIED reliability.

## 11. Acceptance criteria
- [ ] A watch-only session cannot reach any code path that holds or derives a spend secret (type + runtime tests).
- [ ] Every refusal in 6.1 has a test; no request can make the signer sign anything other than the two action types.
- [ ] Signed relayed order verifies in the real contract on anvil; destination/fee/amount equal what the signer displayed.
- [ ] Signer page makes zero network requests and has no web-storage calls (automated).
- [ ] Single-file signer is reproducible and its hash appears in the signed release manifest and in the user doc.
- [ ] Docs: user guide with the honest limits of s8, "rotate if the key was ever online", how to verify the hash on another device.
- [ ] Independent review recorded in `docs/reviews/`; threat-model D7 entry updated with "mitigated only when the offline screen is read".

## 12. Server-dependent alternatives considered and rejected
- Hosted/remote signer, relay of QR data over WebSocket/WebRTC through a signalling server, push notification of pending requests: need an operator, rejected.
- Bluetooth/WebUSB/WebNFC transport: browser support and permission model UNVERIFIED and larger attack surface; deferred, optional later (files and QR cover the need).
- Pairing codes via a rendezvous server: rejected; QR/file is the pairing.

## 13. Effort and dependencies
Effort L: protocol package 4 d, signer app 5 d, keystore v2 + session split 3 d, online flow + UI 4 d, release/build/CSP/reproducibility 2 d, tests and camera matrix 4 d. Total about 22 d before audit.
Dependencies: spec 01 (manifest read-back, build-time embedding), spec 08/B1 (encrypted backup and restore drill, prerequisite per ideas order), `chain-adapters` sweep builders (exist), QR decoder ADR, release signing key (owner-gated), animated QR frame code shared with B3 if built.

## 14. Audit checklist
- [ ] No code path serialises `SecretScalar`; signer never logs request bodies.
- [ ] `evaluate` is the only gate; signing functions are unreachable without its `ok` plan; plan binds the exact bytes displayed.
- [ ] All signed objects rebuilt from semantic fields; no raw digest/calldata accepted.
- [ ] Embedded relayer/chain/token tables equal the read-back-verified manifest at build time.
- [ ] Expiry/clock logic cannot be bypassed by large `expiresAt`; deadline cap enforced independently of expiry.
- [ ] Keystore v2 AAD binds profile; v1 compatibility cannot be abused to downgrade.
- [ ] CSP: `connect-src 'none'`, hash-pinned inline script, no third-party origins; bundle scan covers the signer.
- [ ] QR decoder pinned, fuzzed, size-bounded; frame reassembly bounded in memory and time.
- [ ] Zeroisation in every `finally`; idle lock works; no persistence.
- [ ] Permit rebuild forces spender and value; domain fields cannot redirect.
- [ ] Direct-sweep fee cap and gas caps enforced by signer, not request.
- [ ] Display escapes all request strings; address casing is EIP-55 from the signer's computation.
- [ ] User docs state every limit in s8 without softening.
