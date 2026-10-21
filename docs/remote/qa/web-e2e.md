# QA: apps/web e2e + exploratory (branch claude/remote-extensions-1)

## What ran
1. `cd apps/web && npx playwright test` (config builds + `vite preview` :4173). Result: **15/15 passed** (1.1 min): 11 in e2e/app.spec.ts (shell/CSP, create->review, egress, hostile text, tampered/oversized fragment, fragment removal, no secrets in storage, keyboard, light/dark, 320-ish mobile no hscroll), 4 in e2e/flows.spec.ts (native pay w/ mock wallet+RPC, mutated-tx refusal, scan in Worker + encrypted tags, embed popup). NOTE: existing e2e has NO sweep and NO settings coverage.
2. Extra exploratory Playwright suite (scratch, not committed: scratchpad/qa/qa.spec.ts, pages.spec.ts; run against `vite preview` :4174 of apps/web/dist). 11 tests: sweep (direct, mock RPC, via real scan), settings validation/persistence/corrupt storage/test-connection, create-invoice validation, malformed invoice links, keyboard tab order, manual a11y audit (1280/375/320 px), forced-colors+reduced-motion+320x256 reflow, console errors on all views, hash navigation/back/forward. Final state: 9 pass; 2 test-script errors of mine fixed (sweep: token is USDC not ETH; settings: URL normalised to trailing slash). The remaining "failure" in the sweep test is the defect Q1 below (assertion that no tx was sent).
3. Pages theme: `vite build --base=/GhostPay/` -> `scan-bundle` -> `rm _headers` -> `apply-theme.sh` into a scratch dir, served at /GhostPay/ by a small node static server (:4175), driven by Playwright.
axe-core: NOT installed (node_modules has no axe*); manual DOM checks only (labels, names, h1 count, duplicate ids, lang, main, target size >=24px, overflow, focus outline). Results: 0 findings in all 7 views x 3 widths (1280/375/320). Not a substitute for axe or screen-reader testing (unverified: SR announcements, aria-live behaviour).

## Defects
### Q1 (medium) Sweep accepts the zero address (and other burn targets) as destination
- Evidence: apps/web/src/lib/sweep.ts:44-52 `checkDestination` only rejects non-address, the stealth owner itself, router/sweepRelayer/announcer/feeRecipient. Observed: destination `0x0000000000000000000000000000000000000000` passes validation; a signed raw tx (`transfer(0x0, 1000000)` to the USDC token) was sent via eth_sendRawTransaction on the mock RPC. Token contract address / the payment token as destination is likewise unchecked (not run; code-verified).
- Repro: scratchpad/qa/qa.spec.ts test "sweep direct native..." (fails at `expect(st.raw).toBeUndefined()` after trying the zero address); or manually: Scan (mock) -> Sweep this payment -> Directly -> destination 0x000...0 -> Sign and broadcast directly.
- Fix: reject zero address, token contract, and ideally warn on any address with the "burn" patterns (0x...dEaD).

### Q2 (low) scan-bundle step in docs/remote/pages-prototype.md does not return `[]`
- Evidence: following the doc order (build, `rm -f $OUT/_headers`, scanBundle) returns `[ '_headers missing' ]`, while the doc says `[] expected`. Ran as above.
- Fix: run scan before removing _headers, or document the expected output / have scan-bundle skip that check for Pages.

### Q3 (low) Themed Pages build ignores Settings > Theme
- Evidence: theme.css forces `color-scheme: dark` and bg rgb(5,9,18); with OS light and Settings Theme=Light saved, body bg stays rgb(5,9,18) (pages.spec.ts). The control is dead on that build with no notice. README states "always dark", so this is intended but a UX inconsistency.
- Fix: hide/disable Theme select under the theme, or note it.

### Q4 (low) About "Who learns what" table is cramped at 320 px
- Evidence: first column 56 px wide (cells [56,158,72]) in both plain and themed builds; headings wrap per few letters ("Obs/erver", "Public chain analyst" over 5+ lines); screenshot pages-mobile.png. Table sits in an overflow:auto parent (no page hscroll), so it is readable but poor.
- Fix: stacked/card layout under ~400 px or min-width on first column.

### Q5 (info) Deployment manifests re-fetched on every view change; 404 console noise
- Evidence: Pages build logs repeated `GET deployments/{11155111,84532}.json 404` (about 10 each over one session of 8 view switches + invoice create). Expected per pages-prototype.md (no manifest), but not cached/negative-cached. Also plain build: no console errors/warnings across all views (test "console errors" printed `[]`).

### Q6 (info) RPC URL policy accepts loopback/private hosts
- Evidence: Settings saved `https://localhost/` and `https://127.0.0.1/` (stored in localStorage). May be intentional (dev); a hostile-page/SSRF concern is nil in-browser, but a user could be socially engineered to point at an attacker RPC (already warned about plaintext storage). No change needed unless policy says otherwise.

## Verified OK (no defect)
- Sweep: bad/empty/short destination rejected with message; self-destination rejected; zero balance disables "Sign and broadcast directly"; no RPC => "unknown (an RPC for this chain is required)" and buttons disabled; happy path produces a type-2 (0x02f8b2...) raw tx on chain 0x14a34 and shows Submitted + hash.
- Settings: http/credential/javascript: RPC rejected, nothing stored; http relayer rejected; delay min>max and negative rejected; pinned key format enforced; valid save persists across reload (RPC normalised with trailing slash), theme applies on reload; corrupted/unknown stored values fall back to defaults; non-JSON storage does not crash; Test button reports failure for wrong chain id.
- Create invoice: empty/negative/zero/exponent/19-decimal/alpha amounts rejected; 400-emoji + RLO description accepted (link created, no crash).
- Malformed links (`#gpi=`, `v1.`, `v2.`, bad base64, short, 50 kB) fail closed with a message, no page errors; hash removed after read; back/forward keeps review screen, no URL leak.
- Keyboard: skip link first, nav buttons, 3px visible outline on every stop, no trap, Enter on nav moves focus to `main`. 320x256 reflow: no hscroll. forced-colors + reduced-motion load fine.
- Themed Pages build: builds, theme.css + Michroma font load (document.fonts.check true), CSP meta preserved, create-invoice flow works, text contrast >= 4.5 (3 large) in all 8 views at 1280 and 320 (my computed check), no hscroll.

## Gaps (not done)
- Relayer sweep path, ERC-20 permit flow, pay with ERC-20, encrypted-invoice pay, tag UI edge cases in browser, wss RPC, CSP-violation fuzz, Firefox/WebKit (only chromium-1194), real touch/mobile emulation devices, screen-reader testing, axe-core, `_headers` behaviour on a real host, embed SDK beyond the existing test.
