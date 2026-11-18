# Lean web build implementation

Authority: owner-approved `LEAN_RELEASE_SCOPE.md` and the November2 decision to proceed from verified published source while unavailable7979 remains unresolved. Base: `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2`, tree `86214bc44259326379239a99bfd2c3bd8572997a`. This is a build-isolation slice, not release acceptance or a production configuration decision.

## Profile and source contract

`GHOSTPAY_LOCAL_BUILD_PROFILE` accepts exactly `full` or `lean`; absence preserves `full`, other supplied values fail. Production lean redirects only `./App` from this web root's `src/main.tsx` to `AppLean.tsx`. Full source and the complete test matrix remain present. Root lockfiles, package scripts, workflows, release signing and production trust settings are outside this slice.

Earlier `371d235c3e5926014c00e027196b6aa567ea1b82` profile helper/shell separation is source reference, not a replacement for current protections. Its older shell unconditionally wipes seller keys at idle and lacks current backup/session/error/localization guards. New AppShell derives from current70d8 App, preserving recoverability-checked idle wiping, version guards, app-lock signal, backup banner, create BackupGate, translations, fragment handling, RPC cache, focus and ErrorBoundary. Full App supplies optional BTC/Solana/TRON/policy views and existing embedding startup. Lean allows home, seller, create, pay, scan, sweep, public EVM registry, settings and about; unsupported internal view selections return home. Full navigation remains compatible.

SellerKeys accepts an optional archive node without importing TagArchive. Full App supplies the existing TagArchive; lean supplies none. Encrypted key backup/restore, cancellation and session checks remain unchanged. Archive source/tests are preserved.

Shared shell profile is optional `full | lean`, default `full`. Lean passes `supportedOnly=true` to Pay; full passes false. This depends on the separately owned Pay `supportedOnly` guard for incoming v2/buffer-policy and fiat-quote invoices. The shell slice alone is not that parser/payment guard and cannot qualify it.

Lean imports no embedding startup. Pay's existing shared `notifyEmbedDone` seam may remain only as an inactive notification path: no startup/active-host creation is reachable. No fake provider, runtime stub or synthetic module replacement is introduced. Actual rendered module exports must show no startup/profile-fetch exports and no rendered embed protocol. Public embed SDK files are not copied. This slice does not claim all Pay fiat or gas-buffer-policy controls are removed; those core-view concerns require separate work.

## Actual build evidence

Lean build hooks inspect actual application AND Worker chunk-module facts. Missing/malformed metadata or missing Worker proof fails closed. Positive rendered full-App/optional-chain/policy/TagArchive/archive-import/embed-protocol modules are rejected. Zero rendered length is retained distinctly from absent facts; the admitted shared embed-host seam cannot render exports beyond `notifyEmbedDone`. Worker proof comes from actual Worker build hooks, not fabricated report entries. An emitted source-relative evidence JSON asset records application/Worker chunks, profile and copied public paths.

Only lean disables Vite's default public copy and copies normal public files itself, omitting both preserved embed SDKs. Source symlinks/special files and unexpected executable public assets are refused. Full default output behavior remains unchanged. Optional `GHOSTPAY_LOCAL_MODULE_REPORT` is an absolute new evidence path outside output, created exclusively; in-artifact module IDs omit absolute host paths. Build facts prove only their module/isolation boundary, not scanner/RPC/transaction/security acceptance.

## Qualification

Pure Node regressions use no subprocess or network. React component regressions require real repository dependencies and cover lean routes/refusal, backup/idle/session protection, archive absence and full compatibility. Full tests, typecheck/lint, actual full+lean Vite/Worker builds, emitted contents, reproducibility and supported-flow browser tests remain acceptance gates. Existing coverage/KDF/fuzz/security thresholds remain unchanged. No install, deployment, release/tag, production transaction or permission bypass is authorized here.
