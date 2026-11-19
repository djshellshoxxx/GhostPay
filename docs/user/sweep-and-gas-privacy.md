# Sweep funds and gas privacy

A *sweep* moves the funds of a one-time address to a wallet you choose (a direct sweep of native coin keeps back the network fee; see step 4). It is the step where GhostPay's privacy is easiest to lose.

The Pages demonstration disables sweeping and all payment execution. The native-coin flow below is implemented for a separately qualified testnet build with an authenticated deployment manifest. Its source and focused tests do not establish real-browser or public-testnet acceptance. ERC-20 sweeping requires native gas and separate acceptance; no GhostPay-operated relayer is provided or required.

> **Read this first.**
>
> 1. **The payer can follow the stealth address to your destination.** The payer knows the one-time address they paid, and anyone can watch it on a block explorer. When you sweep to wallet `W`, the chain publicly shows `payer -> one-time address -> W`. If `W` is a wallet you use for other things, the payer (and everyone else) learns it is yours, and can see its balance and other incoming payments.
> 2. **Use a fresh destination for every sweep** (for example a new address from a hardware wallet or an HD account you do not use for anything else). The app warns, without blocking, when a destination was used earlier in the current session. This history stays in memory and is cleared when the app locks, seller keys change or the page reloads. Earlier sessions, other browsers or devices, and other people's sweeps are not checked, so an address without a warning may still have history. The old plaintext destination-history key is removed where browser storage permits; it is never imported. Cross-session history requires a separately qualified encrypted, opt-in design. Do not reuse one destination for several customers.
> 3. **The relayer sees what you are doing.** A relayer learns the one-time address, destination, token, amount, fee, your IP address (hashed for rate limiting) and the timing, and can refuse or delay your request. It cannot change the destination or amount you signed.
> 4. **Gasless is not unlinkable.** Using a relayer removes the need to put gas into the one-time address; it does not remove the on-chain link from one-time address to destination. Funding the one-time address with gas from your own wallet is worse: it links that wallet to the address directly.

The Sweep page shows the payer-follows-funds notice and a non-blocking warning for destinations already recorded in this browser. It does not query the chain for destination history, and it does not know the addresses of wallets you use elsewhere (no known-wallet list is shipped yet).

## Steps

1. In **Scan and receive**, choose a match and go to **Sweep**. Load your keys if the app asks.
2. Confirm the chain, one-time address and asset. Choose **Read balance** after reviewing the RPC disclosure; each refresh needs another explicit action. RPC reads tell your chosen provider that you are interested in the address; see [Privacy limits](privacy-limits.md).
3. Enter your **destination**. Use a fresh address you control.
4. Choose how the network fee is paid:
   - **Through the relayer:** needs a relayer URL in Settings and a token that supports ERC-2612 `permit` (for example USDC). The relayer fee is deducted from the swept amount. You get a quote showing the fee and what you receive, then sign.
   - **Directly, native coin:** first prepare the fee review. Review the exact destination, balance, nonce, gas limit, maximum fee and priority fee per gas, additional chain fee reserve, total reserve and amount the destination receives. Preparation performs authorized reads without signing or broadcasting. Use the expiry shown in the review. Fee calculation uses part of its 60-second lifetime; confirmation does not extend it. Confirm only while those values remain acceptable. The additional L1/operator fee reserve is an estimate and can change before inclusion. The unused part of the fee reserve stays at the one-time address. If simulation is unavailable, the review says so; that state does not establish a successful simulation.
   - **Directly, ERC-20:** the one-time address needs native coin for gas. A funding transfer can link the funding wallet to that address. This flow has separate acceptance requirements and is not qualified by the native-coin review tests.
5. Native confirmation consumes the prepared review once and repeats transaction checks before signing. Changed balance, fees, nonce, destination, session, relevant network or privacy settings, or manifest require a new review; the app does not silently accept a different transaction. Cancellation or expiry revokes the review. An encrypted saved vault can ask for authentication separately during preparation and confirmation. The spending key is derived transiently for ownership checks and signing, with the helper's temporary buffer disposed afterward. JavaScript cannot guarantee erasure of every runtime copy. Because the page signs this transaction, there is no separate wallet confirmation: read the destination before you confirm. A compromised page can change what is signed; the on-screen review is not protection from a compromised host or same-origin script.
6. Keep the transaction hash and check its result. An uncertain broadcast is not a confirmed failure; use the recorded attempt and its reconciliation controls before attempting another sweep. A native-coin replacement transaction needs its own review and preserves the original nonce and attempt history.

## What the relayer fee covers

A relayer fee of `max(gas cost x 1.10, 0.50 %)`, capped at 3 %, is fixed inside your signature. The relayer cannot take more than you signed. See [Fees](fees.md). Tokens without permit (for example USDT) cannot use the relayer path; use the direct path or the payer's gas buffer.

## Reducing the damage

- Fresh destination per sweep; never your main wallet.
- Sweep several payments together and not immediately after each payment (this blurs timing, but also reduces how closely the sweep matches a single customer, which is the point). Batching is guidance, not something the app automates.
- Use your own RPC node or Tor for reads (see [local scanner and RPC](../operators/local-scanner-and-rpc.md)).
- For stronger unlinkability you need a separate privacy mechanism after the sweep. GhostPay does not provide one; research is listed in the roadmap but nothing is built.
- The experimental policy-account scheme fixes the destination in advance, which makes the link to that destination permanent (audit D6). It is not available in the app.
