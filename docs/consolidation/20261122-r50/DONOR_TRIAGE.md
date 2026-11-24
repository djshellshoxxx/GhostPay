# R50 — immutable source donor triage (2026-11-22 UTC)

Main at census: `eb59d93cffed7848c4aac37d0e9650b87239c6da`. These findings **do not imply integration into main**.

## Hygiene qualification donor: source recovered in unmerged #372

Donor `qualify/ghostpay-hygiene-composition-20261120-9a4ab6` at `0e19ccc7d52b0d160fb756089e6a843a1d2831d7` diverges from main (12 commits ahead / 86 behind; 23 changed paths). Its **six source/test paths** were read directly at the immutable donor and recovery #372 head `055d33e042c63edf1d5bbbdd7833d3c1ef93733d`; exact Git blob SHA pairs match:

| Path under `packages/hygiene/src/` | Identical Git blob |
| --- | --- |
| `fixtures.testutil.ts` | `600219676c9c6bbfbbc52574d514cf80b54fa68a` |
| `ledger.browser-chains.test.ts` | `b76b6cb0143901027b0006f892232cf5107be420` |
| `ledger.ts` | `7bc637d024db317e12bc08847d19e8348e4cbcd9` |
| `verify.evidence-boundary.test.ts` | `33f00dc3942f98201b0abe83f4ce2062ce9ac47c` |
| `verify.test.ts` | `fb4ea2674bf23b57fa3302e5ba37adc6dd528bed` |
| `verify.ts` | `46f2c12c7418e84cf019f1e8b9ac4156683adba9` |

All other changed paths in the donor's 23-path main comparison are qualification evidence under `docs/` or `docs/ai/ACTIVE_WORK.md`. The source/test implementation is **already represented** in **unmerged, owned, security-gated** PR #372. This donor is dispositioned as source-represented-in-pending-recovery, **not** integrated-main and **not** independently behavior-qualified. Preserve donor history and evidence. #372's exact-head Tor/static-hosting and contract-analysis jobs remain failures; ten earlier Mythril findings require disposition. Do not merge or modify the owner's recovery branch without coordination.

## QR primitive input donor: covered in still-unmerged #290

Donor `automation/20261120T0035Z/worker/qr-kind-primitives` at `17333ceda784ecdf5734a666ef57ee1d1e599296` has a complete five-path comparison with main, including two application source/test paths. Verified direct blobs:

| Path | Donor SHA | Pending #290 SHA |
| --- | --- | --- |
| `apps/web/src/lib/qrKinds.ts` | `1a4beffc898c7854f6183aac5a7e6f74f8228d63` | `a85e1011cdface74c87683146ff7428654b7830d` |
| `apps/web/src/lib/qrKinds.test.ts` | `3eaea811d82c9a1913313fc1c0d587147b68fd16` | `af5ef89f6fba0cea13b18884df387875f064ad34` |

Both reject non-string runtime kind/payload inputs before any coercion. Both exercise stateful `Symbol.toPrimitive` and hostile getter tests; #290 adds additional input cases and verification. They are **not byte-identical**, and no wholesale tree equivalence is claimed. Donor documentation under `docs/design/qr-colors.md` and its handoff remains preserved on the donor ref. PR #290 is stacked on the beta-qualification branch, draft, and its exact-head CI run 44649231040 failed. The donor remains **unresolved** until the qualified parent changes are integrated; do not duplicate the owned patch into main or bypass CI.

## Newly arrived owned branches

Two new branches appeared after R49: BUG-only #484 `automation/20261122-r11/bug/ux-vault-base64url-padbits` at `9aeed83b73916d0b51c192dbea04cfdc601f94a9`, and stacked BUG-only #485 `automation/20261122T2232Z/bug/policy-sparse-test-typecheck` at `fe1c59a3d5aa25dbdcdf30db38ec869566fa0f5f`. Both stay unclassified pending their owners' review and integration; five exact-head workflow groups report success for each but **no independent approval or mainline merge** is inferred. #485 is stacked on #482, so dependency order matters.

## Safety boundaries and next action

The effective integration-lock ref is `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` with `held`, generation `11`, owner `994a0d214fb9-root-r3`. Expired timestamps are not lease release. Do not seize, overwrite, merge, deploy or test real funds. Continue unowned donor isolation and source/provenance matching; request qualified independent review for eventual integration.
