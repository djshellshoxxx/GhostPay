# Technology and attribution

GhostPay uses upstream software and published standards. Attribution does not imply endorsement, an audit of
GhostPay or qualified deployment. GhostPay's root/package metadata is currently `UNLICENSED`; third-party
license grants remain separate. See the [third-party register](../../THIRD_PARTY.md) and exact
[lockfile](../../package-lock.json) for the wider dependency inventory.

## Libraries used by the current web product

Versions, package authors, repository URLs and licenses below were checked against installed package metadata
from the current lockfile on 2026-11-09. Copyright labels come from installed license text; they do not imply
that one person wrote an entire project. Preserve upstream license notices when distributing.

| Project / installed version | Attribution basis | License | GhostPay use and official source |
| --- | --- | --- | --- |
| qrcode-generator 2.0.4 | Package author: Kazuhiko Arase | MIT | Offline QR generation; [source](https://github.com/kazuhikoarase/qrcode-generator) |
| jsQR 1.4.0 | Cosmo Wolfe and contributors; package metadata lists Cosmo Wolfe and Jefff Nelson | Apache-2.0 | QR decoding fallback; [source](https://github.com/cozmo/jsQR) |
| @noble/curves 2.4.0 | Package author: Paul Miller | MIT | Elliptic-curve operations; [source](https://github.com/paulmillr/noble-curves) |
| @noble/hashes 2.4.0 | Package author: Paul Miller | MIT | Hash functions and derivation primitives; [source](https://github.com/paulmillr/noble-hashes) |
| @scure/base 1.2.6 | Package author: Paul Miller | MIT | Binary/text encodings; [source](https://github.com/paulmillr/scure-base) |
| viem 2.57.13 | wevm project; installed license copyright: weth, LLC | MIT | EVM utilities; [official site](https://viem.sh/), [source](https://github.com/wevm/viem) |
| React 19.3.1 | React project; installed license copyright: Meta Platforms, Inc. and affiliates | MIT | Web interface; [official site](https://react.dev/), [source](https://github.com/react/react) |

Web dependencies are in [apps/web/package.json](../../apps/web/package.json); camera dependencies are also in
[packages/qr-exchange/package.json](../../packages/qr-exchange/package.json). These selected rows are not a complete
transitive software bill of materials. Nested versions may differ. The broader third-party register contains
historical snapshots; use the lockfile and emitted-module evidence for an exact build.

## Protocols and standards

Author lists come from the linked official documents, checked on 2026-11-09. The standards describe mechanisms;
they do not assert that GhostPay's implementation or public deployment is complete.

| Standard | Authors credited by the document | Relationship to GhostPay |
| --- | --- | --- |
| [ERC-5564: Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564) | Toni Wahrstätter, Matt Solomon, Ben DiFrancesco, Vitalik Buterin | Scheme-1 EVM addressing and announcements; specification uses CC0 |
| [ERC-6538: Stealth Meta-Address Registry](https://eips.ethereum.org/EIPS/eip-6538) | Matt Solomon, Toni Wahrstätter, Ben DiFrancesco, Vitalik Buterin, Gary Ghayrat | Public registration; publication is a separate wallet action; specification uses CC0 |
| [ERC-4337: Account Abstraction Using Alt Mempool](https://eips.ethereum.org/EIPS/eip-4337) | Vitalik Buterin, Yoav Weiss, Dror Tirosh, Shahaf Nacson, Alex Forshtat, Kristof Gazso, Tjaden Hess | Separate sponsor/account-abstraction work, not qualified production account abstraction for ordinary invoices; specification uses CC0 |
| [BIP-352: Silent Payments](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki) | josibake, Ruben Somsen, Sebastian Falbesoner | Experimental Bitcoin Silent Payments flow; specification uses BSD-2-Clause |

Related primary references: [Bitcoin](https://bitcoin.org/), [Ethereum](https://ethereum.org/),
[ERC-20](https://eips.ethereum.org/EIPS/eip-20), [EIP-712 typed data](https://eips.ethereum.org/EIPS/eip-712),
and [ERC-2612 permit](https://eips.ethereum.org/EIPS/eip-2612). Supported chains/assets must still be established
from GhostPay's reviewed configuration and deployment checks, not from a standards link.

## Privacy and recovery references

Separate privacy-network, external-pool, account-abstraction and policy modules do not make all ordinary payments
anonymous. The [policy gates](../adr/ADR-0027-policy-end-to-end-gates.md) and
[external fixture runbook](../operators/external-integration-fixtures.md) describe those boundaries.

GhostPay is not an OpenTimestamps client and this web product has no calendar-server selection or notarization
certificate workflow. Seller receipts are signed-field attestations; payment verification is separate. See the
[product guide](product-guide.md) and [receipt archive guide](reconciliation-and-receipts.md).

## Rechecking attribution

After dependency updates, inspect installed `package.json` version, author/contributors, repository and license
fields and the actual license file. Reconcile with the lockfile. Do not infer authorship from a repository owner
or reuse old versions without checking. For standards, use official author/copyright sections and record the date.
