# P0-KEYS checkpoint: GhostPay-independent seller-keystore recovery (2026-11-25 UTC)

Resume from this file if the session stops. Update it after every milestone.

| Field | Value |
|---|---|
| Branch | `claude/p0-keys-independent-recovery` (local worktree `.claude/worktrees/p0-keys-recovery`) |
| Base | main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063` |
| Latest commit | see `git log -1`; the milestone table below names the commit for each result |
| PR | not yet opened |
| Owner claim | top entry of `docs/ai/ACTIVE_WORK.md` on this branch |

## Discovery (2026-11-25 04:40 UTC, main `c8e131c1`)

| Work | State | Notes |
|---|---|---|
| #539 Spec 18 codec, standalone decoder, single-payment export | merged 2026-11-24 | `scripts/recovery/*`, `packages/ux-vault/src/stealth-export-portable*` |
| #542, #572 single-payment export from Scan, offline recovery | in main (ancestors) | via the individual export recovery merge `05d818e7` |
| #560 encrypted single-payment spend check | merged | `raw-key-anvil.test.mjs` |
| #622 archive, master backup, in-app recovery (M2b) | open draft, owned | conflicts with main; e2e full/lean/anvil fail on duplicate "Verify backup" name; owner said a fix is coming |
| #641 seller-keystore verify/restore consolidation (#530, #540, #573, #629) | open, owned, active | typed keystore errors, verify panel, vault preservation, fresh-profile restore and sweep on devnet |
| #240, #239, #260, #269, #361, #372 | open, stale | older Spec 18 integration stacks, superseded by #539 and #622 (#641 says the same) |
| #588 mobile Chromium/WebKit qualification | open, owned | not touched |
| Firefox/WebKit browsers | not supported by main's tooling | `apps/web/playwright.config.ts` is Chromium only; device projects are Chromium emulation |

Distinct unowned gap: the reference recovery script cannot read the seller keystore (`ghostpay-keystore.json`),
which is the backup **Back up (encrypted)** downloads. Only GhostPay code can open it today.

## Milestones

| # | Milestone | State | Commit | Evidence |
|---|---|---|---|---|
| 1 | Claim, checkpoint | done | `693e9843` | n/a |
| 2 | Failing tests, vector generator, TEST-ONLY vector | done | `08e55e34` | new suite failed at import before the reader existed |
| 3 | Reader in `stealth-export-recover.mjs` | done | `08e55e34` | `node --test scripts/recovery/seller-keystore-recover.test.mjs`: 14/14 pass |
| 4 | Cross-implementation and isolated-directory tests | done | `08e55e34` | in the same suite; existing recovery suites 23 pass, 2 skipped (no Foundry here) |
| 5 | Browser acceptance spec | written; local run in progress | | `apps/web/e2e/independent-keystore-recovery.spec.ts` |
| 6 | Docs (format reference, user guide, vector README) | done | `b2f7879e` | n/a |
| 6b | Independent review fixes (BOM, inspect note, bounds tests) | done | `e72978a8` | recovery suites 41 tests: 39 pass, 2 skipped (no Foundry) |
| 7 | Gates, draft PR | in progress | | web `tsc -p tsconfig.json --noEmit` exit 0; ESLint on the new spec exit 0; `scripts/scan-secrets.sh` OK |

Independent review (code-reviewer subagent, read-only): no critical or high findings. It reported a BOM asymmetry
with the app's `Blob.text()`, a missing header-only note on master `--inspect`, a wrong doc cross-reference and test
gaps (hex case, upper import bounds). All were fixed in `e72978a8`. It also noted an accepted behaviour change: a
master backup's header is now validated before announcements and the passphrase are read, so a file with both a bad
header and a bad announcement reports `invalidFile` first.

Not run locally: web unit tests (`src/**` only; this change touches no web source), the anvil suites (no Foundry),
Firefox/WebKit (not in main's tooling). `.mjs` files are excluded by the repo ESLint config.

Not edited on purpose: `docs/user/set-up-stealth-meta-address.md` (open PR #577 edits it).

## Environment limits

Windows 10, 3.9 GB RAM (about 0.2 GB free at start, other sessions running), 4 CPUs, Node v26.13.1. No Playwright
browsers are installed and the config forbids `playwright install`. Foundry is not on PATH. Any test that did not run
here is listed as not run, with the reason.

## Next action

Write the failing tests and the vector generator (milestone 2).
