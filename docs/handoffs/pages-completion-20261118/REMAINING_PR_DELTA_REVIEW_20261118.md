# Remaining #211 / #218 / #223 review — 2026-11-18

This read-only source review compares the PRs below with combined local runtime
`e85db1ef942bda9cb54317a6c036a22484b46ff9`. It does not adopt their historical test counts as new execution.
The complete branch inventory remains anchored to starting main `dfc75ef2087fa6463ae59e0818abec01796c578d`.
No remote mutation was performed by this reviewer.

| PR | Exact source head | Ahead / behind combined snapshot | Disposition |
|---|---|---:|---|
| [#211](https://github.com/djshellshoxxx/GhostPay/pull/211) | `a92658b1ef6b95ff0145b2e1933d0047d51289d5` | 48 / 73 | EXTRACT selected value; preserve/defer the remainder |
| [#218](https://github.com/djshellshoxxx/GhostPay/pull/218) | `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e` | 34 / 73 | EXTRACT selected value; preserve/defer the remainder |
| [#223](https://github.com/djshellshoxxx/GhostPay/pull/223) | `cce7a7f7e548130afba2ef6b2be518ca5b667ade` | 1 / 73 | EXTRACT selected value; preserve/defer the remainder |

## #211: private slots superseded; preserve experimental hardening

The checkpoint work (`675270d5`, `6ff3dd85`, including session-bound key lending and legacy cleanup) is
superseded by the independently reviewed #235 v4 implementation. Do not import either incompatible v3 format
or its old migration policy. Its `appLock.ts` difference is a comment associated with the full-profile backup change.

The remaining coherent lanes should remain visible in the backlog:

| Lane | Source anchors | Value and disposition |
|---|---|---|
| G1/G1c/G1d policy hardening | `62d2ff29`, `f2f35909`, `60f44acd`, `ca2c6b75` | Asset coverage, decoder/metadata binding, typed-data shape, limit leaf recomputation, safe secret-copy order. Useful security work for the experimental policy path, not a lean Pages prerequisite. Preserve with its tests and separately qualify before enabling that path. |
| G2 backup clipboard removal | `44714f41`, `ea62d473` | Removes full-profile BTC/Solana/TRON secret clipboard paths. Keep with those view tests and locales; those routes are absent from CORE_ORDER. |
| G4 focus regression | `407868a1f3c5753786cad612636c079064d693ca` | `apps/web/e2e/focus-scope.spec.ts` pins accepted focus after valid/invalid invoice paste. It adds a regression, not a confirmed missing runtime fix. Preserve for a browser-capable lane; no test execution is claimed here. |
| G5/G5b optional-chain/CLI formats | `b290426e`, `1b28f355` | Align Solana/TRON metadata, fail closed on unbound TRON memo, enforce CLI network/legacy handling. Separate full-profile compatibility scope and overlap with #218 CLI. |

The #211 handoff states that the contextual-help overlay experiment was rejected because it broke existing
interaction tests. It is not part of the source head and should not be recovered as an accepted fix.

## #218: shared signer behavior covered; server/CLI lane remains separate

The shared invoice enforcement block matches the #234 behavior already integrated: a requested pinned-signer
policy rejects invalid signatures first and unpinned valid signers second, while absent/false policy preserves the
review result. Remaining envelope/ux-core differences are explanatory wording, not an additional mandatory Pay gate.
The existing Pay UI supplies its optional pin set but does not globally set `requirePinnedSigner`.

The only additional web runtime change is commit `8db74f4fa486f41fd7476723ba57b90f56ffa3bf`: treat a future
`429 client_queue_full` refusal as pre-broadcast. Current integrated server source does not emit that code. Leaving
this classifier unchanged keeps the conservative uncertain-send lock; bring the client addition and its emitted-code
regression together if the corresponding #218 server lane is later integrated. Do not overwrite the current #222
request padding when extracting that one-line classifier addition.

CLI argument/path redaction, relayer admission/fee/logging changes and bounded limiter eviction remain useful,
separately scoped work. Their previous author-run results are historical. #218's title also mentions fixes whose
handover explicitly delegates them to other branches; the title is not proof they are implemented in its tree.

## #223: refreshed documentation, not a whole-commit cherry-pick

The useful current facts are the expanded workspace wiring, explicit testnet names, postbuild scanner path, seven
TypeScript shards, contracts-extra aggregate dependency and required-Anvil prerequisite behavior. The original
current-main statement and package import inventory are already stale against the combined source. Its old
head/CI wording must not become a current qualification claim.

A separately authorized docs branch, `integration/ghostpay-doc-evidence-20261118`, refreshes README and privacy
facts from the pinned combined source, adds `TM_IMPLEMENTATION_20261118.md`, and corrects the deployment-manifest
trust boundary. The coordinator owns its integration and the final completion report. No runtime code or test
behavior is changed by that branch.

## Concrete remaining Pages limits surfaced by the handover

1. **Secondary RPC scope.** `AppShell.tsx` provides primary `getRpc` and separate `getSecondaryRpc`; ordinary
   Pay/Sweep use the primary in `verifyManifestForFlow`. Settings accurately says the second provider is for Scans.
   `docs/DEPLOYMENT_MANIFEST.md` previously claimed automatic agreement for a supplied second provider, while spec 01
   section 3.5 describes the optional `requireTwoProviders` contract. The documentation branch corrects the current
   behavior. Adding another Pay/Sweep observer requires a deliberate behavior/disclosure change, not a silent merge.
2. **Plain-HTTP loopback CSP.** The local-proxy validator accepts loopback HTTP, but index.html/_headers allow only
   self/https/wss and the build allowlist parser rejects HTTP. A cross-origin plain-HTTP proxy is therefore blocked.
   Source acceptance of the URL is not browser reachability. The current CSP remains intact; this compatibility
   requirement remains partial until a reviewed, browser-qualified design is selected.
3. **Passphrase scratch bytes (LF-4ffb7a99b-4).** At the reviewed snapshot, `keystore-portable.ts` passes temporary
   normalized UTF-8 passphrase bytes inline to scrypt and only wipes the derived raw key. This is a real low residual
   best-effort cleanup opportunity. The coordinator subsequently fixed it at `e8c77e7e8699dd16b86b7a1ff90b834594d07105`: four baseline
   failures become four passes. Independent source review found no blocker; see
   `KEYSTORE_SCRATCH_INDEPENDENT_REVIEW_20261118.md`. This later evidence does not change what the e85db1ef
   snapshot contained. Immutable JavaScript strings remain unwipable.

No additional newly introduced Pages runtime blocker was established by this bounded comparison. The residual
items and unqualified full-profile work remain visible; the absence of a new blocker is not an external security audit.
