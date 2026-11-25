# Interrupted payment verification on Pages

The wallet may have submitted a transaction even if the page loses its connection or the wallet response disappears. Check the wallet and the original hash before deciding what to do. Reconnecting or reloading never authorizes another payment.

| Evidence available to checkout | What the payer can rely on |
| --- | --- |
| Wallet prompt started, no hash returned | Outcome unknown. The same-tab attempt journal survives a reload. |
| Hash returned, RPC unavailable | The journal retains the returned hash. Verification is incomplete. |
| Receipt has a missing or different hash, or an invalid execution status | Verification stops. The original wallet hash remains in the journal. |
| Matching receipt, transaction unavailable for comparison with the preview | Unconfirmed in checkout, local receipt and proof QR, for either receipt status. |
| Transaction matches the preview, matching receipt reports success | Included in the reported block. Finality still depends on the chain. |
| Transaction matches the preview, matching receipt reports a revert | Reverted. |

A loaded tab can create a fixed-price invoice with authorized seller keys, render its QR and read a signed invoice locally. A fresh load needs the app assets. The Pages beta has no registered offline shell. The main-branch payer journal is tab-scoped. Other tabs, a closed tab and separate browser profiles are outside that journal's guarantee.

The receipt hash, execution-status and transaction-shape checks and fixtures are ported from #298 and #302 at `e22c1748a3de6eb02f5be3abe27d634b238c67c6`. This change additionally covers unmatched reverted receipts and a stale success receipt delivered on reconnect. The separate draft-recovery branch owns preservation and restoration of the unfinished seller form.
