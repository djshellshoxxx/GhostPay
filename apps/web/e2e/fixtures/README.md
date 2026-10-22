# E2E-only deployment fixture

`84532.json` is an obviously fake manifest (repeating-nibble addresses) signed by a Playwright-only test key. The
Playwright web-server build receives that key through `playwright.config.ts`; production builds receive no key unless an
operator explicitly configures one. The mock RPC in `e2e/flows.spec.ts` serves matching contract code and immutables, so
the real `verifyDeployment` runs end to end. The fixture is never used by `npm run build`; the real
`apps/web/deployments/` directory stays empty until a reviewed deployment exists.
