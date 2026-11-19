# Independent review of focused GhostPay promotion

Reviewed combined commit: `25fc3a7df33b8a7683cc48d23434eefc6dbce211`.
Tree: `2069f361a2b5e152c5bd75a84ffef7085b1bd984`.
Baseline: main after #241, `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929`.
The following head `2466ffd112b96b5a0a1b96a548cf7b87f31dedf9` adds only
`docs/consolidation/master-20261118/QUALIFIED_GROUP.md`; its runtime files match the reviewed source.

**Verdict:** no blocking source integration defect found. The four focused changes preserve the #241 transport
baseline and their own reviewed source. Promotion remains conditional on successful combined-head validation
and the unchanged repository requirements; this review does not assert a local unit or browser test pass.

## Provenance and preservation

Git ancestry and exact blob comparisons verified all four source heads as ancestors of the combined candidate.
Every changed source/test/handoff file from each PR matches that PR's blob, excluding the intentionally combined
ACTIVE_WORK registry. All 17 non-registry files introduced by #241 also remain byte-identical to its merged baseline.
The complete per-file checks and source identities are in `promotion-review.json`.

| PR | Source head | Exact retained non-registry files |
| --- | --- | ---: |
| #237 | `7109290b7e4f029c36d9743bde9fd664d1da5474` | 2 |
| #227 | `613667be4eeb132c7d21ccd06c627f9a7144d85b` | 3 |
| #234 | `5e9e7be70399a9818579cf87bd494e013e25d4f9` | 8 |
| #235 | `a5076f4d4e8d2dc515bdc31f304b6c6ce75bf3b1` | 9 |

## Behavioral review

- **Beta log artifacts:** `include-hidden-files` applies to the explicit existing `scripts/beta/.state/*.log`
  path. Test commands, outcome gates, retention period and artifact name are unchanged.
- **Sleep-aware locking:** wall and monotonic elapsed time independently enforce expiry; rollback since the
  last observation locks immediately. Activity checks expiry before rearming. Existing asynchronous recoverability
  and session guards remain intact, including preservation of sole-copy keys. Regression source exercises lifecycle
  and input events, paused monotonic time, wall rollback above the original activity time, and unbacked keys.
- **Invoice signer validation:** the additive strict option requires both a valid signature and a matching
  externally pinned key; invalid signatures are refused before pin membership. Default review semantics,
  passphrase prompting and earlier parse/decryption failures are preserved. The two fixed errors have matching
  ux-core catalog entries and no invoice data in their messages. No cryptographic primitive or format changes.
- **Seller checkpoint isolation:** the v4 name uses the existing pinned noble HKDF-SHA256 with a distinct label,
  chain and public-key identity bound to the viewing secret. The store borrows a key only for the matching loaded
  identity, wipes the temporary copy and invalidates cached names on every session-token change, including silent
  locks. Public/ambiguous v1/v2/v3 slots are not read or migrated; legacy cleanup preserves the rest of storage.
  Regressions cover changed sellers, cross-context isolation, silent replacement, failed writes and key wiping.
- **Interaction with #241:** no reviewed transport/startup blob changes; none of these four changes adds a
  provider endpoint or fallback. The idle timer still uses the existing key-recoverability policy, and the scan
  checkpoint patch affects local storage selection rather than network dispatch.

## Executed review checks and limits

`git diff baseline..candidate --check` passed. Source ancestry, complete per-source file identity and #241
preservation assertions executed successfully. Runtime unit tests, typechecks, lint and browsers were not executed
by this reviewer. Exact combined-head CI is needed even though the source PRs have prior individual results.

This is an independent AI-assisted source review. It does not close broader privacy, recovery, Mythril, external
acceptance or release decisions, and it does not authorize deployment or release publication.
