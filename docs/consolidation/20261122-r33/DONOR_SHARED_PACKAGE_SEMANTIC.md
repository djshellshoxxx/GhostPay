# R33 — shared browser dependency donor audit (v1.1 vs current main)

Source-pinned full-file comparison: v1.1 `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9`, recovery #372 `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`, main `eb59d93cffed7848c4aac37d0e9650b87239c6da`. The [full Git-tree ledger](DONOR_TREE_DIFF.json) identified **58 donor-vs-recovery differences at paths whose recovery blob equals main**. All are outside `apps/web/src`, but **outside that directory does not mean outside Pages**. Shared `packages/` code may be imported by the static browser application.

Inspected the full donor/main source of six candidate shared/browser-relevant files. In each, #372 retains current main *exactly* while the older v1.1 donor lacks or differs in current validation/abort handling. None is a safe source copy-over.

| File | Main / recovery behavior absent or weaker in donor | Disposition |
|---|---|---|
| `packages/payment-uri/src/query.ts` | Shared `boundBuiltUri` helper bounds constructed URI size to match parser acceptance | Keep current main/recovery |
| `packages/payment-uri/src/bitcoin.ts` | Builder wraps output in `boundBuiltUri`; donor returns unbounded constructed URI | Keep current bound |
| `packages/payment-uri/src/solana.ts` | Builder wraps output in `boundBuiltUri`; donor returns unbounded constructed URI | Keep current bound |
| `packages/payment-uri/src/tron.ts` | Builder wraps output in `boundBuiltUri`; donor returns unbounded constructed URI | Keep current bound |
| `packages/metadata-hardening/src/btc.ts` | Main validates finite positive cap, cap vs minimum, finite normalized fee rate; donor omits these explicit validation checks | Preserve fail-closed cap policy |
| `packages/tron-adapter/src/scan.ts` | Main introduces `assertActive` cancellation checks around async block/TRC20 scan progress; donor lacks these explicit post-await guards | Preserve abort checks and prevent stale scan progress |

The source delta is direct, not a new executed runtime regression. Tests to keep/extend prior to integration: oversize URI builders vs parsers on all supported chains; NaN/Infinity/negative/below-min BTC fee caps; abort while awaiting TRON block batches or TRC20 confirmations without emitting stale matches. Do not reuse donor versions of these files, because doing so could weaken current safety behavior.

**Correction to broad scope triage:** The 14 *absent* donor files are relayer/CLI/contract/tooling/test paths outside Pages browser source, but the other 58 recovery==main paths include shared browser-linked packages; treat those separately, not as universally out-of-scope. Six such shared files are now inspected above; the remaining 52 need runtime-dependency/semantic triage if considered for import.

No code merge, UI, contract, real payment, signing, dependency, release or deployment changes performed. All recovery privacy/custody and generation-11 held lock gates remain active.
