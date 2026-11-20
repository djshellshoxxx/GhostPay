# Browser view review handoff

Assigned source review is complete: 99/99 unique path/blob versions, 63 paths, 504 path/ref mappings. The count was reconciled against `source-inventory.json`. All 27 Bitcoin versions, including the final `BtcView.tsx` variant, were read before the coverage statuses were finalized. See `web-views-review.md` and `web-views-coverage.json`.

## Consolidation decisions

- WV-01 is the integrated medium wallet connection lifecycle finding; library review corroborates the helper. Present on all eight refs. Limit the impact to stale app-issued connection/chain requests, not cancellation of an already-open external wallet prompt or an unauthorized transfer.
- WV-02 is duplicate UI evidence for `ZC-CRYPTO-01`. It occurs on release, consolidation, privacy-snapshot, quick-hide, clipboard and format. Main and erc20-simulation share the older required-field receipt format.
- WV-03, WV-04 and WV-06 occur on **both main and erc20-simulation**. These branches share the relevant old view/feature blobs. The other six selected refs contain the fixes. Do not describe these as main-only or assume every recent branch contains the consolidation.
- WV-04 is now source-confirmed across UI and helper. Baseline helper excerpts at `lib/sweep.ts` 172–263 and 562–664 have only session/quote guards; current helpers combine caller review/session guards. Current full `Sweep.quoteLifecycle.test.tsx` was read, without execution.
- WV-05 is a low TRON test-network binding issue on all refs. Current `TronView.tsx` 109–118 labels network authorization with selected net.id, then calls network-agnostic `checkNetwork`; `rpc.ts` 38–43 only rejects mainnet. Current `sweep.ts` 107 uses the selected wallet label. Nile and Shasta genesis constants are already distinct. Mainnet refusal remains intact. Cross-check with the multichain reviewer to avoid duplicate counting.
- WV-06 includes BTC per-match outpoint requests as well as Solana/TRON matched-address requests. Current BTC default local spentness avoids those calls; explicit provider/light mode discloses them and requires selection. No new unresolved vulnerability is asserted for that disclosed mode.

## Root-owned remainder in the shared web-views domain

These 15 paths account for 17 unique versions and were deliberately not marked reviewed by this owner. Root had accepted them:

- `apps/web/src/i18n/LanguagePicker.tsx`
- `apps/web/src/i18n/Trans.tsx`
- `apps/web/src/i18n/catalog.ts`
- `apps/web/src/i18n/context.tsx`
- `apps/web/src/i18n/index.ts`
- `apps/web/src/i18n/languages.ts`
- `apps/web/src/i18n/message.ts`
- `apps/web/src/i18n/securityKeys.ts`
- `apps/web/src/i18n/source.ts`
- `apps/web/src/i18n/sourceCatalog.ts`
- `apps/web/src/i18n/storage.ts`
- `apps/web/src/i18n/translator.ts`
- `apps/web/src/styles/app.css`
- `apps/web/src/styles/print.css`
- `apps/web/src/styles/qr.css`

No owned production source remains to hand to a fresh reviewer. No production edits, executable exploit/reproduction work, live endpoint probes, transactions, test executions, commits, pushes, merges or deployments were performed by this reviewer. Only the three assigned audit notes were written.
