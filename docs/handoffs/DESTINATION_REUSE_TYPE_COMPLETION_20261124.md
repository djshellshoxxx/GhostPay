# PR #586 destination notice type completion — 2026-11-24

## Scope and source identity

- Worker: `/root/local_handoffs`; coordinator: `/root`.
- Worktree: `/workspace/scratch/9723b6705f45/gp-address-reuse-completion`.
- Branch: `finish/destination-reuse-type-20261124`.
- Original #586 head: `f024ce3e0eab91df40bfd5a75aee2a56d9158e5a`; tree `b86ab0da102ab4f7b366acdd23847d8c016958d3`.
- Ownership checkpoint: `a3ae7d47200b03a1f2adbe792cc2a80eab125338`.
- Qualified repaired source: `3de310900e0261bbfbc00fa30383ca9afcd094c7`; tree `3c20f578e5f0f613fb9350ac7e2f06961a61cb8b`.
- Main observed at `706188000c38b3dde5a3a362370a530870aa7587`; this lane does not merge it. Documentation follows the frozen repaired source. The coordinator independently approved the source and authorized publication of a draft child targeting #586's existing branch only.

## #584 and #586 are alternative implementations

Both descend independently from `f76904301cff0b24d65ea4e31cbf37d470db4d95`; neither contains the other. Live PR metadata still identified the original heads at inspection, and a bounded open-PR/ownership check found no newer #586 type-repair successor.

| Candidate | Exact head | Storage and observation boundary |
| --- | --- | --- |
| #584, `codex/287-evm-payment-destination-reuse` | `17c5a2ee3828d0132cfdf21e4c966ca7550d07f2` | `duplicateAttemptJournal.ts` associates `ghostpay.payment-destination.v1.<attempt-id>` fingerprints with existing payment-attempt records. Comparison traverses those records within the payer/chain scope; clearing an attempt removes its optional tag. Wallet-handoff integration and checkout notices distinguish invoice attempts and recipient matches. Sweep is outside this candidate's scope. |
| #586, `codex/287-local-destination-reuse` | `f024ce3e0eab91df40bfd5a75aee2a56d9158e5a` | `destinationReuse.ts` maintains a separate `ghostpay.destination-review.v1` session-storage collection, bounded to 128 salted fingerprints. It remembers deliberate checkout previews and accepted sweep submissions, distinguishing invoice payer/digest scopes from seller sweep scopes. Wallet/account invalidation and explicit preview wording accompany this history. |

The branches overlap Pay, localized copy and destination notices, but differ in when observations enter history, how history is cleared, and whether sweeps share the mechanism. Combining both would need an explicit design decision about those lifetimes. This repair makes no such choice, does not add a second history, and does not claim either branch supersedes the other.

Active adjacent ownership was inspected read-only: wallet-disclosure recovery at `/workspace/scratch/efb8df2579c9/gp-wallet-disclosure-repair`, branch `codex/recover-wallet-disclosure-qualification-20261124`, head `49e03d29e31ed4fe4950882399a9612f9ec66765`; account privacy at `/workspace/scratch/efb8df2579c9/gp-privacy-571`, branch `fix/20261124/encrypted-wallet-revocation-notice`, head `b2d222772fec857b69eb626afe3b8f58c0b8dfbd`. Their runtime, tests and claims are unchanged. Coordination is recorded additively in this branch's `ACTIVE_WORK.md`.

## Confirmed defect and minimal repair

Original hosted evidence: [run 45337786098, job 138253881732](https://github.com/djshellshoxxx/GhostPay/actions/runs/45337786098/job/138253881732), `qualify-ghostpay-web`, failed during the web build. At `2026-11-24T07:33:50Z` it reported:

```text
src/views/Pay.tsx(1290,23): error TS2322: Type 'DestinationNotice | "wallet-changed" | undefined' is not assignable to type 'DestinationNotice | undefined'.
  Type '"wallet-changed"' is not assignable to type 'DestinationNotice | undefined'.
```

The original full web TypeScript invocation reproduced exactly this sole diagnostic locally, exit 2. `Pay` already passes `wallet-changed` when its wallet snapshot expires; `DestinationReuseNotice` already types and renders that value. Only the intervening `FinalPreview.notice` annotation omitted it.

The source repair adds `'wallet-changed'` to that annotation. No cast, suppression, compiler option, runtime body, storage behavior, test, translation, wallet authority or release gate changes. The unchanged compiler is the regression check for this type-only defect; no redundant runtime test was added.

TypeScript 5.9.3 `transpileModule` with the original parsed web compiler options produced byte-identical `Pay.tsx` JavaScript before and after: **75,628 bytes**, SHA-256 `eca0d757eab0d7e78cd80e6f9da2540ea13b73fb65cbb4c929569441f46abbf7`. All other application and test blobs are unchanged from #586.

The root coordinator independently inspected repaired source `3de310900`, the caller at Pay's preview rendering, `FinalPreview` forwarding, and `DestinationReuseNotice`'s existing union/rendering. Review approved: the one-line union matches caller and callee and changes no runtime behavior.

## Executed qualification

From `apps/web`, except lint and secret scan from the worktree root:

| Command | Actual result |
| --- | --- |
| `NODE_OPTIONS=--max-old-space-size=1024 node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` before repair | Exit 2; exactly the hosted TS2322 above. |
| Same original full web TypeScript invocation after repair | Exit 0, no diagnostics. |
| `NODE_OPTIONS=--max-old-space-size=768 node ../../node_modules/vitest/vitest.mjs run src/lib/destinationReuse.test.ts src/lib/destinationWalletScope.test.ts --maxWorkers=1 --no-coverage` | Exit 0; both complete files passed, **7 tests**, zero skips. Existing address normalization, invoice/account/network separation, bounded/denied storage and wallet-event lifetimes remain asserted. |
| `NODE_OPTIONS=--max-old-space-size=1024 node node_modules/eslint/bin/eslint.js --config eslint.config.js apps/web/src/views/Pay.tsx` | Exit 0 using the original typed lint configuration. |
| `bash scripts/scan-secrets.sh` | Exit 0; no committed environment files or key material found. |
| `git diff --check f024ce3e0eab91df40bfd5a75aee2a56d9158e5a HEAD` | Exit 0. |

Raw logs reside at `/workspace/scratch/9723b6705f45/address-reuse-*.log`. Their SHA-256 values:

| Log | SHA-256 |
| --- | --- |
| `address-reuse-typecheck-before.log` | `326a222f101721142c8a0317d73e6577deb8b49bbebe9505a4f45b9b22a4fa51` |
| `address-reuse-typecheck-after.log`, `address-reuse-typed-lint.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (successful commands with empty output) |
| `address-reuse-focused-tests.log` | `e27702a4892efb3dfc0f9fcdfb2d507b2eb696fe4dcc4a62f25d59de924f83f2` |
| `address-reuse-secret-scan.log` | `c640ecf2e70ce55408b18915d1790def402b4b4d88dc9ae00204f43a55f7ba47` |

## Dependency provenance and limits

No installation or fresh library build was performed. Node is 24.22.3. External dependencies are symlinked from the coordinator's existing canonical installation; all 671 non-workspace locked dependency records match this candidate. A candidate-local `@ghostpay` map resolves internal packages to this worktree.

The 65 compiled library directories came from the already qualified offline build at `e7d21d040404171cad18af382a05352241c8aa7f`. Its complete `packages` source tree is identical to #586: `0a16af3b09c4e055e08d6b4e621e1122753278dc`. The copied artifact inventory contained 2,280 files. The SHA-256 of its sorted `file-sha256 + two spaces + relative-path + newline` manifest is `dca7394e2746e910d05f227df33f47bb673b0b86b8e0a0aab4cfb440b0a375f4`.

An intervening full disk temporarily prevented a Git object and a small report write. After the successful TypeScript checks, only this lane's identical compiled-file copies were replaced with read-only hard links to those matching artifacts, freeing space; no build writes are performed against them. The repair then committed successfully. Source and dependency bytes remained intact.

No new complete web test/coverage run, Vite production build, browser run, hosted run, real wallet/RPC interaction or integrated-main qualification is claimed. The root coordinator agreed that a full rebuild is unnecessary for this bounded annotation-only repair after JavaScript equivalence and full web typecheck. Architecture selection between #584/#586, their broader acceptance work, future exact-head hosted CI and all original dormant/release gates remain open. Publication is limited to a draft child of #586; this is not a main-integration candidate until those decisions and gates are resolved.
