# Worker handoffs

Cycle `20261119T073600Z` uses the root coordinator and three native workers concurrently. Branch
review then rotates into independent lock verification; the camera author and security reviewer remain
separate. No paid external agent, Codex CLI/cloud job or external API model call was launched.

| Worker | Role and scope | Current handoff |
|---|---|---|
| root | Integration coordinator and lock implementation | Claimed before edits; new script/test and tracking area on isolated coordinator branch. |
| ghostpay_branch_review | Branch census, dependencies, deployment review; then independent lock verification | Complete 265-branch/50-PR inventory in data/. Independently approved lock d3749e45 after 10/10 real-Git tests and two corrected findings. Source PRs still qualifying. |
| ghostpay_completeness_review | Missing-code triage, focused feature/bug implementation | UI-IMPORT-001 fixed; local source d6e9dd38, published #258 head `84398a79`; 77 distinct tests plus scoped TypeScript/lint pass. |
| ghostpay_security_review | Independent security review and camera verification | Independent camera source review cleared d6e9dd38; 9/9 new regressions passed separately, lower-layer 37/37 passed. Bounded review only. |

Resume from current remote commits, not this initial task list. Read ACTIVE_WORK in each task branch
and live PR changed-path inventories. Carry incomplete source/CI status forward exactly. If the shared
lock is held, verify owner state; do not acquire by assuming an expired timestamp means the owner stopped.
