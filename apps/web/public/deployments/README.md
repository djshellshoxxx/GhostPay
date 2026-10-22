# Public deployment directory (unused)

The app does not load deployment manifests from this public directory. Reviewed manifests belong in
`apps/web/deployments/`; Vite validates their schema, chain id and release signature, then compiles their raw text into the
hashed JavaScript bundle. **No manifest is shipped in this repository.** Until the owner deploys the contracts and commits
a reviewed signed manifest, the app shows "payments disabled on this chain" and never builds a payment transaction for it.

Runtime still reads contract code and immutable values through the user's RPC before enabling a flow. See
`apps/web/deployments/README.md`, `/deployments/README.md` at the repository root and `docs/FEE_SCHEDULE.md`.

A clearly fake, signed test-only example lives in `apps/web/e2e/fixtures/`. Never copy it into the production deployments directory.
