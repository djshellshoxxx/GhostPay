# GP-PAGES-02 browser fixture continuation — 2026-11-24

Parent #573: 56fb25aa2ff098737dbc181fa88c0aac06425c8e.
Test-only correction: fdc1bbc788f4ae2268e03b492a0dffefb25e87cd. Main observed c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063.
Prior hosted CI: https://github.com/djshellshoxxx/GhostPay/actions/runs/45334789740.
Lean job 138303654258: 70 passed, 3 skipped, 1 failed. Full job 138303654348: 82 passed, 1 skipped, 1 failed.
Both failed at helpers.ts:54, about:blank navigation, net::ERR_ABORTED, in app.spec.ts hostile-text test. The test installs a dialog handler that dismisses all dialogs. #573's new AppShell guard deliberately raises beforeunload when synthetic seller keys have no verified external copy. Dismissing that warning prevents navigation. This is a source-supported diagnosis, not a new runtime reproduction.

The correction accepts the expected beforeunload only during the intentional fresh navigation, requires exactly one warning, and still records and dismisses all other dialogs. The original text, no-XSS, inert markup and no-unexpected-dialog assertions remain unchanged. No product changes. The source was reread via the authenticated repository connector; no local browser or independent worker execution is claimed.

Next: qualify the exact child with unfiltered full and lean browser jobs and independent review. Parent's earlier Pages/Anvil, Beta, hosting and CLI success is retained as parent evidence only. Do not skip the other applicable gates. Preserve #540/#530 and #577/#544 dependencies; #622 is separate archive/master recovery work. No merges, deployment, real funds or gate changes.
