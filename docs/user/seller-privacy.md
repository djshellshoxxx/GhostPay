# Seller privacy: scanning, spam and the privacy set

GhostPay gives each payment a one-time address. Finding those payments means reading a public announcement log that
anyone can write to, and reading it through an RPC provider that sees what you ask for. This guide explains, in plain
language, what the scanner shows you about that, what it cannot promise, and what you can do on your side. It does not
claim anonymity or unlinkability: see [Privacy limits](privacy-limits.md) for the observer table.

## The privacy set banner

After a scan the Receive page shows a notice such as "Privacy set: low (3 GhostPay router announcements in about the
last 7 days, 9 in about 30 days)". The number is the count of announcements posted through the GhostPay router on that
chain, in the blocks this device scanned. It is a rough measure of how many other payments yours could be confused with.

- **low**: fewer than 20 router announcements in about the last 7 days.
- **medium**: 20 to 199.
- **high**: 200 or more.

The thresholds are product heuristics, not a measurement of anonymity. The copy says what shrinks the real set: payments
that share your view-tag bucket (one byte of each announcement is public, so only about one in 256 announcements looks
like yours to a scanner), unusual amounts and unusual timing. "Counted over only the blocks scanned this time" means
the scan stopped before the chain head (a budget or a limit), so the real number may be higher.

The estimate is computed on this device from the public logs you already downloaded. It is never sent anywhere.

### Optional: same-token estimate

Settings > Scan privacy has an off-by-default option, "Estimate same-token transfers for the privacy set". When it is
on, each scan ends by asking your scan RPC for the recent `Transfer` logs of the token you were last paid in, over a
fixed window of 2000 blocks, and counting those at a similar amount (within 25%). The request names no sender and no
recipient, so it does not reveal any address of yours; it does tell the provider which token you care about and that
you asked right after scanning. The result is labelled as an estimate, never changes the level, and shows "unknown"
whenever the provider refused, the window held too many transfers, or no token payment of yours was found to compare.

## Lanes and the budget

The announcement log is permissionless, so anyone can flood it. The scanner does not drop anything; it orders the work.

- **Trusted lane.** Announcements posted by the GhostPay router named in the verified deployment manifest are checked
  first and are never deferred.
- **Open lane.** Everything else (direct announcements, replays, spam) is checked after the trusted lane, up to a
  per-scan budget (Settings: "Non-router announcements per scan", default 20,000). Beyond the budget the rest is
  deferred: the scan stops before that page, keeps its position, and the notice "N announcements ... were deferred by the
  per-scan budget" tells you to scan again. Nothing is skipped; the next scan continues from the held block.
- **Local spam score.** Inside the open lane, announcements that look like spam (a repeated ephemeral key, one caller
  posting more than the flood threshold in one block, metadata that does not match the GhostPay pattern) are checked
  last, never skipped. The threshold (default 32 per caller per block) and the score itself can be changed or switched
  off in Settings.
- **Replays cost nothing extra.** A copy of an announcement you already checked is recognised and does not repeat the
  curve work, so copy-paste floods slow a scan far less than floods of fresh keys.

A direct payment (not through the router) that an attacker tries to bury in spam is still found: it is in the open lane
and the budget only defers it to a later scan. If an invoice expects a payment that has not appeared, scan again until
the backlog notice disappears.

## Funding and amount hygiene

- **Never fund a one-time address from a wallet that identifies you.** Sending gas to a one-time address from your
  usual wallet links the two on-chain. Use the gas buffer the payer can add, or a relayer, as described in
  [Sweep funds and gas privacy](sweep-and-gas-privacy.md).
- **The sweep destination is a link.** Moving funds from several one-time addresses into one wallet ties those payments
  together, and to that wallet. Sweep to fresh destinations when the link matters, and not all at once.
- **Amounts are public.** A unique amount (for example 123.45 of a token nobody else moves at that size) makes a payment
  recognisable regardless of the one-time address. Prefer round amounts on invoices where you can; payers should avoid
  unique amounts and keep the optional delay on. The scanner's same-token estimate (above) exists so you can see how
  unusual your amounts are on the chain you use.
- **Timing is public.** A payment that lands seconds after an invoice link was opened, or always at the same time of
  day, is easier to match. The payer-side delay adds friction only, not cover traffic.

## What the scanner reveals to the RPC provider

The scan RPC (and a second RPC, if you configured one for cross-checking) learns:

- your IP address, unless you reach it through a path you control (see the scan transport options in Settings);
- that you read GhostPay announcements, the block ranges you asked for, and when; fixed windows make the ranges coarser
  but still show roughly how far you have scanned;
- the receipts and token transfer lookups used to verify a router payment that matched, which can reveal which public
  announcement is yours;
- with the same-token estimate on, which token you were last paid in (not any address of yours).

The Receive page lists this under "What each party learns with your scan privacy settings" for the options you chose.
The viewing key never leaves the scanner worker and is never sent to a provider.

## Rate-limited public endpoints

Public RPC endpoints rate-limit `eth_getLogs` and refuse large ranges or large results. The scanner halves its block
window when a provider refuses, re-reads a block that is too large for one response for the router lane only (and tells
you which blocks were narrowed), and treats a `-32005` refusal as a possible rate limit before deciding a block is too
large. A sustained flood can make a public endpoint refuse until you retry later; the scan then stops at that block and
resumes from it. GhostPay does not ship a list of endpoints: use a provider you trust or your own node, and expect a
free public endpoint to be the slowest and least private option.

## Related

- [Receive and scan](receive-and-scan.md): how to run a scan and what the notices mean.
- [Sweep funds and gas privacy](sweep-and-gas-privacy.md): what moving the funds reveals.
- [Privacy limits](privacy-limits.md): the full observer table.
