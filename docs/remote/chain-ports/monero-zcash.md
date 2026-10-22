# Chain port: Monero and Zcash (hop only, no scheme port)

**Status:** research and spec only. No code, no deployment. Written 2026-10-21 on branch `claude/remote-extensions-6`.
Evidence labels: **[P]** primary text read from upstream raw GitHub on 2026-10-21; **[R]** this repository; **[U]** unverified (author reasoning or recall).

## 1. Feasibility verdict

| Question | Verdict |
|---|---|
| Port the GhostPay stealth scheme to Monero or Zcash | **No.** Both chains already hide recipient (and, for Monero and Zcash shielded, amounts) natively. Nothing to add. Matches `docs/MULTICHAIN_SPEC.md` section 5 ("GhostPay adds nothing. Not planned.") [R]. |
| Add a `ChainFamily` for them | **No.** |
| Use as a "hop" (swap in, swap out) | **Not recommended as a privacy feature; at most a documented, opt-in, third-party-operated route, spec only.** See section 3 and `docs/remote/anonymization-research.md` sections 6.4, 7.5, 8 [R]. |
| Accept payments *to* a Zcash transparent TEX address | **Out of scope** (see 4.2). |

## 2. Scheme

None. GhostPay's scheme is ERC-5564 scheme 1 on secp256k1 plus BIP-352 for Bitcoin [R]. Monero uses its own one-time-address (stealth) design with ring signatures; Zcash shielded pools use note commitments and zero-knowledge proofs. GhostPay would not generate or scan either.

## 3. GhostPay as a bridge/swap hop only

**What "hop" means here.** A hop is a route where funds leave a GhostPay-recipient address on an adapter chain (for example BTC or an EVM stealth address), cross into XMR or ZEC through a third party (atomic swap counterparty, exchange, or bridge), and later return to a fresh address. GhostPay would never custody, relay or operate any leg; it could at most generate a *fresh destination address* and show a neutral instruction. Anything more (routing orders, quoting, taking a fee on the swap) turns GhostPay into a participant.

**Why the hop does not reliably anonymize [U, reasoning; consistent with `anonymization-research.md` 8.3 [R]]:**
- Amount and timing survive a round trip minus predictable fees; swap makers and exchanges see both legs.
- Liquidity on BTC<->XMR atomic swaps is thin, so unusual amounts stand out.
- Zcash round-trip transparent -> shielded -> transparent with the same amount soon after is a known linkability heuristic (Kappos et al., USENIX Security 2018, recalled, **not retrieved here [U]**).

**Trust, custody and legal risks**
| Risk | Detail |
|---|---|
| Custody | Atomic swaps are non-custodial by design but require the user to run swap software and stay online; exchange or bridge routes are custodial by the third party. GhostPay must hold neither. |
| Counterparty | Maker sees both legs and the user's IP unless Tor is used [U]. |
| Legal | Facilitating privacy-coin conversion, taking a fee on it, or running a swap maker/coordinator is the highest-exposure area (`anonymization-research.md` section 12 [R]). Some venues delist or restrict privacy coins; Zcash TEX addresses exist precisely because Binance required identifiable deposit sources (ZIP-320 background [P]). Owner must get legal advice before any hop copy ships. Not legal advice. |
| Copy | Never describe a swap or bridge as a privacy step in GhostPay UI (`anonymization-research.md` 8.3 [R]). |

## 4. Upstream status (verified from raw GitHub, retrieved 2026-10-21)

### 4.1 BTC <-> XMR atomic swap
- `comit-network/xmr-btc-swap` README opens with "THIS REPO IS UNMAINTAINED, PLEASE USE eigenwallet INSTEAD"; the fork "has introduced network-level breaking changes, making it incompatible with peers running this repository" [P]. It implements section 3 of arXiv 2101.12332; swaps offered in one direction only (send BTC, receive XMR), with an XMR-first protocol "blocked by advances on Monero itself" [P]. Its last changelog release listed is 0.13.4 dated 2024-07-25 [P].
- `eigenwallet/core` is the active continuation: README describes `swap` (asb maker, swap taker CLI), a Tauri GUI, and docs at docs.unstoppableswap.net (project formerly UnstoppableSwap) [P]. Its CHANGELOG shows releases 4.15.0 (2026-09-22), 4.16.0 (2026-10-06) and 4.16.1 (2026-10-13), with ongoing fixes to Monero transfer-proof handling and maker discovery via a rendezvous point [P]. So: **actively maintained as of the retrieval date; direction BTC -> XMR documented in the older repo; whether eigenwallet adds XMR -> BTC is not verified here [U]**.
- Mainnet launch claim (COMIT, May 2021) is a secondary source cited in `anonymization-research.md` [R, S]; not re-verified.

### 4.2 Zcash
- ZIP-316 (Unified Addresses): Receiver typecodes 0x00/0x01 transparent, 0x02 Sapling, 0x03 Orchard; a wallet that supports Orchard and gets a UA with an Orchard Receiver MUST send to the Orchard Receiver [P].
- ZIP-320 (Active): TEX address = Bech32m re-encoding of a transparent P2PKH address with HRP `tex` (testnet `textest`). Senders MUST spend only transparent UTXOs when any output is a TEX address, and SHOULD send only to transparent outputs [P]. This is a *compliance* construct (identifiable sources), the opposite of privacy.
- Implication: a GhostPay invoice cannot sensibly carry a TEX address as payee, and a UA with Orchard receiver is already private without GhostPay. No scheme port.

## 5. Adapter fit

**None.** `ChainAdapter` (`packages/chain-adapters/src/adapter.ts`) requires `parseRecipient` returning spending/viewing public keys, `buildPaymentRequest`, and `scan` over a stealth-key model; `ChainFamily` is `'evm' | 'bitcoin' | 'solana'` [R]. Monero/Zcash do not fit and must not be forced in.

**Optional "hop" interface sketch (spec only, structural typing, not part of `ChainAdapter`):**
```ts
// packages/privacy-hop-spec (proposal; docs only; NOT created)
interface HopRoute {
  readonly kind: 'atomic-swap' | 'external';
  readonly venueDisclosure: string;       // plain text: who sees what; no endorsement
  readonly fees: { checkout: 'not_enforceable'; gasSponsorship: 'not_enforceable'; flatSecurity: 'not_enforceable' };
  freshDestination(chainId: string): string;   // GhostPay supplies only a new address
}
```
Honest default: `HopRoute` is documentation and a fresh-address helper; no execution.

## 6. Fee capability and cap

All fee lines `not_enforceable` (no router, no relayer on these chains). **Fee cap: 0 bps; GhostPay charges nothing on a hop.** Never advertise a fee that cannot be collected (`MULTICHAIN_SPEC` section 4 [R]).

## 7. Effort

- Hop doc plus fresh-address helper: **S**.
- Any executing integration with eigenwallet or an exchange: **L** and **not recommended**.
- Scheme port: not applicable.

## 8. Risks

1. Legal and regulatory (above); highest in the project.
2. False privacy claims from correlation (above).
3. Upstream churn: eigenwallet changelog shows frequent fixes; version-pin and re-verify before any reference [P].
4. Zcash: an Orchard soundness-bug report (2026-05-29) rests on one aggregator source in `anonymization-research.md` and is **unverified [U]**.
5. Monero FCMP++ not active on mainnet per secondary sources [R, S]; **unverified here [U]**.
6. Supply chain: any swap binary is untrusted third-party code.

## 9. PoC acceptance (testnet/regtest only; no deployments)

If a PoC is ever approved, it is documentation plus a unit-tested fresh-address helper only:
- [ ] Legal sign-off recorded by the owner before any user-facing hop text.
- [ ] `HopRoute` sketch compiles as a type-only module with structural typing; no import of existing packages modified.
- [ ] Chain-mismatch test: a hop route can never be selected for an invoice whose `chainId` differs.
- [ ] UI copy test: no string states a swap or bridge "anonymizes" or "hides".
- [ ] Optional manual check on Bitcoin testnet and Monero stagenet/testnet using eigenwallet's documented `--testnet` flow (older CLI shows `swap --testnet list-sell` [P]); results documented, not automated, not on mainnet.

## 10. Package ownership

No new package. Doc owner: chain-ports spec owner. If the type sketch is ever built: proposed `packages/privacy-hop-spec` (types only), owned by the multichain maintainer; no edits to `@ghostpay/chain-adapters`.

## Sources (retrieved 2026-10-21)
- https://raw.githubusercontent.com/comit-network/xmr-btc-swap/master/README.md
- https://raw.githubusercontent.com/comit-network/xmr-btc-swap/master/CHANGELOG.md
- https://raw.githubusercontent.com/eigenwallet/core/master/README.md
- https://raw.githubusercontent.com/eigenwallet/core/master/CHANGELOG.md
- https://raw.githubusercontent.com/zcash/zips/main/zips/zip-0316.rst
- https://raw.githubusercontent.com/zcash/zips/main/zips/zip-0320.rst
- Repo: `docs/MULTICHAIN_SPEC.md`, `docs/remote/anonymization-research.md`, `packages/chain-adapters/src/adapter.ts`

**Unverified:** Kappos et al. and Moser et al. findings; Orchard soundness-bug report; FCMP++ status; eigenwallet XMR->BTC direction; COMIT 2021 mainnet launch; Haveno swap status.
