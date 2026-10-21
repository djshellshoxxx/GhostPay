# FAQ

**Is GhostPay private or anonymous?**
No. It reduces address reuse. Payer address, token, amounts, time, router use, fee flow, announcements and sweeps are public. See [Privacy limits](../user/privacy-limits.md) and the [map](../assets/diagrams/privacy-limits-map.svg).

**Can I use it with real money?**
No. It is pre-audit (self-run and AI-assisted reviews only), nothing is deployed on any chain, contracts are immutable once deployed, and the audit round has open findings.

**Which chains?**
Ethereum Sepolia and Base Sepolia (testnets) are enabled in code. Mainnets are listed with `enabled: false`.

**Is there an official website or hosted service?**
No. Hosting is not configured and no release is signed, so beware of lookalike sites.

**What does it cost?**
0.25% on payments through the router (rounded down; payments under 400 base units pay 0). Sponsored sweeps cost `max(gas x 1.10, 0.50%)`, capped at 3%. Scanning, tags, QR and invoices are free. Direct payments to a one-time address bypass the fee. See [Fees](../user/fees.md) and [the fee diagram](../assets/diagrams/fee-flow.svg).

**Where does the fee go?**
To a fee recipient fixed at deployment and shown from the deployment manifest. The owner has not yet chosen it.

**Do I get notified when someone pays?**
No. You scan announcements ([Receivers and scanning](receivers-and-scanning.md)).

**Does a view tag hide my payments?**
No. It lets the scanner skip about 255 of 256 unrelated announcements cheaply. The log download is unchanged.

**Can someone fake a payment to me?**
Yes. Anyone can post an announcement with any amount. Always check the actual balance.

**What if I lose my keystore or passphrase?**
Nobody can recover it, including the project. Funds in your one-time addresses are lost without the spending key.

**What can the payer learn?**
The one-time address they paid, and, once you sweep, where it went. Use a fresh destination.

**Does the relayer make sweeping anonymous?**
No. It pays gas so you need not fund the address. The chain still shows the link, and the relayer sees the sweep details.

**Can the relayer steal my funds?**
It cannot change the destination, amount or fee you signed. It can refuse or delay.

**Are fiat-priced invoices supported?**
Not in practice: no price feed is configured. Use token-priced invoices.

**Can I pay with a phone wallet?**
Browser wallets only; WalletConnect is not built.

**What are policy accounts?**
An experimental timelocked account, contracts only. See [Policy accounts](policy-accounts.md).

**Does it support Bitcoin?**
A BIP-352 library exists but is not wired into the app. See [Bitcoin silent payments](bitcoin-silent-payments.md).

**Is the invoice link secret?**
It is a bearer link: anyone holding it reads the invoice. The part after `#` is not sent to the web server, but browser history may store it.

**Can an invoice be paid twice?**
Yes; invoices are not single-use on-chain (ADR-0003).

**Where do I report a security problem?**
Privately; see [SECURITY.md](../../SECURITY.md).
