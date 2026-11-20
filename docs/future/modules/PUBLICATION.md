# Future module specification publication record

**Completed: 40 feature branches, each with a detailed modular specification.** The separate `docs/ghostpay-future-module-specs-20261119` review branch collects the same 40 specification blobs in one place, with shared contracts, source traceability and machine-readable manifests.

Prepared 2026-11-19 (America/Los_Angeles). Verification timestamps are recorded in UTC in [PUBLICATION.json](PUBLICATION.json). This is a documentation delivery. It does not mark any proposed feature implemented or qualified.

## Review entry points

- [Full catalog and branch index](README.md)
- [Shared contracts and architecture constraints](COMMON.md)
- [Source reconciliation and architecture aliases](SOURCES.md)
- [Module/dependency manifest](modules.json)
- [Exact branch heads and specification blob hashes](PUBLICATION.json)
- [Static documentation validation details](VALIDATION.json)

## Pinned baseline and publication method

Source base: [c977b5d6723f6822c3b5d86cd6b231712c53c395](https://github.com/djshellshoxxx/GhostPay/commit/c977b5d6723f6822c3b5d86cd6b231712c53c395).
Source root tree: `2634456ffa35681e799f71b72bb907f946a77618`.
Shared documentation foundation: [524aa18bdcd307a3129bbb7a6b7e74838819331e](https://github.com/djshellshoxxx/GhostPay/commit/524aa18bdcd307a3129bbb7a6b7e74838819331e).

Each feature branch starts from that inspected application baseline plus the common documentation foundation, records its ownership claim before specification publication, and adds only its own module document. F01 and F02 also carry the additive common-map correction for the later-discovered F03 implementation lane. Remote reads confirmed the resulting application sources are unchanged from the source base. The index imports the exact already-verified specification blobs by Git object identity.

The reviewed baseline is deliberately pinned. Newer main and active work must be inspected before implementation; these documents do not assert that later features or fixes are absent.

## Delivered scope

| Category | Modules | Count |
|---|---|---:|
| Product workflows | F01–F18 | 18 |
| Privacy providers, research and optional service | P01–P19 | 19 |
| Transfer workflows | T01, T02 | 2 |
| Shared fee policy | FEE01 | 1 |
| **Total** | | **40** |

The 18 product documents, privacy suite and P19 owner addendum, and issue #288 transfer proposals are all represented. Architecture 5a–5l are mapped to canonical owners rather than duplicated as competing APIs. 5k / requirement 3q remains existing spec 18 and retains its beta priority. Issue #287's current v1.1 requirements remain independently deliverable.

Product workflows consume reusable provider contracts. Examples: F05 consumes P12 proof verification; F06 orchestrates P05/P06 recovery; F15 presents P02/P03/P10 configuration; T01 consumes P11 timing policy; FEE01 owns fee authority while P17/P19 own distinct optional settlement/service boundaries. Optional integrations are injected capabilities, not startup requirements or static import cycles.

## Verification performed

| Check | Observed result |
|---|---|
| Canonical coverage | 40 unique module IDs, branches and specification paths |
| Acceptance criteria | 445 distinct module-scoped cases; 9–16 per spec |
| Draft size | 61,958 whitespace-delimited words across module specifications |
| Source references | 183 distinct referenced paths resolve at the pinned commit |
| Planned command availability | 91 distinct npm script/workspace or prefix pairs resolve to pinned package manifests |
| Dependency graph | Hard dependencies are acyclic, with 5 dependency waves; every optional reference is a known module |
| Document structure | Balanced code fences, normalized trailing whitespace, no duplicate acceptance definitions or unmapped future-branch links |
| Remote specification content | 40/40 remote bodies and Git blob hashes match the reviewed local content |
| Remote branch heads | 40/40 branch heads match the recorded publication commits |
| Branch diffs | 40/40 are additive documentation-only changes against the inspected source base; existing application files and historical ownership claims are preserved |
| Source ancestry | 40/40 retain the pinned source base as merge base |
| Runtime qualification | Not performed: no application, browser, cryptographic, chain, service, build or release tests were run for this documentation task |

Command checks establish that named scripts exist, not that their future execution passes. Acceptance cases are specified implementation checks, not executed test results. See the per-module validation and remote evidence in the linked JSON records.

## Independent review corrections incorporated

The review covered code reuse, provider ownership, API/state semantics, recovery, fee accounting and current-code claims. Concrete corrections included:

- P02 consent handles are provider-issued, registered and single-use; P04 exports and P05/P07 restore commits have explicit review/authorization boundaries and stale-context rejection.
- P06 separates service authorization from spending, viewing and invoice roles. P09/P10/P19 distinguish canonical UTC expiry from protocol block-height/time units.
- P12 verifies against an independently supplied expected request/audience/challenge/context; replay-state uncertainty cannot become proof validity.
- FEE01 binds complete typed formula parameters and an approved formula-registry digest; the specifications choose no new fee rates or recipients.
- F06/P07 synchronization excludes recovery secrets from the initial device-sync scope.
- F12 imported evidence cannot manufacture a fresh local fiat acknowledgement or claim bank finality.
- F13 limits current P02 reuse to approved JSON-RPC reads. External fiat quotes require a separately reviewed provider-owned non-RPC request/consent contract.
- F16 allows one authoritative allocator per root/generation; stale restored copies remain discovery/recovery-only until a reviewed fresh-checkpoint handoff. Local CAS is not a cross-device allocation guarantee.
- F17/T01/T02 cap and reconcile fees in each exact network/asset, keeping native gas and token-denominated charges separate across interruption and restart.
- F18 derives runtime availability/support/maturity observations separately from the unchanged shared capability descriptor and historical evidence level.
- T01 distinguishes merchant public destination derivation from recovery of payer-controlled keys. It never demands seller spending keys or discarded buyer ephemeral secrets.
- T02 requires a separately reviewed P05/P06 recovery-format extension for never-announced self-controlled intermediate keys. Canonical spec 18 is unchanged; fabricated announcement evidence is rejected.

These are proposed implementation contracts. A separately reviewed provider extension remains a prerequisite where stated; a consumer document does not invent an existing export.

## Concurrent F03 implementation preserved

An independent worker created [future/f03-private-payment-links](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links) during publication. It was observed at [dd665344d6290c109d2292093e01903e4770adff](https://github.com/djshellshoxxx/GhostPay/commit/dd665344d6290c109d2292093e01903e4770adff), based on a newer main snapshot.

This task did not write to that branch. F03's specification lives on [future/f03-private-payment-links-spec](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links-spec). The manifest, catalog and all dependent specification links use the separate specification branch. A later implementation task must reconcile both lanes before changing source.

## Verified branch registry

The specification links below use immutable commit refs. Branch links remain convenient entry points for subsequent work. Full Git blob IDs and verification timestamps are in PUBLICATION.json.

| Module | Feature branch | Pinned specification | Verified head | Acceptance cases |
|---|---|---|---|---:|
| F01 | [future/f01-ghosttips](https://github.com/djshellshoxxx/GhostPay/tree/future/f01-ghosttips) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/12a549e3c03c983b5a19ae6b54b11426284e5e4a/docs/future/modules/F01-ghosttips/SPEC.md) | [12a549e3c03c](https://github.com/djshellshoxxx/GhostPay/commit/12a549e3c03c983b5a19ae6b54b11426284e5e4a) | 10 |
| F02 | [future/f02-ghoststore](https://github.com/djshellshoxxx/GhostPay/tree/future/f02-ghoststore) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/4cc7f4a241fb4bfc0d2f765c857d19bf0fd1d44c/docs/future/modules/F02-ghoststore/SPEC.md) | [4cc7f4a241fb](https://github.com/djshellshoxxx/GhostPay/commit/4cc7f4a241fb4bfc0d2f765c857d19bf0fd1d44c) | 10 |
| F03 | [future/f03-private-payment-links-spec](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links-spec) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/ae0bad1151625fd3453a9c684927145024fa8634/docs/future/modules/F03-private-payment-links/SPEC.md) | [ae0bad115162](https://github.com/djshellshoxxx/GhostPay/commit/ae0bad1151625fd3453a9c684927145024fa8634) | 11 |
| F04 | [future/f04-merchant-dashboard](https://github.com/djshellshoxxx/GhostPay/tree/future/f04-merchant-dashboard) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/711e9e8f7e2b32431353b82c4e39e184d3ba0b58/docs/future/modules/F04-merchant-dashboard/SPEC.md) | [711e9e8f7e2b](https://github.com/djshellshoxxx/GhostPay/commit/711e9e8f7e2b32431353b82c4e39e184d3ba0b58) | 10 |
| F05 | [future/f05-ghostproof](https://github.com/djshellshoxxx/GhostPay/tree/future/f05-ghostproof) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/a241d0a5556c23bf2670f6ba17e7c928b41d7eb4/docs/future/modules/F05-ghostproof/SPEC.md) | [a241d0a5556c](https://github.com/djshellshoxxx/GhostPay/commit/a241d0a5556c23bf2670f6ba17e7c928b41d7eb4) | 10 |
| F06 | [future/f06-encrypted-backups](https://github.com/djshellshoxxx/GhostPay/tree/future/f06-encrypted-backups) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/85dcdcbb54e9494c25ad0fbc04a9667cbb278e31/docs/future/modules/F06-encrypted-backups/SPEC.md) | [85dcdcbb54e9](https://github.com/djshellshoxxx/GhostPay/commit/85dcdcbb54e9494c25ad0fbc04a9667cbb278e31) | 12 |
| F07 | [future/f07-ghostpayouts](https://github.com/djshellshoxxx/GhostPay/tree/future/f07-ghostpayouts) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/90b86766119d3f72870948ee83d039b989659b5f/docs/future/modules/F07-ghostpayouts/SPEC.md) | [90b86766119d](https://github.com/djshellshoxxx/GhostPay/commit/90b86766119d3f72870948ee83d039b989659b5f) | 10 |
| F08 | [future/f08-ghostid](https://github.com/djshellshoxxx/GhostPay/tree/future/f08-ghostid) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/50ea73dcf3d4e9593da780ffb34bdfce60a90a15/docs/future/modules/F08-ghostid/SPEC.md) | [50ea73dcf3d4](https://github.com/djshellshoxxx/GhostPay/commit/50ea73dcf3d4e9593da780ffb34bdfce60a90a15) | 10 |
| F09 | [future/f09-ghostpos](https://github.com/djshellshoxxx/GhostPay/tree/future/f09-ghostpos) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/ceeb3cfad5f353ea88ca7cc0593d199cf734f588/docs/future/modules/F09-ghostpos/SPEC.md) | [ceeb3cfad5f3](https://github.com/djshellshoxxx/GhostPay/commit/ceeb3cfad5f353ea88ca7cc0593d199cf734f588) | 11 |
| F10 | [future/f10-private-recurring](https://github.com/djshellshoxxx/GhostPay/tree/future/f10-private-recurring) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/1c1f2aedb0941a0aeb389a5f5b0dd1ebb68e78d9/docs/future/modules/F10-private-recurring/SPEC.md) | [1c1f2aedb094](https://github.com/djshellshoxxx/GhostPay/commit/1c1f2aedb0941a0aeb389a5f5b0dd1ebb68e78d9) | 11 |
| F11 | [future/f11-ghostteams](https://github.com/djshellshoxxx/GhostPay/tree/future/f11-ghostteams) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/22891e01c2abffe0ced2384c7ad429f08805534f/docs/future/modules/F11-ghostteams/SPEC.md) | [22891e01c2ab](https://github.com/djshellshoxxx/GhostPay/commit/22891e01c2abffe0ced2384c7ad429f08805534f) | 10 |
| F12 | [future/f12-ghostbridge](https://github.com/djshellshoxxx/GhostPay/tree/future/f12-ghostbridge) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/72a641445124321228edaa241f1bb5ae0dd17f8e/docs/future/modules/F12-ghostbridge/SPEC.md) | [72a641445124](https://github.com/djshellshoxxx/GhostPay/commit/72a641445124321228edaa241f1bb5ae0dd17f8e) | 11 |
| F13 | [future/f13-fiat-conversion](https://github.com/djshellshoxxx/GhostPay/tree/future/f13-fiat-conversion) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/ad773b53615c294ee227f42b4a36f4b83e5d4ff1/docs/future/modules/F13-fiat-conversion/SPEC.md) | [ad773b53615c](https://github.com/djshellshoxxx/GhostPay/commit/ad773b53615c294ee227f42b4a36f4b83e5d4ff1) | 12 |
| F14 | [future/f14-multichain-routing](https://github.com/djshellshoxxx/GhostPay/tree/future/f14-multichain-routing) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/2c7c48310aa6337b30677299ec04933b37129d46/docs/future/modules/F14-multichain-routing/SPEC.md) | [2c7c48310aa6](https://github.com/djshellshoxxx/GhostPay/commit/2c7c48310aa6337b30677299ec04933b37129d46) | 10 |
| F15 | [future/f15-private-rpc](https://github.com/djshellshoxxx/GhostPay/tree/future/f15-private-rpc) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/83898237e1b602f94f2e959ef761b5bd63db6590/docs/future/modules/F15-private-rpc/SPEC.md) | [83898237e1b6](https://github.com/djshellshoxxx/GhostPay/commit/83898237e1b602f94f2e959ef761b5bd63db6590) | 10 |
| F16 | [future/f16-per-client-identities](https://github.com/djshellshoxxx/GhostPay/tree/future/f16-per-client-identities) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/4e2917416cf73eb9ca232606000a130db53dc9b0/docs/future/modules/F16-per-client-identities/SPEC.md) | [4e2917416cf7](https://github.com/djshellshoxxx/GhostPay/commit/4e2917416cf73eb9ca232606000a130db53dc9b0) | 12 |
| F17 | [future/f17-private-funds](https://github.com/djshellshoxxx/GhostPay/tree/future/f17-private-funds) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/bb759e7faab75c1120fbf4a86fbf109d06ac8380/docs/future/modules/F17-private-funds/SPEC.md) | [bb759e7faab7](https://github.com/djshellshoxxx/GhostPay/commit/bb759e7faab75c1120fbf4a86fbf109d06ac8380) | 11 |
| F18 | [future/f18-privacy-modes](https://github.com/djshellshoxxx/GhostPay/tree/future/f18-privacy-modes) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/5c0f12c5d3373d81ab3fda9095bc3c64b8bd777a/docs/future/modules/F18-privacy-modes/SPEC.md) | [5c0f12c5d337](https://github.com/djshellshoxxx/GhostPay/commit/5c0f12c5d3373d81ab3fda9095bc3c64b8bd777a) | 12 |
| P01 | [future/p01-tor-onion-hosting](https://github.com/djshellshoxxx/GhostPay/tree/future/p01-tor-onion-hosting) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/25017e720df43d371f956830ba7fd6cb5f81590f/docs/future/modules/P01-tor-onion-hosting/SPEC.md) | [25017e720df4](https://github.com/djshellshoxxx/GhostPay/commit/25017e720df43d371f956830ba7fd6cb5f81590f) | 9 |
| P02 | [future/p02-rpc-policy](https://github.com/djshellshoxxx/GhostPay/tree/future/p02-rpc-policy) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/a453777b5b66933571294da3d9aa7be6843070a4/docs/future/modules/P02-rpc-policy/SPEC.md) | [a453777b5b66](https://github.com/djshellshoxxx/GhostPay/commit/a453777b5b66933571294da3d9aa7be6843070a4) | 12 |
| P03 | [future/p03-local-stealth-scanning](https://github.com/djshellshoxxx/GhostPay/tree/future/p03-local-stealth-scanning) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/ccfd4c225505ca9ed2ef1ecc6fa5d962a8f1f464/docs/future/modules/P03-local-stealth-scanning/SPEC.md) | [ccfd4c225505](https://github.com/djshellshoxxx/GhostPay/commit/ccfd4c225505ca9ed2ef1ecc6fa5d962a8f1f464) | 10 |
| P04 | [future/p04-encrypted-offline-invoices](https://github.com/djshellshoxxx/GhostPay/tree/future/p04-encrypted-offline-invoices) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/3090069a59d14932667acce2aeebe10e3d0f18fd/docs/future/modules/P04-encrypted-offline-invoices/SPEC.md) | [3090069a59d1](https://github.com/djshellshoxxx/GhostPay/commit/3090069a59d14932667acce2aeebe10e3d0f18fd) | 13 |
| P05 | [future/p05-encrypted-local-state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/e03b9ed3e88842a5c26a9d2726e9fb26c22fd17d/docs/future/modules/P05-encrypted-local-state/SPEC.md) | [e03b9ed3e888](https://github.com/djshellshoxxx/GhostPay/commit/e03b9ed3e88842a5c26a9d2726e9fb26c22fd17d) | 13 |
| P06 | [future/p06-key-role-separation](https://github.com/djshellshoxxx/GhostPay/tree/future/p06-key-role-separation) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/db5b5cdaf08a08fc11ee3e772f96410ff1da6738/docs/future/modules/P06-key-role-separation/SPEC.md) | [db5b5cdaf08a](https://github.com/djshellshoxxx/GhostPay/commit/db5b5cdaf08a08fc11ee3e772f96410ff1da6738) | 11 |
| P07 | [future/p07-encrypted-device-sync](https://github.com/djshellshoxxx/GhostPay/tree/future/p07-encrypted-device-sync) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/cb45f9c86ce01d884d24484adde4cff5f6bcbd90/docs/future/modules/P07-encrypted-device-sync/SPEC.md) | [cb45f9c86ce0](https://github.com/djshellshoxxx/GhostPay/commit/cb45f9c86ce01d884d24484adde4cff5f6bcbd90) | 13 |
| P08 | [future/p08-linkability-analysis](https://github.com/djshellshoxxx/GhostPay/tree/future/p08-linkability-analysis) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/80bc065fa666b31445ad6a1078e0d751dcfe4259/docs/future/modules/P08-linkability-analysis/SPEC.md) | [80bc065fa666](https://github.com/djshellshoxxx/GhostPay/commit/80bc065fa666b31445ad6a1078e0d751dcfe4259) | 10 |
| P09 | [future/p09-noncustodial-gas-services](https://github.com/djshellshoxxx/GhostPay/tree/future/p09-noncustodial-gas-services) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/36c5f3579b55f1e71117b8cc6546176392a112c7/docs/future/modules/P09-noncustodial-gas-services/SPEC.md) | [36c5f3579b55](https://github.com/djshellshoxxx/GhostPay/commit/36c5f3579b55f1e71117b8cc6546176392a112c7) | 11 |
| P10 | [future/p10-private-submission](https://github.com/djshellshoxxx/GhostPay/tree/future/p10-private-submission) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/8cd3f30f38006668ec6544f88d05084a1d68f369/docs/future/modules/P10-private-submission/SPEC.md) | [8cd3f30f3800](https://github.com/djshellshoxxx/GhostPay/commit/8cd3f30f38006668ec6544f88d05084a1d68f369) | 11 |
| P11 | [future/p11-metadata-timing-policy](https://github.com/djshellshoxxx/GhostPay/tree/future/p11-metadata-timing-policy) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/7af8c93edbaa98677c5c3f18ed3b8c997bb37b13/docs/future/modules/P11-metadata-timing-policy/SPEC.md) | [7af8c93edbaa](https://github.com/djshellshoxxx/GhostPay/commit/7af8c93edbaa98677c5c3f18ed3b8c997bb37b13) | 10 |
| P12 | [future/p12-selective-disclosure-proofs](https://github.com/djshellshoxxx/GhostPay/tree/future/p12-selective-disclosure-proofs) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/6131e3c28e05438d8c796af74665cf74f51b7453/docs/future/modules/P12-selective-disclosure-proofs/SPEC.md) | [6131e3c28e05](https://github.com/djshellshoxxx/GhostPay/commit/6131e3c28e05438d8c796af74665cf74f51b7453) | 11 |
| P13 | [future/p13-confidential-amounts](https://github.com/djshellshoxxx/GhostPay/tree/future/p13-confidential-amounts) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/8846d5553469753d963258023974ea044467cd6c/docs/future/modules/P13-confidential-amounts/SPEC.md) | [8846d5553469](https://github.com/djshellshoxxx/GhostPay/commit/8846d5553469753d963258023974ea044467cd6c) | 11 |
| P14 | [future/p14-shielded-payments](https://github.com/djshellshoxxx/GhostPay/tree/future/p14-shielded-payments) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/59432dbd4c3802954b0f1879d4bcb02e42ac0449/docs/future/modules/P14-shielded-payments/SPEC.md) | [59432dbd4c38](https://github.com/djshellshoxxx/GhostPay/commit/59432dbd4c3802954b0f1879d4bcb02e42ac0449) | 11 |
| P15 | [future/p15-anonymous-withdrawals](https://github.com/djshellshoxxx/GhostPay/tree/future/p15-anonymous-withdrawals) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/5da7ed870e85c2d1c46db594db442f26f3a7f339/docs/future/modules/P15-anonymous-withdrawals/SPEC.md) | [5da7ed870e85](https://github.com/djshellshoxxx/GhostPay/commit/5da7ed870e85c2d1c46db594db442f26f3a7f339) | 11 |
| P16 | [future/p16-shielded-cross-chain](https://github.com/djshellshoxxx/GhostPay/tree/future/p16-shielded-cross-chain) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/470cc1045cedd44f9797300c65c1ef05a139e5ac/docs/future/modules/P16-shielded-cross-chain/SPEC.md) | [470cc1045ced](https://github.com/djshellshoxxx/GhostPay/commit/470cc1045cedd44f9797300c65c1ef05a139e5ac) | 10 |
| P17 | [future/p17-private-fee-outputs](https://github.com/djshellshoxxx/GhostPay/tree/future/p17-private-fee-outputs) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/18fc7f914b57d3c659df4950f0b9fd57520917ee/docs/future/modules/P17-private-fee-outputs/SPEC.md) | [18fc7f914b57](https://github.com/djshellshoxxx/GhostPay/commit/18fc7f914b57d3c659df4950f0b9fd57520917ee) | 10 |
| P18 | [future/p18-telemetry-release-integrity](https://github.com/djshellshoxxx/GhostPay/tree/future/p18-telemetry-release-integrity) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/70862d040066167bc3ba2d311913b92a6b327fc5/docs/future/modules/P18-telemetry-release-integrity/SPEC.md) | [70862d040066](https://github.com/djshellshoxxx/GhostPay/commit/70862d040066167bc3ba2d311913b92a6b327fc5) | 11 |
| P19 | [future/p19-optional-fee-gateway](https://github.com/djshellshoxxx/GhostPay/tree/future/p19-optional-fee-gateway) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/6fda0db00ea5b96b3cfcdc2620f74723229e16d7/docs/future/modules/P19-optional-fee-gateway/SPEC.md) | [6fda0db00ea5](https://github.com/djshellshoxxx/GhostPay/commit/6fda0db00ea5b96b3cfcdc2620f74723229e16d7) | 10 |
| T01 | [future/t01-staggered-transfers](https://github.com/djshellshoxxx/GhostPay/tree/future/t01-staggered-transfers) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/7b9da145ea5305586d31d9fd1d34f9489ca6909e/docs/future/modules/T01-staggered-transfers/SPEC.md) | [7b9da145ea53](https://github.com/djshellshoxxx/GhostPay/commit/7b9da145ea5305586d31d9fd1d34f9489ca6909e) | 14 |
| T02 | [future/t02-intermediary-routing](https://github.com/djshellshoxxx/GhostPay/tree/future/t02-intermediary-routing) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/b618d324df0a730650a8a6de9e0595e9f96382c0/docs/future/modules/T02-intermediary-routing/SPEC.md) | [b618d324df0a](https://github.com/djshellshoxxx/GhostPay/commit/b618d324df0a730650a8a6de9e0595e9f96382c0) | 14 |
| FEE01 | [future/fee01-modular-fee-policy](https://github.com/djshellshoxxx/GhostPay/tree/future/fee01-modular-fee-policy) | [SPEC.md](https://github.com/djshellshoxxx/GhostPay/blob/4210e1ae1f41e16b72f790cb02e96410a5a94e92/docs/future/modules/FEE01-modular-fee-policy/SPEC.md) | [4210e1ae1f41](https://github.com/djshellshoxxx/GhostPay/commit/4210e1ae1f41e16b72f790cb02e96410a5a94e92) | 16 |

## Remaining decisions and implementation handoff

No implementation is authorized by this publication. When a module is selected for implementation, refresh main, its live branch head and active ownership; compare the remaining delta with current source; agree on provider interfaces first; then implement bounded slices and record actual test/recovery evidence.

Unresolved owner decisions remain explicit in each module: new fee rates and recipients, supported networks/assets and providers, protocol or circuit selection, service enforcement, trusted artifacts, device/browser support and activation policy. Research modules may remain unavailable without blocking independent local features. No new prices, custody assumptions, guardian recovery, mandatory publisher service, payment activation, release, main merge or deployment was introduced.
