# Active AI work registry

This file is a coordination template, not a live lock service. Always inspect open PRs and branch heads before relying on it.

| Worker | Branch | Base SHA | Owned paths | Acceptance criteria | Status |
| --- | --- | --- | --- | --- | --- |
| ChatGPT zero-Codex Pages owner-compatibility lane | `chatgpt/zero-codex/pages-owner-transfer-filter-20261115` | `a89a2e948321314acf97db435e9776d9322a9461` | `apps/web/src/lib/scanSpam.ts`, `apps/web/src/lib/scanSpam.test.ts`, `docs/ai/ACTIVE_WORK.md` | Port existing PR #159 RPC off-filter regression/fix onto exact owner #157 head; verify test-first RED then corrected-head GREEN; no owner-branch edits or release | Test-first regression pending CI |

Workers should update their task-branch copy and communicate ownership through the PR description. Do not treat absence from this table as proof a path is free.
