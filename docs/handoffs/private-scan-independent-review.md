# Private seller scan: independent implementation review

Review date: 2026-11-19. Reviewer: a separate ChatGPT review worker, read-only for runtime code. This is an **AI-assisted review**, not an external professional security audit or release approval.

## Scope and decision

Reviewed the v5 EVM scan journal, scanner replay/advancement, session and saved-key-vault lifecycle, IndexedDB transactions, Scan UI, selected-client guards, regression sources, and user/developer/threat-model wording. The review used the invariants in [SECURITY.md](../../SECURITY.md), the [payment-evidence review](../audits/17-final-security-snapshot.md), and [privacy limits](../user/privacy-limits.md).

**No unresolved feature-specific security blocker was identified in the runtime snapshot below.** The findings listed here are addressed in that source. Final combined-source tests, typecheck, lint, full/lean builds, browser acceptance and hosted gates remain separate integration evidence; this review does not declare those gates passed.

The branch began at PR #235 source `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1`. During review, main advanced to `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`, including PR #241 at `5a33a435`. Main was integrated at `684eec18f9f7562e304c7a347ecb62ff6ac4bb71`. The inherited transport changes retain the selected-destination contract and improve bounded failures. PR #241 is therefore no longer an unmerged dependency. PR #238 and broader consolidation work were not modified by this reviewer.

The follow-up snapshot below is the integration worktree based on published PR #248 head `139c5cb8e086ec4b13d08e10409dfb0765b53bcf`, with main `e454de6abfefda70d82784fafc1d8949b277c334` merged but not yet committed when reviewed. That main includes qualified PR #242. The merge itself preserved the earlier private-scan runtime bytes; the subsequent Scan app-lock correction is separately reviewed below. AppShell's dual-clock expiry retains its sole-copy key recovery policy. No scanner identity or journal-format regression was found in that integration.

## Findings addressed

| Priority | Root cause and failure | Reviewed correction / regression source |
|---|---|---|
| P1 | A cursor could survive while discovered payments existed only in React memory; repeated transient verification failures could eventually be skipped. | One encrypted CAS document contains all observations and the safe cursor; `onCheckpoint` is awaited. Historical match blocks are freshly scanned on resume. `privateScanStore.test.ts`, `scanClient.test.ts`, `Scan.privateCheckpoint.test.tsx`. |
| P1 | Plaintext progress lacked authenticated schema, identity and scan-configuration binding. | Private v5 slot derivation, authenticated envelope/internal scope, strict cursor relationships and bounded codecs; legacy v1–v4 progress is ignored. `privateScanStore.test.ts`, `privateScanLifecycle.test.ts`. |
| P1 | Unconditional writes or deletion could lose another tab's discoveries or permit stale-handle resurrection, including an initially empty slot. | Exact-value transactional CAS, random tombstones and first-load reservation. Saved-vault deletion precedes all-context journal invalidation; tied-vault checks follow reads/reservations and surround CAS. Broadcast delivery is not relied on for authority. `privateScanStore.test.ts`, `privateScanLifecycle.test.ts`, `reconciliationVault.idb.test.ts`. |
| P1 | Same-key restoration and cancelled old tasks could publish state for a replacement session. | Session revision/context guards, local invalidation generation, locked handles and guarded terminal UI updates. Restored receipt flags never establish current payment evidence. Storage/lifecycle/UI regression suites. |
| P2 | Replaying a saved finality-tail block separately could retain an orphan across the later incremental fetch; narrowed historical responses could discard saved direct-payment observations. | Replay only heights below the saved cursor; preserve the original anchor check; reject incomplete or router-only historical replay without replacing the journal. `scanClient.test.ts`. |
| P2 | Historical replay consumed the forward open-lane/announcement budget on every resume, potentially preventing forward progress indefinitely. | Separate bounded replay and incremental accounting, retaining the existing first-page liveness rule. `scanClient.test.ts`. |
| P2 | Cancellation during opening/readback or a window's jitter could leave the UI waiting or permit follow-up logical dispatch. | Abort races for setup/engine waits, late-handle cleanup, guarded manifest readback and guards below the window decorator. `Scan.privateCheckpoint.test.tsx`, `scanPrivacy.clients.test.ts`, `scanClient.test.ts`. |
| P2 | App-wide lock deliberately retained an unbacked-up sole key copy, so session-only cancellation left an active private scan or scheduled retry running. | Subscribe the private Scan view to app lock; synchronously neutralize the automatic callback, disable automatic checking and abort the active controller. Existing abort hooks lock the private vault and guard late writes. Preserve the session and allow explicit restart. Three regressions in `Scan.privateCheckpoint.test.tsx` cover pending RPC setup, pending checkpoint CAS and a due timer before React flush. |
| P2 | Manual rescan could erase recoverable history before validating input or completing a replacement page. | Keep the old journal until the replacement CAS commits; invalid/over-limit private envelopes can be explicitly forgotten. `Scan.privateCheckpoint.test.tsx`. |
| P2 | Clean resumes hid historical incomplete-coverage warnings; accumulated warning caps silently discarded known narrowed blocks. | Persist/render the historical union; remove notes on confirmed rollback; reject a new 1,001st note before durable advancement. Engine and UI regressions. |
| P2 | Conflict recovery lacked the documented Reload control; an unchanged starting cursor could claim a completed height without any durably covered range. | Visible reload after storage conflicts and completed-height/status display conditioned on positive saved coverage. `Scan.privateCheckpoint.test.tsx`. |

## Independently executed evidence

Vitest commands ran from `apps/web`. These are separate observations of evolving source, **not a combined final-source test total**. Later cases and final UI/coverage-limit fixes require the coordinator's final runs.

| Command | Observed result |
|---|---|
| `../../node_modules/.bin/vitest run src/lib/privateScanStore.test.ts --coverage=false` | 35/35 passed; 9.73 seconds. Later cases were added. |
| `../../node_modules/.bin/vitest run src/lib/privateScanLifecycle.test.ts --coverage=false` | 11/11 passed; 6.78 seconds. |
| `NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/vitest run src/lib/scanClient.test.ts src/lib/scanPrivacy.test.ts --coverage=false` | 131/131 passed across two files; 52.50 seconds. Predates the final coverage-warning-cap regression. |
| `bash scripts/scan-secrets.sh` from repository root | Exit 0: no committed env files or key material found. This tracked-file scan does not certify then-untracked files. |

Read the browser regressions for reload, independent-profile key recovery and concurrent tabs. This reviewer did not execute browser/build/hosted qualification and does not count source inspection as execution.

### Integration follow-up evidence inspected

The UI worker executed the following command from the integration worktree's `apps/web`; this reviewer inspected its saved output and the exact runtime/test diff, rather than rerunning it:

```sh
PATH=/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin:$PATH NODE_OPTIONS='--max-old-space-size=768 --max-semi-space-size=8' ../../node_modules/.bin/vitest run src/views/Scan.privateCheckpoint.test.tsx src/views/Scan.autoRescan.test.tsx src/AppShell.idleClock.test.tsx --maxWorkers=1 --coverage=false
```

Result: exit 0, three files and **34/34 tests passed**, 28.60 seconds. The preceding private-checkpoint-only selection with `-t 'app idle lock'` failed all three new cases before the runtime correction (16 unrelated cases skipped; 6.96 seconds). Those cases assert actual private-vault locking, retained sole-copy session identity, unchanged storage after late completion, explicit restart and synchronous timer disarming. The inspected test file SHA-256 is `1ffa317c166875bea82103d7ecbdfa3342a3dc1e2630da504b14a8788df908e3`. These counts overlap earlier UI coverage and must not be added to it as unique tests.

Read-only hosted inspection found successful Hosting kit, Beta acceptance and three-platform CLI qualification on head `139c5cb8e086ec4b13d08e10409dfb0765b53bcf`; CI and Pages remained queued at 07:18 UTC. Those successes precede this integration and app-lock correction and do not qualify its new source. Final-head typecheck, lint, coverage, full/lean browser and other required hosted outcomes remain coordinator-owned evidence.

## Retained limits

- Historical replay remains bounded. Dense saved blocks can repeatedly exceed the cap; repeated Resume is not guaranteed to progress. Prior history is preserved, and an explicit rescan or suitable selected source may be needed.
- RPCs can omit data or correlate historical-block and receipt requests. Local encryption and two-provider agreement are not consensus verification or network unlinkability. Cancellation cannot retract sent traffic; existing transport retries remain relevant.
- Saved-vault deletion affects every v5 context in this browser profile. It preserves the existing loaded-key policy; an independently imported key holder can deliberately scan again. Partial cleanup failure is reported.
- App lock pauses the private scanner even when the only seller-key copy must remain loaded. That retention policy does not represent key erasure; deliberate manual restart remains available.
- Non-string rows or rows beyond the shared 8,000,000-character IDB read cap cannot be per-context forgotten because their exact value is not exposed to the private codec. Site-data clearing or all-context invalidation is the recovery boundary.
- Legacy plaintext remnants, visible encrypted-record sizes/counts, browser quota limits, draft-locale English fallback and best-effort JavaScript/WebCrypto zeroization remain documented. Spec 18 exports and key-backup formats are unchanged.

## Reviewed runtime SHA-256

These hashes identify the reviewed working-tree bytes, not an assertion that the earlier commands tested every later edit. Re-review changed runtime files if their hashes differ before publication.

| Repository path | SHA-256 |
|---|---|
| `apps/web/src/lib/privateScanStore.ts` | `82a9ac42f6b7588a0dc1d05094dc11ae8971d29b24e2a09de50f832b10d45e88` |
| `apps/web/src/lib/privateScanLifecycle.ts` | `0e62ee5c9e926c325d9d640d28c6dbc8440c2a2eced81dc31131e5f3e393bb21` |
| `apps/web/src/lib/scanClient.ts` | `d61c4cfe89e915135288df0398ff3cdb6bd85a7282c9136f1546f5d39ddf9546` |
| `apps/web/src/lib/scanPrivacy.ts` | `fcb03fbf2c63362618273dc0bdba8a4b37e403648530945a6ecf6eb777190c14` |
| `apps/web/src/views/Scan.tsx` | `cb1b0f03c270c531bd3ee3747fac26517272ad224d5c9ffb235c6b43f8bf8877` |
| `apps/web/src/lib/keyVault.ts` | `e671c2bc6334dc9e02d6f09fb68c2d2ad9d172dfb00d839e3af65d6351e3f091` |
| `apps/web/src/lib/reconciliationVault.ts` | `1e077897e2da7c47f83b00461a79927ed5577f8e0bfd03914d2bf27ad70d919f` |
| `apps/web/src/lib/services.ts` | `54d182a2726a65b4579ec0c8ec3d86e45f937a4ade1f319ed36152ef98e4ca1a` |
| `apps/web/src/lib/defaultServices.ts` | `50be9f662b039833c6a9f282bc68c1f8d25bdbf1ea3ce50ed8c5b658f6d8de5b` |
| `apps/web/src/lib/session.ts` | `2166d1a70d72f5fc6b5d779b6f467518a52d23ec36e377545ecae7b00651e757` |
| `apps/web/src/AppShell.tsx` (inherited PR #242 delta) | `f290b87e11f909b12da7242c43a2ba8bb21fa9706d4aef4160dd2d0238d6ddc0` |
| `apps/web/src/lib/appLock.ts` (existing signal) | `f85028ff41196dad041df83f76eab979f4911fff3a874d3aeeba7f6c5e6298ee` |
| `packages/net-transport/src/fetchTransport.ts` (inherited PR #241 delta) | `51bf75966b97f9d64757a0ec80a98b71b37968a578c02a78fb72fe1816d86d40` |
