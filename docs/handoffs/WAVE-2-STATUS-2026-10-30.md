# Wave 2 status: frontier check (2026-10-30)

Checked read-only against the frontier head. Each row says what the code shows, with file:line evidence.

## Frontier

- `FRONTIER` = `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2`, head of PR #41 (`codex/ghostpay-consolidation-20261030`).
- Contains PR #37 head `b6a0871d0618c5ee804947af22d21b794948fa3d` (ancestry checked with `git merge-base --is-ancestor`: yes).
- Merge base with `main`: `edb0051eb89bd135c73733d9db14569aa000662d`.
- CI on `FRONTIER`: run `41047381180` (`ci.yml`), conclusion `success`.
- Wave branch: `claude/haiku-wave-2-handoff-qepfoe` (the branch this session was assigned). The handoff doc named `claude/haiku-wave-2-2026-10-30`; that name was not used.

## Baseline (on `FRONTIER`, before any edit)

| Command | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | pass. Engine warnings only: runner is Node v22.22.0, `jsdom` and `w3c-xmlserializer` want `^22.22.2`. |
| `npm run build:libs` | pass |
| `npm run typecheck` | pass |
| `scripts/dev/local-ci.sh --only build-libs,typecheck,lint` | pass, `DONE fail=0` |
| `scripts/repro-check.sh --head` | pass, both builds byte-identical (ran during T5) |

## Step 2: open items

Status key: `open`, `fixed`, `superseded` (fixed by a later change), `partly`, `unknown`.

| ID | Check | Status | Evidence |
|---|---|---|---|
| W-09 | "paid directly" label, receipt states | open | `apps/web/src/views/Scan.tsx:392` still shows `(paid directly, no GhostPay fee)` on non-router rows. `verified` / `claimed` states exist (`Scan.tsx:391`, `:394`, `:441`). Deferred: fix is in the do-not-do list. |
| P2-registry | `paymentsOnly` passed to `BackupGate` | fixed | `apps/web/src/features/registry/RegistryView.tsx:247`, `apps/web/src/features/policy/PolicyCreate.tsx:102`, `apps/web/src/views/SellerKeys.tsx:468`. T1 skipped. |
| P2-requireSession | `requireSession` removed | fixed | No match for `requireSession` under `apps/web/src`. T2 skipped. |
| P2-idle-lock | one idle-lock signal | fixed | No `subscribeIdleLock` / `notifyIdleLock` under `apps/web/src`. Subscribers use `subscribeAppLock`: `views/SellerKeys.tsx:128`, `views/Sweep.tsx:80`, `components/TagArchive.tsx:126`, plus `SecretBackup.tsx`, `BtcView.tsx`, `TronView.tsx`, `SolanaView.tsx`. T3 skipped. |
| P1-AR2 | `served` resets on window regrowth | fixed | `packages/chain-adapters/src/logs.ts:330-331` (comment), `:475` (`if (window < cap) served = 0n;`). Open follow-up, not verified here: see Qodo note under "Other findings". |
| P1-BR | sweep lock edge cases | partly | Same-nonce replacement is gated by the hash limit: `views/Sweep.tsx:62-63`, limit notice `:420`. Dropped `submitted` tx has a note but no recovery: `:300`. Inconclusive final look: no matching string found in `Sweep.tsx`, so `unknown`. Sweep logic is Opus scope. |
| Policy-send | session guard and approve-tx check | partly | Approve-tx check present: `features/policy/send.ts:50` (function must be `approve`, amount must equal `net + fee`). Session is a typed parameter (`send.ts:16`); no runtime null check found in `send.ts`. Caller guard not checked: `unknown`. Owner or Opus review. |
| Docs-drift | stale claims in `docs/handoffs/*` | fixed in T4 | See the list below. |

### Docs-drift list (`docs/handoffs/HANDOFF_FOR_NEXT_AGENT_2026-10-29.md`)

Checked by term search over `docs/handoffs/` and `README.md` for `requireSession`, `subscribeIdleLock`, `notifyIdleLock`, `paid directly`, `paymentsOnly`, `W-09`, `AR2`, `BR`. This is a term-based check, not a full docs audit.

- Lines 137-138 (AR2 "Fix: reset `served`"): code now does this, `logs.ts:475`. Marked superseded.
- Lines 146 (`paymentsOnly` gate): done, `RegistryView.tsx:247`, `PolicyCreate.tsx:102`. Marked superseded.
- Line 147 (remove `requireSession`): done, no match under `apps/web/src`. Marked superseded.
- Line 148 (one idle-lock signal): done, session copy gone. Marked superseded.
- Lines 140-143 (BR): first bullet covered by `Sweep.tsx:62-63`. Marked partly superseded; other two bullets left open.

## Other findings (not in the Step 3 list)

- Qodo review on PR #41 at `70d8bf6` (Medium, open): `scripts/audit/gen-audit24-report.py:319-323` writes the report through `NamedTemporaryFile` + `os.replace`. Python creates temp files owner-only (0600), so a regenerated report can become unreadable to other users of a shared checkout. Suggested fix from the bot: set the staged file's mode to the existing report's mode, or to a umask-based default. Deferred: not in the wave task list; owner or follow-up.
- Qodo note on PR #41 (bot marks it resolved): a second transient `-32005` in one fetch can leave the scan window at half size. Scanner logic is Opus scope. Not verified here.

## Step 2 summary

- Already fixed on the frontier: P2-registry, P2-requireSession, P2-idle-lock, P1-AR2. Tasks T1, T2, T3 skipped because their rule is "only if open".
- Still open: W-09 (deferred), policy-send caller guard (unknown), BR bullets 2 and 3.
