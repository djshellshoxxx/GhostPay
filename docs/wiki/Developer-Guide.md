# Developer Guide

Status: design baseline only. Nothing in this repository builds or runs yet.

## Planned packages (from `docs/DEVELOPER_SPECIFICATION.md`)

- `@ghostpay/contracts`: Solidity contracts
- `@ghostpay/core-crypto`: TypeScript cryptographic engine
- `@ghostpay/ui`: stateless front end and URL engine
- `@ghostpay/relayer-adapter`: sponsored sweep transport

## Planned build stages

1. Environment, protocol decisions and contract prototype
2. `@ghostpay/core-crypto`
3. Web app, fragment parser and worker
4. Relayer and account-abstraction experiments
5. Static deployment, content addressing, ENS and Tor

The master blueprint says that the crypto package, contracts and UI should be implemented only
after their interfaces and test vectors are specified.

## Before writing code

Read the security invariants in the developer specification, the threat-model matrix and the QA
playbook gates. Pin dependencies only after re-checking upstream releases, as the specification asks.
