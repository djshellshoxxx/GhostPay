# Research: cryptographic and key security

Retrieval date for all web sources: 2026-10-21. Branch `claude/remote-extensions-1`. Only output of this task; no source, test, config or other doc was changed. No haiku sub-workers were spawned.

## 0. Method, sources, reachability

Repo read: `README.md`, `docs/remote/modules-needed.md`, `docs/threat-model/THREAT_MODEL.md` (sections 1, 2, 9), `docs/remote/security-specs/key-lifecycle.md` (KL-1..KL-33, referred to below as KL-n), `docs/remote/research/sec-offchain-infra.md` (format), `THIRD_PARTY.md` section 1, audit 03 findings S3-08/13/15/24/26 (headings). Code: `apps/web/src/lib/{keystore,session,tags,sweep}.ts`, `apps/web/public/_headers`, `packages/core-crypto/src/{keys,stealth}.ts`, `packages/invoice-schema/src/sign.ts`, `packages/chain-adapters/src/sweep.ts`, `packages/policy-scheme/src/{calldata,eip712}.ts`, `packages/btc-silent-payments/src/{ecc,labels,spend}.ts`, `packages/contracts/src/PolicyAccount.sol` (header), `packages/secret-box/src/secretBox.ts` (API). `docs/remote/audits/*` (haiku) not relied on.

Reachable: `raw.githubusercontent.com` (w3c/webauthn `index.bs`, w3c/webcrypto `Overview.html`, ethereum/ERCs `erc-5564.md`, bitcoin/bips 352/360/374/375, satoshilabs/slips `slip-0039.md`, paulmillr noble-curves/noble-hashes READMEs, OWASP cheat sheet, gnosisguild zodiac-modifier-delay README) and WebSearch. **Unreachable** (DNS ENOTFOUND / no connect): arxiv.org, export.arxiv.org, eprint.iacr.org, eips.ethereum.org, w3.org/TR, csrc.nist.gov, passkeys.dev, ethresear.ch, vitalik.eth.limo.

Tiers: **[P]** primary, fetched and read. **[S]** WebSearch summary only, primary not reachable: unverified. **[K]** author knowledge, not re-fetched: unverified.

## 1. Baseline (verified in tree)

| Area | State | Evidence |
|---|---|---|
| Keystore | scrypt (noble) N=2^17 r=8 p=1 -> WebCrypto AES-256-GCM, non-extractable AES key, header in AAD, `raw.fill(0)`. Import accepts N up to 2^20, r<=16, p<=4 (S3-13); `MIN_PASSPHRASE = 10` (KL-14 wants 12). | `apps/web/src/lib/keystore.ts:360-365,373-380,461-463` |
| Key generation | Independent random spend/view scalars + separate random invoice `signingKey`; no seed, so no mnemonic/Shamir backup possible. | `core-crypto/src/keys.ts:generateKeySet`; `session.ts:78` |
| Tag vault | HKDF-SHA-256(viewing key, random salt, info `GhostPay/local-tags/v1/{aes-gcm,hmac}`) -> non-extractable AES-GCM + HMAC CryptoKeys. Good pattern. | `tags.ts:53-54,105-125` |
| Signing | noble v2 `secp256k1.sign(..., {prehash:false, lowS:true})`, deterministic RFC 6979, **no `extraEntropy`**. `signDigest(digest, secret)` is an exported raw-digest signer over the stealth spend key. | `chain-adapters/src/sweep.ts:192-194`; `invoice-schema/src/sign.ts:83`; `policy-scheme/src/eip712.ts:352` |
| Zeroization | `SecretBytes` wrapper leaks via species methods (S3-08); `packages/secret-box` exists but is **not wired** into any app/package (grep: 0 importers). | `modules-needed.md` rank 3 |
| Auto-lock | KL-27 (drop keys within 60 s on lock/hide) **not implemented**: no `visibilitychange`/timer in `session.ts`. | grep |
| Sweep destination | `checkDestination` rejects self, GhostPay contracts, fee recipient. No check that a contract destination has code on the target chain. | `sweep.ts:44-49` |
| Vault contract | `PolicyAccount` (scheme `0x47500002`): funds leave only to `destination` after `delay`; destination change needs 2x delay and is cancellable. Contracts only, no client. | `PolicyAccount.sol:17-19,74-83` |
| Headers | COOP `same-origin` set; no COEP. | `apps/web/public/_headers` |
| Crypto libs | Own code noble 2.4.0; viem brings noble 1.x (S3-24). | `THIRD_PARTY.md` s1 |
| Threat model | Post-quantum and device side channels explicitly out of scope. | `THREAT_MODEL.md:315` |

## 2. Facts from sources (what the recommendations rest on)

- F1 WebCrypto [P, w3c/webcrypto]: non-extractable means key material "is not exposed to script, except through" export/wrap; it "does not guarantee that the underlying cryptographic key material will not be persisted to disk"; "conforming user agents are not required to zeroize key material". CryptoKey is structured-cloneable into IndexedDB. Spec says nothing protecting against injected script *using* a key. secp256k1 is not a WebCrypto curve [K]: spend/view scalars cannot be non-extractable CryptoKeys; only wrapping keys can.
- F2 WebAuthn PRF [P, w3c/webauthn `index.bs` section "prf-extension"]: maps any input to 32 bytes; salt = `SHA-256("WebAuthn PRF" || 0x00 || input)`; built on CTAP `hmac-secret`, the UV PRF only; "Not all authenticators support evaluating the PRFs during credential creation", so an assertion may be needed; spec's motivating use is symmetric keys for user data, with rotation by evaluating two inputs in one assertion. Credentials are bound to the RP ID (origin's registrable domain) [K].
- F3 PRF deployment [S]: Chromium + Google Password Manager support; Windows Hello PRF from Win11 25H2; Safari platform authenticators work, Safari with external CTAP2 keys returns undecrypted output (WebKit bug 311099, open per search); 1Password extension non-compliant (forum, mid-2026). Treat as patchy.
- F4 noble [P]: "algorithmic constant time"; "JIT-compiler and Garbage Collector make 'constant time' extremely hard"; field ops not constant-time; secret scalars blinded for secp256k1 multiply; `.fill(0)` but "no guarantees in JS"; bigint and hex strings cannot be wiped; `await` spills internals to memory. Default ECDSA deterministic; "Purely deterministic signatures are vulnerable to fault attacks"; `extraEntropy: true` enables hedging. noble-curves v2 `prehash` default is `true` (sha256), v1 default was `false`. Audits listed: Trail of Bits v2.3.0 (Aug 2026), Cure53 v1.6.0, Kudelski, ToB v0.7.3.
- F5 noble-hashes [P]: Argon2 "can't be fast in JS ... suggested to use Scrypt instead"; scrypt `maxmem` default 1 GiB + 2 KiB, `onProgress` for async.
- F6 OWASP Password Storage [P]: scrypt minimum N=2^17 r=8 p=1 (128 MiB); Argon2id minimum m=19 MiB t=2 p=1 (server login context; offline keystore warrants >= these).
- F7 ERC-5564 [P]: scheme 1 `s_h = h(s)`, no domain tag; 1-byte view tag drops margin "from 128 bits to 124 bits"; no quantum discussion; funding wallet "MUST NOT have any physical connection" to the stealth address owner.
- F8 BIP-352 [P]: spend from "cold storage signing device using (b_spend + hash(...)) mod n"; smallest-outpoint input hash chosen to suit "hardware signing devices"; MuSig/FROST senders "not recommend[ed] due to lack of a security proof", may need DLEQ. BIP-374 (DLEQ) and BIP-375 (sending SP with PSBTs) are **Draft** [P]. BitBox02 shipped SP *sending* in firmware 9.21.0 (Oct 2024) using DLEQ [S].
- F9 BIP-360 [P] (now titled Pay-to-Merkle-Root, Draft): defines "long exposure" (public key on-chain at rest) vs "short exposure" (mempool) CRQC attacks; taproot keypath outputs are long-exposure. BIP-352 outputs are taproot -> long-exposure.
- F10 PQ stealth [S, arXiv:2501.13733 / IACR 2025/112 unreachable]: lattice SAPs (LWE, Ring-LWE, Module-LWE); Module-LWE (Kyber-based) fastest. Follow-up arXiv:2504.06744 states its variant is **not** PQ-secure.
- F11 NIST IR 8547 (initial public draft, Nov 2024) [S]: quantum-vulnerable ECDSA/ECDH deprecated after 2030, disallowed after 2035; still draft per secondary sources.
- F12 SLIP-39 [P]: two-level Shamir (GT-of-G groups, member thresholds); RS1024 checksum detects <=3 word errors; passphrase via 4-round Feistel/PBKDF2, "no way to verify that the correct passphrase was used"; T-1 shares reduce entropy to m-32 bits, so >=128-bit secret required; reject share index 0.
- F13 Zodiac Delay modifier [P]: enforces cooldown (and optional expiry) between module-initiated tx and execution on a Safe; owner can skip queued txs by advancing nonce.
- F14 Minerva [S, TCHES 2020]: bit-length timing leak of ECDSA nonce -> lattice key recovery with ~500-2100 signatures; affected libgcrypt, wolfSSL, MatrixSSL, SunEC, Crypto++, a certified smartcard.
- F15 Wintermute/Optimism, June 2022 [S, news; no primary post-mortem reached]: 20M OP sent to an L1 Safe address not deployed on Optimism; attacker deployed a contract at that address on L2 first. Lesson: a contract destination address is chain-specific.

## 3. Recommendations

Format per item: Threat / Change / Effort / Residual / Priority / Owner-cost-service.

### K1. Wire `secret-box` and implement auto-lock (KL-24, KL-27)
- Threat: ADV1/ADV2 memory exposure window; S3-08 leaks via `slice`/spread; keys stay in memory indefinitely in an open tab.
- Change: replace `SecretBytes` uses in `packages/core-crypto/src/secret.ts` consumers and `apps/web/src/lib/session.ts` with `SecretBox.use/useAsync/take` (`packages/secret-box`); add idle timer (default 5 min, max 60 s after `visibilitychange: hidden` / `pagehide`) in `session.ts` that zeroizes and drops keys; keep secrets out of `await` boundaries where possible (F4); never hold key hex in React state (S3-26: read once from an uncontrolled input, clear `input.value`).
- Effort: M. Residual: JS cannot guarantee wipe (F1, F4); bigint copies inside noble remain until GC. Priority: P1 (before testnet users). Owner: no.

### K2. Keystore hardening (KL-13, KL-14, S3-13)
- Threat: ADV3 offline brute force; malicious file DoS (N=2^20, r=16 -> ~2 GiB).
- Change, `apps/web/src/lib/keystore.ts`: import allowlist `{N:2^17,r:8,p:1}` plus `{N:2^18,r:8,p:1}` only, reject before scrypt; set `maxmem` to `128*r*(N+p+1)` of the allowed max (F5); `MIN_PASSPHRASE = 12` code points (`[...pass].length`, not `.length` UTF-16 units) and offer a generated 6-word diceware passphrase as the default; pass `onProgress` to show work. Keep scrypt over Argon2id (F5: Argon2 slow in JS, smaller effective cost per second in browser). Bump to `v: 2` only together with K4.
- Effort: S. Residual: human-chosen passphrase strength. Priority: P1. Owner: no.

### K3. Domain-separation audit fixes
Findings from reading code:
1. `signDigest(digest, secret)` (`chain-adapters/src/sweep.ts:192`) signs any 32-byte digest with a stealth spend key. Any future caller passing a relayer- or RPC-supplied digest becomes a blind-signing oracle. Change: stop exporting it from the package index; expose only `signSweep`, `signPermit`, `signEip1559Tx(unsignedTx)` which build the digest internally; add a lint rule (`no-restricted-imports`) for the internal path. Effort S, P1.
2. Hedged ECDSA: add `extraEntropy: true` to the three `secp256k1.sign` calls (sweep, invoice, policy) (F4: fault-attack resistance; still valid ECDSA, no interop cost). Tests that pin exact signatures must switch to verify-only. Effort S, P2.
3. noble v1/v2 `prehash` default flip (F4): every call site passes `prehash:false` explicitly today (verified). Add a unit test per call site asserting signature verifies against the *keccak* digest, so a refactor that drops the flag fails CI (S3-24 makes both majors present). Effort S, P2.
4. Keystore AAD `GhostPay.keystore.v1|metaAddress|signer|N|r|p` (`keystore.ts:383`) joins attacker-parseable strings with `|`; `signer` is not format-checked on import. Not exploitable without the key (AEAD), but for v2 use length-prefixed fields and validate `signer` as 66-hex and `metaAddress` against `META_RE`. Effort S, P3.
5. Viewing key is both the ERC-5564 ECDH scalar and the tag-vault HKDF IKM (`tags.ts:105`). Cryptographically fine (HKDF, distinct `info`), but it means **anyone given the viewing key (accountant, hosted scanner) can decrypt local tags and notes**. Document in `docs/user/`; for v2 derive the tag-vault IKM from a seed branch (K4) instead. Effort S (doc). P2.
6. Scheme-1 `s_h = keccak256(S)` without a tag is mandated by ERC-5564/ADR-0001 (F7) and cannot change without a new scheme ID; accepted. Invoice prefix `GhostPay.Invoice.v1\0` cannot collide with EIP-191 (`0x19`), EIP-712 (`0x1901`) or typed-tx (`0x02`) preimages, and uses a separate key anyway: OK. BTC uses BIP-340 tagged hashes: OK.
- Residual: new call sites added later; enforced only by lint/tests. Owner: no.

### K4. Seed-based keys + versioned derivation (resolves key-lifecycle open question 2)
- Threat: ADV6 backup loss; today three independent 32-byte secrets must all be backed up and cannot be split or written as words.
- Change: new `packages/core-crypto/src/seed.ts`: 256-bit (or 128-bit, see SLIP-39) master secret -> HKDF-SHA-256 with info `GhostPay/v2/scheme1/spend`, `/view`, `/invoice-signing`, `/tag-vault`, `/btc/bip32-seed`, each reduced by rejection to [1,n-1] (counter in info). Keystore v2 stores the master secret only, plus `keyEpoch` (K8). Keep v1 import forever.
- Effort: M. Residual: one secret is a single point of failure (mitigated by K5/K6). Priority: P2 (before mainnet; format must be fixed before real users). Owner: yes (format decision, KL-2).

### K5. Multi-wrap backup: passphrase + optional passkey PRF
- Threat: users losing or mishandling the keystore file; friction pushing users to weak passphrases.
- Change: keystore v2 = random 256-bit DEK encrypts the master secret; DEK wrapped (AES-KW or AES-GCM) under 1..n KEKs: (a) scrypt(passphrase) mandatory, (b) optional WebAuthn PRF: `navigator.credentials.get({extensions:{prf:{eval:{first: salt32}}}})` -> HKDF -> non-extractable AES key (F1, F2). The wrapped blob may then be kept in IndexedDB ("unlock with passkey on this device") so no file is needed per session. Code: `apps/web/src/lib/keystore.ts`, new `apps/web/src/lib/passkey.ts`, `SellerKeys.tsx`.
- Project-specific constraints: PRF is bound to the RP ID, so the **IPFS/Tor/mirror origins and any future domain change cannot unlock** passkey wraps (README hosting plan has several origins); therefore the passphrase wrap must stay mandatory. A compromised frontend on the same origin (D7, S3-01) can call PRF and unwrap: passkeys do not defend against a malicious build. Synced passkeys move the trust to the platform account (Apple/Google). Support is patchy (F3): feature-detect `getClientExtensionResults().prf.enabled`, fall back silently.
- Effort: M. Residual: as above. Priority: P3 (UX/safety, after K1/K2/K4). Owner: yes (UX decision; no service needed).

### K6. Shamir / social recovery of the master secret
- Threat: single-location backup loss or theft.
- Change: offer SLIP-39 export of the K4 master secret (128-bit or 256-bit; F12 requires >=128) via a vetted implementation rather than custom code (candidate: `@scure/slip39`? [K] unverified existence/audit; if none, `trezor/python-shamir-mnemonic` vectors must be pinned in `test-vectors/`). Default 2-of-3, single group; reject index 0; never auto-correct. Shares are generated and displayed offline in the page; never transmitted (KL-17).
- On-chain social recovery is not applicable to scheme-1 EOAs; for scheme 2 it would need contract changes (C-19, immutable contracts) - out of scope.
- Effort: M (L if no audited JS lib). Residual: share-holder collusion; user confusion; SLIP-39 passphrase cannot be verified (F12), so do not use its passphrase. Priority: P3. Owner: yes (dependency and UX).

### K7. Hardware-wallet paths
EVM scheme 1 needs signing with `s + h mod n`; no Ledger/Trezor firmware support for ERC-5564 tweaked keys was found ([S] negative search result; unverified). Options, best first:
1. **Vault mode via `PolicyAccount` (scheme `0x47500002`) with destination = hardware wallet or Safe.** A browser-stolen key can only move funds to the pre-committed destination after `delay`, and the honest owner can cancel a destination change (`PolicyAccount.sol:17-19`). This gives HW-grade theft protection without HW firmware support. Change: client support in `packages/policy-scheme` + `apps/web` (currently none). Effort L. Residual: owner-key loss = locked funds (C-19); destination becomes a linkage point. P3, owner decision (README says "do not use" today).
2. **Destination-side hardware:** recommend sweep destination = HW wallet or multisig (K9). Effort S (UX/docs). P1.
3. **Deterministic key derivation from an HW signature** (wallet signs a fixed message; keys = hash(signature)) [K, Umbra-style, unverified]: gives recovery from the HW seed but keys still live in the browser, and any phishing site requesting the same message obtains them; requires RFC 6979 determinism from the device. Not recommended unless message is EIP-712 with GhostPay domain and chainId-free fixed verifying contract, and users are warned. P4.
4. **BTC:** BIP-352 explicitly anticipates cold spending (F8); spending needs the device to accept a tweak (PSBT field). BIP-375 covers *sending* only and is Draft; a spending PSBT field was not found in this session (unverified). BitBox02 supports SP sending [S]. Keep `btc-silent-payments` DEVIATIONS "HW out of scope"; track BIP-375/374. P4.
- Owner: yes for 1; vendor-dependent for 4.

### K8. Key rotation (KL-18, KL-19, G-18)
- Threat: suspected spend/view key compromise; long-lived meta-address linkage.
- Change: keystore v2 holds `epochs: [{epoch, metaAddress, createdAt, retired?}]`, derived as `info = GhostPay/v2/epoch/<n>/...` from the one master secret (K4), so rotation needs no new backup. Scanner (`scannerCore.ts`) scans all non-deleted epochs; UI "Rotate" publishes new meta-address (ERC-6538 registry update is optional/owner choice) and marks old as receive-retired; sweep old outputs first. Note: rotation from the same master secret does **not** help if the master secret itself leaked; for that, rotate to a fresh master secret and new backup (KL-33 wording).
- Effort: M. Residual: payers with old invoices still pay old epoch. Priority: P2. Owner: no.

### K9. Sweep destination safety: multisig/timelock aware
- Threat: sweeping to an address that is unusable on that chain (F15), or to a hot wallet; payer-visible linkage (D1).
- Change, `apps/web/src/lib/sweep.ts:checkDestination`: `eth_getCode(destination)` on the target chain; if empty but the user marked it "Safe/multisig", block with an explanation (contract not deployed on this chain); if code exists, show "contract destination". Docs: recommend a Safe (with optional Zodiac Delay, F13) or HW wallet as destination, fresh per seller identity. Uses the user-chosen RPC (D8 already leaks the destination to RPC/relayer).
- Effort: S. Residual: RPC can lie about code (mitigated only by multi-RPC quorum, out of scope). Priority: P1. Owner: no.

### K10. Side-channel and timing hygiene in JS
- Threat: local co-resident attacker (other tabs via Spectre-class leaks), fault attacks, request-pattern leaks.
- Change: (a) add `Cross-Origin-Embedder-Policy: require-corp` to `apps/web/public/_headers` to get a cross-origin-isolated process (COOP already set) [K: isolation semantics unverified this session]; check embed SDK and RPC `connect-src` still work (COEP affects subresources, not fetch to CORS endpoints). (b) K3.2 hedged signing. (c) Never branch on secret data in GhostPay's own code: current code compares public values only (addresses, view tags of public announcements) - keep a review checklist item. (d) Behavioural channel: after a view-tag/address match the app queries balance of matched addresses only (D8) - pad by also querying a random sample of non-matching announced addresses, or batch per block range. (e) Do not adopt WASM crypto for "constant time" claims; noble's own README rejects stronger JS guarantees (F4). Minerva-class leaks (F14) target nonce bit-length; noble uses fixed operation sequence + blinding (F4).
- Effort: S (a,b,c), M (d). Residual: browser/OS side channels out of scope (THREAT_MODEL.md:315). Priority: P2. Owner: no.

### K11. Post-quantum exposure (document now, plan scheme later)
Exposure analysis for GhostPay (from F7, F9 and the derivation in `stealth.ts`):
- **Theft (long exposure):** the meta-address publishes `P_spend` and `P_view`. A CRQC recovers `p_spend`, then every unswept one-time key `p_spend + h`. Funds at rest in stealth addresses and the sweep destination EOA (once it has signed) are at risk. Swept funds in a never-spent fresh EOA expose only its address hash.
- **Privacy (harvest now, decrypt later):** every announcement's ephemeral `R` is permanent on-chain. A future CRQC recovers `r` from `R` (or `p_view` from `P_view`) and links **all historical payments to the meta-address**, retroactively. No client change now can protect already-published announcements.
- BTC SP outputs are taproot keypath = long exposure (F9).
- Changes: (1) `docs/user/privacy-limits.md` + `THREAT_MODEL.md`: state both effects (owner currently excludes PQ; propose moving it in as "Accepted, disclosed"). Effort S, P2. (2) UX: prompt sweeping; do not auto-publish the meta-address to ERC-6538 (reduces harvestable linkage to invoice holders). S, P3. (3) Research track: new scheme ID with hybrid view key: shared secret = HKDF(ECDH(r, P_view) || ML-KEM-768.Decaps) so privacy holds if either holds; spend side stays secp256k1 until Ethereum offers PQ accounts. Candidate lib `@noble/post-quantum` (linked from noble README, F4; audit status unverified). Cost: ML-KEM-768 ciphertext ~1088 bytes per announcement calldata and a larger meta-address [K, FIPS 203 not reachable]; contract and announcer changes; lattice SAP literature (F10) unreviewed. Effort L, P4, owner decision + gas cost.
- Residual: until Ethereum/Bitcoin consensus offers PQ signatures, theft risk is not addressable by GhostPay. Timeline anchor only: NIST IR 8547 draft 2030/2035 (F11).

### K12. Library and scope hygiene
- Collapse noble to one major (S3-24) or test viem's 1.x signing paths against GhostPay vectors (`test-vectors/`). Pin `@noble/*` exact (already). Record noble audit versions (F4: ToB on v2.3.0; GhostPay uses 2.4.0 = post-audit delta) in `THIRD_PARTY.md`. Effort S, P2, owner decision on ADR-0004.

## 4. Ranked roadmap

| Rank | ID | Item | Threat | Files | Effort | Priority | Owner/cost/service |
|---|---|---|---|---|---|---|---|
| 1 | K3.1 | Remove exported raw `signDigest`; typed signers only | Blind-signing oracle on spend key | `chain-adapters/src/sweep.ts`, index, eslint | S | P1 | No |
| 2 | K2 | Keystore import allowlist, `maxmem`, 12 code-point passphrase, diceware default | Offline brute force, DoS | `apps/web/src/lib/keystore.ts`, `SellerKeys.tsx` | S | P1 | No |
| 3 | K1 | Wire `secret-box`; auto-lock on idle/hidden; no key hex in React state | Memory exposure window | `session.ts`, `core-crypto/secret.ts` users, `SellerKeys.tsx` | M | P1 | No |
| 4 | K9 | Destination `eth_getCode` check; recommend Safe/HW destination | Unusable/hot destination (Wintermute class) | `apps/web/src/lib/sweep.ts`, `docs/user/` | S | P1 | No |
| 5 | K7.2 | UX/docs: hardware wallet or multisig as sweep destination | Browser key theft impact | `docs/user/`, Sweep view text | S | P1 | No |
| 6 | K3.2-3 | Hedged ECDSA (`extraEntropy`), per-call `prehash:false` tests | Fault attacks; v1/v2 default flip | sweep/sign/eip712 call sites + tests | S | P2 | No |
| 7 | K4 | Seed + HKDF versioned derivation; keystore v2 | Backup loss, enables K5/K6/K8 | `core-crypto/src/seed.ts`, `keystore.ts` | M | P2 | Yes (format) |
| 8 | K8 | Epoch-based rotation, multi-epoch scan | Key compromise, linkage | `keystore.ts`, `scannerCore.ts`, UI | M | P2 | No |
| 9 | K11.1 | Document PQ theft + HNDL privacy exposure | Unstated retroactive deanonymization | `THREAT_MODEL.md`, `docs/user/privacy-limits.md` | S | P2 | Yes (scope change) |
| 10 | K10 | COEP, request-pattern padding, constant-time checklist | Side channels | `_headers`, scanner fetch logic | S-M | P2 | No |
| 11 | K3.5 | Document "viewing key decrypts tags"; v2 separate IKM | Over-sharing via view key | `docs/user/`, `tags.ts` (v2) | S | P2 | No |
| 12 | K12 | Single noble major or vector-test viem paths | Divergent crypto libs | `package.json`, tests | S | P2 | Yes (ADR-0004) |
| 13 | K5 | Passkey-PRF DEK wrap (optional), passphrase stays mandatory | File mishandling, UX | `keystore.ts`, `passkey.ts` | M | P3 | Yes (UX) |
| 14 | K6 | SLIP-39 2-of-3 export of master secret | Single backup loss | new dep, `test-vectors/` | M-L | P3 | Yes (dep) |
| 15 | K3.4 | Length-prefixed AAD, validate `signer` (v2) | AAD ambiguity (theoretical) | `keystore.ts` | S | P3 | No |
| 16 | K7.1 | Client support for `PolicyAccount` vault mode | Theft after key compromise | `policy-scheme`, `apps/web` | L | P3 | Yes |
| 17 | K11.3 | Hybrid ECDH+ML-KEM stealth scheme research | HNDL privacy | new scheme, contracts | L | P4 | Yes (gas, contracts) |
| 18 | K7.3-4 | HW-signature-derived keys; BTC HW spend via PSBT | Key custody | `btc-silent-payments`, web | L | P4 | Vendor-dependent |

## 5. Sources

- [P] W3C WebAuthn editor's draft source, PRF extension: https://raw.githubusercontent.com/w3c/webauthn/main/index.bs (lines ~7461-7590), retrieved 2026-10-21.
- [P] W3C Web Cryptography API source: https://raw.githubusercontent.com/w3c/webcrypto/main/spec/Overview.html, retrieved 2026-10-21 (first 100k chars read).
- [P] ERC-5564: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md, retrieved 2026-10-21.
- [P] BIP-352, BIP-374, BIP-375, BIP-360: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki (and `bip-0374`, `bip-0375`, `bip-0360`), retrieved 2026-10-21.
- [P] SLIP-0039: https://raw.githubusercontent.com/satoshilabs/slips/master/slip-0039.md, retrieved 2026-10-21.
- [P] noble-curves README: https://raw.githubusercontent.com/paulmillr/noble-curves/main/README.md; noble-hashes README: https://raw.githubusercontent.com/paulmillr/noble-hashes/main/README.md, retrieved 2026-10-21.
- [P] OWASP Password Storage Cheat Sheet: https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Password_Storage_Cheat_Sheet.md, retrieved 2026-10-21.
- [P] Zodiac Delay Modifier README: https://raw.githubusercontent.com/gnosisguild/zodiac-modifier-delay/master/README.md, retrieved 2026-10-21.
- [S] Mikić et al., "Post-Quantum Stealth Address Protocols", https://arxiv.org/abs/2501.13733 / https://eprint.iacr.org/2025/112; follow-up https://arxiv.org/abs/2504.06744. Hosts unreachable; search summary only.
- [S] Minerva, TCHES 2020: https://minerva.crocs.fi.muni.cz/, https://eprint.iacr.org/2020/728. Search summary only.
- [S] NIST IR 8547 ipd (Nov 2024): secondary summaries (e.g. https://www.sectigo.com/resource-library/nist-move-towards-post-quantum-cryptography-pqc); csrc.nist.gov unreachable.
- [S] PRF support: https://www.corbado.com/blog/passkeys-prf-webauthn, https://bugs.webkit.org/show_bug.cgi?id=311099, https://www.1password.community/developers-69/browser-extension-webauthn-prf-extension-not-spec-compliant-24672. Vendor/forum, unverified.
- [S] BitBox02 SP sending: https://blog.bitbox.swiss/en/understanding-silent-payments-part-two/, https://nobsbitcoin.com/bitbox-10-2024-lugano-update. Unverified.
- [S] Wintermute/Optimism 20M OP (June 2022): https://www.theblock.co/post/150966/attacker-snipes-20-million-op-tokens-intended-for-wintermute-loan, https://blockworks.com/news/20m-tokens-lost-as-market-maker-wintermute-takes-blame. News, not a post-mortem.
- [K] Not fetched: FIPS 203 sizes, WebAuthn RP ID binding wording, COOP/COEP isolation semantics, Umbra key-derivation-from-signature, `@scure/slip39` / `@noble/post-quantum` audit status.
