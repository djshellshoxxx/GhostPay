# Active AI work registry — Pages-only isolated task

The upstream `docs/ai/ACTIVE_WORK.md` is not present in the pinned #172 Pages source. This branch-local record is advisory, not a shared lock.

| Worker | Branch | Base SHA | Owned paths | Acceptance criteria | Status |
| --- | --- | --- | --- | --- | --- |
| ChatGPT direct GitHub zero-Codex | `chatgpt/zero-codex/pages-reconciliation-imported-link-20261115` | `dffe072511c34b8a73bd64ac6147d5a79256480e` (unmerged Pages #172) | `apps/web/src/components/ReconciliationLedger.tsx`; `apps/web/src/components/ReconciliationLedger.test.tsx`; this registry only | Imported encrypted historical observations must never receive the same invoice-registry "linked to a verified observation" label as fresh live scan evidence. Preserve proven live-scan link, source test-first, exact new head CI, no deployment | In progress, draft only |

Do not modify owner #157, source #172, other branches, server/relayer/CLI/native/contract code or release/security gates. No main merge/deployment, real funds or Wiki publication.
