# Receipt and bill print completion — 2026-11-24

## Result and provenance

The unique selected-document print work from #316 → #532 → #548 is preserved on
`finish/receipt-print-completion-20261124`, reconciled with current main,
independently reviewed and locally qualified. Actual PDF inspection also found
and repaired a dark-theme page-margin defect. Receipt/payment semantics and
release gates are unchanged.

| Checkpoint | Exact commit or tree |
| --- | --- |
| Original #548 | `cb977e4b31047e65ccbe8835c8e45e1cff3cfc84` |
| Original #532 | `51c04326ff9258861621b94ce2ab06f44bba8301` |
| Main at qualification | `2d83de0b7f5bba0fafc0c25d19d1fcb382edf719` |
| Initial local merge | `e9aaeeabf3033aaf084dca32438ce61fb1ee11d8` |
| Failing regression commit | `aaeb6eb7a488d0e3b00822883f5e329ff0703e5f` |
| Qualified local code | `e722f239be6aab9af3907089547c8dfd301f0029` |
| Qualified local tree | `1805a99ee712392aba9e8d446397ea30cb54da9a` |
| Qualified `apps/web` tree | `917f0aec9fb00324608da8f591a06029059dec2e` |
| Latest main incorporated | `706188000c38b3dde5a3a362370a530870aa7587` |
| Final local main reconciliation | `75c6d4ad183dd649dbbfd04b1310f81632b48ddc` |

Both donor tips remained unchanged on live readback. Main's later template-clock
rollback affects `packages/ux-schedule` and documentation, with no print overlap.
The final reconciliation preserves the qualified web tree exactly. Reported print
tests and builds ran before that main-only reconciliation; no print source or
assertion changed afterward. Only additive registry conflicts needed resolution;
every nonblank line and its duplicate count from both parents was retained.

Before the repair, the entire web tree was
`e093544439c8e9c39cafefd0084ced93c20d745e`, identical to #548. The only subsequent
web changes are two print-CSS lines and 14 additive browser-test lines. Connector
publication uses the exact local tree with latest main and #548 as parents,
preserving donor ancestry. The final handoff commit changes documentation only.

## Minimal repair and review

The donor made the receipt body white but left the root `color-scheme: dark`.
With background printing enabled, Chromium painted near-black page margins.
Baseline full/lean PDF rasters had RGB `(18, 18, 18)` at all four sampled corners.
The repair adds `:root { color-scheme: light !important; }` inside `@media print`.
It overrides the more specific explicit-dark rule in either stylesheet order and
is inactive on screen. All existing selection, secrecy and pagination rules are
unchanged. Two added regressions check dark → light → dark across screen/print/
screen in both stylesheet orders; both failed before the repair.

Independent worker `/root/unique_history` approved source at `e9aaeeabf` and exact
`e722f239be6aab9af3907089547c8dfd301f0029`, with no blockers. The review covered real
callers, signed-fact/invoice-binding/eligibility guards, cleanup, secret-QR and
private-interface exclusions, escaped transaction text and absence of new explorer
links. This was source review; the reviewer did not rerun tests or submit a GitHub
approval.

| Qualified path under `apps/web` | Git blob |
| --- | --- |
| `src/styles/print.css` | `9f91abe32e34c5482236fbc861043dd6cc884132` |
| `e2e/print-targets.spec.ts` | `29e9040610a213df280a2bc0aa0336ebfad93682` |
| `src/lib/usePrintTarget.ts` | `38b127b71d71597847c82a5e0f1cd96ed9a0b3bc` |
| `src/components/ReceiptPanel.tsx` | `1f0e967c587bfb36e191962bc1473351da9d4e3c` |
| `src/components/PrintableBill.tsx` | `946f38f0d2c8b31c9f5b58309eab726ad23b1989` |
| `src/styles/qr.css` (unchanged) | `bc3e17953c0e3befee673fe40e0bba120d048ce7` |

The exact donor print-CSS blob was `7831982b31634a2ebc9099a4abcbd1b12295e169`;
older historical handoff tables are not current qualification pins.

## Executed qualification

Own `npm ci --ignore-scripts --no-audit --no-fund` installed 722 packages. Runtime:
Node 24.22.3, TypeScript 5.9.3, Vitest 5.0.5, Playwright 1.64.1 and Chromium
headless shell 156.0.8078.4. No dependencies or build outputs were shared.

| Check | Result |
| --- | --- |
| Focused units | 54/54 in seven files, including 128 generated print/cancel/replace/remount sequences, seed 532548 |
| Original browser baseline | 17/17 full and 17/17 lean |
| New regressions before repair | Both failed: printed root remained `dark`, expected `light` |
| Repaired fixture-only browser suite | 18/18, no preview server |
| Final native browser suite | 19/19 full (39.2 s), 19/19 lean (37.7 s); no skipped or weakened assertions |
| Final full/lean web builds | TypeScript and Vite passed; bundle scans passed for 19/17 files |
| Typed lint | Passed all eight changed TS/TSX paths |
| Secret scan | Passed, no committed environment files or key material |
| Provenance/whitespace | Donor/main ancestry and main-relative `git diff --check` passed |

Focused Vitest paths were `src/lib/usePrintTarget.test.tsx`,
`src/components/PrintableBill.test.tsx`, and `ReceiptPanel.test.tsx` plus its
`invoice`, `profile`, `archive` and `i18n` suites; run from `apps/web` using
`../../node_modules/.bin/vitest run ... --maxWorkers=1`. Web dependencies were
built with `npm run build -- --workspace @ghostpay/web`, and the test-only relayer
dependency with `npm run build --workspace @ghostpay/relayer-guard`.
Final builds used `npm run build -w @ghostpay/web` with each
`GHOSTPAY_LOCAL_BUILD_PROFILE=full` and `lean`.

Final browser runs used the unchanged repository Playwright configuration,
`--project=desktop --workers=1`, `NODE_OPTIONS=--max-old-space-size=1024` and
`GHOSTPAY_CHROMIUM=/workspace/scratch/efb8df2579c9/mobile-browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell`.
The command was `npm run test:e2e -w @ghostpay/web -- e2e/receipt-completion-capture.spec.ts --project=desktop --workers=1`,
once for each profile. The temporary uncommitted wrapper imported the durable
`e2e/print-targets.spec.ts` unchanged and only added PDF capture after tests. It was
removed after qualification; running the durable spec executes the same 19 tests.

## PDF evidence and publication

Full and lean PDFs were checked with text extraction, page counts and raster
inspection. The real second signed receipt occupies one Letter page, contains its
exact synthetic transaction, and excludes the first transaction, rendered bill,
raw JSON and print/copy/download controls. The 90-item bill occupies four pages
and reaches item 90, with no other receipt, private navigation or secret QR.
Dark-theme output now has white margins `(255, 255, 255)` at all four corners;
selected content remains present and other receipts, raw JSON, secret QR bodies
and interactive controls remain excluded. The existing omission note is retained.

The original page-count probe dispatches `afterprint`, correctly clearing the
selection. Capturing a real receipt therefore requires a fresh deliberate print
request. An initial blank post-cleanup capture was not counted as receipt evidence.
Raw PDFs, PNGs, logs, JSON readbacks and the temporary wrapper remain in
`/workspace/scratch/9723b6705f45/evidence-receipt`. No physical printer, live payment
or deployment was used. Port 4173 was released after final runs. Own worktree
dependencies were removed afterward to recover disk; source and evidence remain.

Original #548 had five successful hosted runs: CI `45316580320`, Pages
`45316580284`, Beta `45316580311`, Hosting `45316580376`, CLI `45316580348`.
These are historical donor results, not hosted qualification of this candidate.
Fresh exact-head hosted CI remains required. Publication authorization covers
only this new branch and main-targeting draft PR; donor refs, shared integration,
leases and deployment remain untouched.
