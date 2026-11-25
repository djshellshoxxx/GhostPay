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
| 1 | Claim, checkpoint | done | (this commit) | n/a |
| 2 | Failing tests, vector generator, TEST-ONLY vector | pending | | |
| 3 | Reader in `stealth-export-recover.mjs` | pending | | |
| 4 | Cross-implementation and isolated-directory tests | pending | | |
| 5 | Browser acceptance spec | pending | | |
| 6 | Docs (format reference, user guide, vector README) | pending | | |
| 7 | Gates, review, draft PR | pending | | |

## Environment limits

Windows 10, 3.9 GB RAM (about 0.2 GB free at start, other sessions running), 4 CPUs, Node v26.13.1. No Playwright
browsers are installed and the config forbids `playwright install`. Foundry is not on PATH. Any test that did not run
here is listed as not run, with the reason.

## Next action

Write the failing tests and the vector generator (milestone 2).
