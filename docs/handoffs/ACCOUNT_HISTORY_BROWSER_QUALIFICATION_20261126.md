# Account-scoped wallet history browser qualification — 2026-11-26

## Source and scope

- Base: canonical privacy PR #691, `f8145c1cb8d806f1d8b134c159eb00f595e6769a`;
  current main at discovery was `1bea3df3448569254774747d694e71e155c3eb98`.
- Worker: `/root/help_review`; branch `fix/account-history-browser-fixtures-20261126-8812`.
- Claims before edits: `8b9c97ec` (flows), `1fffba17` (the precise devnet/Pages reload
  cases), `5f854b4a` (the subsequently observed silent-network-change notice).
- Fixture source: `36917b8920cd6ac478b2efaf15fd4195fc91a6f7`;
  tree `5a9a89efc8f6bf56424921c166c974d466054788`. This extends the independently
  reviewed owner-history source `0305cd2c` with the diagnosed notice assertion.
- Changed source paths: `apps/web/e2e/flows.spec.ts`,
  `apps/web/e2e/devnet-journey.spec.ts`, `apps/web/e2e/pages-devnet.spec.ts`.
  This is a fixture-only adaptation to the already-reviewed privacy behavior.
  Production, catalogs, dependencies, workflows, contracts and chain scope are unchanged.

`WalletAttempts` now reveals records only after an explicit connection to their
account and chain. A session change also clears the private invoice capability.
The old fixtures expected a returned hash immediately after session replacement or
reload, before reconnecting its owner; one then continued a cleared invoice. These
expectations conflict with the intended concealment, while the underlying records
and duplicate protection remain required.

| Existing case | Bounded correction |
| --- | --- |
| Flows: late hash after seller-session/account/provider changes | Assert concealed history and preserved durable outcome; explicitly reopen the invoice, retry as account6 and retain the duplicate refusal; restore account5 with its real lifecycle event, then recover its history before the original clear checks. |
| Flows: stale receipt delivered on reconnect | Preserve the receipt/hash mismatch, missing receipt/download/send controls and single send; after reload, assert concealment and durable owner record, then recover matching history before its original hash assertions. |
| Devnet: submitted payment reload | Recover the matching owner before revealing the retained hash; after a fresh invoice load, reveal it again only after the existing checkout connection. |
| Devnet: pending payment reload | Assert concealed presentation and durable pending-payment hash, then recover matching history before the original duplicate/no-second-mining checks. |
| Pages: native payment reload | Apply the same explicit history recovery and fresh-invoice connection while preserving the independent nonce, balance and receipt assertions. |
| Devnet: silent wrong-network change before Send | Assert the current public cause notice and revoked account/prepared/send controls; retain the existing no-send, empty-journal and unchanged-nonce checks. |

Each recovery uses the actual network selector (`84532`), discovery button and
wallet-connect control. The existing disclosure helper approves the real displayed
dialog; a new assertion verifies that this recovery showed `eth_requestAccounts`.
No consent, lifecycle or identity guard is stubbed. The account6 retry explicitly
sets that account again after `openFresh` resets the synthetic provider. Hash
assertions are retained and moved behind matching-owner connection where needed.

The additional devnet notice failure was investigated before changing its
expectation. `recheckWallet` observes chain `31337`, calls `invalidateWalletIdentity`
and then throws. `useWalletPrivacy` synchronously revokes with cause `wallet`; Pay
preserves the public account/network/provider-change notice and rejects stale
per-operation state. The two existing plain-invoice silent network/account
component cases passed against unchanged runtime, verifying that notice, concealed
old account, absent prepared/send controls, zero provider sends and an empty journal.
The former network-only browser text is therefore obsolete; no runtime error is lost
and no production repair was made.

## Observed hosted baseline

All observed jobs tested merge `7335f02b457607bffff564a3dd6959b951a3bf0c`:
privacy head `f8145c1c` into main `1bea3df3`.

| Run / job | Actual original-head result |
| --- | --- |
| CI `45743729535`, lean `139655021954` | 168 passed, 4 skipped, 2 failed: the original flows hash assertions at lines 379 and 449. |
| Beta acceptance `45743729477`, browser `139654655573` | All three devnet cases failed: post-reload hash assertions at original lines 139/261 and the old network-only notice at line 306. The job's library and CLI stages passed. |
| Pages `45743729598`, browser `139654656248` | 11 passed, 1 failed, 5 did not run: the buyer post-reload hash assertion at original line 472. |
| CI `45743729535`, full `139655022238` | 180 passed, 2 skipped, 2 failed: the same original flows hash assertions at lines 379 and 449, with the same concealed recovery prompt. |

The failed hash assertions received the intentional relevant-account/chain recovery
prompt, with no revealed hash. Earlier assertions in each failed case succeeded;
the assertions after each failure were not reached. The sole observed Pages failure
is covered by the prepared buyer fixture correction; its five unrun cases still
need fresh hosted qualification. No corrected-source browser pass is claimed here.

## Local qualification

Node `24.22.3`; `npm ci --ignore-scripts --no-audit --no-fund` installed 722 packages.
Sixty-five existing library build directories were reused only after verifying
their package sources match canonical `f8145c1c` and have no working-tree changes.

| Check | Actual result |
| --- | --- |
| `npm run typecheck --workspace @ghostpay/web` | Completed at the initial and final fixture source, exit 0. |
| Typed ESLint over the three changed e2e files, then the final devnet follow-on | Completed, exit 0 for both commands. |
| Existing `WalletPrivacy.lifecycle.test.tsx` cases selected by `Pay explains a silent (network\|account) mismatch` | 2 passed, 26 unselected; exit 0 against unchanged runtime before editing the devnet notice. |
| Full-profile desktop collection, anchored flows and idle-session files | 26 cases: 12 flows and all 14 unchanged idle cases; exit 0. |
| Lean-profile desktop collection, anchored flows file | 11 cases; exit 0. |
| Devnet configuration `--list` | 3 cases at the initial and final source; exit 0. |
| Pages configuration `--list` | 17 cases; exit 0. |
| Original assertion/timeout/clock/skip lines, including multiplicity | All retained in flows (172) and Pages (358). Devnet retains 86 of 87; only the proven-obsolete notice assertion is replaced by the current alert and three stronger revocation assertions. All no-send, nonce, journal and timeout checks remain. |
| Existing Pages expiry case | Byte-identical to base, including the four-line #689 clock-origin repair. |
| Existing idle fixture and wallet disclosure helper | Byte-identical to base. |
| Committed-secret scan and full-base whitespace check | Completed, exit 0. |

All collection commands used `--list`; **zero browser test bodies ran locally**.
Devnet and Pages collection used temporary public synthetic metadata only. No
browser installation, availability probe, server, local chain or fund action ran.
Logs are retained under `verification-8812/account-history-*` in the task workspace.

## Integration and remaining gates

The coordinator will qualify idle and privacy together through #691. Its canonical
base already preserves corrected idle #689 `0ae8a9d1812c28acdc894b3a3ac12b82ef38aaff`
as an ancestor. The coordinator reported two standalone #689 web-fixture failures
(TagArchive after suspension and ten-hour invoice retention); the retention
adaptation is already in #691 and TagArchive is assigned separately. A failing
intermediate #689 must not be merged independently. This browser patch does not
modify either unit fixture or claim those failures resolved.

Root owns independent source/evidence review, any required normal dependency
composition, publication, fresh exact-composition hosted unit/full/lean/devnet/Pages
gates, the cooperative integration lock and ordinary merging. Policy #692's
additive #541 test stays on its own branch and will adopt this reviewed correction
later. No remote mutation or integration was performed by this worker.

Root independently approved owner-history source `0305cd2c` and the final
silent-recheck notice follow-on `36917b89`, including the stronger revocation
assertions. Final documentation/composition review and fresh hosted gates remain.
