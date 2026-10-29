# Troubleshooting by symptom

> Pre-audit, testnet only. Never post keys, seed phrases, keystores or full invoice links in public. Report vulnerabilities privately ([SECURITY.md](../../SECURITY.md)). A compact table is also in [docs/user/troubleshooting.md](../user/troubleshooting.md).

Not sure where in the flow you are? Check the map first.

![Stealth payment flow with numbered steps](../assets/diagrams/stealth-payment-flow.svg)

## "I cannot pay"

| You see | Cause | Do |
|---|---|---|
| "Payments disabled on this chain" | No deployment manifest for that chain (true everywhere today: nothing is deployed) | Nothing to fix; wait for a published testnet deployment |
| Invoice rejected: tampered, too large, invalid | Link cut off, edited, re-encoded by a messenger, or over 16 KiB | Ask the seller to resend as plain text |
| Signature invalid | Content changed after signing | Do not pay; request a new link |
| Invoice expired | Validity window passed | Request a new invoice |
| "No feed" on a fiat-priced invoice | No price feed configured | Ask for a token-priced invoice |
| No wallet found | None installed/unlocked | Install or unlock a browser wallet, reload. WalletConnect is not built |
| Wrong network | Wallet chain differs from invoice | Approve the switch; the app refuses if the wallet will not switch |
| "Wallet changed the transaction" or chain mismatch | Wallet or its RPC altered the call | Do not retry blindly; try another wallet or RPC; report if repeated |
| "Could not verify" after sending | No RPC set, or not yet seen | Set your RPC in Settings; check the hash on an explorer |
| Transaction reverted | Unsupported token (fee-on-transfer, rebasing, blacklisted), deadline, slippage | Do not retry unchanged; use a supported token |
| Every payment of one token fails | Fee recipient blocked by the token issuer or cannot receive ETH | Operator issue (audit D5); see the [deployment runbook](../operators/deployment-runbook.md) |

## "I cannot find a payment"

| You see | Cause | Do |
|---|---|---|
| Scan finds nothing | Start block too late, RPC range limits, wrong chain, or payer used a wrong view tag | Lower start block, try another RPC, check chain, ask for the tx hash. Deep scan is planned, not built |
| Scan slow or erroring | Public RPCs limit `eth_getLogs` ranges | Use another or your own RPC ([guide](../operators/local-scanner-and-rpc.md)) |
| A match shows but balance is zero | The match is a claim; anyone can post announcements | Check the one-time address balance; deliver nothing |
| Duplicate rows | Replayed announcements | Trust balances, not rows |

![Scanning with view tags, animated](../assets/animations/scanning-view-tags.svg)

## "I cannot sweep"

| You see | Cause | Do |
|---|---|---|
| Balance unknown | No RPC for that chain | Add one in Settings |
| Relayer path unavailable | No relayer URL, token lacks permit (for example USDT), or relayer does not list it | Use the direct path (needs native gas) or set a relayer |
| `fee_below_quote`, `quote_expired` | Stale or low fee | Request a fresh quote |
| `rate_limited_ip`, `breaker_open`, `budget_exhausted`, `queue_full` | Relayer limits or paused | Wait, try another relayer, or go direct |
| Worried about the link to your wallet | Sweeping reveals payer -> address -> destination | Read [Sweeping safely](sweeping-safely.md); use a fresh destination next time |

## "My keys or tags are gone"

| You see | Cause | Do |
|---|---|---|
| Keys disappeared | Keys live in memory only unless saved in the optional browser vault; reload forgets them, and the idle lock wipes keys that can be loaded again (imported from a keystore or as hex, downloaded as a keystore, or saved in the vault); for hex imported without its signing key, the signing key generated at the import is lost, and a notice says so | Import your encrypted keystore, unlock the browser vault, or enter your hex keys again (without a signing key, a new one is generated) |
| Keys still loaded after the idle time, with a "no backup" banner | No copy exists outside this tab (generated here, or their vault deleted in another tab or with the site data), so the idle lock keeps them | Download the encrypted keystore or save the vault again; until then invoices, the meta-address and registry publishing need the typed waiver, and wiping asks first |
| Keystore will not import | Wrong passphrase or not a GhostPay keystore | No recovery exists; try passphrases you used |
| Forgot the vault passphrase, still have the keystore | Keys loaded with that vault keep its passphrase as the sweep and export step-up | Wipe keys from memory, delete the vault while no keys are loaded (no passphrase asked; check it shows your keystore's meta-address), import the keystore again |
| Tags gone | Site data cleared or vault wiped; tags are local only | Restore an encrypted tag archive (Seller keys) if you downloaded one; otherwise no recovery |
| Tags locked | Idle lock from Settings, or the seller keys were wiped or changed | Unlock with loaded keys |

## Still stuck

Collect: what you did, the exact message, the chain and the transaction hash (not keys, not the invoice link). See the [FAQ](faq.md) and [Glossary](glossary.md).
