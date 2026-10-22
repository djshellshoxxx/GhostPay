# Sweep funds and gas privacy

A *sweep* moves everything from a one-time address to a wallet you choose. It is the step where GhostPay's privacy is easiest to lose.

> **Read this first.**
>
> 1. **The payer can follow the stealth address to your destination.** The payer knows the one-time address they paid, and anyone can watch it on a block explorer. When you sweep to wallet `W`, the chain publicly shows `payer -> one-time address -> W`. If `W` is a wallet you use for other things, the payer (and everyone else) learns it is yours, and can see its balance and other incoming payments.
> 2. **Use a fresh destination for every sweep** (for example a new address from a hardware wallet or an HD account you do not use for anything else). The app recommends a fresh destination, but it does not check whether an address has been used. Do not reuse one destination for several customers.
> 3. **The relayer sees what you are doing.** A relayer learns the one-time address, destination, token, amount, fee, your IP address (hashed for rate limiting) and the timing, and can refuse or delay your request. It cannot change the destination or amount you signed.
> 4. **Gasless is not unlinkable.** Using a relayer removes the need to put gas into the one-time address; it does not remove the on-chain link from one-time address to destination. Funding the one-time address with gas from your own wallet is worse: it links that wallet to the address directly.

The app's current Sweep page shows a generic linkability notice; the sharper payer-follows-funds wording and a warning for destinations that already have history are being added (audit D1, in progress).

## Steps

1. In **Scan and receive**, choose a match and go to **Sweep**. Load your keys if the app asks.
2. Confirm the chain, one-time address, asset and on-chain balance. If the balance is unknown, you need an RPC for that chain (and RPC reads of the address tell your RPC provider you care about it; see [Privacy limits](privacy-limits.md)).
3. Enter your **destination**. Use a fresh address you control.
4. Choose how the network fee is paid:
   - **Through the relayer:** needs a relayer URL in Settings and a token that supports ERC-2612 `permit` (for example USDC). The relayer fee is deducted from the swept amount. You get a quote showing the fee and what you receive, then sign.
   - **Directly:** the one-time address must already hold native coin for gas. The app signs an ordinary transfer with the stealth key and broadcasts it through your RPC.
5. The stealth key is derived in memory only for the signature and never displayed or stored. Because it is signed inside the page, there is no wallet confirmation on this path: **a compromised page could sweep to an attacker.** Read the destination on screen before you sign.
6. Keep the transaction hash and check it on a block explorer you trust.

## What the relayer fee covers

A relayer fee of `max(gas cost x 1.10, 0.50 %)`, capped at 3 %, is fixed inside your signature. The relayer cannot take more than you signed. See [Fees](fees.md). Tokens without permit (for example USDT) cannot use the relayer path; use the direct path or the payer's gas buffer.

## Reducing the damage

- Fresh destination per sweep; never your main wallet.
- Sweep several payments together and not immediately after each payment (this blurs timing, but also reduces how closely the sweep matches a single customer, which is the point). Batching is guidance, not something the app automates.
- Use your own RPC node or Tor for reads (see [local scanner and RPC](../operators/local-scanner-and-rpc.md)).
- For stronger unlinkability you need a separate privacy mechanism after the sweep. GhostPay does not provide one; research is listed in the roadmap but nothing is built.
- The experimental policy-account scheme fixes the destination in advance, which makes the link to that destination permanent (audit D6). It is not available in the app.
