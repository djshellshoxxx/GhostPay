# GhostPay authoritative development location

**Repository:** https://github.com/djshellshoxxx/GhostPay

**Working integration branch:** `integration/consolidated-2026-10-21`.

This branch contains substantially more implementation and detailed audit tracking than the repository's `main` branch, which currently presents primarily planning documentation. Treat this integration branch as the working source of truth **pending full branch-by-branch verification**, not as a certified production release.

## Consolidation policy

1. Inventory all GhostPay branches and any additional source repositories before merging. Do not infer that similarly named repositories owned by unrelated users are sources.
2. Compare each source module against this branch; preserve working implementations and their history, importing missing functionality in small reviewable commits.
3. Run package-specific tests and regression checks after every module integration. Do not overwrite more complete modules with older versions.
4. Keep a provenance table for source ref, target module, tests, and disposition. Do not delete source branches before verification.
5. Finish automated functionality and completeness checks, then code audit, then security audit. Defer wallet, chain, deployment, and manual hardware/user testing until appropriate.
6. Do not claim audited, deployed, production-ready, or safe for real funds without supporting evidence.

**Note:** The user reports three separate repositories. Their other two exact repository identities have not yet been established; they must be verified before cross-repository consolidation.
