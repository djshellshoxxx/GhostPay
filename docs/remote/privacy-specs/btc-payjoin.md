# Spec: Bitcoin PayJoin invoice mode (BIP-77 v2 async, BIP-78 v1) next to BIP-352 silent payments

Status: **spec, not built**. Date: 2026-10-21. Branch `claude/remote-extensions-1`. Scope: **testnet-only proof of concept** (Bitcoin `testnet`/`tb`, `signet`, and local `regtest`). Legal questions are deferred by the owner (noted once in section 14; nothing here blocks on them). Nothing here has run against a wallet, node, directory, relay or network.

Evidence tags: **[R]** repo file read, **[P]** primary source fetched 2026-10-21 (retrieval date for every URL), **[U]** unverified: memory or inference, verify before relying on it.

Read for this spec: `README.md`, `docs/CONTRACTS_SPEC.md` (EVM only; no Bitcoin content), `docs/remote/anonymization-research.md` (1, 6.3, 7.1, 7.2, 11, 14), `docs/remote/onion-i2p-research.md`, `docs/remote/modules-needed.md`, `docs/remote/security-specs/privacy-ops.md`, `packages/btc-silent-payments` (README, DEVIATIONS, `src/spend.ts`, `src/uri.ts`, `src/sender.ts`, `package.json`).

## 1. Goal

Add `packages/btc-payjoin`: a Bitcoin **PayJoin** sender and receiver, selectable per invoice as `btcMode: 'payjoin-v2' | 'payjoin-v1'` alongside the existing `'silent-payment'` (BIP-352) and a `'plain'` baseline. PayJoin makes the payee contribute an input to the payer's transaction, so the common-input-ownership heuristic fails and the on-chain payment amount is obscured [P BIP-78 "Heuristics": `common-input`, `change-scriptpubkey`, `change-round-amount`].

PoC deliverables: (a) pure-TS PSBT policy core (BIP-78 receiver/sender checklists) with 100% vector coverage; (b) transport-pluggable sessions for v1 (direct HTTP) and v2 (OHTTP + directory); (c) library-backed v2 transport via `payjoin-ffi` if the spike passes, else own implementation; (d) regtest end-to-end between GhostPay receiver and sender, plus an interop test against `payjoin-cli` (rust-payjoin); (e) a `BTC_MODE_INFO` table for UI.

## 2. Threat addressed and what it does NOT protect

**Addressed (partially):**
- T1: chain analysts applying common-input-ownership to the payment tx (the payer's inputs and the payee's input appear as one entity) [P BIP-78].
- T2: observers inferring the real payment amount from outputs (payee input inflates the payee output; amount heuristic breaks) [P BIP-78 "change-round-amount"].
- T3 (v2 only): sender and receiver need not be online together; IPs are hidden from each other and from the directory by OHTTP [P BIP-77].

**Does NOT protect (UI copy and docs MUST say so):**
- N1: **No silent-payment property.** A PayJoin invoice pays a normal receiver address; address reuse is avoided only by issuing one address per invoice. An observer who knows the address (the payer does) sees it. PayJoin gives no unlinkability between payer and the payee address.
- N2: **Not a mixer.** One payee input from the seller's own UTXO set; the seller's UTXO history is bound to the payment tx. It weakens heuristics, it does not break the graph for a determined analyst.
- N3: **Receiver UTXO exposure.** The payer (hostile) learns one receiver UTXO per attempt; UTXO probing is a known issue [P BIP-78 "UTXO probing"]; mitigation is partial.
- N4: **Directory/relay metadata.** The directory sees mailbox short IDs, timing, request sizes (padded) [P BIP-77]; the relay sees client IPs. If one party operates both, OHTTP separation is void. Neither reads payload [P BIP-77].
- N5: **Fallback broadcast.** Either party can broadcast the Original PSBT at any time; it is a normal, fully linked payment [P BIP-77: "no way for a sender to prevent a receiver from broadcasting the fallback"].
- N6: Wallet support is uneven [U]; a sender without PayJoin pays the `plain` fallback address.
- N7: Network layer (IP of Bitcoin node/Esplora, wallet vendor) unchanged (see `onion-i2p-research.md`).
- N8: **Mainnet is out of scope**; enforced in code (BPJ-GEN-1).

## 3. Primary-source facts used

- **BIP-78** "A Simple Payjoin Proposal", status **Deployed**, https://raw.githubusercontent.com/bitcoin/bips/master/bip-0078.mediawiki, retrieved 2026-10-21 [P]. Query params: `v` (default 1), `additionalfeeoutputindex`, `maxadditionalfeecontribution`, `minfeerate`, `disableoutputsubstitution`. URI params `pj=`, `pjos=0`. Receiver errors: `unavailable`, `not-enough-money`, `version-unsupported`, `original-psbt-rejected`; senders MUST NOT show unknown error text in UI (phishing), debug log only. Receiver: inputs of the Original PSBT must never have been seen before (anti-probing / reentrancy); non-interactive receivers must check broadcastability. Sender checks (before signing): absolute fee not lower; version and nLockTime unchanged; sender input sequences unchanged and all inputs share one sequence value; all sender inputs and non-receiver outputs present; receiver inputs finalized with `witness_utxo` or `non_witness_utxo`; no keypaths or partial sigs on inputs/outputs; output values not decreased unless substitution allowed; fee-output contribution `<= maxadditionalfeecontribution` and only for added-input fees; final feerate `>= minfeerate` if set.
- **BIP-77** "Async Payjoin", status **Draft**, version 0.2.0 (changelog 2025-07-08), authors Dan Gould, Yuval Kogman, requires BIPs 21, 78, 173, 174, https://raw.githubusercontent.com/bitcoin/bips/master/bip-0077.md, retrieved 2026-10-21 [P]. Roles: untrusted store-and-forward **directory** (OHTTP gateway at `/.well-known/ohttp-gateway`, RFC 9540 key config), **OHTTP relay**, receiver, sender. Params: `pj` (mailbox URL, uppercase, `#` as `%23`), `req-pj`, `pjos=0`; URL-fragment session params `EX` (expiry, unix), `OH` (OHTTP key config: 2-byte key id + 33-byte pubkey), `RK` (33-byte receiver key). Crypto: `DHKEM(Secp256k1, HKDF-SHA256)` + ChaCha20Poly1305 for OHTTP and end-to-end; sender message HPKE Base mode info `PjV2MsgA` (sender reply key prepended to plaintext), receiver message HPKE Auth mode info `PjV2MsgB`; 64-byte ElligatorSwift KEM key prepended; HPKE message padded to 7168 bytes, OHTTP 8192; keys single-session. Flow: sender POSTs Original PSBT; receiver GET polls (202 empty, 200 filled; blocking GET with 30 s timeout); receiver POSTs Proposal to a mailbox derived from sender's reply key; sender polls, checks, signs, broadcasts. BIP-78-compatible senders get a plaintext PUT response. **Spec quirks found**: fragment ordering stated as lexicographic in one section and "reverse lexicographical" in Rationale; separator changed `+` to `-` in 0.2.0 with `+` accepted "until 2026". Treat as Draft: pin the version and re-check at build time. The summary above came from a model-assisted fetch of the page; **verify normative strings against the raw BIP before coding the wire format** (BPJ-V2-1).
- **BIP-352** spec advice (quoted from `anonymization-research.md` 7.1 [R], which cites the BIP [P] fetched earlier; not re-fetched here): all inputs of a transaction should belong to the same entity because there is "no formal proof that the protocol is secure in a collaborative setting"; "it is currently not recommended to use this protocol for CoinJoins due to a lack of a formal security proof"; BIP-375 (Draft) and BIP-374 (Draft) add PSBT ECDH shares and DLEQ proofs for multi-signer SP outputs. URL: https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki.
- **rust-payjoin** (https://github.com/payjoin/rust-payjoin, retrieved 2026-10-21 [P]): crates `payjoin` (async + simple payjoin, session persistence, OHTTP relay I/O), `payjoin-cli` (reference, Bitcoin Core wallet), `payjoin-mailroom` ("combined OHTTP Relay and BIP77 Payjoin Directory in one binary"), `payjoin-test-utils` (local relay, directory, bitcoind fixtures), `payjoin-ffi`. MSRV Rust 1.85.0. License MIT. Releases page empty in fetch: **version/date [U]**. Testnet/signet support not stated: **[U]**.
- **payjoin-ffi** (https://raw.githubusercontent.com/payjoin/rust-payjoin/master/payjoin-ffi/README.md, retrieved 2026-10-21 [P]): UniFFI wrapper; Python, Dart, JavaScript, C#, Kotlin; JavaScript listed for Linux and macOS only; npm package `payjoin`, PyPI `payjoin`, pub.dev `payjoin`, NuGet `Payjoin`, Kotlin unpublished; **Alpha, "caution with real funds"**. License not stated in the fetched file (repo MIT per above). WASM/browser support not mentioned: **browser use [U], assume none**.

## 4. Fit with BIP-352 and `packages/btc-silent-payments`

[R] That package: seller keys, `sp1`/`tsp1` addresses, `bitcoin:?sp=` URIs, sender output derivation (`createSilentPaymentOutputs`), scanner over a tweak source, key-path spend (`buildSpendTransaction`, via `@scure/btc-signer`). Not wired into web/relayer. Eligible SP inputs: P2TR, P2WPKH, P2SH-P2WPKH, P2PKH. Testnet = `tb`/`tsp` only; no `bcrt` regtest addresses (DEVIATIONS) [R].

Interaction rules:
1. **PayJoin and SP are mutually exclusive per transaction.** SP output derivation requires the sum of private keys of *all* tx inputs (`a_sum`, `input_hash`). A PayJoin tx has a receiver-contributed input owned by the payee, so the payer cannot compute the SP shared secret over all inputs, and BIP-352 says collaborative settings are unproven. Therefore: **no `sp1` output inside a PayJoin tx** (BPJ-SP-1). This also matches `anonymization-research.md` 7.2 "Not combined with SP" [R].
2. **Invoice carries one mode.** `btcMode` selects: `silent-payment` (URI `bitcoin:?sp=...`, no `pj`), `payjoin-v2` / `payjoin-v1` (URI `bitcoin:<fresh address>?pj=...`), or `plain`. A URI MUST NOT contain both `sp=` and `pj=` (BPJ-URI-2); a payer reading `sp` ignores `pj`.
3. **Receiver address for PayJoin** is a fresh address from a separate BIP-32 branch (`m/84'/1'/account'/0/i`, P2WPKH; or `m/86'/1'/...` P2TR), never an SP address, never reused (BPJ-ADDR-1). Rationale: SP gives address privacy without interaction; PayJoin gives tx-structure privacy with interaction. A user wanting both gets them only sequentially, not jointly: seller can later spend received SP outputs *as the receiver's contributed input* in a PayJoin to someone else (allowed: the SP output is just a P2TR UTXO to the seller; key tweak per `spendPrivateKey`), which needs the receiver input signer to use the SP spend tweak (BPJ-RCV-9).
4. **Post-receipt CoinJoin** stays docs-only; GhostPay runs no coordinator [R anonymization-research 7.1].
5. **Contribution from SP UTXOs** is the interesting bridge: receiver may contribute a detected SP output (P2TR) as its PayJoin input. This reuses `buildSpendTransaction`'s tweak/sign code (needs a small export of the per-input signer; listed in 7.2).

## 5. User-visible option

`btcMode` selector in the Bitcoin invoice creator (UI wiring is out of PoC build ownership; the package exports `BTC_MODE_INFO` and `buildPayjoinUri`). The comparison table, rendered from data:

| id | Name | Interactive | Server dependency | Hides | Needs payer wallet support |
|---|---|---|---|---|---|
| `plain` | Plain address | no | none | nothing | no |
| `silent-payment` | BIP-352 | no | scan oracle (receiver) | address reuse | yes (SP) |
| `payjoin-v2` | BIP-77 async | yes, async | directory + OHTTP relay | common-input, amount | yes (PayJoin v2) |
| `payjoin-v1` | BIP-78 sync | yes, receiver online | receiver HTTP endpoint (onion or tunnel) | common-input, amount | yes (PayJoin v1) |

Settings: `directoryUrl`, `ohttpRelayUrls[]`, `maxSessionSeconds` (default 3600), `contributeFromSp` (bool), `fallbackBroadcastAfterSeconds` (sender-side; default `EX`).

## 6. Library options vs own implementation

| Option | What | Pros | Cons |
|---|---|---|---|
| A. `payjoin` npm (payjoin-ffi JS) | UniFFI JS binding to rust-payjoin | Reference-quality v2 crypto (HPKE secp256k1, ElligatorSwift, OHTTP), tracks the draft, interop by construction | Alpha [P]; Node on Linux/macOS only [P]; native binary in a repo that installs with `--ignore-scripts` [R] and hashes artifacts; large surface; browser use [U] none; license check needed |
| B. Own TS: BIP-78 only | PSBT checklists + HTTP | Small, auditable, uses existing `@scure/btc-signer`, noble | v1 needs receiver to be an online HTTP endpoint (onion/tunnel); no async |
| C. Own TS: BIP-77 v2 | B + HPKE(secp256k1 DHKEM, ChaCha20Poly1305), ElligatorSwift, OHTTP RFC 9458 client, BHTTP | Browser-capable, in-repo, no native code | Draft spec, nontrivial crypto (ElligatorSwift in noble: **[U]** availability), high interop-bug risk; effort L |
| D. Run `payjoin-cli`/`payjoin-mailroom` as test peers only | Binaries in CI/dev | Gives oracle for interop and a local directory+relay | Not shippable |

**Decision for PoC (builder follows):** implement **B in full** (it is the policy core and is needed by every option), define a `PayjoinTransport` interface, ship **A as the first v2 transport** behind that interface (Node/CLI only, optional peer dependency, spike-gated by BPJ-SPIKE-1), and **C as a stretch** (milestone M4) only if the spike shows A unusable or browser support is required. Use D for tests. Rationale: policy checks (what actually protects funds) are small and ours; wire crypto is where rust-payjoin is authoritative.

## 7. Architecture and ownership

### 7.1 New package `packages/btc-payjoin` (name `@ghostpay/btc-payjoin`)

Same style as `btc-silent-payments` [R]: private, ESM, strict TS, no `any`, vitest with coverage thresholds 95/90/95/95, `DEVIATIONS.md`, `README.md`, `test-vectors/`. Dependencies pinned exactly: `@scure/btc-signer`, `@noble/curves`, `@noble/hashes`, `@scure/base` (same versions as the sibling package [R]); `@ghostpay/btc-silent-payments` as a workspace dependency (types, uri, spend helpers). Optional peer: `payjoin` (payjoin-ffi) in a **separate subpath export** `@ghostpay/btc-payjoin/ffi` so the core has no native dependency.

```
packages/btc-payjoin/
  package.json tsconfig.json tsconfig.build.json vitest.config.ts README.md DEVIATIONS.md
  test-vectors/            # BIP-78 appendix PSBTs, own negative vectors, provenance README
  src/
    index.ts
    errors.ts              # PayjoinError + PayjoinErrorCode union
    modes.ts               # BtcMode, BTC_MODE_INFO
    uri.ts                 # buildPayjoinUri / parsePayjoinUri (bitcoin:addr?amount&pj&pjos)
    params.ts              # v1 query params parse/serialize (v, additionalfeeoutputindex, ...)
    psbt.ts                # PSBT v0 helpers over @scure/btc-signer (parse, finalize check, fee, vsize)
    sender/checks.ts       # BIP-78 sender checklist -> verifyProposal()
    sender/original.ts     # buildOriginalPsbt(), fallback tx extraction
    sender/session.ts      # SenderSession state machine
    receiver/checks.ts     # BIP-78 receiver checklist -> checkOriginal()
    receiver/contribute.ts # input selection, fee bump, output substitution policy
    receiver/seen.ts       # SeenInputs store interface + in-memory impl
    receiver/session.ts    # ReceiverSession state machine
    transport/types.ts     # PayjoinTransport interface (below)
    transport/v1-http.ts   # BIP-78 HTTP POST client/server adapter (injected fetch, injected listener)
    transport/memory.ts    # in-process directory+relay fake for tests
    transport/v2/          # (M4 stretch) hpke.ts elligatorswift.ts ohttp.ts bhttp.ts mailbox.ts
    ffi/                   # (M2) payjoin-ffi adapter implementing PayjoinTransport-level sessions
    signers.ts             # PayjoinSigner interface; fromSilentPaymentOutput()
  e2e/                     # regtest tests (skipped when bitcoind missing, like relayer anvil test [R])
```

### 7.2 Edits to existing code (listed separately; keep minimal)

1. `packages/btc-silent-payments/src/spend.ts` + `index.ts`: export a single-input signer helper (`signSilentPaymentInput(psbt, index, output, spendSecret)`) factored out of `buildSpendTransaction`, so the PayJoin receiver can sign a contributed SP UTXO. Existing tests must stay green; add tests.
2. `packages/btc-silent-payments/src/uri.ts`: none required. `parseBitcoinUri` MAY be extended to reject `sp` + `pj` together (BPJ-URI-2); alternative: the check lives only in `btc-payjoin/uri.ts` (preferred, no edit).
3. `docs/remote/privacy-specs/` index/README (if any) and `docs/MULTICHAIN_SPEC.md` pointer: docs only. No contract, web or relayer edits in the PoC.
4. `package.json` root: none needed (`workspaces: packages/*` picks it up) [R]; `build:libs` is not required because nothing else depends on this package yet.

## 8. Interfaces

```ts
export type BtcMode = 'plain' | 'silent-payment' | 'payjoin-v1' | 'payjoin-v2';
export type BtcNetwork = 'testnet' | 'signet' | 'regtest';     // never 'mainnet' (BPJ-GEN-1)

export type PayjoinErrorCode =
  | 'network_not_allowed' | 'uri_invalid' | 'uri_conflict' | 'psbt_invalid' | 'psbt_unsigned'
  | 'psbt_not_finalized' | 'input_seen' | 'input_owned_by_receiver' | 'not_broadcastable'
  | 'fee_decreased' | 'fee_over_cap' | 'feerate_below_min' | 'output_missing' | 'output_decreased'
  | 'output_substitution_forbidden' | 'input_missing' | 'order_changed' | 'sequence_changed'
  | 'version_or_locktime_changed' | 'keypaths_present' | 'receiver_input_not_finalized'
  | 'session_expired' | 'session_state' | 'transport_failed' | 'version_unsupported' | 'unavailable'
  | 'not_enough_money' | 'original_psbt_rejected' | 'unknown_remote_error';

export interface PayjoinParams {                 // BIP-78 query params
  v: 1 | 2;
  additionalFeeOutputIndex?: number;
  maxAdditionalFeeContributionSats?: bigint;
  minFeeRateSatPerVb?: number;
  disableOutputSubstitution: boolean;
}

export interface PayjoinUri { address: string; amountSats?: bigint; pj: string; pjos: boolean; network: BtcNetwork; label?: string; message?: string }
export function buildPayjoinUri(p: PayjoinUri): string;                   // uppercase pj for v2 per BIP-77 [P]
export function parsePayjoinUri(uri: string, network: BtcNetwork): PayjoinUri;

// Sender
export interface SenderInputs { psbtSigner: PsbtSigner; utxos: readonly Utxo[]; uri: PayjoinUri; feeRateSatPerVb: number; changeAddress: string; params?: Partial<PayjoinParams> }
export interface SenderSession {
  readonly id: string; readonly state: 'created'|'posted'|'proposal_received'|'verified'|'signed'|'broadcast'|'fallback'|'failed'|'expired';
  originalPsbt(): string;                                    // base64, fully signed
  fallbackTx(): { hex: string; txid: string };
  poll(now: number): Promise<SenderEvent>;                   // never throws on remote text; maps to PayjoinErrorCode
  finalize(proposalPsbt: string): { psbt: string; txHex: string; txid: string }; // runs verifyProposal first
}
export function verifyProposal(original: ParsedPsbt, proposal: ParsedPsbt, p: PayjoinParams, ownedScripts: ReadonlySet<string>): void; // throws PayjoinError

// Receiver
export interface ReceiverInputs { wallet: ReceiverWallet; seen: SeenInputs; address: string; amountSats?: bigint; mode: 'interactive'|'non-interactive'; contributeFromSp?: boolean; now: () => number }
export interface ReceiverWallet {
  isMine(scriptPubKey: Uint8Array): boolean;
  listSpendable(): Promise<readonly Utxo[]>;
  signInput(psbt: ParsedPsbt, index: number, utxo: Utxo): void;
  testMempoolAccept?(txHex: string): Promise<boolean>;      // required when mode = non-interactive
}
export interface SeenInputs { has(outpoint: string): Promise<boolean>; add(outpoints: readonly string[]): Promise<void> } // persistent in production
export function checkOriginal(psbt: ParsedPsbt, ctx: ReceiverInputs): Promise<CheckedOriginal>;
export function buildProposal(c: CheckedOriginal, p: PayjoinParams, ctx: ReceiverInputs): Promise<{ psbt: string; contributedOutpoints: string[] }>;

// Transport
export interface PayjoinTransport {
  readonly kind: 'v1-http' | 'v2-ohttp' | 'memory';
  openReceiverSession(r: { address: string; expirySeconds: number; directoryUrl?: string; ohttpRelays?: readonly string[] }): Promise<{ uri: PayjoinUri; poll(): Promise<{ originalPsbt: string; reply(proposal: string | { error: PayjoinErrorCode }): Promise<void> } | null> }>;
  sendOriginal(uri: PayjoinUri, originalPsbt: string, p: PayjoinParams): Promise<{ poll(): Promise<{ proposalPsbt: string } | { error: PayjoinErrorCode } | null> }>;
}
```

v2 wire constants (to implement/verify in M4 or inherit from FFI): HPKE info `PjV2MsgA`/`PjV2MsgB`, message pad 7168, OHTTP pad 8192, cipher suite `DHKEM(Secp256k1, HKDF-SHA256)` + ChaCha20Poly1305, GET poll 30 s timeout, 202/200 semantics [P BIP-77].

## 9. Numbered requirements

General
- BPJ-GEN-1 MUST refuse `mainnet` in every public entry point; `network_not_allowed`. Test: each function rejects `bc1`/`mainnet`.
- BPJ-GEN-2 MUST NOT log PSBTs, outpoints, addresses or session keys; errors carry codes, not remote strings.
- BPJ-GEN-3 MUST treat all remote text (error messages, `pj` bodies) as untrusted; unknown remote error code maps to `unknown_remote_error`, message to debug sink only [P BIP-78].
- BPJ-GEN-4 MUST use injected `fetch`, `now`, `rng` (as `btc-silent-payments` does [R: `rng.ts`]); no globals.

URI
- BPJ-URI-1 MUST build `bitcoin:<addr>?amount=<btc>&pj=<url>[&pjos=0]` with BIP-21 encoding; amount via existing `units.ts` sats-to-BTC.
- BPJ-URI-2 MUST reject a URI with both `sp=` and `pj=`; `uri_conflict`.
- BPJ-URI-3 `pj` for v2 MUST carry `EX`, `OH`, `RK` fragment params; parser MUST accept both `-` and `+` separators and BOTH orderings, serializer MUST emit the order resolved in BPJ-V2-1; `EX` in the past is `session_expired`.
- BPJ-URI-4 `pj` v1 MUST be `https` or `http` onion; plain `http` to a non-`.onion`, non-loopback host MUST be rejected.

Receiver (BIP-78 checks)
- BPJ-RCV-1 MUST reject an Original PSBT that is not fully signed, lacks UTXO data for any input, or has a mismatch between claimed value and script (`psbt_invalid` / `psbt_unsigned`).
- BPJ-RCV-2 MUST reject if any input script is owned by the receiver wallet, or sign none of them (`input_owned_by_receiver`).
- BPJ-RCV-3 MUST reject if any Original input outpoint was seen before; MUST then persist all outpoints of every accepted Original (`input_seen`). The `SeenInputs` store MUST survive restart in production; in-memory only in tests.
- BPJ-RCV-4 `non-interactive` mode MUST reject if `testMempoolAccept` fails (`not_broadcastable`).
- BPJ-RCV-5 MUST ensure the payee output (script == invoice address) exists with value `>= amountSats` when the invoice has an amount.
- BPJ-RCV-6 MUST add at least one own input (or return the Original as the proposal only if explicitly configured `allowNoop`, default false), MUST keep sender inputs/outputs unchanged and in order, MAY insert receiver input(s) at random positions among the inputs.
- BPJ-RCV-7 MUST pay for the added input weight: reduce `additionalfeeoutputindex` output only up to `maxadditionalfeecontribution` and only for the extra vbytes; else take the remainder from the receiver; `not-enough-money` if impossible.
- BPJ-RCV-8 MUST honour `disableoutputsubstitution` and `pjos=0`; with substitution allowed, the payee script MAY change only to a fresh own address of the same script type.
- BPJ-RCV-9 MUST support contributing a detected SP P2TR output when `contributeFromSp`; signature MUST verify (noble schnorr) before the proposal is released. SHOULD prefer same script type as the payer inputs to avoid the unnecessary-input fingerprint [U: heuristic named in the PayJoin literature, not in BIP-78 text; BIP-78 itself names common-input, change-scriptpubkey, change-round-amount].
- BPJ-RCV-10 MUST NOT contribute inputs below dust-relative cost (`input value > 3 x input fee`), MUST NOT contribute more than one UTXO per Original (PoC), and MUST prefer reusing a previously exposed UTXO (anti-probing) [P BIP-78: partial mitigation].
- BPJ-RCV-11 MUST strip keypaths/partial sigs from the Proposal; receiver inputs MUST be finalized with `witness_utxo` or `non_witness_utxo`.
- BPJ-RCV-12 MUST rate-limit sessions per address (one live Original per address in interactive mode).

Sender (BIP-78 checks, `verifyProposal`)
- BPJ-SND-1 MUST implement every sender check listed in section 3 BIP-78 bullet, one test per check.
- BPJ-SND-2 MUST fail closed: any check failure sets state `failed` and, on timeout/failure, the sender MAY broadcast `fallbackTx()` only when policy `fallbackOnFailure` is true (default true for the PoC) after `EX`.
- BPJ-SND-3 Original PSBT MUST be a valid, broadcastable transaction at the chosen feerate; MUST NOT use SP inputs or SP outputs (BPJ-SP-1).
- BPJ-SND-4 MUST NOT sign until `verifyProposal` returns; MUST re-verify final tx vsize/feerate after signing against `minfeerate`.
- BPJ-SND-5 MUST NOT broadcast both txs: after `broadcast` is set, `fallbackTx()` MUST throw `session_state`.
- BPJ-SND-6 SHOULD cap `maxadditionalfeecontribution` at the input fee for one extra input of the largest sender-script type.

SP interaction
- BPJ-SP-1 MUST NOT create or accept a PayJoin tx containing a BIP-352 output derived by any party; a PayJoin Original whose outputs match an SP derivation attempt (caller passes `sp1` recipient) MUST fail `uri_conflict`.
- BPJ-SP-2 Docs MUST quote BIP-352's CoinJoin/collaborative advice and state why PayJoin is not covered by it (single receiver input, no SP output) and why GhostPay still keeps the two apart.

v2 transport
- BPJ-V2-1 (spike) Before coding, fetch raw `bip-0077.md` and the rust-payjoin source for `payjoin` and record: fragment order, separator, HPKE info strings, padding sizes, mailbox ID derivation, in `DEVIATIONS.md`. Resolve the ordering contradiction with a test against `payjoin-cli` output.
- BPJ-V2-2 Sessions MUST be single-use: keys generated per session by CSPRNG, zeroized on completion/expiry/throw.
- BPJ-V2-3 Directory/relay URLs MUST be allowlisted in config; relay and directory MUST NOT be the same origin unless `allowSameOperator` is set (then UI warns, N4).
- BPJ-V2-4 Poll loop MUST honour `EX`, back off with jitter, and cap parallel polls; all messages padded to the sizes in section 8.
- BPJ-V2-5 No GhostPay-operated directory/relay in the PoC; dev runs `payjoin-mailroom` locally [P].

FFI adapter
- BPJ-FFI-1 `@ghostpay/btc-payjoin/ffi` MUST be an optional entry; the core MUST import without it; a missing `payjoin` module yields `transport_failed` with a clear message.
- BPJ-FFI-2 FFI-produced Proposals MUST still pass `verifyProposal` in TS before signing (defence in depth; do not trust the library's checks alone).
- BPJ-FFI-3 Pin the exact npm version; record integrity hash in `THIRD_PARTY.md` (add entry; part of 7.2 docs edit).

## 10. Test plan

1. **Unit/vector (pure TS):** each BPJ-SND/RCV check has a positive and a negative test; vectors from BIP-78 appendix PSBTs (provenance README, saved under `test-vectors/`) plus hand-built negatives (input reordered, sequence changed, fee decreased by 1 sat, receiver input unfinalized, keypath present, output value decreased, fee contribution over cap, minfeerate violated). Property tests with fast-check (as sibling [R]): for random sender txs and receiver UTXOs, `verifyProposal(buildProposal(x))` passes and total value is conserved (`sum(in) = sum(out) + fee`).
2. **State machines:** table tests over `SenderSession`/`ReceiverSession` transitions; expired, replayed Original, double broadcast.
3. **In-memory v2-shaped transport:** `transport/memory.ts` fakes directory + relay; test async (sender posts, receiver offline, comes back, replies, sender completes), expiry, directory seeing only ciphertext lengths (fixed).
4. **Regtest e2e** (`e2e/`, skipped when `bitcoind` missing): fund sender and receiver, run v1 over loopback HTTP, mine, assert tx has `>= 2` input owners, receiver output > invoice amount, `testmempoolaccept` ok. Addresses: regtest `bcrt` not supported by the sibling package [R]; use `@scure/btc-signer` custom network params in this package only (BPJ-DEV note).
5. **Interop (M2/M3):** GhostPay receiver vs `payjoin-cli` sender, and `payjoin-cli` receiver vs GhostPay sender, via local `payjoin-mailroom` (v2) and direct HTTP (v1). Skipped when binaries absent.
6. **Fuzz:** malformed PSBT bytes and URI strings never throw anything but `PayjoinError`.
7. **SP regression:** `btc-silent-payments` suite unchanged (286 tests at README time [R]) after the 7.2 edit.
8. **Privacy assertions (static):** test that the Proposal contains no keypaths, that logs are empty under a log spy (BPJ-GEN-2).

## 11. PoC acceptance criteria

- AC-1 `npm run typecheck`, `lint`, `test` pass for the new package with the coverage thresholds above; existing packages unchanged.
- AC-2 Regtest: a GhostPay receiver invoice (`payjoin-v1`) is paid by a GhostPay sender; confirmed tx has one sender input set and one receiver input; both checklists exercised.
- AC-3 Same flow with `payjoin-v2` over the in-memory transport (M1) and over local `payjoin-mailroom` with the FFI transport (M2/M3), sender and receiver offline at different times.
- AC-4 Interop with `payjoin-cli` in at least one direction per version (v1 and v2) or a documented, reproducible failure with the exact draft discrepancy in `DEVIATIONS.md`.
- AC-5 A URI with `sp=` and `pj=` is rejected; an invoice in `payjoin-*` mode never produces an `sp1` output.
- AC-6 Mainnet is impossible to select in code and in `BTC_MODE_INFO`.
- AC-7 `README.md` and `DEVIATIONS.md` list N1-N8 verbatim and every `[U]` item that stayed unverified.

## 12. Effort

Overall **L**.
- M0 spike (BPJ-V2-1, payjoin-ffi install on Linux CI, ElligatorSwift availability in noble): **S**.
- M1 core (URI, params, PSBT, checks, sessions, memory transport, v1 HTTP, regtest e2e): **M**.
- M2 FFI v2 adapter + mailroom interop: **M** (risk: native build under `--ignore-scripts`).
- M3 SP-contribution + docs + UI table: **S**.
- M4 (stretch) own v2 crypto (HPKE secp256k1, ElligatorSwift, OHTTP/BHTTP): **L**; not required for PoC acceptance.

## 13. Risks

1. BIP-77 is **Draft** and has internal inconsistencies [P]; wire-format drift will break interop. Mitigation: pin versions, BPJ-V2-1.
2. payjoin-ffi is **Alpha**, Node-only on Linux/macOS [P]; no browser path. Mitigation: option C stretch, or CLI-only PoC.
3. A subtle checklist bug can cost the sender funds (fee increase, output redirection). Mitigation: BPJ-FFI-2, vectors, property tests, testnet-only.
4. UTXO probing / dust: receiver leaks UTXOs; mitigations partial [P].
5. Receiver-initiated fallback or sender timeout loses the privacy benefit silently: UI MUST show which path occurred.
6. Directory/relay collusion or single operator [U: how many public directories exist in practice]: PoC uses local mailroom only.
7. Fingerprinting of GhostPay-built PayJoin txs (input ordering, contribution policy): receiver SHOULD randomise insertion position and mimic payer script type [U].
8. Existing package gaps: no regtest addresses, no PSBT combining of foreign inputs, software keys only [R DEVIATIONS].
9. Legal posture of running a directory/relay: **deferred by owner**, noted once here; the PoC runs none and takes no fee.

## 14. Open questions

- Q1 Do we want browser support (needs option C) or is CLI/Node enough for the PoC?
- Q2 Which `payjoin` npm version and its license text at install time **[U]**; does it support testnet/signet/regtest **[U]**?
- Q3 Is noble-curves able to do ElligatorSwift/HPKE-secp256k1 **[U]**, or do we need a vetted dependency (third-party review per `third-party-additions.md`)?
- Q4 Should `payjoin-v1` be shipped at all, given it needs an always-online endpoint (onion service per `onion-i2p-research.md`)? Default: yes, as the simplest testable path.
- Q5 Should the seller wallet expose one `SeenInputs` store shared with the SP scanner state (backup/restore, `modules-needed.md` row 11)?
- Q6 Legal (deferred): any operator of directory/relay or fee-taking on PayJoin; owner to take advice before any hosted deployment.

## 15. Sources (retrieved 2026-10-21)

- BIP-78: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0078.mediawiki
- BIP-77: https://raw.githubusercontent.com/bitcoin/bips/master/bip-0077.md
- BIP-352: https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki (via repo research doc; not re-fetched)
- BIP-375 / BIP-374 (Draft): https://github.com/bitcoin/bips/blob/master/bip-0375.mediawiki (via repo research doc)
- RFC 9458 Oblivious HTTP: https://www.rfc-editor.org/rfc/rfc9458 (named by BIP-77; not fetched)
- rust-payjoin: https://github.com/payjoin/rust-payjoin
- payjoin-ffi README: https://raw.githubusercontent.com/payjoin/rust-payjoin/master/payjoin-ffi/README.md
