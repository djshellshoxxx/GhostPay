# P0-KEYS checkpoint: GhostPay-independent seller-keystore recovery (2026-11-25 UTC)

Resume from this file if the session stops. Update it after every milestone.

| Field | Value |
|---|---|
| Branch | `claude/p0-keys-independent-recovery` (local worktree `.claude/worktrees/p0-keys-recovery`) |
| Base | main `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f` (rebased from `c8e131c1` on 2026-11-25; only POS terminal commits came in) |
| Qualified source | `27abc3a606965d1119642a7f4930b3b9cbf0c5df` (all local results below are for this tree unless a row says otherwise) |
| PR | draft https://github.com/djshellshoxxx/GhostPay/pull/647 |
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
| 8 | Draft PR #647, hosted CI | done | `2bb16151` | see the hosted CI table |

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

Hosted CI, PR #647 head `2bb161516c` (workflow run 45555288488; source identical to `27abc3a6` plus this checkpoint):
35 checks pass, 0 fail, 3 skipped by design on PRs (Deploy to GitHub Pages, Post-deployment smoke test, Release
gates). Read from the job logs:

| Job | What ran | Result |
|---|---|---|
| `ts-test (rest-0)` (job 139008754636) | `REQUIRE_ANVIL=1 node --test scripts/recovery/*.test.mjs` | 41 tests, 41 pass, 0 skipped; both anvil spend cases ran |
| `e2e (full)` (job 139008754328) | full desktop suite, pinned Chromium | new spec passed (4.5 s); suite 124 passed, 2 skipped |
| `e2e (lean)` (job 139008754281) | lean desktop suite | new spec passed (3.6 s); suite 112 passed, 4 skipped |
| `Pages artifact on anvil (browser)`, `beta acceptance`, `ts-test (web)`, `ts-typecheck`, `ts-lint`, `secrets-and-egress`, CodeQL, Snyk | as configured | pass |

Independent review (code-reviewer subagent, read-only): no critical or high findings. It reported a BOM asymmetry
with the app's `Blob.text()`, a missing header-only note on master `--inspect`, a wrong doc cross-reference and test
gaps (hex case, upper import bounds). All were fixed in `ba87cb98`. It also noted an accepted behaviour change: a
master backup's header is now validated before announcements and the passphrase are read, so a file with both a bad
header and a bad announcement reports `invalidFile` first.

Not run locally: web unit tests (`src/**` only; this change touches no web source), the anvil suites (no Foundry),
Firefox/WebKit (not in main's tooling). `.mjs` files are excluded by the repo ESLint config.

Not edited on purpose: `docs/user/set-up-stealth-meta-address.md` (open PR #577 edits it).

## Environment limits

Windows 10, 3.9 GB RAM (about 0.2 GB free at start, other sessions running), 4 CPUs, Node v26.13.1. No Playwright
browsers are installed and the config forbids `playwright install`. Foundry is not on PATH. Any test that did not run
here is listed as not run, with the reason.

## Second pass: security audit, bug audit, fuzzing, QA (2026-11-25)

Done in this order: security, bugs, fuzzing, QA. Merged main `5dc05bd6` into the branch with a merge commit (not a
rebase), so every SHA cited above stays valid.

| ID | Severity | Finding | Fix |
|---|---|---|---|
| SEC-1 | medium (docs/UX) | A payment's payer chose its ephemeral secret, so the payer knows its tweak h; a revealed one-time key k gives p_spend = (k - h) mod n. Guide and usage warned only about viewing-key holders. | `ea432f1e`: guide and usage say never to send a revealed key to the payer; a test recomputes the vector spending key from the a1 payer secret. |
| BUG-1 | low | A BOM-prefixed keystore with a later `v` reported `invalidFile`, not `unsupportedVersion`. | `ea432f1e`: the BOM rule covers the whole keystore family; test failed first. |
| BUG-2 | low | `--inspect` with `--scan-announcement` exited 0 having derived nothing (keystore and master). | `ea432f1e`: usage error, like `--inspect` with `--reveal-private-keys`; test failed first. |

Security areas checked with no finding: secret wiping on every path; fixed error strings with no input echo;
null-prototype strict JSON (no prototype pollution); KDF and size bounds (at most about 256 MiB scrypt, 8 KiB file);
AAD binding of meta-address, signer and N/r/p; header authenticity under `--inspect`; passphrase handling (the app does
not trim; the script keeps the passphrase exact apart from one trailing newline on stdin); BOM handling limited to
keystores. History check: every GhostPay keystore writer since `1f7ab710` used the canonical body and N=2^17, r=8, p=1.

Fuzzing (`scripts/recovery/seller-keystore-recover.fuzz.test.mjs`, `bc0d1738`): five seeded targets. Three planted bugs
(hex case accepted, signer check removed, every announcement owned) were each caught by their target after the header
and body targets were strengthened. The first version missed two of the three. Default scale passes in about 14 s.
`FUZZ_SCALE=10` with seeds `deep-a-20261125` and `deep-b-20261125` (about 6,000 cases each) passes. No defects found.

QA at merged head `2101af28` (plus docs-only follow-up edits):

| Check | Result |
|---|---|
| `node --test scripts/recovery/*.test.mjs` | 47 tests: 45 pass, 0 fail, 2 skipped (anvil not installed here) |
| Documented guide commands run verbatim on the TEST-ONLY vector | inspect, expected meta-address, scan plus reveal (exact a3 key) and wrong-seller refusal behave as documented |
| Vector generator rerun | byte-identical output |
| Committed line endings | LF in the index for every new file |
| Web `tsc -p tsconfig.json --noEmit`, ESLint on the new spec | exit 0 |
| New browser spec, Chrome, full profile | pass (1.4 min) |
| `scan-secrets.sh`, `check-actions-pinned.sh` | OK |

Not tested: the no-echo terminal passphrase prompt (needs an interactive TTY; unchanged pre-existing code).

After #641 merged into main (`60824005`), main was merged into this branch (`98ec1be0`; the registry conflict was
resolved by keeping both entries). #641 changed GhostPay's keystore codec to typed errors and an explicit check that
the spending and viewing keys differ; its acceptance set is unchanged. After rebuilding `ux-vault` from the merged
source:

| Check | Result |
|---|---|
| `node --test scripts/recovery/*.test.mjs` (differential tests against #641's codec) | 47 tests: 45 pass, 0 fail, 2 skipped (anvil) |
| `FUZZ_SCALE=5 FUZZ_SEED=post-641-20261125` fuzz suite | 5/5 pass |
| Web typecheck, ESLint on the new spec, new browser spec (Chrome, full) against #641's Seller keys | exit 0, exit 0, pass (1.5 min) |

Hosted CI on `31006b27`: `ts-test (web)` failed with 3289/3289 tests passing but one unhandled rejection after
teardown. `WalletAttempts.tsx:104` called `setError` once jsdom's `window` was gone; the rejection originated in
`WalletAttempts.status.test.tsx`. This PR touches no web source, the same job passed on `2bb16151`, and open PR #595
("Finish wallet-attempt status fixture lifetime qualification") owns that test file. It was left for #595.

## Merge request (owner asked to back up and merge, 2026-11-25 ~10:30Z)

Backups (verified): GitHub branches `backup/p0-keys-independent-recovery-021e4f25` and
`backup/p0-keys-independent-recovery-da26b87e`, and git bundles (thin, on top of main) in
`C:\Users\new\Desktop\claudework\backups\p0-keys-independent-recovery-<sha8>.bundle`.

Main `aaa71a11` (#635 merged, plus the owner stop-work directive in AGENTS.md) was merged into the branch at `da26b87e`.
The directive keeps "encrypted backups and independent recovery" as shared core, and this PR touches none of the stopped
features. At `da26b87e`, after rebuilding `ux-vault`: recovery suites 47 tests, 45 pass, 0 fail, 2 skipped (anvil);
web typecheck and ESLint on the spec exit 0; the new browser spec passes in Chrome (5.1 min).

Integration lock `automation/ghostpay-integration-lock` generation 25 is **held** by `claude-ghostpay-backup-60` for
#657 and #660 (expires 13:28Z). This session does not take it over. The agreed order once generation 25 is released:
whichever of feature-completion-06 (batch #664) and this PR has green exact-head CI goes first; if both are green,
feature-completion-06 goes first. Whoever releases sends the other one line with the release commit and the new main
SHA. To merge: re-verify the exact head's CI; acquire the next generation with a non-force push of
`integration-lock.json` (`status: held`, own owner and token, `base_sha` = current main); mark the PR ready; merge with
`gh pr merge 647 --merge`; then release (`status: released`, `released_at`) and notify the waiting sessions.

backup-60's read-only review of `da26b87e` found no defects. Its note on spec §5 (spending ≠ viewing) was applied.
backup-60 will switch #641's own vector tests (`packages/ux-vault/src/keystore-portable.vectors*`) to read
`test-vectors/seller-keystore-v1.json` after this merges; that change belongs to them.

## Remaining and blockers

- Merge waits for the integration lock (above). The owner-scheduled W2 prompt (04:09 local) routes merges through W1
  once `%USERPROFILE%\GhostPay-coordination\TEAM.md` exists; it did not exist at 10:50Z.
- Owner-requested pause: 05:00–05:34 local (13:00–13:34Z). No heavy work in that window.
- Not in this work: Firefox/WebKit (no tooling on main), mobile engines (#588), archive, master and in-app Spec 18
  recovery (#622).

## Next action

When generation 25 is released and this head's CI is green, follow the agreed lock order, then merge as above, or hand
#647 to W1 if TEAM.md assigns merging there.
