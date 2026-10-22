# Plan: idea 03 (A2) per-client meta-addresses

Spec (ADR-style): [../../../specs/ideas/03-per-client-meta-addresses.md](../../../specs/ideas/03-per-client-meta-addresses.md). Branch `claude/remote-extensions-3`, 2026-10-21. Owners are roles: CC = core-crypto, WEB = apps/web, DOC = docs/ADR, REV = independent reviewer, OWN = project owner. Estimates are single-engineer days and unverified guesses. 100% client-side: no task creates or depends on a server.

## Phase 0: decision before code (no production code merged)

| # | Task | Owner | Days | Exit check |
|---|---|---|---|---|
| 0.1 | Circulate the spec; resolve open review points (legacy-seed dual use, default caps, grace period, backup cadence N=5) | DOC, OWN | 1 | written answers appended to spec |
| 0.2 | Measure ECDH+keccak per child in Chrome and Firefox on a reference laptop and a low-end device; update section 7 table and cap | CC | 0.5 | numbers with device/browser/date in spec |
| 0.3 | Vector implementations B (Web Crypto, test-only) and C (Python stdlib script) generating `a2-v1.json` from section 4 text alone, by someone other than the `hd.ts` author if possible | CC | 1.5 | B and C agree byte for byte; provisional vectors in spec reproduced |
| 0.4 | Add ADR to `docs/adr/ADR-LOG.md` (status Accepted) with exact strings and the vector file SHA-256 | DOC, OWN | 0.5 | ADR merged |
Gate D: ADR accepted, vectors agreed. Nothing below merges before Gate D.

## Phase 1: core derivation

| # | Task | Files | Owner | Days | Exit check |
|---|---|---|---|---|---|
| 1.1 | `hd.ts` (seed, roots, children, legacy seed), `SecretSeed` redacting type, new error codes, test hook for ctr loop | `packages/core-crypto/src/{hd,secret,errors,index}.ts` | CC | 1.5 | implementation A matches `a2-v1.json`; negative vectors; property test (random seeds/indices: spend != view, deterministic, no throw for valid input) |
| 1.2 | End-to-end vector: child meta + fixed `r` -> stealth address -> `deriveStealthSecret` round trip | `vectors.test.ts`, `differential.test.ts` | CC | 0.5 | differential vs ScopeLift package passes for derived children |
| 1.3 | Independent crypto review of 1.1-1.2 against spec section 14 | REV | external | signed checklist in `docs/reviews/` |

## Phase 2: storage, session, backup

| # | Task | Files | Owner | Days | Exit check |
|---|---|---|---|---|---|
| 2.1 | Session `mode: 'legacy' | 'a2'`, `enablePerClient`, `allocateChild` (write-ahead), `childSecrets` | `apps/web/src/lib/session.ts` | WEB | 1.5 | unit tests: legacy upgrade derives the expected seed; secrets never in public summary |
| 2.2 | Encrypted child registry + allocator store (IndexedDB), integrity re-derivation on load | `apps/web/src/lib/children.ts` (new), `idbStore.ts` | WEB | 1 | storage inspection test: ciphertext only |
| 2.3 | Backup `keys` v2: B1 section if idea 04 merged, else keystore v2 with v1 still accepted | `keystore.ts` or B1 module | WEB | 1.5 | round trip; legacy-origin seed recomputed; tamper and mismatch rejected; fixture v1 keystore recovers all children |
| 2.4 | Tag vault v2 keys from `vaultKey`, migrate v1 records (spec 08 `rotateKeys`) | `tags.ts` | WEB | 0.5 | v1 records readable after migration; v1/v2 info strings distinct |

## Phase 3: scanning and claims

| # | Task | Files | Owner | Days | Exit check |
|---|---|---|---|---|---|
| 3.1 | Worker `start` with children list (shared with idea 02 protocol), `childId` in matches | `scannerCore.ts`, `scanner.worker.ts` | WEB | 0.5 | no-network source test green |
| 3.2 | Worker pool, active-set selection, coverage ranges per child per chain, pre-scan estimate | `scanClient.ts`, `workerFactory.ts` | WEB | 1.5 | anvil: payments to 1/4/16/64 children + legacy all found; coverage stored encrypted |
| 3.3 | Claim-by-hash over all children incl. dormant and legacy (idea 02 `runClaim`) | `claim.ts` | WEB | 0.25 | dormant-child payment found by claim |

## Phase 4: UI and guards

| # | Task | Files | Owner | Days | Exit check |
|---|---|---|---|---|---|
| 4.1 | Seller keys "Per-client addresses" panel, clients list, backup prompt every 5 new children | `views/SellerKeys.tsx` | WEB | 1 | component tests; copy review |
| 4.2 | Create invoice client picker; child meta + child signer; `activeUntil` written before link shown | `views/CreateInvoice.tsx`, `lib/invoiceCreate.ts` | WEB | 0.75 | unit: invoices for two clients share no key-derived field |
| 4.3 | Scan header, dormant notice, catch-up scan | `views/Scan.tsx` | WEB | 0.5 | Playwright flow |
| 4.4 | Registry guard (child 0/legacy only) in spec 06 UI; A3 destination-reuse warning across children | spec 06 view, `views/Sweep.tsx` | WEB | 0.25 | guard cannot be bypassed in UI tests |

## Phase 5: verification and docs

| # | Task | Owner | Days | Exit check |
|---|---|---|---|---|
| 5.1 | anvil e2e (multi-child pay/scan/sweep), Playwright egress (unchanged request shapes), storage inspection | WEB | 1 | CI green |
| 5.2 | User docs (set-up, privacy-limits with spec 6.1 list, receive-and-scan), THREAT_MODEL D3, README spec index | DOC | 0.5 | spec section 12 boxes ticked |

Total about 13.5 engineer-days after Gate D, plus external review time. Critical path: 0.3 -> 0.4 -> 1.1 -> 1.3 -> 2.1/2.3 -> 3.2 -> 4.2.

## Dependencies and ordering with other ideas
- Land idea 02 (B7) steps 1-3 first or in parallel; its worker protocol must already take a children list.
- Idea 04 (B1) container preferred for 2.3; if it slips, ship keystore v2 and let B1 import it later.
- Spec 08 tag rotation needed for 2.4.
- Spec 06 and idea 01 (A3) receive small guard/warning changes; coordinate whichever lands later.

## Release gate
Feature flag `perClientAddresses` off by default until: Gate D passed, independent review signed, all spec acceptance criteria met, reference-device cost numbers recorded, and a restore drill (B1) passes with a multi-child backup. Testnets only (ADR-0011, ADR-0015 unchanged).

## Risks
- Derivation defect: mitigated by three-implementation vectors, review, versioned derivation; residual risk is why Phase 0 exists.
- Scan cost on low-end devices: caps, dormant children, claim-by-hash fallback.
- Users skipping backups after adding clients: prompts; labels are lost but funds remain recoverable from the seed.
