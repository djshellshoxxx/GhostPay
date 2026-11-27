# Completion ledger and candidate qualification (2026-11-27 UTC)

AI-assisted record. **Not an audit, not a release authorization.** Nothing was deployed, tagged or published, no real funds,
testnets and local anvil only. Scope follows [STOP_WORK_20261125](../ai/STOP_WORK_20261125.md): the ten stopped products
stay dormant and are not counted as outstanding.

## Candidate

Branch `nodata/beautiful-heisenberg-25ikdy`, exact head recorded in the PR description. It composes `main` `6b323a99`
(which already contains #745 and #747) with the open heads below, plus new qualification work. **It is a qualification
candidate, not a merge request.** Integration stays with the integration-lock holder; this record does not take the lock.

| Source | Head merged | Notes |
|---|---|---|
| #724 train (#724, #732, #726, #713, #715) | `2085ef44` | CI 39/0 at that head |
| #728 stack (#696 cover lookups, #717 offline drafts, audit F2/F3/F7) | `298257fd` | CI 40 pass, 2 fail: `ts-test (rest-2)` (see "Hosted CI note") |
| #745, #747 | `84d95d62`, `1308f185` | now on `main` |
| #742 (LATE-L1 replay, #569/#355 dispositions) | `28d369cc` | CI 41/0 |
| #744 (audit fixes) | `214c1287` | owner has since moved the head to `e20569ae` (same embed fix, see below) |
| #665 (W5 independent verifier) | `db6f3da6` | `verification/**` only; about 15 MB of generated `run.json` evidence |
| New: embed handshake fix | this branch | same logic as `60ce3508` on #744; take #744's copy when both land |
| New: ERC-20 end-to-end qualification | W1 | 5 anvil vitest files, 1 node:test, handoff |
| New: Phase A fuzz and stress | W3 | 9 `*.fuzz.test.ts` files, one production fix |
| New: Phase C repairs | W4 | draft slot privacy, retention wording, label |
| New: callsite-guard refinement | this branch | see "Defects found" |

Merge conflicts: only `docs/ai/ACTIVE_WORK.md` (every PR prepends at line 0). Resolved by keeping both sides.

## Completion ledger

| Item | State | Evidence and next action |
|---|---|---|
| #723 scan checkpoint ownership, #725 idle-suspend guard | **Implemented, merged** (`3603960c`, `cdddda0b`) | Fuzz `scanClient.fuzz.test.ts`: saves monotonic and bound to the slot owner |
| #745 P14 F2 light-source labels, #747 caught-up requires primary-head coverage | **Merged** (`3c9fc0ab`, `6b323a99`) | Fuzz: `caughtUp` only true past the primary head with no lag, limit or backlog |
| #696 cover lookups, #717 offline checkout and drafts | **Implemented, unmerged** (#728) | Candidate carries Phase C repairs the #728 branch lacks (below). Rerun #728 CI (timing flake) |
| #724 train | **Implemented, unmerged**, CI green | `#732` and `#726` show `dirty` on their own branches because #724 carries their content; close them after #724 lands |
| #742 LATE-L1 replay | **Implemented, unmerged**, CI green | Product decision needed on a bound for the replay pin (D3) |
| #744 audit fixes | **Implemented, unmerged**; hosted CI at `e20569ae` reported 40 pass, 0 fail (matched to the PR by timestamp, less certain) | F2/F3 hunks duplicate #728 and merged cleanly |
| #665 independent verifier | **Implemented, unmerged**, CI 31/0 | 160 commits behind main; its finding F3 (attemptStatus wording) is unverified on current main |
| #715 release exclusion | **Implemented in #724, unmerged** | Candidate lean build: 382 modules, zero stopped-product or `FUTURE` modules |
| ERC-20 payment and recovery | **Qualified on local anvil** (this work) | Gap: browser Playwright ERC-20 journey (no token at the allowlisted address on the devnet script) |
| P14 disclosure and scan evidence (#658, #696) | **Partially merged**: F1/F2 merged, #696 in #728 | No #658 PR is open. Treat as merged or closed; not re-verified here |
| GP-PAGES-01, IDLE-M1, Mythril disposition | **Owner decisions**, open | Unchanged from `RELEASE_READINESS_20261126.md` |
| Exact-SHA Pages-on-anvil, beta acceptance, Firefox/WebKit/Safari, devices, native a11y, Tor Browser, third-party wallets | **Not run** | Outstanding manual or hosted acceptance (see "Not run") |

Estimated state: automated core payment, scan, reconciliation and recovery work is complete and qualified on this candidate.
Remaining effort is integration (about 6 PRs through the lock, about half a day with CI), the owner decisions, and the manual
passes. Rough completion of the automated scope: 90%; of the full release gate: about 70%, dominated by manual passes.

## Results on the final candidate

| Check | Result |
|---|---|
| `affected.mjs --run --checks typecheck,lint,test` (23 workspaces) | pass. Web `4662 passed, 9 skipped`; `ux-vault`, `chain-adapters`, `ux-flow`, `tx-review`, `payment-uri`, `invoice-schema`, `i18n` and the rest pass with coverage thresholds |
| Script tests (`node --test scripts/{testnet,regtest,tests,agent}`) | 274 pass, 0 fail, 1 skip |
| `REQUIRE_ANVIL=1 node --test scripts/recovery/*.test.mjs` | 49/49 |
| ERC-20 anvil suite with `REQUIRE_ANVIL=1` | 5 files, 41/41, 0 skip |
| Playwright e2e, Chromium engine, lean | 192 passed, 6 skipped (profile-conditional) |
| Playwright e2e, Chromium engine, full | 205 passed, 3 skipped (lean-only cases) |
| Lean Pages build and `verify-pages-site` | OK. `Release exclusions verified: 382 rendered modules and 17 site files contain no F01, F02, F04, F08, F09, F11, F12, F13, F14, P07, FUTURE module` |
| `scan-secrets.sh`, `check-actions-pinned.sh`, `package-map.mjs --check` | OK, OK, current |
| Contracts | unchanged on the candidate (`git diff 3f7fcd0a..HEAD -- packages/*contracts` empty), so Foundry suites were not rerun |

Skips are not passes.

## Phase A: fuzz and stress (bounded, seeded, synthetic)

Local `mulberry32` PRNG per file; no new dependency. Seeds and iteration counts are in each file header.

| Target | File | Seeds | Scale | Result |
|---|---|---|---|---|
| Encrypted draft codec | `apps/web/src/lib/invoiceDraft.fuzz.test.ts` | 717, 728, 20261127 | 40 drafts x about 35 mutations per seed | invariants held |
| Draft hook, two tabs, storage faults | `useInvoiceDraft.fuzz.test.tsx` | same | 25 sequences x 6 groups per seed | held |
| Offline checkout walks | `views/Pay.offline.fuzz.test.tsx` | 591, 717, 20261127 | 4 walks x 12 steps | zero wallet requests offline. Walks are UI-timing dependent, not bit-reproducible |
| Log paging, 413, range limits | `packages/chain-adapters/src/logs.fuzz.test.ts` | 11, 2026, 424242 | 70 scenarios per seed | no dropped announcement outside the reported router-only blocks |
| `runScan`, caught-up, cover, slot races | `apps/web/src/lib/scanClient.fuzz.test.ts` | 696, 744, 747 | 22 scenarios, 24 two-run races per seed | held |
| LATE-L1 replay (model based) | `reconciliationVault.replay.fuzz.test.ts` | 742, 20261127, 5150 | 18 scenarios x 14 ops | never overstated |
| Tolerance and classification | `packages/ux-flow/src/reconcile.fuzz.test.ts` | 742, 1125, 90001 | 1500 classify per seed | malformed tolerance always `BAD_TOLERANCE` |
| Router calldata decode | `packages/chain-adapters/src/router.fuzz.test.ts` | 3, 90210, 8675309 | 400 builds x 3 mutations | see D1 below |
| Sweep destination review | `packages/tx-review/src/review.sweep-destination.fuzz.test.ts` | 4, 1969, 20261125 | 700 cases x 2 kinds | held |
| Invoice-link hosts vs WHATWG URL | `packages/payment-uri/src/invoice-link.fuzz.test.ts` | 6, 732, 1126 | 4000 hostile links per seed | held |

Mutation checks: production code temporarily broken, tests went red, restored (413 handling, #732 host check, #742 tolerance order,
#747 caught-up, Pay offline guards). Not caught: removal of one of three redundant Pay offline guard layers; the cover
`sendsLookups` filter (unobservable at the RPC boundary). Memory use was not measured (`/usr/bin/time` absent); no OOM seen.

## Defects found and repaired

| Id | Severity | Finding | Status |
|---|---|---|---|
| EMB-1 | medium | #744 head `214c1287` carried a red embed test: a removed dialog's late handshake timeout still opened a popup | fixed here; the #744 owner fixed it equivalently as `60ce3508` |
| FUZZ-D1 | low | `decodePaymentCalldata` threw a viem range error, not a typed `PREVIEW_MISMATCH`, for a permit `v` word wider than uint8 | fixed with a failing-first regression |
| PHC-D1 | low | Draft slot was named from public keys (meta-address, signer key), so storage access confirmed "this profile holds a draft for seller X" | fixed: slot is `v3`, HKDF of the viewing key; `v2` slots are ignored and deleted |
| PHC-D3 | low (review of `a052086d`) | The draft write committed in a later promise reaction than the codec's session check, so an explicit key clear between them recreated the purged draft (reproduced with the real codec: red before, green after) | fixed: `draftPurgeEpoch()` is captured at save start and rechecked immediately before `sessionStorage.setItem` (no await between); a purge ends the opt-in and reports `off`. Tests: clear between check and commit, clear while sealing, clear making the codec refuse, key replacement (old ciphertext stays in the old seller's slot, new slot untouched), navigation durability |
| PHC-D2 | low | Drafts had no clear on explicit key clearing, and the hint did not say memo and line text are kept | fixed: explicit clear and idle key wipe remove drafts; hint rewritten in four locales |
| PHC-S1 | info | Cover label "Hide which payments matched..." overstated the hint | softened in en, es, ja, ar |
| PHC-S2/S3 | low/info | Decoy lookup amplification and the 1000-entry `routerOnlyBlocks` cap were undisclosed | documented in `docs/user/privacy-limits.md` (no code change) |
| GUARD-1 | test hygiene | `walletDisclosure.callsites` scanned `erc20Flow.testutil.ts` as production | guard now excludes `*.testutil.*` and gains a case that fails if any non-test source imports one (static, side-effect and dynamic probes verified) |

### v2 draft format disposition

The v2 slot (`ghostpay.invoice-draft.v2.`) exists only on the #717/#728 branches. `git log origin/main -S'ghostpay.invoice-draft'`
over `apps/web/src` is empty, and the Pages workflow publishes `main` only (`workflow_dispatch` with `deploy`). So no published
beta wrote v2 data. This is a deliberate break of an unreleased format; v2 records are deleted without being read, and
`v1` and unrelated records are never touched. Not checked here: the GitHub Pages deployment history itself. The owner should
confirm no preview build of those branches was published before treating this as closed.

## Open findings (not repaired; need an owner or lead decision)

| Id | Severity | Finding | Suggested action |
|---|---|---|---|
| FUZZ-D3 | low | An unlinked `verified-router-scan` candidate that never re-verifies pins `retryFrom` on every resumed run until the invoice is removed (confirmed by seeded test `characterises the pin`). Cost is rescan, not overstatement | Product decision: cap retries per record or expire the pin |
| FUZZ-D2 | low, latent | `useInvoiceDraft` with two hook instances on one slot: the superseded instance stays `saving` and keeps the `beforeunload` guard armed. Not reachable today (one Create view) | Fix if a second consumer is added |
| FUZZ-D4/D5/D6 | info | stale verified delivery on a replaced block heals on the next page; `maxRequests` below about 7 can livelock a same-budget retry loop (all callers use 50); a draft write failing after unmount has no UI signal | Document only |
| PHC-O1 | info | Journal-recovery wallet connect (`WalletAttempts.tsx`) is not offline-guarded; it is not a payment | Optional |
| 744-2 | low | HTTP 413 at window 1 drops the open lane for one block (disclosed via `routerOnlyBlocks`) with no recheck | Accept or add one recheck |
| 742-2 | low | Receipt-file input remounts on every invalidate cause; a pre-connect file may be dropped | Add a cause matrix test |
| 665-2 | low-medium | #665 finding F3: a linked replacement reported included with its receipt withheld shows "another tx used the nonce". Evidence is pinned to main `601f2095`, unverified on current main | Reverify, then add an `attemptStatus` regression |
| G1 | process | #696 and #717 are new capabilities. The repo records owner approval only as "owner-approved in-session" | Record the approval link in the PR |
| Locales | process | Machine-drafted es/ja/ar strings for `create.draft.hint` fall back to English until native review | Native review |

No high-severity finding was open at the end of this review. That is a statement about this AI-assisted review, not a guarantee.

## Hosted CI note (#728)

`ts-test (rest-2)` failed on `298257fd`: `packages/invoice-schema/src/passphrase.test.ts`, two cases timed out at 60 s
("tampering any authenticated field..." and "authentic but malformed plaintext..."). The same file's other KDF cases took
44 s and 9 s on that runner, so the cause is a slow runner against a 2^17-cost KDF, not the diff (the change is a comment, F7).
The file passes locally on the candidate. Rerun the job; do not skip or raise the test without review.

## Not run (not a pass)

- Firefox, WebKit and Safari engines locally (only Chromium is installed here; hosted `mobile-browser-qualification` covers WebKit).
- Real phones and tablets, native assistive technology, Tor Browser, third-party wallet extensions and hardware wallets.
- Public testnet RPC providers; any mainnet or real-funds path (out of scope by policy).
- Pages-on-anvil (`BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh`) and `scripts/beta/acceptance.sh` on the exact release SHA.
- Browser-level ERC-20 journey; relayed ERC-20 sweep; real L1 data fees (zero-fee oracle stub).
- Full `apps/web` coverage run: the 4 coverage thresholds were exercised through the affected-workspace test run, which
  passed; they were not run as a separate full-repository job. Hosted CI remains the authority.
- Native mutation-test or `forge` suites (contracts unchanged).

## Environment notes

Foundry 1.8.5 was installed from the official release archive into `/usr/local/bin` for this container. `solc` downloads
worked here (the earlier readiness record could not reach the compiler host).

## Continuation prompts

1. **Integrate (lock holder).** "Read AGENTS.md and docs/handoffs/COMPLETION_QUALIFICATION_20261127.md. Under the integration lock, merge #724, then #742, #728 (rerun `ts-test (rest-2)`; cherry-pick the Phase C repairs from branch `nodata/beautiful-heisenberg-25ikdy`: `invoiceDraft*`, `useInvoiceDraft*`, `session.ts`, locales, privacy docs), #744 (head `e20569ae`), #665. Keep both sides of `docs/ai/ACTIVE_WORK.md`. Fresh hosted CI on each exact composed head."
2. **Replay pin bound (needs product decision).** "Decide and implement a bound for FUZZ-D3 in `packages/ux-vault/src/reconciliation-portable.ts`; keep the `characterises the pin` test and flip it to the new bound."
3. **Browser ERC-20 journey.** "Deploy a token at the allowlisted address in `scripts/beta/browser-devnet.sh` (devnet only), add `apps/web/e2e/erc20-*.spec.ts` for approve, pay, scan, receipt and sweep. No contract change."
4. **Release gate.** "Run `BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh` and `scripts/beta/acceptance.sh` on the release SHA; then manual Firefox, WebKit, mobile, assistive-technology, Tor Browser and third-party wallet passes; refresh `RELEASE_READINESS_*.md`."
5. **Owner decisions.** GP-PAGES-01 (custom domain), IDLE-M1, Mythril disposition wiring, #696/#717 approval record.
