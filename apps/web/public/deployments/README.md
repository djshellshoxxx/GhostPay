# Deployment manifests (none shipped)

The app loads `deployments/<chainId>.json` from its own origin and validates it with
`@ghostpay/chain-adapters` (`loadDeployment`). **No manifest is shipped in this repository.** Until the owner
deploys the contracts and publishes a reviewed manifest for a chain, the app shows
"payments disabled on this chain" and never builds a payment transaction for it.

The fee recipient shown in the UI is read only from the manifest. It is not hard-coded anywhere in the source.
See `/deployments/README.md` at the repository root and `docs/FEE_SCHEDULE.md`.

A clearly fake, test-only example lives in `apps/web/src/test/fakeManifest.ts`. Never copy it here.
