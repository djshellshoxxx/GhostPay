# 05 Announcer spam and anonymity-set mitigation

Priority P1 | Effort M (4-6 d) | Owner: chain-adapters + web scanner + docs | Deps: 02, 10
Sources: research 1.2 items 1,2,3; DOC-2; ERC-5564 view-tag security (128 -> 124 bits, 8-bit bucket).

## 1. Problem
Announcer is permissionless: spam raises scan cost, wrong tags pollute buckets, and low announcement volume per chain means a small anonymity set. Spam cannot be stopped on-chain (announcer is used as deployed; CONTRACTS_SPEC preamble).

## 2. Design
A. **Scanner-side filters** (no consensus change):
- Cheap prefilter order: length check -> view-tag compare -> point decode -> ECDH. Tag compare first drops ~255/256 of ordinary spam before curve work.
- Per-emitter-caller ranking: classify logs by `caller`/tx `to`. Router-originated (known manifest router) = trusted lane, processed first. Others = open lane with a per-pass budget (default 20k logs, configurable); overflow deferred, surfaced as "backlog N". The first page of a pass is never deferred, so a budget smaller than one page cannot hold the cursor for good (a pass may then do the budget plus one page of open-lane work).
- Fetch limits do not stop the scanner except as listed under remaining limits: a log or block-read cap ends the fetch at the last completed range, a provider range or result limit halves the request (it grows back past a narrowed block, or past a refusal that a fixed range limit cannot explain), and a single block whose announcements exceed one RPC response (the 2 MiB client cap, or a provider refusal coded -32602 or -32005) is re-read for the trusted lane only (`caller` = manifest router) and reported to the seller; open-lane announcements in that block are skipped, visibly. -32005 is also a rate-limit code, so a block refused with it is asked for whole once more after its trusted lane was read: it is scanned whole if that read succeeds and narrowed if it is refused as too large again (-32005 included). Only a failed trusted-lane read, or a different error on that second read, stops the scan before the block with an RPC error to retry later. The second-RPC cross-check (`compareProviders`) handles a block the second provider refuses the same way; a different error on its second read is a `secondary_error`, which withholds the page. Remaining limits: a block holding more router-posted announcements than one response can carry still stops the scan at that block, and so does a single block refused with a range-limit code that does not signal the response size (-32600, -32614 or -32000), which gets no trusted-lane fallback. A -32005 rate limit that still refuses the second whole-block read (the client's three attempts) narrows an ordinary block, as a real size limit would: telling a provider rate limit from a result-size limit needs the provider's error text, which `rpc.ts` deliberately drops (it keeps only the JSON-RPC code).
- Optional local spam score: repeat ephemeral keys, same `caller` > K logs/block, metadata not matching 57-byte pattern -> deprioritised, never silently dropped when an invoice expects a payment (spec 02 fallback).
B. **Anonymity-set telemetry (local only)**: from scanned logs compute per-chain 7/30-day announcement counts and same-token transfer counts at similar amounts; show seller a coarse "privacy set: low/medium/high" with the number. Thresholds are product heuristics (UNVERIFIED, tune); copy states that tag buckets and amounts shrink the set.
C. **Sender-side guidance**: routed payments only for GhostPay (trusted lane); amount hygiene hint (avoid unique amounts); jitter (Feature 6) kept; funding hygiene per DOC-2 (never fund stealth from identified wallet; use buffer/relayer).
D. **Provider-side options** (docs only): list of rate-limited public scanner endpoints; stake/toll ideas from ERC-5564 are out of scope for contracts (ADR-0006, no admin).
E. DOC-2 seller privacy guide: `docs/user/seller-privacy.md` with sweep-destination linkage and funding rules.

## 3. Threats
Resource exhaustion (budget); targeted spam to hide a real payment in backlog (trusted lane + expected-payment fallback); false comfort from anonymity score (copy; coarse buckets); telemetry leak (computed locally, never sent).

## 4. Tests
Synthetic chain log with 1M spam + 10 real: real found within budget; trusted-lane ordering; budget overflow produces backlog UI state; benchmark tag-first vs ECDH-first. Copy test for the privacy-set banner.

## 5. Acceptance
- [ ] Scan CPU for 1M spam logs under 60 s on reference laptop (target, UNVERIFIED). - [ ] No expected payment missed in spam test. - [ ] Seller privacy guide published. - [ ] Settings exposes budget and lane options.

## 6. Implementation status (A5 verification, 2026-11-04)
Scope checked: `apps/web/src/lib/scanSpam.ts` (`splitLanes`, `FLOOD_PER_BLOCK`, `anonymitySet`) and `apps/web/src/lib/scanClient.ts` (`runScan` lanes, open-lane budget, `limitReached`, checkpoints). Adversarial tests live in `scanSpam.test.ts` ("splitLanes adversarial matrix (A5)") and `scanClient.test.ts` (tests tagged "(A5)" in the spec 05 block).

Held as implemented, now pinned by tests:
- Lane split drops nothing; router lane is case-insensitive and never deprioritised; a caller is flagged only above `FLOOD_PER_BLOCK` in one block (per caller, per block); a replayed ephemeral key only deprioritises. A flooding caller in the same page as a router payment and an honest direct payment does not hide either; the flood is ordered last.
- The first page of a run is never deferred. A deferred page holds the cursor at its start (a block boundary); a reorg page that hits the budget holds the cursor at the rollback and clears the orphaned checkpoint.

Defects found and fixed (each with a failing-first test):
1. **Saved checkpoint pinned by a flood (budget never passes the spam on resume).** The checkpoint was always written `finalityDepth` blocks behind the cursor. When pages are narrower than `finalityDepth` (a provider range limit, or a dense flood hitting the 10,000-log page cap), a run stopped by the open-lane budget or `limitReached` saved the same checkpoint every time, so resuming from it (what the Scan view does) repeated the same run forever and never reached later router or direct payments. Now blocks already `finalityDepth` deep below the head are saved up to the cursor itself, never past the run's earliest `pending` match; near the head the old tail is kept. Across resumes each open-lane log in final blocks reaches the worker exactly once.
2. **Privacy set mislabelled when a run stopped early.** The 7/30-day windows were anchored at the last scanned block, so a run held by the budget far behind the head reported old router announcements as "in about the last 7 days" and `partial: false`. The windows now end at the head the run could reach and the result is `partial` when the scan stopped short of it (`anonymitySet` takes `scannedTo`).
3. **Privacy set double-counted after a mid-run reorg.** Router announcements in the rolled-back range were kept and re-added by the replacement page. They are now dropped on rollback, like matches and router-only blocks.
4. **Checkpoint could pass a pending payment.** When the payment check saw a lower head than the log fetch (a lagging, load-balanced backend), a match could be `pending` below the saved checkpoint and would not be re-listed on resume. The checkpoint is now capped at the run's earliest `pending` match.

Known limits left as is (not UI-reachable or by design):
- `maxAnnouncementsPerScan` below one page's announcement count stops every run before its first page. The Scan view does not set it; the default (100,000) exceeds the per-fetch log cap (10,000), so it cannot happen there. Not relaxed, because it is a safety limit.
- Inside the finality window near the head, a deferred page still waits for the chain to advance (the checkpoint follows `head - finalityDepth`), so progress there is bounded by block time, not stuck.
- `telemetry.suspected` also counts announcements in a deferred page; `scanned` re-counts the router lane of a deferred page on the next run. Neither is shown in the UI; `backlog` is the open-lane count of the deferred page only (later blocks were not fetched).
- Section 4/5 items not covered here: the 1M-spam synthetic run and the CPU benchmark (target UNVERIFIED), and the seller privacy guide path (`docs/user/seller-privacy.md` does not exist; related copy is in `docs/user/privacy-limits.md`). Acceptance boxes are left unticked.
