# P0-KEYS checkpoint: GhostPay-independent seller-keystore recovery (2026-11-25 UTC)

Resume from this file if the session stops. Update it after every milestone.

| Field | Value |
|---|---|
| Branch | `claude/p0-keys-independent-recovery` (local worktree `.claude/worktrees/p0-keys-recovery`) |
| Base | main `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f` (rebased from `c8e131c1` on 2026-11-25; only POS terminal commits came in) |
| Qualified source | `27abc3a606965d1119642a7f4930b3b9cbf0c5df` (all local results below are for this tree unless a row says otherwise) |
| PR | draft, see the PR row at the end |
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

Commit SHAs are the rebased ones.

| # | Milestone | State | Commit | Evidence |
|---|---|---|---|---|
| 1 | Claim, checkpoint | done | `37e1b790` | n/a |
| 2 | Failing tests, vector generator, TEST-ONLY vector | done | `cab6df4f` | new suite failed at import before the reader existed |
| 3 | Reader in `stealth-export-recover.mjs` | done | `cab6df4f` | first run 14/14 pass |
| 4 | Cross-implementation and isolated-directory tests | done | `cab6df4f` | in the same suite |
| 5 | Browser acceptance spec | done | `27abc3a6` | Chrome 1/1 pass, full profile (2.4 min, pre-rebase tree, same spec); Chrome 1/1 pass, lean profile (2.4 min, `27abc3a6`) |
| 6 | Docs (format reference, user guide, vector README) | done | `d16be26a` | n/a |
| 6b | Independent review fixes (BOM, inspect note, bounds tests) | done | `ba87cb98` | n/a |
| 7 | Local gates | done | `27abc3a6` | see the gates table |
| 8 | Draft PR, hosted CI | in progress | | |

Local gates at `27abc3a6` (Windows, Node v26.13.1):

| Gate | Command | Result |
|---|---|---|
| Recovery suites | `node --test scripts/recovery/seller-keystore-recover.test.mjs scripts/recovery/stealth-export-recover.test.mjs scripts/recovery/raw-key-anvil.test.mjs` | 41 tests: 39 pass, 0 fail, 2 skipped (anvil/cast not installed). CI runs these with `REQUIRE_ANVIL=1`. |
| Browser acceptance | `npx playwright test e2e/independent-keystore-recovery.spec.ts --project=desktop` with `GHOSTPAY_CHROMIUM` set to installed Chrome and a longer local web-server timeout (uncommitted config, deleted) | pass in full and lean profiles |
| Web typecheck | `tsc -p tsconfig.json --noEmit` in `apps/web` (after `npm run build:libs`) | exit 0 (pre-rebase tree; rebase changed only `examples/pos-terminal` and `ACTIVE_WORK.md`) |
| Web lint (new spec) | `eslint --config ../../eslint.config.js e2e/independent-keystore-recovery.spec.ts` | exit 0 (same note) |
| Secrets | `bash scripts/scan-secrets.sh` | OK |
| Action pins | `bash scripts/check-actions-pinned.sh` | OK, 114 references |
| Vector check against GhostPay's codec | in the recovery suite | the built codec opens the vector and refuses 25 of 26 refusals; the 26th is the documented body |

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

## Remaining and blockers

- Hosted CI on the PR head: `ts-test (rest-0)` runs the recovery suites with `REQUIRE_ANVIL=1`; `e2e (full)`,
  `e2e (lean)` and the Pages workflow run the new browser spec. Check them before calling this qualified.
- Independent human or second-model review before marking the PR ready. The read-only review above was AI-assisted.
- Not in this work: Firefox/WebKit (no tooling on main), mobile engines (#588), in-app keystore verification and
  restore (#641), archive, master and in-app Spec 18 recovery (#622).

## Next action

Watch hosted CI on the draft PR; fix any failure in owned paths only.
