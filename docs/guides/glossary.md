# Glossary

Plain-language definitions. A planned feature may be absent; an experimental feature may have gated test controls. Neither label establishes a qualified deployment.

**Announcement.** A public on-chain event (ERC-5564) holding the one-time address, an ephemeral public key and a view tag. It tells the seller's scanner a payment may be theirs. It is a claim, not proof of payment.

**Anonymity set.** The group you blend into. Here it is roughly "GhostPay users on that chain", not everyone.

**Bearer link.** A link that works for whoever holds it. Invoice links are bearer links.

**BIP-352 / Silent payments.** Bitcoin's reusable-address scheme. See [Bitcoin silent payments](bitcoin-silent-payments.md). *(library and full-build test view)*

**Checkout fee.** The 0.25% (25 bps) fee taken by the router, rounded down.

**Deployment manifest.** A file listing contract and fee-recipient addresses per chain. The app accepts a bundled manifest only with a valid configured release signature, then checks the deployment against its RPC before payment. No deployment manifest ships in this repository; missing or invalid deployment information keeps payments disabled.

**ERC-2612 permit.** A token feature that lets a signature approve spending without a separate approval transaction. Needed for the relayer sweep path.

**ERC-5564.** The standard for stealth addresses and announcements.

**ERC-6538.** A registry standard for publishing meta-addresses. The app has explicit-consent publishing, clearing and lookup controls, with registry verification.

**Ephemeral key.** A fresh one-time key the payer generates so the one-time address cannot be derived by anyone else.

**Fee recipient.** The address that receives checkout fees; set at deployment.

**Gas.** The network fee for a transaction, paid in the chain's native coin.

**Gas buffer.** Optional extra native coin sent to the one-time address by the payer so the seller can sweep. Public; links payer and address.

**Keystore.** The encrypted file (scrypt + AES-256-GCM) holding your keys.

**Meta-address.** The one public address a seller shares. Contains the spending and viewing public keys.

**One-time (stealth) address.** A fresh address for one payment that only the seller can find and spend from.

**Policy account.** A contract that restricts where funds can go and when. *(experimental)* See [Policy accounts](policy-accounts.md).

**Relayer.** A service that submits your signed sweep and pays gas, for a fee. It sees the sweep details.

**RPC provider.** The node service your app asks for chain data; it sees your IP and queries.

**Scan / scanner.** Downloading announcements and testing which are yours.

**Spending key.** The secret that moves funds. Never share it.

**Sweep.** Moving funds from a one-time address to a destination wallet.

**Timelock.** A mandatory wait before an action can run.

**View tag.** A one-byte hint in each announcement so scanners can skip most unrelated ones cheaply. It reduces work, not downloads, and hides nothing.

**Viewing key.** The secret that lets software find your payments. Cannot spend, but reveals your history. Never share it.

**Wrong-tag payment.** A payment whose announcement carries a bad view tag, so a tag-filtered scan misses it. The opt-in deep scan checks router announcements without that filter while retaining full address verification; direct announcements stay tag-filtered.
