# Dependency review for dormant module consolidation

## Exact graph change

The web manifest adds two already existing workspace dependencies, both at `0.1.0`: `@ghostpay/ux-receipts` for F05 and `@ghostpay/merchant-billing` for F10. The latter already depends on `@ghostpay/merchant-hooks`, so the web closure gains three package names. F04 adds no dependency.

The root lockfile changes only those two entries inside `packages["apps/web"].dependencies`. Independent structural comparison verified all 671 external package records, package versions, integrity data and existing workspace link identities remain unchanged. No new package record, external version or downloaded artifact is introduced by the graph change. A clean offline installation and source library build passed; exact receipts belong in [EXECUTION.json](EXECUTION.json).

F05 reuses the existing receipt digest implementation. F10 reuses existing billing period arithmetic. These packages supply local logic; this integration does not start a hosted merchant service, activate reminder processing or create payment authority. Their entire dependency closure remains visible to repository checks even though the new consumers are dormant.

## Review classification and isolation

`@ghostpay/ux-receipts`, `@ghostpay/merchant-billing` and `@ghostpay/merchant-hooks` are explicitly listed as **PENDING_OWNER_REVIEW**, with donor provenance. They are not added to the release-approved reviewed set. The existing exact closure assertion still rejects unrecorded additions and stale entries. The generated package map now records the actual graph.

A separate maintained guard requires production source outside the three dormant directories to remain disconnected from those directories and package names. It checks static imports, re-exports, literal and nonliteral dynamic/CommonJS imports, directory entry points, Vite root paths/suffixes, relevant glob patterns and worker URL references. Eight maintained cases passed; independent review also ran twelve cases including additional probes.

This is a static policy guard for the supported source forms, not a complete bundler resolver or an emitted-artifact proof. Aliasing or new loading mechanisms need review. Separate full/lean builds and original bundle scans passed at source `751ca76d6b0b3a09b5712b01723b3c230978ef52`. The full and lean inventories contain 541 and 344 module entries, with none from the three dormant modules or newly admitted workspace packages. All 19 full and 17 lean artifact files are byte-identical to the corresponding builds from main `eb59d93cffed7848c4aac37d0e9650b87239c6da`; independent review verified the digests and normalized inventories. Exact-source hosted Node 22 and browser qualification remain pending. No route/provider activation or completed-feature claim follows from this dormant composition.
