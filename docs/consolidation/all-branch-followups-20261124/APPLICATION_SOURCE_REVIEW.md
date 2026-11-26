# Independent final selected-composition review

## Decision

**Approve source composition; no blocking preservation or overlap defect found.**
This verdict covers commit `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8`, tree `8add357748674afb128926a797982badb54bac6b`, in
`/workspace/scratch/f80482f352bc/GhostPay-followups`. It is a source review, not final combined runtime or hosted acceptance.
The checkout was clean and still at that commit when the review was recorded.

Reviewer: `/root/historical_review`. Date: 2026-11-24.

## Immutable sources

| Role | Commit |
| --- | --- |
| Common recovery base | `83c503f970044e1708b3a7493ee7284cd59e0844` |
| Reviewed receipt/print source | `0b60dba235710f12847532dd9d0f74f12f7298c6` |
| Approved F08 source | `b6c3c73d767df56e4119ff7b3918044f21d996ef` |
| First composition, print plus F08 | `32114079deaf7a0bba86a04c6664f5efad08cede` |
| Independently reviewed export runtime/CI | `079a153aadd2c3f2ac8e87a9dab2daf8f0fc00de` |
| Export final handoff | `7331ee05ad2d77e9fe86e538a8820f4b819e9dcc` |
| Final reviewed composition | `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8` |

Both original donors, F08 `923e1edfb9ac34f8b6855d8ac8516cd835070afd` and #572
`28bba11cdaebc13edc4d100761ee00750c3f396f`, and every selected source above remain actual ancestors.
The export final handoff differs from its independently approved runtime/CI only
in documentation and qualification artifacts.

## Complete preservation checks

The review independently reconstructed both merge change sets from immutable Git
objects, including file modes. For print plus F08, all **29 nonshared changed
entries** match their parent exactly; only the ownership registry overlaps. For
that result plus #572, all **45 nonshared changed entries** match their parent
exactly. Neither merge introduces a path outside its parents' combined changes.
All **13 selected print entries other than the shared registry** still match the
reviewed print source. This includes all print runtime, CSS, tests and handoffs.

The second merge has exactly seven shared paths: `ci.yml`, four locale catalogs,
`securityKeys.ts`, and `ACTIVE_WORK.md`. Independent checks confirm the two root
preservation receipts. The JSON companion records each exact checked entry.

All **933 existing test/spec entries** from the pre-export composition are
byte-for-byte and mode-for-mode preserved (path rule `\.(test|spec)\.[cm]?[jt]sx?$`). All
**74 package manifests including root**, the lockfile, seller-key/pairing
screens, app-lock implementation, the stronger profile clock verifier, portable
keystore cleanup and its memory regression remain exact base entries. No
existing regression assertion was removed during this composition.

## Shared-file resolutions

Each of English, Arabic, Spanish and Japanese has **2,372 messages**: the base's
2,272, fourteen F08 additions and 86 export additions. The addition sets are
disjoint. Every message value from both parents and the base is preserved; all
other catalog metadata is identical. Parsing rejects duplicate JSON keys.
Existing translation approval/fallback behavior is preserved.

The complete F08 and export security-key insertion blocks each occur once.
Removing either block restores the other approved parent's entire file exactly.
All fourteen profile and 86 export messages keep their reviewed classification.
For both merge stages, both parents' full ordered nonblank registry sequences and
line multiplicities remain present. No conflict markers remain.

The complete final CI workflow is exactly the common base plus these two units:

1. F08's unchanged three-scenario `ghostid-native` job.
2. `REQUIRE_ANVIL=1 node --test scripts/recovery/*.test.mjs`, once after the unchanged
   original Node command inside existing `rest-0`.

Removing either addition restores the opposite parent's full workflow; removing
both restores the base byte-for-byte. The cloud check allowlist and its fixtures
remain exact approved F08 source, retaining all five original required checks and
adding the three profile checks. No existing shard, toolchain setup, workflow
setting or gate is replaced.

## Product interactions

The F08 viewer, unit tests, native spec and merchant-panel mount remain exact
approved source. The stronger clock check is unchanged. Activation still needs
the exact compile-time preview flag; unchanged lean entry/build selection keeps
the panel/viewer graph excluded. Its local full-key comparison does not write
merchant pins or participate in session, vault or export authorization.

The added payment export panel is a sibling of the receipt panel in Scan, outside
the selected print target. The preserved print CSS removes other interface
content from printed pagination. Receipt signature/scope eligibility and existing
Tags guards remain in place. The export's verified scan-client scope, current
route checks and additive credential/session helpers match the already reviewed
#572 composition exactly. The seller backup, app-lock, keystore cleanup and QR
implementations retain their current protections. The merge introduces no additional authority, format, KDF, deadline, dependency
or provider change beyond the approved source units.

The broader #572 codec/CLI review remains the separately source-pinned independent
review in `individual-export-independent-review.md`; this review verifies complete
source preservation and the final cross-feature composition, without duplicating
that review's runtime/native work.

## Gate meaning and remaining acceptance

F08's report validator still requires exactly one successful intended desktop
scenario and the opposite deliberate skip, zero runner errors/unexpected/flaky
outcomes, and a single successful attempt. All-skipped output cannot pass.
Missing native recovery tools produce an explicit failure under `REQUIRE_ANVIL=1`;
when present, both original synthetic spending cases execute. The two recovered
individual-export browser specs contain no skip and remain selected by the
unchanged desktop full/lean configuration.

The coordinator's final combined web qualification is separate and was in progress
when this source review began. Promotion still requires its completed applicable
local gates and fresh exact-final-head hosted ordinary/security results, all three
profile scenarios, required native recovery spending, and the existing full/lean
browser suites including print and export scenarios. Prior donor evidence,
component runs and report simulations are not final native acceptance.

No runtime or native tests were run by this reviewer. No repository file, Git ref
or remote state was modified. Only this scratch Markdown report and its JSON
companion were created.
