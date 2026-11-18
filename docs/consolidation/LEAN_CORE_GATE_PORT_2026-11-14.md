# Lean-core reachability gate port (2026-11-14)

Test: `scripts/tests/lean-core-reachability.test.mjs` (from #151). Ported onto integration without widening the reviewed gate.

## apps/web workspace closure
REVIEWED (unchanged from #151): address-safety, btc-silent-payments, chain-adapters, core-crypto, invoice-schema, qr-exchange, secret-box, solana-stealth, tron-adapter, tx-review.

PENDING_OWNER_REVIEW (on integration, not owner-reviewed for lean core): net-transport (61e790da), payment-uri (bff25c1d), pir-two-server (62e6a449, transitive via scan-source), policy-scheme (ca9bbbd7), scan-source (61e790da), ux-vault (5ee84c91).

The test asserts closure == REVIEWED + PENDING exactly. A new dep fails; a PENDING entry that leaves the closure fails. No deferred btc/solana/tron package is in PENDING.

PENDING = not owner-reviewed; owner must accept (move to REVIEWED) or remove.

## Shell files
"Only the app shell mounts deferred views" now expects App.tsx and AppShell.tsx. AppShell.tsx is the shell body extracted from App.tsx (5a3b6aac). Open point for owner: AppShell.tsx imports features/registry/RegistryView and AppLean.tsx mounts AppShell, so the lean profile source-reaches the deferred registry view. The unchanged "core flow sources never reach deferred code" test still passes.

apps/relayer closure allowlist is unchanged.
