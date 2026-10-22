# Idea 03 (A2): per-client meta-addresses from one seed (ADR-style spec)

Status: **Proposed ADR** (number assigned at merge; suggested ADR-0020) | Priority: shortlist #4 (ideas.md) | Effort: M-L (13-15 d plus an independent cryptographic review; ideas.md said M) | Owner: core-crypto + apps/web | Date: 2026-10-21
Addresses: THREAT_MODEL D3 (stable seller meta-address links invoices). Plan: [../../remote/plans/ideas/03-per-client-meta-addresses.md](../../remote/plans/ideas/03-per-client-meta-addresses.md)

**Rule for this document:** no implementation code is merged until (1) this ADR is Accepted in `docs/adr/ADR-LOG.md`, (2) the test vectors in section 10 are reproduced by two independent implementations, and (3) the checklist in section 14 is signed by a reviewer who did not write the derivation. A derivation mistake cannot be fixed once users hold funds at derived addresses.

Facts below were read from the repo on 2026-10-21: `packages/core-crypto/src/{keys,stealth,secret,rng}.ts`, `apps/web/src/lib/{session,keystore,scannerCore,scanClient,tags,invoiceCreate}.ts`, `packages/invoice-schema/src/{schema,envelope}.ts`, ADR-0001/0002/0004/0005/0010, specs 06, 08, 14, ideas 01 and 04. Measurements in section 7 were taken in this repo's container the same day. Anything else is marked UNVERIFIED.

**Hard constraint.** Derivation, allocation, scanning, storage and recovery are 100% client-side from static files. No server keeps the child list, scans on the seller's behalf, or syncs devices. Section 13 lists what was rejected because it needed one.

---

## 1. Context (what is true today)
- Seller keys are three independent random scalars (spending, viewing, invoice signing) from `generateKeySet()` and `randomScalar()` (`session.ts`). There is **no seed and no derivation**. The only durable copy is the v1 keystore (`keystore.ts`: scrypt 2^17 + AES-256-GCM, plaintext `{spendingKey, viewingKey, signingKey}`).
- Every invoice carries the same `metaAddress` and the same `signer` public key in the clear (`schema.ts`; the signer is also in the envelope AAD, `envelope.ts buildAad`). So two clients comparing invoices learn "same seller" from **either** field (D3). A per-client meta-address alone is not enough; the signer must also be per client.
- The scanner worker holds one viewing key and one spending public key (`scannerCore.ts ScanSession`). The view tag is compared **after** the ECDH, so ECDH cost is paid for every announcement.
- Tag vault keys are HKDF over the viewing key (`tags.ts`).
- ERC-6538 publication (spec 06) is a public, permanent link between a wallet address and a meta-address.

## 2. Decision (summary)
1. Introduce a 32-byte **seed**. New key sets are generated as a seed. Existing users get a seed **deterministically derived from their existing spending and viewing keys** (section 4.5), so their current v1 keystore backup already recovers every child.
2. From the seed derive, with HKDF-SHA-256 and strict domain separation, four independent roots: `spendRoot`, `viewRoot`, `signRoot`, `vaultKey`. From each scalar root derive per-child scalars by index (hardened only; no public derivation).
3. A **child** = (spending key, viewing key, invoice-signing key) at index `i`, `0 <= i <= 2^31 - 1`. Each child is an ordinary ERC-5564 scheme-1 meta-address; nothing on chain changes, scheme id stays 1, router and relayer are unchanged.
4. Child 0 is the **public child** (ERC-6538 registry, tip jars, merchant profile/embed pinning). Indices 1.. are allocated sequentially, one per client, by a single allocating device.
5. Scanning cost grows linearly with the number of **active** children. Children become dormant after their invoices expire plus a grace period; dormant children are covered by claim-by-hash (idea 02) and by explicit catch-up scans. Default active cap 16, hard cap 64.
6. Legacy (pre-A2) random keys remain a separately stored, non-derivable "legacy child" that is always scanned.

## 3. Goals / non-goals
Goals: G1 two clients holding invoices cannot link them through meta-address or signer key; G2 one backup (seed) recovers all children's funds; G3 bounded, displayed scan cost; G4 no on-chain or payer-side change; G5 a watch-only export that can scan all children but spend none (input for D2); G6 deterministic, versioned, test-vectored derivation.
Non-goals: per-**invoice** meta-addresses (one client's invoices still link to each other by design; per-invoice would multiply scan cost); hiding the seller from the payer; unlinking sweeps, gas funding, relayer, timing or amounts (section 6.1); BIP-32/BIP-39/SLIP-39 compatibility (rejected in 13; B2 Shamir can split the seed later); multi-device concurrent allocation; Bitcoin BIP-352 (labels are explicitly not identity separation per BIP-352; out of scope).

## 4. Derivation scheme `gp-a2-v1` (normative once Accepted)

Primitives: HKDF-SHA-256 (RFC 5869) from `@noble/hashes/hkdf.js` + `sha2.js`; secp256k1 from `@noble/curves` (ADR-0004: no other crypto library). `n` = secp256k1 group order. `u32be(i)` = 4-byte big-endian. `utf8(s)` = UTF-8 bytes of an ASCII string. `||` = concatenation.

### 4.1 Seed
`seed`: exactly 32 bytes. New: `crypto.getRandomValues` (via the existing `RandomSource` abstraction in `rng.ts`). Legacy-derived: section 4.5. The seed is never shown as hex in the UI by default (export only through the encrypted backup; an "advanced: show seed" path is out of scope for v1).

### 4.2 Roots
```
PRK       = HKDF-Extract(salt = utf8("GhostPay/a2/v1/extract"), IKM = seed)
spendRoot = HKDF-Expand(PRK, utf8("GhostPay/a2/v1/root/spend"), 32)
viewRoot  = HKDF-Expand(PRK, utf8("GhostPay/a2/v1/root/view"),  32)
signRoot  = HKDF-Expand(PRK, utf8("GhostPay/a2/v1/root/sign"),  32)
vaultKey  = HKDF-Expand(PRK, utf8("GhostPay/a2/v1/root/vault"), 32)
```
(`Extract`+`Expand` with these inputs equals Web Crypto `HKDF(seed, salt, info, 256 bits)`, which the second implementation uses.)

### 4.3 Child scalars
```
childScalar(root, purpose, i):            purpose in {"spend","view","sign"}, root = the matching root
  require integer 0 <= i <= 2^31 - 1
  for ctr = 0 .. 255:
    info = utf8("GhostPay/a2/v1/child/") || utf8(purpose) || 0x00 || u32be(i) || u8(ctr)
    okm  = HKDF-Expand(root, info, 48)
    k    = OS2IP(okm) mod n                 # 384-bit reduce: bias < 2^-128 (RFC 9380 hash_to_field sizing)
    if k != 0: return I2OSP(k, 32)
  fail DERIVATION_FAILED                    # probability ~2^-256 per step; reachable only via test hook
```
Child `i` = `{ spendingSecret: childScalar(spendRoot,"spend",i), viewingSecret: childScalar(viewRoot,"view",i), signingKey: childScalar(signRoot,"sign",i) }`; public keys are compressed SEC1 (`publicKeyOf`). Post-conditions checked on every derivation: spending public key != viewing public key (`KEY_REUSE`, else hard error, never skip to another index); the child's three public keys do not equal any key of another allocated child or the legacy child (collision = abort with `DERIVATION_COLLISION`, treated as a bug report).

Why three separate roots: a watch-only device receives `viewRoot` only and can derive every child's viewing key (G5) without any ability to spend or sign. Why per-purpose labels inside the child step as well: defence in depth if a root is ever reused by mistake.

### 4.4 Index space
| Range | Meaning |
|---|---|
| 0 | public child (registry, profile, tip jar, embed) |
| 1 .. 2^24 - 1 | client children, allocated sequentially by the allocating device |
| 2^24 .. 2^31 - 1 | reserved (future device lanes or purposes); the v1 allocator refuses them, the deriver accepts them (vectors cover 2^31 - 1) |
Indices are never reused for a different client. Archiving does not free an index.

### 4.5 Seed for existing users (migration)
```
seed = HKDF-Extract(salt = utf8("GhostPay/a2/v1/legacy-seed"), IKM = spendingSecret(32) || viewingSecret(32))
```
- The signing key is excluded because `importSession` may regenerate it (`signingKeyHex` optional).
- Consequence: a user who never makes a new backup can still recover all children from the old v1 keystore (decrypt, recompute seed, derive). Child 0 of a legacy-derived seed is a **new** meta-address; the legacy keys themselves stay as the "legacy child" (section 5.2) and keep being scanned.
- Security note for review: the legacy spending secret is used both as a stealth spending key (EC scalar) and as HKDF input. HKDF-Extract with a distinct salt models the output as independent under the standard HMAC-as-PRF assumption; no EC operation is ever performed on the seed. Knowing the legacy viewing key alone (e.g., a watch-only export) does not reveal the seed.

### 4.6 Vault key use
`vaultKey` replaces "HKDF over the viewing key" as the input keying material for the tag vault and the new encrypted child registry (section 8), via the existing per-profile salt and info strings (`tags.ts`), with a new info prefix `GhostPay/local-tags/v2/...` so v1 and v2 records cannot be confused. Migration re-encrypts v1 records (spec 08 `rotateKeys`).

### 4.7 Versioning
`derivation: "gp-a2-v1"` is stored with every key set. If a defect is found, v1 is frozen (still derived for existing children forever) and a `gp-a2-v2` is introduced for new children only; the registry records the version per child. There is no automatic migration of funds.

## 5. Types and APIs

### 5.1 core-crypto (`src/hd.ts`, new; exported from `index.ts`)
```ts
export const A2_DERIVATION_ID = 'gp-a2-v1' as const;
export const A2_MAX_INDEX = 0x7fffffff;
export const A2_CLIENT_INDEX_LIMIT = 0x00ffffff;

/** 32 secret bytes; redacting like SecretScalar (throws on JSON/String/inspect). */
export type SecretSeed = Uint8Array & { readonly [seedBrand]: 'SecretSeed' };

export interface A2Roots {
  readonly spendRoot: SecretSeed; readonly viewRoot: SecretSeed;
  readonly signRoot: SecretSeed;  readonly vaultKey: SecretSeed;
}
export interface ChildKeySet extends StealthKeySet {
  readonly index: number;
  readonly signingKey: SecretScalar;
  readonly signerPublicKey: CompressedPoint;
  readonly derivation: typeof A2_DERIVATION_ID;
}
export function generateSeed(rng?: RandomSource): SecretSeed;
export function seedFromBytes(bytes: Uint8Array): SecretSeed;                     // length 32 else INVALID_SEED
export function seedFromLegacyKeys(spending: SecretScalar, viewing: SecretScalar): SecretSeed;
export function deriveRoots(seed: SecretSeed): A2Roots;
export function deriveChild(roots: A2Roots, index: number): ChildKeySet;          // full child
export function deriveChildViewing(viewRoot: SecretSeed, index: number): SecretScalar; // watch-only
export function zeroizeRoots(r: A2Roots): void;
```
Errors (added to `CryptoErrorCode`): `INVALID_SEED`, `INVALID_INDEX`, `DERIVATION_FAILED`, `DERIVATION_COLLISION`. Test-only hook: `__setChildExpandForTests` (not exported from the package entry) to force `k == 0` and exercise the `ctr` loop.

### 5.2 Web session (`session.ts`)
```ts
export type SessionSecrets =
  | { readonly mode: 'legacy'; readonly keys: StealthKeySet; readonly signingKey: SecretScalar }
  | { readonly mode: 'a2'; readonly seed: SecretSeed; readonly seedOrigin: 'random' | 'legacy-v1';
      readonly roots: A2Roots; readonly legacy?: { keys: StealthKeySet; signingKey: SecretScalar } };
export interface ChildPublic { index: number | 'legacy'; metaAddress: string; signerPublicKey: string;
  spendingPublicKey: string; viewingPublicKey: string; label?: string /* decrypted, UI only */;
  status: 'active' | 'dormant' | 'archived'; activeUntil?: number }
export function enablePerClient(): Promise<ChildPublic>;     // legacy -> a2 (legacy-derived seed); returns child 0
export function allocateChild(label: string): Promise<ChildPublic>; // write-ahead: persist nextIndex before returning
export function childSecrets(index: number | 'legacy'): ChildKeySet | (StealthKeySet & { signingKey: SecretScalar });
```
Secrets stay in the module closure as today; child secrets are derived on demand and zeroized after use; only `ChildPublic` reaches React state.

### 5.3 Child registry record (encrypted, IndexedDB store `ghostpay-children`)
```ts
interface ChildRecordPlain {
  v: 1; index: number | 'legacy'; derivation: 'gp-a2-v1' | 'legacy';
  label: string;                       // client name, 1..200 chars; sensitive
  createdAt: number; activeUntil: number; status: 'active' | 'dormant' | 'archived';
  spendingPublicKey: string; viewingPublicKey: string; signerPublicKey: string; // integrity re-check on load
  coverage: Record<string /*chainId*/, Array<[string, string]>>; // scanned block ranges, decimal, merged
  registry?: Record<string /*chainId*/, { txHash: string; at: number }>; // only for index 0 / legacy
}
interface AllocatorState { v: 1; nextIndex: number; deviceId: string /* random 16 hex, local */; updatedAt: number }
```
Records are AES-256-GCM encrypted under a key from `vaultKey` (HKDF info `GhostPay/children/v1/aes-gcm`), AAD `GhostPay/children/v1|<recordId>`; record ids are random. On load, public keys are re-derived from the seed and compared; a mismatch marks the record corrupt and the child is not used for new invoices.

### 5.4 Backup format
Preferred: idea 04 (B1) container `keys` section, version 2:
```jsonc
{ "kind": "ghostpay-keys", "v": 2, "derivation": "gp-a2-v1",
  "seed": "<64 hex>", "seedOrigin": "random" | "legacy-v1",
  "legacy": { "spendingKey": "<hex64>", "viewingKey": "<hex64>", "signingKey": "<hex64>" } | null,
  "nextIndex": 17,
  "children": [ { "index": 0, "label": "Public", "createdAt": 1790000000, "status": "active" }, ... ] }
```
Importer rules: if `seedOrigin == "legacy-v1"`, recompute the seed from `legacy` and reject a mismatch; recompute every public key; reject `nextIndex` > `A2_CLIENT_INDEX_LIMIT`; labels sanitized like tags. If B1 has not landed, the same JSON goes into a keystore file `v: 2` using the v1 crypto (scrypt + AES-GCM, AAD gains `|v2|gp-a2-v1`), and `decryptKeystore` keeps accepting v1.
Watch-only export (input for D2, not built here): `{ kind: "ghostpay-watch", v: 1, derivation, viewRoot, legacyViewingKey?, children: [{ index, spendingPublicKey }] }` in the same encrypted container, with copy: "Anyone with this file can see every payment to every client, past and future."

### 5.5 Invoice creation (`invoiceCreate.ts`)
`buildInvoiceLink(form, ...)` gains `childIndex: number | 'legacy'`; `metaAddress` and `signer` come from that child; the invoice is signed with that child's signing key. `activeUntil = max(activeUntil, expiresAt + graceSeconds)` (grace default 14 days) is written to the registry **before** the link is shown.

### 5.6 Scanner (`scannerCore.ts`, `scanClient.ts`)
```ts
type ToWorker = { type: 'start'; children: ReadonlyArray<{ id: string /* "3" | "legacy" */; viewingKey: Uint8Array;
                  spendingPublicKey: string }>; ignoreViewTag?: boolean } | ... ; // batch/claim/bench/cancel/end as idea 02
interface WireMatch { id: string; stealthAddress: string; tagMismatch: boolean; childId: string }
```
Per log: parse once, then for each child ECDH -> tag -> address. Optional optimisation (measure first): precompute the window table of `R` once per announcement and reuse it for all children. Parallelism: `min(navigator.hardwareConcurrency - 1, 4)` workers, logs split by batch, each worker gets all active children's viewing keys. Coverage ranges per child per chain are written after each completed page (in the encrypted registry, not `localStorage`; the v1 plaintext checkpoint keeps only the global cursor).

## 6. Threat model

| Actor | Before A2 | After A2 |
|---|---|---|
| Two clients comparing invoices | same meta-address + same signer => same seller | different meta-address and signer; still possible via invoice style, amounts, timing, sweep destinations (6.1) |
| Anyone reading ERC-6538 | registry links wallet <-> the only meta-address | links wallet <-> child 0 only; client children cannot be published (UI blocks) |
| Observer of chain | sees announcements; cannot attribute | unchanged; children are indistinguishable on chain |
| Thief of seed / keystore + passphrase | all funds | all funds of all children (same blast radius; no improvement) |
| Holder of watch-only export | n/a | sees all children's payments past and future |
| Holder of one child's secrets (e.g., leaked by a device used for one client) | n/a | that child only: hardened derivation, no parent recovery from a child key |
| Malicious frontend bundle | total compromise | total compromise (ADR-0015 unchanged) |

### 6.1 What this does NOT hide (honest list)
- **Sweeps.** Sweeping two children to the same destination, or in the same block/minute, links those clients' payments on chain. A3 (idea 01) must warn when a destination was already used by another child. Relayer sweeps put every child's sweep in front of the same relayer.
- **Gas funding and buffers** that come from one seller wallet link children.
- **Invoice fingerprint**: currency, token, line-item wording, memo, tax rate, expiry, fee policy, app version and link format can still identify one seller to clients who compare.
- **Seller identity inside the invoice** (a name in the memo) defeats A2 entirely.
- **Child 0** is public; using it for a client links that client to the public identity. Using one child for two clients links them.
- **Payers, amounts, tokens, timing, router use** remain public as before (privacy-limits.md). A2 does not hide anything from the payer about their own payment.
- **RPC**: scanning sends the same announcer-wide `eth_getLogs` regardless of child count, so the RPC learns nothing new about children; but claim/balance queries (idea 02) reveal interest in specific addresses.
- **Device**: anyone with access to the unlocked app sees the client list.

## 7. Scan-cost budget

Measured 2026-10-21 in this repo's container (4 vCPU, Node, noble 2.x, warm): ECDH + keccak = **2.4 ms per announcement per child**; 32 children on one announcement = 85.6 ms (linear, no sharing). The wrong-tag extra is 0.55 ms (idea 02). Browser numbers on a reference laptop are UNVERIFIED and must be recorded before the default caps are final.

Why linear cost is inherent: each child must have an independent viewing public key, otherwise a shared viewing key would itself link the children (ideas.md A2). Any construction where children's viewing keys are related by public data links them; a secret relation (e.g. `V_i = t_i * V`) still needs one scalar multiplication per child per announcement, so it saves nothing.

Single-thread CPU per scan window (2.4 ms x announcements x active children):

| Announcements in window | 1 child | 4 | 16 (default cap) | 64 (hard cap) |
|---|---|---|---|---|
| 1 000 | 2.4 s | 9.6 s | 38 s | 2.6 min |
| 10 000 | 24 s | 1.6 min | 6.4 min | 26 min |
| 100 000 | 4 min | 16 min | 64 min | 4.3 h |

Rules
1. `activeChildren` = children with `activeUntil >= windowStartTime` plus child 0 plus legacy. Default cap 16 (configurable 1-64). Allocating beyond the cap is allowed; the UI then shows which children become dormant first (oldest `activeUntil`).
2. Before each scan the UI shows "N announcements x K active children = estimated T on this device" using the worker `bench` measurement (idea 02 section 4.5), and offers to split the range.
3. Dormant children are **not** scanned by default. They are covered by: claim-by-hash over **all** children (one tx, cost negligible); "catch-up scan" of selected children over their uncovered ranges; a monthly reminder (shown in-app on next open, no background job) to run a full-coverage scan.
4. Coverage display per child: "Scanned on Base Sepolia through block N; uncovered ranges: ...".
5. Parallel workers reduce wall time, not total CPU; laptops on battery may throttle.

## 8. Storage and key handling
- In memory only (session closure): seed, roots, legacy keys. Child secrets are derived per operation (sign invoice, start scan, sweep) and zeroized after; viewing keys for scanning are revealed only into worker messages, as today.
- IndexedDB (encrypted): child registry, allocator state, per-child coverage, tag records (v2 keys).
- `localStorage` (plaintext): unchanged global scan cursor only. Child count, labels and coverage are **not** stored in plaintext because they reveal the number of clients and activity windows.
- Backup: B1 `keys` v2 section or keystore v2 (5.4). A backup prompt is mandatory after enabling A2 and after each **N = 5** new children (labels and `nextIndex` are not derivable from the seed).
- Lock: existing idle lock clears seed, roots and decrypted labels.

## 9. UX
- **Seller keys > "Per-client addresses"** (opt-in, off by default). Explains: what it hides (D3 via meta-address and signer), what it does not (6.1), the scan-cost table with the device's own estimate, and the backup requirement. "Enable" derives the seed from current keys (existing users) or creates a new seed (new users), shows child 0, and opens the backup flow.
- **Clients list**: label, short meta fingerprint, signer fingerprint, status, active until, coverage summary; actions Copy meta-address, Archive, Reactivate, Catch-up scan. "Add client" asks only for a local label.
- **Create invoice**: "Client" select (default "Public address (child 0)" with an inline note "Invoices with your public address can be linked to each other"); "New client..." inline.
- **Scan**: header "Scanning K active children (+ legacy)"; per-match child label (if vault unlocked); dormant-children notice with catch-up action.
- **Registry (spec 06)**: publish button only for child 0 or legacy; for other children the action is absent and the help text says why.
- **Sweep**: A3 warning when the destination was used by another child; batch-sweeping several children at once shows "This links these clients on chain".
- Copy: never "unlinkable", "anonymous", "private address per client"; say "separate address per client; other links remain".

## 10. Test vectors plan
Provisional vectors generated 2026-10-21 by a throwaway script implementing section 4 with `@noble/hashes` HKDF; `spendRoot` and child-1 `spendSecret` were reproduced with Web Crypto HKDF/HMAC (independent code path). They become normative only after acceptance and reproduction by the committed implementations.

Seed `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`:
```
spendRoot 6069ff53148c6be3b5de00f63cd49f41922c2b1d9efc1d7d4e25482922a0df74
viewRoot  8a3de61d33c12e5f07e693c98ef21036e2b8c2ea6242fc3baff76a8e92edea65
signRoot  c169c49bcf8a5de3d5fd65f5ed1e66fe9ee9460ffd2f512ce9cf771a9c370d13
vaultKey  e948a4c587c163474e7f243bb7c93ba97d2394fa00f5610b1fa2aab9eac2c1ea
i=0   spendSecret 12aba3aab2af51945b8032f1dfc5fbe24dc2f324854e8f56db5b2afd8199c47b
      spendPub    03b24034989c7e6d35801b4349b4557a11afa5a75092895117a2695c9a9857d6d4
      viewSecret  d3eaf79ab12b91418e528fffd78c13986aef3c7ce9643a90d6de01a16a9766af
      viewPub     02d00a99ea6a1ef06817733141ec324f09fbde40fef1c588d648a2d9d5617ccdc7
      signPub     0309cdf9a15ed1c8f3a251feb3e2fdc159ff1fea4a0cd937a43fd531d05869fba9
i=1   spendSecret 1818bfa09fad26908625fcc0397ca63fde2d555cb64ef28156789181cbb5dca2
      spendPub    031ce28b644abc6e7b4bd63c9a6a3e33bf78d73f296f6f86adae840ff8a2ea41c5
      viewSecret  e5ba516f9cb129f9354eae897bc78be3231a5a937212633b75f70618ddf13fa6
      viewPub     0234cb6853fa5f16e8c326d6e0e9092172548baa935be84df5777b632492180ad2
      signPub     03020d94b3d07d6e52b05786ab4a9963de821a56d0f0ab30900a44777a05006dbe
i=2147483647
      spendSecret 2847e6205e81aa0f075675b34e50d83d5509d8d8c3269025c71f7eb0d30bcb66
      spendPub    0282ee048a6493c682bc61745acdeddd3196b94bce0b6b661d3557551af679b9a8
      viewSecret  bd9ed1ad43d6c5c73850e6f7142092bf123d2ba711a4d8e94aa154ac3f2d0fe0
      viewPub     0244052c83b4d34cb537848341dcf388b0af6a91f5a85ef398753785ec588518aa
      signPub     029680eb8f0b92d87cd9461a7348fe08ebb9f97fe779bd807bbc1debc944ebfabf
legacy seed from spending=0x11*32, viewing=0x22*32:
      64e9bd69ece0100fab5d5b27bf536b7c3287fe3606c546f941d836d489de2718
```
Committed vector set (`packages/core-crypto/src/vectors/a2-v1.json`, new):
1. Three seeds (above; all-`ff`; `sha256("GhostPay A2 vector 3")`) x indices {0, 1, 2, 1000, 2^24 - 1, 2^31 - 1}: roots, all child secrets and public keys, encoded meta-address, signer public key.
2. Legacy-seed vectors (two key pairs) and the resulting child 0.
3. End-to-end: child 1 meta-address + fixed ephemeral scalar -> stealth address, view tag, and `deriveStealthSecret` round trip (ties A2 to ADR-0001 vectors).
4. Negative: index -1, 2^31, 1.5, NaN -> `INVALID_INDEX`; seed of 31/33 bytes -> `INVALID_SEED`; forced `k == 0` at ctr 0 and 1 via the test hook -> ctr 1/2 result; forced 256 zeros -> `DERIVATION_FAILED`.
Independent implementations: (A) production `hd.ts` with noble HKDF; (B) test-only implementation using Web Crypto HKDF + HMAC-based Expand and native `BigInt` reduction (shown to agree above); (C) Python 3 stdlib script (`hashlib`, `hmac`, pure-Python point multiplication) under `packages/core-crypto/scripts/a2-vectors.py`, run in CI, not shipped. All three must produce byte-identical JSON.

## 11. Failure modes

| Failure | Consequence | Mitigation |
|---|---|---|
| Seed (and old keystore) lost | all children's funds lost | mandatory backup prompt; B1 drill gating; same as today |
| `nextIndex`/labels lost, seed kept | funds safe; client names lost; unknown highest index | recovery scan with gap limit G=20 from index 1, extended while any of the last G children has a payment; user may enter "about how many clients" to raise the bound; labels gone unless tags/B1 backup exists |
| Client created but unpaid beyond the gap at recovery | later payment missed by scans | claim-by-hash finds it (tests indices up to `nextIndex` guess + G); docs tell users to back up after adding clients |
| Two devices allocate the same index for different clients | those two clients share a meta-address (linkage, not fund loss) | single allocating device; `deviceId` in allocator; on backup import with diverging `nextIndex`/labels the UI shows a conflict and moves the newer device's clients to fresh indices for **new** invoices (already-issued links cannot change) |
| Payment to a dormant child | missed by normal scan | claim-by-hash over all children; catch-up scan; monthly reminder |
| Crash between showing a meta-address and persisting `nextIndex` | index reuse | write-ahead: persist allocator and record first, then show |
| Derivation defect found post-launch | possibly unsafe keys | versioned derivation (4.7); freeze v1; advise sweeping affected children; vectors + review make this unlikely |
| Corrupt registry record | wrong label or keys | public keys re-derived and compared on load; mismatched record quarantined |
| User publishes child 0, then uses it for a client | client linked to public identity | inline warning on Create invoice |
| Scan exceeds budget | long scans, battery | estimate before start, caps, range split, cancel |
| Legacy user never enables A2 | unchanged behaviour | A2 is opt-in |

## 12. Acceptance criteria
- [ ] ADR accepted in ADR-LOG with the exact strings of section 4 and the vector file hash.
- [ ] Implementations A, B, C produce identical `a2-v1.json`; CI runs the comparison.
- [ ] Section 14 checklist signed by an independent reviewer and stored in `docs/reviews/`.
- [ ] Legacy upgrade: an existing v1 keystore recovers legacy keys and every derived child (test with a fixture keystore).
- [ ] Two invoices for different clients share no field derived from keys (meta-address, signer, AAD signer bytes) (unit test over the canonical invoice).
- [ ] Scanner finds payments to K = 1, 4, 16, 64 children plus legacy on anvil; dormant child payment found by claim-by-hash.
- [ ] Registry UI cannot publish a child other than 0/legacy.
- [ ] No plaintext child count, labels or coverage in `localStorage` or unencrypted IndexedDB (storage inspection test).
- [ ] Reference-laptop scan-cost numbers recorded and the default cap confirmed or changed.
- [ ] User docs (`set-up-stealth-meta-address.md`, `privacy-limits.md`, `receive-and-scan.md`) updated with 6.1; THREAT_MODEL D3 moved to "Mitigated in part (opt-in), residual links listed".

## 13. Rejected alternatives
- **BIP-32 / BIP-44 paths (e.g., `m/5564'/...`)**: no ERC defines a stealth derivation path, so no interoperability gain; non-hardened derivation would let a leaked child key plus a chain code reveal the parent; hardened-only BIP-32 is equivalent to the HKDF construction but drags in `@scure/bip32` (ADR-0004 forbids extra crypto libraries in our code).
- **BIP-39 mnemonic**: same ADR-0004 issue plus wordlist handling; deferred to B2 (Shamir) as a separate decision.
- **Wallet-signature-derived keys (sign a fixed message, hash it)**: ties seller keys to a payer wallet identity, depends on deterministic signatures (not guaranteed by all wallets/hardware), and a phishing page can request the same signature.
- **Shared viewing key, per-client spending key**: one ECDH per announcement, but the shared viewing public key appears in every meta-address and links them, defeating the purpose.
- **Random independent keys per client, no seed**: each new client needs a new backup; one forgotten backup loses that client's funds.
- **Label-derived index (`i = HMAC(seed, clientName)`)**: not enumerable for recovery; a typo creates a new identity.
- **Hosted child registry or cloud sync of the client list**: needs a server that learns client count and timing. Rejected by the hard constraint; the encrypted backup file is the sync mechanism.
- **Hosted scanning of dormant children**: needs viewing keys on a server. Rejected (ideas.md rejected list).
- **BIP-352 labels**: BIP-352 states labels are not identity separation; not applicable to EVM.

## 14. Cryptographic review checklist
- [ ] Seed source is the CSPRNG via `rng.ts`; no `Math.random`; legacy seed uses only secret inputs.
- [ ] HKDF usage matches RFC 5869: Extract salt/IKM order, PRK length >= HashLen for every Expand, Expand output length <= 255 x 32.
- [ ] Domain separation: every info/salt string unique, versioned (`v1`), purpose-labelled, fixed ASCII; the 0x00 separator and fixed-width index/ctr encodings make inputs prefix-free.
- [ ] Scalar reduction: 48-byte reduce mod n, bias < 2^-128; zero rejected via counter; no silent wrap of an out-of-range scalar (contrast `secretScalarFromBytes`, which rejects).
- [ ] Independence: spending, viewing, signing roots are distinct HKDF outputs; compromise of `viewRoot` reveals no spending or signing key; compromise of one child reveals no other child or root (no public derivation exists).
- [ ] Legacy seed: dual use of the legacy spending secret (EC scalar and HKDF IKM) assessed and accepted or rejected in writing.
- [ ] `KEY_REUSE` and collision checks are hard failures, never index skipping (skipping would desynchronise recovery).
- [ ] Index validation: integers only, range checked before derivation; JS number edge cases (negative zero, > 2^53) rejected.
- [ ] Secrets wrapped in redacting types (`SecretSeed`, `SecretScalar`); intermediate `okm`/PRK buffers zeroized best effort; no secret in error messages, logs or React state.
- [ ] Worker receives only viewing keys and spending public keys; no seed or root ever crosses `postMessage`.
- [ ] Constant-time considerations: noble scalar multiplication used as today; derivation branches only on public data or on `k == 0` (negligible).
- [ ] Vectors: three implementations agree; negative vectors exercise every error path including the ctr loop.
- [ ] Invoice signer per child: the `signer` field and envelope AAD use the child's key; child 0 is the only signer pinned by profile/embed (spec 14).
- [ ] Encrypted registry: AEAD with random IV, AAD binds record id and version; labels never in plaintext storage.
- [ ] Backup v2 importer recomputes the seed (legacy origin) and every public key; rejects mismatches and oversized `nextIndex`.
- [ ] Versioning path (4.7) documented; no code path can derive a v1 child with v2 strings or vice versa.

## 15. Effort and dependencies
| Part | Days |
|---|---|
| `hd.ts`, redacting `SecretSeed`, errors, vectors, implementations B and C | 3.5 |
| Session modes, allocator, encrypted child registry, legacy upgrade | 2.5 |
| Backup `keys` v2 (B1 section or keystore v2) | 1.5 |
| Multi-child worker, worker pool, coverage tracking, estimate | 2 |
| UI: clients list, invoice picker, scan header, registry guard, sweep warnings | 2.5 |
| anvil/Playwright tests, storage inspection, docs | 1.5 |
| **Total** | **13.5 (+ independent crypto review, external)** |
Hard dependencies: this ADR accepted; idea 02 (claim-by-hash over all children is the safety net for dormant children; worker protocol shared); idea 04/B1 (backup container) or keystore v2 fallback; spec 08 `rotateKeys` (tag re-encryption to v2 keys). Soft: spec 06 registry guard (if 06 lands first, add the guard there), idea 01/A3 destination-reuse warning, spec 14 profile pins child 0, D2 watch-only consumes the export format.
