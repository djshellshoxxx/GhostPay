# Sweeping safely

> **Pre-audit, testnet only.**

A **sweep** moves everything from a one-time address to a wallet you choose. It is the step where GhostPay's privacy is easiest to lose.

![Sweep and gas privacy: one-time address, browser signature, relayer, sweep contract, destination, and the public link](../assets/diagrams/sweep-gas-privacy.svg)

Animated walk-through: [sweep through a relayer](../assets/animations/sweep-relayer.svg).

## The four facts to keep in mind

1. **The payer can follow the funds.** The payer knows the one-time address they paid. When you sweep to wallet `W`, the chain shows `payer -> one-time address -> W` to everyone. If `W` is a wallet you use elsewhere, the payer learns it is yours.
2. **Use a fresh destination every time** (new address from a hardware wallet or an unused HD account). Never reuse one destination across customers. The app may warn when a destination looks used; do not rely on it.
3. **A relayer sees your sweep:** one-time address, destination, token, amount, fee, timing, and a hashed IP. It can refuse or delay. It cannot change the destination or amount you signed.
4. **Gasless is not unlinkable.** A relayer removes the need to fund the one-time address with gas; it does not remove the on-chain link. Funding gas from your own wallet is worse because it links that wallet directly.

## Choose a path

| | Relayer path | Direct path |
|---|---|---|
| Gas | Relayer pays; fee deducted from swept amount | The one-time address must already hold native coin |
| Token | Must support ERC-2612 permit (for example USDC; not USDT) | Any |
| Set-up | Relayer URL (https) in Settings | RPC for the chain |
| Fee | `max(gas x 1.10, 0.50%)`, capped at 3%, fixed in your signature | Network gas only |
| Extra exposure | Relayer operator learns the sweep | Your gas wallet is linked to the address |

## Steps

1. In **Scan and receive** choose a verified match, then **Sweep**.
2. Confirm chain, one-time address, asset and on-chain balance (needs an RPC; the RPC learns you care about that address).
3. Enter a **fresh destination**. Read it twice.
4. Pick relayer or direct. On the relayer path you get a quote with the fee and what you receive, then sign.
5. The stealth key is derived in memory only to sign. There is **no wallet confirmation**, so a compromised page could redirect the sweep. Check the destination on screen before signing.
6. Keep the transaction hash and check it on an explorer you trust.

## Reducing the damage

- Fresh destination per sweep; never your main wallet.
- Sweep several payments together rather than instantly after each one. This blurs timing only and is manual guidance; the app does not batch for you.
- Use your own node or Tor for reads.
- GhostPay has **no mixer** and no unlinkability mechanism after the sweep; research is listed in the roadmap but nothing is built.
- The experimental [policy account](policy-accounts.md) fixes the destination in advance, which makes that link permanent. It is not in the app.

Fees in detail: [Fees](../user/fees.md). Errors: [Troubleshooting by symptom](troubleshooting-by-symptom.md).
