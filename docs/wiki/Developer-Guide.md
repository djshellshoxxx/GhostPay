# Developer Guide

Status: pre-audit, nothing deployed. See the repository README for the honest status table.

## Build and run

Node >= 22. Foundry 1.8.5 is needed for the contracts.

```bash
npm ci --ignore-scripts
npm run build:libs        # required before typecheck/test/build
npm run typecheck && npm run lint
npm test
npm run dev --workspace @ghostpay/web   # Vite dev server
```

Some workspaces need network access or extra tools (for example `@ghostpay/confidential-contracts` downloads a Solidity compiler; `forge`/`anvil` for contracts and the relayer e2e). Per-package READMEs and `DEVIATIONS.md` files list limits.

## Where things are

- `packages/*`: libraries (`ls packages`; the README package map groups them)
- `apps/web`, `apps/relayer`: the app and the relay service
- `docs/`: specifications, ADRs, threat model, audits, user guides, operator runbooks

Read the security invariants in `docs/DEVELOPER_SPECIFICATION.md`, the threat model and `SECURITY.md` before changing key-handling code.
