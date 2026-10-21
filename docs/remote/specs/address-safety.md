# Spec: `@ghostpay/address-safety` (address poisoning, lookalikes, display-text safety)

Status: **spec only** (2026-10-21). Not implemented.

## 1. Purpose

Pure functions that decide whether an address or a piece of display text shown to a user can be trusted to mean what it appears to mean. Closes or reduces:

- S3-12: invoice text accepts bidi controls (`U+202E`, `U+2066`), zero-width and tag characters and homoglyphs.
- S3-22: wallet picker accepts lookalike/bidi wallet names.
- haiku `security-tslibs` M-1 (unverified): a self-signed, unpinned invoice pays whatever `metaAddress` it carries, with only a warning.
- D1 (sweep destination): no check that the destination is fresh or matches a saved address.
- Address poisoning: attackers send zero-value/dust/counterfeit-token transfers from vanity addresses that match the first and last characters of a victim's counterparty, hoping the victim copies the wrong one from history.

## 2. Interface (proposed)

```ts
// Addresses (EVM, 20 bytes)
function parseStrictAddress(s: string): Address | Reason;          // 0x + 40 hex; mixed case must pass EIP-55; all-lower accepted; all-upper rejected
function lookalikeScore(a: Address, b: Address): { prefix: number; suffix: number; hamming: number };
function findLookalikes(candidate: Address, known: readonly Address[], opts?: { prefix: 4; suffix: 4 }): Address[]; // same first/last N nibbles but different
function classifyDestination(dest: Address, ctx: { saved: Address[]; ownStealth: Address[]; feeRecipients: Address[]; recentCounterparties?: Address[] }):
  'saved' | 'own_stealth' | 'fee_recipient' | 'lookalike_of_saved' | 'new';
function fingerprint(a: Address): string;  // fixed grouping for display, e.g. 0xAbCd 1234 ... 9f3E, never truncated in confirmation views

// Meta-addresses
function metaAddressFingerprint(meta: string): string;            // short stable digest to compare out of band (D3 makes it a public identifier anyway)
function payeeTrust(inv, pinned: PinnedSellers): 'pinned' | 'unpinned_valid_signature' | 'invalid'; // UI must block or require explicit confirm on unpinned

// Text
function sanitizeDisplayText(s: string, policy?: { allowZwjEmoji?: boolean }): { text: string; replaced: number } | Reason;
// rejects Bidi_Control, Default_Ignorable_Code_Point (Cf), private use (Co), tag block U+E0000..U+E007F, unpaired surrogates;
// flags mixed-script tokens (Latin + Cyrillic/Greek) for a visible marker
```

Rules: confirmation screens always show the **full** address in fixed groups, never `0x1234...abcd`; a destination that matches a saved address in prefix/suffix but not fully is a hard stop; text fields are either rejected at parse time (`invoice-schema`, needs a schema version bump) or rendered sanitised with `unicode-bidi: isolate`.

## 3. Threat model

| Threat | Control | Residual |
|---|---|---|
| Poisoned history entry copied as destination | `findLookalikes` vs saved/own addresses; full-address display; prefer saved-address picker over paste | User ignores the warning; brand-new destinations have nothing to compare with |
| Mixed-case typo | EIP-55 strict parse | EIP-55 catches a random mistype with ~99.975 % probability, not a crafted lookalike |
| Bidi/invisible characters reorder memo text | reject or isolate + visible markers | Homoglyphs within one script remain |
| Unpinned seller key | `payeeTrust` returns `unpinned_valid_signature`; UI must require explicit confirmation of the meta-address fingerprint | Out-of-band channel can itself be phished |
| Lookalike wallet name in EIP-6963 picker | `sanitizeDisplayText` + show `rdns` | A hostile extension already controls the page's provider |

## 4. Test plan

EIP-55 vectors from the EIP; generated lookalike pairs (match first/last 4..8 nibbles) must be flagged and exact matches must not; property test: `findLookalikes(x, [x]) = []`; S3-12 PoC strings (`U+202E`, `U+2066`, `U+200B`, `U+E0041`, Cyrillic `а`) rejected or marked; NFC/NFKC interplay with existing `invoice-schema` `text()` rules; snapshot of `fingerprint` grouping; no regex catastrophic backtracking (fuzz with long inputs, time bound).

## 5. Acceptance criteria

- Unicode property classes come from the engine (`\p{Bidi_Control}`, `\p{Default_Ignorable_Code_Point}`, `\p{Co}`, `\p{Script=...}` regex escapes in ES2018+), so no Unicode data file is vendored; Node 22 and the supported browsers must agree on the tested strings (Playwright run).
- Sweep view refuses `lookalike_of_saved` and labels `new` with the D1 linkability warning.
- Coverage 95/90/95/95; zero runtime dependencies (EIP-55 checksum uses `@noble/hashes` keccak already pinned in core-crypto, or viem's `getAddress`).

## 6. Sources

- EIP-55 "Mixed-case checksum address encoding" (Final), <https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-55.md>, retrieved 2026-10-21: "On average there will be 15 check bits per address, and the net probability that a randomly generated address if mistyped will accidentally pass a check is 0.0247%."
- T. Tsuchiya, J.-D. Dong, K. Soska, N. Christin, "Blockchain Address Poisoning", 34th USENIX Security Symposium (2025), <https://www.usenix.org/conference/usenixsecurity25/presentation/tsuchiya>. **Not retrieved**: the host is blocked from this session (proxy 403); only the title, authors and venue were confirmed through a web-search index on 2026-10-21. Attack figures quoted by secondary sources disagree with each other and are not repeated here.
- Unicode confusables data, <https://raw.githubusercontent.com/unicode-org/icu/main/icu4c/source/data/unidata/confusables.txt> (reachable 2026-10-21, not vendored; UTS #39 itself at unicode.org was blocked). Candidate for a later skeleton-based confusable check if script-mixing detection proves insufficient.
- Repository: audit 03 S3-12, S3-22; audit 04 D1, D3; `docs/remote/audits/security-tslibs.md` M-1 (haiku, unverified).
