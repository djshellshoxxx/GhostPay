# A1: open-finding census against current main (read-only)

- Analyst: SECONDARY sub-agent A1. Read-only. No repository writes, no pushes, no GitHub comments.
- Main: `b890a76603b924829fdbe2b4fb2c5626f0cf4e36` (#759). `git fetch` at 02:14Z and again at about 02:40Z: main **did not move**.
- Scratch: detached worktree `/workspace/scratch/a1-census` at `b890a766`. Its working tree is clean again; the probes it ran
  are kept in `/workspace/scratch/a1-census-probes/` (see "Probes" at the end).
- Scope: the lean static web app `apps/web` and the libraries it imports. Per `apps/web/package.json:20-34` and
  PACKAGE_MAP, those are address-safety, chain-adapters, core-crypto, invoice-schema, net-transport, payment-uri,
  qr-exchange, scan-source, secret-box, tx-review and ux-vault. Nothing imports **ux-flow, ux-receipts, ux-intake,
  ux-links or ux-schedule** (PACKAGE_MAP "Used by: -"), so the recent fixes there (#748, #752, #756, #759, #726) are
  outside the shipped beta. The embed SDKs and `VITE_EMBED_IFRAME` checkout do not ship in the lean Pages build
  (#744 body; `apps/web/src/embedHeaders.test.ts:73-76`). `MerchantProfilePanel` is mounted only by the full profile
  (`apps/web/src/App.tsx:26`).

## Summary

Most recorded findings are already fixed on main or owned by someone else (see the last two sections). This census
found **three verified, unowned candidates**, all small:

| Rank | Id | Severity guess | Kind | One line |
|---|---|---|---|---|
| 1 | A1-C3 | Low (privacy) | Defect | A scan started after another tab saved a new RPC, but before this tab took the change over, runs to completion on the replaced RPC. Its route guard compares storage with storage, so it never trips |
| 2 | A1-C1 | Low (privacy/availability), test-only | Missing regression | No view-level test covers Scan passing the run's `AbortSignal` to `openScanClients` (#758's own note). Removing that wiring leaves all 74 Scan view tests green |
| 3 | A1-C2 | Info/Low (availability, truthful UI) | Defect | Settings accepts `wss://` RPC URLs and tells users they are accepted, but both browser transports refuse them at first use (security-remediation-20261118 C-2, still open) |

Lower-value recorded items that are still open are listed under "Recorded, still open, not recommended now". Each needs
a design or owner decision, is disclosed by design, or could not be verified here.

---

## A1-C3: Scan route guard compares storage with storage, so a scan can run on an RPC another tab just replaced

- **Severity guess:** Low (privacy). The scan sends its range, position reads and matched-payment receipt lookups to a
  provider the user has just removed in another tab. Only a scan started inside the gap between the other tab's save
  and this tab's `storage` event is affected. Once started, that scan runs **to completion** on the old route, not just
  for the length of the gap.
- **Source (main `b890a766`):**
  - `apps/web/src/views/Scan.tsx:226-228`: the route "it started with" is read from storage (`loadSettings()`).
  - `apps/web/src/views/Scan.tsx:229-238`: `assertScanPath` compares current storage with that stored value.
  - `apps/web/src/views/Scan.tsx:239`, `:251`: the clients actually used come from the in-memory settings
    (`app.getRpc` and `app.getSecondaryRpc`, defined at `apps/web/src/AppShell.tsx:387-388` over `settings.rpcUrls`).
  - `AppShell.tsx:135-149` takes over another tab's save only when the `storage` event is delivered.
  - So when storage already holds the new URL and memory still holds the old one, the clients point at the old RPC
    while the guard sees "new == new" and never stops the scan.
- **Origin:** recorded as an unaddressed review nit in the #755 body ("Not done: … the review nit that a scan started
  before another tab's save is announced compares storage with storage"). No later PR or ACTIVE_WORK entry picks it up.
- **Evidence (run):** scratch probe `/workspace/scratch/a1-census-probes/Scan.a1probe.test.tsx`, a jsdom view test.
  - Setup: `https://old.test` is saved and the app opens. Then `https://new.test` is written to `localStorage` the way
    another tab would. jsdom fires no same-document `storage` event, which models the delivery gap. Then the user
    starts a scan.
  - Result on main: `createRpc urls ["https://old.test/"]`, 5 calls to the old RPC, 0 to the new one, outcome
    `Finished. 0 announcements checked…`. No route-change refusal.
  - Command: `npx vitest run src/views/Scan.a1probe.test.tsx --coverage=false --maxWorkers=1` (from `apps/web`).
- **Fix prototype (run):** take the start route from `app.settings` and assert it once before opening clients
  (`/workspace/scratch/a1-census-probes/scan-route-fix-prototype.patch`, illustrative hunk).
  - With the prototype, the probe shows no RPC created and the existing `SCAN_ROUTE_CHANGED` message.
  - All existing tests still passed with the prototype applied:
    - all 9 `src/views/Scan*.test.tsx` files, 82 tests;
    - `AppLean.test.tsx`, `App.test.tsx`, `ScanPrivacy.i18n.test.tsx`, `scanDisclosure.test.ts`,
      `scanDisclosure.cover.test.ts` and `test/rpcDisclosure.test.ts`, 107 tests.
  - The prototype was then reverted; the worktree is clean.
- **Ownership check:**
  - Claims registry (`origin/automation/ghostpay-work-claims` `dd2898c2`): no claim on `Scan.tsx` route capture. P-M4
    claims only "manifest call sites in Pay.tsx/Sweep.tsx/Scan.tsx (argument only)".
  - Open PRs touching `Scan.tsx`:
    - #766 (presentation-only tooltips): hunks at lines 1, 166, 461, 474, 629, 666, 675, 745, 779 and 804.
    - #720 (held draft, contracts plus manifest read-back): hunks at lines 7 and 256.
    - Neither touches lines 219-239. Hunks from `git diff origin/main...origin/<branch> -- apps/web/src/views/Scan.tsx`.
  - ACTIVE_WORK: W2's #755 claim of `views/Scan.tsx` is merged and historical; nothing open.
- **Smallest fix:** in `Scan.tsx`, set `startRpcUrl` and `startSecondaryUrl` from `app.settings` (the values the
  clients come from) and call `assertScanPath()` once before `openScanClients`. Nothing is contacted. The user gets the
  existing "route changed, start again" message and restarts on the new settings.
- **Files:** `apps/web/src/views/Scan.tsx` (about 4 lines) and one new view test file, for example
  `apps/web/src/views/Scan.routeStart.test.tsx`. No locale, format or dependency change.
- **Regression test:** the probe turned into assertions. With storage changed after mount and no `storage` event,
  Start scan:
  - makes zero `createRpc` calls to the old URL;
  - shows the `SCAN_ROUTE_CHANGED` text;
  - saves no checkpoint.
  - A second case does the same for the secondary RPC with `plan.useSecondary`.
  - Fails on main and passes with the fix (probe already shows both directions).
- **Related, not proposed:** `Sweep.tsx:27,60-66` uses the same storage-to-storage pattern. There the old RPC is used
  only until the event arrives (later renders get the new `app.getRpc`), and Sweep is PRIMARY's P-M1 territory. Leave it
  to them.

## A1-C1: No view test for Scan passing the run's signal (indexer request and block reads after Cancel)

- **Severity guess:** Low (test-only). It guards a privacy/availability control: Cancel must stop the indexer request
  and the per-block cross-check reads (one RPC read per announcement block in a dense window).
- **Source (main `b890a766`):**
  - `apps/web/src/views/Scan.tsx:239` passes `signal: ctl.signal` to `openScanClients`.
  - `apps/web/src/lib/scanPrivacy.ts` (#758 `2b6e9784`/`dac22aca`) forwards it to `createIndexerScanClient` and on to
    `scan-source` `fetch(req, signal)` (`packages/scan-source/src/indexer.ts:92-103,174`).
  - The library path is tested in `scanPrivacy.indexer.omission.test.ts` ("reads no further block once the scan is
    stopped …"). The view wiring is not.
- **Origin:** #758 body ("The one-line signal wiring in `Scan.tsx` has no view test") and its merge record comment
  7228208842 ("The scan-view signal wiring has no view-level test").
- **Evidence (run, mutation):** I removed `, signal: ctl.signal` from `Scan.tsx:239` and ran:
  - `Scan.test.tsx` plus `Scan.indexerCompletion.test.tsx`: 47/47 passed;
  - `Scan.autoRescan`, `Scan.caughtUp`, `Scan.privacy`, `Scan.i18n` and `ScanPrivacy.i18n`: 27/27 passed;
  - so no existing view test notices. `e2e/scan-indexer-completion.spec.ts` has no cancel case (grep).
- **Discriminating test (run):** scratch probe `/workspace/scratch/a1-census-probes/Scan.a1cancel.test.tsx`. It reuses
  the `Scan.indexerCompletion.test.tsx` fixture (`records: 'partial', pauseFrom: 2000, pageBudget: true`) plus one test.
  - With the wiring: after Cancel, the paused indexer request's `init.signal.aborted === true` and there are 0
    `eth_getBlockByNumber` calls afterwards. **Pass.**
  - Without the wiring: `aborted === false` and 3 `eth_getBlockByNumber` calls after Cancel. **Fail.**
  - Command: `npx vitest run src/views/Scan.a1cancel.test.tsx -t "A1 probe" --coverage=false --maxWorkers=1`.
- **Ownership check:**
  - The W7 claim at the top of ACTIVE_WORK ("Recorded low residuals (web)") owned "`views/Scan.tsx` (passing the run's
    signal only); their tests". That work merged as #758 (`fd5e5911`), so the claim is historical. No open PR adds a
    Scan cancel test.
  - #766 and #720 do not touch `Scan.indexerCompletion.test.tsx`. #720 edits `Scan.test.tsx` and
    `Scan.privacy.test.tsx`, so use a new file or the indexer completion file.
- **Smallest fix:** test-only. Add the case above to `apps/web/src/views/Scan.indexerCompletion.test.tsx`, or to a new
  `Scan.indexerCancel.test.tsx` to avoid any overlap.
- **Files:** one test file. No production change.
- **Regression test:** as above. Assert the aborted signal on the in-flight indexer `fetchFn` call, zero block reads
  after Cancel, the `Cancelled.` outcome and an unchanged checkpoint.

## A1-C2: `wss://` RPC URLs are accepted and advertised but can never be used

- **Severity guess:** Info/Low (availability plus truthful UI). It fails closed: no fallback provider is substituted,
  and nothing is sent elsewhere.
- **Origin:** `docs/audits/security-remediation-20261118.md:90`, C-2 ("`wss:` RPC accepted by Settings but rejected by
  the only (HTTP) transport: fails at first use", status "Residual"). No later fix.
- **Source (main `b890a766`), what accepts and advertises `wss://`:**
  - `apps/web/src/lib/settings.ts:42-49` (`checkRpcUrl`) calls
    `packages/chain-adapters/src/rpc.ts:87`, which accepts `wss:`.
  - `apps/web/locales/en.json:60` (`settings.rpc.hint`): "Only https:// and wss:// are accepted".
  - `en.json:1594`, the rejection text: "use https:// or wss://".
  - `docs/user/privacy-limits.md:63` and `docs/pages/README.md:48` say the same.
- **Source, what refuses it:**
  - `packages/chain-adapters/src/rpc.ts:97`: `fetchTransport` "needs http(s)", used by `createClient`.
  - `packages/net-transport/src/fetchTransport.ts:44`: `URL_REJECTED` for non-http, used by `scanPrivacy.ts:785`.
  - `apps/web/help.html:294` already admits "accepts https (and wss, which the browser transport refuses)".
- **Evidence (run):** `/workspace/scratch/a1-census-probes/wss.mjs`, run from `apps/web` against the built
  `@ghostpay/chain-adapters`:
  - `validateRpcUrl('wss://rpc.example/ws')` returns the URL;
  - `createClient(chain, 'wss://…')` rejects with `RPC_URL_REJECTED: fetch transport needs http(s)`.
- **Ownership check:**
  - No claim and no open PR touches `apps/web/src/lib/settings.ts`, `settings.test.ts` or `settingsExchange.test.ts`
    (pr-files census plus the claims registry).
  - The text assertion at `apps/web/e2e/pages-devnet.spec.ts:992` sits in a file #762/#764 edit, but in different hunks
    (#762 hunks at lines 72 and 856).
  - Locale catalogs are touched by #762, #764 and #766, on other keys.
  - `help.html` is touched by #766.
- **Smallest fix:**
  - Make the web layer's `checkRpcUrl` refuse anything but `https:` (keep the loopback opt-in as it is). Leave the shared
    `validateRpcUrl` alone, because the relayer uses it too.
  - Correct the two locale strings in the 4 catalogs. Both keys are security-classified (`securityKeys.ts:686,1178`),
    so es, ja and ar show English until native review.
  - Correct `privacy-limits.md:63` and `docs/pages/README.md:48`.
  - Optionally drop `wss:` from `connect-src` (`apps/web/index.html:13`) as defence in depth, but `vite.config.ts` and
    `index.html` overlap #762/#764 and the CSP build helper, so treat that as a separate step.
  - A stored `wss` entry would then be dropped by `sanitizeRpcMap` (`settings.ts:75-88`). The result is "no RPC
    configured", which is fail-closed with no silent substitute, because no default RPC exists (`en.json:60`).
- **Files:**
  - `apps/web/src/lib/settings.ts`, `settings.test.ts:7` and the `settingsExchange.test.ts` fixtures
    (lines 15, 36, 95, 117 use `wss://sep.example/`);
  - `apps/web/locales/{en,es,ja,ar}.json` (2 keys);
  - `apps/web/e2e/pages-devnet.spec.ts:992` (expected text);
  - `docs/user/privacy-limits.md`, `docs/pages/README.md`, `apps/web/help.html:294`.
- **Regression test:**
  - `checkRpcUrl('wss://rpc.example/ws')` throws the Settings error, which fails on main.
  - `sanitizeSettings({ rpcUrls: { '84532': 'wss://…' } })` yields no RPC for 84532.
  - A Settings view case: entering `wss://…` and saving shows the rejection and stores nothing.

---

## Recorded, still open, not recommended now (verified against `b890a766`)

| Id / source | Status on main | Why not a claim candidate now |
|---|---|---|
| Cross-document checkpoint race (#723 "Limit"; RELEASE_READINESS "Low"; privacy-evidence-matrix F1 "mitigated") | Still present. `apps/web/src/lib/scanClient.ts:957-967` (`localCheckpointStore.save`) is a same-document compare-and-swap over `localStorage` with no lock | Effect is only a later rescan, never a skipped block. A real fix needs IndexedDB plus a Web Lock, because `localStorage` is not linearizable across processes (JRNL-M2 reasoning). That is design work, larger than a fix |
| QA-I1 (`SECURITY_FINDINGS.md`) | Still present. `duplicateAttemptJournal.ts:324` (`parseRaw(local)` before the snapshot) and `:290` (`readStore`) refuse everything on a corrupt mirror. The message at `en.json:1724` gives no recovery step | Fails closed. A reset that drops an unparseable mirror could forget a record only that mirror held, so a second payment could be requested for it (QA-4). Needs an owner/UX decision. A wording-only hint is possible |
| JRNL-L2 residual (cleared record reappears) | Still present by design (`duplicateAttemptJournal.ts:330-331` comment) | Fail-safe (only blocks a send until cleared again). Accepted |
| D-4 (security-remediation-20261118) receipt expiry by wall clock | Still present. `components/ReceiptPanel.tsx:161,192` pass `Date.now()` to `receiptBindingForInvoice` (`lib/receipts.ts:95`) | Intentional and tested (`ReceiptPanel.invoice.test.tsx:87,182` "rechecks expiry immediately before signing"). Moving to block time is a product decision, recorded as "needs block-time plumbing" |
| Cover lookups do not cover the late-accept re-check (SESSION_NEWGHOSTPAY_AE_20261126 "Known remaining exposure"; call graph Phase 8) | Still present (`Scan.tsx:398-416`, `verifyClaimedPayment` at `:405`, outside the cover planner) | Disclosed to users (`en.json` `settings.scanLanes.matchCoverHint`; `docs/user/privacy-limits.md:120`). Covering it would extend an owner-approved opt-in capability. Owner call |
| WebKit inline-style CSP violations (#745 comment 7209052906; `P14_INDEXER_COMPLETION_20261127.md:112-116`; `P14_CAUGHT_UP_COMPLETION_20261127.md:105-109`) | Recorded open: 6 `style-src-attr` violations in `e2e/flows.spec.ts:747` (5 on Create invoice, 1 on Scan), on main too | **Not verifiable here:** only Chromium is installed (`/opt/pw-browsers`). Source grep finds only one React `style={{…}}` (`CameraImporter.tsx:353`, CSSOM, not an attribute) and no `setAttribute('style')`. Untested hypothesis: WebKit user-agent shadow DOM, such as password fields. Needs a WebKit run |
| FUZZ-D3 (LATE-L1 replay pin bound, #742 body) | Open product decision | Owned by the #742 context; owner decision |
| `#755` "any saved-settings change, theme included, returns an unrequested checkout to review" | By design | Owner decision recorded in the #755 merge comment 7222984970 |
| SECURITY_FINDINGS REV-I5 row and RELEASE_READINESS "REV-I5 … open" | **Docs stale:** REV-I5 merged via #739 (`bc1e1523`) | Trivial docs correction. It could ride on S-REV-I6's `SECURITY_FINDINGS.md` edit, which owns only the REV-I6 row, so ask that worker |

Explicitly skipped, as instructed: LATE-M1/LATE-L1 (#742), REV-I6 (S-REV-I6), the Mythril gate (#763, #468),
GP-PAGES-01 and IDLE-M1 (owner decisions; #762), the PRIMARY claims (G07-D1/D2/D3/D5, G03-D1, G10-D2/L2-I4),
tooltips (#766), ERC-20 Pages qualification (#753, #764), the stress runner (#765) and the quick-hide donor tests (#761).
Out of scope: D-1 (`ux-flow`, not imported), A-1/A-2/A-4/M-0x (contracts), TDA-02/03 and all relayer items,
D-3 (fiat quotes: F13 stopped), HAIKU R1 F4-F6 (policy feature) and R2 F1-F6 (scripts, payer-sponsor, pool, docs).

## Verified already fixed on main (do not re-investigate)

| Finding (source) | Fixed by |
|---|---|
| TDA-01 / PAGES-02-R2 / SENSITIVE-03: unverified download released the invoice gate (`ARCHITECTURE_TOP_DOWN_REVIEW`, third/fourth pass, Pages second pass) | `6a0feaa8`; `SellerKeys.tsx:39` now requires `backup.verified \|\| backup.waived` |
| HAIKU R1 F1: `scan-bundle.mjs` comment stripper hid same-line code | `81614e56` (AST-based source sink scan, `scan-bundle.mjs:101`) |
| ChatGPT ledger: `idbStore.ts` ignored an unexpected close of an open connection | `6a0feaa8` (`idbStore.ts:35-41` `onversionchange`/`onclose`) |
| GP-AUD-208-01: `verifyMerchantProfile` accepted NaN/undefined clocks (full profile only) | `e69e6949` (`merchantProfile.ts:158`) |
| B-1: export UI said a payment key "controls only" its address | `07722292` (`en.json:2532,2546,2568` describe master-key reconstruction) |
| REV-I5: unsent attempt left after a mirror write failure | #739, merged `bc1e1523` (docs still say "on branch", see above) |
| REV-L2: pre-send check read the mirror | `141b3f96` via #500 `c8e131c1` |
| JRNL-L4: clear reported success while a returned hash was unsaved | `957d8fcc` (`duplicateAttemptJournal.ts:433-436`) |
| LATE-LM1: quarantined linked payment released its invoice | #716 `9d92472a` |
| RCPT-L1/L2 (`ux-receipts`, not shipped) | `752828f6` via #690 `1bea3df3` |
| #744 follow-up: `tx-review` accepted the fee recipient as sweep destination | `88ecb6be` (#755) |
| #744 follow-up: web `checkDestination` accepted a token contract until signing | `74e179de` (#755) |
| #744 follow-up: popup launcher beside an open embed dialog (embed not shipped in lean) | `71cc7c27` (#755); no focus trap, but page made inert by `df6c6ab9` (#758) |
| #755 F5: relayer refusal not translatable | `3bcd16eb` (#758) |
| F8: tag archive passphrase bytes not wiped | `51991e1f` (#755) |
| W2-1/W2-2/W2-3 (settings from another tab, indexer rejects, foreign-clear rewind) | `f795e1a2`, `6fd028a9`/`05bc727e`, `ce25b1ad` (#755) |
| P14 F1-F4 (checkpoint ownership, light evidence label, indexer caveat, caught-up) | #723 `3603960c` (F1 mitigated; residual race above), #745 `3c9fc0ab`, #749 `7d29d39b`, #747 `6b323a99` |
| #758 six residuals (embed inert, relayer text, dense indexer window, signer pins, memo marker, offline notice) | `df6c6ab9`, `3bcd16eb`, `2b6e9784`+`dac22aca`, `c23331ae`, `6302cf22`, `5cfee7f5`; each has a test that fails when the fix is reverted (read in the diff). The exception is the `Scan.tsx` wiring: see A1-C1 |
| C-1: RPC fetch lacked `credentials:'omit'` etc. | Fixed on main (security-remediation-20261118 table) |

## Ownership facts gathered

- **Claims registry** `origin/automation/ghostpay-work-claims` `dd2898c2` (updated 02:11Z):
  - P-COORD, P-M1 through P-M4, S-COORD and S-REV-I6, plus the observed #766.
  - None overlaps A1-C1, A1-C2 or A1-C3 paths.
- **New since the registry snapshot:** branch `origin/automation/20261127/bug/browser-digest-deadline` (`701ae992`,
  base `b890a766`, no PR seen).
  - It owns `apps/web/src/lib/browserChecks{,.test}.ts` and the handoff `BROWSER_DIGEST_DEADLINE_20261127.md`.
  - Also new: `origin/primary/feature-tracker-20261128` (`8acb4eae`), which changes only `ACTIVE_WORK.md`.
  - Neither overlaps the candidates.
- **Open PRs checked** (GitHub `list_pull_requests` state=open, plus file lists in `/workspace/secondary/pr-files.txt`):
  - checked: #766, #765, #764, #763, #762, #761, #760, #753, #742, #726, #722, #720, #678, #665, #653, #643, #639, #380;
  - the very old stacks (#372, #294, #609, #587, #569, #383, #355, #300) have 1,400-2,200-file diffs against stale
    bases and were not used for path ownership.

## Probes (scratch only, never committed)

`/workspace/scratch/a1-census-probes/`:

- `Scan.a1probe.test.tsx`: the A1-C3 reproduction. Copy it into `apps/web/src/views/` and run with vitest.
- `Scan.a1cancel.test.tsx`: the A1-C1 discriminating test. It is a full copy of `Scan.indexerCompletion.test.tsx` plus
  the probe block. Run it with `-t "A1 probe"`.
- `scan-route-fix-prototype.patch`: an illustrative A1-C3 fix. The hunk line numbers are approximate; apply it by hand.
- `wss.mjs`: the A1-C2 probe. Run it from `apps/web` so `@ghostpay/chain-adapters` resolves to the built dist.
