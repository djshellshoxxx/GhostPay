# E2E-only deployment fixture

`84532.json` is an obviously fake manifest (repeating-nibble addresses) that the Playwright build compiles into its
bundle with `GHOSTPAY_DEPLOYMENTS_DIR=e2e/fixtures`. The mock RPC in `e2e/flows.spec.ts` serves matching contract code
and immutables, so the real `verifyDeployment` runs end to end. It is never used by `npm run build`; the real
`apps/web/deployments/` directory stays empty until a reviewed deployment exists.
