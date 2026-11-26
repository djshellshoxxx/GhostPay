# Account/vault/session privacy: independent composition verification — 2026-11-26 UTC

Docs-only record. No runtime, test, dependency, workflow, contract, threshold or release change. This is an
AI-assisted source and test verification, not an independent professional audit.

## Source pins

| Item | SHA |
|---|---|
| Main at verification | `019d5d18c8992f63fe77740f75ad04d86d3d9b07` (#699, docs only) |
| #691 handoff head (contains corrected #689 and #690) | `6b4bbe17b436344b05d2942ccb0633de43e43fa0` |
| Corrected #689 idle/recovery | `0ae8a9d1812c28acdc894b3a3ac12b82ef38aaff` |
| #692 journal-lock head | `c7b9badcfaff027e9847f65d10f021111809c48e` |
| #697 (#691 + main `a9d2a033`) | `7eb94c8e6209a9b0bb2d4ee8f6072beaf3a87335` |
| #698 (#692 on #697), full composition | `c2427b6f657b8ffd2c595ddb9dd47420480aa239` |
| Local test composition (main `019d5d18` merged into #698) | tree `3dc2d13377e22fe12a1664559c7af6c5f381b257` |

`git merge-tree --write-tree origin/main <#698 head>` is clean and produces the same tree `3dc2d133…` that was
tested locally. The #691, #689, #692 and #697 heads are ancestors of #698. The #698→main delta is only
`docs/ai/ACTIVE_WORK.md` and `docs/specs/19-local-metadata-retention.md` (main moved by #699).

## Ownership

`ghostpay-backup-60` is the recorded sole integration coordinator for #697/#698 (additive claim in their
ACTIVE_WORK entry, 05:22 UTC). This worker (`ghostpay-71`) owns only this record on an isolated branch. It did not
edit, rebase, merge, mark ready, comment on or retarget #691/#692/#697/#698, and did not acquire the integration
lock (generation 41 was released at 05:39:43 UTC, owner `claude-ghostpay-42`).

## Remaining-difference analysis

Not integrated: main contains none of #691, #689, #692, #697 or #698. The earlier completion task did not merge
the corrected composition, so evidence was gathered on #698 rather than assumed. The only open differences are the
integration steps below; no source defect was found, so no runtime or test file was changed.

## Acceptance map (existing tests, run on the composition)

| # | Acceptance | Evidence (file → cases) |
|---|---|---|
| 1 | Lock, idle, session replacement, account/chain change, disconnect, route unmount, A→B→A | `SessionPresentationBoundary.test.tsx` (rapid reinstall, manual lock, idle lock, off-route writer inert); `useWalletPrivacy.test.tsx` (accountsChanged/chainChanged/disconnect, synchronous expiry, unmount, superseded connection, Strict Mode); `WalletPrivacy.lifecycle.test.tsx` (route leave, idle expiry) |
| 2 | Concealment of scan, sweep, tags, invoice capability, secret fields, announcements | `Scan.tags.revocation`, `Sweep.revocation`, `CreateInvoice.revocation`, `ReconciliationLedger.revocation`, `tags.revocation`, boundary tests |
| 3 | Late RPC/wallet promises after revocation and before timer delivery | `useWalletPrivacy.test.tsx` scoped-RPC and "synchronous expiry" cases; lifecycle "pending connection after lock before any follow-up RPC" |
| 4 | History hidden when disconnected/mismatched; explicit owner reveal; no auto action | `WalletAttempts.privacy.test.tsx` (hidden without deleting evidence; explicit recovery wallet; never resurrects revoked parent) |
| 5 | Evidence bound to account/chain/attempt/digest; no cancel of submitted tx | `WalletPrivacy.lifecycle.test.tsx` (returned hash recovered only to owner, no second send); `WalletAttempts.privacy.test.tsx` |
| 6 | Fallback at storage owner; failure never reported durable; retry with zero wallet/RPC; clear only after full persistence; conflicts refuse | `duplicateAttemptJournal.returned.test.ts` (IndexedDB-after-stage failure, mirror failure, fresh lock vs inherited `lockHeld`, dedup, wrapper that never commits, conflicting hashes); `walletJournal.*` |
| 7 | Truthful limitation | `walletAttempts.unsaved` (en): hash "remains available only in this open tab until storage succeeds. Keep a copy before closing. It still blocks another attempt in this tab." Durable unknown record still blocks duplicates; no plaintext secret storage |
| 8 | Public notice, disclosure inventory, exact identity match, zero-send/empty-journal | `WalletPrivacy.lifecycle.test.tsx` (notice cleared on lock/session/new invoice; silent network/account mismatch does not submit or retain wallet); `walletDisclosure.callsites.test.ts` |

## What was run locally (Node 22.23.5, `npm ci --ignore-scripts`, `npm run build:libs`)

| Check | Result |
|---|---|
| 14 named acceptance files (boundary, useWalletPrivacy, WalletAttempts.privacy, lifecycle, journal returned/durable/adversarial/readback/base, tags/Scan/Sweep/CreateInvoice/Ledger revocation) | 14/14 files, 240/240 cases |
| All 31 test files added or changed by the composition (superset of the above) | 31/31 files, 746/746 cases |
| `LanguagePicker.test.tsx` ×6 concurrent runs | 6/6 passed |
| `npm run typecheck -w @ghostpay/web` | exit 0 |
| Typed ESLint, 50 changed `apps/web/src` TS/TSX files | exit 0 |
| `GHOSTPAY_LOCAL_BUILD_PROFILE=full` / `lean` web build | both exit 0; bundle scan 20 files / 18 files |
| `node --test scripts/tests/lean-core-reachability.test.mjs` | pass, allowlist unchanged |
| `node scripts/i18n/check.mjs` | 4 catalogs, 0 errors, 919 draft/fallback warnings (main's retention keys added to the 874 recorded by #691) |
| `bash scripts/scan-secrets.sh` | OK |

## Hosted CI (exact heads)

- #698 `c2427b6f`: 44 checks completed, none failed. Includes `typescript` gate, `ts-test (web)` (13 min, one attempt),
  `ts-lint`, `ts-typecheck`, `e2e (full)`, `e2e (lean)`, `Pages artifact on anvil (browser)`, `beta acceptance (lib + cli +
  browser on anvil)`, `Phone and tablet engines (full)` and `(lean)`, `Build and verify the Pages site`, `qualify-ghostpay-web`,
  CLI ×3 OS, contracts, CodeQL. Skipped: `Deploy to GitHub Pages`, `Post-deployment smoke test`, `Release gates (typecheck, lint,
  unit, mocked lean browser suite)`. A skipped deployment job is not a deployed-release check.
- #697 `7eb94c8e`: all checks passed except `ts-test (web)` (and the dependent `typescript` gate), which failed one case:
  `src/i18n/LanguagePicker.test.tsx > follows browser language changes in Automatic…` (`expected 'en' to be 'ar'`,
  line 55). 4,108 other cases passed.

### LanguagePicker failure: unrelated flake, not changed

The composition does not touch `apps/web/src/i18n` beyond additive `securityKeys` entries. `I18nProvider` sets
`document.documentElement.lang` in a passive `useEffect` after an asynchronous catalog load, while the test asserts it
immediately after `findByRole` sees the translated label, so the assertion can run before the effect. The identical test
and source passed in the same suite on #698 (superset of #697) and 6/6 locally under concurrent load. A bug-only fix
(`await waitFor` around the `lang`/`dir` assertions, no assertion weakened) belongs to the i18n owner, not to this
privacy composition; none was applied.

## Not run / not claimed

No full local web suite (hosted ran it on the exact #698 head). No local browser, mobile-device or Pages execution
(hosted lean/full, Pages, beta and phone/tablet engines passed on #698). No fuzz or mutation campaign, deployed target,
live wallet, funds, or real transaction. No native-language review of the added English fallback history strings.
Persistent storage failure plus tab closure can still lose the extra in-memory returned hash; the durable unknown
record remains the duplicate and recovery blocker.

## Remaining integration steps (owner `ghostpay-backup-60`, or an explicit owner takeover)

1. Re-confirm heads and claims; main `019d5d18` is ahead of the #697/#698 base `a9d2a033` by docs only.
2. Take the cooperative lock (generation 42) immediately before each merge; mark ready for review.
3. Land #697, then #698 (or #698 alone, which contains #697); `mergeable_state` was `clean` for #698.
4. Verify the resulting main: CI on the merge commit, `git diff` of the tree against `3dc2d133…`, Pages artifact and beta.
5. Release the lock; supersede the stale #691/#689/#692 drafts without deleting any ref.
