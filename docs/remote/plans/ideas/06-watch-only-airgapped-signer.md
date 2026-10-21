# Plan: 06 watch-only mode and air-gapped sweep signer (idea D2)

Spec: `docs/specs/ideas/06-watch-only-airgapped-signer.md`. Branch `claude/remote-extensions-3`, 2026-10-21. Estimates are single-engineer days, unverified guesses. Roles: WEB = apps/web, SP = new `packages/signer-protocol`, CA = chain-adapters, DOC = docs/ADR, OWN = project owner.

## Preconditions
- Spec 01 (manifest read-back) merged: the signer embeds a read-back-verified manifest at build time.
- B1/spec 08 (encrypted backup + restore drill) available, since the offline keystore is the only copy of the spend key.
- ADR-0020 (draft): QR decoder choice (BarcodeDetector vs pinned pure-JS lib), file:// Web Crypto behaviour, single-file signer distribution. DOC, 1 d. Blocks M3.
- Owner: release signing key for the signed release manifest (owner-gated).

## Milestones
| M | Work | Owner | Days | Exit gate |
|---|---|---|---|---|
| M0 | ADR-0020; threat-model D7 entry drafted; decide the invoice-key placement (online, v1) | DOC | 1.5 | ADR merged |
| M1 | `signer-protocol`: types, canonical codec, request hash, framing (encode/decode/reassemble), `evaluate()` with every refusal and acknowledgement, unit + fuzz tests | SP | 6 | 100% branch coverage on `evaluate`; fuzz 1M inputs no throw; differential test vs online `signSweep` |
| M2 | Keystore v2 (`profile` in AAD), session union type, `requireSpendSession`/`requireViewSession`, watch-only import/export UI, `WATCH_ONLY` UX in Sweep view | WEB | 4 | AAD confusion tests pass; type test proves no spend field on watch-only |
| M3 | Signer app (`signer.html`): import keystore, scan/import request, decoded card, hold-to-sign, response QR/file, idle lock, pinned destinations (memory only) | WEB | 5 | Zero-egress + no-storage static tests; manual run on two devices |
| M4 | Online prepare/verify flow: build request (relayed + direct), QR/file output, response import, verification against pending request, relayer submit / raw broadcast | WEB, CA | 3 | Anvil e2e passes with real `GhostPaySweepRelayer` |
| M5 | Build/release: single-file signer with hash-pinned CSP, reproducible build check (2 builds identical), hash in release manifest, `scan-bundle` extended to the signer | WEB | 2 | CI reproducibility job green |
| M6 | Camera reliability matrix (3+ devices, 2 QR sizes), timing/UX polish, accessibility of the confirmation card | WEB | 2 | Matrix recorded; failures have file fallback |
| M7 | Docs: user guide (create keys offline, verify hash on a second device, rotate if key was ever online, honest limits), threat-model update, `privacy-limits.md` | DOC | 1.5 | Reviewed against spec s8 word for word |
| M8 | Self-review in `docs/reviews/`; fix list; then external audit slot (owner-gated) | all | 2+ | Audit checklist (spec s14) all ticked |
Total about 27 d including docs, before the external audit.

## Order and parallelism
M0 -> M1 -> (M2, M3 in parallel after M1 types freeze) -> M4 -> M5 -> M6 -> M7/M8. Spec 07 `receipt-attest` action reuses M1 and M3; add it as a follow-up after M3 (about 2 d) rather than expanding M1.

## Test gates (each PR)
TS unit; `evaluate` table tests; Playwright egress on both the app and the signer; anvil e2e with real relayer; bundle scan; lint; reproducible-build job; manual camera matrix at M6.

## Risks
| Risk | Mitigation |
|---|---|
| QR decoder library supply chain / unreliable on some devices | Pin exact version, fuzz, file fallback; ADR |
| `crypto.subtle` or camera on `file://` unavailable (UNVERIFIED) | Serve same bundle from the static host path as secondary; test early in M3 |
| Users skip reading the offline screen | Pinned destinations, typed partial-address confirmations, hold-to-sign; documented residual risk |
| Users believe moving an exposed key makes it safe | Wizard copy and docs: rotate meta-address |
| Scope creep (hardware wallets, WebUSB, CLI) | Non-goals in spec; CLI as a later stage reusing `signer-protocol` |

## Rollback / flags
Watch-only is an additive profile kind; v1 keystores load unchanged. Feature flag `airgapSigner` hides UI until M6 passes. The signer bundle is separate, so removal does not touch the main app.

## Definition of done
Spec s11 all ticked; audit checklist s14 ticked or findings tracked; user doc published; release manifest includes the signer hash.
