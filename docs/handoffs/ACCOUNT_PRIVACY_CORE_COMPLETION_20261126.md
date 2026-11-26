# Shared-core account and vault presentation revocation — 2026-11-26 UTC

## Source and scope

Worker: `/root/artifact_review`. Branch: `finish/privacy-revocation-core-20261126`.
Implementation: `28f7b3c0b46f5fa360389a1986f51304302901d2`, tree
`f37b883abaa3e447555ccef664accd4d117ef2f8`.
Canonical dependency: corrected idle #689 `0ae8a9d1812c28acdc894b3a3ac12b82ef38aaff`,
including prior `4af78c8c` and reviewed utility #690. Final normal composition
`f451c6206f2e0434ec8386b6ca1602a3c82ed969`, tree
`1f88c12e9247d692ec9d9724892937b1ad0c72b3`, reconciles only the additive ownership log.
Incoming Pages fixture and handoff are dependency-exact; the full existing log and all
38 incoming ownership/result lines are retained. Production source is unchanged from
28f. `/root/help_review` approved the exact implementation, assertions and original
composition; root approved the fixture-only compatibility and Pages follow-ups.

This is the authorized shared-core revocation/retained-outcome slice. It adds no
package dependency, workflow, contract, network service, chain or product activation.
The dependency-closure gate and named pending list are unchanged. No `@ghostpay/ux-core`
or mixed foundation is added. All original donor refs remain preserved.

| Donor | Exact source pin | Bounded adaptation |
|---|---|---|
| #571 | `63f40efac175e5ee49563326dbef930aafb14235` | Presentation boundary, wallet/vault revocation, form cleanup and account-scoped recovery intent |
| #612 | `e580fcac85e1e7fc2a42a4c7ea7d5a581418aab8` | Public wallet-change cause survives encrypted-invoice cleanup; no outcome claim |
| #645 | `3b7351c7f289dc8d4f928a9cefd408d9fcfbb8d7` | Registry history ownership and retained-evidence acceptance |
| #652 | `724afdcf557178d8b78d841b681f50e99d41935f` | Its older selected-seller verifier interface is absent from this base; no such interface was imported |
| #655 | `1dcd5a25130b9db6afc4d224c619cd4dbcf0307c` | Latest cause/lifecycle acceptance reconciled with current payment outcomes |
| Mixed #372 | `055d33e042c63edf1d5bbbdd7833d3c1ef93733d` | Source reference only; no wholesale merge/global privacy-settings foundation |

## Resulting behavior

- Session/app-lock clears shell-held scan matches, sweep selection, invoice capability
  and announcements. Writers from an old generation cannot restore those values,
  including identity A→B→A transitions.
- Wallet changes revoke account presentation, prepared operations, private invoice
  context and pending work. Connected encrypted/passphrase links cannot reopen from
  the URL after revocation or departure. The public cause notice survives cleanup.
- Browser-discovered wallets require usable lifecycle subscriptions before account
  access. Separate disclosures, identity rereads and reviewed request matching remain.
- History requires a matching connected account and chain. Explicit recovery uses
  existing discovery/disclosure, with no automatic connection, switch, lookup or send.
  Revoking a recovery wallet cannot resurrect an old parent-supplied wallet object.
- A returned hash is retained at the stable journal storage boundary before a write.
  Removal requires actual commit and whole lock/IndexedDB/mirror completion. Caller
  timeout does not cancel queued persistence. Deduplicated retries use the current
  merge/lock path. Pending evidence blocks duplicates even after explicit clearing;
  collisions fail closed, and nonce/replacement union remains intact.
- RPC adapters check captured view authority before and after every read. Late results
  finish journal bookkeeping without restoring presentation or starting verification.
  Pay completion checks the idle deadline synchronously before announcement/embed
  publication, even before a timer or restoration event has noticed the expiry.
- TagVault access notifications follow key install/erase; observer exceptions cannot
  interrupt lock. Scan discards decrypted tags/drafts and obsolete callbacks. Ledger
  clears decrypted rows, previews, import drafts and errors. Durable bytes survive.
- CreateInvoice/Sweep discard drafts on revocation. Sweep scrubs detached credential
  inputs and preserves #683 pre-handoff locks and post-handoff outcomes independently
  of view lifetime. Explicit reselection cannot bypass a retained outcome or send again.

D1 QR textarea preservation, request-file validation, clipboard cleanup, cryptography,
#635 outcomes, #595 delayed settlement, #675 private live regions and metadata retention
remain covered. Seven added history strings use classified English source/fallback
text in four catalogs; no native-language review is claimed.

## Acceptance and corrections

Five independently authored fixtures at `14ca56a7d548c151b39a66524827d67fed9f600b`
add 21 ordinary cases: TagVault (3), Ledger (3), CreateInvoice (5), Scan tags (4), Sweep
(6). Final test-only handoff `e614a6db710555e98002211d96e7c130ea8b5579` is normally
merged. It changes no existing assertion or runtime file.

Current journal tests distinguish raw durable unknown state from the returned-hash
fallback and finish actual recovery during cleanup. The #635 approval case requires
the exact owner-scoped hash, real disclosure/reconnect, no second send and no hash in
live regions. The QR parse case requires no restored capability, wallet/RPC or manifest
work. All #595/#675 assertions remain through explicit-owner fixture adapters.

The initial 61-fixture combined run reported **1,003 passed / 3 failed**. Two old
Sweep notice expectations required the selected panel to remain after key clearing.
Their replacements assert concealed selection/destination/balance, absent signing
controls, unchanged RPC calls and every original no-send/empty-journal/no-outcome check.
The retention-off case still spans ten hours with periodic actual input inside the
independent idle deadline; a separate case retains the inactive ten-hour jump and
checks suspension, concealed drafts, unchanged storage and no network. These two
complete fixtures then passed **63/63**.

Four late-hash cases initially demonstrated RPC follow-up after revocation and passed
after the scoped adapter. Two idle-result/refusal cases failed before the completion
guard and passed afterward. Two ordinary route-leave cases already passed because
existing visibility cleanup increments flow revision; the initial reviewer blocker
was withdrawn. No contrary RED claim is made. No thresholds/assertions were lowered.

### Journal fixture compatibility follow-up

Root's policy integration run at `8a4d98db` reported 314 passes and 14 failures in an
older journal fixture. The first post-send case conflated `readAttempts`' retained
hash overlay with its raw durable unknown record, then left that fallback alive across
fixtures. Source `994be97cfb8fc28237b0f99648ca818758129498`, tree
`2d12365883091acf414590f0cc6e191a3f687e66`, changes only that fixture after ownership
claim `07ce4e74`. Production source remains identical to approved 28f.

Seven post-send cases preserve the actual committed unknown snapshot and exact raw
mirror, check the separate returned overlay, and prove a duplicate retry cannot send.
Their finally block restores the original synthetic IndexedDB and finishes actual
persistence. The bounded-return case checks unknown durable state while the hash is
retained, then waits through fallback removal after commitment. No production reset,
seeded scheduling case, timeout or existing no-send assertion changes. Only the 14
named ordinary affected cases ran locally; all passed, with 128 other cases unrun.

## Final local qualification

| Check | Observed result |
|---|---|
| Dependencies | `npm ci --ignore-scripts --no-audit --no-fund`: 722 packages; manifests/lockfile unchanged |
| Dependency build | `npm run build:libs` passed after canonical utility adoption |
| Ordinary web suite at 28f | **1,011/1,011 passed**, 61 fixtures, no skips; `--coverage.enabled=false --maxWorkers=2` |
| Additional fixture compatibility | **14/14 named cases passed** at 994be97c; 128 cases intentionally not selected |
| Typed ESLint | All 36 changed TS/TSX files at 28f plus the additional journal fixture passed |
| Full build | `GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run build -w @ghostpay/web`: TypeScript, Vite and 20-file bundle scan passed |
| Lean build | Same command with `lean`: TypeScript, Vite and 18-file bundle scan passed |
| Reachability | `node --test scripts/tests/lean-core-reachability.test.mjs`: 4/4 passed, unchanged closure/allowlist |
| Catalogs | `node scripts/i18n/check.mjs`: 4 catalogs, 0 errors, 874 draft/fallback warnings |
| Composition | Canonical utility/e2e blobs, package/lockfiles, gate, claims and ancestry preserved |

Builds retain large-chunk and ineffective dynamic-import warnings; neither build nor
bundle scan failed. Final full web TypeScript after fixture follow-up passed, as did whitespace and
committed-secret checks. All listed qualification processes completed with zero exits.

Primary logs share `/tmp/ghostpay-privacy-revocation-` and these suffixes:
`combined-final.log`, `journal-compatibility.log`, `journal-compatibility-lint.log`,
`lint-composed.log`, `build-libs-final.log`, `build-full-final.log`,
`build-lean-final.log`, `reachability-final.log`, `catalog-final.log`,
`typecheck-final.log`, and `secrets-final.log`.

The 61-file selection covers Pay/request-file/QR, Sweep/quotes, CreateInvoice/retention,
Scan/tags, Registry/history, Ledger, disclosure, journal/hash/nonce integrity, App/idle,
security-key classification and new revocation fixtures. It excludes files using
fast-check and fuzz/adversarial campaigns. Its exact manifest is printed at the start
of the combined log and saved at `/tmp/ghostpay-privacy-revocation-selected-test-files.txt`.

## Remaining coordinator gates and scope

- Fresh hosted combined checks, full-suite coverage and browser/full/lean/devnet
  acceptance remain required. Root published the reviewed four-line Pages clock-origin
  correction as canonical #689 `0ae8a9d1`; it is normally adopted here and fresh hosted
  CI is starting. Its independent local typecheck, typed lint and case collection are
  recorded in `PAGES_EXPIRY_CLOCK_QUALIFICATION_20261126.md`. The 1,011-case runtime
  suite was not repeated for this fixture/documentation-only merge. No local browser,
  deployed target, fuzz/mutation campaign or real transaction was run.
- This slice does not include #372's global/manual masking control, older selected-
  seller verifier UI or other mixed foundations. Manual masking remains an authorized
  separate core follow-on, not a new human-permission hold.
- Duplicate-attempt bookkeeping keeps its existing format. Its fallback survives view/
  account/lock changes in this open tab. Persistent storage failure plus tab closure can
  lose that extra returned hash; the durable unknown record remains the existing
  recovery/duplicate blocker. UI text states this open-tab limitation.
- Parent owns remote publication, final evidence review, cooperative lock and integration.
  This worker made no remote mutations. Separately coordinated #528 lock repair and
  #604 offline/draft continuation are not included; their agreed seams preserve this
  implementation and adopt its final pin independently.
