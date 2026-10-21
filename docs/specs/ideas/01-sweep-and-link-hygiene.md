# Idea spec 01: Sweep and link hygiene (A3 + A1 + A4)

Status: **proposal-grade spec, not reviewed, not built.** Branch `claude/remote-extensions-3`, 2026-10-21. Effort: **M** (about 3 engineer-weeks, see section 15). Owner: apps/web, packages/invoice-schema. Plan: [../../remote/plans/ideas/01-sweep-and-link-hygiene.md](../../remote/plans/ideas/01-sweep-and-link-hygiene.md).
Sources: `docs/remote/ideas.md` (A1, A3, A4, "What to spec first"), `docs/remote/research.md`, `docs/threat-model/THREAT_MODEL.md` (D1, S3-03, I-row "Link read by a third party"), `docs/user/privacy-limits.md`, gap-analysis item 13, ADR-0005 (envelope), `docs/specs/08-feature4-archive-key-rotation.md` (vault format).

## 0. Hard constraint and how it is met

Everything runs in the browser on static hosting. No backend, no operator-run service, no server-side secret, no new third-party egress.

| Part | Needs a server? | Decision |
|---|---|---|
| A3 history check, wizard, fresh-destination list | No (local encrypted log + optional user-RPC reads) | In |
| A3 "is this destination fresh" via chain data | Only the RPC the user already configured | In, opt-in per sweep, disclosed (section 9) |
| A3 address-labelling / sanctions / "known exchange" lookups | Would need a hosted dataset or API | **Rejected.** A bundled static list could go stale and imply safety; not shipped |
| A1 paste-import | No | Already exists (`Pay.tsx` `onPasteSubmit`, `lib/fragment.ts` `extractFragment`); only hardening and a bare-payload form are new |
| A1 passphrase link | No (scrypt + AES-GCM in page) | In |
| A1 "send the passphrase over a second channel" | Out-of-band by humans | In (user action, no service) |
| A1 link shortener / one-time-view link / expiring server-side link | Needs server state | **Rejected.** A bearer link in a fragment cannot be revoked client-side; spec says so |
| A4 randomized timing | Foreground scheduler in the open tab | In |
| A4 "sweep while tab is closed" (relayer holds pre-signed sweeps, push, cron, service worker with key) | Needs relayer-held signed orders, an operator service, or keys at rest | **Rejected** (relayer sees all fields and would hold signed orders; keys never at rest). Window is only as long as the tab stays open |

## 1. Goals and non-goals

Goals
1. Before a sweep, tell the seller what the app can know locally about the chosen destination and offer a better one (D1).
2. Provide fresh destinations without putting a wallet seed in the browser.
3. Let a payer import an invoice without a clickable link, and let a seller protect a link with a passphrase so that a leaked link alone does not reveal the invoice (S3-03, chat previews, clipboard managers).
4. Let a seller spread sweeps over a random window to dull the "paid, then swept within minutes" heuristic.
5. UI copy never says private, anonymous or untraceable (wording gate, section 12).

Non-goals
- No anonymity. A sweep stays a public transfer from the one-time address to the destination; the payer can watch the one-time address and see where it goes. Nothing here changes that.
- No mixer, pool, bridge or consolidation (A8/A9 deferred).
- No revocation of links already shared. No expiry enforcement beyond the signed `expiresAt` (checked by `checkExpiry`).
- No change to contracts, the relayer API, the signed sweep typed data, or the on-chain announcement.
- No hosted address intelligence (see section 0).

## 2. User stories

S1 Seller: "I am about to sweep to the wallet I sweep everything to. Warn me that this joins my payers' payments."
S2 Seller: "Give me a new address from my hardware wallet each time without typing it." (xpub, not seed)
S3 Seller: "I sweep three payments today; warn me if they would land at the same address."
S4 Seller: "Send the invoice so that the chat app's link preview and my clipboard history do not hold a readable invoice."
S5 Payer: "I received `gpi=v1...` text and a passphrase by phone; open it without clicking a link."
S6 Seller: "Sweep sometime in the next 2 to 24 hours, not now."
S7 Seller: "Tell me honestly what this did not hide."

## 3. UX flow

### 3.1 Sweep hygiene wizard (A3), in `views/Sweep.tsx`
The wizard replaces the free-text destination step; the existing relayer/direct and quote steps are unchanged after it.

1. Step "Destination". Three sources: (a) next fresh address from my saved xpub (default when configured), (b) pick from my saved address list, (c) type or paste an address. Whatever the source, the full 42-char address is shown in `Mono` with EIP-55 checksum casing and a copy button.
2. Step "Check" runs `assessDestination` (section 5.2) and shows findings sorted by severity. Each finding has plain text and one action ("Use a fresh address instead", "I understand, continue"). `block` severity (contract addresses already enforced by `checkDestination`, destination equal to owner) cannot be overridden. `warn` needs an explicit checkbox "I understand this links these payments".
3. Optional chain check toggle (off by default): "Look up this address on my RPC" with the sentence "Your RPC provider will see this address and your IP. It will also see the sweep itself, but a relayer-only sweep does not otherwise reach your RPC with this address." Result adds findings F6-F8.
4. Step "Timing": send now (default, unchanged), or "Spread over a window" (A4, section 3.3).
5. Step "Confirm": summary table: one-time address, destination, amount, fee, timing, and the fixed linkability notice (kept; reworded per section 12).

Fresh-address setup (Settings > "Sweep destinations", or inline): paste an **account-level extended public key** (xpub/zpub-style for the EVM chain path, see 5.3). The app shows index 0 and index 1 addresses and says: "Compare index 0 with the address your wallet shows for this account before using this feature." It stores nothing until the user confirms.

### 3.2 Links (A1)
Create invoice (`views/CreateInvoice.tsx`), "Protect the link" group:
- Radio "Share as": **link** (current), **payload text** (new, `gpi=v1.…` with no origin, not a URL so no preview fetch and no history entry on paste), **QR** (current).
- Checkbox "Require a passphrase" (new). When on: default "Generate a passphrase for me" (shown once, with copy button and "send this by a different channel than the link"); alternative "I will choose one" with `passphraseProblem`-style check (min 12 chars, plus a "short passphrases can be guessed offline" warning).
- The current "Encrypt private fields" checkbox stays; copy changes to state that the key travels inside the link, so it only hides fields from systems that do not parse the fragment.

Pay (`views/Pay.tsx`):
- Existing paste box accepts: full link, `#gpi=v1.…`, bare `gpi=v1.…` (new), with whitespace/line-wrap tolerance (section 4.3).
- If the envelope needs a passphrase, a passphrase field appears with "Unlock invoice". Wrong passphrase gives one generic message and a retry counter; nothing partial is shown. Unlocking takes about a second (scrypt); show `role=status` "Unlocking…".
- After import, the text area is cleared and `autoClearFragment` behaviour is unchanged for clicked links.
- Hint copy: "Pasting avoids leaving a link in your browser history. Anything that can see this page or your clipboard can still read it."

### 3.3 Sweep window (A4), in the wizard timing step
Inputs: window min and max (default 1 h to 12 h; bounds 0 to 24 h via the existing `checkDelayRange` rule, separate settings keys, section 6.4). Button "Schedule". A card shows: due-in countdown (monotonic), "Keep this tab open", "Cancel", "Sweep now". At due time the app re-reads balance, re-fetches the relayer quote (or recomputes gas for direct), re-runs `assessDestination`, and **asks the user to confirm in the page** unless they ticked "Complete automatically while this tab is open" (default off; the key is derived in memory just then, as today).

## 4. Data formats and APIs

### 4.1 Types (new file `apps/web/src/lib/sweepHygiene.ts`)
```ts
export type FindingSeverity = 'info' | 'warn' | 'block';
export type FindingCode =
  | 'DEST_IS_OWNER' | 'DEST_IS_PROTOCOL'            // block (already enforced by checkDestination)
  | 'DEST_PREVIOUSLY_USED'                           // warn: in sweep log on this chain
  | 'DEST_SHARED_IN_BATCH'                           // warn: also chosen for another pending/just-swept payment in window
  | 'DEST_USER_LINKED'                               // warn: in user's "already linked" list
  | 'DEST_SAME_AS_REGISTRY_WALLET'                   // warn: equals registrant wallet of my ERC-6538 entry (spec 06) if known
  | 'DEST_NOT_FRESH_CHAIN'                           // info/warn: nonce>0 or native balance>0 (RPC opt-in)
  | 'DEST_IS_CONTRACT'                               // warn: eth_getCode != 0x (RPC opt-in)
  | 'TIMING_NEAR_PAYMENT'                            // info: sweep soon after payment seen
  | 'DEST_FROM_XPUB_UNCONFIRMED';                    // warn: xpub index 0 never confirmed by user
export interface Finding { code: FindingCode; severity: FindingSeverity; text: string }
export interface DestinationInput {
  chainId: number; destination: Address; owner: Address; token: Address | 'native';
  paymentSeenAtMs?: number;            // from scanner first-seen, if available (UNVERIFIED: ScanMatch has no timestamp today; add in the tag record or scan state)
  now: number; chainLookup: boolean;
}
export interface HygieneContext {
  log: SweepLogReader;                 // 5.4
  linked: ReadonlySet<Address>;        // lowercase
  rpc?: Pick<RpcClient, 'request'>;    // only if chainLookup
  manifest: DeploymentManifest;
}
export function assessDestination(i: DestinationInput, c: HygieneContext): Promise<readonly Finding[]>; // pure given reader/rpc; never throws on lookup failure (adds an 'info' "could not check")
```
`assessDestination` composes `checkDestination` (existing, `lib/sweep.ts`) and never replaces it; `relayedSweep`/`directSweep` still receive an address that passed `checkDestination`.

### 4.2 Passphrase envelope (A1), in `packages/invoice-schema/src/envelope.ts`
New `alg` value inside the existing v1 fragment prefix (`#gpi=v1.`): old parsers fail closed with `UnsupportedError` (fine). Canonical JSON, all keys required, unknown keys rejected (same `obj()` strictness):
```
{ "alg": "A256GCM-SCRYPT",
  "kdf": { "N": 131072, "r": 8, "p": 1, "s": "<32 hex chars: 16-byte salt>" },
  "n": "<24 hex: 12-byte nonce>",
  "c": "<hex ciphertext||16-byte tag>" }
```
Plaintext of `c` = canonical JSON of the **plain envelope** `{"alg":"none","inv":{...},"sig":"..."}` (the whole invoice including recipient, amount, chainId, signer). So a leaked link reveals nothing but its size, unlike the existing `A256GCM` mode where `pub` is readable.
- KDF: scrypt via `@noble/hashes/scrypt.js` (`scryptAsync`), `dkLen 32`, passphrase = `pass.normalize('NFKC')` UTF-8, same as `keystore.ts`. **Parser accepts exactly N=2^17, r=8, p=1** (no attacker-chosen cost: memory about 128 MiB, prevents a crafted link from asking for 2^30). Params are in the envelope only so a later version can raise them under a new `alg`.
- Cipher: AES-256-GCM (Web Crypto), 96-bit random nonce, 128-bit tag. AAD = `"GPI2" || canonical(kdf) bytes || nonce`. Fresh salt and nonce per link, so the same passphrase on two invoices yields unrelated keys.
- Size: encoded fragment obeys the existing 16 KiB decoded limit; ciphertext length bound checked before scrypt runs.
- After decrypt: the inner plain envelope goes through the **existing** strict path (UTF-8 fatal, strict JSON, canonical equality, `validateInvoice`, signature verification). Inner `alg` must be `none`; a nested encrypted envelope is rejected.
- Public API additions (additive, `index.ts`):
```ts
export interface ParseOptions { pinnedSigners?: readonly string[]; passphrase?: string }
export interface EncodeOptions { encrypt?: boolean; passphrase?: string; rng?: RandomSource } // encrypt && passphrase together: passphrase wins, documented
export class PassphraseRequiredError extends InvoiceError {}   // fixed message, thrown when alg is A256GCM-SCRYPT and no passphrase given
// parseFragment with wrong passphrase throws DecryptionError (same class as today; one fixed message).
```
- Generated passphrase (default): 80 random bits as 16 characters of Crockford base32, displayed `XXXX-XXXX-XXXX-XXXX`; accepted case-insensitively with `-`, spaces, `I/L→1`, `O→0` normalised before KDF. Encoded with `@scure/base` (`base32crockford`) and `crypto.getRandomValues`. 80 random bits makes offline guessing infeasible regardless of scrypt; a user-chosen passphrase is only as strong as it is.
- Passphrase text is never stored, logged, put in the URL, or kept in React state longer than the unlock call; the input is cleared after use.

### 4.3 Payload text and tolerant import
- Payload form: `gpi=v1.<base64url>` (the fragment without `#`). Optional wrapper for humans: `ghostpay-invoice:` prefix is **not** adopted (extra grammar, no benefit).
- `extractFragment` (in `lib/fragment.ts`) extended: accepts `#gpi=v1.`, `gpi=v1.` at token start, URL or bare; removes all internal whitespace and line breaks only inside the base64url run (messengers wrap lines), then re-validates the result against `^#gpi=v1\.[A-Za-z0-9_-]+$` and the 16 KiB bound **before** calling `parseFragment`. Rejects: two different fragments in one paste, non-ASCII look-alike characters, lengths over the bound. Returns `undefined` rather than guessing.
- Input size cap on the textarea: 32 KiB, truncate-rejects (no silent truncation).

### 4.4 Sweep log and hygiene settings (A3/A4 storage), see section 6
```ts
export interface SweepLogEntry {            // plaintext shape, stored only encrypted
  chainId: number; owner: string /*lc*/; destination: string /*lc*/; token: string /*lc|'native'*/;
  amount: string /*decimal*/; txHash?: string; at: number /*ms*/; mode: 'relayer' | 'direct'; scheduled?: boolean;
}
export interface DestinationList {          // encrypted blob, single record
  xpub?: { key: string; chainId?: number; nextIndex: number; confirmedIndex0?: string /*address user confirmed*/ };
  saved: { address: string; label: string }[];      // <= 200
  linked: { address: string; note?: string }[];     // <= 500, user-declared "already known to payers/public"
}
export interface PendingSweep {            // no key, no signature, nothing spendable
  id: string; chainId: number; owner: string; token: string; destination: string; dueAtWall: number; windowMin: number; windowMax: number; createdAt: number;
}
```
Library API (`apps/web/src/lib/sweepLog.ts`): `SweepLog.record(e)`, `.wasUsed(chainId, dest)`, `.recent(chainId, sinceMs)`, `.pending.list/put/remove`. Reader interface `SweepLogReader` used by `assessDestination` to keep it testable.

### 4.5 Scheduler (A4)
Reuse `DelayScheduler` and `randomDelayMs` from `lib/jitter.ts` unchanged (monotonic due time, wall clock only for expiry). New thin wrapper `lib/sweepSchedule.ts`:
```ts
export function planSweepDelay(minSec: number, maxSec: number, rng?: CryptoLike): number; // ms via randomDelayMs
export async function runDueSweep(p: PendingSweep, deps): Promise<'swept'|'needs-unlock'|'needs-confirm'|'changed'|'failed'>;
```
Due-time procedure: acquire `navigator.locks.request('gp-sweep-'+owner,{ifAvailable:true})` (if unavailable API, fall back to a `BroadcastChannel` claim; failure to lock = do nothing) -> require session (else `needs-unlock`, schedule stays) -> re-read balance (if 0 or lower than planned: `changed`, stop) -> re-run `assessDestination` (a new `block` aborts) -> new quote and fee-cap check via existing `getSweepQuote` -> confirm (or auto if opted in) -> existing `relayedSweep`/`directSweep` -> `SweepLog.record`. A fresh EIP-712 order with a new random nonce and a 20-minute deadline is signed **at due time**; nothing signed is ever stored (matches `relayedSweep` today).

## 5. Behaviour details

### 5.1 Findings and copy rules
Each finding states what the app saw and what it implies, never a verdict of safety. A clean result reads "No local warnings. This does not mean the destination is unlinked: other people may already know it." No green check mark graphics.

### 5.2 Heuristics (all local; thresholds are constants in one file)
- F1 `DEST_PREVIOUSLY_USED`: destination appears in the sweep log for this chain (any token). warn.
- F2 `DEST_SHARED_IN_BATCH`: another sweep (log or pending) to the same destination within 24 h. warn. Rationale: two payers' funds converge, the destination ties their payments together to anyone who watches both one-time addresses.
- F3 `DEST_USER_LINKED`: in `linked` list (user says the destination is publicly tied to them, e.g. an ENS-labelled wallet). warn.
- F4 `DEST_SAME_AS_REGISTRY_WALLET`: matches the registrant address of the user's own ERC-6538 entry once spec 06 exists (otherwise skipped). warn.
- F5 `TIMING_NEAR_PAYMENT`: swept within 30 min of first seen. info. Only if first-seen is recorded (needs scanner state change; otherwise omitted, not guessed).
- F6-F8 (RPC opt-in): `eth_getTransactionCount(dest,'latest') > 0` or `eth_getBalance > 0` -> `DEST_NOT_FRESH_CHAIN` (info: "has history", because many users legitimately sweep to an existing wallet; severity raised to warn only if F1 or F3 also hit); `eth_getCode != 0x` -> `DEST_IS_CONTRACT` (warn: smart wallets are fine, but confirm it can receive this token).
- Fresh does not mean unlinked. The sweep transaction itself links the new address to the one-time address; the message says so.

### 5.3 Fresh destinations from an xpub
- Library: `@scure/bip32` (audited, same author as `@noble/*`, already pinned 1.7.0 in `packages/btc-silent-payments`; add to `apps/web` with exact pin). `HDKey.fromExtendedKey(xpub)`, `deriveChild(i)` on the **external-chain** level (non-hardened only), public key -> `keccak256(uncompressed[1:])` last 20 bytes -> EIP-55 (`viem` `publicKeyToAddress`).
- Accepted: xpub/tpub strings with depth >= 3, 78-byte base58check payload validated by the library. **Rejected with a specific message**: `xprv`/`tprv`/`zprv`, BIP-39 mnemonics (12/15/18/21/24 lowercase words, checked against nothing bundled; heuristic by word count and charset), 64-hex strings (private-key shaped). The field is `type=text`, `autocomplete=off`, never logged; rejected secret input is cleared from state immediately and the user is told to rotate it if it was a live secret that touched a browser.
- Address-reuse avoidance: `nextIndex` increments only after a sweep to that index is recorded; skipped indices are not reused. Optional RPC check (`nonce==0`, balance 0) over the next up to 5 indices when `chainLookup` is on.
- Display rule: the destination is always shown in full with its derivation index and a note "check this index on your wallet".
- Substitution risk and residual: a compromised page can swap the xpub or the destination. Controls are index-0 confirmation at setup, full address display, and the encrypted-at-rest xpub. A page-level compromise (D7) defeats this feature exactly as it defeats everything else; stated in section 9.

### 5.4 Interplay with existing code
- `lib/sweep.ts`: `checkDestination` stays as the hard validator; `relayedSweep`/`directSweep` unchanged; the wizard calls `SweepLog.record` after success (relayed: after submit returns a hash, status "submitted", not "confirmed").
- `lib/tags.ts`/`idbStore.ts`: new object stores `sweeplog` and `hygiene` in the same IndexedDB database (version 1 -> 2, additive `onupgradeneeded`, no change to `records`/`meta`). Encryption uses the same unlocked vault with new HKDF `info` labels (`GhostPay/sweep-log/v1/aes-gcm`, `.../hmac`), so one unlock covers tags and sweep log. The vault design is the one specified in `docs/specs/08-feature4-archive-key-rotation.md`; this spec adds record kinds only and must follow that spec's `keyVersion` rotation when it lands.
- `lib/settings.ts`: add `sweepWindowMinSec`, `sweepWindowMaxSec`, `sweepAutoComplete: boolean`, `sweepChainLookup: boolean`, `lockExtendForSchedule: boolean` (all non-secret, default 3600, 43200, false, false, false). `loadSettings` must clamp unknown/missing values (backwards compatible with stored v1 settings).
- `lib/fragment.ts`: `extractFragment` change as in 4.3.
- `lib/session.ts`: no change except the optional lock-timer hook (6.4).

## 6. Storage and key handling

6.1 Sweep log, destination list, pending schedule: AES-256-GCM records under the vault key (HKDF from the viewing key with a per-profile salt, non-extractable `CryptoKey`s), fresh 96-bit IV per write, AAD binds schema version, record kind and chain id. Lookup tokens are HMAC-SHA-256 of `chainId|destination` so IndexedDB shows no raw addresses. If IndexedDB is unavailable, `MemoryTagStore`-style fallback keeps the log for the tab only and the UI says history warnings will be incomplete.
6.2 No stealth key is stored. As today, `deriveVerifiedSweepKey` derives it in memory at sign time and `zeroize`s in `finally`.
6.3 No passphrase is stored. Generated passphrase exists in memory for the create screen only and is cleared on navigation.
6.4 Scheduling vs the idle lock: the session auto-locks after `lockTimeoutMin` (default 15). A window longer than that cannot complete unattended. Default behaviour: when the due time arrives locked, state = `needs-unlock`; after unlock the sweep runs immediately (disclosed: sweeps then bunch at unlock time). Optional `lockExtendForSchedule` keeps keys in memory until the window ends; it is off by default, labelled as weakening, and bounded to 24 h.
6.5 `localStorage` holds only the non-secret settings above. Pending sweep records contain addresses, so they live in the encrypted store, not `localStorage`.
6.6 "Wipe local data" (existing `TagVault.wipe`) also clears the new stores.

## 7. Crypto choices (established libraries only)

| Need | Choice |
|---|---|
| Passphrase KDF | scrypt N=2^17,r=8,p=1 (`@noble/hashes` 2.4.0, same as `keystore.ts`) |
| Link / record AEAD | AES-256-GCM via Web Crypto, random 96-bit nonce |
| Key separation for records | HKDF-SHA-256 (Web Crypto), distinct `info` strings |
| Lookup tokens | HMAC-SHA-256 (Web Crypto) |
| Randomness | `crypto.getRandomValues`; rejection sampling for delays (`randomDelayMs`) |
| HD public derivation | `@scure/bip32` 1.7.0; address via `viem` utils |
| Base32 for generated passphrase | `@scure/base` `base32crockford` |
No custom primitives. Argon2id is not used because it would add a WASM dependency and a CSP review; scrypt already ships and is audited in-repo usage.

## 8. Threat model

| Threat | Control | Residual |
|---|---|---|
| Leaked link read from history/clipboard/preview | Passphrase mode hides the whole invoice; payload-text mode avoids URL previews and history entry | Leaker also gets the passphrase if sent on the same channel; any script on the page or extension sees both |
| Offline guessing of a user-chosen passphrase from a leaked link | Generated 80-bit default; scrypt 2^17; min length for chosen ones | Chosen weak passphrases fall to a determined attacker; GPU/ASIC scrypt cost is bounded but not prohibitive for short secrets |
| Crafted link forcing huge scrypt cost (DoS) | Parser accepts only the fixed params; size check before KDF | One about 1 s unlock per attempt on the victim's machine |
| Malformed envelope / parser confusion | Existing strict path reused on the inner envelope; new alg covered by fuzz and negative tests | New code paths in a signature-critical package; needs audit review |
| Downgrade: attacker re-serves a plain link for the same invoice | n/a: signature covers the invoice; a re-wrapped plain link of the same signed invoice reveals the same content only to someone who already had it | Not a confidentiality control against link holders |
| Wrong destination (substituted xpub/address) | Index-0 confirmation, full address display, checksum, vault encryption | Compromised page or extension can show a different address (D7) |
| Warnings give false assurance | Fixed "no warnings is not proof" copy; no green state | Users may still sweep to linked wallets |
| Sweep log reveals history to an attacker with the viewing key | Log is encrypted under the same key hierarchy; no new key is introduced | Anyone with the viewing key can already see receipts; log adds sweep destinations |
| Scheduled sweep double-fires from two tabs | Web Locks, owner-scoped; balance re-read; relayer/chain reject replays | Browsers without Web Locks use best-effort BroadcastChannel; worst case a second attempt fails on zero balance |
| Fee spike during the wait | Quote re-fetched, published fee cap re-checked, abort on exceed | Sweep may slip past the planned window |
| Auto-complete sweeps without a human | Off by default; only while tab open; still wallet-free (stealth key in memory) | Reduced review at sweep time |

### 8.1 What this does NOT hide (must appear in user docs)
- The sweep (source, destination, amount, timing, relayer address) is public. The payer who knows the one-time address can see the destination. A fresh destination still links to the one-time address inside the sweep transaction itself.
- A random delay is friction, not cover traffic. Anyone watching the one-time address sees the sweep whenever it occurs. With low GhostPay volume the timing signal may be weak anyway, and a long window can be defeated by correlating on amount.
- The relayer sees owner, destination, token, amount, fee and timing at submit time (hashed IP), and could censor.
- Your RPC provider sees your IP and, with chain lookup on, the destination you checked.
- A passphrase link hides content from people who lack the passphrase. It does not stop the recipient from sharing the invoice, does not revoke anything, does not hide that a link of this size exists, and does nothing against a compromised device, extension or host.
- Pasting avoids history storage in the address bar only; the clipboard, messenger history and screenshots remain.
- An xpub stored in this browser lets anyone who obtains it enumerate your future destinations (not spend). It is encrypted at rest, but not a secret from a compromised page.

## 9. Failure modes

| Failure | Behaviour |
|---|---|
| IndexedDB unavailable / quota / blocked | Log and lists in memory for the tab; banner says history checks are incomplete; sweeps still work |
| Vault locked | Wizard asks to unlock tags for history checks; user may proceed without history with a warning; no data lost |
| Vault key mismatch / corrupt record | Record skipped, count shown ("1 history entry could not be read"), no crash |
| RPC lookup fails or lies | Finding says "could not check"; never treated as fresh; the lookup result cannot downgrade a local warning |
| xpub invalid / private material pasted | Rejected, cleared, explained |
| Wrong passphrase / tampered link | One message "Could not open this invoice. Check the passphrase or ask the sender for a new link." Lockout not enforced (client-side); a delay of 1 s per attempt is the natural scrypt cost |
| Passphrase link over 16 KiB | Create step refuses with the existing size error before showing a link |
| Tab closed / reloaded mid-window | Pending record persists encrypted; after unlock the app shows "overdue/due" and asks to confirm; nothing runs while closed |
| Background tab throttling | `visibilitychange` re-check (existing scheduler design); sweep may run late, never early |
| Clock changes | Monotonic timer for due time; wall clock only for expiry/reload recovery |
| Balance changed since plan | Stop with `changed`, ask the user |
| Quote above fee cap or expired | Abort that attempt, re-quote once, then ask the user |
| Relayer down | Offer direct sweep (needs native gas) or retry later; schedule stays |
| Two tabs | One wins the lock; the other shows "running in another tab" |

## 10. Test plan

Unit (vitest, existing setup)
- `envelope`: round trip for passphrase mode; KATs with fixed salt/nonce/RNG cross-checked against a Node `crypto.scrypt` + `webcrypto` implementation (second implementation) stored in `test-vectors`; wrong passphrase, empty passphrase, Unicode NFKC equivalence, missing `passphrase` -> `PassphraseRequiredError`; every field truncated/flipped -> typed error and no partial output; unknown keys; nested encrypted inner `alg`; N/r/p other than the fixed values rejected before KDF; 16 KiB boundary.
- `fragment.extractFragment`: link, hash, bare, wrapped lines, trailing punctuation, two fragments, homoglyphs, 1 MB input.
- `assessDestination`: each finding in isolation and in combination; log empty; lookup failure; pure-function table tests.
- `xpub`: derivation against published BIP-32 test vectors (public child derivation) and against an independent address derivation of known keys; xprv/mnemonic/hex rejection; index monotonicity.
- `sweepLog`: encrypted at rest (IDB dump has no plaintext address or amount), lock/unlock, wipe, schema upgrade 1 -> 2 keeps old tag records intact.
- `sweepSchedule`: uses fake timers/monotonic clock; due-time procedure branches (locked, balance changed, quote over cap, lock lost).

Property (fast-check, as in `invoice-schema` fuzz/property tests)
- encode/parse round trip for random invoices x random passphrases (small scrypt N only in tests via an internal test-only parameter that production parser rejects: a test must assert the production build constant cannot be lowered).
- `extractFragment(wrap(f, noise)) == f` for random whitespace insertion and never returns a value the parser would not accept.
- `randomDelayMs` uniformity (chi-square over bins, as in `jitter.test.ts`) for the window range.
- Fuzz: random bytes as base64url under the new `alg` never throws a non-`InvoiceError`.

Component (Testing Library, as in `Sweep.test.tsx`/`Pay.test.tsx`)
- Wizard blocks on `block` findings, requires checkbox for `warn`, hides chain-lookup RPC calls unless toggled (assert `mockRpc` saw zero requests).
- Pay shows passphrase prompt, clears field, generic error on wrong passphrase.
- Copy test: render all new strings and assert none contains the banned words (section 12).

E2E (Playwright, anvil-backed existing harness)
- Create passphrase invoice, paste payload text into a fresh context, unlock, pay; assert address bar never contains the fragment and `history.length` unchanged.
- Sweep to xpub index 0, then second sweep warns on reuse if user picks the same address.
- Scheduled sweep with a 3 s window (test setting): countdown, due, confirm, success; reload mid-window restores a pending item that needs unlock.
- Egress test (existing outgoing-request audit): no new hosts; with chain lookup off, no request mentions the destination except the sweep path.

Negative
- Bundle scan (`scan-bundle.mjs`) passes; no new `fetch`/`WebSocket` targets; worker still has no network API.
- Static-host proof: build output served by `python -m http.server`; every feature works with no API route.
- Passphrase and xpub never appear in console, `localStorage`, `sessionStorage`, URL or IDB plaintext (grep test over a full e2e run).

## 11. Acceptance criteria
- [ ] A3: wizard shows findings F1-F5 offline and F6-F8 only after opt-in; `block` cannot be bypassed; `checkDestination` unchanged and still called on every sweep path.
- [ ] A3: xpub fresh addresses match independent derivation vectors; private-key-like input rejected.
- [ ] A1: passphrase links round trip; KATs match the second implementation; wrong passphrase yields one generic message; production parser accepts only N=2^17,r=8,p=1.
- [ ] A1: bare payload paste works from a messenger-wrapped string; paste box cleared after read.
- [ ] A4: scheduled sweep re-quotes, re-assesses and confirms at due time; nothing signed is persisted; two-tab test passes; lock behaviour as in 6.4.
- [ ] No backend or operator service introduced; egress audit and bundle scan green; works from a plain static file server.
- [ ] Copy review passes (section 12); user docs updated: `privacy-limits.md` limits 1-2, `sweep-and-gas-privacy.md`, `review-and-pay-an-invoice.md`; THREAT_MODEL D1 and S3-03 rows updated with what changed and what did not.
- [ ] ADR-0005 amendment merged (new `alg`), ADR-LOG entry for xpub-only destinations.

## 12. Wording rules
Allowed: "linked", "public", "visible to", "friction", "does not hide". Banned in these screens, enforced by a test: private, privacy-preserving, anonymous, untraceable, unlinkable, secure link, safe destination, mixed. A passphrase is described as "protects the link text", never "secures the payment".

## 13. Effort, dependencies, rollout

Effort: A3 about 6 d (log + heuristics + wizard + xpub), A1 about 4 d (envelope alg, fuzz/KATs, UI), A4 about 3 d (wrapper + due-time procedure + UI), docs/ADR/copy review about 2 d, test hardening about 2 d. Total about 17 d, one engineer, M.
Dependencies: none blocking. Soft: spec 08 (vault key hierarchy and rotation) so new records follow `keyVersion`; spec 06 for F4; spec 02 if first-seen timestamps are added to scan state (F5 optional). New deps: `@scure/bip32` (web), `@scure/base` (web, only if not already transitively present), both exact-pinned.
Rollout: ship in three flagged steps (settings `experimental` flag, default off for passphrase links until the audit checklist passes): (1) A3 wizard without chain lookup, (2) chain lookup + xpub, (3) A1 passphrase alg, then A4. Old clients that receive an `A256GCM-SCRYPT` link show "unsupported invoice format" (fail closed). No data migration other than the additive IDB upgrade.

## 14. Audit checklist
- [ ] New `alg` parsed by the same strict canonical path; no code path skips signature verification after decrypt.
- [ ] KDF parameters fixed by the parser; no allocation proportional to attacker input before size checks.
- [ ] AAD binds the KDF params and nonce; salt and nonce unique per link; RNG failure aborts.
- [ ] Passphrase/xpub/stealth key never logged, serialised, persisted or placed in URL; cleared after use; `zeroize` on every key path including error paths.
- [ ] xpub path rejects private material; derived addresses checked against vectors; destination displayed in full.
- [ ] `assessDestination` cannot weaken `checkDestination`; lookups cannot suppress warnings; failures are visible.
- [ ] Scheduler never persists a signed order or key; due-time path re-checks balance, quote cap, destination.
- [ ] IndexedDB dump contains no plaintext addresses/amounts/labels; upgrade does not touch existing tag records.
- [ ] No new network host; CSP unchanged; bundle scan and outgoing-request audit green.
- [ ] Copy contains no banned words; "What this does NOT hide" present in app and docs.

## 15. Open questions
1. Should chain lookup be allowed through the relayer? **No**: it would show destinations to an operator before any sweep; excluded.
2. Should scheduled sweeps persist across reload at all? Spec says persist the non-secret plan only; owner may prefer in-tab only (simpler, smaller attack surface).
3. First-seen timestamps for F5 need a scanner-state change (UNVERIFIED that `ScanMatch` carries block time today; confirm in `scannerCore.ts`).
