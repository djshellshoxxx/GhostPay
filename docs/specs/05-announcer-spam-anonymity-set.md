# 05 Announcer spam and anonymity-set mitigation

Priority P1 | Effort M (4-6 d) | Owner: chain-adapters + web scanner + docs | Deps: 02, 10
Sources: research 1.2 items 1,2,3; DOC-2; ERC-5564 view-tag security (128 -> 124 bits, 8-bit bucket).

## 1. Problem
Announcer is permissionless: spam raises scan cost, wrong tags pollute buckets, and low announcement volume per chain means a small anonymity set. Spam cannot be stopped on-chain (announcer is used as deployed; CONTRACTS_SPEC preamble).

## 2. Design
A. **Scanner-side filters** (no consensus change):
- Cheap prefilter order: length check -> view-tag compare -> point decode -> ECDH. Tag compare first drops ~255/256 of ordinary spam before curve work.
- Per-emitter-caller ranking: classify logs by `caller`/tx `to`. Router-originated (known manifest router) = trusted lane, processed first. Others = open lane with a per-pass budget (default 20k logs, configurable); overflow deferred, surfaced as "backlog N". The first page of a pass is never deferred, so a budget smaller than one page cannot hold the cursor for good (a pass may then do the budget plus one page of open-lane work).
- Fetch limits do not stop the scanner except as listed under remaining limits: a log or block-read cap ends the fetch at the last completed range, a provider range or result limit halves the request (it grows back past a narrowed block), and a single block whose announcements exceed one RPC response (the 2 MiB client cap, or a provider refusal coded -32602 or -32005) is re-read for the trusted lane only (`caller` = manifest router) and reported to the seller; open-lane announcements in that block are skipped, visibly. -32005 is also a rate-limit code, so a block refused with it is narrowed only if the whole block is refused again after its trusted lane was read; otherwise it is scanned whole, or the scan stops before it with an RPC error to retry later. Remaining limits: a block holding more router-posted announcements than one response can carry still stops the scan at that block, and so does a single block refused with a range-limit code that does not signal the response size (-32600, -32614 or -32000), which gets no trusted-lane fallback.
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
