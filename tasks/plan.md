# Privacy implementation plan

Scope exactly required privacy issues #286 (v1.0) and #287 (v1.1). Nine feature specifications precede implementation. Independent feature branches and three parallel worker slots support successive implementation/review generations, with source-pinned internal handoffs. Preserve published work, reuse existing modules and licensed dependencies, and keep v1.1 out of the standalone v1.0 runtime dependency graph.

The coordinator reconciles only released milestones into separate isolated local v1.0/v1.1 candidates. Full original gates, browser checks and exact-source evidence are required before release qualification. Earlier resource-killed checks remain failures/unqualified; changing only test-worker counts or Node heap budgets does not waive any checks.

GitHub publication is currently paused because automatic approval review rejected the earlier spec push. Continue all authorized local development, review, qualification and recoverable checkpoints. At the final handoff, ask for approval to publish concrete reviewed branches to djshellshoxxx/GhostPay. No deployment, release, main merge or shared integration-lock mutation.
