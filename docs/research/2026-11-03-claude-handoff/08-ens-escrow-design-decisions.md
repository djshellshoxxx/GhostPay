# Deferred ENS and milestone escrow: source reuse and design decisions

Research date: **2026-11-03 America/Vancouver / 2026-11-04 UTC**. GhostPay baseline: PR #47 `f8193502e602c99bb24ff956f142671750b744a0`. Source inspection only; no resolver queries, contract execution, upstream tests, or deployment.

These features remain outside the [lean release scope][GP1]. This note closes concrete holes in the older [ENS][OLD1] and [milestone escrow][OLD2] reuse reports without turning a source shortlist into an implementation mandate.

## 1. ENS: reuse the normalization already in the dependency graph

GhostPay's inspected [package-lock.json][GP2] already resolves `@adraffy/ens-normalize@1.11.1`; its third-party table identifies it as transitive through the existing viem ecosystem. The absence of a dedicated `packages/ens` package does not mean there is no usable normalization implementation.

### ENS-01 — ens-normalize

**Verified source pin:** `adraffy/ens-normalize.js@1c641e39a399ab2a944b5a490db33fce36e6c07a`.

- [LICENSE][N1]: MIT.
- [package.json][N2]: source version 1.11.1, no runtime dependency list, ESM and CommonJS distribution exports.
- [test/README.md][N3]: identifies ENSIP-15 and Unicode normalization suites.
- [validate/tests.json][N4] and [validate/custom-tests.json][N5]: fixture paths verified in the source tree; datasets not executed or independently audited.

The official [ENSIP-15][S1] defines ENS normalization, including its Unicode data/versioning model. Prefer the existing viem-facing normalization seam or an explicit direct dependency if GhostPay imports the package itself. Do not rely on accidental npm hoisting, copy generated Unicode tables by hand, or use generic NFC/text sanitization as an ENS normalizer.

**Fit:** a future resolver boundary and its input/display tests. Keep canonical name, resolved chain/address, and accepted payment intent separate. A normalized name is not proof that it belongs to the intended merchant.

**Artifact limit:** the matching source version string and existing npm lock entry do not prove that the checked-out upstream commit produced that registry tarball. Record the actual adopted artifact and integrity when the feature is implemented.

### ENS-02 — ENSjs: reference selected APIs, avoid importing the whole monorepo

**Verified source pin:** `ensdomains/ensjs@52d7785f4b4558e965f4e22e9635b57ba72ef970`; root [LICENSE][E1] is MIT.

Inspected exact files:

- [`packages/ensjs/src/utils/name/normalize.ts`][E2] wraps `ens_normalize`.
- [`packages/ensjs/src/utils/normalizeCoinId.ts`][E3] selects address encoders for coin names or types.
- [`packages/ensjs/src/utils/resolver/getAddress.ts`][E4] distinguishes the legacy Ethereum address accessor from multicoin lookup and marks some old API types deprecated.
- [`packages/ensjs/src/utils/ccipRequest.ts`][E5] and [`packages/ensjs/src/actions/public/ccip.test.ts`][E6]: exact source/test paths located, not runtime-qualified here.

Use this as reference material for result decoding and interface selection. The current source contains both legacy and newer resolver APIs, so do not adopt a path simply because it appeared in the old report.

The official [ENSIP-11][S2] specifies the EVM coin-type mapping and exceptions. Ethereum's conventional coin type 60 and the chain-derived namespace must be handled explicitly; a chain ID, SLIP-44 coin type, and encoded address type are not interchangeable. Verify allowed numeric ranges before applying JavaScript bitwise operations. Prefer current encoder/spec fixtures over a handwritten universal rule.

### Privacy and identity requirements for any resolver integration

[ERC-3668][S3] expressly identifies the privacy implications of offchain HTTP retrieval and provides client policy hooks. Consequently, a GhostPay resolver should use the same explicit transport/egress policy as the rest of the application. The acceptance plan should account for all gateway requests, endpoint changes, caching, retries, and user cancellation. Successful cryptographic validation of an offchain response does not hide the query from its gateway.

Suggested task **ENS-A**: write a small resolver contract/interface specification before adding network behavior. It should state:

1. Which record represents a normal payment address and which, if any, represents GhostPay's stealth meta-address or invoice-signing identity.
2. How normalized input, resolved address, chain, resolver provenance, and expiration are presented and bound to the reviewed transaction.
3. Which offchain requests are permitted and how refusal or unavailable transport is surfaced.
4. Whether a previously pinned merchant signer may change, and what independent confirmation that change requires.
5. Which upstream normalization/address-decoding fixtures are used and which real-browser checks remain unrun.

The old recommendation to build a gateway is optional, not a prerequisite for consuming ENS records. A new signing service would add operational trust and key management; add one only for a concrete record-hosting requirement.

## 2. Escrow: reconcile the contract brief before selecting an implementation

GhostPay's [specification 17][GP3] remains a design brief. It specifies per-stage minimal escrow clones, no admin, no delegatecall, predetermined arbitration authority, and a bounded state machine. The earlier reuse note proposes an admin-only pause path and a different aggregated milestone structure. Those are substantive design changes, not implementation details.

### ESCROW-01 — Existing OpenZeppelin primitives

The inspected vendored package [manifest][GP4] reports **5.6.1**. Relevant existing files include [`Clones.sol`][GP5], [`SafeERC20.sol`][GP6], [`EIP712.sol`][GP7], and [`Nonces.sol`][GP8]. These are available in the current source tree; a second cryptographic or token-transfer framework is unnecessary merely to start a design.

The inspected `Clones.sol` carries an MIT SPDX header and references [ERC-1167][S4]. ERC-1167 explicitly delegates calls to a fixed implementation. Therefore **“minimal clones” and an absolute “no delegatecall” requirement conflict**. Clarify whether the intention is to prohibit arbitrary/upgradable delegation while allowing an immutable clone, or to require independent bytecode deployments. Record the decision before writing a factory.

The third-party table's statement that this vendored tree includes `LICENSE-MIT` and `LICENSE-APACHE` did not match this checkout: a tracked-file listing found neither named file. That is a narrow provenance/documentation discrepancy. A passing generated-table check does not verify the presence of every cited license text or equality with an upstream release. See the [release/provenance report](03-hosting-release-provenance.md) for the follow-up.

**Reuse recommendation:** retain the existing reviewed dependency seam after provenance verification. Do not copy an old removed `Escrow.sol` from another OpenZeppelin major version or add an administrator solely because a reference project has one.

### ESCROW-02 — Kleros escrow-v2: updated license evidence, different policy model

**Inspected source pin:** `kleros/escrow-v2@128415d8725e7525be49ab642055c7703935a600`.

The fetched [`contracts/src/EscrowUniversal.sol`][K1] declares **MIT** in its SPDX header; [`contracts/package.json`][K2] also declares MIT and depends on Kleros v2 contracts and OpenZeppelin. This improves the old report's incomplete license evidence. It does not establish the terms or provenance of every file/dependency in the monorepo.

The inspected contract has a governor, mutable arbitrator configuration, token caps, and explicit arbitration/settlement timeouts. Its source is useful for studying dispute and settlement state separation. Those policies differ from GhostPay's no-admin, fixed-at-creation arbitration brief. The source header's reviewer/auditor fields are empty; this research did not establish an independent audit covering the inspected revision.

**Reuse recommendation:** state-machine comparison and requirements reference only for now. Do not drop the contract into GhostPay or assume it implements the desired per-stage privacy model. The source tree also contains [`contracts/test/EscrowUniversal.t.sol`][K3]; that test location was verified, but its suite was not run.

### Concrete next decision: ESCROW-A

Produce a short ADR and transition table that resolve deployment form, initialization ownership, stage funding, exact signature domain, cancellation deadlines, immutable dispute authority, partial payout accounting, token behavior, and chain-reorganization handling. It must make clear which participant may cause each transition and where the funds may go.

Acceptance should derive from that table and the fixed policy: funds conservation, terminal-state behavior, repeated authorized requests, expiry boundaries, and consistent evidence after interrupted submission. A general-purpose arbitration framework is not a substitute for these decisions. Keep escrow outside the core artifact and preserve the current project's separate scope gate.

## 3. Decisions not made by this research

No ENS endpoint, offchain gateway, signer, escrow arbitrator, new token, or deployment has been selected. Sablier and other streaming systems were not requalified here: their exact version, per-file license, and product semantics would require fresh review before any adoption. The older blanket conclusions about mixed licenses should not be carried forward as if they apply to every future release.

## Sources

[GP1]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/handoffs/LEAN_RELEASE_SCOPE.md
[GP2]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/package-lock.json
[GP3]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/specs/17-milestone-escrow.md
[GP4]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/contracts/lib/openzeppelin-contracts/package.json
[GP5]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/contracts/lib/openzeppelin-contracts/contracts/proxy/Clones.sol
[GP6]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/contracts/lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol
[GP7]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/contracts/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol
[GP8]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/contracts/lib/openzeppelin-contracts/contracts/utils/Nonces.sol
[OLD1]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/research/reuse/ens.md
[OLD2]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/research/reuse/milestone-escrow.md
[N1]: https://github.com/adraffy/ens-normalize.js/blob/1c641e39a399ab2a944b5a490db33fce36e6c07a/LICENSE
[N2]: https://github.com/adraffy/ens-normalize.js/blob/1c641e39a399ab2a944b5a490db33fce36e6c07a/package.json
[N3]: https://github.com/adraffy/ens-normalize.js/blob/1c641e39a399ab2a944b5a490db33fce36e6c07a/test/README.md
[N4]: https://github.com/adraffy/ens-normalize.js/blob/1c641e39a399ab2a944b5a490db33fce36e6c07a/validate/tests.json
[N5]: https://github.com/adraffy/ens-normalize.js/blob/1c641e39a399ab2a944b5a490db33fce36e6c07a/validate/custom-tests.json
[E1]: https://github.com/ensdomains/ensjs/blob/52d7785f4b4558e965f4e22e9635b57ba72ef970/LICENSE
[E2]: https://github.com/ensdomains/ensjs/blob/52d7785f4b4558e965f4e22e9635b57ba72ef970/packages/ensjs/src/utils/name/normalize.ts
[E3]: https://github.com/ensdomains/ensjs/blob/52d7785f4b4558e965f4e22e9635b57ba72ef970/packages/ensjs/src/utils/normalizeCoinId.ts
[E4]: https://github.com/ensdomains/ensjs/blob/52d7785f4b4558e965f4e22e9635b57ba72ef970/packages/ensjs/src/utils/resolver/getAddress.ts
[E5]: https://github.com/ensdomains/ensjs/blob/52d7785f4b4558e965f4e22e9635b57ba72ef970/packages/ensjs/src/utils/ccipRequest.ts
[E6]: https://github.com/ensdomains/ensjs/blob/52d7785f4b4558e965f4e22e9635b57ba72ef970/packages/ensjs/src/actions/public/ccip.test.ts
[K1]: https://github.com/kleros/escrow-v2/blob/128415d8725e7525be49ab642055c7703935a600/contracts/src/EscrowUniversal.sol
[K2]: https://github.com/kleros/escrow-v2/blob/128415d8725e7525be49ab642055c7703935a600/contracts/package.json
[K3]: https://github.com/kleros/escrow-v2/blob/128415d8725e7525be49ab642055c7703935a600/contracts/test/EscrowUniversal.t.sol
[S1]: https://docs.ens.domains/ensip/15/
[S2]: https://docs.ens.domains/ensip/11/
[S3]: https://eips.ethereum.org/EIPS/eip-3668
[S4]: https://eips.ethereum.org/EIPS/eip-1167
