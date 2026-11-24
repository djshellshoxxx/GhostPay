# GhostPay Pages consolidation — 2026-11-16

## Source-pinned integration

Base: latest broad completion branch `claude/lucid-meitner-apalzc`, `d26418c2539619fb75783a82886a96971142d226` (PR #164), descended from owner integration PR #157 at `a89a2e948321314acf97db435e9776d9322a9461`. Main was `bd2652bf1853948594522140a6a0fe0cbe54e32b` at checkout.

| Source | Pinned revision | Result |
| --- | --- | --- |
| Pages fixes through #177 | `17f681915f25441f5c38326ad718b8082495d52a` | Merged at `24c35cee`: verified-backup gate; stale invoice callback guard; imported-history invoice-label provenance; unexpected IndexedDB close recovery. All source unit/browser acceptance assertions preserved. |
| Architecture and sensitive-surface audits #167–#170 | `775756931be4683f47e8af6b2ecf26f9458897d7` | Merged at `30733000`; four dated audit documents retained. Their historical unresolved statements are not current-state verdicts. |
| Future-only privacy catalog | `896c671f` | Existing catalog was already content-identical; source ancestry reconciled at `597a2b90`. Proposals remain future-only, not accepted current release requirements. |
| Pages audit rotation ledger #139 | `e802d5c1ff131762477b485af3046446e8576be5` | Preserved dated additional audit history. |
| Pages CI handoff #153 | `85f525165d6c94c3c6b908930df712e9e7ac66f7` | Preserved dated additional qualification history. |
| Pages user/developer guides #140 | `17158f4c62f8f968853c3ffdd0cb3572455038f5` | Preserved current source-pinned guide changes and historical CI evidence. |

Only documentation conflicts occurred: the advisory `ACTIVE_WORK.md` registry retains this worker's ownership record, and `docs/INDEX.md` retains the broader candidate's report/qualification links. No application conflict was resolved by choosing an entire side. The broad candidate already contained bearer-QR, bounded optional-client reads, verified backup support, sleep-aware locking, and filtered transfer telemetry; these were preserved.

## Historical branch assessment

- `chatgpt/ghostpay-historical-consolidation-20261115` selectively copied the same #172 files. Those seven commits are superseded by the complete source merge through #177, including the newer historical-provenance acceptance assertion.
- #159/#161/#162/#163 and RPC-filter branches are already recovered by the PR #164 baseline; see `ledger-code-branches.json`. Do not reapply their tests or stale registry claims.
- `claude/vigilant-johnson-yjgq94` remaining test-only idle-lock wording fix is already present in the broad candidate and unchanged by the Pages merge.
- `claude/happy-maxwell-onl4x5` report-mode preservation is superseded by the existing stronger regular-file check, restricted modes, atomic replacement, and regression tests.
- `codex/ghostpay-cloud-41868394956` sparse invoice-item validation and signature tests are present in the candidate.
- `fix/remediation-b16c7936-5ce634` replay of unverified router claims is present via current `pageMatches` checkpoint retention.
- `fix/remediation-f95457fd-22ecf9` (`6b3e689c`) is intentionally rejected, not a missed fix. Independent review found current `send.test.ts:334` explicitly documents the rejection in `92a05a235`: journal records have no key-version marker, so the patch mistakes every differently keyed modern payment for a legacy record. The existing suite verifies that distinct completed scoped payments remain usable and the same scoped payment is refused. Focused execution on this candidate: **37/37 policy-send tests passed** (`vitest run src/features/policy/send.test.ts`, from `apps/web`, 2026-11-16). No policy or journal behavior was changed.
- Ancient recovery/checkpoint branches, dependency upgrade groups, paid-API workflow branches and `gh-pages` are not mechanically merged. Existing historical ledger decisions still apply; archived publication output is not source.
- Test-only #178 is deliberately excluded here; a separate worker owns its cleanup regression and corrective implementation.

## Verification boundary

This worker reviewed the merged source differences and preserved original assertions. Application tests and final integrated-head build, lint, QA, fuzz and security checks are coordinated on `codex/ghostpay-completion-20261116`; this document does not inherit GREEN from component PRs or claim a release. Code merge whitespace check passed; imported historical Markdown uses existing intentional two-space line breaks.

The source branches and PRs have not been deleted, force-pushed, or rewritten. This local candidate is not a deployment and does not satisfy external-wallet, physical-device, signed-manifest, private security-scanner, or independent audit gates by itself.
