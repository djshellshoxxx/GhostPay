# GhostPay privacy payment beta: product proposal

**Status:** the owner-approved feature stops are binding under [the stop-work directive](../ai/STOP_WORK_20261125.md). The product positioning, prioritization and acceptance conditions below are recommendations for owner review; this document does not authorize new feature implementation, activate a future module, change existing recovery obligations, or approve publication.

Assessment: 2026-11-25. Inspected main: `595a184b381980a440165832f51a83e8dfd3e8a8`. Source review only: no build, network capture, live payment or privacy audit was performed by this analyst. Recommendations below are proposed release gates, not claims they already pass.

## Product conclusion

Recommended beta promise:

> Receive crypto payments at a fresh address for every payment, keep invoice details off the blockchain, and control your keys and local records. GhostPay reduces exposure of your usual receiving wallet. The payer, amount, timing and later transfers remain public on the blockchain.

**Current GhostPay mainly protects recipient address separation. It does not give a payer anonymity from the payee or public chain observers.** If the intended benefit is “pay from my normal wallet without the merchant seeing that wallet and its history,” current transparent EVM settlement does not deliver it. Adding privacy settings or cutting product modules does not close that gap.

“Privacy payment platform” can describe the product direction, with an explicit protection claim for every flow. Do not market this beta as anonymous, untraceable, hidden-amount or unlinked payments. A storefront, POS, team service, identity product, fiat conversion and off-ramp integration are not prerequisites for the narrower, useful promise above.

## Current protection and its boundaries

| Boundary | Current source evidence | What remains exposed |
|---|---|---|
| Recipient address | The EVM adapter derives a stealth payment when building each transaction. The router ABI does not include the seller's stable meta-address, invoice contents, invoice nonce or invoice signer. | The payer knows the one-time address they paid. Direct sweeps and gas-funding transfers can connect it to a known wallet; consolidation links receipts together. |
| Payer and amount | Core static client needs no GhostPay account/server or telemetry. Invoice contents need not be sent to GhostPay. | Wallet transaction origin, asset, amount, fees and timing are public. Router announcements expose the one-time address, ephemeral key, view tag and asset/net amount metadata. |
| RPC | Announcement matching happens locally and the broad log filter need not contain the viewing key or recipient address. | Matched EVM transactions trigger `eth_getTransactionReceipt` and `eth_getTransactionByHash`. RPC operators can infer which announcements matched. Balance/sweep requests and the client connection are visible. A second RPC is an integrity cross-check that shares queries with another operator. |
| Invoice envelope | The URL fragment is not part of the normal HTTP request to the static host. Optional separate-passphrase mode can withhold the decryption secret from someone who only obtains the URL. | An ordinary encrypted URL includes its decrypting material: **any holder of that complete link can read the invoice**. It is a bearer secret, not confidential to its holder. History, clipboard, screenshots, extensions and sharing channels can retain it. Invoices include stable meta-address and signing public key, so holders of multiple invoices can correlate them. |
| Local records | Keystores, notes and reconciliation records have encryption paths. | Unlocked page contents are available to a compromised page/device. Settings, storage metadata and the durable payment-attempt journal are not all encrypted. Locking is not deletion. |
| Registry | A payment link can carry the meta-address without a lookup or registration. | Optional publication links the registrant wallet to the meta-address permanently in chain history. Registration should not become required beta onboarding. |

**Primary repository evidence:** [adapter](https://github.com/djshellshoxxx/GhostPay/blob/595a184b381980a440165832f51a83e8dfd3e8a8/packages/chain-adapters/src/adapter.ts), [router](https://github.com/djshellshoxxx/GhostPay/blob/595a184b381980a440165832f51a83e8dfd3e8a8/packages/contracts/src/GhostPayRouter.sol), [matched-payment reads](https://github.com/djshellshoxxx/GhostPay/blob/595a184b381980a440165832f51a83e8dfd3e8a8/packages/chain-adapters/src/payments.ts), [invoice creation](https://github.com/djshellshoxxx/GhostPay/blob/595a184b381980a440165832f51a83e8dfd3e8a8/apps/web/src/lib/invoiceCreate.ts), [privacy limits](https://github.com/djshellshoxxx/GhostPay/blob/595a184b381980a440165832f51a83e8dfd3e8a8/docs/user/privacy-limits.md).

**Primary standards:** [ERC-5564](https://eips.ethereum.org/EIPS/eip-5564) defines recipient accounts derived from public receiving keys and public announcements. Its viewing key identifies incoming funds and its spending key controls them. The sender knows the recipient of their own payment. The standard does not establish hidden sender identities or amounts. [ERC-6538](https://eips.ethereum.org/EIPS/eip-6538) makes an entity's registered meta-address publicly retrievable. This explains why fresh receiving addresses and optional public registration are distinct privacy decisions.

**Documentation caution:** the existing matrix/threat model has stale line numbers and some outdated statuses. Current `Sweep.tsx` asks for balance consent only when the configured private path forbids a direct request; ordinary mode still reads automatically on selection. View tags are a scanning optimization, not a privacy guarantee. Router-announcement counts measure activity, not a quantified anonymity set. The page cannot guarantee that a wallet extension uses the page's chosen RPC or Tor path.

## Reasons to use the beta

These are product hypotheses, not validated customer demand:

1. **Receive without handing every payer your usual wallet.** An individual or independent service provider can request payment without publishing the address holding unrelated funds. Later transfers can undo this separation, so the sweep experience is part of the privacy product.
2. **Keep unnecessary invoice details out of public settlement.** A signed payment request needs amount, asset, expiry and recipient authenticity, not a storefront account, public profile or itemized personal history. Optional descriptions should stay optional. Encrypt the envelope where useful, describe link-holder access accurately, and support a separate passphrase for stronger sharing confidentiality.
3. **Pay without another project account or project-held customer history.** This protects application/invoice metadata from GhostPay. It does not conceal the payer wallet from the recipient or blockchain.
4. **Retain control and recovery.** Local records, verified backups and truthful payment state let a person reduce disclosure without depending on one browser's surviving storage to retain access to funds.

The first cohort should be people who already hold crypto and want recipient separation and restrained data collection. Serving fiat newcomers would reintroduce conversion and off-ramp work the owner explicitly stopped. Direct person-to-person crypto payment requests are distinct from the stopped P2P fiat off-ramp integration.

## Six retained launch gates

| Gate | Proposed measurable acceptance | Candidate work / current gap |
|---|---|---|
| **1. One complete qualified receiving route** | Specify one chain/asset route and qualify create → pay → detect → recover → spend. Independently prepared payments derive fresh receiving addresses; no stable seller ID or invoice text reaches router metadata. Prefer native coin if it is the only completely qualified sweep path. Use fixed crypto amounts to avoid fiat conversion dependency. | Current stealth/router core provides the mechanism. Exact release-candidate end-to-end evidence is still needed. |
| **2. Minimal request and honest envelope claims** | Valid signed requests work without optional item descriptions/personal data. The user sees that a complete ordinary encrypted link grants access; a separate passphrase is available when confidentiality from a link-only holder is needed. Fragment clearing and sensitive-sharing behavior are verified without claiming historical erasure. | #585/#600 minimal invoice work is a narrow candidate. Current invoices have stable meta-address/signer correlation. No GhostID or new per-client identity service is required. |
| **3. Deliberate provider disclosure** | Merely opening a Sweep item causes no address-specific balance request. A clear action authorizes that read and describes what the RPC learns. Privacy-path choices never silently fall back to direct access. Sanitized traffic evidence covers every follow-up query, not only the broad scan. | #649 is a high-value candidate: inspected head `e88377a4f448b5dd7300b6b9f905fa4f9aa811f0` adds explicit ordinary-mode balance request. Main only requires it for certain privacy settings. Resolve branch qualification gaps before relying on it. |
| **4. Safe local presentation and spending** | Lock/account/vault changes revoke signing and remove sensitive presentation. If masking is offered, it covers hidden/accessibility DOM too. Sweep review explains source/destination/amount linkage and warns for locally known reused destinations without additional probing. | Account cleanup #598→#612→#645/#652, masking #569/#613, local reuse #586/#610 and exact wallet disclosure #589/#606 are relevant candidate slices. Optional clipboard cleanup must never overwrite newer clipboard content. |
| **5. Truthful payment state and recoverable keys** | Timeouts remain unknown/pending; chain-bound evidence is required for verified payment. Restart/account change cannot cause duplicate payment or stale signing. Validate backup, export/import and fresh-browser recovery without device sync. Never delete sole-copy keys or uncertain attempts for privacy housekeeping. | #635 reconciliation, #622 export/master recovery and #647 independent recovery remain relevant. Spec 18 currently makes bulk/master/fresh-browser recovery normative; declaring all archive export optional would require an explicit scope amendment. |
| **6. Qualified release with correct claims** | The actual emitted beta excludes stopped modules and telemetry; required static/runtime checks pass; supported browser engines are exercised. Privacy notices match observed endpoint/method/parameter classes and current behavior. Release and recovery assets are verifiable, with an accurately disclosed audit/testnet status. | #588/#597 browser qualification, privacy-safe diagnostics #570/#619 and existing release/manifest work matter. A package checklist marked 100% is not end-to-end privacy qualification. |

These are six outcomes, not a mandate to merge every referenced branch. Review narrow core slices and resolve broad inherited stacks. Provider consent, request minimization, state cleanup and recovery are bounded work in existing flows. Do not make beta wait for a general privacy orchestration engine.

## Stop list and preserved shared core

Enact the owner's stops for F01 GhostTips, F02 GhostStore, F04 merchant dashboard, F08 GhostID, F09 GhostPOS, F11 GhostTeams, F12 GhostBridge/P2P-Offramp integration, F13 fiat conversion and P07 device synchronization. Preserve prior F14 multi-chain-routing stop. Preserve branches/history and keep already integrated code dormant/disabled.

**P07 synchronization is not ordinary encrypted backup/import; F07 GhostPayouts is a different identifier.** Local keys, generic signed payment requests and local receipts are shared core even where merchant code also consumes them. Do not delete that core or disable recovery as an indirect consequence of the scope cut. Standalone P2P-Offramp is outside the F12 integration stop.

**Additional recommendation, not an owner order:** defer recurring/subscription billing, payouts, extra chains, advanced privacy profiles, pipeline choreography, optional indexer service, pools and confidential settlement from beta. Retain their work. Product identity as a privacy platform does not authorize automatic activation.

## Why advanced privacy work is not a shortcut

- [Privacy profiles on main](https://github.com/djshellshoxxx/GhostPay/blob/595a184b381980a440165832f51a83e8dfd3e8a8/packages/privacy-profiles/README.md) is a library with no app wiring or network effect. [#644 completion](https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/COMPLETION.md) explicitly means 100% of a package checklist; its app layer was not started.
- [Privacy pipeline](https://github.com/djshellshoxxx/GhostPay/blob/595a184b381980a440165832f51a83e8dfd3e8a8/packages/privacy-pipeline/README.md) has deterministic fake drivers, not real method drivers. Ordering extra steps does not establish privacy, and public hops/delays do not erase transaction links.
- [Confidential amounts deviations](https://github.com/djshellshoxxx/GhostPay/blob/595a184b381980a440165832f51a83e8dfd3e8a8/packages/confidential-amounts/DEVIATIONS.md) records mock-only evidence, unpinned deployments and unqualified runtime integration. [#642 gate](https://github.com/djshellshoxxx/GhostPay/blob/8eb9a1c2a6d17c63cc9e57cbffd10b4bfb8780de/packages/confidential-amounts/src/future/p13/gate.ts) refuses every settlement operation in every configuration. Only local cleartext fixture preparation/review can be enabled. This is research preserved for later, not hidden-amount payments waiting for a switch.

## Owner decision after the stop

**Recommended earliest beta:** recipient wallet separation, minimal encrypted request envelopes with honest sharing limits, local custody, explicit provider exposure and dependable recovery.

If **payer identity or amount confidentiality** is mandatory for the first release, declare that a separate settlement milestone. Select and qualify one protocol/route against actual entry/exit linkability, operator visibility, custody, gas, recovery, deployed behavior and independent review before making that promise. Hiding amount alone does not hide sender identity; they need separate evidence. This is a future product decision, not authorization to implement any stopped module.
