# Wiring: `@ghostpay/hops` (owner of apps/web and relayer)

Package is pure logic; nothing below is done. Testnet chains only.

| File | Edit |
|---|---|
| root `package.json` workspaces / tsconfig refs | register `packages/hops` (if not auto-globbed) |
| `apps/web/package.json` | add dep `@ghostpay/hops` |
| `apps/web/src/lib/settings.ts` + `sanitizeSettings` | `hopMode: { enabled: false, hops: 2, delay: {minMs: 600000, maxMs: 43200000, maxTotalMs: 604800000}, relayerSelection: 'rotate', finalDestination: 'self-derived', handoff: 'none', autoContinue: false, ackWeakAtMs?: number }`. Default off; clamp hops 1..4 (0..2 with pool-exit); `direct` only with hops 1 (and unsupported today). |
| `apps/web/src/views/Settings.tsx` | toggle; enabling opens a blocking dialog showing `labels.TITLE`, all `labels.BODY_POINTS`, and a required `ackWeak` checkbox; on ack set `ackWeak: true` in the plan input. Show `labels.LIMITATIONS` under "Limits". |
| `apps/web/src/views/Sweep.tsx`, `lib/sweep.ts` | if `hopMode.enabled`: build `HopPlanInput`, call `planHops`, render `previewCost(plan).text` and `fingerprintReport(plan)` (always show `singleSweepFeeBps` next to `totalFeeBps`), then a leg list with a `labels.WEAK_BADGE` badge, state, `dueAtMs`, relayer id, tx hash; `overdueLegs` -> `labels.OVERDUE_NOTICE`; run `tick` on unlock/visibilitychange and call `runHopLeg` for `due` legs (prompt, or auto if `autoContinue`); on startup `resumePlan` for stored plans (flag that `nonceUsed` reveals the address to the RPC). |
| `apps/web/src/lib/hopPorts.ts` (new) | implement `RelayerClient` (HTTP, per-relayer optional proxy; no cookies, no plan id; body exactly `SweepSubmission`), `ChainReader` (viem reads: ERC-20 `balanceOf`, relayer `nonceUsed`, `PermitReader`), `SignPort` (confirm dialog / autoContinue), `PlanStore` = `createSealedPlanStore(idbBlobs, sealerOverSecretBox)`. |
| `apps/web/src/lib/keystore.ts`, `idbStore.ts` | persist/export `HopPlan[]` via `serializePlan` (no keys, no signatures). |
| `HopAddressSource` | adapter over `@ghostpay/hygiene` allocator: `next()` returns `{index, address}`; `withSecretAt(index, fn)` derives via `deriveStealthSecret`, zeroises on exit (also on throw); `isUsed` from the hygiene ledger; share allocation with hygiene destinations. |
| Token capability | probe ERC-2612 support, pass `tokenSupportsPermit`; show `NO_PERMIT` reason and hide the mode for USDT-like tokens. |
| Pool exit | for `handoff: 'pool-exit'` default `hops` via `defaultHops('pool-exit')` = 0; pass `handoffInfo(plan, addrs).terminal`/`withSecret` to the pool stage; never add hop delay to dwell/anonymity estimates (`creditedDelayMs` is 0); never plan hops with `stage: 'post-exit'`. |
| `docs/user/privacy-limits.md` | add `labels.LIMITATIONS` N1..N9 verbatim. |
| `apps/web/src/lib/jitter.ts` | optional: share `randomDelayMs` and delete the copy in `packages/hops/src/rand.ts`. |
| `apps/relayer` | no source change. Add tests AT-HOP-RLY-1 (3-leg plan: logs/metrics hold no owner/destination/plan correlate). |
| UI strings | ship none of: anonymous, anonymis, untraceable, mix, launder, obfuscat, private; reuse `labels.findBanned` in the web lint/test. |
