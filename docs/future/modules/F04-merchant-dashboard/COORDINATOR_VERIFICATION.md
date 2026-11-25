# F04 coordinator qualification — 2026-11-20

## Source identity

- Tested combined source: `19b47216b1c41653913196dd231f40faaa2d76a1`.
- Public equivalent source checkpoint: [69fc05b82e944c7d399162e028a6c6a2eaf8284c](https://github.com/djshellshoxxx/GhostPay/commit/69fc05b82e944c7d399162e028a6c6a2eaf8284c).
- Latest incorporated main: `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
- Independently reviewed product: `966f415e520298310efd1f03883ea69844ea5eed`; public equivalent [7aa093817d3f71cee0c69301a22bfa0c91b93373](https://github.com/djshellshoxxx/GhostPay/commit/7aa093817d3f71cee0c69301a22bfa0c91b93373).
- [PUBLICATION.json](PUBLICATION.json) maps every local source/review commit to a GitHub commit with the identical complete tree. Commit metadata changes during API publication; source tree identity is checked for every commit.

Current main was incorporated after the initial implementation. Only the ownership registry conflicted; both histories were retained. Every future-module source blob remained identical. The changed payment-URI library was rebuilt from the new main before combined verification. This document and subsequent publication records change no runtime or tests.

## Actual validation

| Check | Result |
| --- | --- |
| Maintained focused module suite, current-main source | 61/61 passed; no skips |
| Fresh independent review and replay | Passed at the product pin; see [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md) |
| Whole-web TypeScript, current-main source | Passed with the original web configuration and bounded 1,024 MiB Node heap |
| Scoped typed ESLint | Passed with all repository rules; the TypeScript program was restricted to the owned feature files |
| Scoped strict TypeScript | Passed; whole-web check also passed afterward |
| Module coverage | Original 90/85/90/90 statement/branch/function/line thresholds passed unchanged; see final coverage log |
| Lean Vite build and existing post-build scanner | Passed; 17 files scanned |
| Lean boundary comparison | All 16 application/assets files match current main exactly; only local build-inventory metadata differs |

Logs and hashes are retained under [verification/coordinator](verification/coordinator/). Earlier memory-pressure exit-137 attempts remain historical failures; they are not represented as passes. The serial whole-web TypeScript run supersedes its earlier resource failure. Scoped typed lint does not establish an executed whole-web lint pass. Module coverage is not whole-web suite coverage.

## Qualification boundary and next work

The feature stays disconnected from production routes and the lean application. No new external package version, wallet action, service, storage write, fee policy or deployment was introduced. Local module/provider fixtures do not qualify the unfinished real provider, UI, recovery or browser workflows.

Hosted CI, full-web lint/unit/browser gates and the remaining feature acceptance criteria are separate. Keep the pull request draft while those gates and the full feature integration remain incomplete. Follow [HANDOFF.md](HANDOFF.md) for the next bounded implementation milestone. This round publishes development source; it does not activate the full feature or merge it into main.
