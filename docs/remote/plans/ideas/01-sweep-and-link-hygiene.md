# Plan: Sweep and link hygiene (A3 + A1 + A4)

Spec: [docs/specs/ideas/01-sweep-and-link-hygiene.md](../../../specs/ideas/01-sweep-and-link-hygiene.md). Branch `claude/remote-extensions-3`, 2026-10-21. Owners are roles: WEB = apps/web, INV = packages/invoice-schema, DOC = docs/ADR. Days are single-engineer guesses (about 17 d total), unverified.
Constraint for every phase: 100% client-side, static hosting, no backend, no operator service, no new egress host. Any task that would need one is dropped, not deferred.

## Phase 0 - Foundations (2 d)
| Task | Owner | Days |
|---|---|---|
| Copy lint test (banned words) wired into `vitest`; baseline on current Sweep/Create/Pay strings | WEB | 0.5 |
| `extractFragment` hardening: bare `gpi=v1.`, wrapped lines, caps, tests/property | WEB | 1 |
| ADR drafts: ADR-0005 amendment (new alg), xpub-only destination decision | DOC | 0.5 |
Gate P0: tests green; no behaviour change for existing links.

## Phase 1 - A3 wizard, offline heuristics (5 d)
| Task | Owner | Days |
|---|---|---|
| IDB v1->v2 upgrade; `sweepLog.ts` encrypted store (HKDF labels, HMAC lookup), wipe, memory fallback | WEB | 2 |
| `sweepHygiene.ts` `assessDestination` F1-F5, thresholds file | WEB | 1 |
| Wizard UI in `Sweep.tsx` (steps, findings, override rules), record log after sweep | WEB | 1.5 |
| Docs: `sweep-and-gas-privacy.md`, THREAT_MODEL D1 row wording | DOC | 0.5 |
Gate P1: component + IDB dump tests (no plaintext); `checkDestination` untouched; egress audit shows zero new requests.

## Phase 2 - A3 fresh destinations and chain lookup (3.5 d)
| Task | Owner | Days |
|---|---|---|
| Add `@scure/bip32` (exact pin); xpub parse/derive/reject-private; vectors | WEB | 1.5 |
| Destination list + linked list UI in Settings; index-0 confirmation flow | WEB | 1 |
| Opt-in RPC lookup F6-F8; assert zero RPC calls when off | WEB | 1 |
Gate P2: derivation matches independent vectors; Playwright sweep-to-xpub e2e; privacy-limits.md note on RPC visibility.

## Phase 3 - A1 passphrase links (4.5 d)
| Task | Owner | Days |
|---|---|---|
| `A256GCM-SCRYPT` encode/parse, `PassphraseRequiredError`, fixed params, size-before-KDF | INV | 2 |
| KATs cross-checked with Node scrypt/webcrypto script; fuzz + negative suite | INV | 1 |
| Create UI (link/payload/QR, generate passphrase, Crockford base32), Pay passphrase prompt | WEB | 1 |
| Docs: review-and-pay guide, privacy-limits limit 2, THREAT_MODEL S3-03 row | DOC | 0.5 |
Gate P3 (also audit gate): feature flag default off until audit checklist (spec s14) items for the envelope are signed off in `docs/reviews/`; ADR-0005 amendment merged.

## Phase 4 - A4 sweep window (3 d)
| Task | Owner | Days |
|---|---|---|
| `sweepSchedule.ts` wrapper over `DelayScheduler`/`randomDelayMs`, Web Locks guard, due-time procedure | WEB | 1.5 |
| Pending-plan storage (non-secret), UI card, settings keys, lock-extend option | WEB | 1 |
| E2E: short window, reload mid-window, two tabs, fee-cap abort | WEB | 0.5 |
Gate P4: nothing signed or key-bearing persisted (storage grep test); copy review; "What this does NOT hide" shown.

## Phase 5 - Review and rollout (1 d + external)
Full-suite run (unit, property, anvil e2e, Playwright egress, `scan-bundle.mjs`); static-server smoke test; spec acceptance boxes ticked in PR; flags: wizard on, xpub on, passphrase links on after Gate P3, schedule on last. Old clients fail closed on the new alg.

## Dependencies and risks
- Soft deps: spec 08 vault rotation (`keyVersion`), spec 06 (registry wallet finding), scanner first-seen timestamps (optional F5).
- Risk: envelope change touches the signature-critical package; keep the diff to one new branch and reuse the inner strict path.
- Risk: users read "no warnings" as safe; mitigated by fixed copy, no green states.
- Rejected on constraint grounds: hosted address intelligence, server-side expiring/one-time links, relayer-held pre-signed delayed sweeps, background/closed-tab sweeping.
