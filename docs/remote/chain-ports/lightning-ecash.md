# Chain port: Lightning and ecash (Cashu, Fedimint) as payment-hop options

**Status:** research and spec only. No code, no deployments, no mint or node operated by GhostPay. Written 2026-10-21 on branch `claude/remote-extensions-6`.
Labels: **[P]** primary text read from upstream raw GitHub 2026-10-21; **[R]** this repository; **[U]** unverified.

## 1. Feasibility verdict

| Item | Verdict |
|---|---|
| Stealth-address scheme on Lightning/ecash | **Not applicable.** No on-chain recipient address to derive. |
| New `ChainAdapter` family | **No** (`ChainFamily` stays `'evm' \| 'bitcoin' \| 'solana'`) [R]. |
| Pay a seller's Lightning invoice/offer or Cashu payment request as an *alternative rail* | **Feasible as spec; build later, low priority, testnet/signet/mutinynet only.** |
| GhostPay operating a mint, LSP or custodial node | **No.** Out of scope per `anonymization-research.md` 7.4 [R]. |

## 2. Schemes

**Lightning**
- BOLT-11: invoice payment encoding (`lightning/bolts/11-payment-encoding.md`) [P]. It names the payee node and payment hash; receiver node is visible [U, recalled; consistent with `anonymization-research.md` 7.4].
- BOLT-12 offers (`12-offer-encoding.md`) [P]: offers can carry `offer_paths` (blinded paths, TLV type 16) and `offer_issuer_id` (type 22); a reader MUST fail if neither `offer_issuer_id` nor `offer_paths` is set, and a path with `num_hops` 0 is rejected as specified [P]. Blinded paths hide the receiver node identity from payers [U beyond the spec's structure].
- LNURL-pay (LUD-06): wallet GETs a `payRequest` JSON (`callback`, `minSendable`, `maxSendable` in msat, `metadata`, `tag: "payRequest"`), then requests a fresh invoice from `callback` and pays only if it matches the expected amount [P].
- bLIPs exist for LSP specs (LSPS0/1/2/5), BOLT-12 contacts (bLIP-42), keysend (bLIP-3) [P]; not required here.

**Cashu ecash (NUTs, `cashubtc/nuts`)** [P]
- Mandatory: NUT-00 to NUT-06 (cryptography, keys, keysets and fees, swap, mint, melt, mint info).
- Melt = the mint pays an external request on the wallet's behalf: wallet requests a melt quote for a `request`, mint returns `quote` and demanded `amount`; wallet supplies proofs; mint executes and returns state (NUT-05) [P]. Method NUTs: NUT-23 bolt11, NUT-25 bolt12 offers, NUT-30 onchain (all listed `optional`) [P].
- NUT-05 melt quote carries `fee_reserve`: wallet must provide proofs covering `amount + fee_reserve + fee` where `fee` is the NUT-02 keyset input fee [P].
- NUT-02: keysets expose `input_fee_ppk` (parts per thousand per input, summed and rounded up) [P].
- NUT-18 payment requests, NUT-26 bech32m encoding, NUT-24 HTTP 402 `X-Cashu` header, NUT-28 pay-to-blinded-key (mint cannot link P2PK spends by the same party) [P]. Wallet/mint support varies per NUT (README matrix: for example NUT-25 wallets cdk and cashu-ts, mint cdk-mintd only; NUT-30 mint cdk-mintd) [P].

**Fedimint (`fedimint/fedimint`)** [P]
- "Module based system for building federated applications"; default modules Bitcoin, Lightning, Chaumian Ecash. Trust is spread over a federation of guardians; threshold language and guardian counts are **[U, not read in this README]**.

## 3. How a hop fits

Instead of an on-chain transfer to a stealth address, the payer's wallet pays a **Lightning invoice or offer** produced for the invoice, or spends **ecash** (via a Cashu payment request or a melt that pays the seller's invoice). Flow sketch:

1. Seller's invoice optionally carries `ln` (BOLT-11/12 string or LNURL) or `creq` (NUT-18/26) next to the on-chain fields.
2. Payer's wallet (not GhostPay) pays. GhostPay never touches funds.
3. Seller's node/mint settles on a rail the seller controls or has chosen.
4. Confirmation = payment preimage (BOLT-11/12) or mint quote state; GhostPay only displays what the seller's backend reports.

This is a *rail change*, not an anonymization step: privacy comes from the rail (blinded paths, blind signatures), not from GhostPay.

## 4. Custody trust

| Option | Who can take, freeze or debase funds |
|---|---|
| Self-run LN node + BOLT-12 blinded offers | Seller only (channel risk, liquidity, uptime). |
| Hosted LN wallet / LNURL service | The host (custodial). LNURL-pay metadata is service-controlled. |
| Cashu mint | The single mint operator (custodial bearer assets). Mint can censor, steal or fail [U, per `anonymization-research.md` 7.4, single secondary source]. |
| Fedimint | A federation quorum of guardians (threshold) [U details]. |
GhostPay must show these labels in any UI and must not run the mint. Running a mint is custodial money transmission in most readings **[U, legal]**.

## 5. Fee capability and cap

- Checkout fee: `not_enforceable`. GhostPay is not in the payment path (payer wallet pays seller's invoice directly).
- Gas sponsorship: `not_enforceable` (no gas concept).
- Flat security fee: `not_enforceable`.
- Only *third-party* fees exist and must be shown honestly as such: LN routing fees (BOLT-12 blinded paths aggregate fees in the path, spec text) [P] and Cashu `fee_reserve` plus `input_fee_ppk` [P]. These accrue to routers and mint operators, never GhostPay.
- **Fee cap: 0 bps for GhostPay.** A voluntary tip is possible only as a separate LN payment/ecash request the payer chooses (not enforceable).

## 6. Adapter fit

Not a `ChainAdapter`. Proposed side-interface (structural typing, no import of or edit to existing packages):

```ts
// packages/ln-hop (spec only; NOT created in this pass)
type HopRail = 'bolt11' | 'bolt12' | 'lnurl-pay' | 'cashu' | 'fedimint';
interface LnHopRequest {
  readonly rail: HopRail;
  readonly network: 'signet' | 'mutinynet' | 'regtest' | 'testnet'; // mainnet rejected until legal sign-off
  readonly request: string;            // invoice, offer, LNURL, or NUT-18/26 payment request
  readonly amountMsat: bigint;
  readonly expiresAt?: number;
  readonly custody: 'self' | 'hosted' | 'single-mint' | 'federation'; // mandatory disclosure
}
interface LnHopVerifier {
  parse(input: string): LnHopRequest;           // pure; never performs network I/O
  checkInvoiceMatch(inv: ValidatedInvoiceLike, r: LnHopRequest): void; // amount/network/expiry mismatch throws
}
const lnFees = { checkout: 'not_enforceable', gasSponsorship: 'not_enforceable', flatSecurity: 'not_enforceable' } as const;
```
`fees` literal is assignable to the existing `FeeCapability` shape [R].

## 7. Effort

- Parser and verifier (BOLT-11 decode, BOLT-12 offer decode, LUD-06 JSON validate, NUT-18/26 decode): **M**.
- Executing payments or running a node/mint: **L**, **not planned**.
- Docs and UI disclosure copy: **S**.

## 8. Risks

1. Custody and censorship (section 4).
2. Legal: mint/LSP operation and fee-taking (`anonymization-research.md` 12 [R]); owner must obtain advice.
3. Privacy overclaim: BOLT-11 reveals receiver node; ecash in/out via Lightning has weaker receiver privacy [R, S].
4. Spec churn: NUTs 25/30 are recent and unevenly implemented [P]; Fedimint guardian details unverified.
5. LNURL services are HTTP endpoints: SSRF, redirect, metadata spoofing; verify the callback invoice against the expected amount (LUD-06 flow) [P].
6. Invoice expiry and amount-unit confusion (msat vs sat vs wei): property tests required.

## 9. PoC acceptance (signet/mutinynet/regtest only; never mainnet; no deployments)

- [ ] BOLT-11 and BOLT-12 parser passes the test vectors published in `lightning/bolts` (fetch from raw GitHub; record commit hash).
- [ ] LUD-06 `payRequest` validator rejects: `minSendable` < 1, `minSendable` > `maxSendable`, missing `text/plain` metadata entry, and a callback invoice whose amount differs from the requested amount.
- [ ] Network-mismatch test: a mainnet `lnbc...` request is rejected for a testnet/signet invoice and vice versa; `ln` rail never accepted for an EVM/BTC `chainId` invoice.
- [ ] NUT-18/26 payment request round trip; NUT-05 fee math test: `amount + fee_reserve + ceil(sum(input_fee_ppk)/1000)`.
- [ ] Custody label required by the type; UI snapshot test fails if absent.
- [ ] Fee test: `fees` all `not_enforceable`; no UI string advertises a GhostPay LN fee.
- [ ] Manual: pay a regtest or mutinynet invoice with a third-party wallet; verify preimage; documented only.

## 10. Package ownership

Proposed `packages/ln-hop` (spec first, parser later), owned by the multichain maintainer. No edits to `@ghostpay/chain-adapters` or `@ghostpay/invoice-schema`; any invoice-schema field (`ln`, `creq`) goes through a separate ADR.

## Sources (retrieved 2026-10-21)
- https://raw.githubusercontent.com/lightning/bolts/master/11-payment-encoding.md
- https://raw.githubusercontent.com/lightning/bolts/master/12-offer-encoding.md
- https://raw.githubusercontent.com/lnurl/luds/luds/06.md
- https://raw.githubusercontent.com/lightning/blips/master/README.md
- https://raw.githubusercontent.com/cashubtc/nuts/main/README.md
- https://raw.githubusercontent.com/cashubtc/nuts/main/02.md , 04.md , 05.md , 23.md , 24.md , 25.md , 28.md , 30.md
- https://raw.githubusercontent.com/fedimint/fedimint/master/README.md
- Repo: `docs/MULTICHAIN_SPEC.md`, `docs/remote/anonymization-research.md`, `packages/chain-adapters/src/adapter.ts`

**Unverified:** BOLT-12 privacy properties beyond spec structure; BOLT-11 receiver-node visibility (recalled); Fedimint guardian threshold and mutinynet/signet support; mint custody/legal characterizations (secondary); current wallet/mint support beyond the NUT README matrix.
