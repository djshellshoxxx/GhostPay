# Deferred Bitcoin, Solana and TRON interoperability: notes for Claude

Research date: **2026-11-04 UTC**. This is a source review and a scoped future-work queue, not evidence of new runtime qualification. Application inspection is pinned to integration PR #47, commit `f8193502e602c99bb24ff956f142671750b744a0`; the main documentation baseline is `0014bc5b26c7487ea1f9fb230194c36673193236`. The live PR inventory in this handoff's README takes precedence for ownership. No application source, dependency, branch, or existing fixture was changed by this research.

## Decisions

Keep these chains in the deferred/full-profile workstream. The most useful reuse is independent fixtures and reference execution, followed by a narrow Payjoin backend integration. A new wallet framework, another TRON package, and a replacement stealth implementation are not justified by the inspected code.

The highest-value new finding is a **BIP-352 vector update**: upstream has 29 cases at the pinned commit below; GhostPay vendors 28. The additional case covers a Taproot key-path spend with an annex. GhostPay already handles annexes in `extractInputPublicKey` and tests them in `inputs.test.ts`; the evidence supports refreshing the external fixture and checking results, not assuming the implementation is broken.

Two previously uncertain licensing questions are now more precise: Payjoin's FFI is MIT OR Apache-2.0, while its core crate declares MITNFA; Kora's actual `LICENSE.md` is MIT. TRON's protocol repository is LGPL-3.0, although TronWeb's top-level license is MIT. Record these component boundaries before copying code or packaging a new dependency.

## 1. What already exists and which implementation is active

| Chain | Actual full-app imports and paths | Existing evidence | Remaining boundary |
|---|---|---|---|
| Bitcoin | `apps/web/src/features/btc/*` imports `@ghostpay/btc-silent-payments`; `packages/btc-payjoin` is a separate library | BIP-352 vectors/reference files already vendored; annex unit coverage; `scripts/regtest/` contains a Dockerfile, compose stack, Esplora shim and `e2e.mjs`; `regtest.e2e.test.ts` drives scan → review → sign → broadcast → rescan | The harness README records that the browser-feature Core stack was not run in its build environment. The Payjoin library separately records a Knots regtest run. These are distinct evidence claims. Concrete v2 `FfiBackend` remains absent. |
| Solana | `apps/web/src/features/solana/*` imports **`@ghostpay/solana-stealth`**, not `@ghostpay/chain-solana` | Legacy transaction construction using `@solana/kit`, independent Python cross-check, mock RPC tests, scalar-key signing, SOL/SPL library support | README says no validator execution; no dedicated announcer program, mint allowlist or deployed sponsor. The full-app sweep path inspected is native SOL. |
| TRON | `apps/web/src/features/tron/*` imports **`@ghostpay/tron-adapter`**, reusing `@ghostpay/core-crypto`; it does not use `chain-tron` | Local protobuf construction, re-decoding, secp256k1 signing, signature recovery, memo scan, TRC-20 receipt checks, mocked browser flow | Official-schema/SDK/node interoperability remains unproven by the existing docs. Network check excludes a reported mainnet genesis; it does not attest the selected test network. |

Source anchors: [full App.tsx](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/apps/web/src/App.tsx), [Bitcoin harness](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/scripts/regtest/README.md), [Payjoin README](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/btc-payjoin/README.md), [Solana README](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/solana-stealth/README.md), [TRON ADR-0019](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/adr/ADR-0019-tron.md).

**Corrections to old reuse notes:** `docs/research/reuse/btc-prior-art.md` says no harness was found; it now exists under `scripts/regtest`. `tron-prior-art.md` says there is no TRON package and proposes a new `tron-trc20`; that is obsolete against this snapshot. ADR-0017's statement that Solana is not wired into apps is also stale against `App.tsx`. Update these status statements after reconciling with the current branch; do not let old prose cause duplicate implementations. `chain-solana` and `solana-stealth` also define different proposed scheme formats/formulas, so combining their vectors would falsely imply interoperability.

No current implementation PR owner for these deferred-chain tasks was established in this lane. Each proposed task below needs an explicitly assigned chain maintainer after the root handoff's live inventory check; PR #47 is the inspected integration baseline, not an instruction to reopen unrelated work.

## 2. CHAIN-01: Refresh the existing BIP-352 vector set

**Targets:** `packages/btc-silent-payments/test-vectors/send_and_receive_test_vectors.json`, its `README.md`, `src/vectors.test.ts`, `src/inputs.ts::extractInputPublicKey`, `src/inputs.test.ts`. **Owner/status:** deferred Bitcoin maintainer; existing implementation and tests, external fixture refresh available.

Upstream `bitcoin/bips` was resolved to commit **`5bbeeae962f59768b92fc8905e5b0284366832bd`**. Its `bip-0352/send_and_receive_test_vectors.json` has **29 cases, 29 sending entries and 30 receiving entries**; the vendored file has **28/28/29**. The new case is titled `Single recipient: taproot key-path spend with annex`. Full Git blob identities observed:

| File | GhostPay vendored blob | Upstream blob at the pinned commit |
|---|---|---|
| `send_and_receive_test_vectors.json` | `3a189757ddbc90e5ec538d643f7ac238a51704e8` | `b915113acc8130bb0e7347fa4485af25906123bd` |
| `reference.py` | `c334d32899715655f37141548aa46693c2497c48` | Same |
| `bitcoin_utils.py` | `cfd6a8077b76d82570f7f9511140ca123b65960e` | Same |

These are Git blob hashes, not SHA-256 download checksums. The matching Python blobs do not establish that all supporting Python dependencies are present. Existing provenance says the separately vendored `secp256k1lab` dependency needed by the reference was not saved. I compared fixture counts and case labels plus blob identities; I did not certify that every field in the preceding 28 cases is unchanged.

**Reuse decision:** tests-only fixture refresh. Preserve the old fixture or its digest in the change record, review the complete upstream diff, and update provenance and exact-count assertions together. The BIP document explicitly declares BSD-2-Clause. Preserve attribution; verify the notices for support code separately before adding missing Python files. Do not rewrite the derivation engine merely because upstream HEAD changed.

**Acceptance:** the pinned external set is checked by the existing sending/receiving/spend tests; all changed cases are explained; annex behavior stays consistent with existing local unit coverage; complete SHA-256 checksums and upstream commit are recorded. Any implementation discrepancy becomes a separate reviewed fix. No new claim about Bitcoin Core or public-network acceptance follows from vector success.

Sources: [upstream vectors](https://github.com/bitcoin/bips/blob/5bbeeae962f59768b92fc8905e5b0284366832bd/bip-0352/send_and_receive_test_vectors.json), [BIP-352/license](https://github.com/bitcoin/bips/blob/5bbeeae962f59768b92fc8905e5b0284366832bd/bip-0352.mediawiki), [reference.py](https://github.com/bitcoin/bips/blob/5bbeeae962f59768b92fc8905e5b0284366832bd/bip-0352/reference.py), [local provenance](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/btc-silent-payments/test-vectors/README.md), [local annex coverage](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/btc-silent-payments/src/inputs.test.ts).

## 3. CHAIN-02: Complete Payjoin v2 through the existing backend seam

**Targets:** `packages/btc-payjoin/src/ffi/index.ts::{FfiBackend,FfiTransport,loadPayjoinFfi}`, `src/ffi/ffi.test.ts`, `DEVIATIONS.md`; reuse the existing regtest machinery. **Owner/status:** deferred Payjoin maintainer; concrete backend unbuilt by the package's own documentation.

The local adapter pins `payjoin@0.25.0`, initializes its WASM namespace and enforces relay/directory allowlists. Its tests use a fake `FfiBackend`. That is a useful seam; it does not constitute an interoperable v2 session.

The strongest upstream implementation reference is `payjoin/rust-payjoin` commit **`65d3920faae6df04a628a719386307a7072feff8`**:

- `payjoin-ffi/javascript/test/integration.test.ts` contains a Node/browser WASM integration driver, receiver typestate transitions, sender processing and session persistence helpers. Adapt the state-transition mapping and restart fixtures to `FfiBackend`, with GhostPay's TS policy checks retained.
- `payjoin-test-utils/src/v2.rs` provides local directory/OHTTP relay setup and readiness helpers. It is useful test infrastructure rather than a production directory deployment recipe.
- The inspected JavaScript package and FFI crate are **0.25.1**; core `payjoin` is **1.2.0**. These are distinct versions. Do not silently map this source to GhostPay's installed 0.25.0 artifact.

**License evidence:** `payjoin-ffi/LICENSE.md` and `LICENSE-MIT` were read; the FFI crate declares `MIT OR Apache-2.0`. `payjoin/Cargo.toml` declares `MITNFA`; FFI depends on that core. [SPDX identifies MITNFA](https://spdx.org/licenses/MITNFA.html) as MIT plus a no-false-attribution condition. The old note's automatic conclusion that MITNFA is simply “non-permissive, do not copy” is not supported by its name. Review actual component terms and packaged notices; the FFI's permissive license does not erase dependency obligations. The npm tarball's included notices/provenance were not inspected in this pass.

**Reuse decision:** isolated interoperability spike using a reviewed exact artifact, then dependency integration if the acceptance gate passes. No new HPKE/OHTTP implementation. Source may guide the adapter; wholesale copying of upstream test wallet RPC/signing callbacks would bypass GhostPay's existing separation of review, policy, signing and broadcast.

**Acceptance:** real local directory and relay sessions complete with the chosen WASM artifact; persisted sessions resume and timeout explicitly; browser and Node initialization are both qualified; every returned PSBT still goes through the TS validation path; original fallback and Payjoin cannot both be recorded as the chosen broadcast; operator-separation requirements stay explicit. Publish versions, component licenses, fixture provenance and observed results before changing “v2 unbuilt.”

Sources: [local deviations](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/btc-payjoin/DEVIATIONS.md), [upstream JS integration driver](https://github.com/payjoin/rust-payjoin/blob/65d3920faae6df04a628a719386307a7072feff8/payjoin-ffi/javascript/test/integration.test.ts), [local v2 services](https://github.com/payjoin/rust-payjoin/blob/65d3920faae6df04a628a719386307a7072feff8/payjoin-test-utils/src/v2.rs), [FFI license](https://github.com/payjoin/rust-payjoin/blob/65d3920faae6df04a628a719386307a7072feff8/payjoin-ffi/LICENSE.md), [core manifest](https://github.com/payjoin/rust-payjoin/blob/65d3920faae6df04a628a719386307a7072feff8/payjoin/Cargo.toml).

## 4. CHAIN-03: Give Solana an independent runtime qualification path

**Targets:** `packages/solana-stealth/src/{instructions,tx,ed25519,scan}.ts`, `scripts/crosscheck_vectors.py`, existing `test-vectors/solana-stealth.json`; `apps/web/src/features/solana/{sweep,rpc}.ts`. **Owner/status:** deferred Solana maintainer; working PoC and mock tests, no validator execution evidence in the inspected README/ADR.

Use **LiteSVM as a development-only oracle**, pinned by both source and the selected native/npm artifact. At commit **`aff262da627cbd6dfef24d24fb435fbaa5e61bc4`**, useful paths are `crates/node-litesvm/tests/oneTransfer.test.ts`, `tests/token.test.ts`, `tests/util.ts` and the Rust `crates/litesvm/tests/{blockhash,rent,spl}.rs`. The one-transfer test uses `@solana/kit` and verifies state after execution, so this is closer to the existing architecture than migrating to a wallet demo.

A material configuration distinction: upstream `tests/sigVerify.test.ts` demonstrates execution **with signature verification disabled**. Do not copy that configuration into a test used to claim GhostPay's scalar-key signatures are valid. Explicitly enable signature verification and applicable blockhash checks, record runtime feature configuration, and assert execution errors as well as resulting balances.

**Licenses/artifact limits:** root `LICENSE` is Apache-2.0; `crates/node-litesvm/package.json` declares MIT, version **1.6.1**, Node >=20, and a `@solana/kit` dev dependency of `^8.0.0`. Preserve applicable notices for the selected distribution and native components. Source inspection does not prove an npm 1.6.1 binary corresponds to this exact commit. Determine that mapping and platform support before adoption. The existing GhostPay Kit pin is 8.4.0; avoid changing it solely to run an oracle.

**Acceptance:** execute GhostPay-produced bytes for native transfers and raw-scalar sweeps, then classic SPL ATA creation/TransferChecked/optional close-account flows; verify amounts, rent destinations, fees, signature validity and failures as appropriate. Follow with a separately pinned local validator test for the actual JSON-RPC lifecycle, commitment, transaction lookup and blockhash expiry. LiteSVM state execution alone does not establish public-cluster, RPC-provider or wallet interoperability. Token-2022 extensions and a new announcer program remain outside this gate.

Sources: [GhostPay ADR-0017](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/adr/ADR-0017-solana-stealth.md), [LiteSVM one-transfer](https://github.com/LiteSVM/litesvm/blob/aff262da627cbd6dfef24d24fb435fbaa5e61bc4/crates/node-litesvm/tests/oneTransfer.test.ts), [signature-verification configuration example](https://github.com/LiteSVM/litesvm/blob/aff262da627cbd6dfef24d24fb435fbaa5e61bc4/crates/node-litesvm/tests/sigVerify.test.ts), [root license](https://github.com/LiteSVM/litesvm/blob/aff262da627cbd6dfef24d24fb435fbaa5e61bc4/LICENSE), [binding manifest](https://github.com/LiteSVM/litesvm/blob/aff262da627cbd6dfef24d24fb435fbaa5e61bc4/crates/node-litesvm/package.json).

## 5. CHAIN-04: Carry Solana transaction identity and lifetime through broadcast

**Targets:** `apps/web/src/features/solana/sweep.ts::{SignedSweep,signSweep}`, `rpc.ts::{sendTransaction,solErrorMessage}`, `SolanaView.tsx::doBroadcast`. **Owner/status:** deferred Solana browser maintainer; source-level hardening/qualification proposal, no reproduced failure.

`signSweep` already computes the local signature and fetches a finalized blockhash with its lifetime. It returns only `{signature, wireBase64}`. `sendTransaction` currently accepts any nonempty string from RPC and has no expected-signature argument. `SolanaView` displays the returned value as server acceptance. TRON's analogous `broadcastHex` already compares the response with its local `txID`; use that existing identity-binding principle here.

The [official sendTransaction contract](https://solana.com/docs/rpc/http/sendtransaction) says success is RPC acceptance, not confirmation, and the returned identifier is the transaction's first signature. [getLatestBlockhash](https://solana.com/docs/rpc/http/getlatestblockhash) returns a last-valid block height; [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses) and the [confirmation/expiration guide](https://solana.com/developers/cookbook/transactions/confirmation) support subsequent reconciliation.

**Reuse decision:** design guidance from these official APIs, plus GhostPay's existing transaction/journal patterns; no additional wallet dependency. Retain the local signature, signed bytes and lifetime as one reviewed operation. Check RPC acknowledgement identity, represent submitted/confirmed/expired/unknown separately, and reconcile by the existing signature after transport uncertainty. Expiry is not determined solely by a browser wall-clock timeout. A refreshed blockhash creates new signed bytes and must pass the normal review/signing path.

**Acceptance:** acknowledgement equals the locally derived signature; delayed responses and navigation preserve an inspectable operation state; failed confirmation lookup is not labeled proof that nothing was sent; retry policy distinguishes resubmission of the same bytes from creation of another transaction; pending state remains honest until chain evidence resolves it. The current UI's “server accepted” wording is appropriately narrower than “confirmed” and should remain so unless confirmation is actually observed.

Local source: [sweep.ts](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/apps/web/src/features/solana/sweep.ts), [rpc.ts](https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/apps/web/src/features/solana/rpc.ts).

## 6. CHAIN-05: Verify TRON's existing serializer with official source

**Targets:** `packages/tron-adapter/src/{protobuf,tx,address,fees}.ts`, especially `rawData`, `buildTrxTransfer`, `decodeRawTx`, `signTronTx`, `encodeSignedTransactionHex`; `test-vectors/tron.json`, `scripts/crosscheck_vectors.py`; `apps/web/src/features/tron/{rpc,sweep}.ts`. **Owner/status:** deferred TRON maintainer; implementation exists; independent official-code interoperability unqualified.

Official source now resolves the old “schema remembered/unavailable” limitation:

- `tronprotocol/protocol` commit **`8432beca98c52ba04c82aea0b48ae9f9f882c82a`**, `core/Tron.proto`, `core/contract/balance_contract.proto`, `core/contract/smart_contract.proto`: exact field numbers/types for transaction raw data, transfer and contract call. Its actual `LICENSE` is **LGPL-3.0**.
- `tronprotocol/tronweb` commit **`974ea0bcd98c2a10f2e94addd55d4fa3b199f98a`**, `src/utils/transaction.ts::{txJsonToPb,compareTransaction}`, `src/utils/crypto.ts::{signTransaction,ECKeySign}`, `test/utils/deserializeTx.test.ts`: independent protobuf serialization, raw-byte/txID comparison, signing/recovery reference. Its root `LICENSE` is **MIT**. Generated protobuf/third-party components still need notice review if redistributed.

**Reuse decision:** official schemas as a specification reference; TronWeb as an isolated development-only differential oracle using synthetic keys and fixed transaction inputs. Do not add TronWeb to the browser signing path or create the obsolete proposed `tron-trc20` package. Do not blindly vendor LGPL schema/generated code under GhostPay's `UNLICENSED` package label.

Compare canonical serialized raw bytes and txID, not just decoded fields: protobuf encodings that decode to the same values can differ in omitted defaults or ordering, and TRON signs the raw bytes. Confirm positive-value bounds for protocol `int64` fields rather than assuming the local generic `U64_MAX` makes every value acceptable. Verify recovery against the exact signed digest without changing the existing explicit review/sign/broadcast separation.

The [official transaction documentation](https://developers.tron.network/docs/tron-protocol-transaction) was accessible: it describes TAPOS byte slices, signatures, expiration, and `fee_limit`. The local `Trc20TransferInput.feeLimitSun` comment calls it maximum sun “burnable for energy”; the current official definition covers the caller's total Energy budget including staked Energy. Reconcile comment, displayed preview and fee calculation before claiming resource estimates. Keep the local ten-minute validity choice distinguishable from the documented node default; the maximum/anchor must be checked against the selected node behavior.

**Acceptance:** official-oracle fixtures for native TRX and TRC-20 with memo, reference block, fee limit and expiration; byte-exact raw-data hashes; independent signer recovery; re-decoded review matches original intent; existing receipt-credit checks remain. The full-app native sweep, package-level TRC-20 builder, and any future real-node TRC-20 test must be reported separately. Broadcast acknowledgement remains distinct from receipt execution and solidified confirmation. No Nile or public-chain transaction was sent during this research.

Sources: [protocol raw schema](https://github.com/tronprotocol/protocol/blob/8432beca98c52ba04c82aea0b48ae9f9f882c82a/core/Tron.proto), [transfer schema](https://github.com/tronprotocol/protocol/blob/8432beca98c52ba04c82aea0b48ae9f9f882c82a/core/contract/balance_contract.proto), [protocol license](https://github.com/tronprotocol/protocol/blob/8432beca98c52ba04c82aea0b48ae9f9f882c82a/LICENSE), [TronWeb transaction utility](https://github.com/tronprotocol/tronweb/blob/974ea0bcd98c2a10f2e94addd55d4fa3b199f98a/src/utils/transaction.ts), [TronWeb crypto utility](https://github.com/tronprotocol/tronweb/blob/974ea0bcd98c2a10f2e94addd55d4fa3b199f98a/src/utils/crypto.ts), [TronWeb license](https://github.com/tronprotocol/tronweb/blob/974ea0bcd98c2a10f2e94addd55d4fa3b199f98a/LICENSE).

## 7. Additional sources, deferred candidates and non-GitHub search

| Source | Verified material | Decision / remaining check |
|---|---|---|
| Kora, commit `0cc08ec82e198781638be48240689dca27b5cfa8` | [Actual MIT license](https://github.com/solana-foundation/kora/blob/0cc08ec82e198781638be48240689dca27b5cfa8/LICENSE.md); [TransactionValidator](https://github.com/solana-foundation/kora/blob/0cc08ec82e198781638be48240689dca27b5cfa8/crates/lib/src/validator/transaction_validator.rs) checks configurable programs, tokens, versions, fees and payer usage | Design-only for a separately approved sponsor service. GhostPay has no deployed Solana sponsor; preserve `gasSponsorship: not_deployed`. Rust service and operational funding policy are separate deliverables, not a small imported helper. Old license uncertainty is resolved. |
| Bitcoin Core official distribution | [Download page](https://bitcoincore.org/en/download/) exposed source archive and signed checksum links, displayed 32.1 at retrieval, and states MIT. [RPC reference](https://bitcoincore.org/en/doc/30.0.0/) provides API documentation, not a recommendation to install that old release | Reuse the existing local harness with an explicitly reviewed supported release and recorded digest/signature verification. The initially attempted 30.0 archive location returned 404; search located it under `insecure-wallet-deletion`. Do not infer suitability from old documentation or silently use that archive. No binary downloaded or verified here. |
| GitLab Bitcoin Core secp256k1 mirror | [Repository page](https://gitlab.com/bitcoin-core-mirror/secp256k1) explicitly describes an hourly mirror | Discovery-only. Source commit and license for a contemplated module were not verified here; mirroring does not make an independent implementation. No runtime dependency or copied C/WASM crypto recommendation. |
| Codeberg search | Targeted public search for relevant Solana/wallet code encountered robots.txt exclusion | No qualifying source inspected; no inference that no useful Codeberg project exists. |
| Official Solana docs, TRON docs and SPDX | Accessible primary specifications and lifecycle/license details, cited in the tasks above | These close concrete old evidence gaps outside GitHub. Documentation accessibility is not proof of deployed compatibility. |

Do not add low-evidence wallet demos merely to increase a repository count. Independent schemes, cryptographic primitives, node execution and browser UX validate different things. In particular, success in another project's Ed25519 signer does not ratify GhostPay's proposed stealth scheme, and a memo-based payment is not a deployed announcer protocol.

## 8. Smallest useful next work

1. **CHAIN-01:** review the upstream BIP-352 fixture diff and refresh provenance/count assertions. This is the smallest concrete improvement.
2. **CHAIN-05 / CHAIN-04:** establish TRON serializer oracles and Solana transaction-identity/lifetime acceptance requirements in separate, owned tasks.
3. **CHAIN-03:** run a pinned independent Solana execution environment, then qualify the existing RPC flow on a local validator.
4. **CHAIN-02:** map the Payjoin WASM typestate API into the existing `FfiBackend` only with the local services and version/license matrix available.

These tasks do not authorize enabling mainnet, adding mint/token allowlists from memory, charging currently `not_deployed` fees, or moving deferred chains into the lean build. No upstream implementation, test fixture, dependency or application source was copied or modified in this research pass; only this note was added. Static reads, metadata/JSON inspection and local Git blob hashing were performed. Existing test results quoted above are attributed to repository documentation, not rerun results.
