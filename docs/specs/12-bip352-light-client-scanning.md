# 12 BIP-352 light-client scanning

Priority P2-P3 | Effort M-L (8-12 d) | Owner: btc-silent-payments | Deps: 11, 10 (shared disclosure model)
Sources: research s3 (Appendix A open research; ~30 MB/month for 3-day scans, July 2024 taproot usage); MULTICHAIN s3/s4; DEVIATIONS (gRPC, own-node, persistence missing).

## 1. Modes and disclosure table (shown in UI before enabling)
| Mode | Scan key leaves client? | Server learns | Bandwidth |
|---|---|---|---|
| A own node `TweakSource` (default recommended) | no | nothing | local |
| B BlindBit oracle, tweak-fetch (current HTTP) | no | IP, block range, fetched blocks, that user scans | per-block tweaks + filters (BIP estimate ~30 MB/month, UNVERIFIED for current usage) |
| C hosted scan service (Frigate-style) | yes (scan key) | all incoming payments | minimal; loudly labelled opt-in, own ToS (MULTICHAIN s4) |
Frigate/BlindBit capabilities **UNVERIFIED** (DOC-14): re-verify from primary repos before documenting.

## 2. Interfaces
```ts
interface TweakSource { tweaks(height: number, signal): Promise<Uint8Array[] /*33B pubkeys*/>; filter?(height): Promise<GCSFilter>; tip(): Promise<{height; hash}> }
class OwnNodeTweakSource implements TweakSource  // bitcoind getblock verbosity 3 + local BIP-352 tweak calc
class BlindBitGrpc implements TweakSource        // add gRPC-web client beside existing HTTP
interface ScanState { network; lastHeight; lastHash; recent: {height,hash}[] /*reorg window 100*/; birthHeight }
```
Persistence: encrypted IndexedDB (same keystore pattern as spec 08) storing `ScanState` and matched outputs; reorg: on hash mismatch roll back to common ancestor and rescan, matches above it become `pending`. Scan from `birthHeight` only; resumable; Web Worker with cancel. Verify oracle tweaks against own header chain/ Merkle when mode A or optional SPV check; two-oracle cross-check option. `Kmax` and k++ per spec 11.

## 3. Threats
Oracle serves wrong/omitted tweaks (cross-check, own node); query pattern leaks interest (Tor via spec 10 transport); scan key exfiltration in mode C (explicit consent, never default, separate from spend key); DoS by large blocks (caps); reorg corruption.

## 4. Tests
Regtest bitcoind in CI (if available) generating SP payments; mock oracle with forged/omitted/ reorged data; resume after crash; scan-key-never-in-request assertion for modes A/B.

## 5. Acceptance
- [ ] Mode A and B pass regtest e2e. - [ ] Disclosure table in UI/docs. - [ ] Mode C absent unless ADR approved.
