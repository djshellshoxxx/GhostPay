# 08 Multi-relayer selection and self-submit (idea A5)

Status: proposed, not built | Priority: P2 | Effort: M (about 8 engineer-days) | Owner: WEB, CA (REL conformance only) | Branch `claude/remote-extensions-3`, 2026-10-21
Deps: spec 01 (manifest read-back; chain/sweepRelayer address trust), ADR-0015 (release key, for the shipped list signature), spec 10 (hosting constraints). Contract change: none. Sources: `docs/remote/ideas.md` A5; `apps/web/src/lib/{relayerClient,sweep,settings}.ts`; `apps/relayer/src/server.ts` (`/v1/info`, `/v1/quote`, `/v1/sweep`); `packages/contracts/src/GhostPaySweepRelayer.sol`; `docs/user/sweep-and-gas-privacy.md`; SPEC_REVIEW A11.

## 0. Hard constraint and what it forces

100 percent client-side static hosting. Therefore:
- There is **no relayer directory service, registry API, health aggregator or "best relayer" oracle**. The relayer list is a JSON file, either shipped inside the hashed bundle or supplied by the user (paste or file picker). Nothing is fetched from a list host at runtime.
- There is **no operator-run uptime view**. Liveness is discovered by the client itself, only for the single relayer it is about to use (section 3.3).
- Relayers stay optional. The existing contract already lets anyone call `sweep` / `sweepWithPermit`; self-submit (section 5) needs no relayer and no new contract.
- Rejected: a relayer-list contract on-chain (an operator-curated registry is governance plus an admin key; contracts are immutable, ADR-0014), a DNS/ENS-resolved list (adds a resolver dependency and a mutable pointer), a "relayer marketplace" backend.

## 1. Goals and non-goals

Goals
1. A user can hold more than one relayer, the client picks one by a documented rule, and the user can always overrule it.
2. A user can sweep with **no relayer at all** in two ways: (a) existing direct sweep (stealth address pays gas), (b) new "self-submit": the user signs the same EIP-712 order with `fee = 0` and submits `sweepWithPermit` / `sweep` from a wallet or tool they control.
3. Community lists are importable, verifiable offline, and pinned to a signer the user chose.
4. Honest disclosure of exactly who learns what per attempt, including every relayer that was asked.

Non-goals
- Not anonymity. Every relayer asked sees owner, destination, token, amount, fee and timing (`docs/user/privacy-limits.md`). IP is visible unless the user uses Tor Browser / a proxy (spec 05, idea A6).
- No quote shopping by default (it tells N operators about one sweep). No automatic failover that silently widens disclosure.
- No relayer reputation scores, no ratings, no telemetry. No operator-run list.
- No relayer discovery over the network (no gossip, no DNS-SD).

## 2. UX

Settings, "Relayers" card (replaces the single `relayerUrl` field; the old field stays readable for migration, section 4.4):
- Table of relayers: label, origin, chains, source badge (`built-in list`, `imported list <fingerprint>`, `manual`), toggle on/off, remove.
- "Import list": textarea plus file picker. Shows list name, version, signer address, signature status (`valid for pinned signer`, `valid, signer NOT pinned`, `unsigned`), count of entries, diff against the current list. User must tick "I trust <signer> to propose relayers" to pin. Unsigned lists are allowed only after an extra confirmation ("anyone could have written this").
- Strategy select: `Random (default)`, `Cheapest quoted (discloses to every relayer asked)`, `Fixed: <relayer>`. A note under `Cheapest` shows "this tells N operators about each sweep".
- "Self-submit only" master switch: removes all relayers from the Sweep flow.

Sweep page (extends the existing fee-method radio):
1. `Relayer` (default if any enabled relayer supports chain + token), 2. `Self-submit (sign here, send from my own wallet)`, 3. `Direct (stealth address pays gas)` (existing).
- Relayer path: shows "Relayer: <label> (<origin>)", fee, net, expiry, and "Told so far: 1 relayer". Button "Ask a different relayer" appears on failure only; each click increments "Told so far" and requires a click (no silent failover).
- Self-submit path: after confirming the decoded sweep (destination, amount, `fee: 0`), the app shows (a) a "Send with connected wallet" button (EIP-1193 `eth_sendTransaction` to the manifest's `sweepRelayer`), (b) a copyable calldata block with `to`, `chainId`, `data`, and a `cast send` line, (c) a downloadable `ghostpay-sweep-order.v1.json` (section 4.3) that anyone (a friend, a CLI, a different device) can broadcast. Copy states plainly: "The wallet that sends this transaction will be publicly linked to this sweep. Use a wallet that is not your main wallet. This does not hide the link from the one-time address to your destination."
- Every state uses non-anonymity wording; the words "private", "anonymous", "untraceable" are forbidden (lint test, section 8).

## 3. Selection logic

### 3.1 Eligibility filter (pure function, no network)
`eligible(list, {chainId, token, nowSec})` keeps entries where: `enabled`, `chains` includes `chainId`, `notAfter` absent or later than `nowSec`, origin passes `checkRelayerUrl` (https, no credentials/query/fragment), and (for ERC-20 relayed sweep) token class is permit-capable per the chain-adapters token table. Entries failing are listed with a reason in the UI (diagnostics), never dropped silently.

### 3.2 Pick
- `random`: uniform choice using `crypto.getRandomValues` with rejection sampling (reuse `lib/jitter.ts` primitive), no weighting. Deterministic injection of the RNG for tests.
- `fixed`: the chosen id, else error.
- `cheapest`: send `/v1/quote` to every eligible relayer in parallel (max 3, random subset if more), validate each with the existing `requestQuote` + `assertSponsorFeeAcceptable`, choose lowest fee. Requires an explicit checkbox once per session ("I accept that N relayers learn this sweep").
The choice is made once per sweep attempt and is not persisted.

### 3.3 Probe only the chosen relayer
Before quoting, `GET /v1/info` (no body, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, same hardening as `post()`), parse with a strict schema mirroring `InfoResponse` in `apps/relayer/src/service.ts`, and verify: `chains[].chainId` includes the target chain, `chains[].sweepRelayer` equals the manifest's sweep relayer address for that chain (a relayer advertising a different contract is rejected), `feePolicy.id === 'F-SPONSOR'`, `capBps <= PUBLISHED_CAP`, token listed with `permit: true`. `/v1/info` carries no user data, so probing does not disclose the sweep; it does disclose "a GhostPay user with this IP is about to use me", which is stated in the UI.

### 3.4 Failure ladder (no silent widening)
1. Chosen relayer unreachable / invalid `/v1/info` / refuses quote: show reason, offer "Ask a different relayer" (+1 told), "Self-submit", "Direct".
2. After the user has **signed** an order and submission fails or times out: the signed order stays valid until its `deadline` (window `feePolicy.deadlineWindowSeconds`, relayer max 30 minutes per ideas A4 note) and the first relayer may still submit it. **Supersede rule:** the client refuses to sign a second order to another relayer until either (a) the first order's deadline has passed, or (b) `nonceUsed(owner, nonce)` on the sweep relayer returns true and the balance has moved, or (c) the user explicitly chooses "sign a second order anyway", with the warning that two orders on the same balance can both execute if the balance covers both (fee paid twice). Default sweep amount is the full balance, so a second order normally reverts on insufficient balance; partial amounts do not have that protection.
3. Self-submit is always the terminal fallback and requires no counterparty.

## 4. Formats and APIs (exact)

### 4.1 Relayer list `ghostpay-relayers.v1.json`
Shipped at `apps/web/public/relayers/relayers.v1.json` (inside the hashed bundle, covered by `SHA256SUMS`, no runtime fetch other than same-origin). Import accepts the same schema.

```ts
// apps/web/src/lib/relayerList.ts
export interface RelayerListV1 {
  readonly schema: 'ghostpay-relayers';          // literal
  readonly version: 1;                           // literal
  readonly name: string;                         // 1..64 printable ASCII
  readonly serial: number;                       // uint, monotonic per signer; lower serial than the stored one is rejected as rollback
  readonly issuedAt: number;                     // unix seconds
  readonly expiresAt: number;                    // unix seconds; app warns 14 days before, refuses after (shipped list: expires with the release train, unsigned imports also need it)
  readonly relayers: readonly RelayerEntryV1[];  // 0..64 entries
  readonly signature?: ListSignatureV1;
}
export interface RelayerEntryV1 {
  readonly id: string;                           // /^[a-z0-9-]{1,32}$/ unique in list
  readonly label: string;                        // 1..48 printable ASCII, rendered as text only
  readonly url: string;                          // passes checkRelayerUrl; no trailing slash
  readonly chains: readonly number[];            // chain ids; subset must overlap the app's enabled chains to be shown
  readonly sweepRelayers: Record<string, string>;// chainId -> checksummed address the operator claims; must equal the manifest, else entry is disabled
  readonly feeTo: readonly string[];             // optional hint of known fee addresses; informational only, the quote's feeTo is what is signed
  readonly operator?: string;                    // free text, 0..80, informational
  readonly contact?: string;                     // 0..120, rendered as text, never as a link
  readonly notAfter?: number;                    // unix seconds
}
export interface ListSignatureV1 {
  readonly scheme: 'eip191-secp256k1';           // personal_sign over the digest below
  readonly signer: string;                       // 0x checksummed EOA address
  readonly sig: string;                          // 0x + 130 hex (65 bytes r||s||v)
}
```
Canonical bytes for signing: the list without `signature`, serialised as JSON with keys sorted lexicographically at every level, arrays in order, no whitespace, strings per RFC 8259 minimal escaping, numbers as integers only (no floats, no exponents). `digest = keccak256(utf8("GhostPay relayer list v1\n") || canonical)`. `sig` is `personal_sign` (EIP-191 version 0x45) over the 32-byte digest as hex text; verification via `viem` `recoverMessageAddress` (already a dependency, no new crypto). A pure `canonicalizeList()` and a known-answer vector file `relayerList.vectors.json` are mandatory (so a third party can write a signer in any language).

Limits: file <= 64 KiB, strict parse with unknown keys rejected, duplicate ids/urls rejected, `__proto__`/`constructor` keys rejected (reuse the `invoice-schema` strict-parser style), no HTML rendered.

Pinned signers: `localStorage` key `ghostpay.relayerPins.v1` = `{ signer, firstSeenSerial, pinnedAt }[]`. A shipped list's signer is the release key (ADR-0015); until that key exists the built-in list is shown as `unsigned, part of this release` and the About page states it. Rollback guard: `serial` lower than the last accepted for that signer is rejected.

### 4.2 Settings schema
`Settings` (apps/web/src/lib/settings.ts) gains, under a new storage key version `ghostpay.settings.v2` with a v1 reader:
```ts
readonly relayerStrategy: 'random' | 'cheapest' | 'fixed';
readonly fixedRelayerId: string;      // '' when unused
readonly selfSubmitOnly: boolean;
readonly manualRelayers: readonly { id: string; label: string; url: string }[]; // each passes checkRelayerUrl
readonly importedLists: readonly RelayerListV1[]; // stored verbatim, re-verified on load
readonly disabledRelayerIds: readonly string[];
```
Migration: a non-empty v1 `relayerUrl` becomes one `manualRelayers` entry with `id: 'migrated'`, strategy `fixed`.

### 4.3 Self-submit order file `ghostpay-sweep-order.v1.json`
```ts
export interface SweepOrderFileV1 {
  readonly schema: 'ghostpay-sweep-order'; readonly version: 1;
  readonly chainId: number;
  readonly sweepRelayer: string;          // address from the manifest
  readonly function: 'sweepWithPermit' | 'sweep';
  readonly sweep: { token: string; owner: string; destination: string; feeTo: string; amount: string; fee: '0'; deadline: string; nonce: string };
  readonly sweepSig: string;              // 65-byte hex
  readonly permit?: { value: string; deadline: string; v: number; r: string; s: string };
  readonly calldata: string;              // abi.encode of the function call, for tools
  readonly createdAt: number;
}
```
Contains no private key and no seed. It is a bearer instruction to move exactly the signed amount to exactly the signed destination, valid until `deadline`; whoever holds it can only execute it as signed (the contract binds destination, amount, fee, feeTo). Self-submit signs `fee = 0`, `feeTo = ` the submitter address if known else the destination (contract accepts `fee == 0`; it requires `amount > fee`, non-zero `feeTo`, `feeTo != contract`). Deadline default 30 minutes (user-adjustable 5..120); a longer deadline raises the leak window of the file.

An "Import and submit an order file" mini-view lets a second person or device broadcast an order file with their own wallet; it re-validates every field against the manifest and `eth_call` simulates before enabling the button.

### 4.4 Module API (`apps/web/src/lib/relayerSelect.ts`)
```ts
export function eligibleRelayers(lists: readonly RelayerListV1[], manual: readonly ManualRelayer[], q: { chainId: number; token: Address; nowSec: number; manifest: DeploymentManifest }): { eligible: Candidate[]; rejected: { id: string; reason: RejectReason }[] };
export function pickRelayer(c: readonly Candidate[], strategy: Strategy, fixedId: string, rand: () => number): Candidate;
export async function probeInfo(c: Candidate, manifest: DeploymentManifest, fetchFn: FetchFn): Promise<ProbedRelayer>; // throws UserFacingError
export function verifyList(raw: string, pins: PinStore, nowSec: number): { list: RelayerListV1; status: 'valid-pinned' | 'valid-unpinned' | 'unsigned'; signer?: Address };
export function buildSelfSubmit(order: SweepOrder, sigs: SignedSweep, manifest: DeploymentManifest, opts: { submitter?: Address }): SweepOrderFileV1 & { cast: string };
```
`relayerClient.ts` gets `getInfo(base, fetchFn)` only; `post()` hardening (16 KiB cap, no redirects, no credentials) is reused unchanged. `sweep.ts` `getSweepQuote` takes a `Candidate`; error strings stay `UserFacingError`.

### 4.5 CSP and egress
`connect-src 'self' https: wss:` already allows arbitrary relayer origins (`public/_headers`). No change. Playwright egress test (existing) is extended: with `selfSubmitOnly` the only network calls are the user's RPC and the wallet; with relayers, only `/v1/info`, `/v1/quote`, `/v1/sweep` to the chosen origin.

## 5. Self-submit mechanics and privacy

Compared with the other paths:
| Path | Gas payer | Who is publicly linked | Counterparty learns |
|---|---|---|---|
| Relayer | relayer, repaid in token | relayer address appears as tx sender | relayer: owner, destination, amount, fee, IP hash, timing |
| Self-submit via wallet | user's chosen wallet W2 | W2 is the tx sender, linked to this sweep | wallet extension sees the transaction; RPC provider sees W2 and IP |
| Self-submit via order file | whoever broadcasts | broadcaster | broadcaster sees the full order |
| Direct | stealth address (needs native coin) | the funder of the stealth address if it was funded | RPC provider |
Self-submit removes the relayer's censorship power and removes the "single operator sees every sweep" property, at the cost of a gas wallet link. It is the right choice for users who already hold a clean gas wallet. Honest limit: a user who funds W2 from an identified wallet has recreated the linkage the relayer was avoiding (see `docs/user/sweep-and-gas-privacy.md` point 4).

## 6. Threat model

| Threat | Mitigation | Residual |
|---|---|---|
| Malicious relayer in a community list (steals, front-runs) | Signature binds destination, amount, fee, feeTo, deadline, nonce; contract enforces exact balance deltas; fee cap checked client side before signing | Censorship, delay, logging of everything it sees, timing correlation |
| Relayer advertises a different `sweepRelayer` contract | `probeInfo` requires equality with the manifest address (itself verified by spec 01) | None for this vector if manifest is trustworthy |
| Poisoned imported list (attacker-written, points all users to attacker relayers) | Signature + explicit pin; unsigned import needs a second confirmation; per-entry diff; entries never auto-enabled when an update adds origins (new origins arrive disabled) | A pinned signer who turns malicious; users who click through |
| Rollback to an older list with a dead or hostile relayer | `serial` monotonic per signer, `expiresAt` | A signer who never rotates |
| List-signer key theft | Signer address pin, rotate by importing a list signed by the old key that carries a `successor` extension (out of scope v1; documented as a re-pin) | Manual re-pin |
| Fee gouging | `assertSponsorFeeAcceptable` before signing; cap in `/v1/info` cross-checked | Fee under cap but above market |
| SSRF / hostile origin response | Existing limits: https only, 16 KiB cap, no redirect, timeout 15 s | Hostile origin learns IP and timing |
| Selection bias (selection RNG weak) | CSPRNG with rejection sampling; unit-tested uniformity | Few relayers means small anonymity benefit |
| Order file leaked | Bearer but bounded: only the signed transfer; deadline limits window | Leak before deadline lets a third party execute it as signed (no harm beyond timing/who-submitted) |
| Double execution after failover | Supersede rule section 3.4 | Partial-amount orders in "sign anyway" |
| Compromised page rewrites list or destination | Out of scope here (ADR-0015, spec 10); the Sweep page shows the decoded destination before signing | Total compromise (D7) |
| Chain-wide relayer collusion / single-operator list | Cannot be fixed in software | The product states: more relayers do not give anonymity |

## 7. Failure modes
Empty eligible set: show reason table, offer self-submit/direct. Expired shipped list: refuse relayers, show banner, self-submit still works (relayers are optional by construction). `/v1/info` mismatch: entry marked `rejected: wrong-contract`. Wallet rejects self-submit: order file remains downloadable until deadline, then discarded from memory. RPC lies about `nonceUsed`: displayed as "unconfirmed"; user decides. Clock skew: deadlines use the chain's latest block timestamp when RPC available, else local time with a warning. localStorage unavailable: settings fall back to defaults (selfSubmitOnly=false, no pins), imported lists are session-only with a banner.

## 8. Test plan
- Unit: `canonicalizeList` known-answer vectors incl. unicode, key-order, nested; signature sign/verify with a fixed test key; tampered byte fails; wrong signer; `serial` rollback; expiry; strict parser rejects unknown keys, `__proto__`, duplicate ids, > 64 KiB, bad URL (http, credentials, query), non-integer chain ids.
- Unit: `eligibleRelayers` matrix (chain, token permit, notAfter, disabled, manifest mismatch); `pickRelayer` uniformity chi-square over 10k draws with seeded RNG; `fixed` missing id.
- Unit: `probeInfo` happy path and each rejection (wrong contract, cap above published, `permit:false`, oversize, redirect, invalid JSON) using the real `InfoResponse` shape from `apps/relayer/src/service.ts` as a fixture (conformance test also run against `apps/relayer` in-process).
- Unit: `buildSelfSubmit` calldata equals viem `encodeFunctionData` for `sweepWithPermit` and `sweep`; `fee` is `'0'`; order file round trips and rejects field changes.
- Anvil e2e (`apps/relayer/src/e2e.anvil.test.ts` harness): (1) relayed sweep via relayer A of two configured; (2) relayer A down, user asks B; (3) self-submit with an unrelated funded wallet moves permit token, fee 0, balance deltas exact; (4) order file broadcast by a third account; (5) supersede rule: second order refused until deadline, then allowed.
- Playwright: Settings import flow with signed and unsigned fixtures, pin dialog, Sweep self-submit shows linkage warning, egress assertion per section 4.5, no forbidden words ("private", "anonymous", "untraceable") in new strings.
- Fuzz: list parser 100k random mutations, no throws other than `UserFacingError`.
- Bundle: `scan-bundle` stays green; no new origins; the shipped list contains only strings.

## 9. Acceptance criteria
- [ ] With zero relayers configured the Sweep page works (self-submit and direct) and nothing contacts a relayer.
- [ ] No code path fetches a relayer list, health or directory from the network; grep/egress test proves it.
- [ ] Import verifies signature per section 4.1 with published vectors; unsigned/unpinned states are visible; rollback and expiry rejected.
- [ ] Relayer failover never sends sweep data to a second relayer without a user click; "told so far" counter shown.
- [ ] Supersede rule enforced; anvil test proves no double fee on a full-balance sweep.
- [ ] Self-submit order file and wallet send tested on anvil; warning copy present; wording lint passes.
- [ ] `docs/user/sweep-and-gas-privacy.md`, `privacy-limits.md` (relayer row: "any relayer you ask"), `docs/operators/relayer-runbook.md` (how to get listed: open a PR to the community list or publish your own signed list) updated.
- [ ] THREAT_MODEL entry for list poisoning added.

## 10. Effort
List format, verify, vectors 1.5 d; selection + probe 1.5 d; Settings UI + migration 1.5 d; Sweep UI + self-submit + order view 2 d; tests (unit, anvil, Playwright) 1.5 d. About 8 d; no contract work.

## 11. Audit checklist
1. Canonicalization ambiguity (two byte strings for one list)? Vectors cover.
2. Signature domain separation prefix present; no cross-use with deployment-manifest signature (different prefix and key).
3. Pin store cannot be written by list content; new origins start disabled.
4. All list strings rendered as text (no `dangerouslySetInnerHTML`; ESLint rule intact); `contact` never a link.
5. `probeInfo` compares contract address to manifest, not to the list.
6. Selection RNG is `crypto.getRandomValues` with rejection sampling.
7. No persisted record of which relayer served which sweep beyond the existing tag-vault note (user choice).
8. Self-submit fee is exactly `0`, never negative or rounding; `amount > fee` precondition checked client side.
9. Order file never includes keys; deadline default and bounds enforced.
10. Failover does not reuse a nonce; second order uses a fresh 128-bit nonce.
11. Egress test updated; CSP unchanged; no new third-party origin.
12. UI copy reviewed for overclaims.
