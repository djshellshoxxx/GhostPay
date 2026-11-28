# Sweep funds and gas privacy

A *sweep* moves the funds of a one-time address to a wallet you choose (a direct sweep of native coin keeps back the network fee; see step 4). It is the step where GhostPay's privacy is easiest to lose.

> **Read this first.**
>
> 1. **The payer can follow the stealth address to your destination.** The payer knows the one-time address they paid, and anyone can watch it on a block explorer. When you sweep to wallet `W`, the chain publicly shows `payer -> one-time address -> W`. If `W` is a wallet you use for other things, the payer (and everyone else) learns it is yours, and can see its balance and other incoming payments.
> 2. **Use a fresh destination for every sweep** (for example a new address from a hardware wallet or an HD account you do not use for anything else). The app recommends a fresh destination. It warns when you enter a destination it saw you sweep to earlier in this tab, or another one-time address of the same keys, but it cannot know an address's history from elsewhere and does not look it up. Do not reuse one destination for several customers.
> 3. **The relayer sees what you are doing.** A relayer learns the one-time address, destination, token, amount, fee, your IP address (the reference relayer hashes it for rate limits, but the operator and any proxy in front of it can see it) and the timing, and can refuse or delay your request. It cannot change the destination or amount you signed.
> 4. **Gasless is not unlinkable.** Using a relayer removes the need to put gas into the one-time address; it does not remove the on-chain link from one-time address to destination. Funding the one-time address with gas from your own wallet is worse: it links that wallet to the address directly.

The Sweep page says that the payer can follow the sweep, warns about destinations it saw you use in this tab, and, for a direct token sweep, warns that funding gas from a wallet you use elsewhere links that wallet to the payment.

## Steps

1. In **Scan and receive**, choose a match and go to **Sweep**. Load your keys if the app asks.
2. Confirm the chain, one-time address, asset and on-chain balance. The balance is read only when you press **Read balance from the Settings RPC**; until then it shows "not read yet". Pressing it needs an RPC for that chain, and the read tells your RPC provider you care about that address (see [Privacy limits](privacy-limits.md)). If you change the destination, balance, provider, chain, payment or fee mode while signing, no transaction or order is sent (the app may already have asked your RPC for a nonce, fee estimates and a dry run that name the old destination and amount) and you review and sign again.
3. Enter your **destination**. Use a fresh address you control.
4. Choose how the network fee is paid:
   - **Through the relayer:** needs a relayer URL in Settings and a token that supports ERC-2612 `permit` (for example USDC). The relayer fee is deducted from the swept amount. You get a quote showing the fee and what you receive, then sign.
   - **Directly:** the one-time address must already hold native coin for gas. For a native-coin payment the fee comes out of the swept amount. For a token, someone has to put native coin at the one-time address; the payer's optional gas buffer does that, and sending it yourself from a wallet you use elsewhere links that wallet to the payment. The app signs an ordinary transfer with the stealth key and broadcasts it through your RPC. For native coin it sends the balance minus the worst-case network fee: the gas estimated for your destination at twice the current gas price and, on OP Stack chains (Base, OP), twice the L1 data fee and operator fee quoted by the chain's fee oracle. The unused part of that reserve stays at the one-time address.
5. For a direct sweep, press **Review the direct sweep** first. The app computes the transaction and shows the amount it sends, the destination, the most the network fee can cost (gas limit and maximum price per unit of gas), any OP Stack fee reserve, and what stays at the one-time address. Nothing is signed yet. **Sign and broadcast directly** then signs exactly that transaction. The review is valid for two minutes; if it is older, or the address's nonce or native balance changed, or a dry run now fails, nothing is signed and you review again. Changing the destination, balance, mode or settings discards the review.
6. The stealth key is derived in memory only for the signature and never displayed or stored. Because it is signed inside the page, there is no wallet confirmation on this path: **a compromised page could sweep to an attacker.** The review is your only confirmation: read the destination and amount on screen before you sign.
7. Keep the transaction hash and check it on a block explorer you trust.

## What the relayer fee covers

A relayer fee of `max(gas cost x 1.10, 0.50 %)`, capped at 3 %, is fixed inside your signature. The relayer cannot take more than you signed. See [Fees](fees.md). Tokens without permit (for example USDT) cannot use the relayer path; use the direct path or the payer's gas buffer.

## Reducing the damage

- Fresh destination per sweep; never your main wallet.
- Do not sweep several payments immediately after each one arrives; waiting blurs timing. Sweeping several one-time addresses to the same destination links those payments to each other on-chain, so use a fresh destination per sweep. Batching is guidance, not something the app automates.
- Use your own RPC node or Tor for reads (see [local scanner and RPC](../operators/local-scanner-and-rpc.md)).
- For stronger unlinkability you need a separate privacy mechanism after the sweep. GhostPay does not provide one; research is listed in the roadmap but nothing is built.
- The experimental policy-account scheme fixes the destination in advance, which makes the link to that destination permanent (audit D6). It is not available in the app.
