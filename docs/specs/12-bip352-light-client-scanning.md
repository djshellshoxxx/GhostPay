# 12 BIP-352 light-client scanning

> **2026-11-16 implementation:** The full-profile Bitcoin view has an isolated scan worker, opt-in encrypted continuity, own-node Esplora full-block checks, explicit BlindBit HTTP/HTTPS gRPC-Web selection, all-block cross-checks, and optional light scanning. Light matches require raw-transaction/Merkle inclusion against the checked header chain and current Esplora outspend checks, including restored matches. Source changes cancel work, clear spend authority, and separate encrypted oracle-policy scopes. See [source handoff](../handoffs/agents/TEAM_H_SOURCES_UNIFIED.md) and [worker handoff](../handoffs/agents/TEAM_H_WORKER_UNIFIED.md). Real-node/proxy and physical-device acceptance remain unperformed; mocked regtest evidence does not satisfy those gates.

Priority P2-P3 | Effort M-L (8-12 d) | Owner: btc-silent-payments | Deps: 11, 10 (shared disclosure model)
Sources: research s3 (Appendix A open research; ~30 MB/month for 3-day scans, July 2024 taproot usage); MULTICHAIN s3/s4; DEVIATIONS (gRPC, own-node, persistence missing).

## 1. Modes and disclosure table (shown in UI before enabling)
| Mode | Scan key leaves client? | Server learns | Bandwidth |
|---|---|---|---|
| A own-node Esplora with local `EsploraTweakSource` (default path) | no | selected Esplora sees IP, block range and outspend queries; an own local node keeps this local | full blocks plus headers |
| B explicitly selected BlindBit HTTP or HTTPS gRPC-Web | no | oracle sees IP/block range; light proof queries reveal matching transaction IDs to Esplora; outspend queries reveal matched outpoints | full mode retains full-block bandwidth; light mode fetches tweaks/outputs and matched transaction proofs; no current size estimate claimed |
| C hosted scan service (Frigate-style) | yes (scan key) | all incoming payments | minimal; loudly labelled opt-in, own ToS (MULTICHAIN s4) |
Hosted mode C remains absent and ADR-gated. BlindBit gRPC schema/transport provenance is pinned in the worker handoff. Deployed server/proxy compatibility is not demonstrated by fixtures. HTTP is the legacy adapter; full, unfiltered capabilities and exact network identity are required at runtime.

## 2. Interfaces
```ts
interface TweakSource { tweaks(height: number, signal): Promise<Uint8Array[] /*33B pubkeys*/>; filter?(height): Promise<GCSFilter>; tip(): Promise<{height; hash}> }
class EsploraTweakSource implements TweakSource // own-node Esplora + local BIP-352 tweak calculation, txid Merkle and BIP-141 witness checks
class BlindBitGrpcClient implements TweakSource // optional HTTPS gRPC-Web beside legacy HTTP
interface ScanState { network; lastHeight; lastHash; recent: {height,hash}[] /*reorg window 100*/; birthHeight }
```
Persistence: encrypted IndexedDB (same keystore pattern as spec 08) storing `ScanState` and matched outputs; reorg: on hash mismatch roll back to common ancestor and rescan, matches above it become `pending`. Scan from `birthHeight` only; resumable; Web Worker with cancel. Verify oracle tweaks against own header chain/ Merkle when mode A or optional SPV check; two-oracle cross-check option. `Kmax` and k++ per spec 11.

## 3. Threats
Oracle serves wrong/omitted tweaks (cross-check, own node); query pattern leaks interest (Tor via spec 10 transport); scan key exfiltration in mode C (explicit consent, never default, separate from spend key); DoS by large blocks (caps); reorg corruption.

## 4. Tests
Regtest bitcoind in CI (if available) generating SP payments; mock oracle with forged/omitted/ reorged data; resume after crash; scan-key-never-in-request assertion for modes A/B.

## 5. Acceptance
- [ ] Mode A and B pass regtest e2e. - [ ] Disclosure table in UI/docs. - [ ] Mode C absent unless ADR approved.

## Implemented verification boundaries

The default full-block mode recomputes transaction IDs, block Merkle roots and BIP-141 witness commitments against locally checked headers. It excludes coinbase and ineligible transaction outputs before scanning. It does not validate all Bitcoin scripts/prevouts/consensus. An optional oracle must agree on every scanned block's complete tweak/output multisets before results or checkpoints are accepted; extra, missing or changed entries fail closed. A second selected oracle can cross-check every block in either mode, including blocks with no wallet match. Different origins are required but do not establish independent operators.

Light mode never treats oracle metadata alone as spend authority. Every matched raw transaction must reproduce the claimed txid and exact taproot script, amount and output index, then verify its Merkle branch against the expected height and checked header hash. Coinbase outputs are rejected. Historical matches are re-derived and freshly proved on restoration. This proves inclusion, not witness validity, tweak correctness, payment completeness or the best chain. Colluding oracles may omit payments. Current spent status remains the explicitly selected Esplora server's report, checked again before broadcast by the existing sweep flow.

The source UI starts with Esplora only and no oracle URL. No keys leave the worker through either bounded main-thread transport. Oracle source/mode edits cancel asynchronous work, wipe results/review/signatures and turn saved continuity off until selected again. Oracle continuity is cryptographically scoped to network, wallet, normalized Esplora URL, oracle protocol/URL, mode and optional second endpoint; endpoint details are not persisted in plaintext. The established full-block scope remains compatible and always revalidates historical matches.

Mode A uses the already implemented own-node Esplora architecture. A second direct bitcoind JSON-RPC adapter would duplicate local tweak extraction and introduce browser RPC credentials/CORS without adding a required verification property. It is an alternative deployment architecture, not an unimplemented requirement for own-node scanning. No RPC credentials, default oracle, scan-key service, Tor transport or mainnet enablement were introduced.
