# Static Tor hosting completion

## Scope and source

This implementation continues privacy architecture 5g on main
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. The deliverable is the existing static
GhostPay browser application served independently under HTTPS and v3 onion origins.
It does not add a publisher-operated backend, custody, or a new RPC routing protocol.
The browser cannot prove Tor routing for external wallets or other applications.

## Required behavior

1. Serve the same verified static bundle with relative assets at a root or subpath.
2. Provide an optional static-only onion deployment with no relayer dependency,
   no exposed proxy/control ports, isolated identity storage, a restricted web server,
   and explicit failure when a required runtime capability is absent.
3. Validate configured v3 onion origins, including checksum and canonical form,
   before advertising them or producing operator configuration.
4. Preserve CSP, manifest/payment refusal, and existing direct/private path semantics.
   No silent clearnet redirect, remote script, or automatic RPC endpoint substitution.
5. Keep onion identity material outside served artifacts, images and committed files.
6. Document separate browser storage per origin, browser API requirements, wallet/RPC
   visibility, identity backup, and the exact limits of available verification.

## Acceptance evidence

Record source and commands. Run unit/config validation, actual static build checks,
scoped lint/types, offline browser requests at two origins and subpaths, and
independent security review of the changed boundaries. Validate Tor configuration
with a supported Tor binary when available. A local hostname mapping or browser
fixture is not proof of real Tor routing; neither is a fake SOCKS proxy. Live onion
reachability and Tor Browser acceptance must be reported separately when unavailable.
A verified implementation is not a guarantee against all vulnerabilities.

## Ownership and exclusions

The task branch owns only paths claimed in `docs/ai/ACTIVE_WORK.md`. Existing
experimental Node SOCKS/OHTTP/I2P profiles, on-chain privacy, external wallet behavior,
mainnet contracts and unrelated release blockers retain their existing status.
Production activation and release signing are separate actions.
