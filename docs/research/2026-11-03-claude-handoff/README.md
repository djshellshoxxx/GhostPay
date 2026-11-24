# GhostPay deep research and code-reuse handoff for Claude

**Start with the current source/ownership map, then choose one concrete task from the relevant area report.** This research examines unfinished integration and qualification work, identifies reusable upstream code and test material, and corrects several stale “missing feature” assumptions in older notes.

Research date: **November 3, 2026 America/Vancouver / November 4 UTC**. The primary implementation baseline is integrated PR #47 at `f8193502e602c99bb24ff956f142671750b744a0`, compared with main `0014bc5b26c7487ea1f9fb230194c36673193236`. Active child PRs were reviewed separately and continued changing during the research.

This is a documentation deliverable. It does not certify a release, turn a proposed test into an executed result, or change the supported feature scope.

**Immediate handoff: the Chainlink source-download blocker in PR #72 is resolved.** [Report 10](10-chainlink-testnet-source-evidence.md) includes both exact primary JSON files, SHA-256 hashes, retrieval times, official network mappings, and the four requested feed records. Use this evidence in the existing PR lane; runtime feed qualification and support decisions remain separate.

## Reading map

| Report | What Claude should use it for |
|---|---|
| [00 — Repository snapshot and research delta](00-repository-snapshot.md) | Exact source anchors, existing PR ownership, earlier research #54–57, and corrections that prevent duplicate work. |
| [01 — EVM payment correctness](01-evm-payment-correctness.md) | Payment/invoice/receipt semantics, uncertain outcomes, canonicality, standards and implementation reuse. |
| [02 — Recovery, wallet and mobile](02-recovery-wallet-mobile.md) | Existing recovery and pairing work; browser lifecycle, QR interoperability, real-device evidence, accessibility and localization. |
| [03 — Hosting, releases and provenance](03-hosting-release-provenance.md) | Authenticated release verification, reproducibility diagnostics, exact-artifact hosting checks, Tor/I2P/IPFS boundaries and non-GitHub upstream code. |
| [04 — Private scanning and indexers](04-private-scanning-indexers.md) | Existing scanner seams, optional reference service, Ponder, Helios, SimplePIR/YPIR, newer EF research and transport limits. |
| [05 — Deferred chain interoperability](05-deferred-chain-interoperability.md) | Bitcoin, Solana and TRON implementation references and conformance work, with existing package boundaries preserved. |
| [06 — Account abstraction and permits](06-account-abstraction-permits.md) | Sponsorship/account standards and permit implementation fit; coordination with current policy/relayer work. |
| [07 — Merchant delivery and oracles](07-merchant-delivery-oracles.md) | BTCPay, Standard Webhooks, GNU Taler, durable delivery/refund state, current Chainlink metadata and embed ownership. |
| [08 — ENS and escrow decisions](08-ens-escrow-design-decisions.md) | Existing ENS normalization dependency, offchain resolution policy, current Kleros source evidence, and contradictory escrow requirements that need an ADR. |
| [09 — Private pools and confidential amounts](09-private-pools-confidential-amounts.md) | Existing optional pool/FHE/prover packages, upstream code and artifact provenance, and the remaining integration/qualification boundaries. |
| [10 — Chainlink primary-source evidence](10-chainlink-testnet-source-evidence.md) | The concrete evidence needed to resume PR #72: Sepolia/Base Sepolia feed snapshots, exact hashes, selected records and field interpretation. |

Each area report identifies actual GhostPay files, inspected upstream source paths/revisions, observed license terms, recommended adoption mode, acceptance requirements, overlaps and unverified prerequisites.

## What changed relative to the old research

The previous research is retained as history. This pass adds directly retrieved upstream implementation/license evidence and reads the integrated candidate rather than inferring its state from main alone.

- **Recovery, public pairing, bound receipts, iframe embedding and webhook helpers already have implementations.** Several remain in open child PRs. Review the existing work and add missing evidence; do not create parallel formats or packages from stale plans.
- **The generated third-party table is current on the inspected frontier.** A fresh check passed. Curated notes, vendored-source provenance and the accuracy of referenced license-file paths remain separate questions.
- **“Verified data” needs a precise meaning.** Returned-log authenticity, complete scan coverage, query privacy and network privacy are independent properties. Neither an indexer nor a light-client capability flag supplies all of them automatically.
- **The browser recovery suite uses independent contexts, which is valuable but does not establish interoperability between different browser engines or physical devices.**
- **Merchant HMAC libraries have different wire protocols.** BTCPay, Standard Webhooks and GhostPay need explicit adapters; their signatures cannot simply be exchanged.
- **Fiat quotation code and a testnet registry entry already exist.** Current provider configuration and freshness/health policy are the remaining research-to-implementation boundary.
- **A specific Bitcoin fixture update is available.** The pinned upstream BIP-352 file contains 29 cases versus 28 in GhostPay. Existing annex handling means this is a fixture/provenance refresh to check, not evidence of an implementation failure.
- **The v0.7 account-abstraction license correction matters before reuse.** At the exact EntryPoint v0.7.0 source used by GhostPay's test fetch, `BasePaymaster.sol` is GPL-3.0, not the MIT classification in the older note based on another revision.
- **Optional pool and FHE packages already expose useful seams.** The missing RAILGUN SDK port, existing Zama browser-runtime configuration boundary, and circuit/SDK artifact provenance are more concrete work than choosing another privacy protocol.
- **The escrow design needs clarification before a factory is written.** Standard minimal clones use delegation, while the current brief also says no delegatecall. The older reuse note's admin pause model also differs from the current no-admin brief.

Evidence and qualifications for these points are in the linked area reports. Findings state which source revision was inspected and what remains unexecuted.

## Recommended pickup order

| Order | Concrete work | Why it comes here | Start in |
|---|---|---|---|
| 1 | Refresh main/PR #47 and active child heads; reconcile existing receipt, recovery, policy, localization and embed changes. | The repository was moving throughout this session. A fixed historical checkout cannot establish today's remaining gap. | 00 |
| 2 | Give PR #72's owner the saved Chainlink source evidence and reconcile its blocked note. | This resolves an observed, current external-source blocker without inventing feed values or enabling a network. | 10 |
| 3 | Qualify the existing core journey and payment/recovery semantics on the selected integration. | This is the currently supported product path; new dependencies do not replace its evidence. | 01, 02 |
| 4 | Resolve narrow browser lifecycle/shared-camera gaps and collect the supported engine/device/wallet matrix. | Existing implementations provide a strong base; the remaining work has concrete source targets and measurable outcomes. Coordinate Chromium emulation with PR #73. | 02 |
| 5 | Reconcile vendored notices/provenance and add exact-artifact hosting/release evidence. | A current generated inventory, valid hashes, trusted signer, reproducible build and working hosted artifact are different claims. | 03, 06 |
| 6 | Specify the existing public indexer API's coverage/rollback contract; evaluate a small optional reference service. | This addresses a real integration seam while keeping secret matching local and experimental code outside lean. Coordinate scanner edits with PR #70. | 04 |
| 7 | Pick one deferred feature only when its product/ownership decision is made: merchant delivery, another chain, sponsorship, ENS, escrow or private pools. | Each changes its own operational or transaction model. The reports supply useful sources without silently expanding the core milestone. | 05–09 |

These are research priorities, not an instruction to merge another contributor's branch or enable a chain.

## High-value reuse shortlist

| Source | Recommended use | Main boundary |
|---|---|---|
| Web Platform Tests | Adapt selected IndexedDB/BFCache/transaction scenarios into the existing browser suite. | Browser API tests still need GhostPay-specific assertions; preserve selected-file notices. |
| Project Nayuki QR generator | Independent synthetic QR fixtures. | Test tooling; keep the existing runtime encoder and wire format. |
| Nimiq qr-scanner | Reference lifecycle, pause/visibility and worker ideas. | Preserve explicit camera consent and GhostPay's abort/session fences. |
| GitHub CLI attestation verifier | External verifier behind an explicit release policy. | A valid attestation must match the intended signer, workflow, source and artifact. |
| Debian Salsa reprotest and diffoscope | Isolated reproducibility qualification and diagnostics. | Keep byte equality as the gate; diagnostics and one-runner variation do not establish an independent rebuild. |
| I2P's own Gitea source | Validate generated tunnel configuration against the real parser. | Reference selected version/configuration; do not import the tunnel runtime into the app. |
| Ponder | Evaluate an optional operator-side public-announcement indexer. | Its reorg/storage window must not be presented as consensus finality. |
| Helios | Isolated light-client/provider experiment. | Receipt/log inclusion evidence and completeness of a historical range are separate. |
| SimplePIR and YPIR | Later, controlled comparison against one representative dataset. | Published benchmarks are not browser/mobile or GhostPay measurements. |
| BTCPay Server | Adapt delivery/attempt/state concepts. | Preserve GhostPay's protocol and fulfillment authority; the C# service is not a drop-in library. |
| Standard Webhooks | Optional explicit wire-protocol adapter and interoperability fixtures. | Check the released package as well as source; root/spec and library licenses differ. |
| GNU Taler merchant backend | Architecture reference for durable workers and refund-state separation. | Different payment semantics and AGPL backend files; mutable source views were not proven to one commit. |
| Chainlink interface/documentation | Verify current feed configuration and maintain the existing quote seam. | No new network/feed approval is implied. |
| ens-normalize and ENSjs | Retain current normalization and reference selected resolution/decoding APIs. | Normalization is not identity authentication; offchain requests need transport policy. |
| Existing OpenZeppelin primitives / Kleros escrow source | Resolve escrow design and compare state models. | Match GhostPay's intended governance/custody model before implementation; per-file provenance matters. |
| Bitcoin BIPs and rust-payjoin | Refresh independent BIP-352 vectors; map a real Payjoin v2 backend into the existing interface. | Separate core/FFI versions and component licenses; qualify the actual WASM artifact. |
| LiteSVM and official TRON/TronWeb source | Independent local execution and serialization oracles. | Development-only candidates; native/package provenance and actual transaction lifecycle need their own evidence. |
| Existing viem AA interfaces | Versioned bundler/paymaster adapters and hash fixtures. | Preserve v0.7 hashing, GhostPay's signature domains, and the receiver policy account's restrictions. |
| Privacy Pools SDK, RAILGUN package, Zama SDK, confidential-contract tests | Complete existing optional adapters and conformance evidence. | SDK source, published artifact, circuit set, transport and live deployment are separate qualification objects. |

The specialized payment, chain and account reports contain additional source-specific recommendations. The table is a prioritization aid, not a complete dependency approval list.

## Sources beyond GitHub

Actual source and license inspection succeeded on **Debian Salsa** for reprotest/diffoscope, **I2P's own Gitea** for tunnel configuration/runtime references, and **GNU Taler's git server** for merchant worker/refund code. Official standards and research also came from W3C/WAI, RFC Editor, ENS, Ethereum proposals, IPFS specifications, SLSA/TUF, the Ethereum Foundation's Reads site and the authors' USENIX paper pages.

Access limits are part of the evidence: Tor GitLab returned unavailable content in the hosting investigation; the advertised Nayuki GitLab mirror was not independently retrieved in the recovery lane. Those are discovery/reference links, not claims of successfully reviewed source. A GitHub mirror and its upstream forge are the same project, not two independent implementations.

## Rules for acting on the notes

1. **Choose the adoption mode.** Dependency, narrowly adapted code, test fixture/tool, and architecture reference have different shipping and maintenance consequences.
2. **Pin the actual adopted artifact.** A research HEAD, a package version string, a registry tarball and a signed release are different pieces of evidence.
3. **Verify the selected file and dependency terms.** Keep required notices and a provenance record. Do not infer a whole repository's terms from a badge or one SPDX header.
4. **Preserve the current supported-build boundary.** A package's existence or a useful upstream project does not make it a lean feature.
5. **Use the existing owner and seam.** Read current PRs before edits; preserve earlier reports instead of rewriting their historical claims.
6. **Report execution honestly.** Proposed acceptance cases remain unrun until executed against a named commit/build/profile. Contributor-reported tests stay attributed to that contributor.

The only downloaded upstream material added to this documentation packet is the two dated Chainlink JSON data snapshots. No upstream application code, runtime dependency, release workflow, chain configuration or production endpoint was changed by this research.
