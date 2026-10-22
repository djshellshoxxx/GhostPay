# Run a local scanner and RPC

Audience: sellers and operators who want the scanning path to leak as little as possible. Nothing here has been tested against a public network by the project.

## What leaks when scanning

Scanning means downloading every ERC-5564 announcement for a chain and testing each against your viewing key. The **viewing key never leaves your browser** (the scanner worker has no network access by design and the worker code is scanned for `fetch`/`WebSocket`/`XMLHttpRequest`). What the RPC provider can still learn:

- Your IP address and that you query the announcer's logs over a block range. View tags do not reduce the download.
- Balance, nonce and code reads for a one-time address when you sweep (audit D8): the provider learns "this IP cares about this address".
- Every transaction you broadcast, with its timing.
- If you use a relayer, the relayer separately sees owner, destination, amount and timing.

## Options, from weakest to strongest

1. **Public provider chosen in Settings.** Easy, rate limited (`eth_getLogs` caps vary; the app defaults to 1000-block windows, "conservative defaults, not provider-verified"). The provider sees everything above with your IP.
2. **Provider reached over Tor or a VPN.** Hides your IP from the provider, not your activity. Browser-level configuration; the app has no Tor mode (Feature 5 stage 1 is **not built**; SPEC_REVIEW previously said otherwise, corrected).
3. **Your own full node** (execution client, for example Geth/Erigon/Nethermind/Reth) on a machine you control, exposed to the browser over HTTPS or WSS on localhost or your LAN. Nobody else sees queries. You still need an archive-capable range for logs from your start block; a node that has pruned history cannot serve old logs.
4. **Your own node reached from outside through Tor onion service or a VPN** to sweep from untrusted networks.

Run the node for the chain you scan (Sepolia, Base Sepolia today). Do not point GhostPay at an RPC you do not trust with your browsing identity.

## Using your own RPC in the app

1. Settings > RPC endpoints: add `https://` or `wss://` URLs (plain `http://` and credentials in the URL are rejected). A local node needs a TLS front (for example Caddy with a local certificate) because the app only accepts https/wss and the page's CSP allows only `https:`/`wss:` connections.
2. The app calls `eth_chainId` on connect and rejects a wrong chain. Make sure CORS on your node/proxy allows the app origin (and only that origin).
3. Settings are stored in `localStorage` as plain text, including any API key inside the URL. Use a URL without secrets, or a key restricted to your IP.
4. Start block: block of your meta-address's first use. Resume from the checkpoint after the first scan.

## Make the scan cheaper

- Narrow the start block.
- Use a node/provider with a large `eth_getLogs` range; the app splits by the configured `getLogsMaxRange`.
- Scan on a schedule (the app does not scan in the background; the tab must be open).

## Verifying the node is honest

A provider can omit or invent logs (audit S3-14). The adapter has an unused two-provider comparison helper (`requestWithFallbackCheck`); using it in the scanner is **not built**. Mitigations today: run your own node, or cross-check an important payment's transaction on a second source, and always check the real balance of the one-time address before delivering goods ([Receive and scan](../user/receive-and-scan.md)).

## Operator note: relayer RPC

The relayer's RPC provider sees the relayer's `eth_call` simulations, which contain owner, destination, amounts and the signature. Run that RPC yourself or accept that the provider sees all of it ([relayer runbook](relayer-runbook.md)).
